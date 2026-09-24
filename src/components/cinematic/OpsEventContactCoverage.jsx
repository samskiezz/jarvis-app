/**
 * F77 — Ops Event × Contact Response Coverage (OECRC)
 * Endpoints: /v1/ops/events × /entities/Contact
 * Classification: RESPONSE_ASSIGNED (≥1 contact match) | UNASSIGNED (no contact coverage)
 */
import { useEffect, useState, useRef } from "react";

const BTN_LEFT = 986_600;
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

const OECRC_RE =
  /\b(oecrc|ops\s*contact\s*coverage|event\s*response\s*coverage|ops\s*assigned|unassigned\s*events|ops\s*contact\s*assigned|response\s*assigned|event\s*contact\s*coverage|ops\s*event\s*contact)\b/i;

export function isOecrcQuery(t) {
  return OECRC_RE.test(t || "");
}

function normaliseEvent(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.event_id || raw._id || String(Math.random()),
    name: raw.name || raw.title || raw.event_type || raw.type || "Untitled Event",
    description: raw.description || raw.details || raw.summary || "",
    status: raw.status || raw.state || "",
    type: raw.type || raw.event_type || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
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
    extra: raw,
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

function score(eventTokens, contact) {
  const contactTokens = tokenize(
    `${contact.name} ${contact.role} ${contact.org} ${contact.tags.join(" ")}`
  );
  if (!eventTokens.length || !contactTokens.length) return 0;
  const set = new Set(contactTokens);
  return eventTokens.filter((t) => set.has(t)).length;
}

const CY = "#00e5ff";
const AM = "#ffc107";

const CLASS_META = {
  RESPONSE_ASSIGNED: { label: "RESPONSE ASSIGNED", color: "#4ade80", desc: "Contact coverage confirmed" },
  UNASSIGNED: { label: "UNASSIGNED", color: AM, desc: "No contact coverage — response gap" },
};

const TABS = ["ALL", "RESPONSE_ASSIGNED", "UNASSIGNED"];

export async function buildOecrcScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [evRes, ctRes] = await Promise.allSettled([
    fetch(`${base}/v1/ops/events`, { headers }).then((r) => r.json()),
    fetch(`${base}/entities/Contact`, { headers }).then((r) => r.json()),
  ]);

  const events = evRes.status === "fulfilled" ? evRes.value : [];
  const contacts = ctRes.status === "fulfilled" ? ctRes.value : [];

  const evArr = (Array.isArray(events) ? events : events?.items || events?.data || []).map(normaliseEvent).filter(Boolean);
  const ctArr = (Array.isArray(contacts) ? contacts : contacts?.items || contacts?.data || []).map(normaliseContact).filter(Boolean);

  const unassigned = evArr.filter((ev) => {
    const tok = tokenize(`${ev.name} ${ev.description} ${ev.tags.join(" ")}`);
    return !ctArr.some((c) => score(tok, c) > 0);
  });

  return `Ops Event Contact Coverage online, sir. ${evArr.length} operational events cross-referenced against ${ctArr.length} contacts. ${unassigned.length} event${unassigned.length !== 1 ? "s" : ""} are UNASSIGNED — no contact response coverage detected. Recommend assigning responsible contacts to close the response gap.`;
}

export default function OpsEventContactCoverage() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief] = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [evRes, ctRes] = await Promise.allSettled([
        fetch(`${base}/v1/ops/events`, { headers }).then((r) => r.json()),
        fetch(`${base}/entities/Contact`, { headers }).then((r) => r.json()),
      ]);

      const events = evRes.status === "fulfilled" ? evRes.value : [];
      const contacts = ctRes.status === "fulfilled" ? ctRes.value : [];

      const evArr = (Array.isArray(events) ? events : events?.items || events?.data || []).map(normaliseEvent).filter(Boolean);
      const ctArr = (Array.isArray(contacts) ? contacts : contacts?.items || contacts?.data || []).map(normaliseContact).filter(Boolean);

      const mapped = evArr.map((ev) => {
        const tok = tokenize(`${ev.name} ${ev.description} ${ev.tags.join(" ")}`);
        const matchedContacts = ctArr
          .map((c) => ({ ...c, score: score(tok, c) }))
          .filter((c) => c.score > 0)
          .sort((a, b) => b.score - a.score);
        return {
          ev,
          matchedContacts,
          cls: matchedContacts.length > 0 ? "RESPONSE_ASSIGNED" : "UNASSIGNED",
        };
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
    window.addEventListener("jarvis:oecrc-toggle", h);
    return () => window.removeEventListener("jarvis:oecrc-toggle", h);
  }, []);

  const counts = {
    RESPONSE_ASSIGNED: rows.filter((r) => r.cls === "RESPONSE_ASSIGNED").length,
    UNASSIGNED: rows.filter((r) => r.cls === "UNASSIGNED").length,
  };

  const visible = rows.filter((r) => {
    const matchTab = tab === "ALL" || r.cls === tab;
    const matchSearch = !search || r.ev.name.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const snapshot = rows.slice(0, 12).map((r) => ({
        event: r.ev.name,
        type: r.ev.type,
        status: r.ev.status,
        cls: r.cls,
        topContact: r.matchedContacts[0]?.name,
        contactRole: r.matchedContacts[0]?.role,
      }));
      const prompt = `Ops Event Contact Coverage snapshot: ${JSON.stringify(snapshot)}. Write a 2-sentence operational response gap assessment focusing on unassigned events and recommended contact assignments.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
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

  const unassignedBadge = counts.UNASSIGNED;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Ops Event × Contact Response Coverage (OECRC)"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 140,
          padding: "4px 10px",
          background: unassignedBadge > 0 ? `${AM}22` : "rgba(5,8,13,0.7)",
          border: `1px solid ${unassignedBadge > 0 ? AM : CY}`,
          borderRadius: 6,
          color: unassignedBadge > 0 ? AM : CY,
          fontSize: 11,
          letterSpacing: 1,
          cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◈ OECRC
        {unassignedBadge > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#04060A",
            borderRadius: 8, padding: "1px 5px", fontSize: 9,
          }}>{unassignedBadge}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
          zIndex: 2000, width: "min(760px,92vw)", maxHeight: "82vh",
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
            <span style={{ color: CY, fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>◈ OPS EVENT CONTACT COVERAGE</span>
            <span style={{ fontSize: 10, color: "#6E8AA0", marginLeft: 4 }}>OpsEvent × Contact</span>
            <button onClick={() => setOpen(false)} style={{
              marginLeft: "auto", background: "none", border: "none",
              color: "#6E8AA0", fontSize: 16, cursor: "pointer",
            }}>✕</button>
          </div>

          <div style={{ overflowY: "auto", padding: "12px 16px", flex: 1 }}>
            {/* Stat tiles */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              {[
                { label: "EVENTS", val: rows.length, color: CY },
                { label: "ASSIGNED", val: counts.RESPONSE_ASSIGNED, color: "#4ade80" },
                { label: "UNASSIGNED", val: counts.UNASSIGNED, color: AM },
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
                    {Math.round((counts.RESPONSE_ASSIGNED / rows.length) * 100)}%
                  </div>
                  <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>COVERAGE</div>
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
              }}>{assessing ? "…" : "▶ ASSESS COVERAGE"}</button>
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
                placeholder="search events…"
                style={{
                  marginLeft: "auto", background: "#0a1820", border: `1px solid ${CY}33`,
                  borderRadius: 5, color: "#DCEBF5", fontSize: 10, padding: "3px 8px",
                  outline: "none", width: 130,
                }}
              />
            </div>

            {loading && <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: 20 }}>loading…</div>}
            {error && <div style={{ color: "#ff6b6b", fontSize: 11, marginBottom: 8 }}>⚠ {error}</div>}

            {/* Event list */}
            {!loading && visible.map((row) => {
              const meta = CLASS_META[row.cls];
              const isExp = expanded === row.ev.id;
              return (
                <div key={row.ev.id} style={{
                  marginBottom: 6, border: `1px solid ${meta.color}33`,
                  borderRadius: 8, overflow: "hidden",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : row.ev.id)}
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
                    }}>{row.ev.name}</span>
                    {row.ev.type && (
                      <span style={{ fontSize: 10, color: "#6E8AA0", whiteSpace: "nowrap" }}>{row.ev.type}</span>
                    )}
                    <span style={{ fontSize: 10, color: "#6E8AA0" }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{
                      padding: "8px 10px", background: "rgba(4,8,14,0.6)",
                      borderTop: `1px solid ${meta.color}22`,
                    }}>
                      {row.ev.description && (
                        <div style={{ fontSize: 11, color: "#88a0b0", marginBottom: 8, lineHeight: 1.4 }}>
                          {row.ev.description.slice(0, 200)}{row.ev.description.length > 200 ? "…" : ""}
                        </div>
                      )}

                      {row.matchedContacts.length > 0 ? (
                        <div>
                          <div style={{ fontSize: 10, color: "#4ade80", letterSpacing: 1, marginBottom: 4 }}>
                            ASSIGNED CONTACTS ({row.matchedContacts.length})
                          </div>
                          {row.matchedContacts.slice(0, 4).map((c) => (
                            <div key={c.id} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                                <span style={{ color: "#DCEBF5" }}>{c.name}</span>
                                {c.role && (
                                  <span style={{
                                    fontSize: 9, padding: "1px 5px", borderRadius: 3,
                                    background: "#4ade8022", color: "#4ade80",
                                  }}>{c.role}</span>
                                )}
                              </div>
                              {c.org && (
                                <div style={{ fontSize: 10, color: "#6E8AA0" }}>{c.org}</div>
                              )}
                              <div style={{ background: "#111827", borderRadius: 3, height: 3, marginTop: 2 }}>
                                <div style={{
                                  width: `${Math.min(100, c.score * 14)}%`,
                                  height: "100%", background: "#4ade80", borderRadius: 3,
                                }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: AM }}>
                          ⚠ No contacts assigned to this operational event.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {!loading && visible.length === 0 && !error && (
              <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: 30 }}>
                No events match current filter.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
