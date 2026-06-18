"""Prometheus-style text exporter (optional)."""
from __future__ import annotations

from .metrics import registry


def to_prometheus() -> str:
    out: list[str] = []
    data = registry.export()
    for name, m in data.items():
        if name == "_meta":
            continue
        if m["kind"] == "counter":
            out.append(f"# TYPE {name} counter")
            out.append(f"{name} {m['value']}")
        elif m["kind"] == "gauge":
            out.append(f"# TYPE {name} gauge")
            out.append(f"{name} {m['value']}")
        elif m["kind"] == "histogram":
            out.append(f"# TYPE {name} histogram")
            cum = 0
            for b, c in zip(m["buckets"], m["counts"]):
                cum += c
                out.append(f"{name}_bucket{{le=\"{b}\"}} {cum}")
            out.append(f"{name}_bucket{{le=\"+Inf\"}} {m['count']}")
            out.append(f"{name}_sum {m['sum']}")
            out.append(f"{name}_count {m['count']}")
    return "\n".join(out) + "\n"
