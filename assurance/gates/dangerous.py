"""Dangerous-command registry.

Any command whose name is in DANGEROUS_COMMANDS (or matches any
DANGEROUS_PREFIXES) must EITHER be dispatched with dry_run=True OR with
approved=True. The CommandBus enforces this in dispatch().
"""
from __future__ import annotations

DANGEROUS_COMMANDS: set[str] = {
    # GPU lifecycle
    "gpu.dispose",
    "gpu.destroy",
    "gpu.launch_disposable",
    "gpu.provision",
    # Storage / data
    "storage.delete",
    "storage.purge",
    "storage.prune",
    "wasabi.delete",
    # Process control
    "process.kill",
    "pm2.delete",
    "pm2.restart",
    # Deploy / VCS
    "git.push.force",
    "deploy.production",
    "deploy.rollback",
    # External effects
    "email.send",
    "sms.send",
    "slack.send",
    "payment.execute",
    # Filesystem
    "fs.rm",
    "fs.rmtree",
    "fs.truncate",
    # Claude / agent
    "claude.run.kill",
    "agent.cancel",
}

DANGEROUS_PREFIXES: tuple[str, ...] = (
    "delete.",
    "destroy.",
    "drop.",
    "purge.",
    "wipe.",
    "rm.",
)


def is_dangerous(name: str) -> bool:
    if not name:
        return False
    if name in DANGEROUS_COMMANDS:
        return True
    return any(name.startswith(p) for p in DANGEROUS_PREFIXES)


def mark_dangerous(name: str) -> None:
    """Register an additional command name at runtime."""
    DANGEROUS_COMMANDS.add(name)
