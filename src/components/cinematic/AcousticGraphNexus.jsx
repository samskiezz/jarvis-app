/**
 * F680 — Acoustic × Graph Centrality Nexus (ACGRPH)
 * Cross-references /v1/acoustic/contacts against /v1/graph/centrality.
 * Acoustic contacts with ≥1 keyword overlap with a high-centrality graph node
 * are GRAPH-LINKED; others are UNLINKED (no match in the centrality graph).
 * Tabs: ALL / GRAPH-LINKED / UNLINKED | click-to-expand matched nodes.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-second auto-refresh. Event: jarvis:acgrph-toggle.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 135_480;
const Z_INDEX  = 216;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const ACGRPH_RE = /\b(acgrph|acoustic\s+graph|graph\s+acoustic|acoustic\s+network|sensor\s+graph|acoustic\s+centrality|sound\s+graph|acoustic\s+graph\s+nexus|graph\s+linked\s+contacts?|centrality\s+acoustic)\b/i;

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseAcoustic(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.contacts)) return raw.contacts;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normaliseNodes(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.nodes))   return raw.nodes;
  if (Array.isArray(raw?.items))   return raw.items;
  if (Array.isArray(raw?.data))    return raw.data;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3);
}

function overlap(a, b) {
  const setA = new Set(keywords(a));
  return keywords(b).filter(w => setA.has(w)).length;
}

function crossRef(acousticContacts, graphNodes) {
  return acousticContacts.map(ac => {
    const acText = [ac.name, ac.callsign, ac.type, ac.classification, ac.description]
      .filter(Boolean).join(" ");
    const matched = graphNodes.filter(n => {
      const nText = [n.id, n.label, n.name, n.type, n.entity, n.description]
        .filter(Boolean).join(" ");
      return overlap(acText, nText) > 0;
    });
    return { ...ac, _matched: matched, _linked: matched.length > 0 };
  });
}

// ── JarvisBrain exports ───────────────────────────────────────────────────────

export function isAcgrphQuery(text) {
  return ACGRPH_RE.test(text || "");
}

export async function buildAcgrphScript() {
  const base    = apiBase();
  const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  try {
    const [ar, gr] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
      fetch(`${base}/v1/graph/centrality`,  { headers }).then(r => r.json()),
    ]);
    const acoustic = normaliseAcoustic(ar);
    const nodes    = normaliseNodes(gr);
    const enriched = crossRef(acoustic, nodes);
    const linked   = enriched.filter(a => a._linked);
    const summary  = `${linked.length} of ${acoustic.length} acoustic contacts keyword-match graph centrality nodes (${nodes.length} nodes). Graph-linked: ${linked.map(a => a.name || a.callsign || a.id).join(", ") || "none"}.`;
    const r2 = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers,
      body: JSON.stringify({ message: `Acoustic × Graph Centrality nexus status: ${summary} Provide a 2-sentence acoustic graph intelligence brief.` }),
    });
    const j2 = await r2.json();
    return j2?.response || j2?.message || j2?.answer || summary;
  } catch (e) {
    return `Acoustic Graph Nexus error: ${e.message}`;
  }
}

// ── main component ────────────────────────────────────────────────────────────

export default function AcousticGraphNexus() {
  const [open,       setOpen]       = useState(false);
  const [acoustic,   setAcoustic]   = useState([]);
  const [nodes,      setNodes]      = useState([]);
  const [enriched,   setEnriched]   = useState([]);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [assessing,  setAssessing]  = useState(false);
  const [brief,      setBrief]      = useState("");
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const base    = apiBase();
      const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const [ar, gr] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
        fetch(`${base}/v1/graph/centrality`,  { headers }).then(r => r.json()),
      ]);
      const ac = normaliseAcoustic(ar);
      const nd = normaliseNodes(gr);
      setAcoustic(ac);
      setNodes(nd);
      setEnriched(crossRef(ac, nd));
    } catch (_) { /* silent — stale data stays */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:acgrph-toggle", toggle);
    return () => window.removeEventListener("jarvis:acgrph-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const linked   = enriched.filter(a => a._linked);
  const unlinked = enriched.filter(a => !a._linked);

  const visible = (tab === "GRAPH-LINKED" ? linked : tab === "UNLINKED" ? unlinked : enriched)
    .filter(a => !search || [a.name, a.callsign, a.id, a.type].some(f => String(f || "").toLowerCase().includes(search.toLowerCase())));

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base    = apiBase();
      const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const summary = `${linked.length} of ${acoustic.length} acoustic contacts match graph centrality nodes (${nodes.length} nodes).`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers,
        body: JSON.stringify({ message: `Acoustic × Graph Centrality nexus: ${summary} Linked: ${linked.map(a => a.name || a.callsign || a.id).join(", ") || "none"}. Provide a 2-sentence acoustic graph intelligence brief.` }),
      });
      const j = await r.json();
      const text = j?.response || j?.message || j?.answer || summary;
      setBrief(text);
      const ttsRes = await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers,
        body: JSON.stringify({ text }),
      });
      if (ttsRes.ok) {
        const blob = await ttsRes.blob();
        new Audio(URL.createObjectURL(blob)).play().catch(() => {});
      }
    } catch (e) { setBrief(`Assessment error: ${e.message}`); }
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Acoustic × Graph Centrality Nexus (ACGRPH)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: linked.length > 0 ? "rgba(100,200,255,0.18)" : "rgba(0,30,60,0.82)",
          border: `1px solid ${linked.length > 0 ? "#64c8ff" : "#00ffe7"}`,
          color: linked.length > 0 ? "#64c8ff" : "#00ffe7",
          borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer",
          fontFamily: "monospace", letterSpacing: 1,
        }}
      >
        ◈ ACGRPH{linked.length > 0 ? ` [${linked.length}]` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 20, width: 520, maxHeight: "82vh",
      background: "rgba(0,10,25,0.97)", border: "1px solid #00ffe7",
      borderRadius: 10, zIndex: Z_INDEX + 100, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: "#c8f0ff", boxShadow: "0 0 40px #00ffe722",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #00ffe733" }}>
        <span style={{ color: "#00ffe7", fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>
          ◈ ACOUSTIC × GRAPH CENTRALITY
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span style={{ color: "#64c8ff", fontSize: 11 }}>⟳</span>}
          <span style={{ color: "#888", fontSize: 11 }}>{acoustic.length} acoustic · {nodes.length} nodes</span>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#ff4444", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px 0" }}>
        {[
          { label: "GRAPH-LINKED", val: linked.length,   col: "#64c8ff" },
          { label: "UNLINKED",     val: unlinked.length, col: "#00ffe7" },
          { label: "COVERAGE",     val: acoustic.length ? `${Math.round((linked.length / acoustic.length) * 100)}%` : "—", col: "#aaffaa" },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: "rgba(0,255,231,0.05)", border: `1px solid ${s.col}33`, borderRadius: 6, padding: "6px 10px", textAlign: "center" }}>
            <div style={{ color: s.col, fontSize: 16, fontWeight: 700 }}>{s.val}</div>
            <div style={{ color: "#667", fontSize: 9, letterSpacing: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* tabs + search */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px 0", alignItems: "center" }}>
        {["ALL", "GRAPH-LINKED", "UNLINKED"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "#00ffe722" : "none",
            border: `1px solid ${tab === t ? "#00ffe7" : "#333"}`,
            color: tab === t ? "#00ffe7" : "#667",
            borderRadius: 4, padding: "2px 10px", fontSize: 11, cursor: "pointer",
          }}>
            {t}{t === "GRAPH-LINKED" ? ` (${linked.length})` : t === "UNLINKED" ? ` (${unlinked.length})` : ` (${enriched.length})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{ marginLeft: "auto", background: "rgba(0,255,231,0.06)", border: "1px solid #00ffe733", borderRadius: 4, padding: "2px 8px", color: "#c8f0ff", fontSize: 11, width: 120, outline: "none" }}
        />
      </div>

      {/* acoustic contact list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px" }}>
        {visible.length === 0 && (
          <div style={{ color: "#444", fontSize: 12, textAlign: "center", marginTop: 20 }}>No acoustic contacts</div>
        )}
        {visible.map((a, i) => {
          const id    = a.id || a.callsign || i;
          const label = a.name || a.callsign || a.id || `Contact ${i + 1}`;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 6, background: "rgba(0,255,231,0.04)", border: `1px solid ${a._linked ? "#64c8ff44" : "#00ffe711"}`, borderRadius: 6, overflow: "hidden" }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
              >
                <span style={{ fontSize: 10, color: a._linked ? "#64c8ff" : "#00ffe777" }}>
                  {a._linked ? "▲" : "○"}
                </span>
                <span style={{ flex: 1, fontSize: 12, color: a._linked ? "#8dd8ff" : "#c8f0ff" }}>{label}</span>
                {a.type && <span style={{ color: "#667", fontSize: 10 }}>{a.type}</span>}
                {a._linked && (
                  <span style={{ background: "#64c8ff22", color: "#64c8ff", border: "1px solid #64c8ff55", borderRadius: 4, padding: "1px 6px", fontSize: 10 }}>
                    {a._matched.length} node{a._matched.length !== 1 ? "s" : ""}
                  </span>
                )}
                <span style={{ color: "#00ffe744", fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: "1px solid #00ffe711", padding: "8px 12px", background: "rgba(0,0,0,0.3)" }}>
                  {a.classification && <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Classification: {a.classification}</div>}
                  {a.description    && <div style={{ fontSize: 11, color: "#aaa", marginBottom: 6 }}>{a.description}</div>}
                  {a._linked ? (
                    <>
                      <div style={{ fontSize: 11, color: "#64c8ff", marginBottom: 6, fontWeight: 700 }}>Matched Graph Nodes:</div>
                      {a._matched.map((n, ri) => (
                        <div key={ri} style={{ marginBottom: 4, padding: "4px 8px", background: "rgba(100,200,255,0.07)", border: "1px solid #64c8ff33", borderRadius: 4, fontSize: 11 }}>
                          <span style={{ color: "#8dd8ff" }}>{n.label || n.name || n.id || `Node ${ri + 1}`}</span>
                          {n.type        && <span style={{ color: "#888", marginLeft: 6 }}>{n.type}</span>}
                          {n.centrality  != null && <span style={{ color: "#667", marginLeft: 6 }}>· centrality {typeof n.centrality === "number" ? n.centrality.toFixed(4) : n.centrality}</span>}
                          {n.entity      && <div style={{ color: "#999", marginTop: 2 }}>entity: {n.entity}</div>}
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: "#555" }}>No graph centrality keyword matches — acoustic contact unlinked.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess + brief */}
      <div style={{ borderTop: "1px solid #00ffe733", padding: "10px 14px" }}>
        {brief && (
          <div style={{ fontSize: 11, color: "#c8f0ff", background: "rgba(0,255,231,0.06)", border: "1px solid #00ffe733", borderRadius: 6, padding: "8px 10px", marginBottom: 8 }}>
            {brief}
          </div>
        )}
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            width: "100%", background: assessing ? "#001a2e" : "rgba(0,255,231,0.12)",
            border: "1px solid #00ffe7", color: "#00ffe7", borderRadius: 6,
            padding: "6px 0", fontSize: 12, cursor: assessing ? "default" : "pointer",
            fontFamily: "monospace", letterSpacing: 1,
          }}
        >
          {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
        </button>
      </div>
    </div>
  );
}
