/**
 * F79 — Investigation × Ops Event × Risk Signal Active Threat Dashboard (IORSTD)
 * Endpoints: /v1/investigations × /v1/ops/events × /entities/RiskSignal
 * Classification: TRIPLE_ACTIVE (ops event + risk signal match) |
 *                 OPS_FLAGGED   (ops event only) |
 *                 RISK_BACKED   (risk signal only) |
 *                 DORMANT       (no real-time evidence)
 */
import { useEffect, useState, useRef } from "react";

const BTN_LEFT  = 987_720;
const POLL_MS   = 90_000;
const Z_INDEX   = 142;

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  import.meta.env?.VITE_API_KEY ||
  "";

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

const IORSTD_RE =
  /\b(iorstd|investigation\s*(threat|ops|risk|active)|active\s*investigation|live\s*threat|ops\s*risk\s*investigation|threat\s*active|inv\s*ops\s*risk|investigation\s*ops\s*event|threat\s*dashboard)\b/i;

export function isIorstdQuery(t) {
  return IORSTD_RE.test(t || "");
}

function normaliseInvestigation(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.inv_id || raw._id || String(Math.random()),
    name: raw.name || raw.title || raw.subject || "Untitled Investigation",
    description: raw.description || raw.summary || "",
    status: raw.status || raw.state || "",
    priority: raw.priority || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };
}

function normaliseOpsEvent(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.event_id || raw._id || String(Math.random()),
    name: raw.name || raw.title || raw.event_type || raw.type || "Untitled Event",
    description: raw.description || raw.details || raw.summary || "",
    severity: raw.severity || raw.level || "",
    timestamp: raw.timestamp || raw.created_at || raw.date || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };
}

function normaliseRiskSignal(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.signal_id || raw._id || String(Math.random()),
    name: raw.name || raw.title || raw.signal || "Untitled Signal",
    description: raw.description || raw.summary || "",
    severity: (raw.severity || raw.level || "MEDIUM").toUpperCase(),
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };
}

function tokenize(s) {
  if (!s) return [];
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function scoreMatch(invTokens, item) {
  const itemTokens = tokenize(
    `${item.name} ${item.description || ""} ${(item.tags || []).join(" ")}`
  );
  if (!invTokens.length || !itemTokens.length) return 0;
  const set = new Set(itemTokens);
  return invTokens.filter((t) => set.has(t)).length;
}

const CY = "#00e5ff";
const RD = "#ff4444";
const AM = "#ffc107";
const BL = "#3b82f6";
const GR = "#4ade80";

const SEV_COLOR = { CRITICAL: "#ff2222", HIGH: "#ff6600", MEDIUM: AM, LOW: "#aaaaaa" };

const CLASS_META = {
  TRIPLE_ACTIVE: { label: "TRIPLE ACTIVE", color: RD,  desc: "Backed by active ops event AND risk signal" },
  OPS_FLAGGED:   { label: "OPS FLAGGED",   color: BL,  desc: "Matched to ops event only" },
  RISK_BACKED:   { label: "RISK BACKED",   color: AM,  desc: "Matched to risk signal only" },
  DORMANT:       { label: "DORMANT",        color: "#555", desc: "No real-time ops or risk evidence" },
};

const TABS = ["ALL", "TRIPLE_ACTIVE", "OPS_FLAGGED", "RISK_BACKED", "DORMANT"];

export async function buildIorstdScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [invRes, opsRes, riskRes] = await Promise.allSettled([
    fetch(`${base}/v1/investigations`,   { headers }).then((r) => r.json()),
    fetch(`${base}/v1/ops/events`,       { headers }).then((r) => r.json()),
    fetch(`${base}/entities/RiskSignal`, { headers }).then((r) => r.json()),
  ]);

  const investigations = invRes.status  === "fulfilled" ? invRes.value  : [];
  const opsEvents      = opsRes.status  === "fulfilled" ? opsRes.value  : [];
  const riskSignals    = riskRes.status === "fulfilled" ? riskRes.value : [];

  const invArr  = (Array.isArray(investigations) ? investigations : investigations?.items  || investigations?.data  || []).map(normaliseInvestigation).filter(Boolean);
  const opsArr  = (Array.isArray(opsEvents)      ? opsEvents      : opsEvents?.items       || opsEvents?.data       || []).map(normaliseOpsEvent).filter(Boolean);
  const riskArr = (Array.isArray(riskSignals)    ? riskSignals    : riskSignals?.items     || riskSignals?.data     || []).map(normaliseRiskSignal).filter(Boolean);

  const counts = { TRIPLE_ACTIVE: 0, OPS_FLAGGED: 0, RISK_BACKED: 0, DORMANT: 0 };
  for (const inv of invArr) {
    const tok    = tokenize(`${inv.name} ${inv.description} ${inv.tags.join(" ")}`);
    const hasOps  = opsArr.some((e) => scoreMatch(tok, e) > 0);
    const hasRisk = riskArr.some((r) => scoreMatch(tok, r) > 0);
    if (hasOps && hasRisk)  counts.TRIPLE_ACTIVE++;
    else if (hasOps)        counts.OPS_FLAGGED++;
    else if (hasRisk)       counts.RISK_BACKED++;
    else                    counts.DORMANT++;
  }

  const criticals = riskArr.filter((r) => r.severity === "CRITICAL").length;
  return `Investigation Ops-Risk Dashboard online, sir. ${invArr.length} investigations cross-referenced against ${opsArr.length} ops events and ${riskSignals.length} risk signals — ${counts.TRIPLE_ACTIVE} are TRIPLE ACTIVE with both live ops coverage and active risk signals, ${counts.OPS_FLAGGED} are ops-flagged, ${counts.RISK_BACKED} are risk-backed, and ${counts.DORMANT} investigations are dormant with no real-time evidence. ${criticals > 0 ? `${criticals} critical risk signals in play — immediate attention warranted, sir.` : ""}`.trim();
}

export default function InvestigationOpsRiskDashboard() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [brief, setBrief]         = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [invRes, opsRes, riskRes] = await Promise.allSettled([
        fetch(`${base}/v1/investigations`,   { headers }).then((r) => r.json()),
        fetch(`${base}/v1/ops/events`,       { headers }).then((r) => r.json()),
        fetch(`${base}/entities/RiskSignal`, { headers }).then((r) => r.json()),
      ]);

      const investigations = invRes.status  === "fulfilled" ? invRes.value  : [];
      const opsEvents      = opsRes.status  === "fulfilled" ? opsRes.value  : [];
      const riskSignals    = riskRes.status === "fulfilled" ? riskRes.value : [];

      const invArr  = (Array.isArray(investigations) ? investigations : investigations?.items  || investigations?.data  || []).map(normaliseInvestigation).filter(Boolean);
      const opsArr  = (Array.isArray(opsEvents)      ? opsEvents      : opsEvents?.items       || opsEvents?.data       || []).map(normaliseOpsEvent).filter(Boolean);
      const riskArr = (Array.isArray(riskSignals)    ? riskSignals    : riskSignals?.items     || riskSignals?.data     || []).map(normaliseRiskSignal).filter(Boolean);

      const mapped = invArr.map((inv) => {
        const tok = tokenize(`${inv.name} ${inv.description} ${inv.tags.join(" ")}`);
        const matchedOps = opsArr
          .map((e) => ({ ...e, score: scoreMatch(tok, e) }))
          .filter((e) => e.score > 0)
          .sort((a, b) => b.score - a.score);
        const matchedRisk = riskArr
          .map((r) => ({ ...r, score: scoreMatch(tok, r) }))
          .filter((r) => r.score > 0)
          .sort((a, b) => b.score - a.score);
        const hasOps  = matchedOps.length  > 0;
        const hasRisk = matchedRisk.length > 0;
        const cls =
          hasOps && hasRisk ? "TRIPLE_ACTIVE" :
          hasOps            ? "OPS_FLAGGED"   :
          hasRisk           ? "RISK_BACKED"   :
                              "DORMANT";
        return { inv, matchedOps, matchedRisk, cls };
      });

      setRows(mapped);
    } catch (e) {
      setError(e?.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  useEffect(() => {
    const h = () => setOpen((v) => !v);
    window.addEventListener("jarvis:iorstd-toggle", h);
    return () => window.removeEventListener("jarvis:iorstd-toggle", h);
  }, []);

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const counts = { TRIPLE_ACTIVE: 0, OPS_FLAGGED: 0, RISK_BACKED: 0, DORMANT: 0 };
      rows.forEach((r) => counts[r.cls]++);
      const criticals = rows.flatMap((r) => r.matchedRisk).filter((r) => r.severity === "CRITICAL").length;
      const prompt = `JARVIS threat assessment: ${rows.length} investigations cross-referenced against ops events and risk signals. ${counts.TRIPLE_ACTIVE} triple-active (both ops+risk), ${counts.OPS_FLAGGED} ops-flagged, ${counts.RISK_BACKED} risk-backed, ${counts.DORMANT} dormant. ${criticals} critical risk signals in play. Provide a 2-sentence operational threat prioritisation brief.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      setBrief(d.answer || "Assessment unavailable.");
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  const counts = { TRIPLE_ACTIVE: 0, OPS_FLAGGED: 0, RISK_BACKED: 0, DORMANT: 0 };
  rows.forEach((r) => counts[r.cls]++);
  const tripleCount = counts.TRIPLE_ACTIVE;

  const filtered = rows.filter((r) => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.inv.name.toLowerCase().includes(s) || r.inv.description.toLowerCase().includes(s);
    }
    return true;
  });

  const PANEL_STYLE = {
    position: "fixed",
    bottom: 60,
    left: BTN_LEFT,
    zIndex: Z_INDEX,
    width: 520,
    maxHeight: "82vh",
    overflowY: "auto",
    background: "rgba(6,10,18,0.94)",
    border: `1px solid ${CY}44`,
    borderRadius: 12,
    fontFamily: "'JetBrains Mono',monospace",
    color: "#DCEBF5",
    fontSize: 11,
    boxShadow: `0 0 40px ${CY}18`,
    backdropFilter: "blur(10px)",
    padding: "14px 16px",
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Investigation × Ops Event × Risk Signal Dashboard (F79)"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: Z_INDEX,
          background: open ? CY : "rgba(6,10,18,0.82)",
          color: open ? "#040810" : CY,
          border: `1px solid ${CY}66`,
          borderRadius: 6,
          padding: "4px 9px",
          fontSize: 10,
          fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: 1,
          cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
      >
        {tripleCount > 0 && !open && (
          <span style={{
            marginRight: 4,
            background: RD,
            color: "#fff",
            borderRadius: 8,
            padding: "1px 5px",
            fontSize: 9,
          }}>
            {tripleCount}
          </span>
        )}
        ◈ IORSTD
      </button>

      {open && (
        <div style={PANEL_STYLE}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, letterSpacing: 2, fontSize: 12 }}>◈ IORSTD</span>
            <span style={{ color: "#6E8AA0", fontSize: 10, flexGrow: 1 }}>
              Investigation × Ops × Risk Dashboard
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14,
            }}>×</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {Object.entries(counts).map(([cls, n]) => (
              <div key={cls} style={{
                background: `${CLASS_META[cls].color}18`,
                border: `1px solid ${CLASS_META[cls].color}44`,
                borderRadius: 6,
                padding: "4px 8px",
                textAlign: "center",
              }}>
                <div style={{ color: CLASS_META[cls].color, fontSize: 14, fontWeight: "bold" }}>{n}</div>
                <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 0.5 }}>{CLASS_META[cls].label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? CY : "rgba(41,231,255,0.06)",
                color: tab === t ? "#040810" : CY,
                border: `1px solid ${CY}44`,
                borderRadius: 4,
                padding: "2px 7px",
                fontSize: 9,
                cursor: "pointer",
                letterSpacing: 0.5,
              }}>
                {t === "ALL" ? `ALL (${rows.length})` :
                 t === "TRIPLE_ACTIVE" ? `TRIPLE ACTIVE (${counts.TRIPLE_ACTIVE})` :
                 t === "OPS_FLAGGED"   ? `OPS FLAGGED (${counts.OPS_FLAGGED})` :
                 t === "RISK_BACKED"   ? `RISK BACKED (${counts.RISK_BACKED})` :
                 `DORMANT (${counts.DORMANT})`}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search investigations…"
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "rgba(41,231,255,0.05)",
              border: `1px solid ${CY}33`,
              borderRadius: 5,
              padding: "4px 8px",
              color: "#DCEBF5",
              fontSize: 10,
              marginBottom: 8,
              outline: "none",
              fontFamily: "inherit",
            }}
          />

          {loading && <div style={{ color: "#6E8AA0", fontSize: 10, marginBottom: 6 }}>◌ loading…</div>}
          {error   && <div style={{ color: RD, fontSize: 10, marginBottom: 6 }}>✗ {error}</div>}

          {/* Rows */}
          <div style={{ maxHeight: "48vh", overflowY: "auto" }}>
            {filtered.map((row) => {
              const { inv, matchedOps, matchedRisk, cls } = row;
              const meta = CLASS_META[cls];
              const isExp = expanded === inv.id;
              return (
                <div key={inv.id} style={{
                  borderBottom: `1px solid ${CY}18`,
                  paddingBottom: 8,
                  marginBottom: 8,
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : inv.id)}
                    style={{ cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 8 }}
                  >
                    <div style={{
                      minWidth: 90,
                      padding: "2px 5px",
                      background: `${meta.color}18`,
                      border: `1px solid ${meta.color}55`,
                      borderRadius: 4,
                      color: meta.color,
                      fontSize: 8,
                      letterSpacing: 0.5,
                      textAlign: "center",
                    }}>
                      {meta.label}
                    </div>
                    <div style={{ flexGrow: 1, minWidth: 0 }}>
                      <div style={{ color: "#DCEBF5", fontSize: 11, fontWeight: "bold", wordBreak: "break-word" }}>
                        {inv.name}
                      </div>
                      {inv.status && (
                        <span style={{ color: "#6E8AA0", fontSize: 9 }}>{inv.status}</span>
                      )}
                      <div style={{ color: "#4a6a80", fontSize: 9, marginTop: 2, display: "flex", gap: 8 }}>
                        <span>ops: {matchedOps.length}</span>
                        <span>risk: {matchedRisk.length}</span>
                      </div>
                    </div>
                    <span style={{ color: CY, fontSize: 10, marginLeft: "auto", flexShrink: 0 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 8, paddingLeft: 10 }}>
                      {/* Matched Ops Events */}
                      {matchedOps.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: BL, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            OPS EVENTS ({matchedOps.length})
                          </div>
                          {matchedOps.slice(0, 4).map((e) => (
                            <div key={e.id} style={{
                              background: `${BL}10`,
                              border: `1px solid ${BL}33`,
                              borderRadius: 5,
                              padding: "4px 7px",
                              marginBottom: 3,
                            }}>
                              <div style={{ color: "#DCEBF5", fontSize: 10 }}>{e.name}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                                <div style={{
                                  flexGrow: 1,
                                  height: 3,
                                  background: "#1a2a3a",
                                  borderRadius: 2,
                                  overflow: "hidden",
                                }}>
                                  <div style={{
                                    width: `${Math.min(100, e.score * 20)}%`,
                                    height: "100%",
                                    background: BL,
                                    borderRadius: 2,
                                  }} />
                                </div>
                                <span style={{ color: BL, fontSize: 8 }}>relevance {e.score}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Matched Risk Signals */}
                      {matchedRisk.length > 0 && (
                        <div>
                          <div style={{ color: RD, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            RISK SIGNALS ({matchedRisk.length})
                          </div>
                          {matchedRisk.slice(0, 4).map((r) => {
                            const sevColor = SEV_COLOR[r.severity] || AM;
                            return (
                              <div key={r.id} style={{
                                background: `${RD}10`,
                                border: `1px solid ${RD}33`,
                                borderRadius: 5,
                                padding: "4px 7px",
                                marginBottom: 3,
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{
                                    background: `${sevColor}22`,
                                    border: `1px solid ${sevColor}55`,
                                    borderRadius: 3,
                                    color: sevColor,
                                    fontSize: 8,
                                    padding: "1px 4px",
                                    flexShrink: 0,
                                  }}>
                                    {r.severity}
                                  </span>
                                  <div style={{ color: "#DCEBF5", fontSize: 10 }}>{r.name}</div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                                  <div style={{
                                    flexGrow: 1,
                                    height: 3,
                                    background: "#1a2a3a",
                                    borderRadius: 2,
                                    overflow: "hidden",
                                  }}>
                                    <div style={{
                                      width: `${Math.min(100, r.score * 20)}%`,
                                      height: "100%",
                                      background: RD,
                                      borderRadius: 2,
                                    }} />
                                  </div>
                                  <span style={{ color: RD, fontSize: 8 }}>relevance {r.score}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {matchedOps.length === 0 && matchedRisk.length === 0 && (
                        <div style={{ color: "#4a6a80", fontSize: 10 }}>
                          No real-time evidence found for this investigation.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && !loading && (
              <div style={{ color: "#4a6a80", fontSize: 10 }}>No investigations match the current filter.</div>
            )}
          </div>

          {/* Assess button */}
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={assess} disabled={assessing || rows.length === 0} style={{
              background: assessing ? "#1a2a3a" : `${CY}18`,
              border: `1px solid ${CY}55`,
              borderRadius: 5,
              color: CY,
              padding: "4px 10px",
              fontSize: 10,
              cursor: rows.length === 0 ? "default" : "pointer",
              fontFamily: "inherit",
              letterSpacing: 0.5,
            }}>
              {assessing ? "◌ assessing…" : "▶ ASSESS THREAT STATUS"}
            </button>
            <button onClick={load} style={{
              background: "none",
              border: `1px solid ${CY}33`,
              borderRadius: 5,
              color: "#6E8AA0",
              padding: "4px 8px",
              fontSize: 9,
              cursor: "pointer",
              fontFamily: "inherit",
            }}>
              ↻
            </button>
          </div>

          {brief && (
            <div style={{
              marginTop: 8,
              background: `${CY}0a`,
              border: `1px solid ${CY}33`,
              borderRadius: 6,
              padding: "7px 9px",
              color: "#DCEBF5",
              fontSize: 10,
              lineHeight: 1.5,
            }}>
              {brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
