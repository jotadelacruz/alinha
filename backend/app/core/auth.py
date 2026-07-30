"""Validação do JWT emitido pelo Supabase Auth (login continua no frontend)."""

import time
import uuid

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt
from jose.exceptions import JOSEError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db

security = HTTPBearer()

_jwks_cache: dict = {"keys": [], "fetched_at": 0.0}
_JWKS_TTL_SECONDS = 3600


def _get_jwks() -> dict:
    now = time.time()
    if not _jwks_cache["keys"] or now - _jwks_cache["fetched_at"] > _JWKS_TTL_SECONDS:
        url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
        resp = httpx.get(url, timeout=5)
        resp.raise_for_status()
        _jwks_cache["keys"] = resp.json()["keys"]
        _jwks_cache["fetched_at"] = now
    return {"keys": _jwks_cache["keys"]}


def _decode_supabase_jwt(token: str) -> dict:
    try:
        header = jwt.get_unverified_header(token)
    except JOSEError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido") from exc

    # Projetos Supabase mais novos assinam com chaves assimétricas (ES256/RS256),
    # publicadas via JWKS. Projetos legados usam HS256 com um segredo compartilhado.
    if header.get("alg") == "HS256":
        if not settings.supabase_jwt_secret:
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "SUPABASE_JWT_SECRET não configurado")
        try:
            return jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        except JOSEError as exc:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido ou expirado") from exc

    jwks = _get_jwks()
    matching_key = next((k for k in jwks["keys"] if k["kid"] == header.get("kid")), None)
    if matching_key is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Chave de assinatura desconhecida")
    try:
        return jwt.decode(
            token,
            matching_key,
            algorithms=[header["alg"]],
            audience="authenticated",
        )
    except JOSEError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido ou expirado") from exc


def get_current_user_id_unchecked(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> uuid.UUID:
    """Só valida o JWT, sem checar account_status. Uso restrito às rotas de
    /billing, que precisam ser alcançáveis por uma conta já suspensa (senão ela
    nunca conseguiria pagar pra voltar)."""
    payload = _decode_supabase_jwt(credentials.credentials)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token sem identificação de usuário")
    return uuid.UUID(sub)


def get_current_user_id(
    user_id: uuid.UUID = Depends(get_current_user_id_unchecked), db: Session = Depends(get_db)
) -> uuid.UUID:
    # Import local pra evitar import circular (models importa Base de database, não de auth).
    from app.models.models import Profile
    from app.services.billing_service import sync_trial_status

    row = (
        db.query(Profile.account_status, Profile.trial_ends_at, Profile.subscription_status)
        .filter(Profile.id == user_id)
        .first()
    )
    if row is not None:
        account_status, trial_ends_at, subscription_status = row
        account_status = sync_trial_status(db, user_id, account_status, trial_ends_at, subscription_status)
        if account_status == "suspended":
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                {
                    "message": (
                        "Seu período de teste terminou. Assine para continuar usando o Alinha."
                        if trial_ends_at is not None
                        else "Conta suspensa por pendência de pagamento. Entre em contato com o suporte."
                    ),
                    "billingIssue": trial_ends_at is not None,
                },
            )
    return user_id


def require_admin(user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)) -> uuid.UUID:
    from app.models.models import Profile

    is_admin = db.query(Profile.is_admin).filter(Profile.id == user_id).scalar()
    if not is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acesso restrito a administradores.")
    return user_id
