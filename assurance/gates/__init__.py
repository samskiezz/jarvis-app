"""Safety gates: dangerous-command list, approval, dry-run enforcement."""
from .approval import ApprovalRequired  # noqa: F401
from .dangerous import DANGEROUS_COMMANDS, is_dangerous  # noqa: F401
from .dry_run import enforce_dry_run  # noqa: F401

__all__ = ["DANGEROUS_COMMANDS", "is_dangerous", "ApprovalRequired", "enforce_dry_run"]
