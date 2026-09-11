/**
 * DatasetKnowledgeNexus — F520
 * "JARVIS, dataset knowledge / datkno / documented datasets / which datasets have documentation / dataset knowledge gap"
 * Cross-references /v1/datasets + /knowledge/.
 * Finds DOCUMENTED datasets (≥1 knowledge article keyword-matches the dataset name/description)
 * vs UNDOCUMENTED datasets (knowledge blind spots with no article support).
 * Coverage % tile; ALL/DOCUMENTED/UNDOCUMENTED filter tabs + search; click-to-expand matched articles.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
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
const BTN_LEFT = 36_720;
const Z_INDEX  = 101;

const DATKNO_RE =
  /\bdatkno\b|\bdataset.?knowledge\b|\bknowledge.?dataset\b|\bdocumented.?dataset\b|\bwhich.?datasets.?have.?doc\b|\bdataset.?knowledge.?gap\b|\bdataset.?article\b|\bknowledge.?backing.?dataset\b|\bundocumented.?dataset\b/i;

export function isDatknopQuery(text) {
  return DATKNO_RE.test(text || "");
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

function normaliseDatasets(data) {
  if (!data) return [];
  const raw =
    data.datasets || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((d, i) => ({
    id:          d.id || `ds-${i}`,
    name:        d.name || d.dataset_name || d.title || `Dataset ${i + 1}`,
    description: d.description || d.summary || d.schema || null,
    row_count:   d.row_count ?? d.rows ?? null,
    tags:        Array.isArray(d.tags) ? d.tags.join(" ") : String(d.tags || ""),
  }));
}

function normaliseArticles(data) {
  if (!data) return [];
  const raw =
    data.articles || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((a, i) => ({
    id:      a.id || `art-${i}`,
    title:   a.title || a.name || `Article ${i + 1}`,
    summary: a.summary || a.description || a.content || null,
    kind:    (a.kind || a.type || a.category || "KNOWLEDGE").toUpperCase(),
    tags:    Array.isArray(a.tags) ? a.tags.join(" ") : String(a.tags || ""),
  }));
}

function crossRef(datasets, articles) {
  return datasets.map((ds) => {
    const haystack = `${ds.name} ${ds.description || ""} ${ds.tags}`;
    const matches = articles
      .map((art) => ({
        art,
        hits: overlap(haystack, `${art.title} ${art.summary || ""} ${art.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...ds,
      documented: matches.length > 0,
      matches: matches.map(({ art, hits }) => ({ ...art, hits })),
    };
  });
}

// ─── buildDatknopScript (for JarvisBrain) ────────────────────────────────────

export async function buildDatknopScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [dsRes, artRes] = await Promise.all([
      fetch(`${base}/v1/datasets`, { headers: hdr }),
      fetch(`${base}/knowledge/`,  { headers: hdr }),
    ]);
    const dsData  = dsRes.ok  ? await dsRes.json()  : {};
    const artData = artRes.ok ? await artRes.json() : {};

    const datasets  = normaliseDatasets(dsData);
    const articles  = normaliseArticles(artData);
    const crossed   = crossRef(datasets, articles);

    const total      = crossed.length;
    const documented = crossed.filter((d) => d.documented).length;
    const undoc      = total - documented;
    const coverage   = total > 0 ? Math.round((documented / total) * 100) : 0;
    const topNames   = crossed
      .filter((d) => d.documented)
      .slice(0, 2)
      .map((d) => d.name)
      .join(", ");

    const brief =
      `${coverage}% of ${total} datasets have knowledge documentation. ` +
      `${documented} DOCUMENTED, ${undoc} UNDOCUMENTED.` +
      (topNames ? ` Top documented datasets: ${topNames}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Dataset × Knowledge Coverage: ${brief} Provide a 2-sentence data-intelligence assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Dataset × Knowledge Nexus unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const KIND_COLOR = {
  THREAT:    "#FF4466",
  INTEL:     "#FFA500",
  OPS:       "#29E7FF",
  RISK:      "#FF6B35",
  KNOWLEDGE: "#8899AA",
};

export default function DatasetKnowledgeNexus() {
  const [open, setOpen]         = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [articles, setArticles] = useState([]);
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
      const [dsRes, artRes] = await Promise.all([
        fetch(`${base}/v1/datasets`, { headers: hdr }),
        fetch(`${base}/knowledge/`,  { headers: hdr }),
      ]);
      const dsData  = dsRes.ok  ? await dsRes.json()  : {};
      const artData = artRes.ok ? await artRes.json() : {};
      const dsets = normaliseDatasets(dsData);
      const arts  = normaliseArticles(artData);
      setDatasets(dsets);
      setArticles(arts);
      setCrossed(crossRef(dsets, arts));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () =>
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    window.addEventListener("jarvis:datkno-toggle", onToggle);
    return () => window.removeEventListener("jarvis:datkno-toggle", onToggle);
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
      const documented = crossed.filter((d) => d.documented).length;
      const undoc      = total - documented;
      const coverage   = total > 0 ? Math.round((documented / total) * 100) : 0;
      const prompt = `Dataset × Knowledge Coverage: ${coverage}% coverage (${documented}/${total} documented, ${undoc} undocumented data blind spots). Assess in 2 sentences.`;
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

  const visible = crossed.filter((ds) => {
    if (tab === "DOCUMENTED"   && !ds.documented) return false;
    if (tab === "UNDOCUMENTED" &&  ds.documented) return false;
    if (query) {
      const q = query.toLowerCase();
      if (
        !ds.name.toLowerCase().includes(q) &&
        !(ds.description || "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const total    = crossed.length;
  const nDoc     = crossed.filter((d) => d.documented).length;
  const nUndoc   = total - nDoc;
  const coverage = total > 0 ? Math.round((nDoc / total) * 100) : 0;

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
        onClick={() => setOpen((v) => { if (!v) load(); return !v; })}
        title="Dataset × Knowledge Nexus"
      >
        ◈ DATKNO
        {nUndoc > 0 && (
          <span
            style={{
              background: AMB,
              color: "#000",
              borderRadius: 8,
              padding: "0 4px",
              fontSize: 9,
            }}
          >
            {nUndoc}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>
              DATASET × KNOWLEDGE NEXUS
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={load}
                style={{
                  background: "none",
                  border: `1px solid ${CY}55`,
                  color: CY,
                  cursor: "pointer",
                  padding: "2px 8px",
                  borderRadius: 3,
                  fontSize: 10,
                }}
                title="Refresh"
              >
                ↺
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: DIM,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[
              {
                label: "COVERAGE",
                value: `${coverage}%`,
                color: coverage > 60 ? GRN : coverage > 30 ? AMB : "#FF4466",
              },
              { label: "DOCUMENTED",   value: nDoc,           color: GRN },
              { label: "UNDOCUMENTED", value: nUndoc,         color: AMB },
              { label: "ARTICLES",     value: articles.length, color: CY },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  background: "rgba(41,231,255,0.05)",
                  border: `1px solid ${color}33`,
                  borderRadius: 4,
                  padding: "6px 8px",
                  textAlign: "center",
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
                background: assessing
                  ? "rgba(41,231,255,0.1)"
                  : "rgba(41,231,255,0.15)",
                border: `1px solid ${CY}88`,
                color: CY,
                cursor: assessing ? "wait" : "pointer",
                padding: "4px 14px",
                borderRadius: 3,
                fontSize: 10,
                fontFamily: "monospace",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 10,
                  color: "#cde",
                  lineHeight: 1.5,
                  padding: "6px 8px",
                  background: "rgba(41,231,255,0.05)",
                  borderRadius: 3,
                }}
              >
                {brief}
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {["ALL", "DOCUMENTED", "UNDOCUMENTED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "none",
                  border: `1px solid ${tab === t ? CY : CY + "33"}`,
                  color: tab === t ? CY : DIM,
                  cursor: "pointer",
                  padding: "2px 10px",
                  borderRadius: 3,
                  fontSize: 10,
                  fontFamily: "monospace",
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
            placeholder="Search datasets…"
            style={{
              width: "100%",
              background: "rgba(41,231,255,0.06)",
              border: `1px solid ${CY}33`,
              color: CY,
              padding: "4px 8px",
              borderRadius: 3,
              fontSize: 10,
              marginBottom: 8,
              boxSizing: "border-box",
              fontFamily: "monospace",
            }}
          />

          {/* Dataset rows */}
          {loading ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
              Loading…
            </div>
          ) : visible.length === 0 ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
              No datasets match.
            </div>
          ) : (
            visible.map((ds) => (
              <div key={ds.id}>
                <div
                  onClick={() => setExpanded(expanded === ds.id ? null : ds.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 6px",
                    marginBottom: 3,
                    cursor: "pointer",
                    borderRadius: 3,
                    background: "rgba(41,231,255,0.04)",
                    border: `1px solid ${ds.documented ? GRN + "44" : DIM + "22"}`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: ds.documented ? GRN : DIM,
                      minWidth: 78,
                    }}
                  >
                    {ds.documented ? "DOCUMENTED" : "UNDOCUMENTED"}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 10,
                      color: ds.documented ? GRN : DIM,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {ds.name}
                  </span>
                  {ds.row_count != null && (
                    <span style={{ fontSize: 8, color: DIM }}>
                      {ds.row_count.toLocaleString()} rows
                    </span>
                  )}
                  {ds.documented && (
                    <span style={{ fontSize: 8, color: GRN }}>
                      ⬡ {ds.matches.length} art
                    </span>
                  )}
                </div>

                {/* Expanded matched articles */}
                {expanded === ds.id && ds.documented && (
                  <div style={{ marginLeft: 12, marginBottom: 6 }}>
                    {ds.description && (
                      <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>
                        {ds.description.slice(0, 120)}
                        {ds.description.length > 120 ? "…" : ""}
                      </div>
                    )}
                    {ds.matches.map((art) => (
                      <div
                        key={art.id}
                        style={{
                          padding: "3px 6px",
                          marginBottom: 2,
                          borderRadius: 2,
                          background: "rgba(0,229,160,0.05)",
                          border: `1px solid ${KIND_COLOR[art.kind] || DIM}33`,
                          fontSize: 9,
                        }}
                      >
                        <span
                          style={{
                            color: KIND_COLOR[art.kind] || DIM,
                            marginRight: 4,
                          }}
                        >
                          [{art.kind}]
                        </span>
                        <span style={{ color: GRN }}>{art.title}</span>
                        <span style={{ color: DIM, marginLeft: 6 }}>
                          hits:{art.hits}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {expanded === ds.id && !ds.documented && (
                  <div
                    style={{
                      marginLeft: 12,
                      marginBottom: 6,
                      fontSize: 9,
                      color: DIM,
                    }}
                  >
                    No knowledge articles reference this dataset.
                    {ds.description && (
                      <div style={{ marginTop: 2 }}>
                        {ds.description.slice(0, 120)}
                        {ds.description.length > 120 ? "…" : ""}
                      </div>
                    )}
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
