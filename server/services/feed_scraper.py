"""FEED SCRAPER — declarative, config-driven ingestion into the History Lake.

The existing adapters (``live_data``, ``ingestion``) each hard-code one source,
so adding a feed means writing new Python. This module is the generic version:
describe a feed *declaratively* (a small dict) and get throttling, caching,
retry/backoff, idempotent storage, and run-audit for free — the same rails the
hand-written adapters use:

  * HTTP via ``net_ratelimit.polite_get`` (per-host throttle + cache + backoff).
  * Storage via ``history_lake.upsert_series`` / ``write_observations``.
  * Audit via ``history_lake.start_feed_run`` / ``finish_feed_run``.
  * Errors surfaced via ``feedback_bus.record`` — one feed failing never aborts
    the others.

A *feed spec* is a JSON object::

    {
      "name":         "worldbank_co2",        # unique id (config/CLI selection)
      "source":       "worldbank",            # series.source label
      "entity":       "WLD",                  # series.entity (static; or use entity_field)
      "metric":       "co2_emissions",        # series.metric
      "unit":         "kt",                   # series.unit (optional)
      "freq":         "1y",                   # series.freq
      "url":          "https://api.worldbank.org/v2/country/WLD/indicator/EN.ATM.CO2E.KT?format=json&per_page=300",
      "records_path": "1",                    # dotted/index path to the list of records
      "time_field":   "date",                 # field within each record holding the timestamp
      "time_format":  "year",                 # epoch_ms | epoch_s | iso | date | year | auto
      "value_field":  "value",                # field within each record holding the numeric value
      "entity_field": null,                   # optional: group records into per-entity series
      "ttl":          3600,                    # cache TTL seconds for the fetch
      "enabled":      true,
      "headers":      {}                       # optional extra request headers
    }

Both ``records_path`` and the field names support a dotted path with integer
list indices, so ``"1"`` selects the second top-level element and
``"data.items"`` walks nested dicts.

Specs come from ``DEFAULT_FEEDS`` (a couple of public, key-less examples) merged
with an optional JSON config file at ``$FEEDS_CONFIG`` (default
``server/data/feeds.json``); file specs override built-ins by ``name``.

Run modes::

    python -m server.services.feed_scraper list           # list resolved specs
    python -m server.services.feed_scraper selftest        # offline parser self-test
    python -m server.services.feed_scraper once [name...]  # run all (or named) feeds once
    python -m server.services.feed_scraper forever         # loop on $FEEDS_INTERVAL_S (default 3600)
"""

from __future__ import annotations

import json
import math
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from . import history_lake as lake

# ── Config location ───────────────────────────────────────────────────────────
_DEFAULT_CONFIG = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "feeds.json"
)


def _config_path() -> str:
    return os.environ.get("FEEDS_CONFIG", _DEFAULT_CONFIG)


# Built-in, public, key-less examples. They double as a smoke test and as
# documentation of the spec shape. The World Bank API returns
# ``[ {page metadata}, [ {date, value, ...}, ... ] ]`` — hence records_path "1".
DEFAULT_FEEDS: list[dict] = [
    {
        "name": "worldbank_co2",
        "source": "worldbank",
        "entity": "WLD",
        "metric": "co2_emissions",
        "unit": "Mt CO2e",
        "freq": "1y",
        "url": "https://api.worldbank.org/v2/country/WLD/indicator/EN.GHG.CO2.MT.CE.AR5?format=json&per_page=300",
        "records_path": "1",
        "time_field": "date",
        "time_format": "year",
        "value_field": "value",
        "ttl": 86400,
        "enabled": True,
    },
    {
        "name": "worldbank_population",
        "source": "worldbank",
        "entity": "WLD",
        "metric": "population",
        "unit": "people",
        "freq": "1y",
        "url": "https://api.worldbank.org/v2/country/WLD/indicator/SP.POP.TOTL?format=json&per_page=300",
        "records_path": "1",
        "time_field": "date",
        "time_format": "year",
        "value_field": "value",
        "ttl": 86400,
        "enabled": True,
    },
]


# ── Spec model ──────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class FeedSpec:
    name: str
    source: str
    entity: str
    metric: str
    url: str
    records_path: str = ""
    time_field: str = "t"
    time_format: str = "auto"
    value_field: str = "v"
    entity_field: Optional[str] = None
    unit: Optional[str] = None
    freq: str = "irregular"
    ttl: float = 3600.0
    enabled: bool = True
    headers: dict = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: dict) -> "FeedSpec":
        """Build a spec from a raw config dict, validating required keys."""
        missing = [k for k in ("name", "source", "entity", "metric", "url") if not d.get(k)]
        if missing:
            raise ValueError(f"feed spec missing required keys: {missing} ({d.get('name', '?')})")
        return cls(
            name=str(d["name"]),
            source=str(d["source"]),
            entity=str(d["entity"]),
            metric=str(d["metric"]),
            url=str(d["url"]),
            records_path=str(d.get("records_path", "")),
            time_field=str(d.get("time_field", "t")),
            time_format=str(d.get("time_format", "auto")),
            value_field=str(d.get("value_field", "v")),
            entity_field=(str(d["entity_field"]) if d.get("entity_field") else None),
            unit=(str(d["unit"]) if d.get("unit") else None),
            freq=str(d.get("freq", "irregular")),
            ttl=float(d.get("ttl", 3600.0)),
            enabled=bool(d.get("enabled", True)),
            headers=dict(d.get("headers") or {}),
        )


# ── Path + time helpers ───────────────────────────────────────────────────────
def _dig(obj: Any, path: str) -> Any:
    """Walk a dotted path into ``obj``. A segment that parses as an int indexes a
    list; otherwise it is a dict key. Empty path returns ``obj`` unchanged.
    Returns ``None`` if any segment is missing / out of range."""
    if path == "":
        return obj
    cur = obj
    for seg in path.split("."):
        if cur is None:
            return None
        if isinstance(cur, (list, tuple)):
            try:
                cur = cur[int(seg)]
            except (ValueError, IndexError):
                return None
        elif isinstance(cur, dict):
            cur = cur.get(seg)
        else:
            return None
    return cur


def _to_ms(raw: Any, fmt: str) -> Optional[int]:
    """Convert a raw timestamp value to epoch milliseconds per ``fmt``. Naive
    datetimes are assumed UTC. Returns ``None`` if it can't be parsed."""
    if raw is None:
        return None
    fmt = (fmt or "auto").lower()
    try:
        if fmt == "epoch_ms":
            return int(float(raw))
        if fmt == "epoch_s":
            return int(float(raw) * 1000)
        if fmt == "year":
            return _dt_to_ms(datetime(int(str(raw).strip()[:4]), 1, 1, tzinfo=timezone.utc))
        if fmt in ("iso", "date"):
            return _dt_to_ms(_parse_iso(str(raw)))
        # auto: numeric -> epoch (ms if it looks like ms, else s); else ISO.
        s = str(raw).strip()
        if s.replace(".", "", 1).isdigit():
            n = float(s)
            return int(n) if n >= 1e11 else int(n * 1000)
        return _dt_to_ms(_parse_iso(s))
    except (ValueError, TypeError, OverflowError):
        return None


def _parse_iso(s: str) -> Optional[datetime]:
    s = s.strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        # bare date fallback
        try:
            return datetime.strptime(s[:10], "%Y-%m-%d")
        except ValueError:
            return None


def _dt_to_ms(dt: Optional[datetime]) -> Optional[int]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def _coerce_value(raw: Any) -> Optional[float]:
    if raw is None or isinstance(raw, bool):
        return None
    try:
        v = float(raw)
    except (ValueError, TypeError):
        return None
    return v if math.isfinite(v) else None


# ── Spec loading ────────────────────────────────────────────────────────────────
def load_specs(config_path: Optional[str] = None) -> list[FeedSpec]:
    """Resolve specs: ``DEFAULT_FEEDS`` overlaid with the JSON config file (if
    present), keyed by ``name`` — a file entry replaces a built-in of the same
    name. Malformed entries are skipped (reported via feedback_bus) rather than
    aborting the whole load."""
    merged: dict[str, dict] = {d["name"]: d for d in DEFAULT_FEEDS}
    path = config_path or _config_path()
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                raw = json.load(fh)
            entries = raw.get("feeds", raw) if isinstance(raw, dict) else raw
            for d in entries or []:
                if isinstance(d, dict) and d.get("name"):
                    merged[d["name"]] = d
        except (OSError, ValueError) as exc:
            _report("config_error", f"{path}: {exc}", "error")
    specs: list[FeedSpec] = []
    for d in merged.values():
        try:
            specs.append(FeedSpec.from_dict(d))
        except ValueError as exc:
            _report("spec_invalid", str(exc), "warn")
    return specs


def _report(kind: str, detail: str, severity: str = "info") -> None:
    try:
        from . import feedback_bus as _fb

        _fb.record("server/services/feed_scraper.py", kind, detail[:200], severity)
    except Exception:  # noqa: BLE001 - telemetry must never break ingestion
        pass


# ── Core: run one feed ────────────────────────────────────────────────────────
def run_feed(spec: FeedSpec, *, db_path: Optional[str] = None) -> dict:
    """Fetch + parse + store one feed. Opens a feed_run, writes observations
    grouped by entity, closes the run with ok/partial/error. Never raises —
    returns a small audit dict ``{name, source, status, n_rows, n_series, error}``."""
    from . import net_ratelimit as nr

    run_id = lake.start_feed_run(spec.source, db_path=db_path)
    n_rows = 0
    n_series = 0
    status = "error"
    note: Optional[str] = None
    try:
        resp = nr.polite_get(spec.url, ttl=spec.ttl, headers=spec.headers or None)
        if not resp.get("ok"):
            note = f"fetch failed: HTTP {resp.get('status')} {resp.get('error') or ''}".strip()
        else:
            payload = resp.get("json")
            if payload is None:
                note = "response was not JSON"
            else:
                records = _dig(payload, spec.records_path)
                if not isinstance(records, list):
                    note = f"records_path {spec.records_path!r} did not resolve to a list"
                else:
                    # Group points by entity (static, or per-record via entity_field).
                    by_entity: dict[str, list[dict]] = {}
                    skipped = 0
                    for rec in records:
                        if not isinstance(rec, dict):
                            skipped += 1
                            continue
                        ts = _to_ms(_dig(rec, spec.time_field), spec.time_format)
                        val = _coerce_value(_dig(rec, spec.value_field))
                        if ts is None or val is None:
                            skipped += 1
                            continue
                        ent = spec.entity
                        if spec.entity_field:
                            raw_ent = _dig(rec, spec.entity_field)
                            ent = str(raw_ent) if raw_ent is not None else spec.entity
                        by_entity.setdefault(ent, []).append({"t": ts, "v": val})

                    for ent, pts in by_entity.items():
                        sid = lake.upsert_series(
                            spec.source, ent, spec.metric,
                            unit=spec.unit, freq=spec.freq, db_path=db_path,
                        )
                        n_rows += lake.write_observations(sid, pts, db_path=db_path)
                        n_series += 1

                    if n_rows:
                        status = "ok"
                    elif skipped and not by_entity:
                        status = "error"
                        note = f"no usable points ({skipped} records skipped)"
                    else:
                        status = "partial"
                        note = f"{skipped} records skipped" if skipped else "no new points"
    except Exception as exc:  # noqa: BLE001 - isolate per-feed failures
        status = "error"
        note = str(exc)[:200]

    lake.finish_feed_run(run_id, status=status, n_rows=n_rows, note=note, db_path=db_path)
    if status == "error":
        _report("feed_error", f"{spec.name}: {note}", "error")
    return {
        "name": spec.name, "source": spec.source, "status": status,
        "n_rows": n_rows, "n_series": n_series, "error": note if status == "error" else None,
    }


# ── Orchestration ─────────────────────────────────────────────────────────────
def scrape_feeds(names: Optional[list[str]] = None, *, db_path: Optional[str] = None) -> dict:
    """Run every enabled feed once (or only the named subset), fault-isolated.
    Suitable as a scheduler job. Returns a per-feed audit summary."""
    lake.init_db(db_path)
    specs = load_specs()
    if names:
        wanted = set(names)
        specs = [s for s in specs if s.name in wanted]
    else:
        specs = [s for s in specs if s.enabled]

    results: list[dict] = []
    for s in specs:
        try:
            results.append(run_feed(s, db_path=db_path))
        except Exception as exc:  # noqa: BLE001 - belt-and-braces isolation
            results.append({"name": s.name, "source": s.source, "status": "error",
                            "n_rows": 0, "n_series": 0, "error": str(exc)[:200]})
    total = sum(r.get("n_rows", 0) for r in results)
    return {"results": results, "total_rows": total, "n_feeds": len(results),
            "ts": int(time.time() * 1000)}


def run_forever(interval_s: Optional[float] = None) -> None:
    """Loop ``scrape_feeds`` every ``$FEEDS_INTERVAL_S`` seconds (default 3600).
    Mirrors live_data's loop: prints a one-line summary, never dies on a feed
    error."""
    interval = interval_s if interval_s is not None else float(os.environ.get("FEEDS_INTERVAL_S", "3600"))
    print(f"[feed_scraper] starting — scraping {len(load_specs())} feeds every {interval:.0f}s", flush=True)
    while True:
        t = time.time()
        try:
            r = scrape_feeds()
            ok = sum(1 for x in r["results"] if x["status"] == "ok")
            print(f"[feed_scraper] cycle {time.time()-t:.0f}s | {ok}/{r['n_feeds']} ok | "
                  f"+{r['total_rows']:,} rows", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"[feed_scraper] error: {str(exc)[:160]}", flush=True)
            _report("loop_error", str(exc)[:200], "error")
        time.sleep(interval)


# ── Offline self-test (no network) ──────────────────────────────────────────────
def _selftest() -> int:
    """Exercise the parsing helpers + run_feed against an in-memory DB and a
    monkeypatched fetcher, so the pipeline is verifiable offline. Returns 0 on
    pass, 1 on failure."""
    fails = []

    def check(name, got, want):
        if got != want:
            fails.append(f"{name}: got {got!r} want {want!r}")

    check("dig_index", _dig([{"a": 1}, [{"v": 2}]], "1.0.v"), 2)
    check("dig_missing", _dig({"a": {"b": 1}}, "a.c"), None)
    check("dig_empty", _dig({"x": 1}, ""), {"x": 1})
    check("ms_epoch_s", _to_ms(1700000000, "epoch_s"), 1700000000000)
    check("ms_epoch_ms", _to_ms(1700000000000, "epoch_ms"), 1700000000000)
    check("ms_year", _to_ms("2020", "year"), 1577836800000)
    check("ms_date", _to_ms("2020-01-01", "date"), 1577836800000)
    check("ms_iso_z", _to_ms("2020-01-01T00:00:00Z", "iso"), 1577836800000)
    check("ms_bad", _to_ms("not-a-date", "iso"), None)
    check("val_none", _coerce_value(None), None)
    check("val_bool", _coerce_value(True), None)
    check("val_str_num", _coerce_value("3.5"), 3.5)

    # End-to-end with a stubbed fetch + temp DB.
    from . import net_ratelimit as nr
    payload = [{"page": 1}, [
        {"date": "2021", "value": 10.0}, {"date": "2022", "value": 20.0},
        {"date": "2023", "value": None},  # skipped (no value)
    ]]
    orig = nr.polite_get
    nr.polite_get = lambda url, **kw: {"ok": True, "json": payload, "status": 200, "error": None}
    try:
        import tempfile
        db = os.path.join(tempfile.mkdtemp(), "selftest_lake.db")
        lake.init_db(db)  # run_feed assumes an initialised lake (scrape_feeds does this)
        spec = FeedSpec(name="t", source="t", entity="WLD", metric="m",
                        url="x", records_path="1", time_field="date",
                        time_format="year", value_field="value")
        res = run_feed(spec, db_path=db)
        check("e2e_status", res["status"], "ok")
        check("e2e_rows", res["n_rows"], 2)
        # idempotent re-run writes the same 2 rows, not 4 new series
        res2 = run_feed(spec, db_path=db)
        check("e2e_idempotent_rows", res2["n_rows"], 2)
        check("e2e_series_count", len(lake.list_series(db_path=db)), 1)
    finally:
        nr.polite_get = orig

    if fails:
        print("SELFTEST FAILED:")
        for f in fails:
            print("  -", f)
        return 1
    print("selftest OK")
    return 0


# ── CLI ────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys

    cmd = sys.argv[1] if len(sys.argv) > 1 else "once"
    if cmd == "list":
        for s in load_specs():
            flag = "on " if s.enabled else "off"
            print(f"[{flag}] {s.name:24s} {s.source}/{s.entity}/{s.metric} "
                  f"({s.freq}) <- {s.url[:70]}")
    elif cmd == "selftest":
        raise SystemExit(_selftest())
    elif cmd == "forever":
        run_forever()
    elif cmd == "once":
        names = sys.argv[2:] or None
        out = scrape_feeds(names)
        print(json.dumps(out, indent=2))
    else:
        print(__doc__)
        raise SystemExit(2)
