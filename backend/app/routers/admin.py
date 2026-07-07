import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.auth import require_admin
from app.core.database import get_db
from app.models.models import Profile
from app.schemas.schemas import AdminAccountOut, AdminAccountStatusUpdate

router = APIRouter(prefix="/admin", tags=["admin"])

_VALID_STATUSES = {"active", "suspended"}


@router.get("/accounts", response_model=list[AdminAccountOut], response_model_by_alias=True)
def list_accounts(user_id: uuid.UUID = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """
            SELECT p.id, p.name, p.role, p.account_status, p.is_admin, p.created_at, u.email
            FROM public.profiles p
            JOIN auth.users u ON u.id = p.id
            ORDER BY p.created_at
            """
        )
    ).mappings().all()
    return [
        AdminAccountOut(
            id=row["id"],
            name=row["name"],
            email=row["email"],
            role=row["role"],
            account_status=row["account_status"],
            is_admin=row["is_admin"],
            created_at=row["created_at"],
        )
        for row in rows
    ]


@router.patch("/accounts/{profile_id}/status", response_model=AdminAccountOut, response_model_by_alias=True)
def update_account_status(
    profile_id: uuid.UUID,
    body: AdminAccountStatusUpdate,
    user_id: uuid.UUID = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if body.account_status not in _VALID_STATUSES:
        raise HTTPException(400, "Status inválido")

    profile = db.query(Profile).filter(Profile.id == profile_id).first()
    if not profile:
        raise HTTPException(404, "Conta não encontrada")
    if profile.is_admin:
        raise HTTPException(400, "Não é possível suspender uma conta de administrador")

    profile.account_status = body.account_status
    db.commit()

    row = db.execute(
        text("SELECT email FROM auth.users WHERE id = :id"), {"id": str(profile_id)}
    ).mappings().first()
    return AdminAccountOut(
        id=profile.id,
        name=profile.name,
        email=row["email"] if row else "",
        role=profile.role,
        account_status=profile.account_status,
        is_admin=profile.is_admin,
        created_at=profile.created_at,
    )
