import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id
from app.core.database import get_db
from app.models.models import Bill
from app.schemas.schemas import BillCreate, BillOut, BillStatusUpdate
from app.services.bill_service import ensure_upcoming_bill_occurrences, refresh_bill_statuses

router = APIRouter(prefix="/bills", tags=["bills"])


def _to_out(b: Bill) -> BillOut:
    return BillOut(
        id=b.id, name=b.name, category=b.category, amount=float(b.amount), due_date=b.due_date,
        status=b.status, series_id=b.series_id, is_fixed=b.is_fixed,
    )


@router.get("", response_model=list[BillOut], response_model_by_alias=True)
def list_bills(user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)):
    today = datetime.date.today()
    ensure_upcoming_bill_occurrences(db, user_id, today)
    refresh_bill_statuses(db, user_id, today)
    db.commit()
    bills = db.query(Bill).filter(Bill.owner_id == user_id).order_by(Bill.due_date).all()
    return [_to_out(b) for b in bills]


@router.post("", response_model=BillOut, response_model_by_alias=True)
def create_bill(body: BillCreate, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)):
    bill = Bill(
        owner_id=user_id, name=body.name, category=body.category, amount=body.amount, due_date=body.due_date,
        status=body.status, series_id=body.series_id, is_fixed=body.is_fixed,
    )
    db.add(bill)
    db.commit()
    db.refresh(bill)
    return _to_out(bill)


@router.patch("/{bill_id}/status")
def update_status(
    bill_id: uuid.UUID, body: BillStatusUpdate, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    bill = db.query(Bill).filter(Bill.id == bill_id, Bill.owner_id == user_id).first()
    if not bill:
        raise HTTPException(404, "Conta não encontrada")
    bill.status = body.status
    db.commit()
    return {"ok": True}


@router.delete("/{bill_id}")
def delete_bill(bill_id: uuid.UUID, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)):
    bill = db.query(Bill).filter(Bill.id == bill_id, Bill.owner_id == user_id).first()
    if bill:
        db.delete(bill)
        db.commit()
    return {"ok": True}


@router.delete("/series/{series_id}")
def delete_series_from(
    series_id: str, from_date_iso: datetime.date = Query(...), user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    db.query(Bill).filter(
        Bill.owner_id == user_id, Bill.series_id == series_id, Bill.due_date >= from_date_iso
    ).delete()
    db.commit()
    return {"ok": True}
