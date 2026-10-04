/**
 * AnomalyDecisionCorrelator — F262.
 *
 * Data sources (real — confirmed endpoints):
 *   GET /v1/jarvis/analytics/anomalies?limit=30
 *       → [ {metric, value, zscore, severity, timestamp} ]
 *   GET /v1/decision/list?limit=50
 *       → [ {id, title, body_md, status, quality_score, created_at} ]
 *   POST /v1/jarvis/agent/chat  { message }
 *       → { answer }
 *
 * Logic:
 *   Parallel-fetches metric anomalies and governance decisions, then keyword-
 *   correlates each anomaly's metric name against decision titles + body_md
 *   to surface LINKED (has a related decision) vs ORPHAN anomalies.
 *
 * Displays:
 *   - Stat tiles: anomalies / decisions / linked / orphan
 *   - ALL / LINKED / ORPHAN filter tabs + metric-name text search
 *   - Per anomaly: severity badge + metric name + z-score + expand → matched
 *     decision chips (title + quality score bar)
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence coverage brief + TTS
 *
 * Toggle: ⊠ ADCR at left:219600, bottom:8, zIndex:141.
 * Badge: red = high-severity orphan anomalies; amber = any orphans.
 * 90 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isAdcrQuery(q) / buildAdcrScript()
 *
 * Voice triggers: "anomaly decision / decision correlator / adcr /
 *   metric anomaly decision / orphan anomaly / linked anomaly /
 *   anomaly governance / decision anomaly link / correlated anomaly /
 *   which anomalies have decisions / anomaly coverage"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AM  = "#F5A623";
const GN  = "#4ADE80";
const RED = "#F87171";
const DIM = "#3A4A55";
const PUR = "#A78BFA";

const BTN_LEFT   = 219600;
const REFRESH_MS = 90_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const ADCR_RE =
  /\b(anomaly decisions?|decision correlat|adcr|metric anomaly decision|orphan anomal|linked anomal|anomaly governance|decision anomaly|correlated anomal|which anomalies have|anomaly coverage)\b/i;

export function isAdcrQuery(t) {
  return ADCR_RE.test(t || "");
}

export async function buildAdcrScript() {
  try {
    const [ar, dr] = await Promise.all([
      fetch(`${apiBase()}/v1/jarvis/analytics/anomalies?limit=30`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/decision/list?limit=50`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const anomalies = (await ar.json()) ?? [];
    const dRaw      = await dr.json();
    const decisions = Array.isArray(dRaw) ? dRaw : (dRaw?.items ?? []);

    if (anomalies.length === 0) {
      return "No metric anomalies detected at this time. The measurement baseline is stable.";
    }

    const linked  = anomalies.filter((a) => _matchDecisions(a.metric, decisions).length > 0);
    const orphans = anomalies.filter((a) => _matchDecisions(a.metric, decisions).length === 0);
    const highOrph = orphans.filter((a) => (a.severity || "").toLowerCase() === "high");

    return (
      `Anomaly-decision correlation: ${anomalies.length} anomalies against ${decisions.length} ` +
      `decisions — ${linked.length} linked, ${orphans.length} orphaned` +
      (highOrph.length > 0 ? ` (${highOrph.length} high-severity orphans require review)` : "") +
      `. Coverage ratio ${anomalies.length > 0 ? Math.round((linked.length / anomalies.length) * 100) : 0}%.`
    );
  } catch {
    return "Unable to reach the anomaly or decision endpoints at this time.";
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function _tokens(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function _matchDecisions(metric, decisions) {
  const metricTokens = _tokens(metric);
  if (metricTokens.length === 0) return [];
  return decisions.filter((d) => {
    const haystack = `${d.title || ""} ${d.body_md || ""}`.toLowerCase();
    return metricTokens.some((tok) => haystack.includes(tok));
  });
}

function _severityColor(sev) {
  const s = (sev || "").toLowerCase();
  if (s === "high")   return RED;
  if (s === "medium") return AM;
  if (s === "low")    return GN;
  return DIM;
}

function timeAgo(ts) {
  if (!ts) return "—";
  const secs = Date.now() / 1000 - (typeof ts === "string" ? new Date(ts).getTime() / 1000 : ts);
  if (secs < 60)    return `${Math.round(secs)}s`;
  if (secs < 3600)  return `${Math.round(secs / 60)}m`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h`;
  return `${Math.round(secs / 86400)}d`;
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchData() {
  const [ar, dr] = await Promise.all([
    fetch(`${apiBase()}/v1/jarvis/analytics/anomalies?limit=30`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }),
    fetch(`${apiBase()}/v1/decision/list?limit=50`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }),
  ]);
  if (!ar.ok) throw new Error(`anomalies HTTP ${ar.status}`);
  if (!dr.ok) throw new Error(`decisions HTTP ${dr.status}`);
  const anomalies  = (await ar.json()) ?? [];
  const dRaw       = await dr.json();
  const decisions  = Array.isArray(dRaw) ? dRaw : (dRaw?.items ?? []);
  return { anomalies, decisions };
}

async function agentAssess(anomalyCount, decisionCount, linked, orphanHigh) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message:
        `Assess metric anomaly–decision coverage in 2 sentences: ` +
        `${anomalyCount} anomalies vs ${decisionCount} decisions, ` +
        `${linked} linked, ${anomalyCount - linked} orphaned` +
        (orphanHigh > 0 ? `, ${orphanHigh} high-severity orphans` : "") + `.`,
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "No assessment available.";
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 56, background: `${color}0d`,
      border: `1px solid ${color}33`, borderRadius: 8,
      padding: "8px 8px", display: "flex", flexDirection: "column", gap: 3,
    }}>
      <span style={{ fontSize: 7, color: DIM, letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color, letterSpacing: 1 }}>{value}</span>
    </div>
  );
}

function ScoreBar({ value, max = 1, color = CY }) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div style={{ height: 3, background: `${color}22`, borderRadius: 2, overflow: "hidden", marginTop: 3 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2 }} />
    </div>
  );
}

function AnomalyRow({ anomaly, decisions }) {
  const [expanded, setExpanded] = useState(false);
  const matched = _matchDecisions(anomaly.metric, decisions);
  const isLinked = matched.length > 0;
  const sevColor = _severityColor(anomaly.severity);

  return (
    <div style={{
      borderBottom: `1px solid ${CY}11`,
    }}>
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          padding: "7px 12px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8,
          background: expanded ? `${CY}08` : "transparent",
        }}
      >
        {/* severity badge */}
        <span style={{
          fontSize: 6, padding: "1px 5px", borderRadius: 3,
          border: `1px solid ${sevColor}55`, color: sevColor,
          flexShrink: 0, textTransform: "uppercase", letterSpacing: 1,
        }}>
          {anomaly.severity || "?"}
        </span>

        {/* metric name */}
        <span style={{ flex: 1, fontSize: 8, color: "#C8D8E0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {anomaly.metric}
        </span>

        {/* z-score */}
        <span style={{ fontSize: 7, color: AM, flexShrink: 0 }}>
          z {anomaly.zscore != null ? anomaly.zscore.toFixed(2) : "—"}
        </span>

        {/* linked/orphan indicator */}
        <span style={{
          fontSize: 6, padding: "1px 5px", borderRadius: 3,
          border: `1px solid ${isLinked ? GN : RED}55`,
          color: isLinked ? GN : RED, flexShrink: 0,
        }}>
          {isLinked ? `${matched.length} ⟶` : "ORPHAN"}
        </span>

        <span style={{ fontSize: 8, color: DIM }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "4px 12px 10px 28px" }}>
          {/* anomaly value + age */}
          <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
            {anomaly.value != null && (
              <span style={{ fontSize: 7, color: CY }}>
                val {typeof anomaly.value === "number" ? anomaly.value.toFixed(3) : anomaly.value}
              </span>
            )}
            <span style={{ fontSize: 7, color: DIM }}>
              {timeAgo(anomaly.timestamp)}
            </span>
          </div>

          {matched.length === 0 ? (
            <div style={{ fontSize: 7, color: DIM, fontStyle: "italic" }}>
              No matching decisions — this anomaly is ungoverned.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {matched.map((d) => (
                <div key={d.id} style={{
                  background: `${GN}08`, border: `1px solid ${GN}22`,
                  borderRadius: 5, padding: "4px 8px",
                }}>
                  <div style={{ fontSize: 7, color: GN, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.title || d.id}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{
                      fontSize: 6, padding: "1px 4px", borderRadius: 3,
                      border: `1px solid ${PUR}44`, color: PUR,
                    }}>
                      {d.status || "—"}
                    </span>
                    {d.quality_score != null && (
                      <div style={{ flex: 1 }}>
                        <ScoreBar value={d.quality_score} max={1} color={GN} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function AnomalyDecisionCorrelator() {
  const [open,      setOpen]     = useState(false);
  const [anomalies, setAnomalies] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [loading,   setLoading]  = useState(false);
  const [tab,       setTab]      = useState("ALL");
  const [search,    setSearch]   = useState("");
  const [assessing, setAssessing] = useState(false);
  const [dossier,   setDossier]  = useState(null);

  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { anomalies: a, decisions: d } = await fetchData();
      setAnomalies(a);
      setDecisions(d);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (ADCR_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:adcr-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:adcr-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function handleAssess() {
    if (assessing) return;
    setAssessing(true);
    setDossier(null);
    try {
      const linked    = anomalies.filter((a) => _matchDecisions(a.metric, decisions).length > 0);
      const orphans   = anomalies.filter((a) => _matchDecisions(a.metric, decisions).length === 0);
      const highOrph  = orphans.filter((a) => (a.severity || "").toLowerCase() === "high");
      const brief     = await agentAssess(
        anomalies.length,
        decisions.length,
        linked.length,
        highOrph.length,
      );
      setDossier(brief);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } }));
    } catch (_) {
      setDossier("Assessment unavailable.");
    }
    setAssessing(false);
  }

  // derived
  const enriched = anomalies.map((a) => ({
    ...a,
    _matched: _matchDecisions(a.metric, decisions),
  }));

  const linked   = enriched.filter((a) => a._matched.length > 0);
  const orphans  = enriched.filter((a) => a._matched.length === 0);
  const highOrph = orphans.filter((a) => (a.severity || "").toLowerCase() === "high");

  const filtered = enriched
    .filter((a) => {
      if (tab === "LINKED") return a._matched.length > 0;
      if (tab === "ORPHAN") return a._matched.length === 0;
      return true;
    })
    .filter((a) => {
      if (!search) return true;
      return (a.metric || "").toLowerCase().includes(search.toLowerCase());
    });

  const badgeCount = highOrph.length > 0 ? highOrph.length : orphans.length;
  const badgeColor = highOrph.length > 0 ? RED : orphans.length > 0 ? AM : GN;

  const TABS = ["ALL", "LINKED", "ORPHAN"];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 141,
          background: "#091520", border: `1px solid ${CY}44`, borderRadius: 6,
          color: CY, fontSize: 7, padding: "3px 7px", cursor: "pointer",
          letterSpacing: 1, display: "flex", alignItems: "center", gap: 4,
          whiteSpace: "nowrap",
        }}
      >
        ⊠ ADCR
        {badgeCount > 0 && (
          <span style={{
            background: badgeColor, color: "#000", borderRadius: "50%",
            fontSize: 6, width: 12, height: 12, display: "flex",
            alignItems: "center", justifyContent: "center", fontWeight: 700,
          }}>
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 280, bottom: 32, zIndex: 141,
      width: 340, maxHeight: 560,
      background: "rgba(6,16,24,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 10, display: "flex", flexDirection: "column",
      fontFamily: "monospace", boxShadow: `0 0 18px ${CY}22`,
    }}>
      {/* header */}
      <div style={{
        padding: "8px 12px", borderBottom: `1px solid ${CY}22`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 8, color: CY, letterSpacing: 2, fontWeight: 700, flex: 1 }}>
          ⊠ ANOMALY × DECISIONS
        </span>
        {loading && <span style={{ fontSize: 8, color: DIM }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: DIM,
          fontSize: 10, cursor: "pointer", lineHeight: 1,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="ANOMALIES" value={anomalies.length} color={AM} />
        <Tile label="DECISIONS" value={decisions.length} color={PUR} />
        <Tile label="LINKED"    value={linked.length}    color={GN} />
        <Tile label="ORPHAN"    value={orphans.length}   color={orphans.length > 0 ? RED : DIM} />
      </div>

      {/* tabs + search */}
      <div style={{ padding: "0 12px 6px", display: "flex", gap: 4, alignItems: "center" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontSize: 7, padding: "2px 7px", borderRadius: 4, cursor: "pointer",
              border: `1px solid ${tab === t ? CY : CY + "33"}`,
              color: tab === t ? CY : DIM,
              background: tab === t ? `${CY}14` : "transparent",
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="metric filter…"
          style={{
            flex: 1, fontSize: 7, padding: "2px 6px", borderRadius: 4,
            background: "#0a1a24", border: `1px solid ${CY}22`, color: "#C8D8E0",
            outline: "none",
          }}
        />
      </div>

      {/* assess */}
      <div style={{ padding: "0 12px 6px" }}>
        <button
          onClick={handleAssess}
          disabled={assessing}
          style={{
            width: "100%", fontSize: 8, padding: "4px 0", borderRadius: 5, cursor: "pointer",
            border: `1px solid ${CY}55`, color: CY, background: `${CY}0d`,
            opacity: assessing ? 0.6 : 1,
          }}
        >
          {assessing ? "▶ Assessing…" : "▶ ASSESS"}
        </button>
        {dossier && (
          <div style={{
            marginTop: 5, fontSize: 8, color: AM, lineHeight: 1.4,
            padding: "5px 7px", background: `${AM}0a`, borderRadius: 5,
          }}>
            {dossier}
          </div>
        )}
      </div>

      {/* anomaly list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 8, color: DIM, padding: "12px 16px", textAlign: "center" }}>
            {loading ? "Loading…" : "No anomalies match the current filter."}
          </div>
        ) : (
          filtered.map((a, i) => (
            <AnomalyRow key={a.metric || i} anomaly={a} decisions={decisions} />
          ))
        )}
      </div>

      {/* footer */}
      <div style={{
        padding: "5px 12px", borderTop: `1px solid ${CY}11`,
        fontSize: 7, color: DIM, display: "flex", justifyContent: "space-between",
      }}>
        <span>{filtered.length}/{anomalies.length} anomalies</span>
        <span>90 s poll · /analytics/anomalies + /decision/list</span>
      </div>
    </div>
  );
}
