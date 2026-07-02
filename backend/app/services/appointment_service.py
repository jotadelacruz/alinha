"""Portado de ensureUpcomingAppointments/generateRecurringAppointmentsForClient
em frontend-legacy/js/app.js:139-203."""

import datetime
import uuid

from sqlalchemy.orm import Session

from app.models.models import Appointment, Client
from app.services.date_utils import RECURRENCE_WEEKS_AHEAD, monday_of, next_weekday_on_or_after


def generate_recurring_appointments_for_client(db: Session, owner_id: uuid.UUID, client: Client, today: datetime.date) -> int:
    """Gera (e persiste) a recorrência de UM cliente a partir de hoje. Retorna quantas foram criadas."""
    if client.frequency not in ("Semanal", "Quinzenal"):
        return 0
    if not client.fixed_day or client.fixed_day == "-":
        return 0

    monday = monday_of(today)
    horizon = monday + datetime.timedelta(days=RECURRENCE_WEEKS_AHEAD * 7)
    recurrence_id = f"rec-{client.id}"
    step_days = 14 if client.frequency == "Quinzenal" else 7

    first_occurrence = next_weekday_on_or_after(monday, client.fixed_day)
    if first_occurrence is None:
        return 0

    existing = db.query(Appointment).filter(Appointment.owner_id == owner_id).all()
    existing_by_client_date = {(a.client_id, a.appointment_date) for a in existing}
    existing_by_date_time = {(a.appointment_date, a.appointment_time) for a in existing}

    to_create: list[Appointment] = []
    cursor = first_occurrence
    while cursor <= horizon:
        already_exists = (client.id, cursor) in existing_by_client_date or any(
            a.client_id == client.id and a.appointment_date == cursor for a in to_create
        )
        slot_taken = (cursor, client.fixed_time) in existing_by_date_time or any(
            a.appointment_date == cursor and a.appointment_time == client.fixed_time for a in to_create
        )
        if not already_exists and not slot_taken:
            to_create.append(
                Appointment(
                    owner_id=owner_id,
                    client_id=client.id,
                    appointment_date=cursor,
                    appointment_time=client.fixed_time,
                    status="confirmed",
                    modality=client.modality,
                    recurrence_id=recurrence_id,
                )
            )
        cursor += datetime.timedelta(days=step_days)

    if to_create:
        db.add_all(to_create)
    return len(to_create)


def ensure_upcoming_appointments(db: Session, owner_id: uuid.UUID, today: datetime.date) -> int:
    """Roda para todos os clientes ativos do usuário (equivalente ao job de carregamento do app)."""
    clients = db.query(Client).filter(Client.owner_id == owner_id, Client.status == "ativo").all()
    created = 0
    for client in clients:
        created += generate_recurring_appointments_for_client(db, owner_id, client, today)
    return created
