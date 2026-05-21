"""Seed demo proposals, dummy users, wallets, and notifications into MongoDB.

This script populates the database so the Proposals page and Notifications
system show rich demo data for screencasts — all with very small USDC amounts
(0.001 – 0.01) so nothing real is spent.

Usage:
    python backend/scripts/seed_proposals.py

The script is idempotent: it skips documents it already created (matched by
proposal title or notification type+user).

Current authenticated user (dev-local) receives notifications for every
proposal so the bell icon shows a non-zero count.
"""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from bson import Decimal128
from motor.motor_asyncio import AsyncIOMotorClient

# ─── configuration ────────────────────────────────────────────────────────

MONGODB_URI = os.getenv("QB2_MONGODB_LOCAL_URI", "mongodb://127.0.0.1:27017")
MONGODB_DB  = os.getenv("QB2_MONGODB_DATABASE", "qds")

# The user_id used when QB2_AUTH_REQUIRED=false (see auth.py dev bypass)
DEMO_USER_ID = "dev-local"
DEMO_USER_EMAIL = "dev@localhost"

# ─── helpers ──────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)

def _dec128(v) -> Decimal128:
    return Decimal128(str(v))

def _future(days: int) -> datetime:
    return _now() + timedelta(days=days)

# ─── dummy researchers (other users on the platform) ──────────────────────

RESEARCHERS = [
    {
        "user_id": "researcher-alice",
        "name": "Dr. Alice Chen",
        "email": "alice@quantumlab.io",
        "specialty": "Drug Discovery",
        "wallet_address": "0xAA00000000000000000000000000000000000001",
    },
    {
        "user_id": "researcher-bob",
        "name": "Dr. Bob Nakamura",
        "email": "bob@finquant.io",
        "specialty": "Financial Modelling",
        "wallet_address": "0xBB00000000000000000000000000000000000002",
    },
    {
        "user_id": "researcher-carol",
        "name": "Dr. Carol Osei",
        "email": "carol@qresearch.io",
        "specialty": "Quantum Error Correction",
        "wallet_address": "0xCC00000000000000000000000000000000000003",
    },
]

# ─── proposals ────────────────────────────────────────────────────────────

def _make_drug_discovery_proposal(researcher: dict) -> dict:
    pid = str(uuid.uuid4())
    budget = Decimal("0.009")
    raised  = Decimal("0.004")
    thresh  = budget * Decimal("0.7")
    return {
        "proposal_id": pid,
        "title": "Quantum-Accelerated Protein Folding for EGFR Inhibitor Discovery",
        "description": (
            "We propose using variational quantum eigensolvers (VQE) distributed "
            "across the network to simulate protein–ligand binding free energies for "
            "EGFR kinase inhibitors.  Classical MD simulations are prohibitively slow "
            "for the conformational space of this target; quantum amplitude estimation "
            "can yield a 40× speedup on the scoring function.\n\n"
            "This research directly impacts non-small-cell lung cancer treatment and "
            "could identify novel covalent inhibitors within weeks rather than years."
        ),
        "methodology": (
            "1. Encode EGFR active-site coordinates into qubit Hamiltonians.\n"
            "2. Run distributed VQE across ≥4 network nodes.\n"
            "3. Compare binding affinities against ChEMBL reference compounds.\n"
            "4. Rank top-10 candidates for in-vitro validation."
        ),
        "researcher_id": researcher["user_id"],
        "researcher_wallet": researcher["wallet_address"],
        "budget_required": _dec128(budget),
        "budget_raised":   _dec128(raised),
        "funding_threshold": _dec128(thresh),
        "deadline": _future(25),
        "status": "active",
        "tags": ["drug-discovery", "vqe", "protein-folding", "oncology"],
        "fragments": [
            {
                "fragment_id": str(uuid.uuid4()),
                "title": "Hamiltonian Encoding Module",
                "description": "Encode EGFR binding pocket into qubit Hamiltonian representation.",
                "budget_allocated": "0.003",
                "status": "unclaimed",
                "claimed_by": None,
                "claimed_at": None,
            },
            {
                "fragment_id": str(uuid.uuid4()),
                "title": "Distributed VQE Execution",
                "description": "Run VQE circuit on ≥4 nodes and aggregate energy estimates.",
                "budget_allocated": "0.004",
                "status": "claimed",
                "claimed_by": "dev-local",
                "claimed_at": _now() - timedelta(hours=3),
            },
            {
                "fragment_id": str(uuid.uuid4()),
                "title": "Binding Affinity Ranking",
                "description": "Score and rank top candidates against ChEMBL reference set.",
                "budget_allocated": "0.002",
                "status": "unclaimed",
                "claimed_by": None,
                "claimed_at": None,
            },
        ],
        "funders": [
            {
                "funder_id": DEMO_USER_ID,
                "funder_type": "user",
                "wallet_address": "0xDEV000000000000000000000000000000000001",
                "amount_usdc": _dec128("0.003"),
                "funded_at": _now() - timedelta(hours=5),
            },
            {
                "funder_id": "researcher-carol",
                "funder_type": "user",
                "wallet_address": RESEARCHERS[2]["wallet_address"],
                "amount_usdc": _dec128("0.001"),
                "funded_at": _now() - timedelta(hours=2),
            },
        ],
        "escrow_type": "simple",
        "aave_pool_address": None,
        "results_ipfs_hash": None,
        "created_at": _now() - timedelta(days=3),
        "updated_at": _now() - timedelta(hours=2),
    }


def _make_finance_proposal(researcher: dict) -> dict:
    pid = str(uuid.uuid4())
    budget = Decimal("0.008")
    raised  = Decimal("0.006")
    thresh  = budget * Decimal("0.7")
    return {
        "proposal_id": pid,
        "title": "Quantum Monte Carlo for DeFi Portfolio Risk Attribution",
        "description": (
            "Traditional Monte Carlo simulations for DeFi portfolio risk require "
            "millions of samples to converge.  Quantum amplitude estimation provides "
            "a quadratic speedup, enabling real-time risk attribution for portfolios "
            "containing correlated assets across Ethereum, Arbitrum, and Base.\n\n"
            "The model will estimate CVaR (Conditional Value at Risk) at 99% confidence "
            "intervals with 10× fewer function evaluations than classical alternatives."
        ),
        "methodology": (
            "1. Map portfolio return distribution to quantum state amplitudes.\n"
            "2. Apply quantum amplitude estimation circuit for CVaR computation.\n"
            "3. Benchmark against classical Sobol quasi-Monte Carlo.\n"
            "4. Publish results and open-source the circuit templates."
        ),
        "researcher_id": researcher["user_id"],
        "researcher_wallet": researcher["wallet_address"],
        "budget_required": _dec128(budget),
        "budget_raised":   _dec128(raised),
        "funding_threshold": _dec128(thresh),
        "deadline": _future(18),
        "status": "funded",
        "tags": ["finance", "defi", "risk", "monte-carlo", "quantum-advantage"],
        "fragments": [
            {
                "fragment_id": str(uuid.uuid4()),
                "title": "Return Distribution Encoding",
                "description": "Map historical return distributions into qubit probability amplitudes.",
                "budget_allocated": "0.002",
                "status": "completed",
                "claimed_by": DEMO_USER_ID,
                "claimed_at": _now() - timedelta(days=1),
            },
            {
                "fragment_id": str(uuid.uuid4()),
                "title": "CVaR Amplitude Estimation",
                "description": "Implement quantum amplitude estimation for CVaR at 99% CI.",
                "budget_allocated": "0.003",
                "status": "claimed",
                "claimed_by": "researcher-carol",
                "claimed_at": _now() - timedelta(hours=8),
            },
            {
                "fragment_id": str(uuid.uuid4()),
                "title": "Benchmark & Publication",
                "description": "Benchmark against classical Sobol, write paper, open-source circuit templates.",
                "budget_allocated": "0.003",
                "status": "unclaimed",
                "claimed_by": None,
                "claimed_at": None,
            },
        ],
        "funders": [
            {
                "funder_id": DEMO_USER_ID,
                "funder_type": "user",
                "wallet_address": "0xDEV000000000000000000000000000000000001",
                "amount_usdc": _dec128("0.004"),
                "funded_at": _now() - timedelta(days=2),
            },
            {
                "funder_id": "researcher-alice",
                "funder_type": "user",
                "wallet_address": RESEARCHERS[0]["wallet_address"],
                "amount_usdc": _dec128("0.002"),
                "funded_at": _now() - timedelta(hours=12),
            },
        ],
        "escrow_type": "aave_yield",
        "aave_pool_address": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
        "results_ipfs_hash": None,
        "created_at": _now() - timedelta(days=5),
        "updated_at": _now() - timedelta(hours=12),
    }


def _make_qec_proposal(researcher: dict) -> dict:
    pid = str(uuid.uuid4())
    budget = Decimal("0.01")
    raised  = Decimal("0.001")
    thresh  = budget * Decimal("0.7")
    return {
        "proposal_id": pid,
        "title": "Surface Code Threshold Improvement via Adaptive Decoding on Network Nodes",
        "description": (
            "Fault-tolerant quantum computing requires physical error rates below the "
            "surface code threshold (~1%).  This proposal develops an adaptive neural "
            "network decoder that runs on network edge nodes, reducing logical error "
            "rates by 3× compared to minimum-weight perfect matching (MWPM).\n\n"
            "The decoder will be trained on syndrome data from our distributed quantum "
            "network and validated on the 17-qubit surface code variant."
        ),
        "methodology": (
            "1. Collect syndrome data from 1M circuit executions on network nodes.\n"
            "2. Train LSTM-based adaptive decoder on syndrome sequences.\n"
            "3. Deploy decoder to edge nodes via libp2p protocol.\n"
            "4. Measure logical error rate improvement vs MWPM baseline."
        ),
        "researcher_id": researcher["user_id"],
        "researcher_wallet": researcher["wallet_address"],
        "budget_required": _dec128(budget),
        "budget_raised":   _dec128(raised),
        "funding_threshold": _dec128(thresh),
        "deadline": _future(45),
        "status": "active",
        "tags": ["qec", "surface-code", "fault-tolerance", "ml-decoder", "network"],
        "fragments": [
            {
                "fragment_id": str(uuid.uuid4()),
                "title": "Syndrome Data Collection",
                "description": "Run 1M circuits on network nodes to collect syndrome datasets.",
                "budget_allocated": "0.003",
                "status": "unclaimed",
                "claimed_by": None,
                "claimed_at": None,
            },
            {
                "fragment_id": str(uuid.uuid4()),
                "title": "LSTM Decoder Training",
                "description": "Train recurrent decoder on collected syndrome sequences.",
                "budget_allocated": "0.004",
                "status": "unclaimed",
                "claimed_by": None,
                "claimed_at": None,
            },
            {
                "fragment_id": str(uuid.uuid4()),
                "title": "Edge Deployment & Benchmarking",
                "description": "Deploy trained decoder to edge nodes, benchmark vs MWPM.",
                "budget_allocated": "0.003",
                "status": "unclaimed",
                "claimed_by": None,
                "claimed_at": None,
            },
        ],
        "funders": [
            {
                "funder_id": "researcher-alice",
                "funder_type": "user",
                "wallet_address": RESEARCHERS[0]["wallet_address"],
                "amount_usdc": _dec128("0.001"),
                "funded_at": _now() - timedelta(hours=1),
            },
        ],
        "escrow_type": "simple",
        "aave_pool_address": None,
        "results_ipfs_hash": None,
        "created_at": _now() - timedelta(hours=6),
        "updated_at": _now() - timedelta(hours=1),
    }


def _make_notifications(proposals: list[dict]) -> list[dict]:
    """Generate notifications for demo_user about these proposals."""
    notifs = []
    drug = proposals[0]
    fin  = proposals[1]
    qec  = proposals[2]

    notifs.append({
        "user_id": DEMO_USER_ID,
        "type": "new_proposal",
        "title": "New Research Proposal",
        "message": f"Dr. Alice Chen posted \"{drug['title'][:55]}…\" — seeking 0.009 USDC in funding.",
        "data": {"proposal_id": drug["proposal_id"], "researcher": "researcher-alice"},
        "read": False,
        "sent_email": False,
        "email_sent_at": None,
        "created_at": drug["created_at"],
    })
    notifs.append({
        "user_id": DEMO_USER_ID,
        "type": "new_proposal",
        "title": "New Research Proposal",
        "message": f"Dr. Bob Nakamura posted \"{fin['title'][:55]}…\" — seeking 0.008 USDC in funding.",
        "data": {"proposal_id": fin["proposal_id"], "researcher": "researcher-bob"},
        "read": False,
        "sent_email": False,
        "email_sent_at": None,
        "created_at": fin["created_at"],
    })
    notifs.append({
        "user_id": DEMO_USER_ID,
        "type": "fragment_claimed",
        "title": "Fragment Claimed",
        "message": "You claimed \"Distributed VQE Execution\" fragment on the EGFR Inhibitor proposal.",
        "data": {"proposal_id": drug["proposal_id"], "fragment_title": "Distributed VQE Execution"},
        "read": True,
        "sent_email": False,
        "email_sent_at": None,
        "created_at": _now() - timedelta(hours=3),
    })
    notifs.append({
        "user_id": DEMO_USER_ID,
        "type": "proposal_funded",
        "title": "Proposal Reached Funding Goal",
        "message": f"The DeFi risk proposal is now fully funded at 0.006 USDC (75% of goal).",
        "data": {"proposal_id": fin["proposal_id"], "amount": "0.006"},
        "read": False,
        "sent_email": False,
        "email_sent_at": None,
        "created_at": _now() - timedelta(hours=12),
    })
    notifs.append({
        "user_id": DEMO_USER_ID,
        "type": "payment_received",
        "title": "Payment Received",
        "message": "0.002 USDC released from escrow for completing \"Return Distribution Encoding\" fragment.",
        "data": {"proposal_id": fin["proposal_id"], "amount": "0.002"},
        "read": False,
        "sent_email": False,
        "email_sent_at": None,
        "created_at": _now() - timedelta(hours=1),
    })
    notifs.append({
        "user_id": DEMO_USER_ID,
        "type": "new_proposal",
        "title": "New Research Proposal",
        "message": f"Dr. Carol Osei posted \"{qec['title'][:55]}…\" — needs collaborators.",
        "data": {"proposal_id": qec["proposal_id"], "researcher": "researcher-carol"},
        "read": False,
        "sent_email": False,
        "email_sent_at": None,
        "created_at": qec["created_at"],
    })
    return notifs


# ─── wallet seeding ───────────────────────────────────────────────────────

async def _ensure_wallets(db) -> None:
    for r in RESEARCHERS:
        existing = await db.wallets.find_one({"entity_id": r["user_id"]})
        if existing:
            print(f"  [skip] wallet for {r['user_id']}")
            continue
        await db.wallets.insert_one({
            "entity_id": r["user_id"],
            "entity_type": "user",
            "wallet_id": str(uuid.uuid4()),
            "default_address": r["wallet_address"],
            "network": "base-sepolia",
            "seed_encrypted": "demo-not-real",
            "balance_usdc": _dec128("0.05"),
            "balance_eth": _dec128("0.001"),
            "created_at": _now(),
            "updated_at": _now(),
        })
        print(f"  [ok]   wallet for {r['user_id']} ({r['wallet_address']})")


# ─── main ─────────────────────────────────────────────────────────────────

async def main() -> None:
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[MONGODB_DB]

    print("\n=== Seeding wallets ===")
    await _ensure_wallets(db)

    print("\n=== Seeding proposals ===")
    proposals = [
        _make_drug_discovery_proposal(RESEARCHERS[0]),
        _make_finance_proposal(RESEARCHERS[1]),
        _make_qec_proposal(RESEARCHERS[2]),
    ]

    inserted_proposals = []
    for p in proposals:
        existing = await db.research_proposals.find_one({"title": p["title"]})
        if existing:
            print(f"  [skip] {p['title'][:60]}")
            # Use existing proposal_id for notifications
            p["proposal_id"] = existing["proposal_id"]
            inserted_proposals.append(p)
            continue
        await db.research_proposals.insert_one(p)
        inserted_proposals.append(p)
        print(f"  [ok]   {p['title'][:60]} (id={p['proposal_id'][:8]}…)")

    print("\n=== Seeding notifications ===")
    notifications = _make_notifications(inserted_proposals)
    inserted_notifs = 0
    skipped_notifs  = 0
    for n in notifications:
        existing = await db.notifications.find_one({
            "user_id": n["user_id"],
            "type":    n["type"],
            "message": n["message"],
        })
        if existing:
            skipped_notifs += 1
            continue
        await db.notifications.insert_one(n)
        inserted_notifs += 1
    print(f"  Inserted {inserted_notifs}, skipped {skipped_notifs} notifications")

    unread = await db.notifications.count_documents({"user_id": DEMO_USER_ID, "read": False})
    total  = await db.notifications.count_documents({"user_id": DEMO_USER_ID})
    print(f"\n  Bell icon will show: {unread} unread / {total} total for '{DEMO_USER_ID}'")

    client.close()
    print("\nDone!")


if __name__ == "__main__":
    asyncio.run(main())
