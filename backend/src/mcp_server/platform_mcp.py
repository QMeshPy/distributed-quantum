"""
QuantumNodes Platform MCP Server

This module creates a FastMCP server that exposes all platform operations
as MCP tools. Claude uses these tools autonomously during chat — it decides
WHAT to fetch and WHEN, rather than us pre-loading everything.

Tools exposed:
  - list_proposals        : list user's research proposals
  - get_proposal          : get full detail of one proposal
  - create_proposal       : create a new research proposal
  - get_wallet            : get wallet address + balances
  - list_marketplace      : list active marketplace agents/workers
  - fund_proposal         : fund a proposal with USDC
  - get_agent_stats       : get the AI agent's spending stats
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

from mcp.server.fastmcp import FastMCP
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


def create_platform_mcp(db: AsyncIOMotorDatabase, owner_id: str) -> FastMCP:
    """
    Create a FastMCP instance scoped to a specific user/owner.

    The returned server has all platform tools bound to `db` and `owner_id`.
    It is intended to be used in-process: we call get_tools() to get Claude
    tool definitions and invoke() to run them.

    Args:
        db: Motor async MongoDB database handle
        owner_id: The authenticated user ID — tools only touch this user's data

    Returns:
        FastMCP: Configured MCP server instance
    """
    mcp = FastMCP("quantumnodes-platform")

    # ── Proposals ────────────────────────────────────────────────────────────

    @mcp.tool()
    async def list_proposals() -> list[dict]:
        """List all research proposals belonging to the current user.

        Returns proposal id, title, status, raised/required USDC amounts,
        deadline, and a short description snippet for each proposal.
        """
        result = []
        try:
            cursor = db.research_proposals.find({"researcher_id": owner_id})
            async for p in cursor:
                raised = p.get("budget_raised", 0)
                req = p.get("budget_required", 0)
                deadline = p.get("deadline", "")
                result.append({
                    "proposal_id": p.get("proposal_id", ""),
                    "title": p.get("title", ""),
                    "status": p.get("status", ""),
                    "raised_usdc": str(raised.to_decimal() if hasattr(raised, "to_decimal") else raised),
                    "required_usdc": str(req.to_decimal() if hasattr(req, "to_decimal") else req),
                    "deadline": deadline.isoformat() if hasattr(deadline, "isoformat") else str(deadline),
                    "description_snippet": (p.get("description", "") or "")[:150],
                    "tags": p.get("tags", []),
                })
        except Exception as e:
            logger.error("list_proposals failed: %s", e)
            return [{"error": str(e)}]
        return result

    @mcp.tool()
    async def get_proposal(proposal_id: str) -> dict:
        """Get full details of a specific research proposal by its ID.

        Args:
            proposal_id: The unique proposal identifier (e.g. from list_proposals)

        Returns full title, description, methodology, budget, status, funders list,
        fragments, and all other fields.
        """
        try:
            p = await db.research_proposals.find_one({"proposal_id": proposal_id})
            if not p:
                return {"error": f"Proposal {proposal_id} not found"}
            raised = p.get("budget_raised", 0)
            req = p.get("budget_required", 0)
            return {
                "proposal_id": p.get("proposal_id", ""),
                "title": p.get("title", ""),
                "description": p.get("description", ""),
                "methodology": p.get("methodology", ""),
                "status": p.get("status", ""),
                "raised_usdc": str(raised.to_decimal() if hasattr(raised, "to_decimal") else raised),
                "required_usdc": str(req.to_decimal() if hasattr(req, "to_decimal") else req),
                "tags": p.get("tags", []),
                "funder_count": len(p.get("funders", [])),
                "fragment_count": len(p.get("fragments", [])),
            }
        except Exception as e:
            logger.error("get_proposal failed: %s", e)
            return {"error": str(e)}

    @mcp.tool()
    async def create_proposal(
        title: str,
        description: str,
        methodology: str,
        budget_required: str,
        tags: list[str] | None = None,
        deadline_days: int = 30,
        expected_timeline: str = "Not specified",
    ) -> dict:
        """Create a new research proposal on behalf of the user.

        Use this whenever the user asks you to submit, draft, create, or write a proposal.
        Extract all details from the conversation. budget_required is in USDC (e.g. "500").

        Args:
            title: Proposal title (max 200 characters)
            description: Detailed description of the research goals and expected outcomes
            methodology: The research methodology and technical approach
            budget_required: Total USDC funding needed as a string (e.g. "500")
            tags: Optional list of research topic tags (e.g. ["quantum", "error-correction"])
            deadline_days: Days until funding deadline (default 30, max 365)
            expected_timeline: Expected research duration (e.g. "3 months")

        Returns:
            dict with proposal_id on success, or error message on failure
        """
        try:
            from datetime import datetime, timezone, timedelta
            # Idempotency guard: return existing proposal if same title was just created
            title_lower = title.strip().lower()
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
            existing = await db.research_proposals.find_one({
                "researcher_id": owner_id,
                "title": {"$regex": f"^{title.strip()}$", "$options": "i"},
                "created_at": {"$gte": cutoff},
            })
            if existing:
                return {
                    "success": True,
                    "proposal_id": existing.get("proposal_id", ""),
                    "title": existing.get("title", ""),
                    "status": existing.get("status", "active"),
                    "already_existed": True,
                    "note": "Proposal already created — returning existing one to avoid duplicate.",
                }
            from services.proposal_service import ProposalService
            svc = ProposalService()
            result = await svc.create_proposal(
                researcher_id=owner_id,
                title=title,
                description=description,
                methodology=methodology,
                budget_required=Decimal(str(budget_required)),
                tags=tags or [],
                deadline_days=min(max(1, deadline_days), 365),
                expected_timeline=expected_timeline,
                auto_fragment=False,
            )
            return {
                "success": True,
                "proposal_id": result["proposal_id"],
                "title": result["title"],
                "status": result.get("status", "active"),
                "budget_required_usdc": str(budget_required),
                "deadline_days": deadline_days,
            }
        except Exception as e:
            logger.error("create_proposal tool failed: %s", e)
            return {"success": False, "error": str(e)}

    # ── Wallet ────────────────────────────────────────────────────────────────

    @mcp.tool()
    async def get_wallet() -> dict:
        """Get the current user's wallet address, USDC balance, and ETH balance.

        Returns the on-chain wallet address and current token balances.
        Call this whenever the user asks about their balance, wallet, or funds.
        """
        try:
            doc = await db.wallets.find_one({"entity_id": owner_id})
            if not doc:
                return {"error": "No wallet found for this user"}
            usdc = doc.get("balance_usdc", 0)
            eth = doc.get("balance_eth", 0)
            return {
                "address": doc.get("default_address", ""),
                "network": doc.get("network", "base-sepolia"),
                "usdc_balance": str(usdc.to_decimal() if hasattr(usdc, "to_decimal") else usdc),
                "eth_balance": str(eth.to_decimal() if hasattr(eth, "to_decimal") else eth),
            }
        except Exception as e:
            logger.error("get_wallet tool failed: %s", e)
            return {"error": str(e)}

    # ── Marketplace ───────────────────────────────────────────────────────────

    @mcp.tool()
    async def list_marketplace(limit: int = 10) -> list[dict]:
        """List active agents/workers available in the marketplace.

        Returns worker IDs, performance tiers, reputation scores, and pricing info.
        Call this when the user asks about the marketplace, available agents, or workers.

        Args:
            limit: Maximum number of workers to return (default 10, max 50)
        """
        result = []
        try:
            cursor = db.worker_pricing.find({"is_active": True}).limit(min(limit, 50))
            async for w in cursor:
                earned = w.get("total_earned", 0)
                result.append({
                    "worker_id": w.get("worker_id", ""),
                    "performance_tier": w.get("performance_tier", "bronze"),
                    "reputation_score": w.get("reputation_score", 0),
                    "jobs_completed": w.get("jobs_completed", 0),
                    "total_earned_usdc": str(earned.to_decimal() if hasattr(earned, "to_decimal") else earned),
                    "pricing": w.get("pricing", {}),
                })
        except Exception as e:
            logger.error("list_marketplace tool failed: %s", e)
            return [{"error": str(e)}]
        return result

    # ── Agent stats ───────────────────────────────────────────────────────────

    @mcp.tool()
    async def get_agent_stats() -> dict:
        """Get the AI agent's configuration, spending totals, and remaining daily budget.

        Returns agent name, research interests, daily budget limit,
        total spent to date, and how much budget remains today.
        """
        try:
            agent_doc = await db.ai_agents.find_one({"owner_id": owner_id})
            if not agent_doc:
                return {"error": "No AI agent found for this user"}
            config = agent_doc.get("config", {})
            total = agent_doc.get("total_spent", 0)
            daily = config.get("daily_budget", 0)
            return {
                "agent_id": agent_doc.get("agent_id", ""),
                "agent_name": agent_doc.get("agent_name", ""),
                "research_interests": config.get("research_interests", []),
                "auto_fund_enabled": config.get("auto_fund", False),
                "daily_budget_usdc": str(daily.to_decimal() if hasattr(daily, "to_decimal") else daily),
                "max_per_proposal_usdc": str(config.get("max_per_proposal", 0)),
                "total_spent_usdc": str(total.to_decimal() if hasattr(total, "to_decimal") else total),
            }
        except Exception as e:
            logger.error("get_agent_stats tool failed: %s", e)
            return {"error": str(e)}

    # ── Quantum circuit execution ─────────────────────────────────────────────

    @mcp.tool()
    async def submit_quantum_circuit(circuit: str) -> dict:
        """Submit a quantum circuit for execution on the QuantumNodes distributed network.

        Use this when the user asks to run, execute, or submit a quantum circuit.
        The circuit must be in OpenQASM 2.0 format (QASM text), at least 10 characters long.

        Example QASM:
            OPENQASM 2.0;
            include "qelib1.inc";
            qreg q[2];
            creg c[2];
            h q[0];
            cx q[0],q[1];
            measure q -> c;

        Args:
            circuit: Full OpenQASM 2.0 circuit text (minimum 10 characters)

        Returns:
            dict with job_id and status. Use get_circuit_job(job_id) to poll for results.
        """
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "http://localhost:8081/api/v1/circuits/submit",
                    json={"circuit": circuit},
                    timeout=30.0,
                )
            return resp.json()
        except Exception as e:
            logger.error("submit_quantum_circuit failed: %s", e)
            return {"error": str(e)}

    @mcp.tool()
    async def get_circuit_job(job_id: str) -> dict:
        """Get the status and results of a quantum circuit job by its job_id.

        Call this after submit_quantum_circuit to check if the job is done and get results.
        status values: "pending", "running", "completed", "failed"

        Args:
            job_id: The job identifier returned by submit_quantum_circuit

        Returns:
            dict with status, progress, and result when completed.
        """
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"http://localhost:8081/api/v1/jobs/{job_id}",
                    timeout=10.0,
                )
            return resp.json()
        except Exception as e:
            logger.error("get_circuit_job failed: %s", e)
            return {"error": str(e)}

    @mcp.tool()
    async def list_circuit_jobs() -> list:
        """List all quantum circuit jobs submitted by the current user.

        Returns job IDs, statuses, circuit previews, and timestamps.
        Call this when the user asks to see their quantum jobs or job history.
        """
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "http://localhost:8081/api/v1/jobs",
                    timeout=10.0,
                )
            return resp.json()
        except Exception as e:
            logger.error("list_circuit_jobs failed: %s", e)
            return [{"error": str(e)}]

    # ── Options pricing ───────────────────────────────────────────────────────

    @mcp.tool()
    async def price_option(
        option_type: str,
        current_value: float,
        strike_or_cost: float,
        time_to_expiry: float,
        volatility: float,
        risk_free_rate: float,
        dividend_yield: float | None = None,
        delay_time: float | None = None,
    ) -> dict:
        """Price a financial option using quantum IQAE (Iterative Quantum Amplitude Estimation).

        Returns both quantum price and classical Black-Scholes/binomial benchmark for comparison.
        Use this when the user asks to price an option, calculate option value, or value a real option.

        option_type must be one of:
            "european_call_short" - short European call
            "european_call_long"  - long European call (buy)
            "expand"              - real option to expand a project
            "delay"               - real option to delay a project
            "abandon"             - real option to abandon a project
            "patent"              - patent valuation real option
            "natural_resource"    - natural resource extraction option
            "financial_flexibility" - financial flexibility option

        Args:
            option_type: Type of option (see above)
            current_value: Current asset/project value (> 0)
            strike_or_cost: Strike price or investment cost (> 0)
            time_to_expiry: Time to expiry in years (> 0, e.g. 0.25 = 3 months)
            volatility: Annualised volatility 0–5 (e.g. 0.25 = 25% vol)
            risk_free_rate: Risk-free rate 0–1 (e.g. 0.05 = 5%)
            dividend_yield: Optional continuous dividend yield (default None)
            delay_time: Required for "delay" option type — delay period in years

        Returns:
            dict with job_id. Use get_option_result(job_id) to retrieve full quantum vs classical analysis.
        """
        import httpx
        body: dict = {
            "option_type": option_type,
            "current_value": current_value,
            "strike_or_cost": strike_or_cost,
            "time_to_expiry": time_to_expiry,
            "volatility": volatility,
            "risk_free_rate": risk_free_rate,
        }
        if dividend_yield is not None:
            body["dividend_yield"] = dividend_yield
        if delay_time is not None:
            body["delay_time"] = delay_time
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "http://localhost:8081/api/v1/options/submit",
                    json=body,
                    timeout=30.0,
                )
            return resp.json()
        except Exception as e:
            logger.error("price_option failed: %s", e)
            return {"error": str(e)}

    @mcp.tool()
    async def get_option_result(job_id: str) -> dict:
        """Get the result of an options pricing job, including quantum vs classical comparison.

        Returns quantum_price, classical_bs_price, greeks (delta/gamma/vega/theta),
        confidence_interval, moneyness (ITM/ATM/OTM), and speedup metrics.

        Args:
            job_id: The job_id returned by price_option

        Returns:
            Full options analysis with quantum and classical prices and greeks.
        """
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"http://localhost:8081/api/v1/options/{job_id}",
                    timeout=10.0,
                )
            return resp.json()
        except Exception as e:
            logger.error("get_option_result failed: %s", e)
            return {"error": str(e)}

    # ── Risk engine ───────────────────────────────────────────────────────────

    @mcp.tool()
    async def analyze_portfolio_risk(
        risk_model: str,
        holdings: list | None = None,
        assets: list | None = None,
        lookback_days: int = 504,
    ) -> dict:
        """Run quantum Value-at-Risk (VaR) and CVaR analysis using IQAE.

        Use this when the user asks about portfolio risk, VaR, CVaR, or credit risk.

        For EQUITY risk (risk_model="equity"):
            holdings = [{"ticker": "AAPL", "weight": 0.4}, {"ticker": "MSFT", "weight": 0.6}]
            Weights must be positive (not necessarily sum to 1 — they are normalised internally).

        For CREDIT risk (risk_model="credit"):
            assets = [{"principal": 1000000, "default_probability": 0.02, "recovery_rate": 0.4}]
            Each asset is a loan with a principal amount, probability of default, and recovery rate.

        Args:
            risk_model: "equity" or "credit"
            holdings: List of {ticker, weight} dicts for equity risk
            assets: List of {principal, default_probability, recovery_rate} dicts for credit risk
            lookback_days: Historical lookback window for equity model (default 504 = 2 years)

        Returns:
            dict with job_id. Use get_risk_result(job_id) to retrieve VaR/CVaR analysis.
        """
        import httpx
        body: dict = {
            "risk_model": risk_model,
            "lookback_days": lookback_days,
        }
        if holdings is not None:
            body["holdings"] = holdings
        if assets is not None:
            body["assets"] = assets
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "http://localhost:8081/api/v1/risk/submit",
                    json=body,
                    timeout=30.0,
                )
            return resp.json()
        except Exception as e:
            logger.error("analyze_portfolio_risk failed: %s", e)
            return {"error": str(e)}

    @mcp.tool()
    async def get_risk_result(job_id: str) -> dict:
        """Get results of a portfolio risk analysis job.

        Returns quantum VaR, classical Monte Carlo VaR, CVaR at 99%, expected loss,
        loss distribution, and quantum speedup factor.

        Args:
            job_id: Job ID returned by analyze_portfolio_risk

        Returns:
            Full risk analysis with quantum vs classical VaR/CVaR comparison.
        """
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"http://localhost:8081/api/v1/risk/{job_id}",
                    timeout=10.0,
                )
            return resp.json()
        except Exception as e:
            logger.error("get_risk_result failed: %s", e)
            return {"error": str(e)}

    # ── Financial portfolio optimisation ──────────────────────────────────────

    @mcp.tool()
    async def list_financial_jobs(limit: int = 10) -> list:
        """List recent quantum portfolio optimisation jobs.

        Returns job IDs, filenames, statuses, row/column counts, and timestamps.
        Use this when the user asks about their financial jobs or portfolio optimisation runs.

        Args:
            limit: Maximum jobs to return (default 10)
        """
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "http://localhost:8081/api/v1/finance",
                    timeout=10.0,
                )
            data = resp.json()
            jobs = data if isinstance(data, list) else data.get("jobs", data)
            return jobs[:limit] if isinstance(jobs, list) else [jobs]
        except Exception as e:
            logger.error("list_financial_jobs failed: %s", e)
            return [{"error": str(e)}]

    @mcp.tool()
    async def get_financial_result(job_id: str) -> dict:
        """Get results of a quantum portfolio optimisation job including quantum vs classical comparison.

        Returns the optimised portfolio allocation, quantum Sharpe ratio vs classical,
        selected assets, and evidence for the quantum advantage claim.

        Args:
            job_id: Job ID of a completed financial optimisation job

        Returns:
            Full result dict with classical vs quantum comparison, scorecard, and verdict.
        """
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                # First get the job status
                job_resp = await client.get(
                    f"http://localhost:8081/api/v1/finance/{job_id}",
                    timeout=10.0,
                )
                job = job_resp.json()
                if job.get("status") == "completed":
                    # Also fetch the quantum vs classical comparison report
                    try:
                        cmp_resp = await client.get(
                            f"http://localhost:8081/api/v1/finance/{job_id}/comparison",
                            timeout=10.0,
                        )
                        job["comparison"] = cmp_resp.json()
                    except Exception:
                        pass
                return job
        except Exception as e:
            logger.error("get_financial_result failed: %s", e)
            return {"error": str(e)}

    # ── Pharma / drug discovery ───────────────────────────────────────────────

    @mcp.tool()
    async def submit_pharma_job(
        mode: str,
        target_pdb_id: str,
        initial_ligand_smiles: str | None = None,
        max_iterations: int = 5,
        candidate_count: int = 20,
    ) -> dict:
        """Submit a quantum drug discovery / docking job using QAOA + VQC.

        Use this when the user asks to run drug discovery, molecular docking, find drug candidates,
        or analyse a protein target. The platform uses quantum QAOA for ligand placement and
        VQC for binding affinity scoring.

        mode options:
            "optimization" - optimise/refine a given ligand (provide initial_ligand_smiles)
            "discovery"    - de-novo generate and screen new candidates for the target protein

        Common PDB target IDs (4-character codes):
            "3HTB" - HIV protease (antiviral research)
            "1HVR" - HIV-1 protease
            "2WI4" - EGFR kinase (cancer research)
            "4AGL" - beta-secretase BACE1 (Alzheimer's)
            "6LU7" - SARS-CoV-2 main protease
            "1A28" - thrombin (blood coagulation)

        Example SMILES for initial_ligand_smiles:
            Aspirin:  "CC(=O)Oc1ccccc1C(=O)O"
            Ibuprofen: "CC(C)Cc1ccc(cc1)C(C)C(=O)O"

        Args:
            mode: "optimization" or "discovery"
            target_pdb_id: 3–10 character PDB ID of the target protein
            initial_ligand_smiles: Optional seed SMILES for optimization mode
            max_iterations: Scaffold-hopping iterations 1–20 (default 5)
            candidate_count: Number of drug candidates to generate 10–500 (default 20)

        Returns:
            dict with job_id. Use get_pharma_result(job_id) to poll for candidates.
        """
        import httpx
        body: dict = {
            "mode": mode,
            "target_pdb_id": target_pdb_id,
            "max_iterations": max_iterations,
            "candidate_count": candidate_count,
        }
        if initial_ligand_smiles:
            body["initial_ligand_smiles"] = initial_ligand_smiles
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "http://localhost:8081/api/v1/pharma/submit",
                    json=body,
                    timeout=30.0,
                )
            return resp.json()
        except Exception as e:
            logger.error("submit_pharma_job failed: %s", e)
            return {"error": str(e)}

    @mcp.tool()
    async def get_pharma_result(job_id: str) -> dict:
        """Get status and results of a pharma drug discovery job.

        When completed, returns top drug candidates with:
        - SMILES string of each candidate molecule
        - binding_affinity_kcal (VQC quantum binding score, kcal/mol — more negative = stronger binding)
        - ADMET drug-likeness: molecular_weight, logP, QED score, Lipinski violations, hERG risk
        - QAOA docking energy (total_qubo_energy)
        - MOSES generative quality metrics (fcd, novelty, validity, snn)

        Args:
            job_id: Job ID returned by submit_pharma_job

        Returns:
            dict with status and (when completed) top ranked drug candidates.
        """
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"http://localhost:8081/api/v1/pharma/jobs/{job_id}",
                    timeout=10.0,
                )
            data = resp.json()
            # Summarise candidates for readability if completed
            if data.get("status") == "completed" and data.get("result"):
                result = data["result"]
                candidates = result.get("candidates", [])
                summary = []
                for c in candidates[:5]:  # top 5
                    vqc = c.get("vqc_score", {})
                    admet = c.get("admet", {})
                    summary.append({
                        "rank": c.get("rank"),
                        "smiles": c.get("smiles"),
                        "binding_affinity_kcal": vqc.get("binding_affinity_kcal"),
                        "qed_score": admet.get("qed_score"),
                        "molecular_weight": admet.get("molecular_weight"),
                        "logp": admet.get("logp"),
                        "lipinski_violations": admet.get("lipinski_violations"),
                        "passes_admet": admet.get("passes"),
                        "herg_risk": admet.get("herg_risk"),
                    })
                data["top_candidates"] = summary
                data["total_candidates"] = len(candidates)
                data["runtime_seconds"] = result.get("total_runtime_seconds")
                data["cache_hit_rate"] = result.get("cache_hit_rate")
            return data
        except Exception as e:
            logger.error("get_pharma_result failed: %s", e)
            return {"error": str(e)}

    @mcp.tool()
    async def list_pharma_jobs() -> list:
        """List all pharma drug discovery jobs and their current statuses.

        Returns job IDs, target protein PDB IDs, modes, statuses, and timestamps.
        Call this when the user asks to see their drug discovery runs or docking jobs.
        """
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "http://localhost:8081/api/v1/pharma/jobs",
                    timeout=10.0,
                )
            return resp.json()
        except Exception as e:
            logger.error("list_pharma_jobs failed: %s", e)
            return [{"error": str(e)}]


    # ── Proposal funding ─────────────────────────────────────────────────────

    @mcp.tool()
    async def recommend_proposals_to_fund(top_n: int = 3) -> list:
        """Analyse the user's active proposals and recommend which ones to fund.

        Scores proposals by funding progress (most underfunded first), tags relevance,
        and days remaining until deadline. Call this when the user asks which proposal
        is best, which to fund, or wants a recommendation.

        Args:
            top_n: Number of top recommendations to return (default 3)

        Returns:
            Ranked list of proposals with recommendation reasoning.
        """
        from datetime import datetime, timezone
        results = []
        try:
            cursor = db.research_proposals.find({"researcher_id": owner_id, "status": "active"})
            async for p in cursor:
                raised = float(str(p.get("budget_raised", 0) or 0))
                required = float(str(p.get("budget_required", 1) or 1))
                funded_pct = (raised / required * 100) if required > 0 else 0
                deadline = p.get("deadline")
                days_left = None
                if deadline:
                    try:
                        dl = deadline if hasattr(deadline, "tzinfo") else deadline
                        if hasattr(dl, "tzinfo"):
                            days_left = (dl.replace(tzinfo=timezone.utc) - datetime.now(timezone.utc)).days
                    except Exception:
                        pass
                results.append({
                    "proposal_id": p.get("proposal_id", ""),
                    "title": p.get("title", ""),
                    "funded_pct": round(funded_pct, 1),
                    "raised_usdc": str(raised),
                    "required_usdc": str(required),
                    "remaining_usdc": str(round(required - raised, 4)),
                    "days_left": days_left,
                    "tags": p.get("tags", []),
                    "funder_count": len(p.get("funders", [])),
                })
        except Exception as e:
            logger.error("recommend_proposals_to_fund failed: %s", e)
            return [{"error": str(e)}]

        # Sort: underfunded first, then by days_left ascending
        results.sort(key=lambda x: (x["funded_pct"], x.get("days_left") or 999))
        return results[:top_n]

    @mcp.tool()
    async def fund_proposal(proposal_id: str, amount_usdc: str) -> dict:
        """Fund a research proposal with USDC from the user's wallet.

        This triggers an on-chain USDC transfer from the user's wallet into the
        proposal's Aave escrow contract. The funds are only released when the
        researcher submits verified results.

        IMPORTANT: Always call get_wallet() first to confirm the user has enough balance.
        Confirm the proposal exists with list_proposals() or get_proposal() before funding.
        Use recommend_proposals_to_fund() to help the user decide which to fund.

        Args:
            proposal_id: The proposal_id to fund (UUID string)
            amount_usdc: Amount of USDC to contribute as a string (e.g. "10", "0.5", "100")

        Returns:
            dict with payment_id, transaction_hash, basescan_url, updated budget_raised,
            and funding_percentage showing how close the proposal is to its goal.
        """
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"http://localhost:8081/api/v1/proposals/{proposal_id}/fund",
                    json={"amount": str(amount_usdc)},
                    timeout=60.0,
                )
            return resp.json()
        except Exception as e:
            logger.error("fund_proposal failed: %s", e)
            return {"error": str(e)}


    return mcp
