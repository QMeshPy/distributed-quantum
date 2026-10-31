"""Service configuration and client ownership checks without external services."""

import importlib
import io
import json
from unittest.mock import AsyncMock, MagicMock, Mock

import pytest

from quantum_backend_v2.chains.loader import load_chain_registry

SERVICES = [
    ("agentkit_service", "AgentKitService"),
    ("ai_agent_service", "AIAgentService"),
    ("proposal_service", "ProposalService"),
    ("marketplace_service", "MarketplaceService"),
    ("notification_service", "NotificationService"),
]


@pytest.fixture
def isolated_settings(monkeypatch):
    monkeypatch.setattr("quantum_backend_v2.config.loader._load_env_file", lambda _: {})
    for key in (
        "QB2_MONGODB_TARGET", "QB2_MONGODB_LOCAL_URI", "QB2_MONGODB_REMOTE_URI",
        "QB2_MONGODB_DATABASE",
    ):
        monkeypatch.delenv(key, raising=False)


def make_service(monkeypatch, module_name, class_name, **kwargs):
    module = importlib.import_module(f"services.{module_name}")
    mongo = MagicMock()
    monkeypatch.setattr(module, "AsyncIOMotorClient", mongo)
    if class_name == "AgentKitService":
        kwargs["registry"] = load_chain_registry()
    elif class_name == "MarketplaceService":
        kwargs["agentkit_service"] = Mock()
    elif class_name == "ProposalService":
        monkeypatch.setattr(module.boto3, "client", Mock())
    elif class_name == "NotificationService":
        monkeypatch.setattr(module.httpx, "AsyncClient", Mock(return_value=AsyncMock()))
    return getattr(module, class_name)(**kwargs), mongo


@pytest.mark.parametrize("module_name,class_name", SERVICES)
@pytest.mark.parametrize("database", [None, "existing_qds"])
def test_services_follow_selected_mongodb(
    monkeypatch, isolated_settings, module_name, class_name, database
):
    monkeypatch.setenv("QB2_MONGODB_TARGET", "remote")
    monkeypatch.setenv("QB2_MONGODB_LOCAL_URI", "mongodb://local.example:27017")
    monkeypatch.setenv("QB2_MONGODB_REMOTE_URI", "mongodb://remote.example:27017")
    if database:
        monkeypatch.setenv("QB2_MONGODB_DATABASE", database)
    service, mongo = make_service(monkeypatch, module_name, class_name)
    mongo.assert_called_once_with("mongodb://remote.example:27017")
    mongo.return_value.__getitem__.assert_called_once_with(database or "quantum_backend_v2")
    assert service.db is mongo.return_value.__getitem__.return_value


@pytest.mark.parametrize("module_name,class_name", SERVICES)
def test_missing_selected_mongodb_does_not_fall_back_to_localhost(
    monkeypatch, isolated_settings, module_name, class_name
):
    monkeypatch.setenv("QB2_MONGODB_TARGET", "remote")
    monkeypatch.setenv("QB2_MONGODB_LOCAL_URI", "mongodb://local.example:27017")
    with pytest.raises(ValueError, match="QB2_MONGODB_REMOTE_URI"):
        make_service(monkeypatch, module_name, class_name)


def test_marketplace_preserves_explicit_database(monkeypatch, isolated_settings):
    _, mongo = make_service(
        monkeypatch, "marketplace_service", "MarketplaceService",
        mongodb_uri="mongodb://override.example:27017", mongodb_database="existing_qds",
    )
    mongo.assert_called_once_with("mongodb://override.example:27017")
    mongo.return_value.__getitem__.assert_called_once_with("existing_qds")


@pytest.mark.anyio
async def test_bedrock_is_created_only_on_first_use(monkeypatch, isolated_settings):
    monkeypatch.setenv("QB2_MONGODB_LOCAL_URI", "mongodb://local.example:27017")
    service, _ = make_service(monkeypatch, "proposal_service", "ProposalService")
    module = importlib.import_module("services.proposal_service")
    factory = module.boto3.client
    factory.assert_not_called()
    assert service.bedrock is None
    factory.return_value.invoke_model.side_effect = lambda **_: {
        "body": io.BytesIO(json.dumps({"content": [{"text": "result"}]}).encode())
    }
    assert await service._call_bedrock("prompt") == "result"
    assert await service._call_bedrock("prompt") == "result"
    factory.assert_called_once_with("bedrock-runtime", region_name=service.aws_region)


@pytest.mark.anyio
async def test_notifications_reuse_and_close_the_owned_database(monkeypatch):
    from api.v1.notifications import get_db
    from services import notification_service as module

    service = AsyncMock()
    monkeypatch.setattr(module, "_notification_service", service)
    factory = Mock(side_effect=AssertionError("unexpected notification client"))
    monkeypatch.setattr(module, "NotificationService", factory)
    assert get_db() is service.db
    assert get_db() is service.db
    await module.close_notification_service()
    service.close.assert_awaited_once()
    assert module._notification_service is None
    await module.close_notification_service()
    factory.assert_not_called()


@pytest.mark.anyio
async def test_notification_close_releases_mongodb_if_http_close_fails():
    from services.notification_service import NotificationService

    service = NotificationService.__new__(NotificationService)
    service.http_client = AsyncMock()
    service.http_client.aclose.side_effect = RuntimeError("close failed")
    service.mongo_client = Mock()
    with pytest.raises(RuntimeError, match="close failed"):
        await service.close()
    service.mongo_client.close.assert_called_once()
