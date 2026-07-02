"""Validação do JWT emitido pelo Supabase Auth (login continua no frontend)."""

import time
import uuid

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt
from jose.exceptions import JOSEError

from app.core.config import settings

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


def get_current_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> uuid.UUID:
    payload = _decode_supabase_jwt(credentials.credentials)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token sem identificação de usuário")
    return uuid.UUID(sub)
