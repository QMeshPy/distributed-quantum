"""Exercise durable atomic claims against MongoDB in CI, without network storage."""

import asyncio
import os
import uuid

import pytest
from pymongo import AsyncMongoClient

from quantum_backend_v2.application.filecoin_archive import FilecoinOperations


@pytest.mark.anyio
async def test_real_mongo_serializes_agent_writes_and_recovers_confirmed_lock():
    uri = os.getenv("QMESH_TEST_MONGODB_URI")
    if not uri:
        pytest.skip("Set QMESH_TEST_MONGODB_URI for real Mongo integration")
    client = AsyncMongoClient(uri, serverSelectionTimeoutMS=5000)
    name = "qmesh_filecoin_test_" + uuid.uuid4().hex
    database = client[name]
    try:
        operations = FilecoinOperations(database.operations, database.locks)
        started, finish = asyncio.Event(), asyncio.Event()

        async def first():
            started.set()
            await finish.wait()
            return {"confirmed": "receipt"}

        arguments = dict(owner_id="alice", agent_id="agent", operation_id="one", payload={})
        task = asyncio.create_task(operations.execute(**arguments, action=first))
        await started.wait()
        with pytest.raises(ValueError, match="reconciliation"):
            await operations.execute(**{**arguments, "operation_id": "two"}, action=first)
        finish.set()
        assert await task == {"confirmed": "receipt"}
        row = await database.operations.find_one({"state": "confirmed"})
        await database.locks.insert_one({"_id": "agent", "operation_key": row["_id"]})
        await operations.recover_confirmed_lock("agent", "alice")
        assert await database.locks.count_documents({}) == 0
        assert await operations.execute(**arguments, action=first) == {"confirmed": "receipt"}
    finally:
        await client.drop_database(name)
        await client.close()
