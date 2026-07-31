"""Testes de cupom de desconto: validação (redeem_coupon), cálculo de desconto
(apply_coupon_discount) e a integração completa via POST /billing/subscribe.
Segue o mesmo padrão dos outros arquivos de teste — Postgres local real,
TestClient, chamadas à Asaas mockadas via unittest.mock."""

import datetime
import uuid
from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.auth import get_current_user_id_unchecked
from app.core.database import SessionLocal
from app.main import app
from app.models.models import Coupon, Profile
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
            name="Terapeuta Cupom Teste",
            work_days=[],
            trial_ends_at=FUTURE,
            subscription_status="trialing",
        )
    )
    db.execute(
        text("INSERT INTO auth.users (id, email) VALUES (:id, :email) ON CONFLICT (id) DO NOTHING"),
        {"id": str(TEST_USER_ID), "email": "cupom.teste@example.com"},
    )
    db.commit()
    db.close()
    yield
    db = SessionLocal()
    db.execute(text("DELETE FROM public.coupons WHERE code LIKE 'TEST%'"))
    db.query(Profile).filter(Profile.id == TEST_USER_ID).delete()
    db.execute(text("DELETE FROM auth.users WHERE id = :id"), {"id": str(TEST_USER_ID)})
    db.commit()
    db.close()


def _reset_profile(**fields):
    db = SessionLocal()
    db.query(Profile).filter(Profile.id == TEST_USER_ID).update(fields)
    db.commit()
    db.close()


def _make_coupon(db, **overrides):
    defaults = dict(code="TESTFIXED10", discount_type="fixed", discount_value=10, active=True)
    defaults.update(overrides)
    coupon = Coupon(**defaults)
    db.add(coupon)
    db.commit()
    db.refresh(coupon)
    return coupon


# ---------- redeem_coupon / apply_coupon_discount (unit) ----------


def test_redeem_coupon_none_or_empty_returns_no_coupon_no_error():
    db = SessionLocal()
    try:
        assert billing_service.redeem_coupon(db, None) == (None, None)
        assert billing_service.redeem_coupon(db, "") == (None, None)
        assert billing_service.redeem_coupon(db, "   ") == (None, None)
    finally:
        db.close()


def test_redeem_coupon_valid_case_insensitive():
    db = SessionLocal()
    try:
        _make_coupon(db, code="TESTVALID")
        coupon, error = billing_service.redeem_coupon(db, "testvalid")
        assert error is None
        assert coupon is not None
        assert coupon.code == "TESTVALID"
    finally:
        db.query(Coupon).filter(Coupon.code == "TESTVALID").delete()
        db.commit()
        db.close()


def test_redeem_coupon_nonexistent():
    db = SessionLocal()
    try:
        coupon, error = billing_service.redeem_coupon(db, "TESTNAOEXISTE")
        assert coupon is None
        assert error == "Cupom inválido"
    finally:
        db.close()


def test_redeem_coupon_inactive():
    db = SessionLocal()
    try:
        _make_coupon(db, code="TESTINATIVO", active=False)
        coupon, error = billing_service.redeem_coupon(db, "TESTINATIVO")
        assert coupon is None
        assert error == "Cupom inválido"
    finally:
        db.query(Coupon).filter(Coupon.code == "TESTINATIVO").delete()
        db.commit()
        db.close()


def test_redeem_coupon_expired():
    db = SessionLocal()
    try:
        _make_coupon(db, code="TESTEXPIRADO", expires_at=PAST)
        coupon, error = billing_service.redeem_coupon(db, "TESTEXPIRADO")
        assert coupon is None
        assert error == "Cupom expirado"
    finally:
        db.query(Coupon).filter(Coupon.code == "TESTEXPIRADO").delete()
        db.commit()
        db.close()


def test_redeem_coupon_max_uses_reached():
    db = SessionLocal()
    try:
        _make_coupon(db, code="TESTESGOTADO", max_uses=1, used_count=1)
        coupon, error = billing_service.redeem_coupon(db, "TESTESGOTADO")
        assert coupon is None
        assert error == "Cupom esgotado"
    finally:
        db.query(Coupon).filter(Coupon.code == "TESTESGOTADO").delete()
        db.commit()
        db.close()


def test_apply_coupon_discount_percentage():
    coupon = Coupon(code="X", discount_type="percentage", discount_value=20)
    assert billing_service.apply_coupon_discount(100.0, coupon) == 80.0


def test_apply_coupon_discount_fixed():
    coupon = Coupon(code="X", discount_type="fixed", discount_value=30)
    assert billing_service.apply_coupon_discount(98.90, coupon) == 68.90


def test_apply_coupon_discount_floors_at_zero():
    coupon = Coupon(code="X", discount_type="fixed", discount_value=500)
    assert billing_service.apply_coupon_discount(98.90, coupon) == 0.0


def test_apply_coupon_discount_no_coupon_returns_unchanged():
    assert billing_service.apply_coupon_discount(98.90, None) == 98.90


# ---------- POST /billing/subscribe com cupom (httpx mockado) ----------


def _mock_asaas_responses(customer_id="cus_coupon_test", subscription_id="sub_coupon_test", invoice_url="https://asaas.test/i/coupon"):
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


def test_subscribe_with_valid_coupon_sends_discounted_value(monkeypatch):
    monkeypatch.setattr(billing_service.settings, "asaas_api_key", "test-asaas-key")
    monkeypatch.setattr(billing_service.settings, "asaas_plan_price", 98.90)
    _reset_profile(asaas_customer_id=None, asaas_subscription_id=None, subscription_status="trialing", coupon_code=None, subscription_value=None)

    db = SessionLocal()
    _make_coupon(db, code="TESTDESCONTO20", discount_type="percentage", discount_value=20)
    db.close()

    customer_resp, subscription_resp, payments_resp = _mock_asaas_responses()
    try:
        with patch.object(billing_service.httpx, "post", side_effect=[customer_resp, subscription_resp]) as mock_post, patch.object(
            billing_service.httpx, "get", return_value=payments_resp
        ):
            resp = client.post(
                "/billing/subscribe",
                json={"name": "Terapeuta Cupom Teste", "cpfCnpj": "11144477735", "billingType": "PIX", "couponCode": "testdesconto20"},
            )
        assert resp.status_code == 200, resp.text

        subscription_call_body = mock_post.call_args_list[1].kwargs["json"]
        assert subscription_call_body["value"] == 79.12  # 98.90 * 0.8, arredondado

        db = SessionLocal()
        profile = db.query(Profile).filter(Profile.id == TEST_USER_ID).first()
        assert float(profile.subscription_value) == 79.12
        assert profile.coupon_code == "TESTDESCONTO20"
        coupon = db.query(Coupon).filter(Coupon.code == "TESTDESCONTO20").first()
        assert coupon.used_count == 1
        db.close()
    finally:
        db = SessionLocal()
        db.query(Coupon).filter(Coupon.code == "TESTDESCONTO20").delete()
        db.commit()
        db.close()


def test_subscribe_with_invalid_coupon_rejected_before_touching_asaas(monkeypatch):
    monkeypatch.setattr(billing_service.settings, "asaas_api_key", "test-asaas-key")
    _reset_profile(asaas_customer_id=None, asaas_subscription_id=None, subscription_status="trialing")

    with patch.object(billing_service.httpx, "post") as mock_post:
        resp = client.post(
            "/billing/subscribe",
            json={"name": "Terapeuta Cupom Teste", "cpfCnpj": "11144477735", "billingType": "PIX", "couponCode": "TESTNAOEXISTE"},
        )
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == "Cupom inválido"
    mock_post.assert_not_called()


def test_subscribe_retry_does_not_reconsume_coupon(monkeypatch):
    """Segunda chamada (assinatura já existe) não deve validar nem reconsumir
    o cupom, mesmo que ele já tenha expirado nesse meio tempo."""
    monkeypatch.setattr(billing_service.settings, "asaas_api_key", "test-asaas-key")
    monkeypatch.setattr(billing_service.settings, "asaas_plan_price", 98.90)
    _reset_profile(asaas_customer_id=None, asaas_subscription_id=None, subscription_status="trialing", coupon_code=None, subscription_value=None)

    db = SessionLocal()
    _make_coupon(db, code="TESTRETRY", discount_type="fixed", discount_value=10, max_uses=1)
    db.close()

    customer_resp, subscription_resp, payments_resp = _mock_asaas_responses(invoice_url="https://asaas.test/i/retry")
    try:
        with patch.object(billing_service.httpx, "post", side_effect=[customer_resp, subscription_resp]), patch.object(
            billing_service.httpx, "get", return_value=payments_resp
        ):
            resp1 = client.post(
                "/billing/subscribe",
                json={"name": "Terapeuta Cupom Teste", "cpfCnpj": "11144477735", "billingType": "PIX", "couponCode": "TESTRETRY"},
            )
        assert resp1.status_code == 200, resp1.text

        # Cupom esgota (max_uses=1, já usado 1x). Um retry (assinatura já existe)
        # não deveria nem tentar validar o cupom de novo.
        with patch.object(billing_service.httpx, "post") as mock_post_retry, patch.object(
            billing_service.httpx, "get", return_value=payments_resp
        ):
            resp2 = client.post(
                "/billing/subscribe",
                json={"name": "Terapeuta Cupom Teste", "cpfCnpj": "11144477735", "billingType": "PIX", "couponCode": "TESTRETRY"},
            )
        assert resp2.status_code == 200, resp2.text
        assert resp2.json()["invoiceUrl"] == "https://asaas.test/i/retry"
        mock_post_retry.assert_not_called()  # nem /customers nem /subscriptions foram chamados de novo

        db = SessionLocal()
        coupon = db.query(Coupon).filter(Coupon.code == "TESTRETRY").first()
        assert coupon.used_count == 1  # não subiu pra 2
        db.close()
    finally:
        db = SessionLocal()
        db.query(Coupon).filter(Coupon.code == "TESTRETRY").delete()
        db.commit()
        db.close()
