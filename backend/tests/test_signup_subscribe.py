"""Testes do cadastro combinado (POST /billing/signup-and-subscribe): endpoint
público que cria a conta Supabase (via Admin API, mockada) e a assinatura na Asaas
(mockada) num passo só. Segue o mesmo padrão de test_integration.py/test_billing.py —
Postgres local real, TestClient, sem conftest.py compartilhado.

Como não existe um Supabase real neste ambiente, a criação do usuário via Admin API
é sempre mockada, e a linha que o trigger handle_new_user() criaria é inserida à mão
antes de cada teste (simulando "o trigger já rodou"), igual à fixture profile_row já
usada em outros arquivos de teste."""

import datetime
import uuid
from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.database import SessionLocal
from app.core.rate_limit import check_rate_limit
from app.core.validators import is_valid_cpf_cnpj
from app.main import app
from app.models.models import Profile
from app.services import billing_service, supabase_admin_service

client = TestClient(app)

FUTURE = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=14)
VALID_CPF = "111.444.777-35"


def _insert_pending_signup(user_id: uuid.UUID, email: str):
    """Simula o que handle_new_user() já teria criado no momento em que a Admin
    API responde: a linha em auth.users e o Profile com o trial já iniciado."""
    db = SessionLocal()
    db.execute(
        text("INSERT INTO auth.users (id, email) VALUES (:id, :email) ON CONFLICT (id) DO NOTHING"),
        {"id": str(user_id), "email": email},
    )
    db.add(Profile(id=user_id, name="Cadastro Combinado Teste", work_days=[], trial_ends_at=FUTURE, subscription_status="trialing"))
    db.commit()
    db.close()


def _cleanup_signup(user_id: uuid.UUID):
    db = SessionLocal()
    db.query(Profile).filter(Profile.id == user_id).delete()
    db.execute(text("DELETE FROM auth.users WHERE id = :id"), {"id": str(user_id)})
    db.commit()
    db.close()


def _mock_supabase_admin_response(user_id: uuid.UUID, status_code: int = 200, body: dict | None = None):
    resp = Mock(status_code=status_code)
    resp.json.return_value = body if body is not None else {"id": str(user_id)}
    return resp


def _mock_asaas_responses(customer_id="cus_signup_test", subscription_id="sub_signup_test", invoice_url="https://asaas.test/i/signup"):
    customer_resp = Mock(status_code=200)
    customer_resp.json.return_value = {"id": customer_id}
    customer_resp.raise_for_status.return_value = None

    subscription_resp = Mock(status_code=200)
    subscription_resp.json.return_value = {"id": subscription_id}
    subscription_resp.raise_for_status.return_value = None

    payments_resp = Mock(status_code=200)
    payments_resp.json.return_value = {"data": [{"invoiceUrl": invoice_url}]}
    payments_resp.raise_for_status.return_value = None

    return customer_resp, subscription_resp, payments_resp


VALID_BODY = {
    "name": "Cadastro Combinado Teste",
    "email": "combinado.teste@example.com",
    "password": "senha123",
    "cpfCnpj": VALID_CPF,
    "billingType": "PIX",
}


def test_signup_subscribe_rejects_honeypot():
    with patch.object(supabase_admin_service, "httpx") as mock_httpx:
        resp = client.post("/billing/signup-and-subscribe", json={**VALID_BODY, "honeypot": "sou um bot"})
    assert resp.status_code == 400, resp.text
    mock_httpx.post.assert_not_called()


def test_signup_subscribe_rejects_invalid_cpf():
    with patch.object(supabase_admin_service, "httpx") as mock_httpx:
        resp = client.post("/billing/signup-and-subscribe", json={**VALID_BODY, "cpfCnpj": "123.456.789-00"})
    assert resp.status_code == 422, resp.text
    mock_httpx.post.assert_not_called()


def test_signup_subscribe_returns_503_when_supabase_admin_not_configured(monkeypatch):
    monkeypatch.setattr(supabase_admin_service.settings, "supabase_service_role_key", None)
    resp = client.post("/billing/signup-and-subscribe", json=VALID_BODY)
    assert resp.status_code == 503, resp.text


def test_signup_subscribe_translates_duplicate_email(monkeypatch):
    monkeypatch.setattr(supabase_admin_service.settings, "supabase_service_role_key", "test-service-role-key")
    error_resp = Mock(status_code=422)
    error_resp.json.return_value = {"msg": "A user with this email address has already been registered"}
    with patch.object(supabase_admin_service.httpx, "post", return_value=error_resp):
        resp = client.post("/billing/signup-and-subscribe", json=VALID_BODY)
    assert resp.status_code == 400, resp.text
    assert "já está cadastrado" in resp.json()["detail"]


def test_signup_subscribe_full_success(monkeypatch):
    monkeypatch.setattr(supabase_admin_service.settings, "supabase_service_role_key", "test-service-role-key")
    monkeypatch.setattr(billing_service.settings, "asaas_api_key", "test-asaas-key")

    user_id = uuid.uuid4()
    _insert_pending_signup(user_id, "combinado.sucesso@example.com")
    try:
        admin_resp = _mock_supabase_admin_response(user_id)
        customer_resp, subscription_resp, payments_resp = _mock_asaas_responses()

        # supabase_admin_service.httpx e billing_service.httpx são o MESMO módulo
        # httpx (import compartilhado) — um único patch.object cobre as 3 chamadas
        # POST sequenciais (criar usuário admin, criar cliente Asaas, criar
        # assinatura Asaas), nessa ordem exata.
        with patch.object(
            billing_service.httpx, "post", side_effect=[admin_resp, customer_resp, subscription_resp]
        ), patch.object(billing_service.httpx, "get", return_value=payments_resp):
            resp = client.post(
                "/billing/signup-and-subscribe",
                json={**VALID_BODY, "email": "combinado.sucesso@example.com"},
            )

        assert resp.status_code == 200, resp.text
        assert resp.json()["invoiceUrl"] == "https://asaas.test/i/signup"

        db = SessionLocal()
        profile = db.query(Profile).filter(Profile.id == user_id).first()
        assert profile.asaas_customer_id == "cus_signup_test"
        assert profile.asaas_subscription_id == "sub_signup_test"
        assert profile.subscription_status == "pending"
        assert profile.account_status == "active"  # não muda sozinho, só o webhook ativa de fato
        db.close()
    finally:
        _cleanup_signup(user_id)


def test_signup_subscribe_returns_503_when_asaas_not_configured(monkeypatch):
    monkeypatch.setattr(supabase_admin_service.settings, "supabase_service_role_key", "test-service-role-key")
    monkeypatch.setattr(billing_service.settings, "asaas_api_key", None)

    user_id = uuid.uuid4()
    _insert_pending_signup(user_id, "combinado.semasaas@example.com")
    try:
        admin_resp = _mock_supabase_admin_response(user_id)
        with patch.object(supabase_admin_service.httpx, "post", return_value=admin_resp):
            resp = client.post(
                "/billing/signup-and-subscribe",
                json={**VALID_BODY, "email": "combinado.semasaas@example.com"},
            )
        assert resp.status_code == 503, resp.text
    finally:
        _cleanup_signup(user_id)


def test_signup_subscribe_profile_never_appears_gives_clear_error(monkeypatch):
    monkeypatch.setattr(supabase_admin_service.settings, "supabase_service_role_key", "test-service-role-key")
    # UUID sem nenhuma linha correspondente inserida — simula o trigger nunca ter rodado.
    ghost_user_id = uuid.uuid4()
    admin_resp = _mock_supabase_admin_response(ghost_user_id)
    with patch.object(supabase_admin_service.httpx, "post", return_value=admin_resp):
        resp = client.post("/billing/signup-and-subscribe", json=VALID_BODY)
    assert resp.status_code == 500, resp.text
    assert "Faça login" in resp.json()["detail"]


def test_is_valid_cpf_cnpj():
    assert is_valid_cpf_cnpj("111.444.777-35") is True
    assert is_valid_cpf_cnpj("11144477735") is True
    assert is_valid_cpf_cnpj("111.111.111-11") is False
    assert is_valid_cpf_cnpj("123.456.789-00") is False
    assert is_valid_cpf_cnpj("11.222.333/0001-81") is True
    assert is_valid_cpf_cnpj("11.111.111/1111-11") is False
    assert is_valid_cpf_cnpj("") is False
    assert is_valid_cpf_cnpj("abc") is False


def test_wait_for_profile_returns_none_when_never_appears():
    db = SessionLocal()
    try:
        result = billing_service.wait_for_profile(db, uuid.uuid4(), attempts=2, delay_seconds=0.01)
        assert result is None
    finally:
        db.close()


def test_check_rate_limit_blocks_after_max_attempts():
    from fastapi import HTTPException

    key = f"test-rate-limit-{uuid.uuid4()}"
    for _ in range(3):
        check_rate_limit(key, max_attempts=3, window_seconds=3600)
    with pytest.raises(HTTPException) as exc_info:
        check_rate_limit(key, max_attempts=3, window_seconds=3600)
    assert exc_info.value.status_code == 429
