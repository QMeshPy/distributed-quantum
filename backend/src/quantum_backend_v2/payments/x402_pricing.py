"""Bounded USDC quotes from marketplace worker estimates."""

import re
from decimal import ROUND_CEILING, Decimal
from typing import Any, Protocol

from qiskit import qasm2


class CostEstimator(Protocol):
    async def estimate_job_cost(self, circuit: str) -> dict[str, Any]: ...


async def quote_circuit(
    circuit: str,
    estimator: CostEstimator,
    *,
    floor: Decimal,
    cap: Decimal,
) -> dict[str, str]:
    if not floor.is_finite() or not cap.is_finite() or not 0 < floor <= cap:
        raise RuntimeError("Invalid x402 price bounds.")
    if any(value != value.quantize(Decimal("0.000001")) for value in (floor, cap)):
        raise RuntimeError("x402 price bounds must use at most six decimal places.")
    if len(circuit.encode()) > 100_000:
        raise ValueError("The circuit is too large to quote.")
    declarations = re.sub(r"//[^\n]*|/\*.*?\*/", " ", circuit, flags=re.DOTALL)
    register_sizes = re.findall(r"\b(?:qreg|creg)\s+\w+\s*\[\s*(\d+)\s*\]", declarations)
    if sum(int(size) for size in register_sizes) > 128:
        raise ValueError("The circuit exceeds the paid gateway limits.")
    try:
        parsed = qasm2.loads(circuit, include_path=())
    except qasm2.QASM2ParseError as exc:
        raise ValueError("Provide a valid OpenQASM 2 circuit.") from exc
    if parsed.num_qubits > 64 or len(parsed.data) > 10_000:
        raise ValueError("The circuit exceeds the paid gateway limits.")
    # Expanded instructions count register-wide gates and omit QASM declarations.
    operations = ";".join(f"{item.operation.name} q" for item in parsed.data)
    if not operations:
        raise ValueError("The circuit must contain at least one operation.")
    estimate = await estimator.estimate_job_cost(operations)
    breakdown = estimate.get("breakdown", [])
    if not breakdown or any(row.get("error") for row in breakdown):
        raise RuntimeError("Worker pricing is unavailable for this circuit.")
    total = Decimal(str(estimate["total_usdc"]))
    if not total.is_finite() or total < 0:
        raise RuntimeError("Worker pricing is invalid.")
    for row in breakdown:
        price = Decimal(str(row.get("price_per_op")))
        if not price.is_finite() or price < 0:
            raise RuntimeError("Worker pricing is invalid.")
    amount = min(cap, max(floor, total)).quantize(Decimal("0.000001"), rounding=ROUND_CEILING)
    return {"amount": str(amount), "asset": "USDC", "estimated_amount": str(total)}
