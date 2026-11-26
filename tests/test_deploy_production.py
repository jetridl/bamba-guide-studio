"""Exercise production deployment failure paths with a simulated Docker host.

The real bash, tar, checksums and filesystem are used; Docker and HTTP calls are
replaced so these tests can never touch a database or production installation.
Linux CI provides the host utilities required by the production script.
"""

from __future__ import annotations

import hashlib
import fcntl
import json
import os
import shutil
import subprocess
import tarfile
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/deploy-production.sh"
pytestmark = pytest.mark.skipif(
    not all(shutil.which(tool) for tool in ("flock", "sha256sum", "realpath")),
    reason="Production deployment tests require Linux host utilities",
)


@pytest.fixture
def host(tmp_path: Path) -> dict:
    studio = tmp_path / "studio"
    release = tmp_path / "release"
    exports = tmp_path / "data" / "exports"
    binaries = tmp_path / "bin"
    for directory in (studio, release, exports, binaries, studio / "guides"):
        directory.mkdir(parents=True, exist_ok=True)
    (exports / "authored.json").write_text('{"version": 7}')
    (studio / "guides" / "poem.json").symlink_to("../../data/exports/authored.json")
    (studio / ".env").write_text("DB_PASSWORD='do$not#execute'\nSTUDIO_IMAGE_TAG=old\nCONTENT_SYNC_ENABLED=true\n")
    (studio / ".env").chmod(0o600)
    (studio / "compose.prod.yml").write_text("old compose\n")
    (release / "compose.prod.yml").write_text("new compose\n")
    (release / "IMAGE_TAG").write_text("release-test\n")
    (release / "SOURCE_COMMIT").write_text("a" * 40 + "\n")
    (release / "bamba-studio-images.tar.gz").write_bytes(b"simulated Docker images")
    checksums = "".join(
        f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n"
        for path in sorted(release.iterdir())
    )
    (release / "SHA256SUMS").write_text(checksums)
    log = tmp_path / "calls.jsonl"
    executable = '''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
with open(os.environ["CALL_LOG"], "a") as log:
    log.write(json.dumps([Path(sys.argv[0]).name, *args]) + "\\n")
if Path(sys.argv[0]).name == "curl":
    sys.exit(22 if os.environ.get("FAIL_AT") == "health" else 0)
if args[:2] != ["-n", "docker"]:
    sys.exit("Unexpected privileged command")
args = args[2:]
if args[:2] == ["image", "inspect"]:
    print("linux/amd64")
elif args[0] == "compose":
    if "config" in args and "--format" in args:
        print(json.dumps({"services": {"backend": {"volumes": [
            {"target": "/srv/exports", "source": os.environ["EXPORTS"]}
        ]}}}))
    elif "pg_dump" in args:
        if os.environ.get("FAIL_AT") == "backup":
            sys.exit(1)
        print("simulated database dump")
    elif "up" in args and os.environ.get("FAIL_AT") == "startup":
        sys.exit(1)
'''
    for name in ("sudo", "curl"):
        path = binaries / name
        path.write_text(executable)
        path.chmod(0o755)
    environment = {
        **os.environ,
        "PATH": f"{binaries}:{os.environ['PATH']}",
        "EXPORTS": str(exports),
        "CALL_LOG": str(log),
        "STUDIO_BACKUP_DIR": str(tmp_path / "backups"),
    }
    return {"studio": studio, "release": release, "exports": exports, "env": environment, "log": log}


def run(host: dict, failure: str = "") -> subprocess.CompletedProcess:
    return subprocess.run(
        ["bash", str(SCRIPT), str(host["release"]), str(host["studio"])],
        env={**host["env"], "FAIL_AT": failure},
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )


def calls(host: dict) -> list[list[str]]:
    return [json.loads(line) for line in host["log"].read_text().splitlines()]


def test_release_backs_up_editorial_state_and_preserves_secrets(host: dict) -> None:
    result = run(host)
    assert result.returncode == 0, result.stdout + result.stderr
    assert (host["studio"] / ".env").read_text() == (
        "DB_PASSWORD='do$not#execute'\nCONTENT_SYNC_ENABLED=true\nSTUDIO_IMAGE_TAG=release-test\n"
    )
    assert (host["studio"] / ".env").stat().st_mode & 0o777 == 0o600
    backup = next(Path(host["env"]["STUDIO_BACKUP_DIR"]).iterdir())
    assert "STUDIO_IMAGE_TAG=old" in (backup / "production.env").read_text()
    assert (backup / "compose.prod.yml").read_text() == "old compose\n"
    assert (backup / "database.dump").stat().st_size > 0
    with tarfile.open(backup / "content.tar.gz") as archive:
        assert archive.getmember("guides/poem.json").issym()
        assert archive.extractfile("exports/authored.json").read() == b'{"version": 7}'
    assert (host["exports"] / "authored.json").read_text() == '{"version": 7}'
    assert (host["studio"] / "guides/poem.json").is_symlink()
    assert not (host["release"] / "bamba-studio-images.tar.gz").exists()
    operations = calls(host)
    stop = next(i for i, call in enumerate(operations) if "stop" in call)
    dump = next(i for i, call in enumerate(operations) if "pg_dump" in call)
    start = next(i for i, call in enumerate(operations) if "up" in call)
    assert stop < dump < start
    assert "do$not#execute" not in result.stdout + result.stderr


def test_bad_checksum_does_not_touch_running_services(host: dict) -> None:
    (host["release"] / "compose.prod.yml").write_text("tampered")
    result = run(host)
    assert result.returncode != 0
    assert not host["log"].exists()
    assert "STUDIO_IMAGE_TAG=old" in (host["studio"] / ".env").read_text()


def test_failed_backup_restarts_previous_release_without_activating(host: dict) -> None:
    result = run(host, "backup")
    assert result.returncode != 0
    operations = calls(host)
    assert any("start" in call for call in operations)
    assert not any("up" in call for call in operations)
    assert "STUDIO_IMAGE_TAG=old" in (host["studio"] / ".env").read_text()
    assert (host["studio"] / "compose.prod.yml").read_text() == "old compose\n"


@pytest.mark.parametrize("failure", ["startup", "health"])
def test_failed_activation_retains_recovery_material(host: dict, failure: str) -> None:
    result = run(host, failure)
    assert result.returncode != 0
    assert "Backups:" in result.stderr
    assert (host["release"] / "bamba-studio-images.tar.gz").exists()
    assert not (host["studio"] / ".deployed-release").exists()
    assert any("logs" in call for call in calls(host))


def test_checkout_exports_are_rejected_before_stopping_services(host: dict) -> None:
    host["env"]["EXPORTS"] = str(host["studio"] / "guides")
    result = run(host)
    assert result.returncode != 0
    assert "Migrate authoritative exports" in result.stderr
    assert not any("stop" in call for call in calls(host))


def test_second_deployment_cannot_acquire_server_lock(host: dict) -> None:
    with (host["studio"] / ".deploy.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        result = run(host)
    assert result.returncode != 0
    assert "Another deployment" in result.stderr
    assert not host["log"].exists()
