"""Real options pricing solver — A–Q–IQAE pipeline with Black-Scholes and binomial baselines.

Quantum method: Iterative Amplitude Estimation (Suzuki et al. 2020, npj Quantum Info).
Classical baselines: Black-Scholes closed-form + Cox-Ross-Rubinstein binomial tree.
Quantum Greeks: finite-difference parameter shift on the IQAE circuit.

All 8 Damodaran option types map to the same E[F(S_T)] integral — only the payoff
function F and the semantic labels for S and K differ.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Any

import numpy as np


def _native(obj: Any) -> Any:
    """Recursively convert numpy scalars/arrays to plain Python types for JSON serialization."""
    if isinstance(obj, dict):
        return {k: _native(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_native(v) for v in obj]
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, np.ndarray):
        return [_native(v) for v in obj.tolist()]
    return obj


# ---------------------------------------------------------------------------
# Option type → payoff polarity.  "put" types need max(K-S, 0).
# ---------------------------------------------------------------------------
_PUT_TYPES = {"abandon"}


@dataclass
class OptionsParams:
    """Normalised numeric inputs shared by all option types."""

    option_type: str
    S: float   # current value of underlying (or proxy)
    K: float   # strike / investment cost
    T: float   # time to expiry in years
    sigma: float  # annualised volatility
    r: float      # annualised risk-free rate
    # dividend / cost-of-carry adjustments
    dividend_yield: float = 0.0
    # IQAE circuit config
    num_uncertainty_qubits: int = 5
    epsilon: float = 0.01
    alpha: float = 0.05


def build_options_params(request: dict[str, Any]) -> OptionsParams:
    """Convert raw request dict to OptionsParams, handling Damodaran real option remappings."""
    option_type: str = request["option_type"]
    S: float = float(request["current_value"])
    K: float = float(request["strike_or_cost"])
    T: float = float(request["time_to_expiry"])
    sigma: float = float(request["volatility"])
    r: float = float(request["risk_free_rate"])

    # Natural resource: S = PV of reserves = qty × (price - extraction_cost)
    if option_type == "natural_resource":
        qty = float(request.get("reserve_quantity") or 0)
        price = float(request.get("resource_price_per_unit") or 0)
        cost = float(request.get("extraction_cost_per_unit") or 0)
        if qty > 0 and price > 0:
            S = qty * max(price - cost, 0.0)
        annual_cf = float(request.get("annual_cashflow_after_tax") or 0)
        # Only apply dividend yield if S is positive and non-trivial
        if S > 0 and annual_cf > 0:
            dividend_yield = min(annual_cf / S, 1.0)  # cap at 100% to avoid degenerate cases
        else:
            dividend_yield = 0.0
    # Financial flexibility: S = reinvestment need as fraction of firm value
    elif option_type == "financial_flexibility":
        S = float(request.get("reinvestment_need_pct") or S)
        sigma = float(request.get("reinvestment_volatility") or sigma)
        K = float(request.get("max_internal_financing_pct") or K)
        T = 1.0
        dividend_yield = 0.0
    else:
        dividend_yield = 0.0

    # Annual cost of delay → dividend yield approximation (Damodaran convention)
    annual_cost = request.get("annual_cost_of_delay")
    if annual_cost is not None and float(annual_cost) > 0 and S > 0:
        dividend_yield = max(dividend_yield, float(annual_cost) / S)

    return OptionsParams(
        option_type=option_type,
        S=S,
        K=K,
        T=T,
        sigma=sigma,
        r=r,
        dividend_yield=dividend_yield,
        num_uncertainty_qubits=int(request.get("num_uncertainty_qubits", 5)),
        epsilon=float(request.get("epsilon", 0.01)),
        alpha=float(request.get("alpha", 0.05)),
    )


# ---------------------------------------------------------------------------
# Black-Scholes analytical solution
# ---------------------------------------------------------------------------

def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _norm_pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)


def black_scholes(params: OptionsParams) -> dict[str, float]:
    """Black-Scholes price and Greeks for call or put.

    Abandon option → put payoff; all others → call payoff.
    """
    S, K, T, r, sigma, q = params.S, params.K, params.T, params.r, params.sigma, params.dividend_yield
    is_put = params.option_type in _PUT_TYPES

    if sigma <= 0 or T <= 0:
        intrinsic = max(K - S, 0.0) if is_put else max(S - K, 0.0)
        return {
            "price": intrinsic,
            "delta": -1.0 if (is_put and S < K) else (1.0 if (not is_put and S > K) else 0.0),
            "gamma": 0.0,
            "vega": 0.0,
            "theta": 0.0,
        }

    sqrt_T = math.sqrt(T)
    d1 = (math.log(S / K) + (r - q + 0.5 * sigma ** 2) * T) / (sigma * sqrt_T)
    d2 = d1 - sigma * sqrt_T

    if is_put:
        price = K * math.exp(-r * T) * _norm_cdf(-d2) - S * math.exp(-q * T) * _norm_cdf(-d1)
        delta = -math.exp(-q * T) * _norm_cdf(-d1)
    else:
        price = S * math.exp(-q * T) * _norm_cdf(d1) - K * math.exp(-r * T) * _norm_cdf(d2)
        delta = math.exp(-q * T) * _norm_cdf(d1)

    gamma = _norm_pdf(d1) * math.exp(-q * T) / (S * sigma * sqrt_T)
    vega = S * math.exp(-q * T) * _norm_pdf(d1) * sqrt_T
    if is_put:
        theta = (
            -S * math.exp(-q * T) * _norm_pdf(d1) * sigma / (2.0 * sqrt_T)
            + r * K * math.exp(-r * T) * _norm_cdf(-d2)
            - q * S * math.exp(-q * T) * _norm_cdf(-d1)
        )
    else:
        theta = (
            -S * math.exp(-q * T) * _norm_pdf(d1) * sigma / (2.0 * sqrt_T)
            - r * K * math.exp(-r * T) * _norm_cdf(d2)
            + q * S * math.exp(-q * T) * _norm_cdf(d1)
        )

    return {"price": price, "delta": delta, "gamma": gamma, "vega": vega, "theta": theta}


# ---------------------------------------------------------------------------
# Cox-Ross-Rubinstein binomial tree (European only)
# ---------------------------------------------------------------------------

def binomial_price(params: OptionsParams, steps: int = 200) -> float:
    """CRR binomial tree European option price."""
    S, K, T, r, sigma, q = params.S, params.K, params.T, params.r, params.sigma, params.dividend_yield
    is_put = params.option_type in _PUT_TYPES

    dt = T / steps
    u = math.exp(sigma * math.sqrt(dt))
    d = 1.0 / u
    p = (math.exp((r - q) * dt) - d) / (u - d)
    discount = math.exp(-r * dt)

    # Terminal payoffs
    stock_prices = np.array([S * (u ** (steps - 2 * j)) for j in range(steps + 1)])
    if is_put:
        values = np.maximum(K - stock_prices, 0.0)
    else:
        values = np.maximum(stock_prices - K, 0.0)

    # Backward induction
    for _ in range(steps):
        values = discount * (p * values[:-1] + (1.0 - p) * values[1:])

    return float(values[0])


# ---------------------------------------------------------------------------
# Quantum Amplitude Estimation pipeline (A–Q–IQAE)
# ---------------------------------------------------------------------------

def _run_iqae_for_params(
    S: float,
    K: float,
    T: float,
    sigma: float,
    r: float,
    q: float,
    is_put: bool,
    num_qubits: int,
    epsilon: float,
    alpha: float,
) -> tuple[float, float, float, int, int]:
    """Build and run one IQAE circuit run.

    Returns: (price, ci_lower, ci_upper, circuit_depth, shots_used)

    Uses Qiskit Finance's LogNormalDistribution + LinearAmplitudeFunction + IQAE.
    """
    import warnings

    warnings.filterwarnings("ignore", category=DeprecationWarning)

    from qiskit_algorithms import IterativeAmplitudeEstimation, EstimationProblem
    from qiskit_finance.circuit.library import LogNormalDistribution
    from qiskit.circuit.library import LinearAmplitudeFunctionGate
    from qiskit.circuit import QuantumCircuit

    # Risk-neutral drift: E[ln(S_T)] = ln(S) + (r - q - σ²/2)·T
    mu_ln = math.log(S) + (r - q - 0.5 * sigma ** 2) * T
    sigma_ln = sigma * math.sqrt(T)

    # Bounds using lognormal mean ± 3·stddev of the lognormal distribution
    # (canonical Qiskit Finance tutorial approach for best discretization accuracy)
    ln_mean = math.exp(mu_ln + 0.5 * sigma_ln ** 2)
    ln_var = (math.exp(sigma_ln ** 2) - 1.0) * math.exp(2 * mu_ln + sigma_ln ** 2)
    ln_std = math.sqrt(ln_var)
    low = max(1e-6, ln_mean - 3.0 * ln_std)
    high = ln_mean + 3.0 * ln_std

    # State preparation: LogNormal encodes S_T distribution into |ψ⟩
    uncertainty_model = LogNormalDistribution(
        num_qubits=num_qubits,
        mu=mu_ln,
        sigma=sigma_ln,
        bounds=(low, high),
    )

    # Payoff oracle: piecewise linear amplitude function
    K_clamped = min(max(K, low + 1e-9), high - 1e-9)
    if is_put:
        slopes = [-1.0, 0.0]
        offsets = [K_clamped, 0.0]
        f_min = max(K_clamped - high, 0.0)
        f_max = max(K_clamped - low, 1e-6)
    else:
        slopes = [0.0, 1.0]
        offsets = [0.0, -K_clamped]
        f_min = 0.0
        f_max = max(high - K_clamped, 1e-6)

    payoff_gate = LinearAmplitudeFunctionGate(
        num_state_qubits=num_qubits,
        slope=slopes,
        offset=offsets,
        domain=(low, high),
        image=(f_min, f_max),
        breakpoints=[low, K_clamped],
    )

    # gate.num_qubits = num_state + 1 (objective) + n_ancilla
    gate_total = payoff_gate.num_qubits
    objective_qubit = num_qubits

    # Build circuit: state prep on qubits [0..n-1], payoff gate on all qubits
    qc = QuantumCircuit(gate_total)
    qc.compose(uncertainty_model, qubits=list(range(num_qubits)), inplace=True)
    qc.append(payoff_gate, list(range(gate_total)))

    f_range = f_max - f_min

    def _post(a: float) -> float:
        return a * f_range + f_min

    problem = EstimationProblem(
        state_preparation=qc,
        objective_qubits=[objective_qubit],
        post_processing=_post,
    )

    iae = IterativeAmplitudeEstimation(epsilon_target=epsilon, alpha=alpha)
    result = iae.estimate(problem)

    # Discount to present value
    discount = math.exp(-r * T)
    raw_price = result.estimation_processed * discount
    ci_raw = result.confidence_interval_processed
    ci_lower = ci_raw[0] * discount
    ci_upper = ci_raw[1] * discount

    # Circuit depth
    try:
        depth = qc.decompose().depth()
    except Exception:
        depth = qc.depth()

    shots = int(getattr(result, "num_oracle_queries", 1024))

    return raw_price, ci_lower, ci_upper, depth, shots


def run_qae_pipeline(params: OptionsParams) -> dict[str, Any]:
    """Run full A–Q–IQAE pipeline: 5 circuit evaluations for price + Greeks.

    Returns full result dict ready for OptionsAnalysisResult.
    """
    is_put = params.option_type in _PUT_TYPES
    num_qubits = params.num_uncertainty_qubits
    epsilon = params.epsilon
    alpha = params.alpha

    # δ for finite differences
    delta_S = params.S * 0.01
    delta_sigma = params.sigma * 0.01

    def run(S: float, sigma: float) -> tuple[float, float, float, int, int]:
        return _run_iqae_for_params(
            S=S, K=params.K, T=params.T, sigma=sigma,
            r=params.r, q=params.dividend_yield,
            is_put=is_put,
            num_qubits=num_qubits,
            epsilon=epsilon,
            alpha=alpha,
        )

    # Run 1: base price
    price, ci_lo, ci_hi, depth, shots = run(params.S, params.sigma)

    # Runs 2 & 3: S perturbed (for delta, gamma)
    price_up_S, *_ = run(params.S + delta_S, params.sigma)
    price_dn_S, *_ = run(params.S - delta_S, params.sigma)

    # Runs 4 & 5: sigma perturbed (for vega)
    price_up_sig, *_ = run(params.S, params.sigma + delta_sigma)
    price_dn_sig, *_ = run(params.S, params.sigma - delta_sigma)

    q_delta = (price_up_S - price_dn_S) / (2.0 * delta_S)
    q_gamma = (price_up_S - 2.0 * price + price_dn_S) / (delta_S ** 2)
    q_vega = (price_up_sig - price_dn_sig) / (2.0 * delta_sigma)

    # Monte Carlo equivalent: classical MC needs 1/epsilon² samples; IQAE needs 1/epsilon
    mc_equiv = int(round(1.0 / (epsilon ** 2)))
    iqae_queries = int(round(1.0 / epsilon))
    speedup = mc_equiv / max(iqae_queries, 1)

    return {
        "quantum_price": price,
        "ci_lower": ci_lo,
        "ci_upper": ci_hi,
        "quantum_delta": q_delta,
        "quantum_gamma": q_gamma,
        "quantum_vega": q_vega,
        "circuit_depth": depth,
        "shots": shots,
        "num_qubits": num_qubits + 1,  # +1 for objective ancilla
        "mc_equiv": mc_equiv,
        "iqae_queries": iqae_queries,
        "speedup": speedup,
    }


# ---------------------------------------------------------------------------
# Moneyness helper
# ---------------------------------------------------------------------------

def moneyness(S: float, K: float) -> tuple[str, float]:
    ratio = S / K
    if abs(ratio - 1.0) < 0.02:
        return "ATM", ratio
    elif ratio > 1.0:
        return "ITM", ratio
    else:
        return "OTM", ratio


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def price_options(request: dict[str, Any]) -> dict[str, Any]:
    """Full options pricing pipeline: Black-Scholes + Binomial + QAE + Greeks.

    If sigma == 0, falls back to B-S intrinsic value only (no IQAE).
    Returns a dict matching OptionsAnalysisResult fields.
    """
    t_start = time.perf_counter()

    params = build_options_params(request)
    job_id: str = request.get("job_id", "opt-unknown")

    sigma_zero_fallback = params.sigma <= 0.0

    # --- Classical baselines ---
    bs = black_scholes(params)
    bs_price = bs["price"]
    bs_binomial = binomial_price(params)

    # --- Quantum pipeline ---
    if sigma_zero_fallback:
        q_price = bs_price
        ci_lo = bs_price
        ci_hi = bs_price
        q_delta = bs["delta"]
        q_gamma = bs["gamma"]
        q_vega = bs["vega"]
        circuit_depth = 0
        shots = 0
        num_qubits = 0
        mc_equiv = 0
        speedup = 0.0
        divergence_warning = False
    else:
        qae = run_qae_pipeline(params)
        q_price = qae["quantum_price"]
        ci_lo = qae["ci_lower"]
        ci_hi = qae["ci_upper"]
        q_delta = qae["quantum_delta"]
        q_gamma = qae["quantum_gamma"]
        q_vega = qae["quantum_vega"]
        circuit_depth = qae["circuit_depth"]
        shots = qae["shots"]
        num_qubits = qae["num_qubits"]
        mc_equiv = qae["mc_equiv"]
        speedup = qae["speedup"]
        divergence_warning = (
            bs_price > 0 and abs(q_price - bs_price) / bs_price > 0.05
        )

    # Price difference %
    if bs_price > 0:
        price_diff_pct = (q_price - bs_price) / bs_price * 100.0
    else:
        price_diff_pct = 0.0

    mono, mono_ratio = moneyness(params.S, params.K)

    elapsed_ms = int((time.perf_counter() - t_start) * 1000)

    from datetime import datetime, timezone

    return _native({
        "job_id": job_id,
        "option_type": params.option_type,
        "request": request,
        "quantum_price": round(q_price, 6),
        "classical_bs_price": round(bs_price, 6),
        "classical_binomial_price": round(bs_binomial, 6),
        "price_difference_pct": round(price_diff_pct, 4),
        "quantum_greeks": {
            "delta": round(q_delta, 6),
            "gamma": round(q_gamma, 6),
            "vega": round(q_vega, 6),
            "theta": round(bs["theta"], 6),  # quantum theta not computed
        },
        "classical_greeks": {
            "delta": round(bs["delta"], 6),
            "gamma": round(bs["gamma"], 6),
            "vega": round(bs["vega"], 6),
            "theta": round(bs["theta"], 6),
        },
        "confidence_interval": [round(ci_lo, 6), round(ci_hi, 6)],
        "moneyness": mono,
        "moneyness_ratio": round(mono_ratio, 4),
        "divergence_warning": divergence_warning,
        "sigma_zero_fallback": sigma_zero_fallback,
        "num_qubits": num_qubits,
        "circuit_depth": circuit_depth,
        "num_iqae_runs": 0 if sigma_zero_fallback else 5,
        "shots_per_run": shots,
        "epsilon": params.epsilon,
        "alpha": params.alpha,
        "classical_mc_samples_equivalent": mc_equiv,
        "quadratic_speedup_factor": round(speedup, 2),
        "analysis_duration_ms": elapsed_ms,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    })
