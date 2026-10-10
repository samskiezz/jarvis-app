/**
 * F131 — Contact × Ops Event × Graph Annotation
 *         Incident Attribution Network (COEGAN)
 *
 * Parallel-fetches:
 *   /entities/Contact         → known persons/organisations
 *   /v1/ops/events            → live operational events
 *   /v1/graph/annotations     → graph knowledge annotations
 *
 * Keyword-correlates each contact (name/role/org/tags) against ops events
 * AND graph annotations to classify:
 *   FULLY_ATTRIBUTED  — matched both ops event AND graph annotation
 *   OPS_LINKED        — matched ops event only
 *   GRAPH_TAGGED      — matched graph annotation only
 *   UNATTRIBUTED      — no match (attribution gap)
 *
 * Amber badge on unattributed count.
 * ▶ ASSESS ATTRIBUTION → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh.  jarvis:coegan-toggle event.
 * Voice: "coegan / contact attribution / incident attribution /
 *         contact ops graph / unattributed contacts / contact event attribution".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_016_280;
const Z_INDEX  = 193;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const COEGAN_RE =
  /\b(coegan|contact[\s-]attribution|incident[\s-]attribution|contact[\s-]ops[\s-]graph|unattributed[\s-]contacts?|contact[\s-]event[\s-]attribution)\b/i;

// ── colours ───────────────────────────────────────────────────────────────────
const CY     = "#00CFFF";
const AM     = "#F59E0B";
const BL     = "#3B82F6";
const PU     = "#A855F7";
const OR     = "#F97316";
const DIM    = "#6E8AA0";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

// ── exports for JarvisBrain ───────────────────────────────────────────────────
export function isCoeganQuery(text) {
  return COEGAN_RE.test(text || "");
}

export async function buildCoeganScript() {
  const base = apiBase();
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const [cRes, oRes, aRes] = await Promise.allSettled([
    fetch(`${base}/entities/Contact`,         { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/ops/events`,            { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/graph/annotations`,     { headers: hdr }).then(r => r.json()),
  ]);
  const contacts     = Array.isArray(cRes.value)    ? cRes.value
                     : Array.isArray(cRes.value?.data)    ? cRes.value.data    : [];
  const opsEvents    = Array.isArray(oRes.value)    ? oRes.value
                     : Array.isArray(oRes.value?.events)  ? oRes.value.events
                     : Array.isArray(oRes.value?.data)    ? oRes.value.data    : [];
  const annotations  = Array.isArray(aRes.value)    ? aRes.value
                     : Array.isArray(aRes.value?.annotations) ? aRes.value.annotations
                     : Array.isArray(aRes.value?.data)    ? aRes.value.data    : [];

  const unattributed = contacts.filter(c => {
    const terms = [c.name, c.role, c.org, ...(c.tags || [])].filter(Boolean).map(s => s.toLowerCase());
    const hasOps = opsEvents.some(e => {
      const t = `${e.title||""} ${e.description||""} ${e.type||""}`.toLowerCase();
      return terms.some(w => w.length > 3 && t.includes(w));
    });
    const hasAnn = annotations.some(a => {
      const t = `${a.label||""} ${a.content||""} ${a.text||""} ${a.note||""}`.toLowerCase();
      return terms.some(w => w.length > 3 && t.includes(w));
    });
    return !hasOps && !hasAnn;
  });

  return `COEGAN Incident Attribution Network online, sir. ${contacts.length} contacts cross-referenced against ${opsEvents.length} operational events and ${annotations.length} graph annotations. ${unattributed.length} contacts remain unattributed — zero operational or graph context linkage detected. Recommend prioritising attribution sweep for unlinked personnel.`;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function keywords(contact) {
  return [contact.name, contact.role, contact.org, ...(contact.tags || [])]
    .filter(Boolean)
    .map(s => s.toLowerCase())
    .filter(w => w.length > 3);
}

function relevance(terms, text) {
  const lo = text.toLowerCase();
  return terms.reduce((acc, w) => acc + (lo.includes(w) ? 1 : 0), 0);
}

function classify(contact, opsEvents, annotations) {
  const terms = keywords(contact);
  const matchedOps = opsEvents.filter(e => {
    const t = `${e.title||""} ${e.description||""} ${e.type||""} ${e.event_type||""}`.toLowerCase();
    return relevance(terms, t) > 0;
  });
  const matchedAnn = annotations.filter(a => {
    const t = `${a.label||""} ${a.content||""} ${a.text||""} ${a.note||""}`.toLowerCase();
    return relevance(terms, t) > 0;
  });
  const cls = matchedOps.length > 0 && matchedAnn.length > 0 ? "FULLY_ATTRIBUTED"
            : matchedOps.length > 0                           ? "OPS_LINKED"
            : matchedAnn.length > 0                           ? "GRAPH_TAGGED"
            :                                                   "UNATTRIBUTED";
  return { ...contact, cls, matchedOps, matchedAnn };
}

const CLS_COLOR = {
  FULLY_ATTRIBUTED: "#22C55E",
  OPS_LINKED:       BL,
  GRAPH_TAGGED:     PU,
  UNATTRIBUTED:     AM,
};

// ── component ─────────────────────────────────────────────────────────────────
export default function ContactOpsGraphAttributionNetwork() {
  const [open,       setOpen]       = useState(false);
  const [rows,       setRows]       = useState([]);
  const [opsEvents,  setOpsEvents]  = useState([]);
  const [annotations,setAnnotations]= useState([]);
  const [loading,    setLoading]    = useState(false);
  const [assessing,  setAssessing]  = useState(false);
  const [brief,      setBrief]      = useState("");
  const [filter,     setFilter]     = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [cRes, oRes, aRes] = await Promise.allSettled([
        fetch(`${base}/entities/Contact`,     { headers: hdr }).then(r => r.json()),
        fetch(`${base}/v1/ops/events`,        { headers: hdr }).then(r => r.json()),
        fetch(`${base}/v1/graph/annotations`, { headers: hdr }).then(r => r.json()),
      ]);
      const contacts    = Array.isArray(cRes.value)    ? cRes.value
                        : Array.isArray(cRes.value?.data)         ? cRes.value.data    : [];
      const ops         = Array.isArray(oRes.value)    ? oRes.value
                        : Array.isArray(oRes.value?.events)       ? oRes.value.events
                        : Array.isArray(oRes.value?.data)         ? oRes.value.data    : [];
      const anns        = Array.isArray(aRes.value)    ? aRes.value
                        : Array.isArray(aRes.value?.annotations)  ? aRes.value.annotations
                        : Array.isArray(aRes.value?.data)         ? aRes.value.data    : [];
      setOpsEvents(ops);
      setAnnotations(anns);
      setRows(contacts.map(c => classify(c, ops, anns)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:coegan-toggle", toggle);
    return () => window.removeEventListener("jarvis:coegan-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const hdr  = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const total       = rows.length;
      const fullyAttrib = rows.filter(r => r.cls === "FULLY_ATTRIBUTED").length;
      const opsLinked   = rows.filter(r => r.cls === "OPS_LINKED").length;
      const graphTagged = rows.filter(r => r.cls === "GRAPH_TAGGED").length;
      const unattrib    = rows.filter(r => r.cls === "UNATTRIBUTED").length;
      const prompt = `JARVIS incident attribution analysis: ${total} contacts checked — ${fullyAttrib} fully attributed (ops + graph), ${opsLinked} ops-linked only, ${graphTagged} graph-tagged only, ${unattrib} completely unattributed. ${opsEvents.length} ops events and ${annotations.length} graph annotations in scope. In two sentences assess the attribution coverage and identify the most critical gap.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      if (txt) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
      }
    } catch {
      setBrief("Attribution assessment unavailable — reasoning core unreachable.");
    } finally {
      setAssessing(false);
    }
  }, [rows, opsEvents.length, annotations.length]);

  if (!open) {
    const unattrib = rows.filter(r => r.cls === "UNATTRIBUTED").length;
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.82)", border: `1px solid ${BORDER}`,
          color: CY, fontFamily: FONT, fontSize: 10, padding: "3px 8px",
          cursor: "pointer", borderRadius: 3,
        }}
      >
        ◈ COEGAN{unattrib > 0 && <span style={{ color: AM, marginLeft: 4 }}>{unattrib}</span>}
      </button>
    );
  }

  const total       = rows.length;
  const fullyAttrib = rows.filter(r => r.cls === "FULLY_ATTRIBUTED").length;
  const opsLinked   = rows.filter(r => r.cls === "OPS_LINKED").length;
  const graphTagged = rows.filter(r => r.cls === "GRAPH_TAGGED").length;
  const unattrib    = rows.filter(r => r.cls === "UNATTRIBUTED").length;

  const TABS = ["ALL","FULLY_ATTRIBUTED","OPS_LINKED","GRAPH_TAGGED","UNATTRIBUTED"];
  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const lo = search.toLowerCase();
      return `${r.name||""} ${r.role||""} ${r.org||""}`.toLowerCase().includes(lo);
    }
    return true;
  });

  return (
    <div style={{
      position: "fixed", bottom: 56, right: 24, zIndex: Z_INDEX,
      width: 680, maxHeight: "80vh", background: BG,
      border: `1px solid ${BORDER}`, borderRadius: 8,
      fontFamily: FONT, color: CY, display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* header */}
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>
          ◈ COEGAN — Contact × Ops × Graph Attribution Network
          {loading && <span style={{ color: DIM, marginLeft: 8, fontWeight: 400 }}>loading…</span>}
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${BORDER}` }}>
        {[
          ["CONTACTS", total,       CY],
          ["ATTRIBUTED", fullyAttrib, "#22C55E"],
          ["OPS ONLY",  opsLinked,   BL],
          ["GRAPH ONLY",graphTagged, PU],
          ["UNATTRIB",  unattrib,    AM],
        ].map(([label, val, col]) => (
          <div key={label} style={{ flex: 1, background: "rgba(0,207,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 4, padding: "4px 6px", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 9, color: DIM }}>{label}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      <div style={{ padding: "4px 14px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 9, color: DIM, marginBottom: 2 }}>
          ATTRIBUTION COVERAGE {total ? Math.round(((fullyAttrib + opsLinked + graphTagged) / total) * 100) : 0}%
        </div>
        <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
          <div style={{
            height: "100%", borderRadius: 2,
            width: total ? `${Math.round(((fullyAttrib + opsLinked + graphTagged) / total) * 100)}%` : "0%",
            background: "linear-gradient(90deg,#22C55E,#00CFFF)",
          }} />
        </div>
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "6px 14px", borderBottom: `1px solid ${BORDER}`, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? CY : "rgba(0,207,255,0.08)",
            color: filter === t ? "#060B16" : CY,
            border: `1px solid ${BORDER}`, borderRadius: 3,
            fontFamily: FONT, fontSize: 9, padding: "2px 8px", cursor: "pointer",
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{
            marginLeft: "auto", background: "rgba(0,207,255,0.06)",
            border: `1px solid ${BORDER}`, borderRadius: 3,
            color: CY, fontFamily: FONT, fontSize: 10, padding: "2px 8px",
            width: 140, outline: "none",
          }}
        />
      </div>

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {visible.length === 0 && (
          <div style={{ padding: 20, color: DIM, fontSize: 11, textAlign: "center" }}>
            {loading ? "Loading contacts…" : "No contacts match current filter."}
          </div>
        )}
        {visible.map((row, i) => {
          const isExp = expanded === i;
          return (
            <div key={i} style={{ borderBottom: `1px solid rgba(0,207,255,0.07)` }}>
              <div
                onClick={() => setExpanded(isExp ? null : i)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", cursor: "pointer" }}
              >
                <span style={{ fontSize: 9, fontWeight: 700, color: CLS_COLOR[row.cls], minWidth: 110 }}>{row.cls}</span>
                <span style={{ flex: 1, fontSize: 11 }}>{row.name || "(unnamed)"}</span>
                {row.role && <span style={{ fontSize: 9, color: OR }}>{row.role}</span>}
                {row.org  && <span style={{ fontSize: 9, color: DIM }}>{row.org}</span>}
                <span style={{ fontSize: 9, color: BL }}>OPS:{row.matchedOps.length}</span>
                <span style={{ fontSize: 9, color: PU }}>ANN:{row.matchedAnn.length}</span>
                <span style={{ fontSize: 10, color: DIM }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "4px 14px 10px 14px" }}>
                  {row.matchedOps.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: BL, marginBottom: 3 }}>OPS EVENTS ({row.matchedOps.length})</div>
                      {row.matchedOps.slice(0, 4).map((e, j) => {
                        const terms = keywords(row);
                        const t     = `${e.title||""} ${e.description||""} ${e.type||""}`.toLowerCase();
                        const rel   = terms.length ? Math.min(100, Math.round((relevance(terms, t) / terms.length) * 100)) : 0;
                        return (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 9, color: BL, minWidth: 60 }}>{e.event_type || e.type || "EVENT"}</span>
                            <span style={{ flex: 1, fontSize: 10 }}>{e.title || e.description || "(no title)"}</span>
                            <div style={{ width: 60, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                              <div style={{ height: "100%", width: `${rel}%`, background: BL, borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedAnn.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: PU, marginBottom: 3 }}>GRAPH ANNOTATIONS ({row.matchedAnn.length})</div>
                      {row.matchedAnn.slice(0, 4).map((a, j) => {
                        const terms = keywords(row);
                        const t     = `${a.label||""} ${a.content||""} ${a.text||""} ${a.note||""}`.toLowerCase();
                        const rel   = terms.length ? Math.min(100, Math.round((relevance(terms, t) / terms.length) * 100)) : 0;
                        return (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 9, color: PU, minWidth: 60 }}>ANNOTATION</span>
                            <span style={{ flex: 1, fontSize: 10 }}>{a.label || a.text || a.content || "(no label)"}</span>
                            <div style={{ width: 60, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                              <div style={{ height: "100%", width: `${rel}%`, background: PU, borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedOps.length === 0 && row.matchedAnn.length === 0 && (
                    <div style={{ fontSize: 10, color: AM }}>No ops events or graph annotations attributed to this contact.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess button + brief */}
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}` }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? "rgba(0,207,255,0.1)" : "rgba(0,207,255,0.18)",
          border: `1px solid ${CY}`, color: CY, fontFamily: FONT,
          fontSize: 10, padding: "4px 12px", cursor: assessing ? "default" : "pointer",
          borderRadius: 3,
        }}>
          {assessing ? "ASSESSING…" : "▶ ASSESS ATTRIBUTION"}
        </button>
        {brief && (
          <div style={{ marginTop: 6, fontSize: 10, color: "#C0D8E8", lineHeight: 1.5 }}>{brief}</div>
        )}
      </div>
    </div>
  );
}
