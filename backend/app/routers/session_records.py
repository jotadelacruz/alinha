import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id
from app.core.database import get_db
from app.models.models import SessionRecord
from app.schemas.schemas import SessionRecordCreate, SessionRecordOut
from app.services.prontuario_service import log_prontuario_access

router = APIRouter(prefix="/session-records", tags=["session-records"])


def _to_out(r: SessionRecord) -> SessionRecordOut:
    return SessionRecordOut(
        id=r.id, client_id=r.client_id, date=r.session_date, complaint=r.complaint or "",
        interventions=r.interventions or "", observations=r.observations or "", plan=r.plan or "",
        free_notes=r.free_notes or "",
    )


@router.get("", response_model=list[SessionRecordOut], response_model_by_alias=True)
def list_session_records(
    client_id: uuid.UUID | None = Query(default=None),
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    q = db.query(SessionRecord).filter(SessionRecord.owner_id == user_id)
    if client_id:
        q = q.filter(SessionRecord.client_id == client_id)
        log_prontuario_access(db, user_id, client_id, "view")
        db.commit()
    records = q.order_by(SessionRecord.session_date.desc()).all()
    return [_to_out(r) for r in records]


@router.post("", response_model=SessionRecordOut, response_model_by_alias=True)
def create_session_record(
    body: SessionRecordCreate, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    record = SessionRecord(
        owner_id=user_id, client_id=body.client_id, session_date=body.date, complaint=body.complaint,
        interventions=body.interventions, observations=body.observations, plan=body.plan, free_notes=body.free_notes,
    )
    db.add(record)
    db.flush()
    log_prontuario_access(db, user_id, body.client_id, "create", record.id)
    db.commit()
    db.refresh(record)
    return _to_out(record)


@router.delete("/{record_id}")
def delete_session_record(record_id: uuid.UUID, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)):
    record = db.query(SessionRecord).filter(SessionRecord.id == record_id, SessionRecord.owner_id == user_id).first()
    if not record:
        raise HTTPException(404, "Prontuário não encontrado")
    log_prontuario_access(db, user_id, record.client_id, "delete", record.id)
    db.delete(record)
    db.commit()
    return {"ok": True}
