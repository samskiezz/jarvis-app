/**
 * InvestigationWorkspace — F270.
 *
 * WORKBENCH: full CRUD panel for saved investigations.
 *
 *   Left panel   — case list from GET /v1/investigations; click to open.
 *   Right panel  — case detail: name/owner/seeds + scrollable annotations +
 *                  shares; annotation form; delete button with confirm.
 *   New Case     — form: name + owner + seeds (csv) → POST /v1/investigations.
 *   Annotation   — target + text → POST /v1/investigations/{id}/annotations.
 *   Delete       — confirm dialog → DELETE /v1/investigations/{id}.
 *   ASSESS       — /v1/jarvis/agent/chat + TTS.
 *
 * Toggle: ◈ INVWRK  left:199000  bottom:8  zIndex:366
 * Event:  jarvis:invwrk-toggle
 * Voice:  "investigation workspace / invwrk / open cases workbench /
 *          case workbench / manage investigations"
 *
 * Exported for JarvisBrain: isInvwrkQuery
 * Mounted via src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const GRAY = "#4E6070";
const SURF = "rgba(12,22,30,0.97)";
const BORD = "rgba(41,231,255,0.18)";

const BTN_LEFT = 199000;
const PANEL_W  = 700;
const PANEL_H  = 560;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain export ────────────────────────────────────────────────────────

const INVWRK_RE =
  /\b(investigation\s+workspace|invwrk\b|open\s+cases?\s+workbench|case\s+workbench|manage\s+investigations?)\b/i;

export function isInvwrkQuery(q) {
  return INVWRK_RE.test(q || "");
}

// ─── fetch helpers ─────────────────────────────────────────────────────────────

function hdrs(auth = false) {
  const h = { "Content-Type": "application/json" };
  if (auth) h["Authorization"] = `Bearer ${API_KEY}`;
  return h;
}

async function fetchList() {
  const r = await fetch(`${apiBase()}/v1/investigations`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`list ${r.status}`);
  const d = await r.json();
  return Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : [];
}

async function fetchCase(id) {
  const r = await fetch(`${apiBase()}/v1/investigations/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`get ${r.status}`);
  return r.json();
}

async function createCase(name, owner, seeds, notes) {
  const r = await fetch(`${apiBase()}/v1/investigations`, {
    method: "POST",
    headers: hdrs(true),
    body: JSON.stringify({ name, owner: owner || undefined, seeds: seeds || undefined, notes: notes || "" }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`create ${r.status}: ${t}`);
  }
  return r.json();
}

async function addAnnotation(id, target, text) {
  const r = await fetch(`${apiBase()}/v1/investigations/${encodeURIComponent(id)}/annotations`, {
    method: "POST",
    headers: hdrs(true),
    body: JSON.stringify({ target: target || "case", text, actor: "operator" }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`annotate ${r.status}: ${t}`);
  }
  return r.json();
}

async function deleteCase(id) {
  const r = await fetch(`${apiBase()}/v1/investigations/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`delete ${r.status}: ${t}`);
  }
  return r.json();
}

async function assessChat(msg) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: hdrs(true),
    body: JSON.stringify({ message: msg }),
  });
  if (!r.ok) throw new Error(`chat ${r.status}`);
  const d = await r.json();
  return d?.response || d?.message || d?.answer || JSON.stringify(d);
}

async function tts(text) {
  try {
    const r = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: hdrs(true),
      body: JSON.stringify({ text, voice: "ash" }),
    });
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.onended = () => URL.revokeObjectURL(url);
    a.play().catch(() => {});
  } catch {}
}

// ─── styles ────────────────────────────────────────────────────────────────────

const S = {
  btn: {
    position: "fixed",
    bottom: 8,
    left: BTN_LEFT,
    zIndex: 366,
    background: "rgba(12,22,30,0.85)",
    border: `1px solid ${BORD}`,
    color: CY,
    fontSize: 11,
    padding: "3px 8px",
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: "monospace",
    whiteSpace: "nowrap",
    userSelect: "none",
  },
  panel: {
    position: "fixed",
    bottom: 36,
    left: BTN_LEFT,
    width: PANEL_W,
    height: PANEL_H,
    background: SURF,
    border: `1px solid ${BORD}`,
    borderRadius: 8,
    zIndex: 367,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    fontFamily: "monospace",
  },
  hdr: {
    borderBottom: `1px solid ${BORD}`,
    padding: "8px 12px",
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    display: "flex",
    overflow: "hidden",
  },
  left: {
    width: 220,
    borderRight: `1px solid ${BORD}`,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  right: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  scroll: {
    flex: 1,
    overflowY: "auto",
    padding: "6px 8px",
  },
  ftr: {
    borderTop: `1px solid ${BORD}`,
    padding: "6px 10px",
    flexShrink: 0,
  },
  input: {
    background: "rgba(255,255,255,0.05)",
    border: `1px solid ${BORD}`,
    color: CY,
    borderRadius: 4,
    padding: "3px 6px",
    fontSize: 11,
    fontFamily: "monospace",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  badge: (c) => ({
    background: c || CY,
    color: "#000",
    borderRadius: 3,
    padding: "1px 5px",
    fontSize: 10,
    fontWeight: 700,
    display: "inline-block",
  }),
  caseRow: (sel) => ({
    padding: "5px 8px",
    cursor: "pointer",
    borderRadius: 4,
    marginBottom: 2,
    background: sel ? "rgba(41,231,255,0.12)" : "transparent",
    border: sel ? `1px solid ${CY}44` : "1px solid transparent",
    color: sel ? CY : "#9AB",
    fontSize: 11,
  }),
  sectionLabel: {
    color: GRAY,
    fontSize: 10,
    padding: "4px 0 2px",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  annRow: {
    padding: "4px 6px",
    borderRadius: 4,
    marginBottom: 3,
    background: "rgba(245,166,35,0.06)",
    border: `1px solid ${AM}22`,
    fontSize: 11,
    color: "#ccc",
  },
  seedChip: {
    display: "inline-block",
    background: "rgba(41,231,255,0.1)",
    border: `1px solid ${CY}33`,
    color: CY,
    borderRadius: 3,
    padding: "1px 5px",
    fontSize: 10,
    marginRight: 3,
    marginBottom: 2,
  },
  btnSm: (c) => ({
    background: "transparent",
    border: `1px solid ${c || CY}55`,
    color: c || CY,
    borderRadius: 4,
    padding: "2px 8px",
    fontSize: 10,
    cursor: "pointer",
    fontFamily: "monospace",
  }),
};

// ─── component ─────────────────────────────────────────────────────────────────

export default function InvestigationWorkspace() {
  const [open, setOpen]             = useState(false);
  const [cases, setCases]           = useState([]);
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState("");
  const [selId, setSelId]           = useState(null);
  const [detail, setDetail]         = useState(null);
  const [detLoading, setDetLoading] = useState(false);

  // new-case form
  const [showNew, setShowNew]       = useState(false);
  const [ncName, setNcName]         = useState("");
  const [ncOwner, setNcOwner]       = useState("");
  const [ncSeeds, setNcSeeds]       = useState("");
  const [ncNotes, setNcNotes]       = useState("");
  const [ncErr, setNcErr]           = useState("");
  const [ncBusy, setNcBusy]         = useState(false);

  // annotation form
  const [annTarget, setAnnTarget]   = useState("case");
  const [annText, setAnnText]       = useState("");
  const [annErr, setAnnErr]         = useState("");
  const [annBusy, setAnnBusy]       = useState(false);

  // delete confirm
  const [delId, setDelId]           = useState(null);
  const [delBusy, setDelBusy]       = useState(false);

  // assess
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState("");

  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const items = await fetchList();
      setCases(items);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id) => {
    setDetLoading(true);
    setDetail(null);
    try {
      const d = await fetchCase(id);
      setDetail(d);
    } catch (e) {
      setDetail({ _err: e.message });
    } finally {
      setDetLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      load();
      intervalRef.current = setInterval(load, 30000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  useEffect(() => {
    if (selId) loadDetail(selId);
    else setDetail(null);
  }, [selId, loadDetail]);

  useEffect(() => {
    const h = () => setOpen((v) => !v);
    window.addEventListener("jarvis:invwrk-toggle", h);
    return () => window.removeEventListener("jarvis:invwrk-toggle", h);
  }, []);

  const handleSelectCase = (id) => {
    setSelId(id === selId ? null : id);
    setAnnText("");
    setAnnTarget("case");
    setAnnErr("");
    setAssessText("");
  };

  const handleCreateCase = async (e) => {
    e.preventDefault();
    if (!ncName.trim()) { setNcErr("Name required."); return; }
    setNcBusy(true); setNcErr("");
    try {
      await createCase(ncName.trim(), ncOwner.trim(), ncSeeds.trim(), ncNotes.trim());
      setNcName(""); setNcOwner(""); setNcSeeds(""); setNcNotes("");
      setShowNew(false);
      await load();
    } catch (e2) {
      setNcErr(e2.message);
    } finally {
      setNcBusy(false);
    }
  };

  const handleAnnotate = async (e) => {
    e.preventDefault();
    if (!annText.trim()) { setAnnErr("Text required."); return; }
    setAnnBusy(true); setAnnErr("");
    try {
      await addAnnotation(selId, annTarget.trim() || "case", annText.trim());
      setAnnText("");
      await loadDetail(selId);
    } catch (e2) {
      setAnnErr(e2.message);
    } finally {
      setAnnBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!delId) return;
    setDelBusy(true);
    try {
      await deleteCase(delId);
      if (selId === delId) { setSelId(null); setDetail(null); }
      setDelId(null);
      await load();
    } catch (e2) {
      setErr(e2.message);
      setDelId(null);
    } finally {
      setDelBusy(false);
    }
  };

  const handleAssess = async () => {
    const count = cases.length;
    const open_ = cases.filter((c) => !c.closed).length;
    const msg = `Investigate the ${count} saved investigation cases (${open_} open). Summarise the most active cases, any high-priority open items, and recommend the next action. Keep to two sentences.`;
    setAssessing(true); setAssessText("…");
    try {
      const ans = await assessChat(msg);
      setAssessText(ans);
      tts(ans);
    } catch (e2) {
      setAssessText(e2.message);
    } finally {
      setAssessing(false);
    }
  };

  const badge = cases.length;

  if (!open) {
    return (
      <button style={S.btn} onClick={() => setOpen(true)} title="Investigation Workspace">
        ◈ INVWRK {badge > 0 && <span style={S.badge(CY)}>{badge}</span>}
      </button>
    );
  }

  const selCase = cases.find((c) => c.id === selId);

  return (
    <>
      <button style={S.btn} onClick={() => setOpen(false)} title="Close">
        ◈ INVWRK <span style={S.badge(CY)}>{badge}</span> ✕
      </button>

      <div style={S.panel}>
        {/* header */}
        <div style={S.hdr}>
          <span style={{ color: CY, fontSize: 12, fontWeight: 700 }}>INVESTIGATION WORKSPACE</span>
          <span style={S.badge(CY)}>{badge}</span>
          <button style={{ ...S.btnSm(GN), marginLeft: "auto" }} onClick={() => setShowNew((v) => !v)}>
            {showNew ? "✕ Cancel" : "+ New Case"}
          </button>
          <button style={S.btnSm(AM)} onClick={handleAssess} disabled={assessing}>
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          {loading && <span style={{ color: GRAY, fontSize: 10 }}>↻</span>}
        </div>

        {/* new-case form */}
        {showNew && (
          <form onSubmit={handleCreateCase} style={{ padding: "8px 12px", borderBottom: `1px solid ${BORD}`, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <input
                style={{ ...S.input, width: 160 }}
                placeholder="Case name *"
                value={ncName}
                onChange={(e) => setNcName(e.target.value)}
              />
              <input
                style={{ ...S.input, width: 110 }}
                placeholder="Owner"
                value={ncOwner}
                onChange={(e) => setNcOwner(e.target.value)}
              />
              <input
                style={{ ...S.input, width: 150 }}
                placeholder="Seeds (csv: id1,id2)"
                value={ncSeeds}
                onChange={(e) => setNcSeeds(e.target.value)}
              />
              <input
                style={{ ...S.input, flex: 1, minWidth: 80 }}
                placeholder="Notes"
                value={ncNotes}
                onChange={(e) => setNcNotes(e.target.value)}
              />
              <button type="submit" style={S.btnSm(GN)} disabled={ncBusy}>
                {ncBusy ? "…" : "Create"}
              </button>
            </div>
            {ncErr && <div style={{ color: RD, fontSize: 10, marginTop: 3 }}>{ncErr}</div>}
          </form>
        )}

        {/* error */}
        {err && <div style={{ color: RD, fontSize: 11, padding: "4px 12px", flexShrink: 0 }}>{err}</div>}

        {/* assess result */}
        {assessText && (
          <div style={{ padding: "5px 12px", color: AM, fontSize: 11, borderBottom: `1px solid ${BORD}`, flexShrink: 0, lineHeight: 1.4 }}>
            {assessText}
          </div>
        )}

        {/* delete confirm overlay */}
        {delId && (
          <div style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 10, flexDirection: "column", gap: 10,
          }}>
            <div style={{ color: RD, fontSize: 13, fontFamily: "monospace" }}>
              Delete case "{cases.find((c) => c.id === delId)?.name}"?
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={S.btnSm(RD)} onClick={handleDelete} disabled={delBusy}>
                {delBusy ? "…" : "Yes, delete"}
              </button>
              <button style={S.btnSm(GRAY)} onClick={() => setDelId(null)}>Cancel</button>
            </div>
          </div>
        )}

        {/* main body */}
        <div style={S.body}>
          {/* left: case list */}
          <div style={S.left}>
            <div style={{ ...S.sectionLabel, padding: "6px 8px 2px", flexShrink: 0 }}>
              Cases ({cases.length})
            </div>
            <div style={S.scroll}>
              {cases.length === 0 && !loading && (
                <div style={{ color: GRAY, fontSize: 11, padding: 4 }}>No cases.</div>
              )}
              {cases.map((c) => (
                <div key={c.id} style={S.caseRow(c.id === selId)} onClick={() => handleSelectCase(c.id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
                      {c.name || c.id}
                    </span>
                    <button
                      style={{ ...S.btnSm(RD), padding: "0px 4px", fontSize: 9 }}
                      onClick={(e) => { e.stopPropagation(); setDelId(c.id); }}
                      title="Delete"
                    >✕</button>
                  </div>
                  {c.owner && <div style={{ color: GRAY, fontSize: 9, marginTop: 1 }}>{c.owner}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* right: case detail */}
          <div style={S.right}>
            {!selId && (
              <div style={{ color: GRAY, fontSize: 12, padding: 20 }}>← Select a case to inspect.</div>
            )}
            {selId && detLoading && (
              <div style={{ color: GRAY, fontSize: 12, padding: 20 }}>Loading…</div>
            )}
            {selId && !detLoading && detail && (
              <>
                <div style={{ ...S.scroll, flex: "none", maxHeight: 200 }}>
                  {/* case header */}
                  <div style={{ color: CY, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                    {detail.name || selId}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    {detail.owner && (
                      <span style={{ color: GRAY, fontSize: 10 }}>owner: <span style={{ color: AM }}>{detail.owner}</span></span>
                    )}
                    {detail.notes && (
                      <span style={{ color: GRAY, fontSize: 10, fontStyle: "italic" }}>{detail.notes}</span>
                    )}
                  </div>

                  {/* seeds */}
                  {Array.isArray(detail.seeds) && detail.seeds.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={S.sectionLabel}>Seeds</div>
                      <div>
                        {detail.seeds.map((s, i) => (
                          <span key={i} style={S.seedChip}>{s}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* annotations */}
                  <div style={S.sectionLabel}>
                    Annotations ({Array.isArray(detail.annotations) ? detail.annotations.length : 0})
                  </div>
                  {Array.isArray(detail.annotations) && detail.annotations.length === 0 && (
                    <div style={{ color: GRAY, fontSize: 10 }}>None yet.</div>
                  )}
                  {Array.isArray(detail.annotations) && detail.annotations.map((a, i) => (
                    <div key={i} style={S.annRow}>
                      <span style={{ color: AM, fontSize: 9 }}>[{a.target || "case"}]</span>
                      {" "}{a.text}
                      {a.actor && <span style={{ color: GRAY, fontSize: 9 }}> — {a.actor}</span>}
                      {a.created_at && (
                        <span style={{ color: GRAY, fontSize: 9, float: "right" }}>
                          {new Date(a.created_at * 1000 || a.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ))}

                  {/* shares */}
                  {Array.isArray(detail.shares) && detail.shares.length > 0 && (
                    <>
                      <div style={{ ...S.sectionLabel, marginTop: 4 }}>Shares</div>
                      {detail.shares.map((s, i) => (
                        <div key={i} style={{ color: "#9AB", fontSize: 10, marginBottom: 2 }}>
                          {s.principal} <span style={{ color: GN }}>[{s.role}]</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {/* annotation form */}
                <form onSubmit={handleAnnotate} style={S.ftr}>
                  <div style={{ ...S.sectionLabel, marginBottom: 4 }}>Add Annotation</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      style={{ ...S.input, width: 120 }}
                      placeholder='target (e.g. "case" or "node:abc")'
                      value={annTarget}
                      onChange={(e) => setAnnTarget(e.target.value)}
                    />
                    <input
                      style={{ ...S.input, flex: 1 }}
                      placeholder="Annotation text *"
                      value={annText}
                      onChange={(e) => setAnnText(e.target.value)}
                    />
                    <button type="submit" style={S.btnSm(GN)} disabled={annBusy}>
                      {annBusy ? "…" : "Add"}
                    </button>
                  </div>
                  {annErr && <div style={{ color: RD, fontSize: 10, marginTop: 2 }}>{annErr}</div>}
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
