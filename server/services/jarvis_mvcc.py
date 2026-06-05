"""JARVIS MVCC — a bitemporal transaction layer (FoundationDB-style layer).

FoundationDB gives ordered KV + serializable transactions; the *bitemporal layer*
is what you build on top. This is that layer, implemented natively:

  * SNAPSHOT ISOLATION — a transaction reads the committed state as of the commit
    counter at begin(); concurrent commits are invisible to it.
  * OPTIMISTIC CONCURRENCY — at commit, if any key the txn read or wrote was
    committed by another txn after the snapshot, the txn ABORTS (ConflictError).
    This yields serializable behaviour for read-modify-write.
  * BITEMPORAL — every key keeps a history of versions along VALID time (when the
    fact was true) and TRANSACTION time (commit counter = when we learned it), so
    ``as_of(valid_time, tx_time)`` reconstructs the world at any (t, t') pair.

Pure stdlib, in-memory (the production layer persists versions to FDB/Iceberg;
the contract + semantics are identical).
"""

from __future__ import annotations

from dataclasses import dataclass

INF = float("inf")


class ConflictError(Exception):
    """Raised when an optimistic commit detects a read/write conflict."""


@dataclass
class _Version:
    value: object
    valid_from: float
    tx_commit: int          # commit counter = transaction time


class Store:
    def __init__(self):
        self._versions: dict[str, list[_Version]] = {}
        self._clock = 0     # last committed commit-id (transaction time)

    # bootstrap committed state outside a conflict window
    def seed(self, key: str, value, *, valid_from: float = 0.0):
        self._clock += 1
        self._versions.setdefault(key, []).append(_Version(value, valid_from, self._clock))

    def _latest_commit(self, key: str) -> int:
        vs = self._versions.get(key)
        return max((v.tx_commit for v in vs), default=0) if vs else 0

    def begin(self) -> "Txn":
        return Txn(self, snapshot=self._clock)

    def as_of(self, key: str, *, valid_time: float = INF, tx_time: int | None = None):
        """Historical read: value valid at ``valid_time`` as known at ``tx_time``."""
        tt = self._clock if tx_time is None else tx_time
        cands = [v for v in self._versions.get(key, [])
                 if v.tx_commit <= tt and v.valid_from <= valid_time]
        if not cands:
            return None
        best = max(cands, key=lambda v: (v.valid_from, v.tx_commit))
        return best.value


class Txn:
    def __init__(self, store: Store, snapshot: int):
        self._store = store
        self.snapshot = snapshot
        self._reads: set[str] = set()
        self._writes: dict[str, tuple[object, float]] = {}
        self.state = "open"

    def get(self, key: str, *, valid_time: float = INF):
        self._reads.add(key)
        if key in self._writes:                      # read-your-writes
            return self._writes[key][0]
        cands = [v for v in self._store._versions.get(key, [])
                 if v.tx_commit <= self.snapshot and v.valid_from <= valid_time]
        if not cands:
            return None
        return max(cands, key=lambda v: (v.valid_from, v.tx_commit)).value

    def put(self, key: str, value, *, valid_from: float = 0.0):
        self._writes[key] = (value, valid_from)

    def commit(self) -> int:
        if self.state != "open":
            raise ConflictError(f"txn not open ({self.state})")
        # optimistic validation: nobody committed our reads/writes after our snapshot
        for key in (self._reads | set(self._writes)):
            if self._store._latest_commit(key) > self.snapshot:
                self.state = "aborted"
                raise ConflictError(f"conflict on key '{key}'")
        cid = self._store._clock + 1
        self._store._clock = cid
        for key, (value, vf) in self._writes.items():
            self._store._versions.setdefault(key, []).append(_Version(value, vf, cid))
        self.state = "committed"
        return cid

    def abort(self):
        self.state = "aborted"
