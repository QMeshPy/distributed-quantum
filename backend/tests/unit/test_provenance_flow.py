"""Real simulator → commitment → BSON → multi-chain proof round-trip.

This exercises the library boundary, not the job service or live MongoDB/chains.
"""

from __future__ import annotations

from datetime import datetime, timezone

from bson import BSON
from qiskit import QuantumCircuit, qasm2
from qiskit.quantum_info import Statevector

from quantum_backend_v2.provenance.hashing import bundle_hash, hash_json
from quantum_backend_v2.provenance.merkle import MerkleProof, MerkleTree, verify_proof
from quantum_backend_v2.provenance.models import ChainAnchor, ProvenanceBundle


def test_simulated_results_survive_bson_and_multiple_anchor_attachments() -> None:
    bundles = []
    for index, angle in enumerate((0.0, 0.5, 1.0)):
        circuit = QuantumCircuit(2)
        circuit.h(0)
        circuit.cx(0, 1)
        circuit.rz(angle, 1)
        state = Statevector.from_instruction(circuit)
        result = {
            "statevector": [
                {"real": float(amplitude.real), "imag": float(amplitude.imag)}
                for amplitude in state.data
            ],
            "probabilities": {
                str(bitstring): float(value)
                for bitstring, value in state.probabilities_dict().items()
            },
        }
        assert abs(sum(result["probabilities"].values()) - 1.0) < 1e-12
        bundles.append(
            ProvenanceBundle(
                bundle_id=f"bundle-{index}",
                workflow_run_id=f"workflow-{index}",
                workflow_definition_id="circuit-execution",
                owner_user_id="owner-1",
                input_hash=hash_json({"circuit": qasm2.dumps(circuit)}),
                plan_id=f"plan-{index}",
                fragment_result_hashes=(hash_json(result),),
                summary={"quantum_result": result},
                created_at=datetime(2026, 10, 21, tzinfo=timezone.utc),
            )
        )

    digests = [bundle_hash(bundle) for bundle in bundles]
    tree = MerkleTree(digests)
    for index, bundle in enumerate(bundles):
        proof = tree.proof(index)
        # Metadata fixtures only: these do not represent submitted transactions.
        anchors = tuple(
            ChainAnchor(
                chain=chain,
                tx_hash="fixture-not-a-real-transaction",
                merkle_root=tree.root,
                leaf_index=index,
                leaf_count=len(bundles),
                proof=proof.siblings,
            )
            for chain in ("eip155:11155111", "starknet:SN_SEPOLIA")
        )
        attached = ProvenanceBundle.model_validate({**bundle.model_dump(), "anchors": anchors})
        # MongoDB's payload is a dictionary. Exercise its actual wire codec while
        # keeping external services out of the unit suite.
        encoded = BSON.encode({"payload": attached.model_dump(mode="json")})
        restored = ProvenanceBundle.model_validate(BSON(encoded).decode()["payload"])
        assert len(restored.anchors) == 2
        assert bundle_hash(restored) == digests[index]
        for anchor in restored.anchors:
            restored_proof = MerkleProof(anchor.leaf_index, anchor.leaf_count, anchor.proof)
            assert verify_proof(bundle_hash(restored), restored_proof, anchor.merkle_root)
            changed = restored.model_copy(update={"summary": {"quantum_result": "altered"}})
            assert not verify_proof(bundle_hash(changed), restored_proof, anchor.merkle_root)
