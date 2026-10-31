"""The launcher must not manage unrelated processes or delete runtime state."""

import os
import shutil
import subprocess
from pathlib import Path


def launcher(tmp_path):
    script = tmp_path / "scripts" / "demo-start.sh"
    script.parent.mkdir()
    shutil.copyfile(Path(__file__).parents[2] / "scripts" / "demo-start.sh", script)
    binary = tmp_path / ".venv" / "bin" / "quantum-backend"
    binary.parent.mkdir(parents=True)
    binary.write_text('#!/bin/sh\nprintf "arg:%s\\n" "$@"\n')
    binary.chmod(0o700)
    # Any attempt to manage ports is a regression, without touching actual processes.
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    lsof = fake_bin / "lsof"
    lsof.write_text("#!/bin/sh\necho unsafe-port-management >&2\nexit 1\n")
    lsof.chmod(0o700)
    return script, {**os.environ, "PATH": f"{fake_bin}:{os.environ['PATH']}"}


def test_launcher_passes_cli_options_without_overriding_host_or_port(tmp_path):
    script, env = launcher(tmp_path)
    result = subprocess.run(
        ["bash", str(script), "--port", "9090"], env=env, capture_output=True, text=True, timeout=10
    )
    assert result.returncode == 0
    assert result.stdout == "arg:--port\narg:9090\n"
    assert not result.stderr


def test_launcher_rejects_clean_without_deleting_state(tmp_path):
    script, env = launcher(tmp_path)
    data = tmp_path / "quantum-backend" / "peer-logs" / "events.jsonl"
    data.parent.mkdir(parents=True)
    data.write_text("keep")
    result = subprocess.run(
        ["bash", str(script), "--clean"], env=env, capture_output=True, text=True, timeout=10
    )
    assert result.returncode != 0
    assert data.read_text() == "keep"
    assert "no longer deletes" in result.stderr
