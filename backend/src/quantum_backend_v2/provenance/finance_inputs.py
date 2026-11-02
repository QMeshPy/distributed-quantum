"""Lossless finance input encoding; input hashes always cover expanded inputs."""

from copy import deepcopy
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from quantum_backend_v2.provenance.hashing import canonical_json, hash_json
from quantum_backend_v2.provenance.models import ProvenanceBundle

INPUT_ENCODING = "chainlink-observations-v1"
_CONTEXT_FIELDS = ("chain_id", "feed", "pair", "decimals", "block_number", "block_hash")


class _ObservationContext(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    chain_id: str
    feed: str
    pair: str
    decimals: int
    block_number: int
    block_hash: str


class _ObservationRow(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    context: int = Field(ge=0)
    round_id: str
    answer: str
    value: str
    observed_at: str


class _ObservationTable(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    contexts: list[_ObservationContext]
    rows: list[_ObservationRow]


def encode_finance_inputs(inputs: dict[str, Any]) -> dict[str, Any]:
    """Share repeated metadata only when its encoded JSON is smaller."""
    stored = deepcopy(inputs)
    observations = stored.get("price_observations")
    if not observations:
        return {"inputs": stored}
    contexts: list[_ObservationContext] = []
    context_indices: dict[_ObservationContext, int] = {}
    rows = []
    for observation in observations:
        context = _ObservationContext.model_validate(
            {field: observation[field] for field in _CONTEXT_FIELDS}
        )
        if context not in context_indices:
            context_indices[context] = len(contexts)
            contexts.append(context)
        rows.append(
            {
                "context": context_indices[context],
                **{key: value for key, value in observation.items() if key not in _CONTEXT_FIELDS},
            }
        )
    table = _ObservationTable.model_validate({"contexts": contexts, "rows": rows})
    encoded = table.model_dump()
    compact = {
        "inputs": {**stored, "price_observations": encoded},
        "input_encoding": INPUT_ENCODING,
    }
    original = {"inputs": stored}
    return compact if len(canonical_json(compact)) < len(canonical_json(original)) else original


def restore_finance_inputs(bundle: ProvenanceBundle) -> dict[str, Any]:
    """Reconstruct and verify either legacy or compact finance input evidence."""
    inputs = deepcopy(bundle.summary["inputs"])
    encoding = bundle.summary.get("input_encoding")
    if encoding is not None:
        if encoding != INPUT_ENCODING:
            raise ValueError("Unsupported finance input encoding")
        table = _ObservationTable.model_validate(inputs["price_observations"])
        observations = []
        for row in table.rows:
            if row.context >= len(table.contexts):
                raise ValueError("Observation context is out of range")
            observations.append(
                {
                    **table.contexts[row.context].model_dump(),
                    **row.model_dump(exclude={"context"}),
                }
            )
        inputs["price_observations"] = observations
    if hash_json(inputs) != bundle.input_hash:
        raise ValueError("Finance inputs do not match their commitment")
    return inputs
