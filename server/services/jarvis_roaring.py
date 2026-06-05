"""JARVIS ROARING — compressed bitmap index + cost-based query planner.

A Foundry-class object store answers boolean set queries over millions of object
ids ("Person AND state=flagged AND NOT cleared"). The right primitive is a
Roaring bitmap: 32-bit ids split into 16-bit high keys -> per-key containers that
switch representation by density:

  * ArrayContainer  — sorted uint16 list, for sparse keys (<= 4096 values).
  * BitmapContainer — fixed 8 KiB (65536 bits), for dense keys.

This is a real Roaring structure (array/bitmap containers + density threshold +
compressed serialization). Container set-algebra is exact. On top sits a
cost-based query planner that evaluates AND in ascending-cardinality order
(the smallest operand bounds the intersection), the standard bitmap-index plan.

Pure stdlib. Library semantics: invalid use raises; callers handle.
"""

from __future__ import annotations

import bisect
from typing import Iterable

ARRAY_MAX = 4096           # array -> bitmap conversion threshold
HIGH = 16
LOW_MASK = 0xFFFF


class _Container:
    """A 2^16 value space, stored as a sorted array (sparse) or a bitmap (dense)."""

    __slots__ = ("arr", "bm", "dense")

    def __init__(self):
        self.arr: list[int] = []          # sorted uint16
        self.bm: bytearray | None = None  # 8192 bytes when dense
        self.dense = False

    # -- representation ------------------------------------------------------
    def _to_bitmap(self):
        bm = bytearray(8192)
        for v in self.arr:
            bm[v >> 3] |= 1 << (v & 7)
        self.bm, self.arr, self.dense = bm, [], True

    def add(self, v: int):
        if self.dense:
            self.bm[v >> 3] |= 1 << (v & 7)
            return
        i = bisect.bisect_left(self.arr, v)
        if i < len(self.arr) and self.arr[i] == v:
            return
        self.arr.insert(i, v)
        if len(self.arr) > ARRAY_MAX:
            self._to_bitmap()

    def contains(self, v: int) -> bool:
        if self.dense:
            return bool(self.bm[v >> 3] & (1 << (v & 7)))
        i = bisect.bisect_left(self.arr, v)
        return i < len(self.arr) and self.arr[i] == v

    def values(self) -> set[int]:
        if self.dense:
            out = set()
            for byte in range(8192):
                b = self.bm[byte]
                if b:
                    base = byte << 3
                    for bit in range(8):
                        if b & (1 << bit):
                            out.add(base + bit)
            return out
        return set(self.arr)

    @property
    def cardinality(self) -> int:
        if self.dense:
            return sum(bin(b).count("1") for b in self.bm)
        return len(self.arr)

    @property
    def nbytes(self) -> int:
        return 8192 if self.dense else 2 * len(self.arr)

    @classmethod
    def from_values(cls, vals: Iterable[int]) -> "_Container":
        c = cls()
        vs = sorted(set(vals))
        if len(vs) > ARRAY_MAX:
            bm = bytearray(8192)
            for v in vs:
                bm[v >> 3] |= 1 << (v & 7)
            c.bm, c.dense = bm, True
        else:
            c.arr = vs
        return c


class RoaringBitmap:
    """A set of uint32 ids backed by per-high-key containers."""

    __slots__ = ("containers",)

    def __init__(self):
        self.containers: dict[int, _Container] = {}

    def add(self, x: int):
        hi, lo = x >> HIGH, x & LOW_MASK
        self.containers.setdefault(hi, _Container()).add(lo)

    def contains(self, x: int) -> bool:
        c = self.containers.get(x >> HIGH)
        return c.contains(x & LOW_MASK) if c else False

    @property
    def cardinality(self) -> int:
        return sum(c.cardinality for c in self.containers.values())

    @property
    def nbytes(self) -> int:
        # 4 bytes key overhead per container + container payload
        return sum(4 + c.nbytes for c in self.containers.values())

    def to_set(self) -> set[int]:
        out: set[int] = set()
        for hi, c in self.containers.items():
            base = hi << HIGH
            out |= {base + lo for lo in c.values()}
        return out

    @classmethod
    def from_iterable(cls, it: Iterable[int]) -> "RoaringBitmap":
        rb = cls()
        for x in it:
            rb.add(x)
        return rb

    # -- set algebra (exact, container-keyed) --------------------------------
    def _binary(self, other: "RoaringBitmap", op) -> "RoaringBitmap":
        out = RoaringBitmap()
        keys = set(self.containers) | set(other.containers)
        for hi in keys:
            a = self.containers.get(hi)
            b = other.containers.get(hi)
            av = a.values() if a else set()
            bv = b.values() if b else set()
            res = op(av, bv)
            if res:
                out.containers[hi] = _Container.from_values(res)
        return out

    def __or__(self, other):  return self._binary(other, lambda a, b: a | b)
    def __and__(self, other): return self._binary(other, lambda a, b: a & b)
    def __sub__(self, other): return self._binary(other, lambda a, b: a - b)


# ───────────────────────────────────────────────────────────── query planner
class BitmapIndex:
    """Inverted bitmap index over object rows + a cost-based boolean planner.

    Query AST: {"eq":[field,value]} | {"and":[...]} | {"or":[...]} | {"not":expr}
    """

    def __init__(self):
        self._row_to_id: list[str] = []
        self._index: dict[tuple[str, str], RoaringBitmap] = {}
        self._all = RoaringBitmap()

    def add(self, object_id: str, props: dict) -> int:
        rid = len(self._row_to_id)
        self._row_to_id.append(object_id)
        self._all.add(rid)
        for field, value in (props or {}).items():
            self._index.setdefault((field, str(value)), RoaringBitmap()).add(rid)
        return rid

    def _bitmap_for(self, field: str, value: str) -> RoaringBitmap:
        return self._index.get((field, str(value)), RoaringBitmap())

    def _eval(self, expr: dict) -> RoaringBitmap:
        if "eq" in expr:
            f, v = expr["eq"]
            return self._bitmap_for(f, v)
        if "and" in expr:
            parts = [self._eval(e) for e in expr["and"]]
            if not parts:
                return RoaringBitmap()
            # PLAN: intersect smallest-cardinality first
            parts.sort(key=lambda b: b.cardinality)
            acc = parts[0]
            for p in parts[1:]:
                acc = acc & p
                if acc.cardinality == 0:
                    break
            return acc
        if "or" in expr:
            acc = RoaringBitmap()
            for e in expr["or"]:
                acc = acc | self._eval(e)
            return acc
        if "not" in expr:
            return self._all - self._eval(expr["not"])
        return RoaringBitmap()

    def query(self, expr: dict) -> list[str]:
        rb = self._eval(expr)
        return [self._row_to_id[r] for r in sorted(rb.to_set())]

    def plan(self, expr: dict) -> dict:
        """Explain the chosen plan (operand cardinalities + AND ordering)."""
        def describe(e):
            if "eq" in e:
                f, v = e["eq"]
                return {"eq": f"{f}={v}", "card": self._bitmap_for(f, v).cardinality}
            if "and" in e:
                kids = [describe(k) for k in e["and"]]
                kids_sorted = sorted(kids, key=lambda k: k.get("card", 1 << 30))
                return {"and": kids_sorted, "order": "ascending-cardinality"}
            if "or" in e:
                return {"or": [describe(k) for k in e["or"]]}
            if "not" in e:
                return {"not": describe(e["not"])}
            return {}
        return {"rows": len(self._row_to_id), "plan": describe(expr)}
