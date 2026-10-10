/**
 * GraphReportsNexus — F582
 * "JARVIS, graph reports / reports graph / grrpt / reported nodes / unreported nodes / node report coverage"
 * Cross-references /v1/graph/centrality (top influential nodes) + /v1/reports.
 * Finds DOCUMENTED nodes (≥1 report keyword-matches) vs UNREPORTED (no report backing).
 * Coverage % tile; ALL/DOCUMENTED/UNREPORTED filter tabs + search; click-to-expand matched reports.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence graph-reporting intelligence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 70_260;
const Z_INDEX  = 140;

const GRRPT_RE =
  /\bgrrpt\b|\bgraph.?reports?\b|\breports?.?graph\b|\breported.?nodes?\b|\bunreported.?nodes?\b|\bnode.?report.?coverage\b|\bgraph.?reporting\b|\bnode.?report\b|\bgraph.?report.?coverage\b/i;

export function isGrrptQuery(text) {
  return GRRPT_RE.test(text || "");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseNodes(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.nodes)            ? raw.nodes
    : Array.isArray(raw?.results)          ? raw.results
    : Array.isArray(raw?.centrality)       ? raw.centrality
    : [];
  return arr.map((n, i) => ({
    id:          n.id          || n.node_id   || String(i),
    label:       n.label       || n.name      || n.entity || `Node ${i + 1}`,
    score:       n.score       ?? n.centrality_score ?? n.weight ?? 0,
    kind:        (n.kind       || n.type      || n.entity_type || "NODE").toString().toUpperCase(),
    description: (n.description || n.summary  || "").toString().slice(0, 300),
    tags:        Array.isArray(n.tags) ? n.tags.join(" ") : (n.tags || ""),
  }));
}

function normaliseReports(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.reports)          ? raw.reports
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : [];
  return arr.map((r, i) => ({
    id:      r.id     || r.report_id || String(i),
    title:   r.title  || r.name      || `Report ${i + 1}`,
    type:    (r.type  || r.category  || r.kind || "REPORT").toString().toUpperCase(),
    author:  r.author || r.owner     || "",
    summary: (r.summary || r.description || r.content || "").toString().slice(0, 200),
    tags:    Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags || ""),
  }));
}

function crossRef(nodes, reports) {
  return nodes.map((node) => {
    const haystack = `${node.label} ${node.description} ${node.tags} ${node.kind}`;
    const matches = reports
      .map((rpt) => ({
        rpt,
        hits: overlap(haystack, `${rpt.title} ${rpt.summary} ${rpt.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...node,
      documented: matches.length > 0,
      matches: matches.map(({ rpt, hits }) => ({ ...rpt, hits })),
    };
  });
}

// ─── buildGrrptScript (for JarvisBrain) ──────────────────────────────────────

export async function buildGrrptScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [nodeRes, rptRes] = await Promise.all([
      fetch(`${base}/v1/graph/centrality`, { headers: hdr }),
      fetch(`${base}/v1/reports`,          { headers: hdr }),
    ]);
    const nodeData = nodeRes.ok ? await nodeRes.json() : {};
    const rptData  = rptRes.ok  ? await rptRes.json()  : {};

    const nodes   = normaliseNodes(nodeData);
    const reports = normaliseReports(rptData);
    const crossed = crossRef(nodes, reports);

    const total      = crossed.length;
    const documented = crossed.filter((n) => n.documented).length;
    const unreported = total - documented;
    const coverage   = total > 0 ? Math.round((documented / total) * 100) : 0;
    const topDark    = crossed
      .filter((n) => !n.documented)
      .slice(0, 2)
      .map((n) => n.label)
      .join(", ");

    const brief =
      `${coverage}% of ${total} top graph nodes have formal report coverage. ` +
      `${documented} DOCUMENTED, ${unreported} UNREPORTED.` +
      (topDark ? ` Top undocumented nodes: ${topDark}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Graph × Reports Nexus: ${brief} Provide a 2-sentence graph-reporting intelligence assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Graph × Reports Nexus unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const TYPE_COLOR = {
  THREAT: "#FF4466",
  INTEL: "#FF6B35",
  OPS: CY,
  KNOWLEDGE: GRN,
};

export default function GraphReportsNexus() {
  const [open, setOpen]         = useState(false);
  const [nodes, setNodes]       = useState([]);
  const [reports, setReports]   = useState([]);
  const [crossed, setCrossed]   = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [query, setQuery]       = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssess]  = useState(false);
  const [brief, setBrief]       = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [nodeRes, rptRes] = await Promise.all([
        fetch(`${base}/v1/graph/centrality`, { headers: hdr }),
        fetch(`${base}/v1/reports`,          { headers: hdr }),
      ]);
      const nodeData = nodeRes.ok ? await nodeRes.json() : {};
      const rptData  = rptRes.ok  ? await rptRes.json()  : {};

      const ns = normaliseNodes(nodeData);
      const rs = normaliseReports(rptData);
      setNodes(ns);
      setReports(rs);
      setCrossed(crossRef(ns, rs));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => {
      if (!v) load();
      return !v;
    });
    window.addEventListener("jarvis:grrpt-toggle", onToggle);
    return () => window.removeEventListener("jarvis:grrpt-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssess(true);
    setBrief("");
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const total      = crossed.length;
      const documented = crossed.filter((n) => n.documented).length;
      const unreported = total - documented;
      const coverage   = total > 0 ? Math.round((documented / total) * 100) : 0;
      const prompt = `Graph × Reports: ${coverage}% report coverage (${documented}/${total} nodes documented, ${unreported} unreported). Assess reporting posture for influential graph entities in 2 sentences.`;
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const d = res.ok ? await res.json() : {};
      const text = d.response || d.message || d.reply || "Assessment complete.";
      setBrief(text);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "onyx" }),
      });
    } catch (e) {
      setBrief(`Assessment error: ${e.message}`);
    } finally {
      setAssess(false);
    }
  }, [crossed]);

  const visible = crossed.filter((node) => {
    if (tab === "DOCUMENTED"  && !node.documented) return false;
    if (tab === "UNREPORTED"  &&  node.documented) return false;
    if (query) {
      const q = query.toLowerCase();
      if (
        !node.label.toLowerCase().includes(q) &&
        !node.kind.toLowerCase().includes(q) &&
        !node.description.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const total      = crossed.length;
  const nDoc       = crossed.filter((n) => n.documented).length;
  const nUnrep     = total - nDoc;
  const coverage   = total > 0 ? Math.round((nDoc / total) * 100) : 0;

  const btnStyle = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: Z_INDEX,
    background: "rgba(0,0,0,0.85)",
    border: `1px solid ${CY}`,
    color: CY,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "2px 7px",
    cursor: "pointer",
    borderRadius: 3,
    userSelect: "none",
    display: "flex",
    alignItems: "center",
    gap: 4,
  };

  const panelStyle = {
    position: "fixed",
    right: 18,
    bottom: 54,
    width: 460,
    maxHeight: "78vh",
    overflowY: "auto",
    background: "rgba(0,6,18,0.97)",
    border: `1px solid ${CY}44`,
    borderRadius: 8,
    padding: 16,
    zIndex: 9999,
    fontFamily: "monospace",
    color: CY,
    boxSizing: "border-box",
  };

  return (
    <>
      <button
        style={btnStyle}
        onClick={() => { setOpen((v) => { if (!v) load(); return !v; }); }}
        title="Graph × Reports Nexus"
      >
        ◈ GRRPT
        {nUnrep > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 8, padding: "0 4px", fontSize: 9 }}>
            {nUnrep}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>GRAPH × REPORTS NEXUS</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={load}
                style={{ background: "none", border: `1px solid ${CY}55`, color: CY, cursor: "pointer", padding: "2px 8px", borderRadius: 3, fontSize: 10 }}
                title="Refresh"
              >
                ↺
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[
              { label: "COVERAGE",    value: `${coverage}%`, color: coverage > 60 ? GRN : coverage > 30 ? AMB : "#FF4466" },
              { label: "DOCUMENTED",  value: nDoc,           color: GRN },
              { label: "UNREPORTED",  value: nUnrep,         color: AMB },
              { label: "REPORTS",     value: reports.length, color: CY },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  flex: 1, background: "rgba(41,231,255,0.05)", border: `1px solid ${color}33`,
                  borderRadius: 4, padding: "6px 8px", textAlign: "center",
                }}
              >
                <div style={{ fontSize: 16, fontWeight: "bold", color }}>{value}</div>
                <div style={{ fontSize: 8, color: DIM, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assess */}
          <div style={{ marginBottom: 10 }}>
            <button
              onClick={assess}
              disabled={assessing || crossed.length === 0}
              style={{
                background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.15)",
                border: `1px solid ${CY}88`,
                color: CY, cursor: assessing ? "wait" : "pointer",
                padding: "4px 14px", borderRadius: 3, fontSize: 10, fontFamily: "monospace",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, fontSize: 10, color: "#cde", lineHeight: 1.5, padding: "6px 8px", background: "rgba(41,231,255,0.05)", borderRadius: 3 }}>
                {brief}
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {["ALL", "DOCUMENTED", "UNREPORTED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "none",
                  border: `1px solid ${tab === t ? CY : CY + "33"}`,
                  color: tab === t ? CY : DIM,
                  cursor: "pointer", padding: "2px 10px", borderRadius: 3,
                  fontSize: 10, fontFamily: "monospace",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search graph nodes…"
            style={{
              width: "100%", background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}33`,
              color: CY, padding: "4px 8px", borderRadius: 3, fontSize: 10,
              marginBottom: 8, boxSizing: "border-box", fontFamily: "monospace",
            }}
          />

          {/* Node rows */}
          {loading ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>No nodes match.</div>
          ) : (
            visible.map((node) => (
              <div key={node.id}>
                <div
                  onClick={() => setExpanded(expanded === node.id ? null : node.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 6px", marginBottom: 3, cursor: "pointer",
                    borderRadius: 3, background: "rgba(41,231,255,0.04)",
                    border: `1px solid ${node.documented ? GRN + "44" : DIM + "22"}`,
                  }}
                >
                  <span style={{
                    fontSize: 8, padding: "1px 4px", borderRadius: 2,
                    background: "rgba(41,231,255,0.1)",
                    color: CY,
                    minWidth: 44, textAlign: "center",
                  }}>
                    {node.kind.slice(0, 8)}
                  </span>
                  <span style={{ flex: 1, fontSize: 10, color: node.documented ? GRN : DIM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {node.label}
                  </span>
                  <span style={{ fontSize: 8, color: DIM }}>
                    {typeof node.score === "number" ? node.score.toFixed(3) : ""}
                  </span>
                  {node.documented ? (
                    <span style={{ fontSize: 8, color: GRN }}>⬡ {node.matches.length} rpt</span>
                  ) : (
                    <span style={{ fontSize: 8, color: AMB }}>UNREP</span>
                  )}
                </div>

                {/* Expanded matched reports */}
                {expanded === node.id && node.documented && (
                  <div style={{ marginLeft: 12, marginBottom: 6 }}>
                    {node.description && (
                      <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>{node.description.slice(0, 120)}</div>
                    )}
                    {node.matches.map((rpt) => (
                      <div
                        key={rpt.id}
                        style={{
                          padding: "3px 6px", marginBottom: 2, borderRadius: 2,
                          background: "rgba(0,229,160,0.05)", border: `1px solid ${GRN}33`,
                          fontSize: 9,
                        }}
                      >
                        <span style={{ color: GRN }}>{rpt.title}</span>
                        <span style={{ color: TYPE_COLOR[rpt.type] || CY, marginLeft: 4, fontSize: 8 }}>[{rpt.type}]</span>
                        {rpt.author && <span style={{ color: DIM, marginLeft: 4 }}>by {rpt.author}</span>}
                        <span style={{ color: DIM, marginLeft: 6 }}>hits:{rpt.hits}</span>
                      </div>
                    ))}
                  </div>
                )}

                {expanded === node.id && !node.documented && (
                  <div style={{ marginLeft: 12, marginBottom: 6, fontSize: 9, color: DIM }}>
                    No reports correlate with this graph node.
                    {node.description && <div style={{ marginTop: 2 }}>{node.description.slice(0, 120)}</div>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
