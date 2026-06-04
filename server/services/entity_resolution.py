"""ENTITY RESOLUTION — fuzzy match a new record to existing ontology objects.

Pure-python, deterministic, never raises. Given an incoming record (a dict with
at least a ``label``/``name`` and optional ``props``) it scores it against every
existing object and returns ranked candidates with human-readable reasons. A
``merge`` helper unions two objects' props keeping the canonical (primary) one.

Scoring (all in [0,1], blended into a single ``score``):
  * name similarity      — normalised edit-distance + token Jaccard on labels.
  * prop-value overlap    — shared/near-identical prop values (emails, phones…).
  * type agreement        — small bonus when both share the same ``type``.

Public surface:
  * ``score_pair(a, b) -> float``
  * ``candidates(record, objects, *, limit=10, threshold=0.0) -> list[dict]``
  * ``merge(primary_id, duplicate_id, objects=None) -> dict``
"""

from __future__ import annotations

import re
from typing import Any, Optional

_TOKEN_RE = re.compile(r"[a-z0-9]+")
_NONALNUM = re.compile(r"[^a-z0-9]+")


def _tokens(text: str) -> set[str]:
    if not text:
        return set()
    return set(_TOKEN_RE.findall(text.lower()))


def _norm(text: str) -> str:
    """Lowercase + strip non-alphanumerics (for value-equality comparisons)."""
    if text is None:
        return ""
    return _NONALNUM.sub("", str(text).lower())


def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost))
        prev = cur
    return prev[-1]


def _edit_sim(a: str, b: str) -> float:
    """Normalised edit similarity in [0,1]."""
    a = (a or "").lower()
    b = (b or "").lower()
    if not a and not b:
        return 1.0
    m = max(len(a), len(b))
    if m == 0:
        return 1.0
    return 1.0 - (_levenshtein(a, b) / m)


def _jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def _label_of(rec: dict) -> str:
    if not isinstance(rec, dict):
        return ""
    for k in ("label", "name", "title"):
        v = rec.get(k)
        if v:
            return str(v)
    return ""


def _props_of(rec: dict) -> dict:
    if not isinstance(rec, dict):
        return {}
    p = rec.get("props")
    return p if isinstance(p, dict) else {}


def _name_similarity(a_label: str, b_label: str) -> float:
    """Blend whole-string edit similarity with token Jaccard."""
    edit = _edit_sim(a_label, b_label)
    jac = _jaccard(_tokens(a_label), _tokens(b_label))
    return 0.5 * edit + 0.5 * jac


def _prop_overlap(a_props: dict, b_props: dict) -> tuple[float, list[str]]:
    """Fraction of comparable prop values that match (exactly or fuzzily).

    Returns (score, reasons). Compares values under matching keys (case-insensitive)
    and, for any unmatched values, looks for a strong fuzzy match anywhere.
    """
    if not a_props or not b_props:
        return 0.0, []

    a_lc = {str(k).lower(): v for k, v in a_props.items()}
    b_lc = {str(k).lower(): v for k, v in b_props.items()}

    reasons: list[str] = []
    matches = 0
    comparisons = 0
    shared_keys = set(a_lc) & set(b_lc)
    for k in shared_keys:
        comparisons += 1
        av, bv = _norm(a_lc[k]), _norm(b_lc[k])
        if av and bv and (av == bv or _edit_sim(av, bv) >= 0.9):
            matches += 1
            reasons.append(f"prop '{k}' matches ({a_lc[k]})")

    # Also reward identical values appearing under *different* keys (e.g. Email).
    a_vals = {_norm(v): k for k, v in a_lc.items() if _norm(v)}
    b_vals = {_norm(v): k for k, v in b_lc.items() if _norm(v)}
    cross = set(a_vals) & set(b_vals)
    for val in cross:
        ak, bk = a_vals[val], b_vals[val]
        if ak in shared_keys and bk in shared_keys:
            continue  # already counted above
        comparisons += 1
        matches += 1
        reasons.append(f"shared value '{a_lc[ak]}' ({ak}/{bk})")

    if comparisons == 0:
        return 0.0, []
    return matches / comparisons, reasons


def score_pair(a: dict, b: dict) -> float:
    """Overall similarity in [0,1] between two records/objects. Never raises."""
    try:
        a_label, b_label = _label_of(a), _label_of(b)
        a_props, b_props = _props_of(a), _props_of(b)

        name = _name_similarity(a_label, b_label)
        prop, _ = _prop_overlap(a_props, b_props)

        type_bonus = 0.0
        at, bt = str(a.get("type", "")).lower(), str(b.get("type", "")).lower()
        if at and bt:
            type_bonus = 0.1 if at == bt else -0.05

        # Weighted blend. Name dominates; props confirm; type nudges.
        if a_props and b_props:
            base = 0.6 * name + 0.4 * prop
        else:
            base = name
        score = base + type_bonus
        return float(max(0.0, min(1.0, score)))
    except Exception:  # noqa: BLE001 - never raise
        return 0.0


def candidates(
    record: dict,
    objects: list[dict],
    *,
    limit: int = 10,
    threshold: float = 0.0,
) -> list[dict]:
    """Rank existing ``objects`` as candidate matches for ``record``.

    Returns ``[{id, label, type, score, reasons}]`` sorted by descending score.
    Never raises; bad input yields ``[]``.
    """
    try:
        if not isinstance(record, dict) or not objects:
            return []
        try:
            limit = int(limit)
        except (TypeError, ValueError):
            limit = 10
        if limit <= 0:
            limit = 10

        rec_label = _label_of(record)
        rec_props = _props_of(record)
        rec_id = record.get("id")

        out: list[dict] = []
        for idx, obj in enumerate(objects):
            if not isinstance(obj, dict):
                continue
            if rec_id is not None and obj.get("id") == rec_id:
                continue  # don't match a record to itself
            score = score_pair(record, obj)
            if score < threshold:
                continue

            reasons: list[str] = []
            name = _name_similarity(rec_label, _label_of(obj))
            if name >= 0.85:
                reasons.append(f"name very similar ({name:.2f})")
            elif name >= 0.5:
                reasons.append(f"name partly similar ({name:.2f})")
            _, prop_reasons = _prop_overlap(rec_props, _props_of(obj))
            reasons.extend(prop_reasons)
            if str(record.get("type", "")).lower() and str(record.get("type", "")).lower() == str(obj.get("type", "")).lower():
                reasons.append(f"same type ({obj.get('type')})")

            out.append(
                {
                    "id": obj.get("id"),
                    "label": obj.get("label"),
                    "type": obj.get("type"),
                    "score": round(float(score), 6),
                    "reasons": reasons,
                }
            )
        # Deterministic: sort by score desc, then stable by id for ties.
        out.sort(key=lambda c: (-c["score"], str(c.get("id"))))
        return out[:limit]
    except Exception:  # noqa: BLE001 - never raise
        return []


def _find(objects: list[dict], obj_id: Any) -> Optional[dict]:
    for o in objects:
        if isinstance(o, dict) and o.get("id") == obj_id:
            return o
    return None


def merge(
    primary_id: Any,
    duplicate_id: Any,
    objects: Optional[list[dict]] = None,
) -> dict:
    """Merge ``duplicate`` into ``primary``, keeping the canonical (primary).

    Unions props (primary wins on conflict), records the absorbed id, and returns
    ``{"merged": <object>, "absorbed": <duplicate_id>, "primary": <primary_id>}``.
    If ``objects`` is omitted the static ontology seed is used. Never raises.
    """
    try:
        if objects is None:
            try:
                from ..data.ontology import OBJECTS

                objects = [dict(o) for o in OBJECTS]
            except Exception:  # noqa: BLE001
                objects = []

        primary = _find(objects, primary_id)
        dup = _find(objects, duplicate_id)

        if primary is None and dup is None:
            return {"merged": None, "primary": primary_id, "absorbed": duplicate_id, "ok": False}
        if primary is None:
            # Nothing to merge into — promote the duplicate as canonical.
            return {"merged": dict(dup), "primary": primary_id, "absorbed": duplicate_id, "ok": False}

        merged = dict(primary)
        merged_props = dict(_props_of(primary))
        if dup is not None:
            for k, v in _props_of(dup).items():
                # Union: keep primary's value on conflict, add dup-only keys.
                if k not in merged_props or merged_props[k] in (None, "", []):
                    merged_props[k] = v
        merged["props"] = merged_props

        # Track provenance of the merge.
        absorbed = list(merged.get("absorbed_ids") or [])
        if duplicate_id is not None and duplicate_id not in absorbed:
            absorbed.append(duplicate_id)
        if absorbed:
            merged["absorbed_ids"] = absorbed

        return {
            "merged": merged,
            "primary": primary_id,
            "absorbed": duplicate_id,
            "ok": True,
        }
    except Exception:  # noqa: BLE001 - never raise
        return {"merged": None, "primary": primary_id, "absorbed": duplicate_id, "ok": False}
