import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id
from app.core.database import get_db
from app.models.models import Client
from app.schemas.schemas import ClientCreate, ClientOut, ClientStatusIn
from app.services.appointment_service import generate_recurring_appointments_for_client

router = APIRouter(prefix="/clients", tags=["clients"])


def _to_out(c: Client) -> ClientOut:
    return ClientOut(
        id=c.id,
        name=c.name,
        phone=c.phone or "",
        email=c.email or "",
        since=c.since,
        frequency=c.frequency,
        day=c.fixed_day or "-",
        time=str(c.fixed_time)[:5] if c.fixed_time else "-",
        modality=c.modality,
        value=float(c.session_value),
        status=c.status,
        notes=c.notes or "",
        cpf=c.cpf or "",
        address=c.address or "",
        session_duration=c.session_duration,
    )


def _apply(client: Client, body: ClientCreate) -> None:
    client.name = body.name
    client.phone = body.phone
    client.email = body.email
    client.frequency = body.frequency
    client.fixed_day = body.day if body.day != "-" else None
    client.fixed_time = body.time if body.time != "-" else None
    client.modality = body.modality
    client.session_value = body.value
    client.status = body.status
    client.notes = body.notes
    client.cpf = body.cpf
    client.address = body.address
    client.session_duration = body.session_duration


@router.get("", response_model=list[ClientOut], response_model_by_alias=True)
def list_clients(user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)):
    clients = db.query(Client).filter(Client.owner_id == user_id).order_by(Client.created_at.desc()).all()
    return [_to_out(c) for c in clients]


@router.post("", response_model=ClientOut, response_model_by_alias=True)
def create_client(body: ClientCreate, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)):
    client = Client(owner_id=user_id, since=datetime.date.today())
    _apply(client, body)
    db.add(client)
    db.flush()
    generate_recurring_appointments_for_client(db, user_id, client, datetime.date.today())
    db.commit()
    db.refresh(client)
    return _to_out(client)


@router.put("/{client_id}", response_model=ClientOut, response_model_by_alias=True)
def update_client(
    client_id: uuid.UUID,
    body: ClientCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    client = db.query(Client).filter(Client.id == client_id, Client.owner_id == user_id).first()
    if not client:
        raise HTTPException(404, "Cliente não encontrado")
    _apply(client, body)
    db.flush()
    generate_recurring_appointments_for_client(db, user_id, client, datetime.date.today())
    db.commit()
    db.refresh(client)
    return _to_out(client)


@router.patch("/{client_id}/status", response_model=ClientOut, response_model_by_alias=True)
def update_client_status(
    client_id: uuid.UUID,
    body: ClientStatusIn,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    client = db.query(Client).filter(Client.id == client_id, Client.owner_id == user_id).first()
    if not client:
        raise HTTPException(404, "Cliente não encontrado")
    client.status = body.status
    db.commit()
    db.refresh(client)
    return _to_out(client)


@router.delete("/{client_id}")
def delete_client(client_id: uuid.UUID, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == client_id, Client.owner_id == user_id).first()
    if not client:
        raise HTTPException(404, "Cliente não encontrado")
    db.delete(client)
    db.commit()
    return {"ok": True}
