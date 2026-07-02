"""Portado de frontend-legacy/js/app.js (utilitários de data usados na recorrência)."""

import datetime

RECURRENCE_WEEKS_AHEAD = 4
BILL_HORIZON_DAYS = 45
WEEK_DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]


def monday_of(d: datetime.date) -> datetime.date:
    # weekday(): 0=segunda .. 6=domingo (já bate com o índice de WEEK_DAYS)
    return d - datetime.timedelta(days=d.weekday())


def next_weekday_on_or_after(base_date: datetime.date, day_name: str) -> datetime.date | None:
    if day_name not in WEEK_DAYS:
        return None
    target_idx = WEEK_DAYS.index(day_name)
    d = base_date
    for _ in range(14):
        if d.weekday() == target_idx:
            return d
        d += datetime.timedelta(days=1)
    return None
