"""Owner-scoped Filecoin agent accounts, explicit payments and resumable task jobs."""

from __future__ import annotations

import asyncio
import base64
import json
import uuid
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pymongo.errors import DuplicateKeyError

from quantum_backend_v2.application.filecoin_archive import (
    FilecoinOperations,
    JournaledFilecoinStore,
    export_run,
    prepare_run_export,
    verify_export,
)
from quantum_backend_v2.artifacts.filecoin import (
    MAX_BYTES,
    FilecoinBridgeError,
    FilecoinReceipt,
    FilecoinStore,
)
from quantum_backend_v2.provenance.hashing import hash_json


class AgentStoragePolicy(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    owner_id: str = Field(min_length=1)
    key_env: str = Field(pattern=r"^[A-Z][A-Z0-9_]{1,100}$")
    address: str = Field(pattern=r"^0x[0-9a-fA-F]{40}$")
    max_monthly_usdfc: Decimal = Field(default=Decimal("0.25"), gt=0, le=10)
    max_lockup_usdfc: Decimal = Field(default=Decimal("1"), gt=0, le=10)
    max_deposit_usdfc: Decimal = Field(default=Decimal("1"), gt=0, le=10)
    retention_days: int = Field(default=7, ge=1, le=30)


class FilecoinConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    enabled: bool = False
    chain_id: Literal[314159] = 314159
    agents: dict[str, AgentStoragePolicy] = Field(default_factory=dict)

    @model_validator(mode="after")
    def distinct_wallets(self) -> FilecoinConfig:
        addresses = [policy.address.lower() for policy in self.agents.values()]
        if len(set(addresses)) != len(addresses):
            raise ValueError("Each Filecoin agent must have a distinct wallet")
        return self

    @classmethod
    def from_env(cls, env: dict[str, str]) -> FilecoinConfig:
        return cls(
            enabled=env.get("QMESH_FILECOIN_ENABLED", "false").lower() == "true",
            chain_id=int(env.get("QMESH_FILECOIN_CHAIN_ID", "314159")),
            agents=json.loads(env.get("QMESH_FILECOIN_AGENTS", "{}")),
        )


class FilecoinService:
    def __init__(
        self, database: Any, config: FilecoinConfig, env: dict[str, str], *, dispatcher: Any
    ) -> None:
        self.database, self.config, self.env, self.dispatcher = database, config, env, dispatcher
        self.operations = FilecoinOperations(
            database["filecoin_operations"], database["filecoin_locks"]
        )
        # Readers never inherit an operator's signing key.
        reader_env = {k: v for k, v in env.items() if k != "QMESH_FILECOIN_PRIVATE_KEY"}
        self.reader = FilecoinStore(env=reader_env)

    async def verify(self, receipt: FilecoinReceipt):
        from quantum_backend_v2.config.models import NearRegistrySettings
        from quantum_backend_v2.provenance.near_registry import NearRegistryAdapter

        settings = NearRegistrySettings(
            contract_id=self.env.get("QB2_NEAR_REGISTRY_CONTRACT"),
            publisher_id=self.env.get("QB2_NEAR_REGISTRY_PUBLISHER"),
            rpc_url=self.env.get("QB2_NEAR_RPC_URL", "https://rpc.testnet.near.org"),
        )
        adapters = {"near:testnet": NearRegistryAdapter(settings)} if settings.configured else {}
        return await verify_export(await self.reader.download(receipt), anchor_adapters=adapters)

    async def accounts(self, owner_id: str) -> list[dict]:
        accounts = []
        for agent_id, policy in self.config.agents.items():
            if policy.owner_id != owner_id:
                continue
            agent = await self.database["ai_agents"].find_one(
                {"agent_id": agent_id, "owner_id": owner_id}
            )
            if agent is not None:
                accounts.append(
                    {
                        "agent_id": agent_id,
                        "agent_name": agent.get("agent_name", agent_id),
                        **policy.model_dump(mode="json", exclude={"owner_id", "key_env"}),
                    }
                )
        return accounts

    async def artifacts(self, owner_id: str) -> list[dict]:
        return (
            await self.operations.collection.find(
                {"owner_id": owner_id},
                {
                    "_id": 0,
                    "operation_id": 1,
                    "agent_id": 1,
                    "state": 1,
                    "created_at": 1,
                    "result": 1,
                    "submitted_receipt": 1,
                    "transaction_hashes": 1,
                    "error_code": 1,
                },
            )
            .sort("created_at", -1)
            .limit(50)
            .to_list(length=50)
        )

    async def account(
        self, agent_id: str, owner_id: str
    ) -> tuple[AgentStoragePolicy, FilecoinStore]:
        policy = self.config.agents.get(agent_id)
        if policy is None or policy.owner_id != owner_id:
            raise LookupError("Configured Filecoin agent not found")
        agent = await self.database["ai_agents"].find_one(
            {"agent_id": agent_id, "owner_id": owner_id}
        )
        if agent is None:
            raise LookupError("Agent not found")
        key = self.env.get(policy.key_env)
        if not key:
            raise ValueError("Filecoin agent signing key is not configured")
        env = {
            **self.env,
            "QMESH_FILECOIN_PRIVATE_KEY": key,
            "QMESH_FILECOIN_EXPECTED_ADDRESS": policy.address,
        }
        return policy, FilecoinStore(
            env=env,
            retention_days=policy.retention_days,
            max_monthly_usdfc=str(policy.max_monthly_usdfc),
            max_lockup_usdfc=str(policy.max_lockup_usdfc),
        )

    async def upload(
        self, *, agent_id: str, owner_id: str, operation_id: str, data: bytes
    ) -> FilecoinReceipt:
        if not 127 <= len(data) <= MAX_BYTES:
            raise ValueError("Artifact must be 127 bytes to 16 MiB; package smaller files")
        _, store = await self.account(agent_id, owner_id)

        async def action() -> dict:
            return (await store.upload(data)).model_dump(mode="json")

        result = await self.operations.execute(
            owner_id=owner_id,
            agent_id=agent_id,
            operation_id=operation_id,
            payload={"upload": base64.b64encode(data).decode()},
            action=action,
        )
        return FilecoinReceipt.model_validate(result)

    async def export(
        self, *, agent_id: str, owner_id: str, operation_id: str, run_id: str
    ) -> FilecoinReceipt:
        _, store = await self.account(agent_id, owner_id)
        existing = await self.operations.collection.find_one(
            {"_id": hash_json([owner_id, agent_id, operation_id])}
        )
        prepared = (
            None
            if existing and existing["state"] == "confirmed"
            else await prepare_run_export(run_id, owner_id=owner_id)
        )

        async def action() -> dict:
            return (
                await export_run(run_id, owner_id=owner_id, store=store, prepared=prepared)
            ).model_dump(mode="json")

        result = await self.operations.execute(
            owner_id=owner_id,
            agent_id=agent_id,
            operation_id=operation_id,
            payload={"archive_run": run_id},
            action=action,
        )
        return FilecoinReceipt.model_validate(result)

    async def payment(
        self,
        *,
        agent_id: str,
        owner_id: str,
        operation_id: str | None,
        action: str,
        amount_usdfc: Decimal | None = None,
        data_set_id: str | None = None,
    ) -> dict:
        policy, store = await self.account(agent_id, owner_id)
        arguments: dict[str, Any] = {"action": action}
        if action == "balance":
            return await store.command("payments", action="balance")
        if action in {"deposit", "withdraw"}:
            if amount_usdfc is None or not 0 < amount_usdfc <= policy.max_deposit_usdfc:
                raise ValueError("Amount exceeds the configured test-token budget")
            arguments["amount_usdfc"] = str(amount_usdfc)
        elif action == "approve":
            arguments.update(
                max_monthly_usdfc=str(policy.max_monthly_usdfc),
                max_lockup_usdfc=str(policy.max_lockup_usdfc),
                max_lockup_days=30,
            )
        elif action == "terminate":
            if data_set_id is None or not data_set_id.isdecimal():
                raise ValueError("A decimal data set ID is required")
            arguments["data_set_id"] = data_set_id
        elif action != "revoke":
            raise ValueError("Unsupported payment action")
        if not operation_id:
            raise ValueError("Writes require an operation ID")
        return await self.operations.execute(
            owner_id=owner_id,
            agent_id=agent_id,
            operation_id=operation_id,
            payload=arguments,
            action=lambda: store.command("payments", **arguments),
        )

    async def recover_tasks(self) -> None:
        await self.database["filecoin_task_runs"].update_many(
            {"state": "running", "lease_until": {"$lte": datetime.now(timezone.utc)}},
            {"$set": {"state": "interrupted"}},
        )

    async def task(self, run_id: str, owner_id: str) -> dict | None:
        row = await self.database["filecoin_task_runs"].find_one(
            {"_id": hash_json([owner_id, run_id])}
        )
        return (
            {key: value for key, value in row.items() if key not in {"_id", "lease_token"}}
            if row
            else None
        )

    async def prepare_tasks(
        self, *, run_id: str, owner_id: str, agent_id: str, dataset: FilecoinReceipt
    ) -> str:
        await self.account(agent_id, owner_id)
        key = hash_json([owner_id, run_id])
        row = {
            "_id": key,
            "run_id": run_id,
            "owner_id": owner_id,
            "agent_id": agent_id,
            "dataset": dataset.model_dump(mode="json"),
            "state": "ready",
            "checkpoint": None,
        }
        try:
            await self.database["filecoin_task_runs"].insert_one(row)
        except DuplicateKeyError:
            existing = await self.database["filecoin_task_runs"].find_one({"_id": key})
            if existing["dataset"] != row["dataset"] or existing["agent_id"] != agent_id:
                raise ValueError("Run ID already binds different inputs or agent") from None
        now, token = datetime.now(timezone.utc), uuid.uuid4().hex
        claimed = await self.database["filecoin_task_runs"].update_one(
            {
                "_id": key,
                "$or": [
                    {"state": {"$in": ["ready", "interrupted", "failed"]}},
                    {"state": "running", "lease_until": {"$lte": now}},
                ],
            },
            {
                "$set": {
                    "state": "running",
                    "error": None,
                    "lease_token": token,
                    "lease_until": now + timedelta(seconds=90),
                    "updated_at": now,
                }
            },
        )
        if not claimed.modified_count:
            raise ValueError("Run is already running or completed")
        return f"{key}:{token}"

    async def execute_tasks(self, claim: str) -> None:
        from dataclasses import asdict

        from quantum_backend_v2.application.compute_tasks import TASK_KINDS
        from quantum_backend_v2.application.filecoin_tasks import (
            CheckpointPersistenceError,
            resolve_inputs,
        )

        key, token = claim.rsplit(":", 1)
        collection = self.database["filecoin_task_runs"]

        def active() -> dict:
            return {
                "_id": key,
                "state": "running",
                "lease_token": token,
                "lease_until": {"$gt": datetime.now(timezone.utc)},
            }

        row = await collection.find_one(active())
        if row is None:
            return
        current = asyncio.current_task()
        assert current is not None

        async def renew() -> None:
            try:
                while True:
                    await asyncio.sleep(20)
                    updated = await collection.update_one(
                        active(),
                        {
                            "$set": {
                                "lease_until": datetime.now(timezone.utc) + timedelta(seconds=90)
                            }
                        },
                    )
                    if not updated.matched_count:
                        current.cancel()
                        return
            except Exception:
                current.cancel()

        heartbeat = asyncio.create_task(renew())
        try:
            _, store = await self.account(row["agent_id"], row["owner_id"])
            scope = f"tasks:{row['owner_id']}:{row['run_id']}"
            operation_scope = {
                "owner_id": row["owner_id"],
                "agent_id": row["agent_id"],
                "scope": scope,
            }
            await self.operations.recover_confirmed_lock(row["agent_id"], row["owner_id"])
            if await self.operations.collection.find_one(
                {**operation_scope, "state": {"$in": ["started", "uncertain"]}}
            ) or await self.operations.locks.find_one({"_id": row["agent_id"]}):
                raise ValueError("Checkpoint operation needs reconciliation before resuming")
            # The operation journal commits before the task callback; it survives that crash gap.
            confirmed = await self.operations.collection.find_one(
                {**operation_scope, "state": "confirmed"},
                sort=[("created_at", -1), ("_id", -1)],
            )
            saved = confirmed["result"] if confirmed else row["checkpoint"]
            saved_receipt = FilecoinReceipt.model_validate(saved) if saved else None

            async def before_upload() -> None:
                renewed = await collection.update_one(
                    active(),
                    {"$set": {"lease_until": datetime.now(timezone.utc) + timedelta(seconds=90)}},
                )
                if not renewed.matched_count:
                    raise FilecoinBridgeError({"code": "lease_expired", "uncertain": False})

            journaled = JournaledFilecoinStore(
                store,
                self.operations,
                owner_id=row["owner_id"],
                agent_id=row["agent_id"],
                operation_prefix=scope,
                before_upload=before_upload,
            )
            dataset = FilecoinReceipt.model_validate(row["dataset"])
            inputs = await resolve_inputs("pharma.vqe", None, journaled, dataset)
            for value in inputs:
                validate_vqe_input(value)
            if not 1 <= len(inputs) <= 16:
                raise ValueError("Task datasets require 1 to 16 inputs")

            async def checkpoint(receipt: FilecoinReceipt) -> None:
                updated = await collection.update_one(
                    active(),
                    {
                        "$set": {
                            "checkpoint": receipt.model_dump(mode="json"),
                            "updated_at": datetime.now(timezone.utc),
                        }
                    },
                )
                if not updated.matched_count:
                    raise ValueError("Task coordinator lease expired")

            if saved_receipt is not None:
                await checkpoint(saved_receipt)
            outcomes = await self.dispatcher.run(
                "pharma.vqe",
                inputs,
                run_locally=TASK_KINDS["pharma.vqe"],
                filecoin_store=journaled,
                checkpoint_namespace=key,
                checkpoint_receipt=saved_receipt,
                on_checkpoint=checkpoint,
            )
            await collection.update_one(
                active(),
                {
                    "$set": {
                        "state": "completed",
                        "outcomes": [asdict(item) if item else None for item in outcomes],
                    }
                },
            )
        except asyncio.CancelledError:
            with suppress(Exception):
                await collection.update_one(
                    active(), {"$set": {"state": "interrupted", "error": "CoordinatorInterrupted"}}
                )
            raise
        except Exception as exc:
            failure: dict[str, Any] = {"state": "failed", "error": type(exc).__name__}
            if isinstance(exc, CheckpointPersistenceError) and exc.receipt is not None:
                failure["checkpoint"] = exc.receipt.model_dump(mode="json")
            await collection.update_one(active(), {"$set": failure})
        finally:
            heartbeat.cancel()
            with suppress(asyncio.CancelledError):
                await heartbeat


def validate_vqe_input(value: dict) -> None:
    """Bound the public task endpoint before expensive local or remote execution."""
    import math

    problem = value.get("problem", {})
    qubits, electrons = problem.get("n_qubits"), problem.get("n_electrons")
    iterations, terms = value.get("max_iterations"), problem.get("terms")
    if (
        type(qubits) is not int
        or not 2 <= qubits <= 8
        or type(electrons) is not int
        or not 0 < electrons < qubits
        or type(iterations) is not int
        or not 1 <= iterations <= 200
        or not isinstance(terms, list)
        or not 1 <= len(terms) <= 4096
    ):
        raise ValueError("Invalid or oversized pharma VQE task")
    for term in terms:
        if (
            not isinstance(term, list)
            or len(term) != 2
            or not isinstance(term[0], str)
            or len(term[0]) != qubits
            or set(term[0]) - set("IXYZ")
            or type(term[1]) not in (float, int)
            or not math.isfinite(term[1])
        ):
            raise ValueError("Invalid Hamiltonian term")
    seed = value.get("seed")
    if seed is not None and (type(seed) is not int or not 0 <= seed < 2**32):
        raise ValueError("Invalid random seed")
