/**
 * F109 — Alert × Scenario Response Map (ASRM)
 *
 * Parallel-fetches /v1/alerts and /v1/scenario/list every 60 s.
 * Keyword-correlates each active alert (category, type, message, title,
 * description, source, severity) against scenarios (name, description,
 * type, tags, objective) to classify:
 *
 *  ARMED  — alert keywords match at least one scenario
 *  SILENT — no scenario overlap found
 *
 * Stat tiles: alerts / scenarios / armed / silent
 * Amber badge on armed count.
 * Filter tabs: ALL / ARMED / SILENT + text search.
 * Expand alert row → matched scenarios with type/status badge + relevance score bar.
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ ASRM  at left:3660 bottom:18, zIndex:68.
 * Event:   jarvis:asrm-toggle
 * Voice:   "alert scenario / scenario response / asrm / armed scenarios /
 *           which scenarios are triggered / alert response map / scenario alert mapping"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const PURP  = "#A78BFA";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 3660;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const SEV_COLORS = { CRITICAL: RED, HIGH: AMBER, MEDIUM: "#F59E0B", LOW: CY, INFO: MUTED };

// ─── helpers ──────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseAlerts(raw) {
  return normaliseArray(raw).map((a, i) => ({
    id:       String(a.id ?? a.alert_id ?? i),
    title:    a.title ?? a.name ?? a.alert_name ?? `Alert ${i + 1}`,
    category: a.category ?? a.alert_category ?? "",
    type:     a.type ?? a.alert_type ?? "",
    message:  a.message ?? a.description ?? a.body ?? "",
    source:   a.source ?? a.origin ?? "",
    severity: (a.severity ?? a.level ?? a.priority ?? "INFO").toUpperCase(),
  }));
}

function normaliseScenarios(raw) {
  const list = normaliseArray(raw);
  return list.map((s, i) => ({
    id:          String(s.id ?? s.scenario_id ?? i),
    name:        s.name ?? s.title ?? s.scenario_name ?? `Scenario ${i + 1}`,
    description: s.description ?? s.details ?? s.body ?? "",
    type:        s.type ?? s.scenario_type ?? "generic",
    status:      s.status ?? s.state ?? "active",
    objective:   s.objective ?? s.goal ?? "",
    tags:        Array.isArray(s.tags) ? s.tags : [],
  }));
}

function tokenise(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);
}

function correlate(alert, scenarios) {
  const alertTokens = new Set([
    ...tokenise(alert.title),
    ...tokenise(alert.category),
    ...tokenise(alert.type),
    ...tokenise(alert.message),
    ...tokenise(alert.source),
  ]);
  const matches = [];
  for (const s of scenarios) {
    const sTokens = tokenise(
      `${s.name} ${s.description} ${s.type} ${s.objective} ${s.tags.join(" ")}`
    );
    const hits = sTokens.filter(t => alertTokens.has(t)).length;
    if (hits > 0) matches.push({ ...s, score: hits });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [aRes, sRes] = await Promise.all([
    fetch(`${base}/v1/alerts`,        { headers: hdr }),
    fetch(`${base}/v1/scenario/list`, { headers: hdr }),
  ]);
  const alerts    = normaliseAlerts(await aRes.json());
  const scenarios = normaliseScenarios(await sRes.json());
  const enriched  = alerts.map(a => {
    const matches = correlate(a, scenarios);
    return { ...a, matches, armed: matches.length > 0 ? "ARMED" : "SILENT" };
  });
  return { alerts: enriched, scenarios };
}

// ─── exported intent helpers (JarvisBrain) ───────────────────────────────────

export function isAsrmQuery(q) {
  return /alert.?scenario|scenario.?response|asrm|armed.?scenario|which.?scenario.*trigger|alert.?response.?map|scenario.?alert.?map/i.test(q);
}

export async function buildAsrmScript() {
  try {
    const { alerts, scenarios } = await fetchAll();
    const armed   = alerts.filter(a => a.armed === "ARMED");
    const topAlert = armed[0];
    const prompt = `JARVIS alert-scenario response map: ${alerts.length} active alerts cross-referenced against ${scenarios.length} scenarios. ${armed.length} alerts classified ARMED — their keywords intersect with at least one configured scenario.${topAlert ? ` Top-correlated alert: "${topAlert.title}" (severity: ${topAlert.severity}) matched ${topAlert.matches.length} scenario(s).` : ""} Summarise the scenario activation state in exactly 2 sentences and recommend the highest-priority response action.`;
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const base = apiBase();
    const aiRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt }),
    });
    const aiData = await aiRes.json();
    return aiData.response ?? aiData.reply ?? aiData.message ??
      `${armed.length}/${alerts.length} alerts ARMED against ${scenarios.length} scenarios.`;
  } catch {
    return "Alert-scenario response mapping data unavailable.";
  }
}

// ─── Stat Tile ────────────────────────────────────────────────────────────────

function StatTile({ label, value, accent, pulse }) {
  return (
    <div style={{
      flex: 1, textAlign: "center", padding: "8px 4px",
      background: `rgba(${accent === RED ? "255,59,107" : accent === AMBER ? "245,166,35" : "41,231,255"},0.04)`,
      border: `1px solid ${accent ?? CY}22`, borderRadius: 4, position: "relative",
    }}>
      {pulse && (
        <div style={{
          position: "absolute", inset: -1, borderRadius: 4,
          border: `1px solid ${AMBER}`,
          animation: "asrm-pulse 1.4s ease-in-out infinite",
          pointerEvents: "none",
        }} />
      )}
      <div style={{ fontSize: 16, fontWeight: 700, color: accent ?? CY, fontFamily: MONO }}>
        {value ?? "—"}
      </div>
      <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

// ─── Alert Row ────────────────────────────────────────────────────────────────

function AlertRow({ alert }) {
  const [expanded, setExpanded] = useState(false);
  const maxScore = Math.max(1, ...alert.matches.map(m => m.score));

  return (
    <div style={{
      borderRadius: 3, marginBottom: 3,
      border: `1px solid ${alert.armed === "ARMED" ? AMBER : MUTED}22`,
      background: alert.armed === "ARMED"
        ? "rgba(245,166,35,0.03)"
        : "rgba(41,231,255,0.02)",
    }}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", cursor: "pointer" }}
      >
        <span style={{
          fontSize: 7, fontWeight: 700, letterSpacing: 1,
          color: alert.armed === "ARMED" ? AMBER : GREEN,
          border: `1px solid ${alert.armed === "ARMED" ? AMBER : GREEN}66`,
          padding: "1px 5px", borderRadius: 2, whiteSpace: "nowrap",
          width: 40, textAlign: "center",
        }}>
          {alert.armed === "ARMED" ? "ARMED" : "SILENT"}
        </span>

        <span style={{
          fontSize: 7, fontWeight: 700,
          color: SEV_COLORS[alert.severity] ?? MUTED,
          border: `1px solid ${SEV_COLORS[alert.severity] ?? MUTED}66`,
          padding: "1px 4px", borderRadius: 2,
          width: 30, textAlign: "center", flexShrink: 0,
        }}>
          {alert.severity.slice(0, 4)}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 9, color: CY, fontWeight: 600,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {alert.title}
          </div>
          {(alert.category || alert.source) && (
            <div style={{ fontSize: 7, color: MUTED, marginTop: 1 }}>
              {[alert.category, alert.source].filter(Boolean).join(" · ").slice(0, 40)}
            </div>
          )}
        </div>

        {alert.matches.length > 0 && (
          <span style={{ fontSize: 8, color: AMBER, fontWeight: 700, flexShrink: 0 }}>
            {alert.matches.length} scen{alert.matches.length !== 1 ? "s" : ""}
          </span>
        )}
        <span style={{ fontSize: 8, color: MUTED }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "0 8px 8px 8px" }}>
          {alert.message && (
            <div style={{ fontSize: 7, color: MUTED, marginBottom: 6, fontStyle: "italic" }}>
              {alert.message.slice(0, 100)}
            </div>
          )}
          {alert.matches.length === 0 ? (
            <div style={{ fontSize: 8, color: GREEN, padding: "4px 0" }}>
              No correlated scenarios found.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
              <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, marginBottom: 2 }}>
                MATCHED SCENARIOS
              </div>
              {alert.matches.slice(0, 6).map(m => {
                const barPct = Math.round((m.score / maxScore) * 100);
                return (
                  <div key={m.id} style={{
                    background: "rgba(41,231,255,0.03)",
                    border: `1px solid ${PURP}22`,
                    borderRadius: 3, padding: "4px 8px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{
                        fontSize: 7, fontWeight: 700, color: PURP,
                        border: `1px solid ${PURP}66`,
                        padding: "1px 4px", borderRadius: 2,
                        maxWidth: 60, textAlign: "center", flexShrink: 0,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {m.type.slice(0, 8)}
                      </span>
                      <span style={{
                        fontSize: 8, color: CY, flex: 1, minWidth: 0,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {m.name}
                      </span>
                      <span style={{ fontSize: 7, color: AMBER, fontWeight: 700, flexShrink: 0 }}>
                        {m.score}pt
                      </span>
                    </div>
                    <div style={{ height: 3, background: `${PURP}11`, borderRadius: 2 }}>
                      <div style={{
                        width: `${barPct}%`, height: "100%",
                        background: PURP, borderRadius: 2,
                      }} />
                    </div>
                  </div>
                );
              })}
              {alert.matches.length > 6 && (
                <div style={{ fontSize: 7, color: MUTED, textAlign: "center" }}>
                  +{alert.matches.length - 6} more scenario{alert.matches.length - 6 !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TABS = ["ALL", "ARMED", "SILENT"];

export default function AlertScenarioResponseMap() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [error,     setError]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setData(await fetchAll());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:asrm-toggle", h);
    return () => window.removeEventListener("jarvis:asrm-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildAsrmScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const alerts    = data?.alerts    ?? [];
  const scenarios = data?.scenarios ?? [];
  const armed     = alerts.filter(a => a.armed === "ARMED");

  const visible = alerts
    .filter(a => tab === "ALL" || a.armed === tab)
    .filter(a => {
      if (!search) return true;
      const q = search.toLowerCase();
      return a.title.toLowerCase().includes(q)
        || a.category.toLowerCase().includes(q)
        || a.source.toLowerCase().includes(q);
    });

  if (!open) {
    return (
      <>
        <style>{`@keyframes asrm-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
        <button
          onClick={() => setOpen(true)}
          title="Alert × Scenario Response Map (ASRM)"
          style={{
            position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
            background: "rgba(4,7,14,0.82)", border: `1px solid ${CY}55`,
            color: CY, fontFamily: MONO, fontSize: 9, fontWeight: 700,
            padding: "4px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
          }}
        >
          ◈ ASRM
          {armed.length > 0 && (
            <span style={{
              marginLeft: 5, background: AMBER, color: "#000",
              borderRadius: 8, padding: "0 4px", fontSize: 8, fontWeight: 700,
              animation: "asrm-pulse 1.4s ease-in-out infinite",
            }}>
              {armed.length}
            </span>
          )}
        </button>
      </>
    );
  }

  return (
    <>
      <style>{`@keyframes asrm-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      <button
        onClick={() => setOpen(false)}
        title="Close ASRM"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 69,
          background: CY, border: "none",
          color: "#000", fontFamily: MONO, fontSize: 9, fontWeight: 700,
          padding: "4px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
        }}
      >
        ◈ ASRM ▲
      </button>

      <div style={{
        position: "fixed", left: 10, bottom: 55, zIndex: 68,
        width: 460, maxHeight: "74vh",
        background: BG, border: `1px solid ${CY}44`,
        borderRadius: 6, fontFamily: MONO,
        display: "flex", flexDirection: "column",
        boxShadow: `0 0 30px ${CY}22`,
      }}>
        {/* header */}
        <div style={{
          padding: "8px 12px", borderBottom: `1px solid ${CY}33`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 700, color: CY, letterSpacing: 2 }}>
              ◈ ALERT × SCENARIO RESPONSE MAP
            </span>
            {loading && (
              <span style={{ fontSize: 7, color: MUTED, marginLeft: 8 }}>polling…</span>
            )}
          </div>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.15)",
              border: `1px solid ${CY}66`, color: CY,
              fontFamily: MONO, fontSize: 8, padding: "3px 8px",
              borderRadius: 3, cursor: assessing ? "wait" : "pointer",
            }}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
          <StatTile label="ALERTS"    value={alerts.length}                accent={CY} />
          <StatTile label="SCENARIOS" value={scenarios.length}             accent={PURP} />
          <StatTile label="ARMED"     value={armed.length}                 accent={AMBER}
            pulse={armed.length > 0} />
          <StatTile label="SILENT"    value={alerts.length - armed.length} accent={GREEN} />
        </div>

        {error && (
          <div style={{ padding: "4px 12px", fontSize: 8, color: RED }}>{error}</div>
        )}

        {/* filter tabs + search */}
        <div style={{ display: "flex", gap: 4, padding: "0 12px 8px", alignItems: "center" }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? CY : "transparent",
                border: `1px solid ${tab === t ? CY : MUTED}44`,
                color: tab === t ? "#000" : MUTED,
                fontFamily: MONO, fontSize: 7, fontWeight: 700,
                padding: "2px 6px", borderRadius: 2, cursor: "pointer", letterSpacing: 1,
              }}
            >
              {t}
            </button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search alerts…"
            style={{
              flex: 1, background: "rgba(41,231,255,0.05)",
              border: `1px solid ${CY}33`, borderRadius: 2,
              color: CY, fontFamily: MONO, fontSize: 8,
              padding: "2px 6px", outline: "none",
            }}
          />
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
          {visible.length === 0 && !loading ? (
            <div style={{ fontSize: 8, color: MUTED, padding: "12px 0", textAlign: "center" }}>
              {alerts.length === 0 ? "No alerts loaded." : "No alerts match filter."}
            </div>
          ) : (
            visible.map(a => <AlertRow key={a.id} alert={a} />)
          )}
        </div>
      </div>
    </>
  );
}
