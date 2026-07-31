import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id_unchecked
from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import check_rate_limit
from app.core.validators import is_valid_cpf_cnpj
from app.models.models import Profile
from app.schemas.schemas import (
    BillingStatusOut,
    BillingSubscribeIn,
    BillingSubscribeOut,
    SignupSubscribeIn,
    SignupSubscribeOut,
)
from app.services import billing_service, supabase_admin_service

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/status", response_model=BillingStatusOut, response_model_by_alias=True)
def get_status(user_id: uuid.UUID = Depends(get_current_user_id_unchecked), db: Session = Depends(get_db)):
    profile = db.query(Profile).filter(Profile.id == user_id).first()
    if not profile:
        raise HTTPException(404, "Perfil não encontrado")
    return BillingStatusOut(
        account_status=profile.account_status,
        subscription_status=profile.subscription_status,
        trial_ends_at=profile.trial_ends_at,
        billing_enrolled=profile.trial_ends_at is not None,
        # Reflete o valor real já combinado (com desconto de cupom, se houve) em
        # vez de recalcular a partir do cupom, que pode ter mudado/expirado depois.
        plan_price=float(profile.subscription_value) if profile.subscription_value is not None else settings.asaas_plan_price,
    )


@router.post("/subscribe", response_model=BillingSubscribeOut, response_model_by_alias=True)
def subscribe(
    body: BillingSubscribeIn,
    user_id: uuid.UUID = Depends(get_current_user_id_unchecked),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.id == user_id).first()
    if not profile:
        raise HTTPException(404, "Perfil não encontrado")
    if profile.trial_ends_at is None:
        raise HTTPException(400, "Conta não está no sistema de cobrança")

    row = db.execute(text("SELECT email FROM auth.users WHERE id = :id"), {"id": str(user_id)}).mappings().first()
    email = row["email"] if row else ""

    # Só valida/consome o cupom se isto de fato vai criar uma assinatura nova —
    # um retry sobre uma assinatura já existente não deve poder ser barrado por
    # um cupom que expirou/esgotou nesse meio tempo, nem consumir o cupom de novo.
    was_new_subscription = profile.asaas_subscription_id is None
    coupon = None
    if was_new_subscription:
        coupon, coupon_error = billing_service.redeem_coupon(db, body.coupon_code)
        if coupon_error:
            raise HTTPException(400, coupon_error)
    charge_value = billing_service.apply_coupon_discount(settings.asaas_plan_price, coupon)

    try:
        customer_id = billing_service.create_or_reuse_customer(profile, email, body.name, body.cpf_cnpj, body.phone)
        db.commit()
        invoice_url = billing_service.create_subscription(profile, customer_id, body.billing_type, value=charge_value)
        if coupon and was_new_subscription:
            billing_service.mark_coupon_redeemed(profile, coupon)
        db.commit()
    except billing_service.AsaasNotConfigured:
        raise HTTPException(503, "Cobrança ainda não configurada, tente novamente mais tarde")
    return BillingSubscribeOut(invoice_url=invoice_url)


@router.post("/signup-and-subscribe", response_model=SignupSubscribeOut, response_model_by_alias=True)
def signup_and_subscribe(body: SignupSubscribeIn, request: Request, db: Session = Depends(get_db)):
    """Endpoint público (sem login) usado pelo cadastro combinado da landing page
    (/assinar): cria a conta Supabase já confirmada e a assinatura na Asaas num
    passo só. Não desfaz a conta Supabase se a parte da Asaas falhar depois —
    a pessoa continua com uma conta de trial normal, que pode assinar depois
    pela tela de Configurações."""
    if body.honeypot:
        raise HTTPException(400, "Requisição inválida")
    if not is_valid_cpf_cnpj(body.cpf_cnpj):
        raise HTTPException(422, "CPF/CNPJ inválido")
    check_rate_limit(request.client.host if request.client else "unknown")

    try:
        user_id = supabase_admin_service.create_confirmed_supabase_user(body.email, body.password, body.name)
    except supabase_admin_service.SupabaseAdminNotConfigured:
        raise HTTPException(503, "Cadastro ainda não configurado, tente novamente mais tarde")
    except supabase_admin_service.SupabaseSignupError as exc:
        raise HTTPException(exc.status_code, str(exc))

    profile = billing_service.wait_for_profile(db, user_id)
    if profile is None:
        raise HTTPException(
            500,
            "Conta criada, mas houve um problema ao configurar a assinatura. "
            "Faça login e assine pela página de Configurações.",
        )

    was_new_subscription = profile.asaas_subscription_id is None
    coupon = None
    if was_new_subscription:
        coupon, coupon_error = billing_service.redeem_coupon(db, body.coupon_code)
        if coupon_error:
            raise HTTPException(400, coupon_error)
    charge_value = billing_service.apply_coupon_discount(settings.asaas_plan_price, coupon)

    try:
        customer_id = billing_service.create_or_reuse_customer(
            profile, body.email, body.name, body.cpf_cnpj, body.phone
        )
        db.commit()
        invoice_url = billing_service.create_subscription(profile, customer_id, body.billing_type, value=charge_value)
        if coupon and was_new_subscription:
            billing_service.mark_coupon_redeemed(profile, coupon)
        db.commit()
    except billing_service.AsaasNotConfigured:
        raise HTTPException(503, "Cobrança ainda não configurada, tente novamente mais tarde")
    return SignupSubscribeOut(invoice_url=invoice_url)


@router.post("/webhook/asaas")
def asaas_webhook(
    payload: dict,
    db: Session = Depends(get_db),
    asaas_access_token: str | None = Header(default=None),
):
    if not billing_service.verify_webhook_token(asaas_access_token):
        raise HTTPException(403, "Token inválido")

    event_type = payload.get("event", "")
    payment = payload.get("payment") or {}
    event_id = payload.get("id") or f"{event_type}:{payment.get('id', '')}"
    billing_service.process_webhook_event(db, event_id, event_type, payload)
    return {"received": True}
