"""Portado de ensureUpcomingBillOccurrences/refreshBillStatuses em
frontend-legacy/js/app.js:93-132."""

import datetime
import uuid

from sqlalchemy.orm import Session

from app.models.models import Bill
from app.services.date_utils import BILL_HORIZON_DAYS


def ensure_upcoming_bill_occurrences(db: Session, owner_id: uuid.UUID, today: datetime.date) -> int:
    bills = db.query(Bill).filter(Bill.owner_id == owner_id).all()

    latest_by_series: dict[str, Bill] = {}
    for b in bills:
        if not b.series_id:
            continue
        current = latest_by_series.get(b.series_id)
        if current is None or b.due_date > current.due_date:
            latest_by_series[b.series_id] = b

    existing_keys = {(b.series_id, b.due_date) for b in bills}
    horizon = today + datetime.timedelta(days=BILL_HORIZON_DAYS)
    to_create: list[Bill] = []

    for latest in latest_by_series.values():
        if not latest.is_fixed:
            continue
        cursor = latest.due_date
        while cursor < horizon:
            year, month, day = cursor.year, cursor.month, cursor.day
            month += 1
            if month > 12:
                month = 1
                year += 1
            cursor = datetime.date(year, month, day)
            key = (latest.series_id, cursor)
            already_planned = key in existing_keys or any(
                b.series_id == latest.series_id and b.due_date == cursor for b in to_create
            )
            if not already_planned:
                to_create.append(
                    Bill(
                        owner_id=owner_id,
                        name=latest.name,
                        category=latest.category,
                        amount=latest.amount,
                        due_date=cursor,
                        status="a-pagar",
                        series_id=latest.series_id,
                        is_fixed=True,
                    )
                )

    if to_create:
        db.add_all(to_create)
    return len(to_create)


def refresh_bill_statuses(db: Session, owner_id: uuid.UUID, today: datetime.date) -> None:
    """O status 'atrasado' é derivado, não apenas armazenado — recalcula a cada carregamento."""
    bills = db.query(Bill).filter(Bill.owner_id == owner_id, Bill.status != "pago").all()
    for b in bills:
        b.status = "atrasado" if b.due_date < today else "a-pagar"
