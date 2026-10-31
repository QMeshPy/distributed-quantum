import logging

from fastapi import FastAPI
from fastapi.testclient import TestClient

from quantum_backend_v2.api.errors import register_exception_handlers


def test_unhandled_error_records_type_and_route_without_secret_details(caplog):
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/items/{item_id}")
    def broken(item_id: str):
        raise RuntimeError("private-provider-credential")

    with caplog.at_level(logging.ERROR), TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/items/private-record-id?token=private-query-token")

    assert response.status_code == 500
    assert response.json()["error"] == "internal_error"
    assert "RuntimeError" in caplog.text
    assert "/items/{item_id}" in caplog.text
    assert "private-" not in caplog.text + response.text
