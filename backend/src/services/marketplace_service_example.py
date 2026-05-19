"""
MarketplaceService Usage Examples

This file demonstrates how to use the MarketplaceService for worker pricing,
job routing, and payment distribution in the quantum computing marketplace.
"""

from decimal import Decimal

# Example: Initialize the MarketplaceService
# ============================================

from services.agentkit_service import AgentKitService
from services.marketplace_service import MarketplaceService

# Initialize AgentKit service first
agentkit = AgentKitService()

# Optional: Define GossipSub broadcast callback
async def gossipsub_broadcast(topic: str, message: dict):
    """Broadcast message to libp2p network via GossipSub."""
    print(f"Broadcasting to {topic}: {message}")
    # In production, this would integrate with your libp2p pubsub instance

# Initialize MarketplaceService
marketplace = MarketplaceService(
    agentkit_service=agentkit,
    mongodb_uri="mongodb://127.0.0.1:27017",
    mongodb_database="qds",
    gossipsub_broadcast_callback=gossipsub_broadcast,
)


# Example 1: Register Worker Pricing
# ===================================

async def example_register_worker_pricing():
    """Register a worker's pricing in the marketplace."""

    # Define pricing for different operation types (USDC per operation)
    worker_pricing = {
        "hadamard": 0.001,
        "pauli_x": 0.001,
        "pauli_y": 0.001,
        "pauli_z": 0.001,
        "cnot": 0.002,
        "cz": 0.002,
        "swap": 0.003,
        "rotation_x": 0.0015,
        "rotation_y": 0.0015,
        "rotation_z": 0.0015,
        "t_gate": 0.001,
        "s_gate": 0.001,
        "qft": 0.01,
        "teleport": 0.015,
        "custom": 0.005,
    }

    result = await marketplace.register_worker_pricing(
        worker_id="worker_001",
        pricing=worker_pricing,
        performance_tier="gold",  # bronze|silver|gold|platinum
    )

    print(f"Worker registered: {result['worker_id']}")
    print(f"Wallet: {result['wallet_address']}")
    print(f"Reputation: {result['reputation_score']}/100")
    print(f"Active: {result['is_active']}")

    # Result includes:
    # - worker_id: Worker identifier
    # - wallet_address: Worker's payment address
    # - pricing: Full pricing dict
    # - performance_tier: Performance category
    # - reputation_score: Initial or current reputation (0-100)
    # - is_active: Worker availability status


# Example 2: Estimate Job Cost
# =============================

async def example_estimate_job_cost():
    """Estimate the cost of executing a quantum circuit."""

    # OpenQASM circuit
    circuit = """
    OPENQASM 2.0;
    qreg q[3];
    creg c[3];

    // Create entanglement
    h q[0];
    cx q[0],q[1];
    cx q[1],q[2];

    // Quantum Fourier Transform
    qft q[0];

    // Measurements
    measure q[0] -> c[0];
    measure q[1] -> c[1];
    measure q[2] -> c[2];
    """

    estimate = await marketplace.estimate_job_cost(circuit)

    print(f"Total estimated cost: {estimate['total_usdc']} USDC")
    print(f"Workers required: {estimate['workers_required']}")
    print(f"\nOperation breakdown:")
    for item in estimate['breakdown']:
        print(f"  {item['operation']:15} x{item['count']:2} = {item['subtotal']:8.4f} USDC "
              f"(worker: {item['worker_id']})")

    # Result structure:
    # {
    #     "total_usdc": 0.0234,
    #     "operation_counts": {"hadamard": 1, "cnot": 2, "qft": 1},
    #     "breakdown": [
    #         {
    #             "operation": "hadamard",
    #             "count": 1,
    #             "price_per_op": 0.001,
    #             "subtotal": 0.001,
    #             "worker_id": "worker_001",
    #             "worker_reputation": 85.0
    #         },
    #         ...
    #     ],
    #     "workers_required": ["worker_001", "worker_002"]
    # }


# Example 3: Route Operations to Workers
# =======================================

async def example_route_operations():
    """Route quantum operations to cheapest qualified workers."""

    # Define operations needed
    operations = {
        "hadamard": 5,
        "cnot": 3,
        "qft": 1,
        "rotation_x": 2,
    }

    routing = await marketplace.route_operations(operations)

    print("Operation routing:")
    for assignment in routing:
        if assignment['worker_id']:
            print(f"  {assignment['operation']:15} x{assignment['count']:2} -> "
                  f"Worker {assignment['worker_id']} "
                  f"({assignment['total_cost']:.4f} USDC, "
                  f"reputation: {assignment['reputation_score']:.1f})")
        else:
            print(f"  {assignment['operation']:15} x{assignment['count']:2} -> "
                  f"ERROR: {assignment['error']}")

    # Result structure:
    # [
    #     {
    #         "operation": "hadamard",
    #         "count": 5,
    #         "worker_id": "worker_001",
    #         "wallet_address": "0x1234...",
    #         "price_per_op": 0.001,
    #         "total_cost": 0.005,
    #         "reputation_score": 85.0,
    #         "performance_tier": "gold"
    #     },
    #     ...
    # ]


# Example 4: Distribute Payment to Workers
# =========================================

async def example_distribute_payment():
    """Distribute payment to workers after job completion."""

    job_id = "job_12345"

    # Payment breakdown (typically from routing results)
    worker_payments = [
        {"worker_id": "worker_001", "amount": 5.25},
        {"worker_id": "worker_002", "amount": 3.10},
        {"worker_id": "worker_003", "amount": 2.75},
    ]

    # Source wallet (user or platform)
    from_wallet = "0xUSER_WALLET_ADDRESS"

    result = await marketplace.distribute_payment_to_workers(
        job_id=job_id,
        worker_payments=worker_payments,
        from_wallet_address=from_wallet,
    )

    print(f"Payment distribution for job {result['job_id']}:")
    print(f"  Total distributed: {result['total_distributed']} USDC")
    print(f"  Successful: {result['successful_payments']}")
    print(f"  Failed: {result['failed_payments']}")
    print(f"\nPayment details:")
    for payment in result['payment_details']:
        if payment['status'] == 'success':
            print(f"  ✓ Worker {payment['worker_id']}: {payment['amount']} USDC")
            print(f"    TX: {payment['transaction_hash']}")
            print(f"    Explorer: {payment['basescan_url']}")
        else:
            print(f"  ✗ Worker {payment['worker_id']}: {payment['amount']} USDC")
            print(f"    Error: {payment['error']}")

    # Side effects:
    # - Executes USDC transfers via AgentKit
    # - Updates worker earnings and job counts in MongoDB
    # - Creates PaymentDocument records
    # - Sends notifications to workers


# Example 5: Update Worker Reputation
# ====================================

async def example_update_reputation():
    """Update worker reputation based on job outcomes."""

    # Job succeeded
    result_success = await marketplace.update_worker_reputation(
        worker_id="worker_001",
        job_success=True,
        adjustment_reason="Job completed successfully",
    )

    print(f"Worker {result_success['worker_id']} reputation updated:")
    print(f"  {result_success['old_reputation']:.1f} -> {result_success['new_reputation']:.1f} "
          f"({result_success['change']:+.1f})")

    # Job failed
    result_failure = await marketplace.update_worker_reputation(
        worker_id="worker_002",
        job_success=False,
        adjustment_reason="Job execution timeout",
    )

    print(f"Worker {result_failure['worker_id']} reputation updated:")
    print(f"  {result_failure['old_reputation']:.1f} -> {result_failure['new_reputation']:.1f} "
          f"({result_failure['change']:+.1f})")

    # Reputation rules:
    # - Success: +2 points
    # - Failure: -5 points
    # - Bounded to [0, 100]
    # - Workers with reputation < 20 are automatically deactivated


# Example 6: Get Worker Statistics
# =================================

async def example_get_worker_stats():
    """Retrieve comprehensive worker statistics."""

    stats = await marketplace.get_worker_stats("worker_001")

    print(f"Worker Statistics for {stats['worker_id']}:")
    print(f"  Wallet: {stats['wallet_address']}")
    print(f"  Performance Tier: {stats['performance_tier']}")
    print(f"  Reputation: {stats['reputation_score']:.1f}/100")
    print(f"  Total Earned: {stats['total_earned']} USDC")
    print(f"  Jobs Completed: {stats['jobs_completed']}")
    print(f"  Active: {stats['is_active']}")
    print(f"  Pricing:")
    for op_type, price in stats['pricing'].items():
        print(f"    {op_type:20} {price:.6f} USDC/op")


# Example 7: List Active Workers
# ===============================

async def example_list_active_workers():
    """List all active workers meeting criteria."""

    # Find all gold-tier workers with reputation >= 70
    workers = await marketplace.list_active_workers(
        min_reputation=70.0,
        performance_tier="gold",
    )

    print(f"Found {len(workers)} gold-tier workers with reputation >= 70:")
    for worker in workers:
        print(f"  {worker['worker_id']:15} "
              f"Reputation: {worker['reputation_score']:5.1f} "
              f"Earned: {worker['total_earned']:8.2f} USDC "
              f"Jobs: {worker['jobs_completed']:4}")


# Example 8: Complete Workflow
# =============================

async def example_complete_workflow():
    """Complete workflow from job submission to payment."""

    # Step 1: Estimate cost
    circuit = "h q[0]; cx q[0],q[1]; qft q[0];"
    estimate = await marketplace.estimate_job_cost(circuit)
    print(f"Step 1: Estimated cost: {estimate['total_usdc']} USDC")

    # Step 2: Get operation counts from estimate
    operations = estimate['operation_counts']
    print(f"Step 2: Operations needed: {operations}")

    # Step 3: Route operations to workers
    routing = await marketplace.route_operations(operations)
    print(f"Step 3: Routed to {len(routing)} workers")

    # Step 4: Execute job (not shown - handled by execution service)
    job_id = "job_98765"
    job_successful = True  # Assume success

    # Step 5: Distribute payments
    worker_payments = [
        {"worker_id": assignment["worker_id"], "amount": assignment["total_cost"]}
        for assignment in routing
        if assignment.get("worker_id")
    ]

    payment_result = await marketplace.distribute_payment_to_workers(
        job_id=job_id,
        worker_payments=worker_payments,
        from_wallet_address="0xUSER_WALLET",
    )
    print(f"Step 5: Distributed {payment_result['total_distributed']} USDC to workers")

    # Step 6: Update worker reputations
    for assignment in routing:
        if assignment.get("worker_id"):
            await marketplace.update_worker_reputation(
                worker_id=assignment["worker_id"],
                job_success=job_successful,
            )
    print(f"Step 6: Updated reputations for {len(routing)} workers")


# Circuit Parsing Examples
# ========================

def example_circuit_parsing():
    """Demonstrate circuit parsing capabilities."""

    test_circuits = {
        "Bell State": """
            h q[0];
            cx q[0],q[1];
        """,

        "GHZ State": """
            h q[0];
            cx q[0],q[1];
            cx q[1],q[2];
        """,

        "Quantum Fourier Transform": """
            qft q[0];
        """,

        "Quantum Teleportation": """
            teleport q[0],q[1];
        """,

        "Mixed Gates": """
            h q[0];
            x q[1];
            y q[2];
            z q[3];
            rx q[0];
            ry q[1];
            rz q[2];
            t q[3];
            s q[4];
        """,
    }

    # Note: Actual parsing happens internally in estimate_job_cost()
    # This is just to show what circuits look like

    print("Sample circuits for cost estimation:")
    for name, circuit in test_circuits.items():
        print(f"\n{name}:")
        print(circuit.strip())


# Edge Cases and Error Handling
# ==============================

async def example_edge_cases():
    """Demonstrate edge case handling."""

    # Edge Case 1: No workers available for operation
    try:
        routing = await marketplace.route_operations({"custom_unknown_op": 5})
        # Result will include error message in routing assignment
        for assignment in routing:
            if assignment.get('error'):
                print(f"Expected error: {assignment['error']}")
    except Exception as e:
        print(f"Error: {e}")

    # Edge Case 2: Worker not found
    try:
        await marketplace.update_worker_reputation("nonexistent_worker", True)
    except ValueError as e:
        print(f"Expected error: {e}")

    # Edge Case 3: Empty circuit
    try:
        estimate = await marketplace.estimate_job_cost("")
    except ValueError as e:
        print(f"Expected error: {e}")

    # Edge Case 4: Negative pricing (should be rejected)
    try:
        await marketplace.register_worker_pricing(
            worker_id="bad_worker",
            pricing={"hadamard": -0.001},  # Invalid negative price
            performance_tier="bronze",
        )
    except ValueError as e:
        print(f"Expected error: {e}")


if __name__ == "__main__":
    print(__doc__)
    print("\nThis file contains usage examples for MarketplaceService.")
    print("Run individual example functions in an async context to see them in action.")
