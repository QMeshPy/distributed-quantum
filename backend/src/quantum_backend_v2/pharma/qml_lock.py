"""One lock for all PennyLane work in a process.

PennyLane keeps its operation-recording stack in a class attribute that every thread shares, and
swaps it while building some operators, so two threads building circuits at once can crash with
"IndexError: pop from empty list". Peers running in this process (the embedded dev workers), the
coordinator's own fallback and the docking/scoring stages are all threads of one process, so each
holds this lock while it builds or runs a circuit. Real worker laptops are separate processes.
"""

import threading

QML_LOCK = threading.RLock()
