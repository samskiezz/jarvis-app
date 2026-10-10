/**
 * F78 — Contact × Task × Investigation Engagement Triple (CTINV)
 * Endpoints: /entities/Contact × /entities/Task × /v1/investigations
 * Classification: FULLY_ENGAGED (task + inv) | TASK_ACTIVE (task only) |
 *                 INV_LINKED (inv only) | AVAILABLE (idle — no match)
 */
import { useEffect, useState, useRef } from "react";

const BTN_LEFT = 987_160;
const POLL_MS = 90_000;

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

const CTINV_RE =
  /\b(ctinv|contact\s*engagement|idle\s*contacts?|contact\s*task\s*investigation|contact\s*intel\s*engagement|task\s*engaged\s*contact|available\s*contacts?|contact\s*triple|engaged\s*contacts?)\b/i;

export function isCtinvQuery(t) {
  return CTINV_RE.test(t || "");
}

function normaliseContact(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.contact_id || raw._id || String(Math.random()),
    name: raw.name || raw.full_name || raw.display_name || "Unknown Contact",
    role: raw.role || raw.title || raw.position || "",
    org: raw.org || raw.organisation || raw.organization || raw.company || "",
    email: raw.email || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };
}

function normaliseTask(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.task_id || raw._id || String(Math.random()),
    name: raw.name || raw.title || raw.subject || "Untitled Task",
    description: raw.description || raw.details || raw.summary || "",
    status: raw.status || raw.state || "",
    priority: raw.priority || raw.urgency || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };
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

function tokenize(s) {
  if (!s) return [];
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function scoreContact(contactTokens, item) {
  const itemTokens = tokenize(
    `${item.name} ${item.description || ""} ${(item.tags || []).join(" ")}`
  );
  if (!contactTokens.length || !itemTokens.length) return 0;
  const set = new Set(itemTokens);
  return contactTokens.filter((t) => set.has(t)).length;
}

const CY = "#00e5ff";
const AM = "#ffc107";
const PU = "#a855f7";

const CLASS_META = {
  FULLY_ENGAGED: { label: "FULLY ENGAGED", color: "#4ade80", desc: "Matched in tasks AND investigations" },
  TASK_ACTIVE:   { label: "TASK ACTIVE",   color: CY,       desc: "Matched in tasks only" },
  INV_LINKED:    { label: "INV LINKED",    color: PU,       desc: "Matched in investigations only" },
  AVAILABLE:     { label: "AVAILABLE",     color: AM,       desc: "No task or investigation match — idle" },
};

const TABS = ["ALL", "FULLY_ENGAGED", "TASK_ACTIVE", "INV_LINKED", "AVAILABLE"];

export async function buildCtinvScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [ctRes, tkRes, invRes] = await Promise.allSettled([
    fetch(`${base}/entities/Contact`, { headers }).then((r) => r.json()),
    fetch(`${base}/entities/Task`,    { headers }).then((r) => r.json()),
    fetch(`${base}/v1/investigations`, { headers }).then((r) => r.json()),
  ]);

  const contacts      = ctRes.status  === "fulfilled" ? ctRes.value  : [];
  const tasks         = tkRes.status  === "fulfilled" ? tkRes.value  : [];
  const investigations = invRes.status === "fulfilled" ? invRes.value : [];

  const ctArr  = (Array.isArray(contacts)       ? contacts       : contacts?.items       || contacts?.data       || []).map(normaliseContact).filter(Boolean);
  const tkArr  = (Array.isArray(tasks)           ? tasks           : tasks?.items           || tasks?.data           || []).map(normaliseTask).filter(Boolean);
  const invArr = (Array.isArray(investigations)  ? investigations  : investigations?.items  || investigations?.data  || []).map(normaliseInvestigation).filter(Boolean);

  const counts = { FULLY_ENGAGED: 0, TASK_ACTIVE: 0, INV_LINKED: 0, AVAILABLE: 0 };
  for (const c of ctArr) {
    const tok = tokenize(`${c.name} ${c.role} ${c.org} ${c.email} ${c.tags.join(" ")}`);
    const hasTask = tkArr.some((t) => scoreContact(tok, t) > 0);
    const hasInv  = invArr.some((i) => scoreContact(tok, i) > 0);
    if (hasTask && hasInv)      counts.FULLY_ENGAGED++;
    else if (hasTask)           counts.TASK_ACTIVE++;
    else if (hasInv)            counts.INV_LINKED++;
    else                        counts.AVAILABLE++;
  }

  return `Contact Engagement Triple online, sir. ${ctArr.length} contacts cross-referenced against ${tkArr.length} tasks and ${invArr.length} investigations. ${counts.FULLY_ENGAGED} fully engaged, ${counts.TASK_ACTIVE} task-active, ${counts.INV_LINKED} investigation-linked, and ${counts.AVAILABLE} contacts are AVAILABLE with no current task or investigation match — potential idle resource gaps identified.`;
}

export default function ContactTaskInvestigationTriple() {
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
      const [ctRes, tkRes, invRes] = await Promise.allSettled([
        fetch(`${base}/entities/Contact`,    { headers }).then((r) => r.json()),
        fetch(`${base}/entities/Task`,       { headers }).then((r) => r.json()),
        fetch(`${base}/v1/investigations`,   { headers }).then((r) => r.json()),
      ]);

      const contacts       = ctRes.status  === "fulfilled" ? ctRes.value  : [];
      const tasks          = tkRes.status  === "fulfilled" ? tkRes.value  : [];
      const investigations = invRes.status === "fulfilled" ? invRes.value : [];

      const ctArr  = (Array.isArray(contacts)      ? contacts      : contacts?.items      || contacts?.data      || []).map(normaliseContact).filter(Boolean);
      const tkArr  = (Array.isArray(tasks)          ? tasks          : tasks?.items          || tasks?.data          || []).map(normaliseTask).filter(Boolean);
      const invArr = (Array.isArray(investigations) ? investigations : investigations?.items || investigations?.data || []).map(normaliseInvestigation).filter(Boolean);

      const mapped = ctArr.map((c) => {
        const tok = tokenize(`${c.name} ${c.role} ${c.org} ${c.email} ${c.tags.join(" ")}`);
        const matchedTasks = tkArr
          .map((t) => ({ ...t, score: scoreContact(tok, t) }))
          .filter((t) => t.score > 0)
          .sort((a, b) => b.score - a.score);
        const matchedInvs = invArr
          .map((i) => ({ ...i, score: scoreContact(tok, i) }))
          .filter((i) => i.score > 0)
          .sort((a, b) => b.score - a.score);
        const hasTask = matchedTasks.length > 0;
        const hasInv  = matchedInvs.length  > 0;
        const cls =
          hasTask && hasInv ? "FULLY_ENGAGED" :
          hasTask           ? "TASK_ACTIVE"   :
          hasInv            ? "INV_LINKED"    :
                              "AVAILABLE";
        return { c, matchedTasks, matchedInvs, cls };
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
    window.addEventListener("jarvis:ctinv-toggle", h);
    return () => window.removeEventListener("jarvis:ctinv-toggle", h);
  }, []);

  const counts = {
    FULLY_ENGAGED: rows.filter((r) => r.cls === "FULLY_ENGAGED").length,
    TASK_ACTIVE:   rows.filter((r) => r.cls === "TASK_ACTIVE").length,
    INV_LINKED:    rows.filter((r) => r.cls === "INV_LINKED").length,
    AVAILABLE:     rows.filter((r) => r.cls === "AVAILABLE").length,
  };

  const visible = rows.filter((r) => {
    const matchTab    = tab === "ALL" || r.cls === tab;
    const matchSearch = !search || r.c.name.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const snapshot = rows.slice(0, 12).map((r) => ({
        contact: r.c.name,
        role: r.c.role,
        org: r.c.org,
        cls: r.cls,
        topTask: r.matchedTasks[0]?.name,
        topInv:  r.matchedInvs[0]?.name,
      }));
      const prompt = `Contact Engagement Triple snapshot: ${JSON.stringify(snapshot)}. Write a 2-sentence engagement coverage assessment focusing on idle contacts and recommended task/investigation assignment gaps.`;
      const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await resp.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      if (text) {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text }),
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

  const availableBadge = counts.AVAILABLE;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Contact × Task × Investigation Engagement Triple (CTINV)"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 141,
          padding: "4px 10px",
          background: availableBadge > 0 ? `${AM}22` : "rgba(5,8,13,0.7)",
          border: `1px solid ${availableBadge > 0 ? AM : CY}`,
          borderRadius: 6,
          color: availableBadge > 0 ? AM : CY,
          fontSize: 11,
          letterSpacing: 1,
          cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◈ CTINV
        {availableBadge > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#04060A",
            borderRadius: 8, padding: "1px 5px", fontSize: 9,
          }}>{availableBadge}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
          zIndex: 2000, width: "min(780px,93vw)", maxHeight: "84vh",
          background: "rgba(4,8,14,0.97)", border: `1px solid ${CY}33`,
          borderRadius: 14, display: "flex", flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          boxShadow: `0 0 60px ${CY}18`,
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px", borderBottom: `1px solid ${CY}22`,
          }}>
            <span style={{ color: CY, fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>◈ CONTACT ENGAGEMENT TRIPLE</span>
            <span style={{ fontSize: 10, color: "#6E8AA0", marginLeft: 4 }}>Contact × Task × Investigation</span>
            <button onClick={() => setOpen(false)} style={{
              marginLeft: "auto", background: "none", border: "none",
              color: "#6E8AA0", fontSize: 16, cursor: "pointer",
            }}>✕</button>
          </div>

          <div style={{ overflowY: "auto", padding: "12px 16px", flex: 1 }}>
            {/* Stat tiles */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              {[
                { label: "CONTACTS",      val: rows.length,           color: CY },
                { label: "FULLY ENGAGED", val: counts.FULLY_ENGAGED,  color: "#4ade80" },
                { label: "TASK ACTIVE",   val: counts.TASK_ACTIVE,    color: CY },
                { label: "INV LINKED",    val: counts.INV_LINKED,     color: PU },
                { label: "AVAILABLE",     val: counts.AVAILABLE,      color: AM },
              ].map(({ label, val, color }) => (
                <div key={label} style={{
                  background: `${color}11`, border: `1px solid ${color}33`,
                  borderRadius: 8, padding: "6px 12px", minWidth: 80, textAlign: "center",
                }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                  <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{label}</div>
                </div>
              ))}
              {rows.length > 0 && (
                <div style={{
                  background: "#4ade8011", border: "1px solid #4ade8033",
                  borderRadius: 8, padding: "6px 12px", minWidth: 80, textAlign: "center",
                }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#4ade80" }}>
                    {Math.round((counts.FULLY_ENGAGED / rows.length) * 100)}%
                  </div>
                  <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>ENGAGED</div>
                </div>
              )}
              <button onClick={load} disabled={loading} style={{
                marginLeft: "auto", padding: "4px 10px", background: `${CY}11`,
                border: `1px solid ${CY}33`, borderRadius: 6, color: CY,
                fontSize: 10, cursor: "pointer", letterSpacing: 1,
              }}>↻ REFRESH</button>
              <button onClick={assess} disabled={assessing} style={{
                padding: "4px 10px", background: `${AM}11`,
                border: `1px solid ${AM}33`, borderRadius: 6, color: AM,
                fontSize: 10, cursor: "pointer", letterSpacing: 1,
              }}>{assessing ? "…" : "▶ ASSESS ENGAGEMENT"}</button>
            </div>

            {brief && (
              <div style={{
                fontSize: 11, color: "#88ccaa", background: "#0a1820",
                border: `1px solid ${CY}22`, borderRadius: 6,
                padding: "8px 10px", marginBottom: 10, lineHeight: 1.5,
              }}>{brief}</div>
            )}

            {/* Filter tabs */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              {TABS.map((t) => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: "3px 10px", borderRadius: 5, fontSize: 10,
                  cursor: "pointer", letterSpacing: 1,
                  background: tab === t ? `${CLASS_META[t]?.color || CY}22` : "transparent",
                  border: `1px solid ${tab === t ? (CLASS_META[t]?.color || CY) : "#6E8AA0"}`,
                  color: tab === t ? (CLASS_META[t]?.color || CY) : "#6E8AA0",
                }}>{t}</button>
              ))}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search contacts…"
                style={{
                  marginLeft: "auto", background: "#0a1820", border: `1px solid ${CY}33`,
                  borderRadius: 5, color: "#DCEBF5", fontSize: 10, padding: "3px 8px",
                  outline: "none", width: 130,
                }}
              />
            </div>

            {loading && <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: 20 }}>loading…</div>}
            {error   && <div style={{ color: "#ff6b6b", fontSize: 11, marginBottom: 8 }}>⚠ {error}</div>}

            {/* Contact rows */}
            {!loading && visible.map((row) => {
              const meta  = CLASS_META[row.cls];
              const isExp = expanded === row.c.id;
              return (
                <div key={row.c.id} style={{
                  marginBottom: 6, border: `1px solid ${meta.color}33`,
                  borderRadius: 8, overflow: "hidden",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : row.c.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "7px 10px", cursor: "pointer",
                      background: `${meta.color}08`,
                    }}
                  >
                    <span style={{
                      fontSize: 10, padding: "1px 6px", borderRadius: 4,
                      background: `${meta.color}22`, color: meta.color,
                      letterSpacing: 1, whiteSpace: "nowrap",
                    }}>{meta.label}</span>
                    <span style={{
                      fontSize: 12, flex: 1, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{row.c.name}</span>
                    {row.c.role && (
                      <span style={{ fontSize: 10, color: "#6E8AA0", whiteSpace: "nowrap" }}>{row.c.role}</span>
                    )}
                    <span style={{ fontSize: 10, color: "#6E8AA0" }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{
                      padding: "8px 10px", background: "rgba(4,8,14,0.6)",
                      borderTop: `1px solid ${meta.color}22`,
                    }}>
                      {row.c.org && (
                        <div style={{ fontSize: 10, color: "#6E8AA0", marginBottom: 6 }}>
                          {row.c.org}{row.c.email ? ` · ${row.c.email}` : ""}
                        </div>
                      )}

                      {/* Matched tasks */}
                      {row.matchedTasks.length > 0 ? (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 10, color: CY, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED TASKS ({row.matchedTasks.length})
                          </div>
                          {row.matchedTasks.slice(0, 3).map((t) => (
                            <div key={t.id} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                                <span style={{ color: "#DCEBF5" }}>{t.name}</span>
                                {t.priority && (
                                  <span style={{
                                    fontSize: 9, padding: "1px 5px", borderRadius: 3,
                                    background: `${CY}22`, color: CY,
                                  }}>{t.priority}</span>
                                )}
                              </div>
                              <div style={{ background: "#111827", borderRadius: 3, height: 3, marginTop: 2 }}>
                                <div style={{
                                  width: `${Math.min(100, t.score * 14)}%`,
                                  height: "100%", background: CY, borderRadius: 3,
                                }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: "#6E8AA0", marginBottom: 6 }}>
                          No tasks matched for this contact.
                        </div>
                      )}

                      {/* Matched investigations */}
                      {row.matchedInvs.length > 0 ? (
                        <div>
                          <div style={{ fontSize: 10, color: PU, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED INVESTIGATIONS ({row.matchedInvs.length})
                          </div>
                          {row.matchedInvs.slice(0, 3).map((i) => (
                            <div key={i.id} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                                <span style={{ color: "#DCEBF5" }}>{i.name}</span>
                                {i.status && (
                                  <span style={{
                                    fontSize: 9, padding: "1px 5px", borderRadius: 3,
                                    background: `${PU}22`, color: PU,
                                  }}>{i.status}</span>
                                )}
                              </div>
                              <div style={{ background: "#111827", borderRadius: 3, height: 3, marginTop: 2 }}>
                                <div style={{
                                  width: `${Math.min(100, i.score * 14)}%`,
                                  height: "100%", background: PU, borderRadius: 3,
                                }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: "#6E8AA0" }}>
                          No investigations matched for this contact.
                        </div>
                      )}

                      {row.cls === "AVAILABLE" && (
                        <div style={{ fontSize: 11, color: AM, marginTop: 6 }}>
                          ⚠ Contact is AVAILABLE — no task or investigation engagement detected.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {!loading && visible.length === 0 && !error && (
              <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: 30 }}>
                No contacts match current filter.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
