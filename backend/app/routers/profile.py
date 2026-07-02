import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id
from app.core.database import get_db
from app.models.models import Profile
from app.schemas.schemas import ProfileOut, ProfileUpdate, ProntuarioPasswordIn
from app.services.prontuario_service import set_prontuario_password, verify_prontuario_password

router = APIRouter(prefix="/profile", tags=["profile"])


def _to_profile_out(p: Profile) -> ProfileOut:
    return ProfileOut(
        name=p.name,
        role=p.role,
        initials=p.initials or "".join(w[0] for w in p.name.split() if w)[:2].upper(),
        photo_data_url=p.photo_url,
        settings={
            "theme": p.theme,
            "agenda": {
                "work_start": str(p.work_start)[:5],
                "work_end": str(p.work_end)[:5],
                "session_duration": p.session_duration,
                "work_days": p.work_days or [],
            },
            "notifications": {
                "session": p.notif_session,
                "payment": p.notif_payment,
                "bills": p.notif_bills,
                "weekly": p.notif_weekly,
            },
            "office": {
                "address": p.office_address or "",
                "default_value": float(p.default_session_value or 210),
                "pix": p.pix_key or "",
            },
            "message_templates": {
                "charge": p.message_template_charge or "",
                "confirmation": p.message_template_confirmation or "",
                "package": p.message_template_package or "",
            },
            "has_prontuario_password": bool(p.prontuario_password_hash),
            "certificate_logo_url": p.certificate_logo_url,
            "package_alert_threshold": p.package_alert_threshold if p.package_alert_threshold is not None else 2,
        },
    )


@router.get("", response_model=ProfileOut, response_model_by_alias=True)
def get_profile(user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)):
    profile = db.query(Profile).filter(Profile.id == user_id).first()
    if not profile:
        raise HTTPException(404, "Perfil não encontrado")
    return _to_profile_out(profile)


@router.patch("", response_model=ProfileOut, response_model_by_alias=True)
def update_profile(
    fields: ProfileUpdate, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    profile = db.query(Profile).filter(Profile.id == user_id).first()
    if not profile:
        raise HTTPException(404, "Perfil não encontrado")

    payload = fields.model_dump(exclude_unset=True, by_alias=False)
    field_map = {"photo_data_url": "photo_url", "pix_key": "pix_key"}
    for key, value in payload.items():
        column = field_map.get(key, key)
        if hasattr(profile, column):
            setattr(profile, column, value)

    db.commit()
    db.refresh(profile)
    return _to_profile_out(profile)


@router.post("/prontuario-password")
def set_password(
    body: ProntuarioPasswordIn, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    set_prontuario_password(db, user_id, body.password)
    db.commit()
    return {"ok": True}


@router.post("/prontuario-password/verify")
def verify_password(
    body: ProntuarioPasswordIn, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    return {"valid": verify_prontuario_password(db, user_id, body.password)}
