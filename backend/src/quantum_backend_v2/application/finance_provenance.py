"""Bind a finance result to the persisted input and exact oracle observation."""

from importlib.metadata import version
from typing import Any

from quantum_backend_v2.chains.prices import PriceObservation
from quantum_backend_v2.provenance.finance_inputs import encode_finance_inputs
from quantum_backend_v2.provenance.hashing import bundle_hash, hash_json
from quantum_backend_v2.provenance.models import OracleReference, ProvenanceBundle


def build_finance_provenance(
    job_id: str,
    owner_user_id: str,
    inputs: dict[str, Any],
    result: dict[str, Any],
    *,
    workflow: str,
) -> dict[str, Any]:
    result_paths = {
        "options-pricing": f"/api/v1/options/{job_id}",
        "risk-analysis": f"/api/v1/risk/{job_id}",
        "portfolio-optimization": f"/api/v1/finance/{job_id}?result_detail=full",
    }
    observations = inputs.get("price_observations", [inputs.get("price_observation")])
    bundle = ProvenanceBundle(
        bundle_id="provenance-" + job_id,
        workflow_run_id=job_id,
        workflow_definition_id=workflow,
        owner_user_id=owner_user_id,
        input_hash=hash_json(inputs),
        oracle_refs=tuple(
            OracleReference(
                provider="chainlink",
                feed=observation.chain_id + "/" + observation.feed,
                round_id=observation.round_id,
                value=observation.value,
                observed_at=observation.observed_at,
            )
            for observation in map(PriceObservation.model_validate, observations)
        ),
        summary={
            "result_hash": hash_json(result),
            "result_hash_scope": "full_result_excluding_provenance",
            "result_url": result_paths[workflow],
            **encode_finance_inputs(inputs),
            "runtime": {name: version(name) for name in ("qiskit", "qiskit-algorithms", "numpy")},
        },
    )
    return {"bundle": bundle.model_dump(mode="json"), "bundle_hash": bundle_hash(bundle)}
