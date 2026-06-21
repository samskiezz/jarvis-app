/**
 * DatasetFreshnessMonitor — F53
 *
 * Polls /v1/datasets every 60 s and calculates freshness for each dataset
 * based on last_updated / updated_at / last_sync / refreshed_at timestamps.
 *
 * Freshness tiers:
 *   FRESH   — updated < 1 h ago     (green)
 *   RECENT  — 1–6 h ago             (cyan)
 *   AGING   — 6–24 h ago            (amber)
 *   STALE   — > 24 h ago            (red)
 *   UNKNOWN — no timestamp field     (dim)
 *
 * When any dataset degrades from RECENT → AGING or AGING → STALE the
 * transition is announced via jarvis:speak-dossier.
 *
 * Toggle:  ◈ FRESH  at left:5408 in the bottom strip.
 * Event:   jarvis:dataset-freshness-toggle
 * Voice:   "dataset freshness" | "stale data" | "data freshness" |
 *          "fresh data" | "data age" | "dsfresh"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GN  = "#39FF14";
const AM  = "#F5A623";
const RD  = "#FF4444";
const DIM = "#4A6070";
const BG  = "rgba(3,5,9,0.97)";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL = 60_000;

const FRESHNESS_RE =
  /\b(dataset[\s-]?fresh|stale[\s-]?data|data[\s-]?fresh|fresh[\s-]?data|data[\s-]?age|dataset[\s-]?age|dsfresh)\b/i;

export function isDatasetFreshnessQuery(t) {
  return FRESHNESS_RE.test(t || "");
}

function getTimestamp(d) {
  return (
    d.last_updated ?? d.updated_at ?? d.last_sync ??
    d.refreshed_at ?? d.timestamp ?? null
  );
}

function freshnessOf(d) {
  const ts = getTimestamp(d);
  if (!ts) return { tier: "unknown", ageMs: null };
  const t = new Date(ts).getTime();
  if (isNaN(t)) return { tier: "unknown", ageMs: null };
  const ageMs = Date.now() - t;
  if (ageMs < 0)                    return { tier: "fresh",   ageMs: 0 };
  if (ageMs < 60 * 60_000)          return { tier: "fresh",   ageMs };
  if (ageMs < 6  * 60 * 60_000)     return { tier: "recent",  ageMs };
  if (ageMs < 24 * 60 * 60_000)     return { tier: "aging",   ageMs };
  return { tier: "stale", ageMs };
}

const TIER_COLOR = { fresh: GN, recent: CY, aging: AM, stale: RD, unknown: DIM };
const TIER_LABEL = { fresh: "FRESH", recent: "RECENT", aging: "AGING", stale: "STALE", unknown: "?" };
const TIER_ORDER = { fresh: 0, recent: 1, aging: 2, stale: 3, unknown: 4 };

function fmtAge(ms) {
  if (ms === null || ms === undefined) return "—";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 48) return `${Math.floor(h / 24)}d`;
  if (h > 0)  return `${h}h ${m}m`;
  return `${m}m`;
}

async function fetchDatasets() {
  const r = await fetch(`${apiBase()}/v1/datasets`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return Array.isArray(d)            ? d
    : Array.isArray(d?.data)         ? d.data
    : Array.isArray(d?.items)        ? d.items
    : Array.isArray(d?.datasets)     ? d.datasets
    : Array.isArray(d?.results)      ? d.results
    : [];
}

export async function buildDatasetFreshnessScript() {
  try {
    const raw = await fetchDatasets();
    if (!raw.length)
      return "No datasets are currently indexed in the data fusion reactor, sir.";

    const annotated = raw.map(s => ({ ...s, _f: freshnessOf(s) }));
    const counts = { fresh: 0, recent: 0, aging: 0, stale: 0, unknown: 0 };
    for (const s of annotated) counts[s._f.tier]++;

    const parts = [];
    if (counts.fresh)   parts.push(`${counts.fresh} fresh`);
    if (counts.recent)  parts.push(`${counts.recent} recent`);
    if (counts.aging)   parts.push(`${counts.aging} aging`);
    if (counts.stale)   parts.push(`${counts.stale} stale`);
    if (counts.unknown) parts.push(`${counts.unknown} without timestamps`);

    let script =
      `Data freshness report, sir. ${raw.length} dataset${raw.length !== 1 ? "s" : ""} indexed: ` +
      parts.join(", ") + ".";

    const stale = annotated.filter(s => s._f.tier === "stale");
    if (stale.length > 0) {
      const names = stale
        .slice(0, 3)
        .map(s => s.name ?? s.title ?? "unnamed")
        .join(", ");
      script += ` Stale datasets requiring attention: ${names}.`;
    } else if (counts.aging > 0) {
      script +=
        " No critical staleness detected, though some datasets are aging and should be reviewed.";
    } else if (counts.unknown === raw.length) {
      script += " No timestamp data is available to assess freshness.";
    } else {
      script += " All timestamped datasets are fresh or recent.";
    }
    return script;
  } catch (_) {
    return "Unable to reach the data fusion reactor at this time, sir.";
  }
}

export default function DatasetFreshnessMonitor() {
  const [open,    setOpen]    = useState(false);
  const [sets,    setSets]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [tab,     setTab]     = useState("all");
  const [badge,   setBadge]   = useState(0);
  const prevTiers = useRef({});
  const timerRef  = useRef(null);

  const poll = useCallback(async () => {
    setLoading(true);
    try {
      const raw      = await fetchDatasets();
      const annotated = raw.map(s => ({ ...s, _f: freshnessOf(s) }));
      setSets(annotated);

      const degradations = [];
      for (const s of annotated) {
        const key  = s.id ?? s.name ?? s.title ?? String(Math.random());
        const prev = prevTiers.current[key];
        const curr = s._f.tier;
        if (
          prev &&
          TIER_ORDER[curr] > TIER_ORDER[prev] &&
          (curr === "aging" || curr === "stale")
        ) {
          degradations.push({ name: s.name ?? s.title ?? key, tier: curr });
          setBadge(v => v + 1);
        }
        prevTiers.current[key] = curr;
      }

      if (degradations.length > 0) {
        const msg =
          degradations
            .map(d => `Dataset "${d.name}" has become ${d.tier}.`)
            .join(" ") +
          " Data freshness review recommended, sir.";
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text: msg } })
        );
      }

      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:dataset-freshness-toggle", handler);
    return () => window.removeEventListener("jarvis:dataset-freshness-toggle", handler);
  }, []);

  useEffect(() => {
    poll();
    timerRef.current = setInterval(poll, POLL);
    return () => clearInterval(timerRef.current);
  }, [poll]);

  useEffect(() => { if (open) setBadge(0); }, [open]);

  const counts = sets.reduce(
    (a, s) => { a[s._f.tier] = (a[s._f.tier] || 0) + 1; return a; },
    { fresh: 0, recent: 0, aging: 0, stale: 0, unknown: 0 }
  );

  const visible =
    tab === "all" ? sets : sets.filter(s => s._f.tier === tab);

  const hasStale = (counts.stale  || 0) > 0;
  const hasAging = (counts.aging  || 0) > 0;
  const accent   = hasStale ? RD : hasAging ? AM : GN;

  return (
    <>
      {open && (
        <div style={{
          position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
          width: 560, maxHeight: "calc(100vh - 100px)",
          background: BG, border: `1px solid ${CY}33`, borderRadius: 10,
          zIndex: 72, display: "flex", flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
          boxShadow: `0 0 40px ${CY}15`, overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px 8px",
            borderBottom: `1px solid ${CY}22`,
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: CY, fontSize: 10, letterSpacing: 2, fontWeight: 700 }}>
                ◈ DATASET FRESHNESS MONITOR
              </span>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none", border: "none",
                  color: DIM, cursor: "pointer", fontSize: 12,
                }}
              >✕</button>
            </div>
            <div style={{ color: DIM, fontSize: 7, marginTop: 2, letterSpacing: 0.5 }}>
              /v1/datasets — 60 s polling ·{" "}
              {sets.length} dataset{sets.length !== 1 ? "s" : ""} indexed
              {loading && <span style={{ color: CY, marginLeft: 8 }}>◌</span>}
            </div>

            {sets.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {(["fresh", "recent", "aging", "stale", "unknown"]).map(tier => {
                  const n   = counts[tier] || 0;
                  if (!n) return null;
                  const col = TIER_COLOR[tier];
                  return (
                    <div key={tier} style={{
                      display: "flex", alignItems: "center", gap: 4,
                      background: `${col}18`, border: `1px solid ${col}44`,
                      borderRadius: 4, padding: "2px 7px",
                    }}>
                      <span style={{ color: col, fontSize: 8, letterSpacing: 1 }}>
                        {n} {TIER_LABEL[tier]}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "6px 14px",
            borderBottom: `1px solid ${DIM}22`, flexShrink: 0, flexWrap: "wrap",
          }}>
            {["all", "fresh", "recent", "aging", "stale", "unknown"].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? CY : "transparent",
                  color: tab === t ? "#030509" : DIM,
                  border: `1px solid ${tab === t ? CY : DIM}44`,
                  borderRadius: 4, padding: "2px 7px",
                  fontSize: 7, fontFamily: "'JetBrains Mono',monospace",
                  cursor: "pointer", letterSpacing: 1, textTransform: "uppercase",
                }}
              >
                {t === "all"
                  ? `ALL (${sets.length})`
                  : `${TIER_LABEL[t]} (${counts[t] || 0})`}
              </button>
            ))}
          </div>

          {/* Dataset list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
            {error && (
              <div style={{ color: RD, fontSize: 8, padding: "4px 0" }}>{error}</div>
            )}
            {visible.length === 0 ? (
              <div style={{
                color: DIM, fontSize: 9, textAlign: "center", padding: 30,
              }}>
                {loading ? "Loading datasets…" : "No datasets in this category."}
              </div>
            ) : (
              visible
                .slice()
                .sort((a, b) =>
                  (TIER_ORDER[a._f.tier] ?? 5) - (TIER_ORDER[b._f.tier] ?? 5)
                )
                .map((s, i) => {
                  const col   = TIER_COLOR[s._f.tier];
                  const title = s.name ?? s.title ?? s.dataset_name ?? `Dataset ${i + 1}`;
                  const desc  = s.description ?? s.type ?? "";
                  const rows  = s.row_count ?? s.rows ?? s.count ?? s.record_count;
                  const ts    = getTimestamp(s);

                  return (
                    <div
                      key={s.id ?? i}
                      style={{
                        padding: "7px 0",
                        borderBottom: `1px solid ${DIM}18`,
                        animation:
                          s._f.tier === "stale"
                            ? "dfm-row-pulse 2s ease-in-out infinite"
                            : "none",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: col, flexShrink: 0,
                          boxShadow: s._f.tier === "stale" ? `0 0 6px ${col}` : "none",
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            color: "#DCEBF5", fontSize: 9, fontWeight: 600,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {title}
                          </div>
                          {desc && (
                            <div style={{
                              color: DIM, fontSize: 7, marginTop: 1,
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            }}>
                              {desc}
                            </div>
                          )}
                        </div>
                        <div style={{ flexShrink: 0, textAlign: "right" }}>
                          <div style={{
                            color: col, fontSize: 7, letterSpacing: 1,
                            border: `1px solid ${col}44`, borderRadius: 3,
                            padding: "1px 5px", marginBottom: 2,
                          }}>
                            {TIER_LABEL[s._f.tier]}
                          </div>
                          {s._f.ageMs !== null ? (
                            <div style={{ color: DIM, fontSize: 7 }}>
                              {fmtAge(s._f.ageMs)} ago
                            </div>
                          ) : ts ? (
                            <div style={{ color: DIM, fontSize: 7 }}>
                              {new Date(ts).toLocaleDateString()}
                            </div>
                          ) : rows !== undefined ? (
                            <div style={{ color: DIM, fontSize: 7 }}>
                              {Number(rows).toLocaleString()} rows
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 14px", borderTop: `1px solid ${CY}11`,
            flexShrink: 0,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 7, color: DIM, letterSpacing: 0.5 }}>
              Announces freshness degradations via JARVIS TTS
            </span>
            <span style={{ fontSize: 7, color: DIM }}>60 s refresh</span>
          </div>
        </div>
      )}

      {/* Bottom-strip toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Dataset Freshness Monitor — data age and staleness across all indexed datasets"
        style={{
          position: "fixed", left: 5408, bottom: 18, zIndex: 68,
          background: open ? accent : "rgba(5,8,13,0.75)",
          color: open ? "#030509" : accent,
          border: `1px solid ${accent}`,
          borderRadius: 6, padding: "3px 8px",
          fontSize: 8, fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: 1.5, cursor: "pointer",
          backdropFilter: "blur(6px)",
          boxShadow: open ? `0 0 12px ${accent}` : "none",
          animation: !open && badge > 0 ? "dfm-badge-pulse 1.5s ease-in-out infinite" : "none",
        }}
      >
        ◈ FRESH
        {badge > 0 && (
          <span style={{
            marginLeft: 4, background: AM, color: "#030509",
            borderRadius: 8, fontSize: 7, padding: "0 4px", fontWeight: 700,
          }}>{badge}</span>
        )}
      </button>

      <style>{`
        @keyframes dfm-badge-pulse {
          0%, 100% { box-shadow: 0 0 4px ${AM}; }
          50%       { box-shadow: 0 0 16px ${AM}; }
        }
        @keyframes dfm-row-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.6; }
        }
      `}</style>
    </>
  );
}
