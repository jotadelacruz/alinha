import datetime
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id
from app.core.database import get_db
from app.models.models import ClientCredit, Payment, PaymentTransaction
from app.schemas.schemas import (
    ClientCreditOut,
    ClientCreditSet,
    ClientFinanceOut,
    FinanceSummaryOut,
    PaymentOut,
    PaymentTransactionCreate,
    PaymentTransactionOut,
    PaymentUpsert,
)
from app.services.finance_service import (
    apply_payment_surplus_as_credit,
    compute_all_clients_finance,
    compute_client_finance,
    compute_finance_summary,
)

router = APIRouter(tags=["payments"])


def _payment_out(p: Payment) -> PaymentOut:
    open_since = None
    if p.open_since_date:
        open_since = (datetime.date.today() - p.open_since_date).days
    return PaymentOut(id=p.id, client_id=p.client_id, sessions=p.sessions_count, status=p.status, open_since=open_since)


def _transaction_out(t: PaymentTransaction) -> PaymentTransactionOut:
    return PaymentTransactionOut(
        id=t.id,
        client_id=t.client_id,
        reference_month=t.reference_month,
        amount=float(t.amount),
        payment_date=t.payment_date,
        payment_method=t.payment_method,
        notes=t.notes or "",
    )


@router.get("/payments", response_model=list[PaymentOut], response_model_by_alias=True)
def list_payments(
    reference_month_iso: datetime.date | None = Query(default=None),
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    q = db.query(Payment).filter(Payment.owner_id == user_id)
    if reference_month_iso:
        q = q.filter(Payment.reference_month == reference_month_iso)
    return [_payment_out(p) for p in q.all()]


@router.put("/payments", response_model=PaymentOut, response_model_by_alias=True)
def upsert_payment(body: PaymentUpsert, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)):
    payment = (
        db.query(Payment)
        .filter(
            Payment.client_id == body.client_id,
            Payment.owner_id == user_id,
            Payment.reference_month == body.reference_month_iso,
        )
        .first()
    )
    is_paid = body.status == "pago"
    if payment:
        payment.sessions_count = body.sessions
        payment.status = body.status
        payment.open_since_date = None if is_paid else body.open_since_iso
        payment.paid_at = datetime.datetime.now(datetime.timezone.utc) if is_paid else None
    else:
        payment = Payment(
            owner_id=user_id,
            client_id=body.client_id,
            reference_month=body.reference_month_iso,
            sessions_count=body.sessions,
            status=body.status,
            open_since_date=None if is_paid else body.open_since_iso,
            paid_at=datetime.datetime.now(datetime.timezone.utc) if is_paid else None,
        )
        db.add(payment)
    db.commit()
    db.refresh(payment)
    return _payment_out(payment)


@router.post("/payments/{payment_id}/mark-paid")
def mark_paid(payment_id: uuid.UUID, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)):
    payment = db.query(Payment).filter(Payment.id == payment_id, Payment.owner_id == user_id).first()
    if payment:
        payment.status = "pago"
        payment.open_since_date = None
        payment.paid_at = datetime.datetime.now(datetime.timezone.utc)
        db.commit()
    return {"ok": True}


@router.get("/payment-transactions", response_model=list[PaymentTransactionOut], response_model_by_alias=True)
def list_transactions(
    reference_month_iso: datetime.date | None = Query(default=None),
    client_id: uuid.UUID | None = Query(default=None),
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    q = db.query(PaymentTransaction).filter(PaymentTransaction.owner_id == user_id)
    if reference_month_iso:
        q = q.filter(PaymentTransaction.reference_month == reference_month_iso)
    if client_id:
        q = q.filter(PaymentTransaction.client_id == client_id)
    txs = q.order_by(PaymentTransaction.payment_date.desc()).all()
    return [_transaction_out(t) for t in txs]


@router.post("/payment-transactions", response_model=PaymentTransactionOut, response_model_by_alias=True)
def create_transaction(
    body: PaymentTransactionCreate, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    tx = PaymentTransaction(
        owner_id=user_id,
        client_id=body.client_id,
        reference_month=body.reference_month_iso,
        amount=body.amount,
        payment_date=body.payment_date,
        payment_method=body.payment_method,
        notes=body.notes,
    )
    db.add(tx)
    db.flush()

    fin_before = compute_client_finance(db, user_id, body.client_id, body.reference_month_iso)
    # Reaproveita a regra de app.js:2019-2027: excedente de pagamento vira crédito do cliente.
    if fin_before["received"] > fin_before["due"]:
        apply_payment_surplus_as_credit(db, user_id, body.client_id, fin_before["received"] - fin_before["due"])

    db.commit()
    db.refresh(tx)
    return _transaction_out(tx)


@router.delete("/payment-transactions/{transaction_id}")
def delete_transaction(
    transaction_id: uuid.UUID, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    tx = db.query(PaymentTransaction).filter(
        PaymentTransaction.id == transaction_id, PaymentTransaction.owner_id == user_id
    ).first()
    if tx:
        db.delete(tx)
        db.commit()
    return {"ok": True}


@router.get("/client-credits", response_model=list[ClientCreditOut], response_model_by_alias=True)
def list_credits(user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)):
    credits = db.query(ClientCredit).filter(ClientCredit.owner_id == user_id).all()
    return [ClientCreditOut(client_id=c.client_id, balance=float(c.balance)) for c in credits]


@router.put("/client-credits/{client_id}", response_model=ClientCreditOut, response_model_by_alias=True)
def set_credit(
    client_id: uuid.UUID, body: ClientCreditSet, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    credit = db.query(ClientCredit).filter(ClientCredit.client_id == client_id, ClientCredit.owner_id == user_id).first()
    if credit:
        credit.balance = body.balance
    else:
        credit = ClientCredit(owner_id=user_id, client_id=client_id, balance=body.balance)
        db.add(credit)
    db.commit()
    db.refresh(credit)
    return ClientCreditOut(client_id=credit.client_id, balance=float(credit.balance))


@router.get("/finance/client/{client_id}", response_model=ClientFinanceOut, response_model_by_alias=True)
def client_finance(
    client_id: uuid.UUID,
    month_iso: datetime.date = Query(...),
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    return compute_client_finance(db, user_id, client_id, month_iso)


@router.get("/finance/clients", response_model=list[ClientFinanceOut], response_model_by_alias=True)
def all_clients_finance(
    month_iso: datetime.date = Query(...), user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    return list(compute_all_clients_finance(db, user_id, month_iso).values())


@router.get("/finance/summary", response_model=FinanceSummaryOut, response_model_by_alias=True)
def finance_summary(
    month_iso: datetime.date = Query(...), user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    return compute_finance_summary(db, user_id, month_iso)
