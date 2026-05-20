"""Seed 6 demo marketplace agents into the worker_pricing collection.

Usage:
    python backend/scripts/seed_marketplace_agents.py
"""

from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

AGENTS = [
    {
        "agent_name": "QuantumCircuit-7",
        "specialty": "Quantum Computing",
        "description": "Optimizes quantum circuits for minimal gate depth",
        "price_per_task": 0.001,
        "status": "available",
        "rating": 4.9,
    },
    {
        "agent_name": "BioSynth-Alpha",
        "specialty": "Drug Discovery",
        "description": "Screens molecular candidates against protein targets",
        "price_per_task": 0.002,
        "status": "available",
        "rating": 4.8,
    },
    {
        "agent_name": "RiskMatrix-3",
        "specialty": "Finance",
        "description": "Monte Carlo risk analysis on DeFi portfolios",
        "price_per_task": 0.001,
        "status": "available",
        "rating": 4.7,
    },
    {
        "agent_name": "DataWeave-X",
        "specialty": "Data Analysis",
        "description": "Cleans, normalizes and visualizes research datasets",
        "price_per_task": 0.0,
        "status": "available",
        "rating": 4.6,
    },
    {
        "agent_name": "LitReview-9",
        "specialty": "Research",
        "description": "Summarizes scientific papers and extracts key findings",
        "price_per_task": 0.0,
        "status": "available",
        "rating": 4.8,
    },
    {
        "agent_name": "ProposalGrader",
        "specialty": "Evaluation",
        "description": "Scores funding proposals on feasibility and impact",
        "price_per_task": 0.001,
        "status": "available",
        "rating": 4.7,
    },
]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def seed() -> None:
    mongodb_uri = os.getenv("QB2_MONGODB_LOCAL_URI", "mongodb://127.0.0.1:27017")
    mongodb_database = os.getenv("QB2_MONGODB_DATABASE", "qds")

    client = AsyncIOMotorClient(mongodb_uri)
    db = client[mongodb_database]
    collection = db["worker_pricing"]

    inserted = 0
    skipped = 0

    for agent_data in AGENTS:
        agent_id = str(uuid.uuid4())
        now = _utc_now()

        doc = {
            "worker_id": agent_id,
            "agent_id": agent_id,
            "agent_name": agent_data["agent_name"],
            "specialty": agent_data["specialty"],
            "description": agent_data["description"],
            "price_per_task": agent_data["price_per_task"],
            "pricing_per_task": str(agent_data["price_per_task"]),
            "status": agent_data["status"],
            "rating": agent_data["rating"],
            # worker_pricing required fields
            "wallet_address": "0x0000000000000000000000000000000000000000",
            "pricing": {"custom": agent_data["price_per_task"]},
            "performance_tier": "gold",
            "reputation_score": agent_data["rating"] * 20,  # scale 0-5 to 0-100
            "total_tasks": 0,
            "total_earned": "0",
            "jobs_completed": 0,
            "is_active": True,
            "published_at": now,
            "updated_at": now,
        }

        existing = await collection.find_one({"agent_name": agent_data["agent_name"]})
        if existing:
            print(f"  [skip] {agent_data['agent_name']} already exists")
            skipped += 1
            continue

        await collection.insert_one(doc)
        print(f"  [ok]   {agent_data['agent_name']} inserted (id={agent_id})")
        inserted += 1

    client.close()
    print(f"\nDone. Inserted: {inserted}, Skipped: {skipped}")


if __name__ == "__main__":
    asyncio.run(seed())
