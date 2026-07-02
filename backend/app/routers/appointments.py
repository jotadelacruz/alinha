import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id
from app.core.database import get_db
from app.models.models import Appointment
from app.schemas.schemas import AppointmentCreate, AppointmentOut, AppointmentStatusUpdate
from app.services.appointment_service import ensure_upcoming_appointments

router = APIRouter(prefix="/appointments", tags=["appointments"])


def _to_out(a: Appointment) -> AppointmentOut:
    return AppointmentOut(
        id=a.id,
        client_id=a.client_id,
        date_iso=a.appointment_date,
        time=str(a.appointment_time)[:5],
        status=a.status,
        modality=a.modality,
        recurrence_id=a.recurrence_id,
    )


@router.get("", response_model=list[AppointmentOut], response_model_by_alias=True)
def list_appointments(
    from_iso: datetime.date | None = Query(default=None),
    to_iso: datetime.date | None = Query(default=None),
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    ensure_upcoming_appointments(db, user_id, datetime.date.today())
    db.commit()

    q = db.query(Appointment).filter(Appointment.owner_id == user_id)
    if from_iso:
        q = q.filter(Appointment.appointment_date >= from_iso)
    if to_iso:
        q = q.filter(Appointment.appointment_date <= to_iso)
    appts = q.order_by(Appointment.appointment_date, Appointment.appointment_time).all()
    return [_to_out(a) for a in appts]


@router.post("", response_model=AppointmentOut, response_model_by_alias=True)
def create_appointment(
    body: AppointmentCreate, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    appt = Appointment(
        owner_id=user_id,
        client_id=body.client_id,
        appointment_date=body.date_iso,
        appointment_time=body.time,
        status=body.status,
        modality=body.modality,
        recurrence_id=body.recurrence_id,
    )
    db.add(appt)
    db.commit()
    db.refresh(appt)
    return _to_out(appt)


@router.patch("/{appointment_id}/status")
def update_status(
    appointment_id: uuid.UUID,
    body: AppointmentStatusUpdate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    appt = db.query(Appointment).filter(Appointment.id == appointment_id, Appointment.owner_id == user_id).first()
    if not appt:
        raise HTTPException(404, "Consulta não encontrada")
    appt.status = body.status
    db.commit()
    return {"ok": True}


@router.delete("/{appointment_id}")
def delete_appointment(
    appointment_id: uuid.UUID, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    appt = db.query(Appointment).filter(Appointment.id == appointment_id, Appointment.owner_id == user_id).first()
    if not appt:
        raise HTTPException(404, "Consulta não encontrada")
    db.delete(appt)
    db.commit()
    return {"ok": True}


@router.delete("/recurrence/{recurrence_id}")
def delete_recurrence_from(
    recurrence_id: str,
    from_iso: datetime.date = Query(...),
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    db.query(Appointment).filter(
        Appointment.owner_id == user_id,
        Appointment.recurrence_id == recurrence_id,
        Appointment.appointment_date >= from_iso,
    ).delete()
    db.commit()
    return {"ok": True}
