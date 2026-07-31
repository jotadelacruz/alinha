"""Criação de usuários Supabase já confirmados, via Admin API — usada só pelo
cadastro combinado (assinar já na entrada, sem etapa separada de confirmar e-mail).

Separado de billing_service.py de propósito: são dois fornecedores diferentes
(Supabase Auth vs. Asaas), e misturar os dois módulos dificultaria mockar cada
integração isoladamente nos testes."""

import uuid

import httpx

from app.core.config import settings


class SupabaseAdminNotConfigured(RuntimeError):
    pass


class SupabaseSignupError(RuntimeError):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def _require_configured() -> None:
    if not settings.supabase_service_role_key:
        raise SupabaseAdminNotConfigured("SUPABASE_SERVICE_ROLE_KEY não configurada")


def _headers() -> dict:
    # Este projeto usa o sistema novo de chaves da Supabase (sb_publishable_.../
    # sb_secret_..., não JWT). Nesse formato a chave secreta vai só no header
    # apikey — mandar ela também em Authorization: Bearer faz a Supabase tentar
    # decodificar como JWT antigo e rejeitar com "Invalid JWT".
    key = settings.supabase_service_role_key or ""
    return {"apikey": key, "Content-Type": "application/json"}


def _translate_admin_error(resp: httpx.Response) -> str:
    try:
        body = resp.json()
    except ValueError:
        body = {}
    raw = str(body.get("msg") or body.get("message") or body.get("error_description") or "")
    lowered = raw.lower()
    if "already" in lowered or "exist" in lowered or "duplicate" in lowered:
        return "Este e-mail já está cadastrado. Faça login e assine pela página de Configurações."
    if "password" in lowered:
        return "Senha inválida — precisa ter pelo menos 6 caracteres."
    if "email" in lowered:
        return "E-mail inválido."
    return "Não foi possível criar a conta. Verifique os dados e tente novamente."


def create_confirmed_supabase_user(email: str, password: str, name: str) -> uuid.UUID:
    _require_configured()
    resp = httpx.post(
        f"{settings.supabase_url}/auth/v1/admin/users",
        headers=_headers(),
        json={
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"name": name},
        },
        timeout=10,
    )
    if resp.status_code >= 400:
        raise SupabaseSignupError(_translate_admin_error(resp), status_code=400)
    return uuid.UUID(resp.json()["id"])
