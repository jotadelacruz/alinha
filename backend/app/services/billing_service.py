"""Integração com a Asaas: trial de 14 dias + assinatura recorrente.

account_status continua sendo o único campo que efetivamente bloqueia acesso
(mesmo que get_current_user_id já usava antes desta integração existir) —
aqui a gente só ganha mais um jeito de escrever nele: o webhook de pagamento,
além do painel admin que já existia.
"""

import datetime
import hmac
import time
import uuid

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.models import AsaasWebhookEvent, Coupon, Profile


class AsaasNotConfigured(RuntimeError):
    pass


def _require_configured() -> None:
    if not settings.asaas_api_key:
        raise AsaasNotConfigured("ASAAS_API_KEY não configurada")


def _headers() -> dict:
    return {"access_token": settings.asaas_api_key or "", "Content-Type": "application/json"}


def sync_trial_status(
    db: Session,
    user_id: uuid.UUID,
    account_status: str,
    trial_ends_at: datetime.datetime | None,
    subscription_status: str | None,
) -> str:
    """Check preguiçoso de expiração de trial, chamado a cada request autenticada
    (mesmo idioma já usado pra geração preguiçosa de agendamentos recorrentes,
    ver appointment_service.ensure_upcoming_appointments — sem cron aqui também).
    Contas grandfathered (trial_ends_at NULL) nunca são afetadas."""
    if account_status != "active" or trial_ends_at is None or subscription_status == "active":
        return account_status
    if trial_ends_at < datetime.datetime.now(datetime.timezone.utc):
        db.query(Profile).filter(Profile.id == user_id).update({"account_status": "suspended"})
        db.commit()
        return "suspended"
    return account_status


def wait_for_profile(
    db: Session, user_id: uuid.UUID, attempts: int = 3, delay_seconds: float = 0.1
) -> Profile | None:
    """handle_new_user() roda síncrono na mesma transação em que a Admin API do
    Supabase cria o usuário — na prática já deveria estar visível de cara. O
    retry é só seguro extra pro cadastro combinado (/billing/signup-and-subscribe),
    que cria o usuário e precisa do Profile logo em seguida, na mesma request."""
    for i in range(attempts):
        profile = db.query(Profile).filter(Profile.id == user_id).first()
        if profile is not None:
            return profile
        if i < attempts - 1:
            time.sleep(delay_seconds)
    return None


def redeem_coupon(db: Session, code: str | None) -> tuple[Coupon | None, str | None]:
    """Valida o cupom (se informado) e devolve (coupon, erro). Não incrementa
    used_count ainda — isso só acontece em mark_coupon_redeemed, depois que a
    assinatura é criada de verdade na Asaas (senão uma falha na Asaas queimaria
    um uso do cupom à toa)."""
    if not code or not code.strip():
        return None, None
    normalized = code.strip().upper()
    coupon = db.query(Coupon).filter(Coupon.code == normalized).first()
    if coupon is None or not coupon.active:
        return None, "Cupom inválido"
    if coupon.expires_at and coupon.expires_at < datetime.datetime.now(datetime.timezone.utc):
        return None, "Cupom expirado"
    if coupon.max_uses is not None and coupon.used_count >= coupon.max_uses:
        return None, "Cupom esgotado"
    return coupon, None


def apply_coupon_discount(plan_price: float, coupon: Coupon | None) -> float:
    if coupon is None:
        return plan_price
    if coupon.discount_type == "percentage":
        discounted = plan_price * (1 - float(coupon.discount_value) / 100)
    else:
        discounted = plan_price - float(coupon.discount_value)
    return max(0.0, round(discounted, 2))


def mark_coupon_redeemed(profile: Profile, coupon: Coupon) -> None:
    """Chamar só depois que a assinatura foi criada com sucesso na Asaas.
    Não é atômico contra corrida entre duas pessoas usando o último uso do
    mesmo cupom ao mesmo tempo — aceitável pro volume desta aplicação, não é
    dinheiro perdido, só um desconto a mais em um caso raro."""
    coupon.used_count += 1
    profile.coupon_code = coupon.code


def create_or_reuse_customer(profile: Profile, email: str, name: str, cpf_cnpj: str, phone: str | None) -> str:
    if profile.asaas_customer_id:
        return profile.asaas_customer_id
    _require_configured()
    resp = httpx.post(
        f"{settings.asaas_base_url}/customers",
        headers=_headers(),
        json={
            "name": name,
            "email": email,
            "cpfCnpj": cpf_cnpj,
            "phone": phone,
            "externalReference": str(profile.id),
        },
        timeout=10,
    )
    resp.raise_for_status()
    profile.asaas_customer_id = resp.json()["id"]
    return profile.asaas_customer_id


def create_subscription(profile: Profile, customer_id: str, billing_type: str, value: float | None = None) -> str:
    """Cria (ou reaproveita, se já existir — protege contra duplo clique) a
    assinatura e devolve a invoiceUrl da primeira cobrança. `value` permite
    cobrar um valor diferente do padrão (cupom de desconto) — o desconto vale
    enquanto durar a assinatura, não só na primeira cobrança, porque é o mesmo
    `value` que a Asaas usa em todos os ciclos futuros."""
    if profile.asaas_subscription_id:
        return _first_invoice_url(profile.asaas_subscription_id)
    _require_configured()
    charge_value = value if value is not None else settings.asaas_plan_price
    now = datetime.datetime.now(datetime.timezone.utc)
    next_due = profile.trial_ends_at.date() if profile.trial_ends_at and profile.trial_ends_at > now else now.date()
    resp = httpx.post(
        f"{settings.asaas_base_url}/subscriptions",
        headers=_headers(),
        json={
            "customer": customer_id,
            "billingType": billing_type,
            "value": charge_value,
            "cycle": "MONTHLY",
            "nextDueDate": next_due.isoformat(),
            "description": "Assinatura Alinha",
            "externalReference": str(profile.id),
        },
        timeout=10,
    )
    resp.raise_for_status()
    profile.asaas_subscription_id = resp.json()["id"]
    profile.subscription_status = "pending"  # só vira 'active' quando o webhook confirmar o pagamento
    profile.subscription_value = charge_value
    return _first_invoice_url(profile.asaas_subscription_id)


def _first_invoice_url(subscription_id: str) -> str:
    # TODO confirmar contra sandbox: POST /subscriptions pode já devolver o
    # pagamento inline, tornando este GET extra desnecessário.
    resp = httpx.get(
        f"{settings.asaas_base_url}/payments",
        headers=_headers(),
        params={"subscription": subscription_id},
        timeout=10,
    )
    resp.raise_for_status()
    items = resp.json().get("data", [])
    if not items:
        raise RuntimeError("Assinatura criada mas nenhuma cobrança encontrada")
    return items[0]["invoiceUrl"]


def verify_webhook_token(received: str | None) -> bool:
    """Falha fechado: sem token configurado, nenhum webhook é aceito (nunca
    tratar 'não configurado' como 'não precisa verificar')."""
    if not settings.asaas_webhook_token or not received:
        return False
    return hmac.compare_digest(received, settings.asaas_webhook_token)


def process_webhook_event(db: Session, event_id: str, event_type: str, payload: dict) -> None:
    if db.query(AsaasWebhookEvent).filter(AsaasWebhookEvent.id == event_id).first():
        return  # reentrega da Asaas de um evento já processado
    db.add(AsaasWebhookEvent(id=event_id, event_type=event_type, payload=payload))

    payment = payload.get("payment") or {}
    profile = _resolve_profile(db, payment)
    if profile is not None:
        if event_type in ("PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"):
            profile.subscription_status = "active"
            profile.account_status = "active"
        elif event_type == "PAYMENT_OVERDUE":
            profile.subscription_status = "past_due"
            profile.account_status = "suspended"
        # demais eventos (PAYMENT_CREATED, PAYMENT_DELETED, etc.): só logados, sem side-effect no v1.
    db.commit()


def _resolve_profile(db: Session, payment: dict) -> Profile | None:
    """Casa o pagamento com o Profile pelos IDs que a própria Asaas gerou e que
    já guardamos ao criar (fonte principal); externalReference é fallback
    defensivo, sem confirmação de que se propaga em todo Payment gerado."""
    subscription_id = payment.get("subscription")
    customer_id = payment.get("customer")
    external_ref = payment.get("externalReference")

    profile = None
    if subscription_id:
        profile = db.query(Profile).filter(Profile.asaas_subscription_id == subscription_id).first()
    if profile is None and customer_id:
        profile = db.query(Profile).filter(Profile.asaas_customer_id == customer_id).first()
    if profile is None and external_ref:
        try:
            profile = db.query(Profile).filter(Profile.id == uuid.UUID(external_ref)).first()
        except ValueError:
            pass
    return profile
