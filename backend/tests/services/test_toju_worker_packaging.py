import asyncio
import sys
from types import ModuleType
from unittest.mock import AsyncMock, MagicMock

import pytest

import services.toju_storage as toju


@pytest.mark.parametrize("installed", [False, True])
def test_upload_finds_worker_in_source_and_wheel(tmp_path, monkeypatch, installed):
    package_root = tmp_path / ("site-packages" if installed else "backend/src")
    worker_root = (
        package_root / "quantum_backend_v2/toju-client"
        if installed
        else tmp_path / "backend/toju-client"
    )
    worker_root.mkdir(parents=True)
    worker = worker_root / "worker.mjs"
    worker.write_text("// Worker path fixture\n")
    monkeypatch.setattr(toju, "__file__", str(package_root / "services/toju_storage.py"))
    monkeypatch.setenv("NETWORK", "base-sepolia")

    service = MagicMock()
    agentkit = ModuleType("services.agentkit_service")
    agentkit.AgentKitService = MagicMock(return_value=service)
    monkeypatch.setitem(sys.modules, "services.agentkit_service", agentkit)
    start_worker = AsyncMock(side_effect=RuntimeError("worker intercepted"))
    monkeypatch.setattr(toju.asyncio, "create_subprocess_exec", start_worker)
    db = MagicMock()
    db.wallets.find_one = AsyncMock(return_value={"default_address": "wallet"})

    with pytest.raises(RuntimeError, match="worker intercepted"):
        asyncio.run(toju.TojuStorage(db).upload(
            {"wallet_address": "wallet", "agent_id": "agent"}, receipt={"stored": True}
        ))

    assert start_worker.call_args.args[1] == str(worker)
    service.mongo_client.close.assert_called_once()
