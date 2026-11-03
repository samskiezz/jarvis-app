/**
 * InvestigationAnnotationViewer — F317.
 *
 * Data sources (all real — backed by server/routes/investigations.py):
 *   GET  /v1/investigations                       → [{id,title,...}]
 *   GET  /v1/investigations/{id}                  → {id,title,annotations:[{node_id,text,actor,ts}],...}
 *   POST /v1/investigations/{id}/annotations      → {annotation_id,...}
 *
 * Displays:
 *   - Investigation list (left panel): title + annotation count badge
 *   - Click → load detail with annotations as vertical timeline:
 *       timestamp · node_id chip · annotator label · annotation text
 *   - Filter bar: node_id text filter (filters displayed timeline entries)
 *   - Annotation count per node displayed as badge in sidebar
 *   - "Add Annotation" form: node_id input + text textarea → POST → refresh
 *   - "Export" button: downloads annotations as plain text
 *   - ASSESS speaks about annotation coverage + TTS
 *
 * Toggle: ◈ INVANNO  left:225320  bottom:8  zIndex:413
 * Event:  jarvis:invanno-toggle
 * Voice:  "investigation annotations / invanno / annotation viewer /
 *          investigation notes / case annotations / annotate investigation"
 *
 * Exported for JarvisBrain: isInvannoQuery, buildInvannoScript
 * Mounted via src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

// ── palette ────────────────────────────────────────────────────────────────
const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const VI   = "#A78BFA";
const SURF = "rgba(6,11,18,0.97)";
const BORD = "rgba(41,231,255,0.18)";
const DIM  = "rgba(41,231,255,0.40)";

// ── constants ─────────────────────────────────────────────────────────────
const BTN_LEFT = 225320;
const PANEL_W  = 900;
const PANEL_H  = 660;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ── JarvisBrain exports ───────────────────────────────────────────────────
const INVANNO_RE =
  /\b(investigation\s*annot|invanno\b|annot(?:ation)?\s*viewer|investigation\s*notes?|case\s*annot|annotate\s*invest)\b/i;

export function isInvannoQuery(q) {
  return INVANNO_RE.test(q || "");
}

export async function buildInvannoScript() {
  try {
    const r  = await fetch(`${apiBase()}/v1/investigations`);
    const d  = await r.json();
    const items = normaliseList(d);
    const total = items.length;
    const annotCounts = items.map((inv) => inv.annotation_count ?? 0);
    const totalAnnots = annotCounts.reduce((a, b) => a + b, 0);
    return (
      `Investigation Annotations: ${total} investigation(s) loaded. ` +
      `Total stored annotations across all cases: ${totalAnnots}. ` +
      (total > 0 ? `Most recent: "${items[0].title || items[0].id}".` : "No investigations found.")
    );
  } catch {
    return "Investigation Annotations: could not reach /v1/investigations.";
  }
}

// ── helpers ───────────────────────────────────────────────────────────────
function normaliseList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["items", "investigations", "cases", "results", "data"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseAnnotations(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["annotations", "items", "data"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function fmtTs(ts) {
  if (!ts) return "—";
  try {
    return new Date(typeof ts === "number" ? ts * 1000 : ts).toLocaleString();
  } catch { return String(ts); }
}

function nodeColor(nodeId) {
  if (!nodeId) return DIM;
  const h = [...nodeId].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `hsl(${h},70%,65%)`;
}

// ── TTS helper ────────────────────────────────────────────────────────────
async function tts(text) {
  try {
    const r = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ text }),
    });
    const d = await r.json();
    if (d?.audio_url) {
      const a = new Audio(d.audio_url);
      a.play().catch(() => {});
    }
  } catch { /* skip */ }
}

// ── ASSESS helper ─────────────────────────────────────────────────────────
async function assess(setBrief, setAssessing) {
  setAssessing(true);
  setBrief("");
  try {
    const snap = await buildInvannoScript();
    const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Assess: ${snap} Summarise annotation coverage across investigations in 2 sentences.`,
      }),
    });
    const d   = await r.json();
    const txt = d?.response || d?.reply || d?.text || "No assessment available.";
    setBrief(txt);
    tts(txt.slice(0, 300));
  } catch {
    setBrief("Assessment unavailable.");
  }
  setAssessing(false);
}

// ─────────────────────────────────────────────────────────────────────────────
export default function InvestigationAnnotationViewer() {
  const [open, setOpen]               = useState(false);
  const [investigations, setInvestigations] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [selected, setSelected]       = useState(null);
  const [detail, setDetail]           = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [nodeFilter, setNodeFilter]   = useState("");
  const [newNodeId, setNewNodeId]     = useState("");
  const [newText, setNewText]         = useState("");
  const [posting, setPosting]         = useState(false);
  const [postError, setPostError]     = useState("");
  const [postOk, setPostOk]           = useState(false);
  const [brief, setBrief]             = useState("");
  const [assessing, setAssessing]     = useState(false);
  const timelineRef                   = useRef(null);

  // ── event listener for voice / JarvisBrain ───────────────────────────────
  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:invanno-toggle", handler);
    return () => window.removeEventListener("jarvis:invanno-toggle", handler);
  }, []);

  // ── load investigation list ───────────────────────────────────────────────
  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/v1/investigations`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      const d = await r.json();
      setInvestigations(normaliseList(d));
    } catch {
      setInvestigations([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) loadList();
  }, [open, loadList]);

  // ── load detail ───────────────────────────────────────────────────────────
  const loadDetail = useCallback(async (inv) => {
    setSelected(inv);
    setDetail(null);
    setLoadingDetail(true);
    setNodeFilter("");
    setPostError("");
    setPostOk(false);
    try {
      const r = await fetch(`${apiBase()}/v1/investigations/${inv.id}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      const d = await r.json();
      setDetail(d);
    } catch {
      setDetail({ annotations: [] });
    }
    setLoadingDetail(false);
  }, []);

  // ── add annotation ────────────────────────────────────────────────────────
  const addAnnotation = useCallback(async () => {
    if (!selected || !newText.trim()) return;
    setPosting(true);
    setPostError("");
    setPostOk(false);
    try {
      const r = await fetch(`${apiBase()}/v1/investigations/${selected.id}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          target: newNodeId.trim() ? `node:${newNodeId.trim()}` : "case",
          text: newText.trim(),
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setNewNodeId("");
      setNewText("");
      setPostOk(true);
      await loadDetail(selected);
    } catch (e) {
      setPostError(e.message || "Post failed.");
    }
    setPosting(false);
  }, [selected, newNodeId, newText, loadDetail]);

  // ── export annotations ────────────────────────────────────────────────────
  const exportAnnotations = useCallback(() => {
    if (!detail) return;
    const annots = normaliseAnnotations(detail.annotations || detail);
    const title  = selected?.title || selected?.id || "investigation";
    const lines  = [
      `Investigation: ${title}`,
      `Exported: ${new Date().toISOString()}`,
      "",
      ...annots.map((a) =>
        `[${fmtTs(a.ts || a.created_ts || a.timestamp)}] node=${a.node_id || a.target || "case"} ` +
        `actor=${a.actor || a.annotator || "unknown"}\n${a.text || a.annotation || ""}`,
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `annotations_${title.replace(/\W+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [detail, selected]);

  // ── derived ───────────────────────────────────────────────────────────────
  const allAnnots = detail ? normaliseAnnotations(detail.annotations || detail) : [];
  const filtered  = nodeFilter.trim()
    ? allAnnots.filter((a) => (a.node_id || a.target || "").includes(nodeFilter.trim()))
    : allAnnots;

  const nodeCounts = {};
  allAnnots.forEach((a) => {
    const k = a.node_id || a.target || "case";
    nodeCounts[k] = (nodeCounts[k] || 0) + 1;
  });

  // ── panel not open ────────────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investigation Annotation Viewer"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 413,
          background: "rgba(6,11,18,0.85)", border: `1px solid ${BORD}`,
          color: CY, fontFamily: "monospace", fontSize: 11,
          padding: "3px 8px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >◈ INVANNO</button>
    );
  }

  // ── panel open ────────────────────────────────────────────────────────────
  const panelLeft = Math.min(BTN_LEFT, window.innerWidth - PANEL_W - 12);

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setOpen(false)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 413,
          background: `rgba(41,231,255,0.18)`, border: `1px solid ${CY}`,
          color: CY, fontFamily: "monospace", fontSize: 11,
          padding: "3px 8px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >◈ INVANNO</button>

      {/* panel */}
      <div style={{
        position: "fixed", left: panelLeft, bottom: 40, zIndex: 413,
        width: PANEL_W, height: PANEL_H,
        background: SURF, border: `1px solid ${CY}`,
        borderRadius: 8, display: "flex", flexDirection: "column",
        fontFamily: "monospace", fontSize: 12, color: CY,
        boxShadow: `0 0 32px rgba(41,231,255,0.12)`,
        overflow: "hidden",
      }}>
        {/* header */}
        <div style={{
          padding: "8px 14px", borderBottom: `1px solid ${BORD}`,
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: CY, letterSpacing: 1 }}>
            ◈ INVESTIGATION ANNOTATION VIEWER
          </span>
          <span style={{ marginLeft: "auto", color: DIM, fontSize: 11 }}>
            {investigations.length} case(s)
          </span>
          <button
            onClick={() => { setBrief(""); assess(setBrief, setAssessing); }}
            disabled={assessing}
            style={{ background: "transparent", border: `1px solid ${AM}`, color: AM,
              fontFamily: "monospace", fontSize: 11, padding: "2px 8px",
              borderRadius: 3, cursor: "pointer" }}
          >{assessing ? "ASSESSING…" : "ASSESS"}</button>
          <button
            onClick={() => setOpen(false)}
            style={{ background: "transparent", border: "none", color: RD,
              fontFamily: "monospace", fontSize: 14, cursor: "pointer", lineHeight: 1 }}
          >✕</button>
        </div>

        {/* ASSESS brief */}
        {brief && (
          <div style={{
            padding: "6px 14px", background: "rgba(41,231,255,0.05)",
            borderBottom: `1px solid ${BORD}`, color: CY, fontSize: 11,
            flexShrink: 0,
          }}>{brief}</div>
        )}

        {/* body: left list + right detail */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* investigation list */}
          <div style={{
            width: 220, borderRight: `1px solid ${BORD}`,
            overflowY: "auto", padding: 8, flexShrink: 0,
          }}>
            <div style={{ color: DIM, fontSize: 10, marginBottom: 6 }}>INVESTIGATIONS</div>
            {loading && <div style={{ color: DIM }}>Loading…</div>}
            {!loading && investigations.length === 0 && (
              <div style={{ color: DIM }}>No investigations.</div>
            )}
            {investigations.map((inv) => (
              <div
                key={inv.id}
                onClick={() => loadDetail(inv)}
                style={{
                  padding: "5px 8px", marginBottom: 4, borderRadius: 4,
                  cursor: "pointer",
                  background: selected?.id === inv.id
                    ? "rgba(41,231,255,0.14)"
                    : "rgba(41,231,255,0.04)",
                  border: `1px solid ${selected?.id === inv.id ? CY : BORD}`,
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {inv.title || inv.id}
                </span>
                {inv.annotation_count != null && (
                  <span style={{
                    background: "rgba(41,231,255,0.15)", border: `1px solid ${BORD}`,
                    borderRadius: 10, padding: "0 5px", fontSize: 10, color: DIM,
                  }}>{inv.annotation_count}</span>
                )}
              </div>
            ))}
          </div>

          {/* detail panel */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {!selected && (
              <div style={{ flex: 1, display: "flex", alignItems: "center",
                justifyContent: "center", color: DIM }}>
                Select an investigation to view annotations.
              </div>
            )}

            {selected && (
              <>
                {/* detail header */}
                <div style={{
                  padding: "6px 12px", borderBottom: `1px solid ${BORD}`,
                  display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
                }}>
                  <span style={{ fontWeight: 600, color: CY, flex: 1 }}>
                    {selected.title || selected.id}
                  </span>
                  <span style={{ color: DIM, fontSize: 10 }}>
                    {allAnnots.length} annotation(s)
                  </span>
                  <button
                    onClick={exportAnnotations}
                    disabled={!detail}
                    style={{ background: "transparent", border: `1px solid ${GN}`, color: GN,
                      fontFamily: "monospace", fontSize: 10, padding: "2px 7px",
                      borderRadius: 3, cursor: "pointer" }}
                  >EXPORT TXT</button>
                </div>

                {/* node-id counts sidebar + filter */}
                <div style={{
                  padding: "6px 12px", borderBottom: `1px solid ${BORD}`,
                  display: "flex", gap: 8, alignItems: "center", flexShrink: 0,
                  flexWrap: "wrap",
                }}>
                  <span style={{ color: DIM, fontSize: 10 }}>FILTER NODE:</span>
                  <input
                    value={nodeFilter}
                    onChange={(e) => setNodeFilter(e.target.value)}
                    placeholder="node_id substring…"
                    style={{
                      background: "rgba(6,11,18,0.8)", border: `1px solid ${BORD}`,
                      color: CY, fontFamily: "monospace", fontSize: 11,
                      padding: "2px 7px", borderRadius: 3, width: 160,
                    }}
                  />
                  {Object.entries(nodeCounts).slice(0, 6).map(([nid, cnt]) => (
                    <span
                      key={nid}
                      onClick={() => setNodeFilter(nid === nodeFilter ? "" : nid)}
                      title={nid}
                      style={{
                        cursor: "pointer",
                        background: nodeFilter === nid
                          ? "rgba(41,231,255,0.2)" : "rgba(41,231,255,0.06)",
                        border: `1px solid ${nodeColor(nid)}`,
                        borderRadius: 10, padding: "1px 7px", fontSize: 10,
                        color: nodeColor(nid), whiteSpace: "nowrap",
                      }}
                    >
                      {nid.length > 12 ? nid.slice(0, 12) + "…" : nid}
                      {" "}
                      <strong>{cnt}</strong>
                    </span>
                  ))}
                </div>

                {/* timeline */}
                <div
                  ref={timelineRef}
                  style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}
                >
                  {loadingDetail && <div style={{ color: DIM }}>Loading annotations…</div>}
                  {!loadingDetail && filtered.length === 0 && (
                    <div style={{ color: DIM }}>
                      {nodeFilter ? "No annotations match filter." : "No annotations yet."}
                    </div>
                  )}
                  {filtered.map((a, i) => {
                    const nid = a.node_id || a.target || "case";
                    return (
                      <div
                        key={a.annotation_id || a.id || i}
                        style={{
                          display: "flex", gap: 10, marginBottom: 10,
                          paddingBottom: 10,
                          borderBottom: i < filtered.length - 1 ? `1px solid ${BORD}` : "none",
                        }}
                      >
                        {/* timeline dot + line */}
                        <div style={{ display: "flex", flexDirection: "column",
                          alignItems: "center", width: 16, flexShrink: 0 }}>
                          <div style={{
                            width: 10, height: 10, borderRadius: "50%",
                            background: nodeColor(nid), flexShrink: 0, marginTop: 2,
                          }} />
                          {i < filtered.length - 1 && (
                            <div style={{
                              flex: 1, width: 1,
                              background: "rgba(41,231,255,0.14)",
                              marginTop: 3,
                            }} />
                          )}
                        </div>

                        <div style={{ flex: 1 }}>
                          <div style={{
                            display: "flex", gap: 8, alignItems: "center",
                            marginBottom: 3, flexWrap: "wrap",
                          }}>
                            <span style={{ color: DIM, fontSize: 10 }}>
                              {fmtTs(a.ts || a.created_ts || a.timestamp)}
                            </span>
                            <span style={{
                              background: "rgba(41,231,255,0.08)",
                              border: `1px solid ${nodeColor(nid)}`,
                              borderRadius: 4, padding: "1px 6px", fontSize: 10,
                              color: nodeColor(nid),
                            }}>{nid}</span>
                            {(a.actor || a.annotator) && (
                              <span style={{ color: VI, fontSize: 10 }}>
                                by {a.actor || a.annotator}
                              </span>
                            )}
                          </div>
                          <div style={{
                            color: "#d4e8ff", fontSize: 12, lineHeight: 1.5,
                            whiteSpace: "pre-wrap", wordBreak: "break-word",
                          }}>
                            {a.text || a.annotation || a.note || ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* add annotation form */}
                <div style={{
                  borderTop: `1px solid ${BORD}`, padding: "8px 12px",
                  background: "rgba(6,11,18,0.6)", flexShrink: 0,
                }}>
                  <div style={{ color: DIM, fontSize: 10, marginBottom: 5 }}>ADD ANNOTATION</div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <input
                      value={newNodeId}
                      onChange={(e) => setNewNodeId(e.target.value)}
                      placeholder="node_id (optional)"
                      style={{
                        background: "rgba(6,11,18,0.8)", border: `1px solid ${BORD}`,
                        color: CY, fontFamily: "monospace", fontSize: 11,
                        padding: "3px 8px", borderRadius: 3, width: 160,
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                    <textarea
                      value={newText}
                      onChange={(e) => setNewText(e.target.value)}
                      placeholder="Annotation text…"
                      rows={2}
                      style={{
                        flex: 1, background: "rgba(6,11,18,0.8)",
                        border: `1px solid ${BORD}`, color: CY,
                        fontFamily: "monospace", fontSize: 11,
                        padding: "4px 8px", borderRadius: 3, resize: "vertical",
                      }}
                    />
                    <button
                      onClick={addAnnotation}
                      disabled={posting || !newText.trim()}
                      style={{
                        background: newText.trim() ? "rgba(74,222,128,0.15)" : "transparent",
                        border: `1px solid ${GN}`, color: GN,
                        fontFamily: "monospace", fontSize: 11,
                        padding: "6px 12px", borderRadius: 3, cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >{posting ? "POSTING…" : "POST"}</button>
                  </div>
                  {postError && (
                    <div style={{ color: RD, fontSize: 11, marginTop: 4 }}>
                      Error: {postError}
                    </div>
                  )}
                  {postOk && (
                    <div style={{ color: GN, fontSize: 11, marginTop: 4 }}>
                      Annotation added.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
