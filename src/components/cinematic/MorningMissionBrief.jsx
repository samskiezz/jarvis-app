/**
 * MorningMissionBrief — F166
 *
 * Parallel-fetches /entities/Task, /entities/RiskSignal, /v1/ops/events, and
 * /v1/investigations, compiles a structured briefing packet, then sends it to
 * /v1/jarvis/agent/chat for an AI-narrated mission brief.  Speaks the result
 * via jarvis:speak-dossier.  Stores the last 5 briefs (timestamp + text) in
 * localStorage.  Auto-generates on first open when the most-recent brief is
 * older than 4 hours.
 *
 * Toggle:  ◎ MBRIEF at bottom:8 left:55080, zIndex:108.
 * Event:   jarvis:mbrief-toggle
 * Voice:   "morning brief" / "mission brief" / "daily brief" /
 *          "today's brief" / "mbrief" / "situational brief" / "sitrep brief"
 * Refresh: manual (▶ GENERATE) + auto on open when stale.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const GRN  = "#00E5A0";
const AMB  = "#F5A623";
const RED  = "#FF3D5A";
const PRP  = "#b18cff";
const MONO = "'JetBrains Mono',monospace";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const STALE_MS   = 4 * 60 * 60 * 1000; // 4 h
const MAX_STORED = 5;
const LS_KEY     = "jarvis_mbrief_history";

// ─── voice intent ─────────────────────────────────────────────────────────────

const MBRIEF_RE =
  /\b(morning.brief|mission.brief|daily.brief|today.?s.brief|mbrief|situational.brief|sitrep.brief|briefing|brief.me)\b/i;

export function isMBriefQuery(t) {
  return MBRIEF_RE.test(t || "");
}

// ─── normalise helpers ────────────────────────────────────────────────────────

function normArr(raw, ...keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (raw && Array.isArray(raw[k])) return raw[k];
  }
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function getTaskStatus(t) {
  return (t.status || t.state || "").toLowerCase();
}

function getRiskSeverity(r) {
  const s = (r.severity || r.level || "").toLowerCase();
  if (s === "critical") return 3;
  if (s === "high")     return 2;
  if (s === "medium")   return 1;
  return 0;
}

function getOpsService(e) {
  return e.service || e.source || e.component || e.type || "unknown";
}

function getInvStatus(i) {
  return (i.status || i.state || "open").toLowerCase();
}

// ─── data fetchers ────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [tR, rR, oR, iR] = await Promise.allSettled([
    fetch(`${base}/entities/Task`,          { headers: hdr }).then(r => r.json()),
    fetch(`${base}/entities/RiskSignal`,    { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/ops/events`,          { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/investigations`,      { headers: hdr }).then(r => r.json()),
  ]);
  return {
    tasks:   tR.status === "fulfilled" ? normArr(tR.value,   "items","data","results","tasks")   : [],
    risks:   rR.status === "fulfilled" ? normArr(rR.value,   "items","data","results","signals")  : [],
    ops:     oR.status === "fulfilled" ? normArr(oR.value,   "items","data","results","events")   : [],
    invests: iR.status === "fulfilled" ? normArr(iR.value,   "items","data","results","investigations") : [],
  };
}

// ─── AI brief builder ─────────────────────────────────────────────────────────

async function generateBrief({ tasks, risks, ops, invests }) {
  const openTasks   = tasks.filter(t => !["done","closed","complete","completed"].includes(getTaskStatus(t)));
  const critRisks   = risks.filter(r => getRiskSeverity(r) >= 2).sort((a,b) => getRiskSeverity(b) - getRiskSeverity(a));
  const recentOps   = ops.slice(0, 5);
  const openInv     = invests.filter(i => !["closed","resolved","complete","completed"].includes(getInvStatus(i)));

  const context = [
    `TASKS: ${openTasks.length} open (${tasks.length} total). ` +
      (openTasks.slice(0,3).map(t => t.title || t.name || t.id).join(", ") || "none listed"),
    `RISK SIGNALS: ${risks.length} total, ${critRisks.length} high/critical. ` +
      (critRisks.slice(0,3).map(r => `${r.title||r.name||"Signal"} [${r.severity||r.level||"?"}]`).join(", ") || "none critical"),
    `OPS EVENTS: ${ops.length} events. Recent services: ` +
      ([...new Set(recentOps.map(getOpsService))].join(", ") || "none"),
    `INVESTIGATIONS: ${openInv.length} open of ${invests.length} total.`,
  ].join("\n");

  const prompt =
    "You are JARVIS, a British AI assistant. Using only the following real operational data, " +
    "deliver a concise spoken mission brief in 4–6 sentences. Prioritise by severity. " +
    "Be factual, specific, and direct. Do not invent details not present in the data.\n\n" +
    "OPERATIONAL DATA:\n" + context;

  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ message: prompt }),
  });
  if (!r.ok) throw new Error(`agent/chat ${r.status}`);
  const d = await r.json();
  return (d.answer || d.response || d.text || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
}

// ─── exported voice builder (JarvisBrain) ────────────────────────────────────

export async function buildMBriefScript() {
  try {
    const data = await fetchAll();
    const brief = await generateBrief(data);
    if (brief) return brief;
    return "Mission brief is online, sir. Standing by to compile your situational overview.";
  } catch (_) {
    return "Mission brief service is online, sir. Operational data feeds are updating.";
  }
}

// ─── localStorage brief history ───────────────────────────────────────────────

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch (_) { return []; }
}

function saveHistory(history) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(history.slice(-MAX_STORED))); } catch (_) {}
}

function appendBrief(text) {
  const h = loadHistory();
  h.push({ ts: Date.now(), text });
  saveHistory(h);
  return h;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtAge(ts) {
  if (!ts) return "";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h/24)}d ago`;
}

function sevColor(r) {
  const s = getRiskSeverity(r);
  if (s === 3) return RED;
  if (s === 2) return AMB;
  return CY;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div style={{
      flex: 1, textAlign: "center",
      padding: "6px 4px",
      background: `${color}10`,
      border: `1px solid ${color}33`,
      borderRadius: 6,
    }}>
      <div style={{ fontSize: 16, fontWeight: "bold", color, lineHeight: 1.1 }}>{value ?? "—"}</div>
      <div style={{ fontSize: 8, color: `${color}88`, letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function BriefRow({ icon, label, items, color }) {
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 8, color: `${color}88`, letterSpacing: 1.5, marginBottom: 4 }}>
        {icon} {label} ({items.length})
      </div>
      {items.slice(0, 4).map((item, i) => (
        <div key={i} style={{
          fontSize: 9, color: "#DCEBF5",
          padding: "3px 8px",
          background: `${color}08`,
          border: `1px solid ${color}22`,
          borderRadius: 4, marginBottom: 2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {item}
        </div>
      ))}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function MorningMissionBrief() {
  const [open,      setOpen]    = useState(false);
  const [loading,   setLoading] = useState(false);
  const [data,      setData]    = useState(null);
  const [brief,     setBrief]   = useState("");
  const [briefTs,   setBriefTs] = useState(null);
  const [history,   setHistory] = useState(() => loadHistory());
  const [error,     setError]   = useState(null);
  const [showHist,  setShowHist]= useState(false);
  const busyRef = useRef(false);

  const generate = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true); setError(null);
    try {
      const d = await fetchAll();
      setData(d);
      const text = await generateBrief(d);
      setBrief(text);
      const ts = Date.now();
      setBriefTs(ts);
      const h = appendBrief(text);
      setHistory(h);
      // speak via jarvis:speak-dossier
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (e) {
      setError("Brief generation failed: " + (e.message || "unknown error"));
    } finally {
      setLoading(false);
      busyRef.current = false;
    }
  }, []);

  // auto-generate on open when stale
  useEffect(() => {
    if (!open) return;
    const lastTs = history[history.length - 1]?.ts ?? 0;
    if (!brief && Date.now() - lastTs > STALE_MS) {
      generate();
    } else if (!brief && history.length > 0) {
      // restore most-recent brief from history without regenerating
      const last = history[history.length - 1];
      setBrief(last.text);
      setBriefTs(last.ts);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // listen for toggle event
  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:mbrief-toggle", handler);
    return () => window.removeEventListener("jarvis:mbrief-toggle", handler);
  }, []);

  const openTasks  = data ? data.tasks.filter(t => !["done","closed","complete","completed"].includes(getTaskStatus(t))) : [];
  const critRisks  = data ? data.risks.filter(r => getRiskSeverity(r) >= 2).sort((a,b) => getRiskSeverity(b) - getRiskSeverity(a)) : [];
  const openInv    = data ? data.invests.filter(i => !["closed","resolved","complete","completed"].includes(getInvStatus(i))) : [];

  const histBadge = history.length;

  return (
    <>
      {/* Bottom-strip toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Morning Mission Brief — F166 (AI daily ops briefing)"
        style={{
          position: "fixed", bottom: 8, left: 55080, zIndex: 108,
          background: open ? `${CY}22` : "rgba(5,8,13,0.7)",
          border: `1px solid ${open ? CY : CY + "55"}`,
          color: open ? CY : `${CY}99`,
          borderRadius: 6, padding: "3px 9px", fontSize: 9, letterSpacing: 1.5,
          fontFamily: MONO, cursor: "pointer",
          backdropFilter: "blur(6px)", whiteSpace: "nowrap",
        }}
      >
        ◎ MBRIEF{histBadge > 0 && <span style={{
          marginLeft: 5, background: GRN, color: "#000",
          borderRadius: 8, padding: "0 4px", fontSize: 8, fontWeight: "bold",
        }}>{histBadge}</span>}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 40, left: 55080,
          width: "min(540px, 96vw)",
          maxHeight: "84vh",
          overflowY: "auto",
          background: "rgba(6,11,18,0.97)",
          border: `1px solid ${CY}44`,
          borderRadius: 12,
          boxShadow: `0 0 60px ${CY}18`,
          fontFamily: MONO,
          zIndex: 110,
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px 8px",
            borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ color: CY, fontSize: 11, fontWeight: "bold", letterSpacing: 2 }}>
              ◎ MISSION BRIEF
            </span>
            {loading && (
              <span style={{ fontSize: 9, color: `${CY}88`, marginLeft: 4 }}>
                generating…
              </span>
            )}
            {briefTs && !loading && (
              <span style={{ fontSize: 8, color: "#6E8AA0", marginLeft: 4 }}>
                {fmtAge(briefTs)}
              </span>
            )}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button
                onClick={() => setShowHist(v => !v)}
                title="Brief history"
                style={{
                  background: showHist ? `${PRP}22` : "transparent",
                  border: `1px solid ${PRP}44`, color: PRP,
                  borderRadius: 4, padding: "2px 8px", fontSize: 9, cursor: "pointer",
                }}
              >
                HIST {histBadge > 0 && `(${histBadge})`}
              </button>
              <button
                onClick={generate}
                disabled={loading}
                title="Generate new brief"
                style={{
                  background: `${GRN}18`, border: `1px solid ${GRN}44`, color: GRN,
                  borderRadius: 4, padding: "2px 10px", fontSize: 9, cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.5 : 1, fontWeight: "bold",
                }}
              >
                {loading ? "…" : "▶ GENERATE"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "transparent", border: "none", color: "#6E8AA0",
                  fontSize: 12, cursor: "pointer", padding: "0 2px",
                }}
              >✕</button>
            </div>
          </div>

          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Stat tiles */}
            {data && (
              <div style={{ display: "flex", gap: 6 }}>
                <StatTile label="OPEN TASKS"   value={openTasks.length}         color={CY} />
                <StatTile label="CRITICAL/HIGH" value={critRisks.length}        color={RED} />
                <StatTile label="OPS EVENTS"   value={data.ops.length}          color={AMB} />
                <StatTile label="OPEN CASES"   value={openInv.length}           color={PRP} />
              </div>
            )}

            {/* AI Brief */}
            <section>
              <div style={{ fontSize: 9, color: `${CY}88`, letterSpacing: 2, marginBottom: 6 }}>
                AI MISSION BRIEF
              </div>
              <div style={{
                padding: "10px 12px",
                background: `${PRP}08`,
                border: `1px solid ${PRP}33`,
                borderRadius: 8,
                fontSize: 11,
                color: "#DCEBF5",
                lineHeight: 1.75,
                minHeight: 52,
              }}>
                {error ? (
                  <span style={{ color: RED }}>{error}</span>
                ) : loading ? (
                  <span style={{ color: `${PRP}88` }}>
                    Compiling mission brief from live operational data…
                  </span>
                ) : brief ? (
                  brief
                ) : (
                  <span style={{ color: `${CY}44` }}>
                    Press ▶ GENERATE to compile today's mission brief.
                  </span>
                )}
              </div>
            </section>

            {/* Notable risks */}
            {critRisks.length > 0 && (
              <BriefRow
                icon="⚠"
                label="HIGH / CRITICAL RISKS"
                color={RED}
                items={critRisks.slice(0, 5).map(r =>
                  `[${(r.severity || r.level || "?").toUpperCase()}] ${r.title || r.name || r.id || "Risk Signal"}`
                )}
              />
            )}

            {/* Open tasks */}
            {openTasks.length > 0 && (
              <BriefRow
                icon="◉"
                label="OPEN TASKS"
                color={CY}
                items={openTasks.slice(0, 4).map(t =>
                  `[${(getTaskStatus(t) || "open").toUpperCase()}] ${t.title || t.name || t.id || "Task"}`
                )}
              />
            )}

            {/* Open investigations */}
            {openInv.length > 0 && (
              <BriefRow
                icon="◈"
                label="OPEN INVESTIGATIONS"
                color={PRP}
                items={openInv.slice(0, 4).map(i =>
                  i.title || i.name || i.id || "Investigation"
                )}
              />
            )}

            {/* Ops events */}
            {data && data.ops.length > 0 && (
              <BriefRow
                icon="◆"
                label="OPS EVENTS"
                color={AMB}
                items={data.ops.slice(0, 4).map(e =>
                  `[${getOpsService(e).toUpperCase()}] ${e.message || e.title || e.name || e.type || "Event"}`
                )}
              />
            )}

            {/* Brief history */}
            {showHist && (
              <section>
                <div style={{ fontSize: 9, color: `${PRP}88`, letterSpacing: 2, marginBottom: 6 }}>
                  BRIEF HISTORY ({history.length})
                </div>
                {history.length === 0 ? (
                  <div style={{ fontSize: 9, color: "#6E8AA0" }}>No briefs stored yet.</div>
                ) : (
                  [...history].reverse().map((h, i) => (
                    <div key={i} style={{
                      padding: "6px 10px",
                      background: `${PRP}05`,
                      border: `1px solid ${PRP}22`,
                      borderRadius: 6, marginBottom: 4,
                    }}>
                      <div style={{ fontSize: 8, color: `${PRP}88`, marginBottom: 3 }}>
                        {fmtAge(h.ts)} ({new Date(h.ts).toLocaleString("en-GB", { hour12: false })})
                      </div>
                      <div style={{ fontSize: 9, color: "#DCEBF5", lineHeight: 1.6 }}>
                        {h.text}
                      </div>
                    </div>
                  ))
                )}
              </section>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 14px 10px",
            borderTop: `1px solid ${CY}11`,
            fontSize: 8, color: "#6E8AA0",
            display: "flex", justifyContent: "space-between",
          }}>
            <span>stale threshold: 4 h · last {MAX_STORED} briefs stored</span>
            <span style={{ color: GRN }}>
              ◉ Task · RiskSignal · ops/events · investigations
            </span>
          </div>
        </div>
      )}
    </>
  );
}
