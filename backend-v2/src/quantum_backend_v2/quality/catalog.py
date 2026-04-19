"""Static service catalog shared by discovery and execution surfaces."""

from __future__ import annotations


KNOWN_SERVICE_IDS: tuple[str, ...] = (
    "bell_pair",
    "cnot",
    "controlled_unitary",
    "cz",
    "distillation",
    "hadamard",
    "measurement_feedforward",
    "programmable_gate",
    "qft",
    "syndrome_extraction",
    "teleportation",
)
