"""Invariant registry + runner."""
from .registry import REGISTRY, register, registered_names  # noqa: F401
from .runner import InvariantReport, InvariantResult, run_all  # noqa: F401

__all__ = [
    "REGISTRY",
    "register",
    "registered_names",
    "run_all",
    "InvariantReport",
    "InvariantResult",
]
