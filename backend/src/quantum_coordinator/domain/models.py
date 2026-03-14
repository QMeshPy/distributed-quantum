"""Core domain models shared across coordinator modules."""

from __future__ import annotations

from enum import Enum


class GateType(str, Enum):
    """Gate services supported by service nodes."""

    HADAMARD = "hadamard"
    CNOT = "cnot"
    CZ = "cz"
    CONTROLLED_UNITARY = "controlled_unitary"
    PROGRAMMABLE_GATE = "programmable_gate"
    QFT = "qft"
    TELEPORTATION = "teleportation"
    BELL_PAIR = "bell_pair"
    SYNDROME_EXTRACTION = "syndrome_extraction"
    DISTILLATION = "distillation"
    MEASUREMENT_FEEDFORWARD = "measurement_feedforward"


class JobStatus(str, Enum):
    """Job lifecycle states used by API and runtime."""

    QUEUED = "QUEUED"
    COMPILING = "COMPILING"
    RESERVING = "RESERVING"
    EXECUTING = "EXECUTING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
