"""Immutable, owner-scoped Toju export proposals. The model can prepare, never approve."""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from pymongo import ReturnDocument
from quantum_backend_v2.config import constants as C

NETWORK = "eip155:84532"
USDC = "0x036cbd53842c5426634e7929541ec2318f3dcf7e"


def cdp_typed_data(data):
    # CDP requires the domain type that viem deliberately infers and omits.
    return {**data, "types": {**data["types"], "EIP712Domain": [
        {"name": "name", "type": "string"}, {"name": "version", "type": "string"},
        {"name": "chainId", "type": "uint256"}, {"name": "verifyingContract", "type": "address"},
    ]}}


class TojuStorage:
    def __init__(self, db):
        self.db = db
        self.exports = db.toju_exports
        self.endpoint = os.getenv("TOJU_API_URL", C.TOJU_API_URL).rstrip("/")

    async def owned_session(self, owner, agent, session):
        a = await self.db.ai_agents.find_one({"agent_id": agent, "owner_id": owner})
        s = await self.db.chat_sessions.find_one({"session_id": session, "user_id": owner, "agent_id": agent})
        if not a or not s:
            raise ValueError("A saved chat session belonging to this user and agent is required.")
        return a

    async def quote(self, size):
        async with httpx.AsyncClient(timeout=60, follow_redirects=False) as client:
            response = await client.get(self.endpoint + "/pricing/quote", params={"size": size, "duration": 30, "chain": "base"})
        if response.status_code != 200:
            raise ValueError(f"Toju testnet quote unavailable (HTTP {response.status_code}). Nothing was uploaded or paid.")
        data = response.json()
        q = data["quote"]
        recipient = os.getenv("TOJU_PAYMENT_RECIPIENT", "")
        expected = str((size * 30 * 3 + 999999) // 1000000)
        if (data.get("network") != NETWORK or data.get("asset", "").lower() != USDC
                or not re.fullmatch(r"0x[0-9a-fA-F]{40}", recipient)
                or data.get("payTo", "").lower() != recipient.lower()
                or q.get("atomic") != expected or not 1 <= int(expected) <= 24):
            raise ValueError("Toju quote differs from the configured testnet payment policy.")
        return {"amount": expected, "usdc": f"{int(expected)/1_000_000:.6f}", "payTo": recipient}

    @staticmethod
    def public(row):
        return {k: (v.replace(tzinfo=timezone.utc) if isinstance(v, datetime) and v.tzinfo is None else v) for k, v in row.items() if k not in {"_id", "owner_id", "wallet_address"}}

    async def list(self, owner, agent, session):
        await self.owned_session(owner, agent, session)
        rows = await self.exports.find({"owner_id": owner, "agent_id": agent, "session_id": session}).sort("created_at", -1).limit(20).to_list(20)
        return [self.public(r) for r in rows]

    async def prepare(self, owner, agent, session, content, title, run_id=None, message_index=None):
        a = await self.owned_session(owner, agent, session)
        mime, filename = "text/markdown", "report.md"
        if run_id:
            run = await self.db.workflow_runs.find_one({"_id": run_id, "owner_user_id": owner})
            if not run:
                raise ValueError("Run not found or not owned by this user.")
            allowed = ("_id", "workflow_type", "status", "input_snapshot", "output_snapshot", "fragment_count", "completed_fragments", "failed_fragments", "created_at", "completed_at")
            content = json.dumps({k: run[k] for k in allowed if k in run}, indent=2, default=str)
            mime, filename = "application/json", "run.json"
        if not isinstance(content, str) or not 1 <= len(content.encode()) <= 262144:
            raise ValueError("Export must contain 1–262144 bytes.")
        price = await self.quote(len(content.encode()))
        now = datetime.now(timezone.utc)
        row = {"_id": str(uuid.uuid4()), "owner_id": owner, "agent_id": agent, "session_id": session,
               "title": str(title)[:100], "content": content, "mime": mime, "filename": filename,
               "sha256": hashlib.sha256(content.encode()).hexdigest(), "bytes": len(content.encode()),
               "wallet_address": a["wallet_address"], "network": NETWORK, "duration_days": 30,
               "status": "pending", "created_at": now, "expires_at": now + timedelta(minutes=15), "message_index": message_index, **price}
        row["id"] = row["_id"]
        await self.exports.create_index([("owner_id", 1), ("session_id", 1)], unique=True, partialFilterExpression={"status": "pending"})
        await self.exports.update_many({"owner_id": owner, "session_id": session, "status": "pending"}, {"$set": {"status": "superseded"}})
        await self.exports.insert_one(row)
        return self.public(row)

    async def decide(self, owner, agent, session, proposal_id, decision, sha256):
        await self.owned_session(owner, agent, session)
        identity = {"_id": proposal_id, "owner_id": owner, "agent_id": agent, "session_id": session}
        existing = await self.exports.find_one(identity)
        if not existing or existing["sha256"] != sha256 or decision not in {"approve", "cancel", "reconcile"}:
            raise ValueError("Export approval does not match this user's proposal.")
        if decision == "reconcile":
            if existing["status"] != "uncertain":
                return self.public(existing)
            async with httpx.AsyncClient(timeout=60, follow_redirects=False) as client:
                response = await client.get(self.endpoint + "/upload/agent/receipt/" + proposal_id)
            if response.status_code != 200:
                raise ValueError("No settled receipt is available yet. No new payment was attempted.")
            stored = response.json()
            if stored.get("status") != "stored" or not stored.get("transaction"):
                raise ValueError("Toju has not recorded a settled payment for this export. Its file may already be pinned. No new payment was attempted; keep this export ID for investigation.")
            receipt = await self.upload(existing, receipt=stored)
            await self.exports.update_one(identity, {"$set": {"status": "stored", "receipt": receipt}, "$unset": {"error": ""}})
            return self.public({**existing, "status": "stored", "receipt": receipt, "error": None})
        if existing["status"] != "pending":
            return self.public(existing)
        now = datetime.now(timezone.utc)
        row = await self.exports.find_one_and_update({**identity, "status": "pending", "expires_at": {"$gt": now}}, {"$set": {"status": "uploading" if decision == "approve" else "cancelled", "decided_at": now}}, return_document=ReturnDocument.AFTER)
        if not row:
            await self.exports.update_one({**identity, "status": "pending", "expires_at": {"$lte": now}}, {"$set": {"status": "expired"}})
            return self.public(await self.exports.find_one(identity))
        if decision == "cancel":
            return self.public(row)
        try:
            receipt = await self.upload(row)
            update = {"status": "stored", "receipt": receipt}
        except Exception as exc:
            detail = str(exc)
            safe_detail = detail if re.fullmatch(r"Storage settlement not verified \(HTTP \d{3}; [a-zA-Z0-9_:-]{1,100}\)\. Do not pay again; check receipt\.", detail) else "Upload or payment could not be verified. Do not pay again; reconcile this export ID with the storage service."
            update = {"status": "uncertain", "error": safe_detail}
        await self.exports.update_one(identity, {"$set": update})
        return self.public({**row, **update})

    async def upload(self, row, receipt=None):
        from services.agentkit_service import AgentKitService
        wallet = await self.db.wallets.find_one({"default_address": row["wallet_address"], "entity_id": row["agent_id"], "network": "base-sepolia"})
        if not wallet or os.getenv("NETWORK", C.WALLET_NETWORK) != "base-sepolia":
            raise ValueError("Agent's Base Sepolia wallet is required.")
        service = AgentKitService()
        try:
            provider = None if receipt else await service._load_wallet(row["wallet_address"])
            worker = Path(__file__).resolve().parents[2] / "toju-client/worker.mjs"
            proc = await asyncio.create_subprocess_exec(os.getenv("TOJU_NODE_BINARY", "node"), str(worker), stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, limit=1024*1024)
            try:
                payload = {k: row[k] for k in ("id", "content", "filename", "mime", "sha256", "amount", "payTo")}
                payload.update(endpoint=self.endpoint, address=row["wallet_address"])
                if receipt:
                    payload["receipt"] = receipt
                proc.stdin.write((json.dumps(payload) + "\n").encode())
                await proc.stdin.drain()
                signed = False
                async with asyncio.timeout(240):
                    while line := await proc.stdout.readline():
                        event = json.loads(line)
                        if event.get("event") == "sign":
                            if signed or receipt:
                                raise ValueError("Only one signature is authorized.")
                            data = event["data"]
                            d, m = data["domain"], data["message"]
                            now = datetime.now(timezone.utc).timestamp()
                            if (int(d["chainId"]) != 84532 or d["verifyingContract"].lower() != USDC
                                    or d["name"] != "USDC" or d["version"] != "2"
                                    or data["primaryType"] != "TransferWithAuthorization"
                                    or m["from"].lower() != row["wallet_address"].lower()
                                    or m["to"].lower() != row["payTo"].lower() or str(m["value"]) != row["amount"]
                                    or not 0 <= int(m["validAfter"]) <= now
                                    or not now < int(m["validBefore"]) <= now + 180):
                                raise ValueError("Unapproved signature.")
                            signed = True
                            signature = await asyncio.to_thread(provider.sign_typed_data, cdp_typed_data(data))
                            proc.stdin.write((json.dumps({"signature": signature}) + "\n").encode())
                            await proc.stdin.drain()
                        elif event.get("event") == "complete":
                            return event["receipt"]
                        else:
                            raise ValueError(event.get("error", "Storage worker could not verify completion."))
                    raise ValueError("Storage worker stopped.")
            finally:
                if proc.returncode is None:
                    proc.kill()
                await proc.wait()
        finally:
            service.mongo_client.close()
