/**
 * ThreatTimeline — F40
 * Unified reverse-chronological intelligence timeline.
 * Merges /entities/RiskSignal + /v1/ops/events + /v1/investigations.
 * "JARVIS, timeline" | "threat timeline" opens panel + speaks top items.
 * Additive only — mounted via App.jsx; intent exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const RED  = "#FF3B3B";
const OR   = "#FF8C00";
const GLD  = "#FFD700";
const PRP  = "#C070FF";
const GRN  = "#00E5A0";
const POLL_MS = 30_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const TL_RE = /\b(threat.?timeline|intel.?timeline|timeline|unified.?feed|combined.?feed|all.?threats|all.?events)\b/i;

export function isTimelineQuery(text) {
  return TL_RE.test(text || "");
}

// ── helpers ──────────────────────────────────────────────────────────────────

function extractArr(d, keys) {
  if (Array.isArray(d)) return d;
  for (const k of keys) if (Array.isArray(d?.[k])) return d[k];
  return [];
}

function coerceTs(v) {
  if (!v) return 0;
  const n = typeof v === "number" ? v : Date.parse(v);
  return Number.isNaN(n) ? 0 : n;
}

function fmtAge(ts) {
  if (!ts) return "";
  const diff = Date.now() - coerceTs(ts);
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function sevColor(sev) {
  const n = typeof sev === "number" ? sev : { critical: 95, high: 75, medium: 50, low: 20 }[(sev || "").toLowerCase()] ?? 0;
  if (n >= 90) return RED;
  if (n >= 70) return OR;
  if (n >= 40) return GLD;
  return GRN;
}

// ── fetch functions ───────────────────────────────────────────────────────────

async function fetchRisks() {
  try {
    const r = await fetch(`${apiBase()}/entities/RiskSignal`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) return [];
    const d = await r.json();
    return extractArr(d, ["data", "items", "results"]).map((s) => ({
      id: `risk-${s.id ?? Math.random()}`,
      source: "RISK",
      title: s.name || s.title || s.signal_name || s.label || "Risk Signal",
      detail: s.description || s.message || "",
      sev: s.severity ?? s.level ?? s.risk_level ?? "low",
      ts: s.created_at || s.detected_at || s.timestamp || null,
      raw: s,
    }));
  } catch (_) {
    return [];
  }
}

async function fetchOps() {
  try {
    const r = await fetch(`${apiBase()}/v1/ops/events`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) return [];
    const d = await r.json();
    return extractArr(d, ["events", "items", "results"]).map((e) => ({
      id: `ops-${e.id ?? Math.random()}`,
      source: "OPS",
      title: e.name || e.message || e.title || e.type || "Ops Event",
      detail: e.payload?.detail || e.description || e.target || "",
      sev: e.severity ?? e.level ?? 0,
      ts: e.created_at || e.timestamp || e.time || null,
      raw: e,
    }));
  } catch (_) {
    return [];
  }
}

async function fetchCases() {
  try {
    const r = await fetch(`${apiBase()}/v1/investigations`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) return [];
    const d = await r.json();
    return extractArr(d, ["investigations", "cases", "data", "items", "results"]).map((c) => ({
      id: `case-${c.id ?? Math.random()}`,
      source: "CASE",
      title: c.name || c.title || c.case_name || "Investigation",
      detail: c.description || c.summary || c.status || "",
      sev: c.priority === "critical" ? 90 : c.priority === "high" ? 75 : c.priority === "medium" ? 50 : 20,
      ts: c.created_at || c.opened_at || c.updated_at || null,
      raw: c,
    }));
  } catch (_) {
    return [];
  }
}

async function fetchAll() {
  const [risks, ops, cases] = await Promise.all([fetchRisks(), fetchOps(), fetchCases()]);
  return [...risks, ...ops, ...cases].sort(
    (a, b) => coerceTs(b.ts) - coerceTs(a.ts)
  );
}

// ── TTS brief ─────────────────────────────────────────────────────────────────

export async function buildTimelineScript() {
  try {
    const items = await fetchAll();
    if (!items.length) return "Threat intelligence timeline is clear, sir. No active signals, events, or open cases.";
    const total = items.length;
    const critCount = items.filter((i) => {
      const n = typeof i.sev === "number" ? i.sev : { critical: 95, high: 75, medium: 50, low: 20 }[(i.sev || "").toLowerCase()] ?? 0;
      return n >= 90;
    }).length;
    const top = items.slice(0, 3).map((i) => i.title).join(", ");
    return (
      `Threat intelligence timeline: ${total} combined signals, events, and cases on record. ` +
      (critCount > 0 ? `${critCount} critical. ` : "") +
      `Most recent: ${top}. Opening the unified timeline now, sir.`
    );
  } catch (_) {
    return "Threat intelligence timeline is available. Opening the panel now, sir.";
  }
}

// ── source badge config ───────────────────────────────────────────────────────

const SOURCE_META = {
  RISK: { color: RED,  label: "RISK",  icon: "⚠" },
  OPS:  { color: OR,   label: "OPS",   icon: "⬡" },
  CASE: { color: PRP,  label: "CASE",  icon: "◈" },
};

const FILTERS = ["ALL", "RISK", "OPS", "CASE", "CRITICAL"];

// ── component ─────────────────────────────────────────────────────────────────

export default function ThreatTimeline() {
  const [open, setOpen]       = useState(false);
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState("ALL");
  const [search, setSearch]   = useState("");
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAll();
      setItems(data);
      setLastFetch(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && !lastFetch) refresh();
  }, [open, lastFetch, refresh]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, refresh]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:timeline-toggle", onToggle);
    return () => window.removeEventListener("jarvis:timeline-toggle", onToggle);
  }, []);

  const critCount = items.filter((i) => {
    const n = typeof i.sev === "number" ? i.sev : { critical: 95, high: 75, medium: 50, low: 20 }[(i.sev || "").toLowerCase()] ?? 0;
    return n >= 90;
  }).length;

  const q = search.trim().toLowerCase();
  const visible = items.filter((item) => {
    if (filter === "RISK"     && item.source !== "RISK") return false;
    if (filter === "OPS"      && item.source !== "OPS")  return false;
    if (filter === "CASE"     && item.source !== "CASE") return false;
    if (filter === "CRITICAL") {
      const n = typeof item.sev === "number" ? item.sev : { critical: 95, high: 75, medium: 50, low: 20 }[(item.sev || "").toLowerCase()] ?? 0;
      if (n < 90) return false;
    }
    if (q && !item.title.toLowerCase().includes(q) && !item.detail.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <>
      {/* Bottom-strip toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Threat Intelligence Timeline (F40)"
        style={{
          position: "fixed", bottom: 18, left: 2884, zIndex: 60,
          background: open ? `${RED}22` : "rgba(5,8,13,0.7)",
          border: `1px solid ${open ? RED : RED + "55"}`,
          color: open ? RED : `${RED}99`,
          borderRadius: 6, padding: "3px 9px", fontSize: 9, letterSpacing: 1.5,
          fontFamily: "'JetBrains Mono',monospace", cursor: "pointer",
          backdropFilter: "blur(6px)", whiteSpace: "nowrap",
        }}
      >
        ◎ TL{critCount > 0 && (
          <span style={{
            marginLeft: 4, color: RED, fontWeight: "bold",
            animation: "tl-pulse 1s ease-in-out infinite",
          }}>{critCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 54, left: 2884,
          width: "min(520px, 92vw)",
          maxHeight: "70vh",
          display: "flex", flexDirection: "column",
          background: "rgba(8,12,20,0.97)",
          border: `1px solid ${RED}44`,
          borderRadius: 12,
          boxShadow: `0 0 60px ${RED}18`,
          fontFamily: "'JetBrains Mono',monospace",
          zIndex: 60,
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px 8px",
            borderBottom: `1px solid ${RED}22`,
            display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: RED, fontSize: 11, fontWeight: "bold", letterSpacing: 2 }}>
              ◎ THREAT TIMELINE
            </span>
            <span style={{
              marginLeft: "auto", fontSize: 9, color: "#6E8AA0",
              border: `1px solid ${RED}22`, borderRadius: 4, padding: "1px 6px",
            }}>
              {items.length} total
            </span>
            <button
              onClick={refresh}
              disabled={loading}
              style={{
                background: "transparent", border: `1px solid ${RED}33`, color: RED,
                borderRadius: 4, padding: "2px 8px", fontSize: 9, cursor: "pointer",
                letterSpacing: 1, opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? "…" : "↺"}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "transparent", border: "none", color: "#6E8AA0",
                fontSize: 12, cursor: "pointer", padding: "0 2px",
              }}
            >✕</button>
          </div>

          {/* Search */}
          <div style={{ padding: "8px 14px 0", flexShrink: 0 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="filter timeline…"
              style={{
                width: "100%", background: "rgba(255,59,59,0.06)",
                border: `1px solid ${RED}33`, borderRadius: 6,
                color: "#DCEBF5", fontSize: 10, padding: "5px 10px",
                fontFamily: "'JetBrains Mono',monospace", outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "8px 14px 0",
            flexShrink: 0, overflowX: "auto",
          }}>
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? `${RED}22` : "transparent",
                  border: `1px solid ${filter === f ? RED : RED + "33"}`,
                  color: filter === f ? RED : `${RED}88`,
                  borderRadius: 4, padding: "2px 8px", fontSize: 8,
                  letterSpacing: 1, cursor: "pointer",
                  fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap",
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Timeline list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px 12px" }}>
            {loading && !items.length ? (
              <div style={{ color: "#6E8AA0", fontSize: 10, textAlign: "center", padding: 20 }}>
                loading timeline…
              </div>
            ) : visible.length === 0 ? (
              <div style={{ color: "#6E8AA0", fontSize: 10, textAlign: "center", padding: 20 }}>
                no items match
              </div>
            ) : (
              visible.map((item, idx) => {
                const sm = SOURCE_META[item.source] || SOURCE_META.OPS;
                const sc = sevColor(item.sev);
                const isCrit = sc === RED;
                return (
                  <div
                    key={item.id}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "8px 0",
                      borderBottom: idx < visible.length - 1 ? `1px solid ${RED}11` : "none",
                    }}
                  >
                    {/* Timeline spine dot */}
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: sc, marginTop: 4, flexShrink: 0,
                      boxShadow: `0 0 8px ${sc}88`,
                      animation: isCrit ? "tl-pulse 1s ease-in-out infinite" : "none",
                    }} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Source badge + age */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <span style={{
                          fontSize: 8, letterSpacing: 1.5, color: sm.color,
                          border: `1px solid ${sm.color}44`, borderRadius: 3,
                          padding: "1px 5px",
                        }}>
                          {sm.icon} {sm.label}
                        </span>
                        <span style={{ fontSize: 8, color: sc, letterSpacing: 1 }}>
                          {typeof item.sev === "number"
                            ? item.sev >= 90 ? "CRITICAL" : item.sev >= 70 ? "HIGH" : item.sev >= 40 ? "MEDIUM" : "LOW"
                            : String(item.sev).toUpperCase()}
                        </span>
                        {item.ts && (
                          <span style={{ marginLeft: "auto", fontSize: 8, color: "#4A6070" }}>
                            {fmtAge(item.ts)}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <div style={{
                        fontSize: 11, color: "#DCEBF5", fontWeight: "bold",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {item.title}
                      </div>

                      {/* Detail */}
                      {item.detail && (
                        <div style={{
                          fontSize: 9, color: "#6E8AA0", marginTop: 2,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {item.detail}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {lastFetch && (
            <div style={{
              padding: "5px 14px 8px", fontSize: 9, color: "#4A6070",
              borderTop: `1px solid ${RED}11`, flexShrink: 0,
            }}>
              updated {lastFetch.toLocaleTimeString()} · auto-refresh 30s
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes tl-pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:.5; transform:scale(1.4); }
        }
      `}</style>
    </>
  );
}
