from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_clients_requires_auth():
    resp = client.get("/clients")
    assert resp.status_code in (401, 403)
