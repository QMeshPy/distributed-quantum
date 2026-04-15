from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from time import monotonic, sleep

from fastapi.testclient import TestClient

from quantum_coordinator.api.app import create_app
from quantum_coordinator.config.models import AppConfig, DatabaseConfig, Libp2pConfig
from quantum_coordinator.domain.models import GateType
from quantum_coordinator.domain.models import JobStatus
from quantum_coordinator.infra.persistence import FragmentExecutionEvent, SQLiteJobStore
from quantum_coordinator.infra.persistence.job_store import JobRecord
from quantum_coordinator.service_discovery.advertisement import ServiceAdvertisement
from tests.support.real_libp2p import make_real_libp2p_config

CIRCUIT_TEXT = """
OPENQASM 2.0;
qreg q[2];
cx q[0], q[1];
"""

MEASURED_CIRCUIT_TEXT = """
OPENQASM 3;
qubit[2] q;
bit[1] c;
bell_pair q[0], q[1];
cnot q[0], q[1];
cz q[0], q[1];
teleport q[0], q[1];
syndrome_extraction q[0];
distillation q[1];
measure q[0] -> c[0];
"""

SHOR_STYLE_CIRCUIT_TEXT = """
OPENQASM 3;
qubit[8] q;
bit[3] c;

h q[0];
h q[1];
h q[2];
h q[3];
h q[4];
h q[5];
h q[6];
h q[7];

for i in [0:3] {
    controlled U(2^i) q[0], q[i];
}

qft q[0:4];

measure q[0] -> c[0];
measure q[1] -> c[1];
measure q[2] -> c[2];
"""

LARGE_COMPLEX_CIRCUIT_TEXT = """
OPENQASM 3;
qubit[16] q;
bit[16] c;

h q[0];
h q[1];
h q[2];
h q[3];
h q[4];
h q[5];
h q[6];
h q[7];
h q[8];
h q[9];
h q[10];
h q[11];
h q[12];
h q[13];
h q[14];
h q[15];

bell_pair q[0], q[1];
bell_pair q[2], q[3];
bell_pair q[4], q[5];
bell_pair q[6], q[7];
bell_pair q[8], q[9];
bell_pair q[10], q[11];
bell_pair q[12], q[13];
bell_pair q[14], q[15];

ccnot q[0], q[1], q[2];
ccnot q[3], q[4], q[5];
ccnot q[6], q[7], q[8];
ccnot q[9], q[10], q[11];
ccnot q[12], q[13], q[14];

for i in [0:7] {
    controlled U(2^i) q[0], q[i];
}

qft q[0:8];

for i in [0:7] {
    for j in [i+1:7] {
        cswap q[i], q[j], q[8];
    }
}

for i in [0:15] {
    controlled rz(3.1415) q[i], q[15-i];
    controlled rx(2.0) q[i], q[15-i];
}

syndrome_extraction q[0];
syndrome_extraction q[1];
syndrome_extraction q[2];
distillation q[3];
teleport q[0], q[1];
teleport q[2], q[3];
iqft q[0:8];
measure q[0] -> c[0];
measure q[1] -> c[1];
measure q[2] -> c[2];
measure q[3] -> c[3];
measure q[4] -> c[4];
measure q[5] -> c[5];
measure q[6] -> c[6];
measure q[7] -> c[7];
measure q[8] -> c[8];
measure q[9] -> c[9];
measure q[10] -> c[10];
measure q[11] -> c[11];
measure q[12] -> c[12];
measure q[13] -> c[13];
measure q[14] -> c[14];
measure q[15] -> c[15];
"""


def _wait_for_job_terminal(client: TestClient, job_id: str, timeout_seconds: float = 5.0) -> dict:
    deadline = monotonic() + timeout_seconds
    while monotonic() < deadline:
        response = client.get(f"/api/v1/jobs/{job_id}")
        assert response.status_code == 200
        payload = response.json()
        if payload["status"] in {"COMPLETED", "FAILED"}:
            return payload
        sleep(0.05)
    raise AssertionError(f"job {job_id} did not reach terminal state")


def _wait_for_services(
    client: TestClient,
    *,
    headers: dict[str, str] | None = None,
    timeout_seconds: float = 5.0,
) -> list[dict[str, object]]:
    deadline = monotonic() + timeout_seconds
    request_headers = headers or {}
    while monotonic() < deadline:
        response = client.get("/api/v1/services", headers=request_headers)
        if response.status_code == 200:
            services = response.json()
            if services:
                return services
        sleep(0.05)
    raise AssertionError("services were not advertised before timeout")


def _seed_local_services(app: object) -> None:
    now = datetime.now(timezone.utc)
    for gate_type in GateType:
        app.state.registry.upsert(
            ServiceAdvertisement(
                node_id="local-simulator-node",
                listen_addrs=("/ip4/127.0.0.1/tcp/0",),
                service_type=gate_type,
                fidelity=0.99,
                qubit_min=1,
                qubit_max=16,
                availability=True,
                updated_at=now,
            )
        )


def test_submit_and_poll_job_completion(tmp_path: Path) -> None:
    database_path = str(tmp_path / "submit.db")
    app = create_app(make_real_libp2p_config(database_path))

    with TestClient(app) as client:
        services = _wait_for_services(client)
        assert services

        submit_response = client.post(
            "/api/v1/circuits/submit",
            json={"circuit": CIRCUIT_TEXT},
        )
        assert submit_response.status_code == 200
        submit_payload = submit_response.json()
        assert submit_payload["status"] == "QUEUED"
        assert submit_payload["job_id"].startswith("job-")

        terminal = _wait_for_job_terminal(client, submit_payload["job_id"])
        assert terminal["status"] == "COMPLETED"
        assert terminal["progress"] is not None
        assert terminal["progress"]["total_fragments"] == 1
        assert terminal["progress"]["completed_fragments"] == 1
        assert terminal["progress"]["finalizing"] is False
        assert terminal["result"] is not None
        # Fragment-level execution summary should be present for downstream
        # inspection of how the job ran.
        assert len(terminal["result"]["fragment_results"]) == 1
        quantum_result = terminal["result"]["quantum_result"]
        assert quantum_result is not None
        assert quantum_result["counts"] is None
        assert quantum_result["probabilities"] is not None
        assert quantum_result["statevector"] is not None

        # If a plan_id is associated with the job, the plan endpoint should
        # return a structured view of how the circuit was compiled and routed.
        assert terminal["plan_id"] is not None
        plan_response = client.get(f"/api/v1/plans/{terminal['plan_id']}")
        assert plan_response.status_code == 200
        plan = plan_response.json()
        assert plan["plan_id"] == terminal["plan_id"]
        assert isinstance(plan["fragment_order"], list)
        assert isinstance(plan["fragments"], dict)
        assert isinstance(plan["assignments"], dict)


def test_services_and_fidelity_metrics_endpoints(tmp_path: Path) -> None:
    database_path = str(tmp_path / "metrics.db")
    app = create_app(make_real_libp2p_config(database_path))

    with TestClient(app) as client:
        services = _wait_for_services(client)
        assert len(services) >= 1

        node_id = str(services[0]["node_id"])
        metrics_response = client.get(f"/api/v1/metrics/fidelity/{node_id}")
        assert metrics_response.status_code == 200
        metrics = metrics_response.json()
        assert metrics["node_id"] == node_id
        assert metrics["sample_count"] >= 1
        assert 0.0 <= metrics["min_fidelity"] <= 1.0
        assert 0.0 <= metrics["max_fidelity"] <= 1.0


def test_network_topology_endpoint_exposes_verbose_connectivity(tmp_path: Path) -> None:
    database_path = str(tmp_path / "topology.db")
    app = create_app(make_real_libp2p_config(database_path))

    with TestClient(app) as client:
        _wait_for_services(client)

        response = client.get("/api/v1/network/topology")
        assert response.status_code == 200
        payload = response.json()

        assert payload["fabric_running"] is True
        assert isinstance(payload["topic"], str)
        assert isinstance(payload["gate_protocol_id"], str)
        assert payload["coordinator"] is not None
        assert payload["coordinator"]["peer_id"]
        assert isinstance(payload["coordinator"]["listen_addrs"], list)
        assert isinstance(payload["coordinator"]["connected_peer_ids"], list)
        assert isinstance(payload["services"], list)
        assert len(payload["services"]) >= 1
        assert isinstance(payload["directed_edges"], list)
        assert len(payload["directed_edges"]) >= 1
        assert isinstance(payload["undirected_edges"], list)
        assert len(payload["undirected_edges"]) >= 1
        assert isinstance(payload["registry_snapshot"], list)
        assert len(payload["registry_snapshot"]) >= 1
        assert isinstance(payload["known_service_addresses"], dict)

        first_service = payload["services"][0]
        assert "behavior" in first_service
        assert "advertisements" in first_service
        assert isinstance(first_service["advertisements"], list)
        assert len(first_service["advertisements"]) >= 1


def test_measured_circuit_returns_counts_probabilities_and_statevector(tmp_path: Path) -> None:
    database_path = str(tmp_path / "measured.db")
    app = create_app(make_real_libp2p_config(database_path))

    with TestClient(app) as client:
        _wait_for_services(client)

        submit_response = client.post(
            "/api/v1/circuits/submit",
            json={"circuit": MEASURED_CIRCUIT_TEXT},
        )
        assert submit_response.status_code == 200
        job_id = submit_response.json()["job_id"]

        terminal = _wait_for_job_terminal(client, job_id)
        assert terminal["status"] == "COMPLETED"
        assert terminal["result"] is not None

        quantum_result = terminal["result"]["quantum_result"]
        assert quantum_result is not None
        assert quantum_result["counts"] is not None
        assert quantum_result["probabilities"] is not None
        assert quantum_result["measured_probabilities"] is not None
        assert quantum_result["statevector"] is not None
        assert quantum_result["shots"] == 1024
        assert quantum_result["measured_qubits"] == [0]
        assert quantum_result["observable_expectations"] is not None
        assert quantum_result["reduced_density_matrices"] is not None
        assert quantum_result["bloch_vectors"] is not None
        assert quantum_result["entanglement_entropy"] is not None
        assert quantum_result["fidelity"] is not None
        assert quantum_result["top_basis_states"] is not None
        assert quantum_result["observable_expectations"]["Z_q0"] == 1.0
        assert quantum_result["observable_expectations"]["Z_q1"] == 0.0
        assert quantum_result["bloch_vectors"]["q0"]["z"] == 1.0
        assert quantum_result["bloch_vectors"]["q1"]["x"] == 1.0


def test_executing_job_exposes_partial_fragment_results(tmp_path: Path) -> None:
    database_path = str(tmp_path / "live-fragments.db")
    app = create_app(
        AppConfig(
            database=DatabaseConfig(path=database_path),
            libp2p=Libp2pConfig(enabled=False),
        )
    )
    _seed_local_services(app)

    plan = app.state.job_manager._planner.compile(MEASURED_CIRCUIT_TEXT)
    app.state.job_manager._plans[plan.plan_id] = plan

    with TestClient(app) as client:
        now = datetime.now(timezone.utc)
        job_id = "job-live-fragments"
        app.state.job_store.upsert(
            JobRecord(
                job_id=job_id,
                status=JobStatus.EXECUTING,
                circuit_text=MEASURED_CIRCUIT_TEXT,
                plan_id=plan.plan_id,
                error=None,
                result_json=None,
                created_at=now,
                updated_at=now,
            )
        )
        app.state.runtime_store.append_fragment_event(
            FragmentExecutionEvent(
                event_id="evt-live-frag-1",
                job_id=job_id,
                fragment_id=plan.fragment_order[0],
                node_id="local-simulator-node",
                attempt=1,
                status="SUCCESS",
                error=None,
                observed_fidelity=0.99,
                created_at=now,
            )
        )

        response = client.get(f"/api/v1/jobs/{job_id}")
        assert response.status_code == 200
        payload = response.json()

        assert payload["status"] == "EXECUTING"
        assert payload["result"] is not None
        assert payload["result"]["quantum_result"] is None
        assert len(payload["result"]["fragment_results"]) == 1
        assert payload["result"]["fragment_results"][0]["fragment_id"] == plan.fragment_order[0]
        assert payload["result"]["fragment_results"][0]["status"] == "SUCCESS"


def test_shor_style_openqasm3_circuit_completes_with_seeded_local_services(
    tmp_path: Path,
) -> None:
    database_path = str(tmp_path / "shor-style.db")
    app = create_app(
        AppConfig(
            database=DatabaseConfig(path=database_path),
            libp2p=Libp2pConfig(enabled=False),
        )
    )
    _seed_local_services(app)

    with TestClient(app) as client:
        services_response = client.get("/api/v1/services")
        assert services_response.status_code == 200
        assert services_response.json()

        submit_response = client.post(
            "/api/v1/circuits/submit",
            json={"circuit": SHOR_STYLE_CIRCUIT_TEXT},
        )
        assert submit_response.status_code == 200
        job_id = submit_response.json()["job_id"]

        terminal = _wait_for_job_terminal(client, job_id)
        assert terminal["status"] == "COMPLETED"
        assert terminal["result"] is not None

        quantum_result = terminal["result"]["quantum_result"]
        assert quantum_result is not None
        assert quantum_result["counts"] is not None
        assert quantum_result["measured_qubits"] == [0, 1, 2]

        assert terminal["plan_id"] is not None
        plan_response = client.get(f"/api/v1/plans/{terminal['plan_id']}")
        assert plan_response.status_code == 200
        plan = plan_response.json()
        service_types = {
            fragment["service_type"] for fragment in plan["fragments"].values()
        }
        assert "hadamard" in service_types
        assert "controlled_unitary" in service_types
        assert "qft" in service_types


def test_large_complex_openqasm3_circuit_completes_with_seeded_local_services(
    tmp_path: Path,
) -> None:
    database_path = str(tmp_path / "large-complex.db")
    app = create_app(
        AppConfig(
            database=DatabaseConfig(path=database_path),
            libp2p=Libp2pConfig(enabled=False),
        )
    )
    _seed_local_services(app)

    with TestClient(app) as client:
        submit_response = client.post(
            "/api/v1/circuits/submit",
            json={"circuit": LARGE_COMPLEX_CIRCUIT_TEXT},
        )
        assert submit_response.status_code == 200
        job_id = submit_response.json()["job_id"]

        terminal = _wait_for_job_terminal(client, job_id, timeout_seconds=10.0)
        assert terminal["status"] == "COMPLETED"
        assert terminal["result"] is not None
        assert terminal["progress"] is not None
        assert terminal["progress"]["total_fragments"] == 121
        assert terminal["progress"]["completed_fragments"] == 121
        assert terminal["progress"]["finalizing"] is False

        quantum_result = terminal["result"]["quantum_result"]
        assert quantum_result is not None
        assert quantum_result["counts"] is not None
        assert quantum_result["measured_qubits"] == list(range(16))
        assert quantum_result["observable_expectations"] is not None
        assert quantum_result["bloch_vectors"] is not None
        assert quantum_result["entanglement_entropy"] is not None

        assert terminal["plan_id"] is not None
        plan_response = client.get(f"/api/v1/plans/{terminal['plan_id']}")
        assert plan_response.status_code == 200
        plan = plan_response.json()
        service_types = {
            fragment["service_type"] for fragment in plan["fragments"].values()
        }
        assert "programmable_gate" in service_types
        assert "qft" in service_types
        assert "controlled_unitary" in service_types


def test_auth_and_rate_limit_guards(tmp_path: Path) -> None:
    database_path = str(tmp_path / "auth-rate.db")
    app = create_app(
        make_real_libp2p_config(
            database_path,
            enable_auth=True,
            api_key="topsecret",
            enable_rate_limit=True,
            rate_limit_per_minute=1,
        )
    )

    with TestClient(app) as client:
        unauthorized = client.get("/api/v1/services")
        assert unauthorized.status_code == 401

        authorized = client.get("/api/v1/services", headers={"X-API-Key": "topsecret"})
        assert authorized.status_code == 200

        limited = client.get("/api/v1/services", headers={"X-API-Key": "topsecret"})
        assert limited.status_code == 429


def test_startup_recovery_reprocesses_unfinished_jobs(tmp_path: Path) -> None:
    database_path = str(tmp_path / "recovery.db")
    job_store = SQLiteJobStore(database_path)
    now = datetime.now(timezone.utc)
    job_store.upsert(
        JobRecord(
            job_id="job-recover-1",
            status=JobStatus.QUEUED,
            circuit_text=CIRCUIT_TEXT,
            plan_id=None,
            error=None,
            result_json=None,
            created_at=now,
            updated_at=now,
        )
    )

    app = create_app(make_real_libp2p_config(database_path))
    with TestClient(app) as client:
        _wait_for_services(client)
        response = client.get("/api/v1/jobs/job-recover-1")
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "COMPLETED"
        assert payload["result"] is not None
