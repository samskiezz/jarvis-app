"""Minimal in-memory metrics (no external dep).

Counter, Gauge, Histogram with a flat registry. Prometheus-style export comes
from telemetry/export.py.
"""
from __future__ import annotations

import threading
import time
from typing import Any

_LOCK = threading.RLock()


class _Metric:
    def __init__(self, name: str, *, help: str = "") -> None:
        self.name = name
        self.help = help


class Counter(_Metric):
    def __init__(self, name: str, *, help: str = "") -> None:
        super().__init__(name, help=help)
        self._value = 0.0

    def inc(self, n: float = 1.0) -> None:
        with _LOCK:
            self._value += float(n)

    @property
    def value(self) -> float:
        with _LOCK:
            return self._value


class Gauge(_Metric):
    def __init__(self, name: str, *, help: str = "") -> None:
        super().__init__(name, help=help)
        self._value = 0.0

    def set(self, v: float) -> None:
        with _LOCK:
            self._value = float(v)

    def inc(self, n: float = 1.0) -> None:
        with _LOCK:
            self._value += float(n)

    def dec(self, n: float = 1.0) -> None:
        with _LOCK:
            self._value -= float(n)

    @property
    def value(self) -> float:
        with _LOCK:
            return self._value


class Histogram(_Metric):
    """Bucketed histogram. Default buckets cover sub-millisecond → 60s.

    `observe(seconds)` for latency; the registry is generic so non-time scales
    also work.
    """

    DEFAULT_BUCKETS: tuple[float, ...] = (0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5,
                                         1.0, 2.5, 5.0, 10.0, 30.0, 60.0)

    def __init__(self, name: str, *, help: str = "",
                 buckets: tuple[float, ...] | None = None) -> None:
        super().__init__(name, help=help)
        self.buckets = buckets or self.DEFAULT_BUCKETS
        self._counts: list[int] = [0] * len(self.buckets)
        self._sum = 0.0
        self._count = 0

    def observe(self, v: float) -> None:
        v = float(v)
        with _LOCK:
            self._sum += v
            self._count += 1
            for i, b in enumerate(self.buckets):
                if v <= b:
                    self._counts[i] += 1
                    break

    def snapshot(self) -> dict[str, Any]:
        with _LOCK:
            return {
                "buckets": list(self.buckets),
                "counts": list(self._counts),
                "sum": self._sum,
                "count": self._count,
                "avg": (self._sum / self._count) if self._count else 0.0,
            }


class _Registry:
    def __init__(self) -> None:
        self._items: dict[str, _Metric] = {}
        self._created_at = time.time()

    def counter(self, name: str, *, help: str = "") -> Counter:
        with _LOCK:
            m = self._items.get(name)
            if isinstance(m, Counter):
                return m
            c = Counter(name, help=help)
            self._items[name] = c
            return c

    def gauge(self, name: str, *, help: str = "") -> Gauge:
        with _LOCK:
            m = self._items.get(name)
            if isinstance(m, Gauge):
                return m
            g = Gauge(name, help=help)
            self._items[name] = g
            return g

    def histogram(self, name: str, *, help: str = "",
                  buckets: tuple[float, ...] | None = None) -> Histogram:
        with _LOCK:
            m = self._items.get(name)
            if isinstance(m, Histogram):
                return m
            h = Histogram(name, help=help, buckets=buckets)
            self._items[name] = h
            return h

    def export(self) -> dict[str, Any]:
        out: dict[str, Any] = {"_meta": {"created_at": self._created_at, "now": time.time()}}
        with _LOCK:
            for n, m in self._items.items():
                if isinstance(m, Counter):
                    out[n] = {"kind": "counter", "value": m.value, "help": m.help}
                elif isinstance(m, Gauge):
                    out[n] = {"kind": "gauge", "value": m.value, "help": m.help}
                elif isinstance(m, Histogram):
                    out[n] = {"kind": "histogram", **m.snapshot(), "help": m.help}
        return out


registry = _Registry()
