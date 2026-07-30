"""Testes da integração de cobrança (Asaas): trial, suspensão e webhook.

Segue o mesmo padrão de test_integration.py — Postgres local real, TestClient,
fixtures próprias (este projeto não tem conftest.py compartilhado). As
chamadas HTTP à Asaas em si são mockadas via unittest.mock, já que ainda não
existe conta sandbox configurada."""

import datetime
import uuid
from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.auth import get_current_user_id_unchecked
from app.core.database import SessionLocal
from app.main import app
from app.models.models import AsaasWebhookEvent, Profile
from app.services import billing_service

TEST_USER_ID = uuid.uuid4()
client = TestClient(app)

FUTURE = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=14)
PAST = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)


@pytest.fixture(scope="module", autouse=True)
def override_auth():
    app.dependency_overrides[get_current_user_id_unchecked] = lambda: TEST_USER_ID
    yield
    del app.dependency_overrides[get_current_user_id_unchecked]


@pytest.fixture(scope="module", autouse=True)
def profile_row():
    db = SessionLocal()
    db.add(
        Profile(
            id=TEST_USER_ID,
            name="Terapeuta Billing Teste",
            work_days=["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
            trial_ends_at=FUTURE,
            subscription_status="trialing",
        )
    )
    db.execute(
        text("INSERT INTO auth.users (id, email) VALUES (:id, :email) ON CONFLICT (id) DO NOTHING"),
        {"id": str(TEST_USER_ID), "email": "billing.teste@example.com"},
    )
    db.commit()
    db.close()
    yield
    db = SessionLocal()
    db.execute(text("DELETE FROM asaas_webhook_events WHERE id LIKE 'test-%'"))
    db.query(Profile).filter(Profile.id == TEST_USER_ID).delete()
    db.execute(text("DELETE FROM auth.users WHERE id = :id"), {"id": str(TEST_USER_ID)})
    db.commit()
    db.close()


def _reset_profile(**fields):
    db = SessionLocal()
    db.query(Profile).filter(Profile.id == TEST_USER_ID).update(fields)
    db.commit()
    db.close()


# ---------- sync_trial_status (unit, sem HTTP) ----------


def test_sync_trial_status_suspends_after_expiry():
    db = SessionLocal()
    try:
        result = billing_service.sync_trial_status(db, TEST_USER_ID, "active", PAST, "trialing")
        assert result == "suspended"
        assert db.query(Profile.account_status).filter(Profile.id == TEST_USER_ID).scalar() == "suspended"
    finally:
        db.close()
        _reset_profile(account_status="active", trial_ends_at=FUTURE, subscription_status="trialing")


def test_sync_trial_status_ignores_grandfathered_account():
    db = SessionLocal()
    try:
        result = billing_service.sync_trial_status(db, TEST_USER_ID, "active", None, None)
        assert result == "active"
        assert db.query(Profile.account_status).filter(Profile.id == TEST_USER_ID).scalar() == "active"
    finally:
        db.close()


def test_sync_trial_status_ignores_paying_customer():
    db = SessionLocal()
    try:
        result = billing_service.sync_trial_status(db, TEST_USER_ID, "active", PAST, "active")
        assert result == "active"
    finally:
        db.close()


# ---------- GET /billing/status: regressão do beco-sem-saída ----------


def test_billing_status_reachable_while_suspended():
    _reset_profile(account_status="suspended")
    try:
        resp = client.get("/billing/status")
        assert resp.status_code == 200, resp.text
        assert resp.json()["accountStatus"] == "suspended"
        assert resp.json()["billingEnrolled"] is True
    finally:
        _reset_profile(account_status="active")


def test_regular_route_still_blocks_suspended_account():
    _reset_profile(account_status="suspended")
    try:
        resp = client.get("/clients")
        assert resp.status_code == 403, resp.text
        assert resp.json()["detail"]["billingIssue"] is True
    finally:
        _reset_profile(account_status="active")


# ---------- POST /billing/subscribe (httpx mockado) ----------


def _mock_asaas_responses(customer_id="cus_test123", subscription_id="sub_test123", invoice_url="https://asaas.test/i/abc"):
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


def test_subscribe_without_asaas_configured_returns_503(monkeypatch):
    monkeypatch.setattr(billing_service.settings, "asaas_api_key", None)
    resp = client.post(
        "/billing/subscribe",
        json={"name": "Terapeuta Teste", "cpfCnpj": "12345678909", "billingType": "PIX"},
    )
    assert resp.status_code == 503, resp.text


def test_subscribe_rejects_grandfathered_account(monkeypatch):
    monkeypatch.setattr(billing_service.settings, "asaas_api_key", "test-key")
    _reset_profile(trial_ends_at=None)
    try:
        resp = client.post(
            "/billing/subscribe",
            json={"name": "Terapeuta Teste", "cpfCnpj": "12345678909", "billingType": "PIX"},
        )
        assert resp.status_code == 400, resp.text
    finally:
        _reset_profile(trial_ends_at=FUTURE)


def test_subscribe_creates_customer_and_subscription(monkeypatch):
    monkeypatch.setattr(billing_service.settings, "asaas_api_key", "test-key")
    _reset_profile(asaas_customer_id=None, asaas_subscription_id=None, subscription_status="trialing")

    customer_resp, subscription_resp, payments_resp = _mock_asaas_responses()
    with patch.object(billing_service.httpx, "post", side_effect=[customer_resp, subscription_resp]) as mock_post, patch.object(
        billing_service.httpx, "get", return_value=payments_resp
    ) as mock_get:
        resp = client.post(
            "/billing/subscribe",
            json={"name": "Terapeuta Teste", "cpfCnpj": "12345678909", "billingType": "PIX", "phone": "11999999999"},
        )
    assert resp.status_code == 200, resp.text
    assert resp.json()["invoiceUrl"] == "https://asaas.test/i/abc"
    assert mock_post.call_count == 2
    assert mock_get.call_count == 1

    db = SessionLocal()
    profile = db.query(Profile).filter(Profile.id == TEST_USER_ID).first()
    assert profile.asaas_customer_id == "cus_test123"
    assert profile.asaas_subscription_id == "sub_test123"
    assert profile.subscription_status == "pending"
    db.close()


def test_subscribe_double_submit_reuses_existing_subscription(monkeypatch):
    """Clique duplo não deve criar uma segunda assinatura na Asaas."""
    monkeypatch.setattr(billing_service.settings, "asaas_api_key", "test-key")
    _, _, payments_resp = _mock_asaas_responses(invoice_url="https://asaas.test/i/already-subscribed")

    # Neste ponto o profile já tem asaas_customer_id/asaas_subscription_id do teste anterior.
    with patch.object(billing_service.httpx, "post") as mock_post, patch.object(
        billing_service.httpx, "get", return_value=payments_resp
    ):
        resp = client.post(
            "/billing/subscribe",
            json={"name": "Terapeuta Teste", "cpfCnpj": "12345678909", "billingType": "PIX"},
        )
    assert resp.status_code == 200, resp.text
    assert resp.json()["invoiceUrl"] == "https://asaas.test/i/already-subscribed"
    mock_post.assert_not_called()  # nem /customers nem /subscriptions foram chamados de novo


# ---------- POST /billing/webhook/asaas ----------


def test_webhook_wrong_token_rejected(monkeypatch):
    monkeypatch.setattr(billing_service.settings, "asaas_webhook_token", "correct-token")
    _reset_profile(account_status="active", subscription_status="pending")
    resp = client.post(
        "/billing/webhook/asaas",
        json={"id": "test-evt-wrong-token", "event": "PAYMENT_CONFIRMED", "payment": {"subscription": "sub_test123"}},
        headers={"asaas-access-token": "wrong-token"},
    )
    assert resp.status_code == 403, resp.text
    assert billing_service.settings.asaas_webhook_token == "correct-token"
    db = SessionLocal()
    assert db.query(Profile.subscription_status).filter(Profile.id == TEST_USER_ID).scalar() == "pending"
    db.close()


def test_webhook_payment_confirmed_activates_account(monkeypatch):
    monkeypatch.setattr(billing_service.settings, "asaas_webhook_token", "correct-token")
    _reset_profile(account_status="suspended", subscription_status="past_due")
    resp = client.post(
        "/billing/webhook/asaas",
        json={
            "id": "test-evt-confirmed-1",
            "event": "PAYMENT_CONFIRMED",
            "payment": {"id": "pay_1", "subscription": "sub_test123", "customer": "cus_test123"},
        },
        headers={"asaas-access-token": "correct-token"},
    )
    assert resp.status_code == 200, resp.text
    db = SessionLocal()
    profile = db.query(Profile).filter(Profile.id == TEST_USER_ID).first()
    assert profile.account_status == "active"
    assert profile.subscription_status == "active"
    db.close()


def test_webhook_payment_overdue_suspends_account(monkeypatch):
    monkeypatch.setattr(billing_service.settings, "asaas_webhook_token", "correct-token")
    _reset_profile(account_status="active", subscription_status="active")
    resp = client.post(
        "/billing/webhook/asaas",
        json={
            "id": "test-evt-overdue-1",
            "event": "PAYMENT_OVERDUE",
            "payment": {"id": "pay_2", "subscription": "sub_test123", "customer": "cus_test123"},
        },
        headers={"asaas-access-token": "correct-token"},
    )
    assert resp.status_code == 200, resp.text
    db = SessionLocal()
    profile = db.query(Profile).filter(Profile.id == TEST_USER_ID).first()
    assert profile.account_status == "suspended"
    assert profile.subscription_status == "past_due"
    db.close()


def test_webhook_duplicate_event_id_is_not_reprocessed(monkeypatch):
    monkeypatch.setattr(billing_service.settings, "asaas_webhook_token", "correct-token")
    headers = {"asaas-access-token": "correct-token"}
    body = {
        "id": "test-evt-dup-1",
        "event": "PAYMENT_CONFIRMED",
        "payment": {"id": "pay_3", "subscription": "sub_test123", "customer": "cus_test123"},
    }

    resp1 = client.post("/billing/webhook/asaas", json=body, headers=headers)
    assert resp1.status_code == 200, resp1.text
    db = SessionLocal()
    assert db.query(Profile.account_status).filter(Profile.id == TEST_USER_ID).scalar() == "active"
    db.close()

    # Simula uma suspensão manual acontecendo depois do primeiro evento.
    _reset_profile(account_status="suspended")

    # Reentrega do MESMO evento (mesmo id) — idempotência: não deve reprocessar
    # e reverter a suspensão manual de volta pra 'active'.
    resp2 = client.post("/billing/webhook/asaas", json=body, headers=headers)
    assert resp2.status_code == 200, resp2.text
    db = SessionLocal()
    assert db.query(Profile.account_status).filter(Profile.id == TEST_USER_ID).scalar() == "suspended"
    assert db.query(AsaasWebhookEvent).filter(AsaasWebhookEvent.id == "test-evt-dup-1").count() == 1
    db.close()
