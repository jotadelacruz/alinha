import uuid

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id_unchecked
from app.core.config import settings
from app.core.database import get_db
from app.models.models import Profile
from app.schemas.schemas import BillingStatusOut, BillingSubscribeIn, BillingSubscribeOut
from app.services import billing_service

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
        plan_price=settings.asaas_plan_price,
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

    try:
        customer_id = billing_service.create_or_reuse_customer(profile, email, body.name, body.cpf_cnpj, body.phone)
        invoice_url = billing_service.create_subscription(profile, customer_id, body.billing_type)
    except billing_service.AsaasNotConfigured:
        raise HTTPException(503, "Cobrança ainda não configurada, tente novamente mais tarde")
    db.commit()
    return BillingSubscribeOut(invoice_url=invoice_url)


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
