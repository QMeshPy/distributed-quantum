"""Version-one canonical JSON commitments; see backend/PROVENANCE.md."""

from __future__ import annotations

import hashlib
import json
import math

from quantum_backend_v2.provenance.models import ProvenanceBundle

HASH_PROFILE = "qmesh-provenance-sha256-v1"


def _validate_json(value: object) -> None:
    if type(value) is float and not math.isfinite(value):
        raise ValueError("Canonical JSON requires finite numbers")
    if value is None or type(value) in (str, bool, int, float):
        return
    if type(value) is list:
        for item in value:
            _validate_json(item)
        return
    if type(value) is dict:
        for key, item in value.items():
            if type(key) is not str:
                raise TypeError("Canonical JSON requires string object keys")
            _validate_json(item)
        return
    raise TypeError(f"Unsupported canonical JSON type: {type(value).__name__}")


def canonical_json(value: object) -> bytes:
    """Encode JSON primitives deterministically, rejecting implicit conversions."""
    _validate_json(value)
    # This is a Python JSON profile, not RFC 8785: float rendering differs from JS.
    # Decimal must be converted to a documented decimal string by the producer.
    return json.dumps(
        value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False
    ).encode("utf-8")


def hash_json(value: object) -> str:
    """Return the lowercase SHA-256 hex digest of canonical JSON bytes."""
    return hashlib.sha256(canonical_json(value)).hexdigest()


def bundle_hash(bundle: ProvenanceBundle) -> str:
    """Commit to bundle evidence, excluding subsequently attached locations/anchors."""
    # Including the root/proof in its own leaf would make anchoring self-referential.
    # Storage locations can also be attached after the content is published.
    # Any-valued evidence must be checked before Pydantic can turn NaN into null,
    # Decimal into strings, or non-string dictionary keys into string keys.
    _validate_json(bundle.summary)
    for event in bundle.events:
        _validate_json(event.payload)
    # Freeze top-level and nested typed fields: future defaults must not silently
    # redefine v1. Free-form summary/event payload contents remain fully committed.
    payload = bundle.model_dump(
        mode="json",
        include={
            "bundle_id": True,
            "workflow_run_id": True,
            "workflow_definition_id": True,
            "owner_user_id": True,
            "events": {
                "__all__": {
                    "event_id",
                    "workflow_run_id",
                    "kind",
                    "actor_peer_id",
                    "actor_user_id",
                    "payload",
                    "occurred_at",
                }
            },
            "artifact_refs": True,
            "peer_log_refs": True,
            "summary": True,
            "is_publishable": True,
            "created_at": True,
            "input_hash": True,
            "plan_id": True,
            "fragment_result_hashes": True,
            "oracle_refs": {
                "__all__": {
                    "provider",
                    "feed",
                    "round_id",
                    "value",
                    "observed_at",
                }
            },
        },
    )
    return hash_json({"profile": HASH_PROFILE, "bundle": payload})
