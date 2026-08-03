"""Portado de computeClientFinance/computeFinance em frontend-legacy/js/app.js:1068-1110."""

import datetime
import math
import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.models import Appointment, Bill, Client, ClientCredit, Payment, PaymentTransaction, Profile

BLOCK_THRESHOLD_SESSIONS = 3  # fallback quando o perfil não tem preferência salva (ver Profile.unpaid_sessions_block_threshold)


def _unpaid_sessions(sessions: int, received_total: float, session_value: float) -> int:
    """Quantas das sessões do mês ainda não foram cobertas pelo total recebido (direto + crédito)."""
    if session_value <= 0:
        return 0
    paid_sessions = math.floor(received_total / session_value + 1e-9)
    return max(0, sessions - paid_sessions)


def _block_threshold(db: Session, owner_id: uuid.UUID) -> int:
    profile = db.query(Profile).filter(Profile.id == owner_id).first()
    if profile is None or profile.unpaid_sessions_block_threshold is None:
        return BLOCK_THRESHOLD_SESSIONS
    return profile.unpaid_sessions_block_threshold


def _next_month(month_iso: datetime.date) -> datetime.date:
    if month_iso.month == 12:
        return month_iso.replace(year=month_iso.year + 1, month=1)
    return month_iso.replace(month=month_iso.month + 1)


def _confirmed_sessions_count_by_client(
    db: Session, owner_id: uuid.UUID, month_iso: datetime.date, client_id: uuid.UUID | None = None
) -> dict[uuid.UUID, int]:
    """Contagem de consultas confirmadas no mês, até hoje — sugestão automática pra
    'Sessões no mês' (a pessoa ainda pode digitar outro valor manualmente por cima)."""
    today = datetime.date.today()
    query = db.query(Appointment).filter(
        Appointment.owner_id == owner_id,
        Appointment.status == "confirmed",
        Appointment.appointment_date >= month_iso,
        Appointment.appointment_date < _next_month(month_iso),
        Appointment.appointment_date <= today,
    )
    if client_id is not None:
        query = query.filter(Appointment.client_id == client_id)

    counts: dict[uuid.UUID, int] = {}
    for a in query.all():
        counts[a.client_id] = counts.get(a.client_id, 0) + 1
    return counts


def compute_client_finance(db: Session, owner_id: uuid.UUID, client_id: uuid.UUID, month_iso: datetime.date) -> dict:
    client = db.query(Client).filter(Client.id == client_id, Client.owner_id == owner_id).first()
    payment = (
        db.query(Payment)
        .filter(Payment.client_id == client_id, Payment.owner_id == owner_id, Payment.reference_month == month_iso)
        .first()
    )
    sessions = payment.sessions_count if payment else 0
    devido = float(sessions * client.session_value) if client else 0.0

    transactions = (
        db.query(PaymentTransaction)
        .filter(
            PaymentTransaction.client_id == client_id,
            PaymentTransaction.owner_id == owner_id,
            PaymentTransaction.reference_month == month_iso,
        )
        .all()
    )
    recebido_direto = sum(float(t.amount) for t in transactions)

    credit = db.query(ClientCredit).filter(ClientCredit.client_id == client_id, ClientCredit.owner_id == owner_id).first()
    credit_balance = float(credit.balance) if credit else 0.0

    restante_antes_do_credito = max(0.0, devido - recebido_direto)
    credito_aplicado = min(credit_balance, restante_antes_do_credito)

    recebido_total = recebido_direto + credito_aplicado
    saldo = max(0.0, devido - recebido_total)

    if devido == 0:
        status = "pago" if recebido_direto > 0 else "aberto"
    elif saldo <= 0:
        status = "pago"
    elif recebido_total > 0:
        status = "parcial"
    else:
        status = "aberto"

    unpaid_sessions = _unpaid_sessions(sessions, recebido_total, float(client.session_value) if client else 0.0)
    confirmed_sessions_count = _confirmed_sessions_count_by_client(db, owner_id, month_iso, client_id).get(client_id, 0)

    return {
        "client_id": client_id,
        "reference_month": month_iso,
        "sessions": sessions,
        "confirmed_sessions_count": confirmed_sessions_count,
        "due": devido,
        "received": recebido_total,
        "credit_applied": credito_aplicado,
        "balance": saldo,
        "status": status,
        "unpaid_sessions": unpaid_sessions,
        "blocked": unpaid_sessions >= _block_threshold(db, owner_id),
    }


def compute_all_clients_finance(db: Session, owner_id: uuid.UUID, month_iso: datetime.date) -> dict[uuid.UUID, dict]:
    """Mesmo calculo de compute_client_finance, mas pra todos os clientes de uma vez,
    com uma unica query por tabela em vez de N+1 (evita 1 round-trip ao banco por cliente)."""
    clients = db.query(Client).filter(Client.owner_id == owner_id).all()
    payments = db.query(Payment).filter(Payment.owner_id == owner_id, Payment.reference_month == month_iso).all()
    transactions = (
        db.query(PaymentTransaction)
        .filter(PaymentTransaction.owner_id == owner_id, PaymentTransaction.reference_month == month_iso)
        .all()
    )
    credits = db.query(ClientCredit).filter(ClientCredit.owner_id == owner_id).all()
    threshold = _block_threshold(db, owner_id)
    confirmed_sessions_by_client = _confirmed_sessions_count_by_client(db, owner_id, month_iso)

    payment_by_client = {p.client_id: p for p in payments}
    recebido_direto_by_client: dict[uuid.UUID, float] = {}
    for t in transactions:
        recebido_direto_by_client[t.client_id] = recebido_direto_by_client.get(t.client_id, 0.0) + float(t.amount)
    credit_by_client = {c.client_id: float(c.balance) for c in credits}

    result = {}
    for client in clients:
        payment = payment_by_client.get(client.id)
        sessions = payment.sessions_count if payment else 0
        devido = float(sessions * client.session_value)
        recebido_direto = recebido_direto_by_client.get(client.id, 0.0)
        credit_balance = credit_by_client.get(client.id, 0.0)

        restante_antes_do_credito = max(0.0, devido - recebido_direto)
        credito_aplicado = min(credit_balance, restante_antes_do_credito)

        recebido_total = recebido_direto + credito_aplicado
        saldo = max(0.0, devido - recebido_total)

        if devido == 0:
            status = "pago" if recebido_direto > 0 else "aberto"
        elif saldo <= 0:
            status = "pago"
        elif recebido_total > 0:
            status = "parcial"
        else:
            status = "aberto"

        unpaid_sessions = _unpaid_sessions(sessions, recebido_total, float(client.session_value))

        result[client.id] = {
            "client_id": client.id,
            "reference_month": month_iso,
            "sessions": sessions,
            "confirmed_sessions_count": confirmed_sessions_by_client.get(client.id, 0),
            "due": devido,
            "received": recebido_total,
            "credit_applied": credito_aplicado,
            "balance": saldo,
            "status": status,
            "unpaid_sessions": unpaid_sessions,
            "blocked": unpaid_sessions >= threshold,
        }
    return result


def compute_finance_summary(db: Session, owner_id: uuid.UUID, month_iso: datetime.date) -> dict:
    payments = db.query(Payment).filter(Payment.owner_id == owner_id, Payment.reference_month == month_iso).all()
    finances = compute_all_clients_finance(db, owner_id, month_iso)

    total_recebido = 0.0
    total_aberto = 0.0
    total_sessoes = 0

    for p in payments:
        fin = finances.get(p.client_id)
        if not fin:
            continue
        total_sessoes += p.sessions_count
        total_recebido += fin["received"]
        total_aberto += fin["balance"]

    ticket_medio = round((total_recebido + total_aberto) / total_sessoes) if total_sessoes > 0 else 0

    total_saidas = float(
        db.query(func.coalesce(func.sum(Bill.amount), 0))
        .filter(Bill.owner_id == owner_id, Bill.due_date >= month_iso, Bill.due_date < _next_month(month_iso))
        .scalar()
    )

    return {
        "total_recebido": total_recebido,
        "total_aberto": total_aberto,
        "total_sessoes": total_sessoes,
        "ticket_medio": ticket_medio,
        "total_saidas": total_saidas,
        "lucro_liquido": total_recebido - total_saidas,
    }


def apply_payment_surplus_as_credit(db: Session, owner_id: uuid.UUID, client_id: uuid.UUID, surplus: float) -> None:
    """Quando um pagamento excede o devido, o excedente vira saldo de crédito do cliente."""
    if surplus <= 0:
        return
    credit = db.query(ClientCredit).filter(ClientCredit.client_id == client_id, ClientCredit.owner_id == owner_id).first()
    if credit:
        credit.balance = float(credit.balance) + surplus
    else:
        credit = ClientCredit(owner_id=owner_id, client_id=client_id, balance=surplus)
        db.add(credit)
