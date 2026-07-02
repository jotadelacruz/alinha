"""Senha de acesso ao prontuário (agora com bcrypt em vez de SHA-256 puro no
browser — data.js:94-106) + log de auditoria de acesso, requisito de LGPD que
não existia no app antigo."""

import uuid

import bcrypt
from sqlalchemy.orm import Session

from app.models.models import Profile, ProntuarioAccessLog


def set_prontuario_password(db: Session, owner_id: uuid.UUID, plain_password: str) -> None:
    profile = db.query(Profile).filter(Profile.id == owner_id).first()
    hashed = bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt())
    profile.prontuario_password_hash = hashed.decode("utf-8")


def verify_prontuario_password(db: Session, owner_id: uuid.UUID, plain_password: str) -> bool:
    profile = db.query(Profile).filter(Profile.id == owner_id).first()
    if not profile or not profile.prontuario_password_hash:
        return False
    return bcrypt.checkpw(plain_password.encode("utf-8"), profile.prontuario_password_hash.encode("utf-8"))


def log_prontuario_access(
    db: Session,
    owner_id: uuid.UUID,
    client_id: uuid.UUID,
    action: str,
    session_record_id: uuid.UUID | None = None,
) -> None:
    db.add(
        ProntuarioAccessLog(
            owner_id=owner_id,
            client_id=client_id,
            action=action,
            session_record_id=session_record_id,
        )
    )
