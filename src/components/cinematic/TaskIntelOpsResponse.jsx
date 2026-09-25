/**
 * F89 — Task × IntelProfile × Ops Event Active Response Coverage (TIORCOV)
 * Endpoints: /entities/Task × /entities/IntelProfile × /v1/ops/events
 * Classification:
 *   ACTIVE_RESPONSE  — matched intel profile AND ops event (threat + live ops)
 *   THREAT_TASKED    — matched intel profile only
 *   OPS_DRIVEN       — matched ops event only
 *   BACKGROUND       — no match (no direct threat or ops context)
 */
import { useEffect, useState, useRef } from "react";

const BTN_LEFT = 992_760;
const POLL_MS  = 90_000;

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

const TIORCOV_RE =
  /\b(tiorcov|task\s*intel\s*ops|active\s*response\s*task|threat\s*tasked|ops\s*driven\s*task|task\s*response\s*coverage|active\s*response\s*coverage|task\s*intel\s*ops\s*coverage|response\s*task\s*map)\b/i;

export function isTiorcovQuery(t) {
  return TIORCOV_RE.test(t || "");
}

function normaliseTask(raw) {
  if (!raw) return null;
  return {
    id:          raw.id          || raw.task_id   || raw._id || String(Math.random()),
    name:        raw.name        || raw.title      || raw.subject      || "Untitled Task",
    description: raw.description || raw.details    || raw.summary      || "",
    status:      raw.status      || raw.state      || "",
    priority:    raw.priority    || raw.urgency    || "",
    tags:        Array.isArray(raw.tags) ? raw.tags : [],
  };
}

function normaliseIntelProfile(raw) {
  if (!raw) return null;
  return {
    id:          raw.id          || raw.profile_id || raw._id || String(Math.random()),
    name:        raw.name        || raw.actor      || raw.display_name || "Unknown Actor",
    aliases:     Array.isArray(raw.aliases) ? raw.aliases : [],
    org:         raw.org         || raw.organisation || raw.organization || "",
    role:        raw.role        || raw.type        || "",
    tags:        Array.isArray(raw.tags) ? raw.tags : [],
  };
}

function normaliseOpsEvent(raw) {
  if (!raw) return null;
  return {
    id:          raw.id          || raw.event_id  || raw._id || String(Math.random()),
    name:        raw.name        || raw.title      || raw.event || raw.type || "Unnamed Event",
    description: raw.description || raw.summary   || raw.details || "",
    severity:    raw.severity    || raw.level      || raw.priority || "",
    status:      raw.status      || raw.state      || "",
    tags:        Array.isArray(raw.tags) ? raw.tags : [],
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

function scoreTask(taskTokens, item) {
  const itemTokens = tokenize(
    `${item.name} ${item.description || ""} ${(item.tags || []).join(" ")} ${item.org || ""} ${(item.aliases || []).join(" ")}`
  );
  if (!taskTokens.length || !itemTokens.length) return 0;
  const set = new Set(itemTokens);
  return taskTokens.filter((t) => set.has(t)).length;
}

const CY = "#00e5ff";
const OR = "#fb923c";
const BL = "#3b82f6";
const RD = "#f87171";
const AM = "#ffc107";

const CLASS_META = {
  ACTIVE_RESPONSE: { label: "ACTIVE RESPONSE", color: RD,       desc: "Matched intel profile AND ops event" },
  THREAT_TASKED:   { label: "THREAT TASKED",   color: OR,       desc: "Matched intel profile only" },
  OPS_DRIVEN:      { label: "OPS DRIVEN",      color: BL,       desc: "Matched ops event only" },
  BACKGROUND:      { label: "BACKGROUND",      color: "#6E8AA0", desc: "No threat or ops context match" },
};

const TABS = ["ALL", "ACTIVE_RESPONSE", "THREAT_TASKED", "OPS_DRIVEN", "BACKGROUND"];

export async function buildTiorcovScript() {
  const base    = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [tkRes, ipRes, opRes] = await Promise.allSettled([
    fetch(`${base}/entities/Task`,          { headers }).then((r) => r.json()),
    fetch(`${base}/entities/IntelProfile`,  { headers }).then((r) => r.json()),
    fetch(`${base}/v1/ops/events`,          { headers }).then((r) => r.json()),
  ]);

  const tasks  = tkRes.status === "fulfilled" ? tkRes.value : [];
  const intel  = ipRes.status === "fulfilled" ? ipRes.value : [];
  const events = opRes.status === "fulfilled" ? opRes.value : [];

  const tkArr  = (Array.isArray(tasks)  ? tasks  : tasks?.items  || tasks?.data  || []).map(normaliseTask).filter(Boolean);
  const ipArr  = (Array.isArray(intel)  ? intel  : intel?.items  || intel?.data  || []).map(normaliseIntelProfile).filter(Boolean);
  const opArr  = (Array.isArray(events) ? events : events?.items || events?.data || []).map(normaliseOpsEvent).filter(Boolean);

  const counts = { ACTIVE_RESPONSE: 0, THREAT_TASKED: 0, OPS_DRIVEN: 0, BACKGROUND: 0 };
  for (const t of tkArr) {
    const tok    = tokenize(`${t.name} ${t.description} ${t.tags.join(" ")}`);
    const hasIp  = ipArr.some((p) => scoreTask(tok, p) > 0);
    const hasOps = opArr.some((e) => scoreTask(tok, e) > 0);
    if (hasIp && hasOps)   counts.ACTIVE_RESPONSE++;
    else if (hasIp)        counts.THREAT_TASKED++;
    else if (hasOps)       counts.OPS_DRIVEN++;
    else                   counts.BACKGROUND++;
  }

  return `Task Active Response Coverage online, sir. ${tkArr.length} tasks cross-referenced against ${ipArr.length} intel profiles and ${opArr.length} ops events. ${counts.ACTIVE_RESPONSE} tasks are ACTIVE RESPONSE — linked to both a threat actor and live ops. ${counts.THREAT_TASKED} threat-tasked, ${counts.OPS_DRIVEN} ops-driven. ${counts.BACKGROUND} background tasks show no direct threat or ops context.`;
}

export default function TaskIntelOpsResponse() {
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
      const base    = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [tkRes, ipRes, opRes] = await Promise.allSettled([
        fetch(`${base}/entities/Task`,         { headers }).then((r) => r.json()),
        fetch(`${base}/entities/IntelProfile`, { headers }).then((r) => r.json()),
        fetch(`${base}/v1/ops/events`,         { headers }).then((r) => r.json()),
      ]);

      const tasks  = tkRes.status === "fulfilled" ? tkRes.value : [];
      const intel  = ipRes.status === "fulfilled" ? ipRes.value : [];
      const events = opRes.status === "fulfilled" ? opRes.value : [];

      const tkArr  = (Array.isArray(tasks)  ? tasks  : tasks?.items  || tasks?.data  || []).map(normaliseTask).filter(Boolean);
      const ipArr  = (Array.isArray(intel)  ? intel  : intel?.items  || intel?.data  || []).map(normaliseIntelProfile).filter(Boolean);
      const opArr  = (Array.isArray(events) ? events : events?.items || events?.data || []).map(normaliseOpsEvent).filter(Boolean);

      const mapped = tkArr.map((t) => {
        const tok = tokenize(`${t.name} ${t.description} ${t.tags.join(" ")}`);
        const matchedIntel = ipArr
          .map((p) => ({ ...p, score: scoreTask(tok, p) }))
          .filter((p) => p.score > 0)
          .sort((a, b) => b.score - a.score);
        const matchedOps = opArr
          .map((e) => ({ ...e, score: scoreTask(tok, e) }))
          .filter((e) => e.score > 0)
          .sort((a, b) => b.score - a.score);
        const hasIp  = matchedIntel.length > 0;
        const hasOps = matchedOps.length   > 0;
        const cls =
          hasIp && hasOps ? "ACTIVE_RESPONSE" :
          hasIp           ? "THREAT_TASKED"   :
          hasOps          ? "OPS_DRIVEN"      :
                            "BACKGROUND";
        return { t, matchedIntel, matchedOps, cls };
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
    window.addEventListener("jarvis:tiorcov-toggle", h);
    return () => window.removeEventListener("jarvis:tiorcov-toggle", h);
  }, []);

  const counts = {
    ACTIVE_RESPONSE: rows.filter((r) => r.cls === "ACTIVE_RESPONSE").length,
    THREAT_TASKED:   rows.filter((r) => r.cls === "THREAT_TASKED").length,
    OPS_DRIVEN:      rows.filter((r) => r.cls === "OPS_DRIVEN").length,
    BACKGROUND:      rows.filter((r) => r.cls === "BACKGROUND").length,
  };

  const visible = rows.filter((r) => {
    const matchTab    = tab === "ALL" || r.cls === tab;
    const matchSearch = !search || r.t.name.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const snapshot = rows.slice(0, 12).map((r) => ({
        task:      r.t.name,
        status:    r.t.status,
        priority:  r.t.priority,
        cls:       r.cls,
        topIntel:  r.matchedIntel[0]?.name,
        topOps:    r.matchedOps[0]?.name,
      }));
      const prompt = `Task Active Response Coverage snapshot: ${JSON.stringify(snapshot)}. Write a 2-sentence operational assessment focusing on active-response tasks and any background tasks that may represent untracked threats.`;
      const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ message: prompt }),
      });
      const d    = await resp.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      if (text) {
        await fetch(`${base}/v1/voice/tts`, {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body:    JSON.stringify({ text }),
        }).then((r2) => r2.arrayBuffer()).then((buf) => {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          ctx.decodeAudioData(buf, (decoded) => {
            const src = ctx.createBufferSource();
            src.buffer = decoded;
            src.connect(ctx.destination);
            src.start();
          });
        }).catch(() => {});
      }
    } catch {
      setBrief("Unable to reach reasoning core.");
    } finally {
      setAssessing(false);
    }
  }

  const activeBadge = counts.ACTIVE_RESPONSE;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Task × IntelProfile × Ops Event Active Response Coverage (TIORCOV)"
        style={{
          position:   "fixed",
          left:        BTN_LEFT,
          bottom:      8,
          zIndex:      151,
          padding:    "4px 10px",
          background:  activeBadge > 0 ? `${RD}22` : "rgba(5,8,13,0.7)",
          border:     `1px solid ${activeBadge > 0 ? RD : CY}`,
          borderRadius: 6,
          color:       activeBadge > 0 ? RD : CY,
          fontSize:    11,
          letterSpacing: 1,
          cursor:     "pointer",
          fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◈ TIORCOV
        {activeBadge > 0 && (
          <span style={{
            marginLeft:   5,
            background:   RD,
            color:        "#04060A",
            borderRadius: 8,
            padding:     "1px 5px",
            fontSize:     9,
          }}>{activeBadge}</span>
        )}
      </button>

      {open && (
        <div style={{
          position:   "fixed",
          left:       "50%",
          top:        "50%",
          transform:  "translate(-50%,-50%)",
          zIndex:      2000,
          width:      "min(800px,94vw)",
          maxHeight:  "85vh",
          background: "rgba(4,8,14,0.97)",
          border:    `1px solid ${CY}33`,
          borderRadius: 14,
          display:    "flex",
          flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
          color:      "#DCEBF5",
          boxShadow: `0 0 60px ${RD}18`,
        }}>
          {/* Header */}
          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:           10,
            padding:      "12px 16px",
            borderBottom: `1px solid ${CY}22`,
          }}>
            <span style={{ color: RD, fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
              ◈ TASK ACTIVE RESPONSE COVERAGE
            </span>
            <span style={{ fontSize: 10, color: "#6E8AA0", marginLeft: 4 }}>
              Task × IntelProfile × Ops Event
            </span>
            <button onClick={() => setOpen(false)} style={{
              marginLeft:  "auto",
              background:  "none",
              border:      "none",
              color:       "#6E8AA0",
              fontSize:     16,
              cursor:      "pointer",
            }}>✕</button>
          </div>

          <div style={{ overflowY: "auto", padding: "12px 16px", flex: 1 }}>
            {/* Stat tiles */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              {[
                { label: "TASKS",           val: rows.length,              color: CY },
                { label: "ACTIVE RESPONSE", val: counts.ACTIVE_RESPONSE,   color: RD },
                { label: "THREAT TASKED",   val: counts.THREAT_TASKED,     color: OR },
                { label: "OPS DRIVEN",      val: counts.OPS_DRIVEN,        color: BL },
                { label: "BACKGROUND",      val: counts.BACKGROUND,        color: "#6E8AA0" },
              ].map(({ label, val, color }) => (
                <div key={label} style={{
                  background:   `${color}11`,
                  border:       `1px solid ${color}33`,
                  borderRadius:  8,
                  padding:      "6px 12px",
                  minWidth:      80,
                  textAlign:    "center",
                }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                  <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{label}</div>
                </div>
              ))}
              {rows.length > 0 && (
                <div style={{
                  background:   `${RD}11`,
                  border:       `1px solid ${RD}33`,
                  borderRadius:  8,
                  padding:      "6px 12px",
                  minWidth:      80,
                  textAlign:    "center",
                }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: RD }}>
                    {Math.round(((counts.ACTIVE_RESPONSE + counts.THREAT_TASKED + counts.OPS_DRIVEN) / rows.length) * 100)}%
                  </div>
                  <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>CONTEXTED</div>
                </div>
              )}
              <button onClick={load} disabled={loading} style={{
                marginLeft:   "auto",
                padding:      "4px 10px",
                background:  `${CY}11`,
                border:      `1px solid ${CY}33`,
                borderRadius:  6,
                color:         CY,
                fontSize:      10,
                cursor:       "pointer",
                letterSpacing: 1,
              }}>↻ REFRESH</button>
              <button onClick={assess} disabled={assessing} style={{
                padding:      "4px 10px",
                background:  `${RD}11`,
                border:      `1px solid ${RD}33`,
                borderRadius:  6,
                color:         RD,
                fontSize:      10,
                cursor:       "pointer",
                letterSpacing: 1,
              }}>{assessing ? "…" : "▶ ASSESS COVERAGE"}</button>
            </div>

            {brief && (
              <div style={{
                fontSize:    11,
                color:       "#88ccaa",
                background:  "#0a1820",
                border:     `1px solid ${CY}22`,
                borderRadius: 6,
                padding:     "8px 10px",
                marginBottom: 10,
                lineHeight:   1.5,
              }}>{brief}</div>
            )}

            {/* Filter tabs */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              {TABS.map((t) => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding:     "3px 10px",
                  borderRadius: 5,
                  fontSize:    10,
                  cursor:      "pointer",
                  letterSpacing: 1,
                  background:   tab === t ? `${CLASS_META[t]?.color || CY}22` : "transparent",
                  border:      `1px solid ${tab === t ? (CLASS_META[t]?.color || CY) : "#6E8AA0"}`,
                  color:        tab === t ? (CLASS_META[t]?.color || CY) : "#6E8AA0",
                }}>{t}</button>
              ))}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search tasks…"
                style={{
                  marginLeft:  "auto",
                  background:  "#0a1820",
                  border:     `1px solid ${CY}33`,
                  borderRadius: 5,
                  color:       "#DCEBF5",
                  fontSize:    10,
                  padding:     "3px 8px",
                  outline:     "none",
                  width:        130,
                }}
              />
            </div>

            {loading && (
              <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: 20 }}>
                loading…
              </div>
            )}
            {error && (
              <div style={{ color: "#ff6b6b", fontSize: 11, marginBottom: 8 }}>⚠ {error}</div>
            )}

            {/* Task rows */}
            {!loading && visible.map((row) => {
              const meta  = CLASS_META[row.cls];
              const isExp = expanded === row.t.id;
              return (
                <div key={row.t.id} style={{
                  marginBottom: 6,
                  border:      `1px solid ${meta.color}33`,
                  borderRadius: 8,
                  overflow:    "hidden",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : row.t.id)}
                    style={{
                      display:     "flex",
                      alignItems:  "center",
                      gap:          8,
                      padding:     "7px 10px",
                      cursor:      "pointer",
                      background:  `${meta.color}08`,
                    }}
                  >
                    <span style={{
                      fontSize:    10,
                      padding:    "1px 6px",
                      borderRadius: 4,
                      background:  `${meta.color}22`,
                      color:        meta.color,
                      letterSpacing: 1,
                      whiteSpace:  "nowrap",
                    }}>{meta.label}</span>
                    <span style={{
                      fontSize:   12,
                      flex:        1,
                      overflow:   "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>{row.t.name}</span>
                    {row.t.priority && (
                      <span style={{ fontSize: 10, color: "#6E8AA0", whiteSpace: "nowrap" }}>
                        {row.t.priority}
                      </span>
                    )}
                    {row.t.status && (
                      <span style={{
                        fontSize: 9, padding: "1px 5px", borderRadius: 3,
                        background: `${CY}11`, color: CY, whiteSpace: "nowrap",
                      }}>{row.t.status}</span>
                    )}
                    <span style={{ fontSize: 10, color: "#6E8AA0" }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{
                      padding:     "8px 10px",
                      background:  "rgba(4,8,14,0.6)",
                      borderTop:  `1px solid ${meta.color}22`,
                    }}>
                      {row.t.description && (
                        <div style={{ fontSize: 10, color: "#6E8AA0", marginBottom: 8, lineHeight: 1.4 }}>
                          {row.t.description.slice(0, 160)}{row.t.description.length > 160 ? "…" : ""}
                        </div>
                      )}

                      {/* Matched intel profiles */}
                      {row.matchedIntel.length > 0 ? (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 10, color: OR, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED INTEL PROFILES ({row.matchedIntel.length})
                          </div>
                          {row.matchedIntel.slice(0, 3).map((p) => (
                            <div key={p.id} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                                <span style={{ color: "#DCEBF5" }}>{p.name}</span>
                                {p.role && (
                                  <span style={{
                                    fontSize: 9, padding: "1px 5px", borderRadius: 3,
                                    background: `${OR}22`, color: OR,
                                  }}>{p.role}</span>
                                )}
                              </div>
                              <div style={{ background: "#111827", borderRadius: 3, height: 3, marginTop: 2 }}>
                                <div style={{
                                  width:       `${Math.min(100, p.score * 14)}%`,
                                  height:      "100%",
                                  background:   OR,
                                  borderRadius: 3,
                                }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: "#6E8AA0", marginBottom: 6 }}>
                          No intel profiles matched for this task.
                        </div>
                      )}

                      {/* Matched ops events */}
                      {row.matchedOps.length > 0 ? (
                        <div>
                          <div style={{ fontSize: 10, color: BL, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED OPS EVENTS ({row.matchedOps.length})
                          </div>
                          {row.matchedOps.slice(0, 3).map((e) => (
                            <div key={e.id} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                                <span style={{ color: "#DCEBF5" }}>{e.name}</span>
                                {e.severity && (
                                  <span style={{
                                    fontSize: 9, padding: "1px 5px", borderRadius: 3,
                                    background: `${BL}22`, color: BL,
                                  }}>{e.severity}</span>
                                )}
                              </div>
                              <div style={{ background: "#111827", borderRadius: 3, height: 3, marginTop: 2 }}>
                                <div style={{
                                  width:       `${Math.min(100, e.score * 14)}%`,
                                  height:      "100%",
                                  background:   BL,
                                  borderRadius: 3,
                                }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: "#6E8AA0" }}>
                          No ops events matched for this task.
                        </div>
                      )}

                      {row.cls === "BACKGROUND" && (
                        <div style={{ fontSize: 11, color: AM, marginTop: 6 }}>
                          ⚠ BACKGROUND — task has no direct threat actor or ops event context.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {!loading && visible.length === 0 && !error && (
              <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: 30 }}>
                No tasks match current filter.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
