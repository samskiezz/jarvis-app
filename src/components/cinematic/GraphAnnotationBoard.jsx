/**
 * GraphAnnotationBoard — F289
 * Live browser + creator for graph node/edge annotations.
 *
 * Endpoints:
 *   GET  /v1/graph/annotations       — list all annotations (60 s poll)
 *   POST /v1/graph/annotate          — add annotation {target_id, target_type, text, actor}
 *   GET  /v1/graph/centrality        — top nodes for quick-pick target (on open)
 *   POST /v1/jarvis/agent/chat       — AI annotation brief + TTS
 *
 * Toggle: ◈ GANN  left:338160  bottom:8  zIndex:167
 * Event:  jarvis:gann-toggle
 * Voice:  "graph annotations" | "annotate graph" | "graph notes" | "annotation board" | "gann"
 *
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const GN  = "#00E5A0";
const AM  = "#F59E0B";
const DIM = "#4A6070";
const POLL_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const GANN_RE =
  /\bgraph\s+annotat|\bannotat\s+graph|\bgraph\s+notes?\b|\bannotation\s+board|\bgann\b|\bannotat\s+node|\bgraph\s+markup/i;

export function isGannQuery(text) {
  return GANN_RE.test(text || "");
}

export async function buildGannScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/graph/annotations`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) throw new Error("no data");
    const d = await r.json();
    const anns = d.annotations || [];
    if (!anns.length) return "The graph annotation board is clear — no annotations have been added yet, sir.";
    const recent = anns
      .slice(-3)
      .reverse()
      .map((a) => `"${(a.text || "").slice(0, 40)}"`)
      .join(", ");
    return (
      `Graph annotation board: ${anns.length} annotation${anns.length !== 1 ? "s" : ""} on record. ` +
      `Most recent: ${recent}. Opening board for review, sir.`
    );
  } catch {
    return "Graph annotation board is online. No annotation data currently available, sir.";
  }
}

function fmtAge(ts) {
  if (!ts) return "";
  const ms = typeof ts === "number" ? ts : Date.parse(ts);
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export default function GraphAnnotationBoard() {
  const [open, setOpen]           = useState(false);
  const [anns, setAnns]           = useState([]);
  const [topNodes, setTopNodes]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("LIST");        // LIST | ADD
  const [search, setSearch]       = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [targetId, setTargetId]   = useState("");
  const [targetType, setTargetType] = useState("node");
  const [noteText, setNoteText]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const pollRef = useRef(null);
  const audioRef = useRef(null);

  const fetchAnns = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase()}/v1/graph/annotations`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) return;
      const d = await r.json();
      setAnns(d.annotations || []);
    } catch (_) {}
  }, []);

  const fetchTopNodes = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase()}/v1/graph/centrality?limit=20`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) return;
      const d = await r.json();
      const nodes = Array.isArray(d) ? d : (d.nodes || d.data || d.centrality || []);
      setTopNodes(nodes.slice(0, 15));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:gann-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gann-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(pollRef.current); return; }
    setLoading(true);
    Promise.all([fetchAnns(), fetchTopNodes()]).finally(() => setLoading(false));
    pollRef.current = setInterval(fetchAnns, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, fetchAnns, fetchTopNodes]);

  async function handleSubmit() {
    if (!targetId.trim() || !noteText.trim()) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const r = await fetch(`${apiBase()}/v1/graph/annotate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          target_id: targetId.trim(),
          target_type: targetType,
          text: noteText.trim(),
          actor: "operator",
        }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const d = await r.json();
      setSubmitResult({ ok: true, ann: d.annotation });
      setNoteText("");
      setTargetId("");
      await fetchAnns();
      setTab("LIST");
    } catch (e) {
      setSubmitResult({ ok: false, err: String(e) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAssess() {
    if (assessing) return;
    setAssessing(true);
    try {
      const ctx = anns.length
        ? `Graph annotations board has ${anns.length} annotations. Recent: ${anns.slice(-3).map((a) => a.text).join("; ")}`
        : "Graph annotation board is empty.";
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Assess the graph annotation intelligence and what patterns these annotations reveal. Context: ${ctx}`,
        }),
      });
      const d = await r.json();
      const answer = (d.answer || "Graph annotation assessment complete, sir.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer, voice: getActiveVoice() } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: "Graph annotation assessment unavailable at this time, sir.", voice: getActiveVoice() } }));
    } finally {
      setAssessing(false);
    }
  }

  const filtered = anns.filter((a) => {
    if (typeFilter !== "ALL" && a.target_type?.toUpperCase() !== typeFilter) return false;
    if (search && !`${a.target_id} ${a.text} ${a.actor || ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const badge = anns.length > 0
    ? { color: AM, text: String(anns.length) }
    : { color: DIM, text: "0" };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Annotation Board (GANN)"
        style={{
          position: "fixed", left: 338160, bottom: 8, zIndex: 167,
          background: "rgba(5,10,18,0.82)",
          border: `1px solid ${badge.color}44`,
          borderRadius: 6, padding: "3px 8px",
          color: badge.color, fontSize: 10, fontFamily: "monospace",
          cursor: "pointer", letterSpacing: 1, whiteSpace: "nowrap",
        }}
      >
        ◈ GANN{anns.length > 0 ? ` ${anns.length}` : ""}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed", top: 60, right: 16, width: 400, maxHeight: "82vh",
        zIndex: 9200,
        background: "rgba(5,10,18,0.97)",
        border: `1px solid ${CY}44`,
        borderRadius: 12,
        boxShadow: `0 0 60px ${CY}18, 0 24px 48px rgba(0,0,0,0.8)`,
        fontFamily: "'JetBrains Mono', monospace",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${CY}22`, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◈ GRAPH ANNOTATIONS</span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                background: assessing ? `${CY}11` : `${CY}22`,
                border: `1px solid ${CY}44`, borderRadius: 4,
                color: CY, fontSize: 9, padding: "2px 7px", cursor: "pointer", letterSpacing: 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, fontSize: 14, cursor: "pointer", padding: 0, lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {[
            { label: "TOTAL", val: anns.length, color: CY },
            { label: "NODE", val: anns.filter((a) => a.target_type !== "edge").length, color: GN },
            { label: "EDGE", val: anns.filter((a) => a.target_type === "edge").length, color: AM },
            { label: "TOP NODES", val: topNodes.length, color: DIM },
          ].map(({ label, val, color }) => (
            <div
              key={label}
              style={{
                flex: 1, background: "rgba(41,231,255,0.04)",
                border: `1px solid ${color}22`, borderRadius: 5,
                padding: "4px 6px", textAlign: "center",
              }}
            >
              <div style={{ color, fontSize: 14, fontWeight: 700 }}>{val}</div>
              <div style={{ color: DIM, fontSize: 8, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {["LIST", "ADD"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? `${CY}22` : "transparent",
                border: `1px solid ${tab === t ? CY : DIM}44`,
                borderRadius: 4, color: tab === t ? CY : DIM,
                fontSize: 9, padding: "2px 8px", cursor: "pointer", letterSpacing: 1,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px 14px" }}>
        {loading && (
          <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 12 }}>Loading…</div>
        )}

        {tab === "LIST" && !loading && (
          <>
            {/* Search + type filter */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search annotations…"
                style={{
                  flex: 1, background: "rgba(41,231,255,0.05)",
                  border: `1px solid ${CY}33`, borderRadius: 5,
                  color: "#DCEBF5", fontSize: 10, padding: "4px 8px",
                  fontFamily: "inherit", outline: "none",
                }}
              />
              {["ALL", "NODE", "EDGE"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  style={{
                    background: typeFilter === t ? `${CY}22` : "transparent",
                    border: `1px solid ${typeFilter === t ? CY : DIM}44`,
                    borderRadius: 4, color: typeFilter === t ? CY : DIM,
                    fontSize: 9, padding: "2px 7px", cursor: "pointer",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            {filtered.length === 0 && (
              <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 20 }}>
                {anns.length === 0
                  ? "No annotations yet — use ADD to annotate a node or edge."
                  : "No annotations match the current filter."}
              </div>
            )}

            {filtered.slice().reverse().map((a) => (
              <div
                key={a.id}
                style={{
                  border: `1px solid ${CY}22`, borderRadius: 6,
                  padding: "7px 10px", marginBottom: 6,
                  background: "rgba(41,231,255,0.03)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{
                    background: a.target_type === "edge" ? `${AM}22` : `${GN}22`,
                    border: `1px solid ${a.target_type === "edge" ? AM : GN}44`,
                    borderRadius: 4, color: a.target_type === "edge" ? AM : GN,
                    fontSize: 8, padding: "1px 5px", letterSpacing: 1,
                  }}>
                    {(a.target_type || "node").toUpperCase()}
                  </span>
                  <span style={{ color: DIM, fontSize: 8 }}>{fmtAge(a.ts)}</span>
                </div>
                <div style={{ color: CY, fontSize: 9, marginBottom: 3, opacity: 0.7, letterSpacing: 0.5 }}>
                  {a.target_id}
                </div>
                <div style={{ color: "#DCEBF5", fontSize: 11, lineHeight: 1.4 }}>{a.text}</div>
                {a.actor && (
                  <div style={{ color: DIM, fontSize: 8, marginTop: 3 }}>by {a.actor}</div>
                )}
              </div>
            ))}
          </>
        )}

        {tab === "ADD" && !loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Quick-pick from top nodes */}
            {topNodes.length > 0 && (
              <div>
                <div style={{ color: DIM, fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>
                  QUICK-PICK TARGET (top nodes by centrality)
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {topNodes.map((n) => {
                    const nid = n.id || n.node_id || n.name || String(n);
                    return (
                      <button
                        key={nid}
                        onClick={() => { setTargetId(nid); setTargetType("node"); }}
                        style={{
                          background: targetId === nid ? `${CY}22` : "rgba(41,231,255,0.05)",
                          border: `1px solid ${targetId === nid ? CY : DIM}44`,
                          borderRadius: 4, color: targetId === nid ? CY : "#7A9BAB",
                          fontSize: 8, padding: "2px 6px", cursor: "pointer", letterSpacing: 0.5,
                        }}
                      >
                        {nid}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Target ID */}
            <div>
              <div style={{ color: DIM, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>TARGET ID</div>
              <input
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder="Node or edge id…"
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "rgba(41,231,255,0.05)",
                  border: `1px solid ${CY}33`, borderRadius: 5,
                  color: "#DCEBF5", fontSize: 11, padding: "6px 10px",
                  fontFamily: "inherit", outline: "none",
                }}
              />
            </div>

            {/* Target type */}
            <div>
              <div style={{ color: DIM, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>TARGET TYPE</div>
              <div style={{ display: "flex", gap: 6 }}>
                {["node", "edge"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTargetType(t)}
                    style={{
                      background: targetType === t ? `${CY}22` : "transparent",
                      border: `1px solid ${targetType === t ? CY : DIM}44`,
                      borderRadius: 4, color: targetType === t ? CY : DIM,
                      fontSize: 9, padding: "3px 12px", cursor: "pointer", letterSpacing: 1,
                    }}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Annotation text */}
            <div>
              <div style={{ color: DIM, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>ANNOTATION</div>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Write your annotation…"
                rows={4}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "rgba(41,231,255,0.05)",
                  border: `1px solid ${CY}33`, borderRadius: 5,
                  color: "#DCEBF5", fontSize: 11, padding: "6px 10px",
                  fontFamily: "inherit", outline: "none", resize: "vertical",
                }}
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting || !targetId.trim() || !noteText.trim()}
              style={{
                background: submitting || !targetId.trim() || !noteText.trim()
                  ? "rgba(41,231,255,0.06)"
                  : `${CY}22`,
                border: `1px solid ${CY}44`, borderRadius: 6,
                color: CY, fontSize: 11, padding: "8px 0", cursor: "pointer",
                letterSpacing: 1, fontFamily: "inherit",
              }}
            >
              {submitting ? "SAVING…" : "◈ ADD ANNOTATION"}
            </button>

            {submitResult && (
              <div style={{
                color: submitResult.ok ? GN : "#FF4444",
                fontSize: 9, letterSpacing: 1, textAlign: "center",
              }}>
                {submitResult.ok
                  ? `✓ Annotation ${submitResult.ann?.id} saved`
                  : `✗ Error: ${submitResult.err}`}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: ${CY}33; border-radius: 2px; }
      `}</style>
    </div>
  );
}
