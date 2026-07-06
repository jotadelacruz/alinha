import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id
from app.core.database import get_db
from app.models.models import Receipt
from app.schemas.schemas import ReceiptCreate, ReceiptOut

router = APIRouter(prefix="/receipts", tags=["receipts"])


def _to_out(r: Receipt) -> ReceiptOut:
    return ReceiptOut(
        id=r.id,
        client_id=r.client_id,
        client_name_snapshot=r.client_name_snapshot,
        issue_date=r.issue_date,
        amount=float(r.amount) if r.amount is not None else None,
        content=r.content,
    )


@router.get("", response_model=list[ReceiptOut], response_model_by_alias=True)
def list_receipts(user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)):
    receipts = db.query(Receipt).filter(Receipt.owner_id == user_id).order_by(Receipt.issue_date.desc()).all()
    return [_to_out(r) for r in receipts]


@router.post("", response_model=ReceiptOut, response_model_by_alias=True)
def create_receipt(body: ReceiptCreate, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)):
    receipt = Receipt(
        owner_id=user_id,
        client_id=body.client_id,
        client_name_snapshot=body.client_name_snapshot,
        issue_date=body.issue_date,
        amount=body.amount,
        content=body.content,
    )
    db.add(receipt)
    db.commit()
    db.refresh(receipt)
    return _to_out(receipt)


@router.put("/{receipt_id}", response_model=ReceiptOut, response_model_by_alias=True)
def update_receipt(
    receipt_id: uuid.UUID, body: ReceiptCreate, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    receipt = db.query(Receipt).filter(Receipt.id == receipt_id, Receipt.owner_id == user_id).first()
    if not receipt:
        raise HTTPException(404, "Recibo não encontrado")
    receipt.client_id = body.client_id
    receipt.client_name_snapshot = body.client_name_snapshot
    receipt.issue_date = body.issue_date
    receipt.amount = body.amount
    receipt.content = body.content
    db.commit()
    db.refresh(receipt)
    return _to_out(receipt)


@router.delete("/{receipt_id}")
def delete_receipt(receipt_id: uuid.UUID, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)):
    receipt = db.query(Receipt).filter(Receipt.id == receipt_id, Receipt.owner_id == user_id).first()
    if receipt:
        db.delete(receipt)
        db.commit()
    return {"ok": True}
