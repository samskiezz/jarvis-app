/**
 * OpsCaseManager — F282
 * [PATTERN: WORKBENCH] Full ops case workbench.
 * GET /v1/cases → left column case list with status badges.
 * Click case → right panel: detail + scrollable notes timeline + linked entities.
 * "Add Note" textarea → POST /v1/cases/{id}/notes
 * "Link Entity" input → POST /v1/cases/{id}/entities
 * Status selector → POST /v1/cases/{id}/status
 * "New Case" → POST /v1/cases
 * ASSESS speaks about open cases via jarvis:speak-dossier + /v1/jarvis/agent/chat.
 * ◈ OPSCAS button (left:205720, zIndex:378).
 * Additive only — mounted via App.jsx.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const GRN  = "#00E5A0";
const YLW  = "#FFD700";
const RED  = "#FF4D6D";
const AMB  = "#FFA040";
const PURP = "#b18cff";
const POLL = 60 * 1000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CASE_MGR_RE =
  /\b(opscas|ops.case.manager|case.manager|case.workbench|manage.cases|case.management|create.case|new.case)\b/i;

export function isOpsCaseMgrQuery(t) {
  return CASE_MGR_RE.test(t || "");
}

function hdr() {
  return { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
}

function base() { return apiBase(); }

async function fetchCases(status) {
  const qs = status && status !== "all" ? `?status=${encodeURIComponent(status)}` : "";
  const r = await fetch(`${base()}/v1/cases${qs}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`/v1/cases ${r.status}`);
  return r.json();
}

async function fetchCase(id) {
  const r = await fetch(`${base()}/v1/cases/${id}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`/v1/cases/${id} ${r.status}`);
  return r.json();
}

async function postNote(id, text) {
  const r = await fetch(`${base()}/v1/cases/${id}/notes`, {
    method: "POST", headers: hdr(),
    body: JSON.stringify({ text, by: "operator" }),
  });
  if (!r.ok) throw new Error(`/v1/cases/${id}/notes ${r.status}`);
  return r.json();
}

async function postEntity(id, entity_id) {
  const r = await fetch(`${base()}/v1/cases/${id}/entities`, {
    method: "POST", headers: hdr(),
    body: JSON.stringify({ entity_id }),
  });
  if (!r.ok) throw new Error(`/v1/cases/${id}/entities ${r.status}`);
  return r.json();
}

async function postStatus(id, status) {
  const r = await fetch(`${base()}/v1/cases/${id}/status`, {
    method: "POST", headers: hdr(),
    body: JSON.stringify({ status }),
  });
  if (!r.ok) throw new Error(`/v1/cases/${id}/status ${r.status}`);
  return r.json();
}

async function postNewCase(title) {
  const r = await fetch(`${base()}/v1/cases`, {
    method: "POST", headers: hdr(),
    body: JSON.stringify({ title, status: "open" }),
  });
  if (!r.ok) throw new Error(`/v1/cases ${r.status}`);
  return r.json();
}

function statusColor(s) {
  const l = (s || "").toLowerCase();
  if (l === "open")         return GRN;
  if (l === "investigating") return YLW;
  if (l === "in-progress")  return AMB;
  if (l === "closed")       return PURP;
  return CY;
}

function fmtTs(ms) {
  try {
    return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + "Z";
  } catch {
    return String(ms);
  }
}

function Pill({ label, color }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "1px 6px",
      borderRadius: 4,
      background: color + "22",
      border: `1px solid ${color}55`,
      color,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 1,
      textTransform: "uppercase",
    }}>{label}</span>
  );
}

export default function OpsCaseManager() {
  const [open, setOpen]             = useState(false);
  const [tab, setTab]               = useState("all");
  const [cases, setCases]           = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [selected, setSelected]     = useState(null);
  const [detail, setDetail]         = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [noteText, setNoteText]     = useState("");
  const [entityId, setEntityId]     = useState("");
  const [newTitle, setNewTitle]     = useState("");
  const [posting, setPosting]       = useState(false);
  const [actionMsg, setActionMsg]   = useState(null);

  const [assessing, setAssessing]   = useState(false);
  const [brief, setBrief]           = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCases(tab === "all" ? null : tab);
      setCases(data?.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  const loadDetail = useCallback(async (id) => {
    setDetailLoading(true);
    try {
      const data = await fetchCase(id);
      setDetail(data?.case || data);
    } catch (e) {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    if (!open && selected) setSelected(null);
  }, [open, selected]);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    loadDetail(selected);
  }, [selected, loadDetail]);

  useEffect(() => {
    const on = (e) => {
      const t = (e.detail?.text || "").toLowerCase();
      if (CASE_MGR_RE.test(t)) setOpen(true);
    };
    window.addEventListener("jarvis:voice-command", on);
    window.addEventListener("jarvis:opscas-toggle", () => setOpen(p => !p));
    return () => {
      window.removeEventListener("jarvis:voice-command", on);
      window.removeEventListener("jarvis:opscas-toggle", () => {});
    };
  }, []);

  const handleAddNote = useCallback(async () => {
    if (!selected || !noteText.trim()) return;
    setPosting(true); setActionMsg(null);
    try {
      const res = await postNote(selected, noteText.trim());
      setDetail(res?.case || res);
      setNoteText("");
      setActionMsg("Note added.");
    } catch (e) {
      setActionMsg(`Error: ${e.message}`);
    } finally {
      setPosting(false);
    }
  }, [selected, noteText]);

  const handleLinkEntity = useCallback(async () => {
    if (!selected || !entityId.trim()) return;
    setPosting(true); setActionMsg(null);
    try {
      const res = await postEntity(selected, entityId.trim());
      setDetail(res?.case || res);
      setEntityId("");
      setActionMsg("Entity linked.");
    } catch (e) {
      setActionMsg(`Error: ${e.message}`);
    } finally {
      setPosting(false);
    }
  }, [selected, entityId]);

  const handleStatus = useCallback(async (newStatus) => {
    if (!selected) return;
    setPosting(true); setActionMsg(null);
    try {
      const res = await postStatus(selected, newStatus);
      setDetail(res?.case || res);
      load();
      setActionMsg(`Status → ${newStatus}`);
    } catch (e) {
      setActionMsg(`Error: ${e.message}`);
    } finally {
      setPosting(false);
    }
  }, [selected, load]);

  const handleNewCase = useCallback(async () => {
    if (!newTitle.trim()) return;
    setPosting(true); setActionMsg(null);
    try {
      await postNewCase(newTitle.trim());
      setNewTitle("");
      await load();
      setActionMsg("Case created.");
    } catch (e) {
      setActionMsg(`Error: ${e.message}`);
    } finally {
      setPosting(false);
    }
  }, [newTitle, load]);

  const handleAssess = useCallback(async () => {
    if (!cases.length) return;
    setAssessing(true); setBrief(null);
    try {
      const open_ = cases.filter(c => c.status === "open").length;
      const inv   = cases.filter(c => c.status === "investigating").length;
      const closed = cases.filter(c => c.status === "closed").length;
      const prompt = `Ops Case Manager: ${cases.length} total cases (${open_} open, ${inv} investigating, ${closed} closed). Assess operational posture in 2 sentences.`;
      const res = await fetch(`${base()}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdr(),
        body: JSON.stringify({ message: prompt }),
      });
      const d = res.ok ? await res.json() : {};
      const text = d.response || d.message || d.reply || "Case assessment complete.";
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (e) {
      setBrief(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }, [cases]);

  const openCount = cases.filter(c => c.status === "open").length;

  return (
    <>
      {/* ◈ OPSCAS toggle button */}
      <button
        onClick={() => setOpen(p => !p)}
        title="Ops Case Manager"
        style={{
          position: "fixed",
          left: 205720,
          bottom: 8,
          zIndex: 378,
          background: open ? `${CY}22` : "rgba(6,11,18,0.85)",
          border: `1px solid ${open ? CY : CY + "55"}`,
          color: open ? CY : `${CY}99`,
          borderRadius: 5,
          padding: "3px 7px",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 2,
          cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace",
          textTransform: "uppercase",
        }}
      >
        {openCount > 0 && (
          <span style={{
            marginRight: 4,
            background: RED,
            color: "#fff",
            borderRadius: 8,
            padding: "0 4px",
            fontSize: 8,
          }}>{openCount}</span>
        )}
        OPSCAS
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed",
          right: 0,
          top: 0,
          bottom: 0,
          width: "min(900px, 95vw)",
          zIndex: 2000,
          background: "rgba(6,11,18,0.97)",
          border: `1px solid ${CY}33`,
          borderRight: "none",
          borderRadius: "12px 0 0 12px",
          display: "flex",
          flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
          boxShadow: `0 0 80px ${CY}11`,
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 16px", borderBottom: `1px solid ${CY}22`,
            flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 13 }}>⬡</span>
            <span style={{ color: CY, fontSize: 11, fontWeight: 700, letterSpacing: 3 }}>OPS CASE MANAGER</span>
            {loading && (
              <span style={{ marginLeft: 6, color: `${CY}66`, fontSize: 9 }}>◌ loading…</span>
            )}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
              <button
                onClick={handleAssess}
                disabled={assessing || !cases.length}
                style={{
                  background: "transparent", border: `1px solid ${PURP}55`,
                  color: assessing ? `${PURP}66` : PURP, borderRadius: 4,
                  padding: "2px 8px", cursor: assessing ? "default" : "pointer",
                  fontSize: 9, letterSpacing: 1, fontFamily: "'JetBrains Mono',monospace",
                }}
              >{assessing ? "◌ assessing…" : "▶ ASSESS"}</button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "transparent", border: "none",
                  color: `${CY}55`, cursor: "pointer", fontSize: 14,
                  lineHeight: 1, padding: 0,
                }}
              >✕</button>
            </div>
          </div>

          {/* ASSESS brief */}
          {brief && (
            <div style={{
              padding: "6px 16px",
              borderBottom: `1px solid ${PURP}22`,
              color: PURP, fontSize: 10, lineHeight: 1.5,
            }}>{brief}</div>
          )}

          {/* Tab bar + New Case */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 16px", borderBottom: `1px solid ${CY}22`,
            flexShrink: 0,
          }}>
            {["all", "open", "investigating", "in-progress", "closed"].map(s => (
              <button
                key={s}
                onClick={() => setTab(s)}
                style={{
                  background: "transparent",
                  border: tab === s ? `1px solid ${CY}` : `1px solid ${CY}33`,
                  color: tab === s ? CY : `${CY}66`,
                  borderRadius: 4, padding: "2px 7px", cursor: "pointer",
                  fontSize: 9, letterSpacing: 1,
                  fontFamily: "'JetBrains Mono',monospace",
                  textTransform: "uppercase",
                }}
              >{s}</button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleNewCase()}
                placeholder="New case title…"
                style={{
                  background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}33`,
                  color: CY, borderRadius: 4, padding: "3px 8px",
                  fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
                  width: 180, outline: "none",
                }}
              />
              <button
                onClick={handleNewCase}
                disabled={posting || !newTitle.trim()}
                style={{
                  background: GRN + "22", border: `1px solid ${GRN}55`,
                  color: GRN, borderRadius: 4, padding: "2px 8px",
                  cursor: posting || !newTitle.trim() ? "default" : "pointer",
                  fontSize: 9, letterSpacing: 1,
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >+ NEW</button>
            </div>
          </div>

          {/* Body: cases list + detail */}
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

            {/* Left: case list */}
            <div style={{
              width: 280, borderRight: `1px solid ${CY}22`,
              overflowY: "auto", flexShrink: 0,
            }}>
              {error && (
                <div style={{ color: RED, fontSize: 10, padding: "8px 12px" }}>{error}</div>
              )}
              {!loading && !error && cases.length === 0 && (
                <div style={{ color: `${CY}44`, fontSize: 10, padding: "12px" }}>No cases.</div>
              )}
              {cases.map(c => (
                <div
                  key={c.id}
                  onClick={() => setSelected(selected === c.id ? null : c.id)}
                  style={{
                    padding: "8px 12px",
                    borderBottom: `1px solid ${CY}11`,
                    cursor: "pointer",
                    background: selected === c.id ? `${CY}0d` : "transparent",
                    borderLeft: selected === c.id ? `3px solid ${CY}` : "3px solid transparent",
                    transition: "background 0.15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{ color: `${CY}44`, fontSize: 8 }}>#{c.id}</span>
                    <Pill label={c.status || "open"} color={statusColor(c.status)} />
                  </div>
                  <div style={{
                    color: selected === c.id ? CY : `${CY}cc`,
                    fontSize: 10, lineHeight: 1.35,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{c.title}</div>
                  <div style={{ color: `${CY}44`, fontSize: 8, marginTop: 2 }}>
                    {c.notes ? c.notes.length : 0} notes · {c.entity_ids ? c.entity_ids.length : 0} entities
                  </div>
                </div>
              ))}
            </div>

            {/* Right: detail panel */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
              {!selected && (
                <div style={{ color: `${CY}33`, fontSize: 11, marginTop: 30, textAlign: "center" }}>
                  ← select a case
                </div>
              )}

              {selected && detailLoading && (
                <div style={{ color: `${CY}55`, fontSize: 10 }}>◌ loading case…</div>
              )}

              {selected && !detailLoading && detail && (
                <>
                  {/* Case header */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ color: `${CY}55`, fontSize: 9 }}>CASE #{detail.id}</span>
                      <Pill label={detail.status || "open"} color={statusColor(detail.status)} />
                    </div>
                    <div style={{ color: CY, fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>
                      {detail.title}
                    </div>
                    {detail.created_ts && (
                      <div style={{ color: `${CY}55`, fontSize: 9, marginTop: 3 }}>
                        created {fmtTs(detail.created_ts)}
                      </div>
                    )}
                  </div>

                  {/* Status selector */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    marginBottom: 10, padding: "6px 10px",
                    background: `${CY}08`, border: `1px solid ${CY}22`, borderRadius: 6,
                  }}>
                    <span style={{ color: `${CY}77`, fontSize: 9, letterSpacing: 1 }}>SET STATUS:</span>
                    {["open", "investigating", "in-progress", "closed"].map(s => (
                      <button
                        key={s}
                        onClick={() => handleStatus(s)}
                        disabled={posting || detail.status === s}
                        style={{
                          background: detail.status === s ? statusColor(s) + "22" : "transparent",
                          border: `1px solid ${statusColor(s)}55`,
                          color: statusColor(s),
                          borderRadius: 4, padding: "2px 6px", cursor: posting || detail.status === s ? "default" : "pointer",
                          fontSize: 9, letterSpacing: 1, fontFamily: "'JetBrains Mono',monospace",
                        }}
                      >{s}</button>
                    ))}
                  </div>

                  {/* Notes timeline */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{
                      color: `${CY}88`, fontSize: 9, letterSpacing: 2,
                      textTransform: "uppercase", marginBottom: 6,
                    }}>Notes ({(detail.notes || []).length})</div>
                    <div style={{
                      maxHeight: 200, overflowY: "auto",
                      border: `1px solid ${CY}18`, borderRadius: 6,
                      padding: "4px 0",
                    }}>
                      {(!detail.notes || detail.notes.length === 0) && (
                        <div style={{ color: `${CY}33`, fontSize: 10, padding: "6px 10px" }}>No notes yet.</div>
                      )}
                      {(detail.notes || []).map((n, i) => (
                        <div key={i} style={{
                          padding: "6px 10px",
                          borderBottom: i < detail.notes.length - 1 ? `1px solid ${CY}0d` : "none",
                        }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                            <span style={{ color: `${CY}55`, fontSize: 8 }}>{fmtTs(n.ts)}</span>
                            <span style={{ color: PURP, fontSize: 8 }}>{n.by}</span>
                          </div>
                          <div style={{ color: `${CY}cc`, fontSize: 10, lineHeight: 1.4 }}>{n.text}</div>
                        </div>
                      ))}
                    </div>
                    {/* Add Note */}
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <textarea
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        placeholder="Add a note…"
                        rows={2}
                        style={{
                          flex: 1, background: "rgba(41,231,255,0.05)",
                          border: `1px solid ${CY}33`, color: CY,
                          borderRadius: 4, padding: "4px 8px",
                          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
                          resize: "none", outline: "none",
                        }}
                      />
                      <button
                        onClick={handleAddNote}
                        disabled={posting || !noteText.trim()}
                        style={{
                          background: YLW + "22", border: `1px solid ${YLW}55`,
                          color: posting || !noteText.trim() ? `${YLW}44` : YLW,
                          borderRadius: 4, padding: "4px 10px",
                          cursor: posting || !noteText.trim() ? "default" : "pointer",
                          fontSize: 9, letterSpacing: 1,
                          fontFamily: "'JetBrains Mono',monospace",
                          alignSelf: "stretch",
                        }}
                      >ADD</button>
                    </div>
                  </div>

                  {/* Entities */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{
                      color: `${CY}88`, fontSize: 9, letterSpacing: 2,
                      textTransform: "uppercase", marginBottom: 6,
                    }}>Linked Entities ({(detail.entity_ids || []).length})</div>
                    {(detail.entity_ids || []).length === 0 && (
                      <div style={{ color: `${CY}33`, fontSize: 10 }}>No entities linked.</div>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                      {(detail.entity_ids || []).map((eid, i) => (
                        <span key={i} style={{
                          background: `${AMB}18`, border: `1px solid ${AMB}44`,
                          color: AMB, borderRadius: 4, padding: "2px 6px", fontSize: 9,
                        }}>{eid}</span>
                      ))}
                    </div>
                    {/* Link Entity */}
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        value={entityId}
                        onChange={e => setEntityId(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleLinkEntity()}
                        placeholder="Entity ID to link…"
                        style={{
                          flex: 1, background: "rgba(41,231,255,0.05)",
                          border: `1px solid ${CY}33`, color: CY,
                          borderRadius: 4, padding: "3px 8px",
                          fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
                          outline: "none",
                        }}
                      />
                      <button
                        onClick={handleLinkEntity}
                        disabled={posting || !entityId.trim()}
                        style={{
                          background: AMB + "22", border: `1px solid ${AMB}55`,
                          color: posting || !entityId.trim() ? `${AMB}44` : AMB,
                          borderRadius: 4, padding: "3px 10px",
                          cursor: posting || !entityId.trim() ? "default" : "pointer",
                          fontSize: 9, letterSpacing: 1,
                          fontFamily: "'JetBrains Mono',monospace",
                        }}
                      >LINK</button>
                    </div>
                  </div>

                  {/* Action feedback */}
                  {actionMsg && (
                    <div style={{
                      padding: "4px 8px",
                      background: actionMsg.startsWith("Error") ? `${RED}18` : `${GRN}18`,
                      border: `1px solid ${actionMsg.startsWith("Error") ? RED : GRN}33`,
                      color: actionMsg.startsWith("Error") ? RED : GRN,
                      borderRadius: 4, fontSize: 10,
                    }}>{actionMsg}</div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
