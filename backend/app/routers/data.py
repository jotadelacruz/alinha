import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id
from app.core.database import get_db
from app.models.models import (
    Appointment,
    Bill,
    Certificate,
    Client,
    ClientCredit,
    Package,
    Payment,
    PaymentTransaction,
    SessionRecord,
)

router = APIRouter(prefix="/data", tags=["data"])

# Ordem importa: tabelas com FK para clients/appointments primeiro (mesma ordem de
# frontend-legacy/js/data.js:649, deleteAllUserData).
_TABLES_IN_DELETE_ORDER = [
    SessionRecord,
    Certificate,
    Package,
    PaymentTransaction,
    ClientCredit,
    Appointment,
    Payment,
    Bill,
    Client,
]


@router.delete("/all")
def delete_all_user_data(user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)):
    """Apaga TODOS os dados do usuário (irreversível). Não apaga o profile em si."""
    for model in _TABLES_IN_DELETE_ORDER:
        db.query(model).filter(model.owner_id == user_id).delete()
    db.commit()
    return {"ok": True}
