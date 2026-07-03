"""Teste de ponta a ponta contra o Postgres local (alinha_dev), simulando um
usuário autenticado (sem precisar de um JWT real do Supabase)."""

import datetime
import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.auth import get_current_user_id
from app.core.database import SessionLocal
from app.main import app
from app.models.models import Profile
from app.routers.data import _TABLES_IN_DELETE_ORDER

TEST_USER_ID = uuid.uuid4()
client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def override_auth():
    app.dependency_overrides[get_current_user_id] = lambda: TEST_USER_ID
    yield
    del app.dependency_overrides[get_current_user_id]


@pytest.fixture(scope="module", autouse=True)
def profile_row():
    db = SessionLocal()
    db.add(
        Profile(
            id=TEST_USER_ID,
            name="Terapeuta Teste",
            work_days=["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        )
    )
    db.commit()
    db.close()
    yield
    db = SessionLocal()
    for model in _TABLES_IN_DELETE_ORDER:
        db.query(model).filter(model.owner_id == TEST_USER_ID).delete()
    db.query(Profile).filter(Profile.id == TEST_USER_ID).delete()
    db.commit()
    db.close()


def test_profile_roundtrip():
    resp = client.get("/profile")
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Terapeuta Teste"
    assert body["settings"]["agenda"]["workDays"] == ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]


def test_create_client_generates_recurring_appointments():
    today = datetime.date.today()
    week_days = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]
    fixed_day = week_days[today.weekday()] if today.weekday() < 5 else "Segunda"

    resp = client.post(
        "/clients",
        json={
            "name": "Cliente Semanal",
            "phone": "11999999999",
            "email": "cliente@example.com",
            "frequency": "Semanal",
            "day": fixed_day,
            "time": "10:00",
            "modality": "Presencial",
            "value": 200,
            "status": "ativo",
            "notes": "",
        },
    )
    assert resp.status_code == 200, resp.text
    client_id = resp.json()["id"]

    appts = client.get("/appointments").json()
    client_appts = [a for a in appts if a["clientId"] == client_id]
    # 4 semanas à frente (RECURRENCE_WEEKS_AHEAD) => pelo menos 4 ocorrências geradas
    assert len(client_appts) >= 4, f"esperado >=4 agendamentos recorrentes, veio {len(client_appts)}"


def test_finance_calculation_with_credit_surplus():
    resp = client.post(
        "/clients",
        json={"name": "Cliente Financeiro", "value": 200, "day": "-", "time": "-", "status": "ativo"},
    )
    client_id = resp.json()["id"]

    month_iso = datetime.date.today().replace(day=1).isoformat()
    client.put(
        "/payments",
        json={"clientId": client_id, "referenceMonthIso": month_iso, "sessions": 1, "status": "aberto"},
    )

    # Paga 300 num pacote devido de 200 -> excedente de 100 deve virar crédito.
    tx = client.post(
        "/payment-transactions",
        json={
            "clientId": client_id,
            "referenceMonthIso": month_iso,
            "amount": 300,
            "paymentDate": datetime.date.today().isoformat(),
            "paymentMethod": "PIX",
        },
    )
    assert tx.status_code == 200, tx.text

    fin = client.get(f"/finance/client/{client_id}", params={"month_iso": month_iso}).json()
    assert fin["due"] == 200
    assert fin["status"] == "pago"

    credits = {c["clientId"]: c["balance"] for c in client.get("/client-credits").json()}
    assert credits.get(client_id) == 100


def test_finance_summary_returns_camel_case():
    resp = client.get("/finance/summary", params={"month_iso": datetime.date.today().replace(day=1).isoformat()})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "totalRecebido" in body
    assert "totalAberto" in body
    assert "totalSessoes" in body
    assert "ticketMedio" in body
    assert "total_recebido" not in body


def test_bill_recurrence_and_overdue_status():
    past_due = (datetime.date.today() - datetime.timedelta(days=5)).isoformat()
    resp = client.post(
        "/bills",
        json={
            "name": "Aluguel",
            "category": "Aluguel",
            "amount": 1500,
            "dueDate": past_due,
            "status": "a-pagar",
            "seriesId": "serie-aluguel",
            "isFixed": True,
        },
    )
    assert resp.status_code == 200, resp.text

    bills = client.get("/bills").json()
    aluguel_bills = [b for b in bills if b["seriesId"] == "serie-aluguel"]
    # a conta original (vencida) deve estar 'atrasado', e deve ter gerado ocorrências futuras
    original = next(b for b in aluguel_bills if b["dueDate"] == past_due)
    assert original["status"] == "atrasado"
    assert len(aluguel_bills) >= 2


def test_prontuario_password_set_and_verify():
    resp = client.post("/profile/prontuario-password", json={"password": "segredo123"})
    assert resp.status_code == 200, resp.text

    wrong = client.post("/profile/prontuario-password/verify", json={"password": "senhaerrada"})
    assert wrong.json() == {"valid": False}

    right = client.post("/profile/prontuario-password/verify", json={"password": "segredo123"})
    assert right.json() == {"valid": True}


def test_prontuario_password_legacy_sha256_hash_still_works():
    """Contas migradas do app antigo têm o hash em SHA-256 (data.js), não bcrypt."""
    import hashlib

    from app.core.database import SessionLocal
    from app.models.models import Profile

    legacy_hash = hashlib.sha256("senhaAntiga".encode("utf-8")).hexdigest()
    db = SessionLocal()
    db.query(Profile).filter(Profile.id == TEST_USER_ID).update({"prontuario_password_hash": legacy_hash})
    db.commit()
    db.close()

    wrong = client.post("/profile/prontuario-password/verify", json={"password": "chuta"})
    assert wrong.json() == {"valid": False}

    right = client.post("/profile/prontuario-password/verify", json={"password": "senhaAntiga"})
    assert right.json() == {"valid": True}

    # depois de verificar com sucesso, o hash deve ter sido migrado pra bcrypt
    db = SessionLocal()
    profile = db.query(Profile).filter(Profile.id == TEST_USER_ID).first()
    assert profile.prontuario_password_hash.startswith("$2")
    db.close()

    # e continuar validando a mesma senha, agora via bcrypt
    still_right = client.post("/profile/prontuario-password/verify", json={"password": "senhaAntiga"})
    assert still_right.json() == {"valid": True}
