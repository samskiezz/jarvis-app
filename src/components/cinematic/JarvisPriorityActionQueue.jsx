/**
 * F276 — JARVIS Priority Action Queue (JPAQ)
 *
 * Unified urgency-ranked queue across ALL actionable entity types:
 *
 *   /entities/Task          — pending tasks (urgency from priority)
 *   /entities/RiskSignal    — active risk signals (urgency from severity)
 *   /v1/investigations      — open investigation cases
 *   /v1/ops/events          — live ops events (urgency from severity)
 *   /entities/SwarmJob      — running/failed swarm jobs
 *
 * Urgency score per item type:
 *   RiskSignal:    CRITICAL=100  HIGH=70   MEDIUM=40  LOW=20  INFO=5
 *   OpsEvent:      CRITICAL=90   HIGH=65   WARNING=35 INFO=10
 *   Task:          CRITICAL=80   HIGH=60   MEDIUM=30  LOW=10  (pending only)
 *   SwarmJob:      FAILED=75     RUNNING=25
 *   Investigation: open case = 55
 *
 * Top 30 items ranked by urgency score; CRITICAL/HIGH/MEDIUM filter tabs.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence action brief + TTS.
 *
 * Toggle:  ◈ JPAQ  at left:6300, bottom:18, zIndex:68
 * Event:   jarvis:jpaq-toggle
 * Voice:   "priority queue / action queue / jpaq / most urgent / top actions /
 *           priority ranking / what should I do first / urgent items"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 6300;
const POLL_MS  = 90_000;
const CY       = "#29E7FF";
const GRN      = "#22c55e";
const AMB      = "#f59e0b";
const RED      = "#ef4444";
const PU       = "#a855f7";
const DIM      = "#6E8AA0";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ───────────────────────────────────────────────────

const JPAQ_RE =
  /\b(priority\s+queue|action\s+queue|jpaq|most\s+urgent|top\s+actions|priority\s+ranking|what\s+should\s+i\s+do\s+first|urgent\s+items|highest\s+priority|action\s+list|priority\s+list)\b/i;

export function isJpaqQuery(q) { return JPAQ_RE.test(q || ""); }

export async function buildJpaqScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [taskRes, riskRes, invRes, opsRes, swarmRes] = await Promise.all([
      fetch(`${base}/entities/Task`,         { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,   { headers: hdr }),
      fetch(`${base}/v1/investigations`,     { headers: hdr }),
      fetch(`${base}/v1/ops/events`,         { headers: hdr }),
      fetch(`${base}/entities/SwarmJob`,     { headers: hdr }),
    ]);

    const taskRaw  = taskRes.ok  ? await taskRes.json()  : [];
    const riskRaw  = riskRes.ok  ? await riskRes.json()  : [];
    const invRaw   = invRes.ok   ? await invRes.json()   : [];
    const opsRaw   = opsRes.ok   ? await opsRes.json()   : [];
    const swarmRaw = swarmRes.ok ? await swarmRes.json() : [];

    const items = buildQueue({ taskRaw, riskRaw, invRaw, opsRaw, swarmRaw });
    const top = items[0];
    const critCount = items.filter(i => i.urgency >= 80).length;

    if (!top) return "JARVIS Priority Queue is empty — no urgent actionable items found.";
    return (
      `JARVIS Priority Action Queue: ${items.length} total items, ${critCount} critical-urgency. ` +
      `Top priority: ${top.label} (urgency ${top.urgency}/100, type ${top.type}). ` +
      `Review the queue and address highest-urgency items first.`
    );
  } catch (e) {
    return `JPAQ assessment failed: ${e.message}`;
  }
}

// ── queue construction ────────────────────────────────────────────────────────

function norm(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && Array.isArray(raw.data))    return raw.data;
  return [];
}

const RISK_SCORE  = { CRITICAL:100, HIGH:70, MEDIUM:40, LOW:20, INFO:5 };
const OPS_SCORE   = { CRITICAL:90,  HIGH:65, WARNING:35, INFO:10, ERROR:80 };
const TASK_SCORE  = { CRITICAL:80,  HIGH:60, MEDIUM:30, LOW:10 };

function buildQueue({ taskRaw, riskRaw, invRaw, opsRaw, swarmRaw }) {
  const items = [];

  norm(riskRaw).forEach(r => {
    const sev = (r.severity || r.level || "").toUpperCase();
    const u = RISK_SCORE[sev] || 15;
    items.push({ id: r.id || r._id, type: "RiskSignal", urgency: u,
      label: r.title || r.name || "Unnamed risk signal",
      detail: sev || "—", badge: sev });
  });

  norm(opsRaw).forEach(e => {
    const sev = (e.severity || e.level || e.type || "").toUpperCase();
    const u = OPS_SCORE[sev] || 15;
    items.push({ id: e.id || e._id, type: "OpsEvent", urgency: u,
      label: e.name || e.title || e.message || e.resource || "Ops event",
      detail: sev || "—", badge: sev });
  });

  norm(taskRaw)
    .filter(t => !["done","completed","closed"].includes((t.status||"").toLowerCase()))
    .forEach(t => {
      const pri = (t.priority || "LOW").toUpperCase();
      const u = TASK_SCORE[pri] || 10;
      items.push({ id: t.id || t._id, type: "Task", urgency: u,
        label: t.title || t.name || "Unnamed task",
        detail: `${pri} | ${t.status || "pending"}`, badge: pri });
    });

  norm(invRaw).forEach(i => {
    items.push({ id: i.id || i._id, type: "Investigation", urgency: 55,
      label: i.title || i.name || "Open investigation",
      detail: i.status || "open", badge: "OPEN" });
  });

  norm(swarmRaw).forEach(j => {
    const st = (j.status || "").toLowerCase();
    if (st === "failed") {
      items.push({ id: j.id || j._id, type: "SwarmJob", urgency: 75,
        label: j.name || "Swarm job", detail: "FAILED", badge: "FAILED" });
    } else if (st === "running") {
      items.push({ id: j.id || j._id, type: "SwarmJob", urgency: 25,
        label: j.name || "Swarm job", detail: "RUNNING", badge: "RUNNING" });
    }
  });

  items.sort((a, b) => b.urgency - a.urgency);
  return items.slice(0, 50);
}

function urgencyColor(u) {
  if (u >= 80) return RED;
  if (u >= 55) return AMB;
  if (u >= 30) return CY;
  return GRN;
}

function typeColor(type) {
  switch (type) {
    case "RiskSignal":    return RED;
    case "OpsEvent":      return "#ff7c1a";
    case "Task":          return CY;
    case "Investigation": return PU;
    case "SwarmJob":      return GRN;
    default:              return DIM;
  }
}

function typeShort(type) {
  switch (type) {
    case "RiskSignal":    return "RISK";
    case "OpsEvent":      return "OPS";
    case "Task":          return "TASK";
    case "Investigation": return "CASE";
    case "SwarmJob":      return "SWARM";
    default:              return type;
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function JarvisPriorityActionQueue() {
  const [open,    setOpen]    = useState(false);
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [filter,  setFilter]  = useState("ALL");
  const [search,  setSearch]  = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [taskRes, riskRes, invRes, opsRes, swarmRes] = await Promise.all([
        fetch(`${base}/entities/Task`,         { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`,   { headers: hdr }),
        fetch(`${base}/v1/investigations`,     { headers: hdr }),
        fetch(`${base}/v1/ops/events`,         { headers: hdr }),
        fetch(`${base}/entities/SwarmJob`,     { headers: hdr }),
      ]);
      const taskRaw  = taskRes.ok  ? await taskRes.json()  : [];
      const riskRaw  = riskRes.ok  ? await riskRes.json()  : [];
      const invRaw   = invRes.ok   ? await invRes.json()   : [];
      const opsRaw   = opsRes.ok   ? await opsRes.json()   : [];
      const swarmRaw = swarmRes.ok ? await swarmRes.json() : [];
      setItems(buildQueue({ taskRaw, riskRaw, invRaw, opsRaw, swarmRaw }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:jpaq-toggle", onToggle);
    return () => window.removeEventListener("jarvis:jpaq-toggle", onToggle);
  }, []);

  const critCount = items.filter(i => i.urgency >= 80).length;

  const filtered = items.filter(item => {
    const matchFilter =
      filter === "ALL" ||
      (filter === "CRITICAL" && item.urgency >= 80) ||
      (filter === "HIGH"     && item.urgency >= 55 && item.urgency < 80) ||
      (filter === "MEDIUM"   && item.urgency >= 20 && item.urgency < 55);
    const q = search.toLowerCase();
    const matchSearch = !q || item.label.toLowerCase().includes(q) || item.type.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  async function assess() {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildJpaqScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch (e) {
      // silently ignore
    } finally {
      setAssessing(false);
    }
  }

  const panelStyle = {
    position: "fixed", bottom: 60, left: BTN_LEFT, zIndex: 68,
    width: "min(540px, 92vw)",
    background: "rgba(6,10,18,0.93)", border: `1px solid ${CY}44`,
    borderRadius: 14, padding: "16px 18px",
    backdropFilter: "blur(14px)", boxShadow: `0 0 60px ${CY}18`,
    fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    maxHeight: "min(640px, 80vh)", display: "flex", flexDirection: "column",
  };

  const FILTERS = ["ALL","CRITICAL","HIGH","MEDIUM"];

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: critCount > 0 ? `${RED}22` : "rgba(5,8,13,0.7)",
          border: `1px solid ${critCount > 0 ? RED : CY}55`,
          color: critCount > 0 ? RED : CY,
          borderRadius: 8, padding: "4px 10px", fontSize: 11,
          cursor: "pointer", letterSpacing: 1,
          boxShadow: critCount > 0 ? `0 0 18px ${RED}44` : "none",
          animation: critCount > 0 ? "jpaq-pulse 1.4s ease-in-out infinite" : "none",
        }}
      >
        ◈ JPAQ
        {critCount > 0 && (
          <span style={{
            marginLeft: 5, background: RED, color: "#fff",
            borderRadius: 10, padding: "1px 6px", fontSize: 10,
          }}>{critCount}</span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: 2 }}>
              JARVIS PRIORITY ACTION QUEUE
            </span>
            <span style={{ marginLeft: "auto", fontSize: 10, color: DIM }}>
              {loading ? "updating…" : `${items.length} items`}
            </span>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: "transparent", border: `1px solid ${CY}55`,
                color: CY, borderRadius: 6, padding: "2px 8px", fontSize: 10,
                cursor: "pointer", letterSpacing: 1,
              }}
            >▶ {assessing ? "…" : "ASSESS"}</button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "transparent", border: "none", color: DIM,
                cursor: "pointer", fontSize: 14, padding: "0 2px" }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {[
              { label: "TOTAL",    val: items.length,                              col: CY },
              { label: "CRITICAL", val: items.filter(i=>i.urgency>=80).length,     col: RED },
              { label: "HIGH",     val: items.filter(i=>i.urgency>=55&&i.urgency<80).length, col: AMB },
              { label: "MEDIUM",   val: items.filter(i=>i.urgency>=20&&i.urgency<55).length, col: CY },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1, background: `${col}11`, border: `1px solid ${col}33`,
                borderRadius: 8, padding: "5px 6px", textAlign: "center",
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: col }}>{val}</div>
                <div style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                background: filter===f ? `${CY}22` : "transparent",
                border: `1px solid ${filter===f ? CY : CY+"33"}`,
                color: filter===f ? CY : DIM, borderRadius: 6, padding: "2px 8px",
                fontSize: 9, cursor: "pointer", letterSpacing: 1,
              }}>{f}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.04)",
                border: `1px solid ${CY}22`, borderRadius: 6, padding: "2px 8px",
                fontSize: 10, color: "#DCEBF5", outline: "none", width: 110,
              }}
            />
          </div>

          {/* queue list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {error && <div style={{ color: RED, fontSize: 11, marginBottom: 8 }}>⚠ {error}</div>}
            {loading && items.length === 0 && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: "20px 0" }}>
                loading queue…
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: "20px 0" }}>
                no items match current filter
              </div>
            )}
            {filtered.map((item, idx) => {
              const uCol = urgencyColor(item.urgency);
              const tCol = typeColor(item.type);
              const isExp = expanded === (item.id || idx);
              return (
                <div key={item.id || idx}>
                  <div
                    onClick={() => setExpanded(isExp ? null : (item.id || idx))}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 8px", borderRadius: 8, marginBottom: 3,
                      background: isExp ? `${CY}0a` : "transparent",
                      cursor: "pointer",
                      border: `1px solid ${isExp ? CY+"33" : "transparent"}`,
                    }}
                  >
                    {/* urgency score */}
                    <div style={{
                      minWidth: 34, textAlign: "center",
                      fontSize: 12, fontWeight: 700, color: uCol,
                    }}>{item.urgency}</div>

                    {/* urgency bar */}
                    <div style={{
                      width: 60, height: 4, background: `${uCol}22`, borderRadius: 2,
                    }}>
                      <div style={{
                        width: `${item.urgency}%`, height: "100%",
                        background: uCol, borderRadius: 2,
                      }} />
                    </div>

                    {/* type badge */}
                    <span style={{
                      fontSize: 9, letterSpacing: 1, color: tCol,
                      border: `1px solid ${tCol}55`, borderRadius: 4,
                      padding: "1px 5px", minWidth: 44, textAlign: "center",
                    }}>{typeShort(item.type)}</span>

                    {/* label */}
                    <span style={{
                      flex: 1, fontSize: 11, color: "#DCEBF5",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{item.label}</span>

                    {/* detail badge */}
                    <span style={{ fontSize: 9, color: DIM }}>{item.detail}</span>
                    <span style={{ fontSize: 10, color: DIM }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {isExp && (
                    <div style={{
                      marginLeft: 16, marginBottom: 6, padding: "8px 10px",
                      background: `${tCol}0a`, border: `1px solid ${tCol}22`,
                      borderRadius: 8, fontSize: 11,
                    }}>
                      <div style={{ color: tCol, fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        {item.type.toUpperCase()} DETAILS
                      </div>
                      <div style={{ color: "#DCEBF5" }}><b>Label:</b> {item.label}</div>
                      <div style={{ color: DIM }}><b>Status/Priority:</b> {item.detail}</div>
                      <div style={{ color: DIM }}><b>Urgency Score:</b> {item.urgency}/100</div>
                      {item.id && <div style={{ color: DIM, fontSize: 9 }}><b>ID:</b> {item.id}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes jpaq-pulse {
          0%,100% { box-shadow: 0 0 8px ${RED}44; }
          50%      { box-shadow: 0 0 22px ${RED}88; }
        }
      `}</style>
    </>
  );
}
