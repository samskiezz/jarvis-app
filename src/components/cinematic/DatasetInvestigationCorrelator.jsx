/**
 * F60 — Dataset-Investigation Correlator.
 *
 * Parallel-fetches /v1/datasets + /v1/investigations.
 * Keyword-correlates each investigation (title/description/subject) against
 * dataset names and descriptions to surface which investigations have real
 * dataset backing (COVERED) and which are operating data-dark (UNCOVERED).
 *
 * Stat tiles: datasets / investigations / covered / uncovered
 * Filter tabs: ALL / COVERED / UNCOVERED
 * Expand any investigation → list its matched datasets with a relevance score.
 * Click ▶ ASSESS on any investigation → /v1/jarvis/agent/chat AI 2-sentence
 *   dataset-coverage assessment + TTS via jarvis:speak-dossier.
 * 90 s auto-refresh.
 *
 * Intent: "dataset investigation" / "datasets driving cases" / "data case gap" /
 *         "which datasets support" / "dsinv" / "data dark" / "dataset case"
 *   → jarvis:dsinv-toggle + TTS brief via buildDsInvCorrScript()
 *
 * Toggle: ◈ DSINV at left:7980, bottom:8, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const RED    = "#FF3D5A";
const PURPLE = "#A78BFA";
const BTN_LEFT   = 7980;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseDatasets(raw) {
  return normaliseArray(raw).map((d) => ({
    id:          d.id || d.dataset_id || String(Math.random()),
    name:        d.name || d.dataset_name || d.title || "Unnamed Dataset",
    description: d.description || d.summary || d.details || "",
    type:        d.type || d.category || d.dataset_type || "",
    rows:        d.row_count ?? d.rows ?? d.record_count ?? null,
    updated:     d.updated_at || d.last_updated || d.modified_at || "",
    tags:        [...(d.tags || []), ...(d.keywords || [])].map(String),
  }));
}

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((inv) => ({
    id:          inv.id || inv.case_id || String(Math.random()),
    title:       inv.title || inv.name || inv.case_name || "Unnamed Case",
    description: inv.description || inv.summary || inv.details || "",
    status:      (inv.status || "open").toLowerCase(),
    priority:    inv.priority || inv.severity || "",
    subject:     inv.subject || inv.target || "",
    lead:        inv.lead || inv.assigned_to || inv.investigator || "",
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function invMatchScore(inv, ds) {
  const invText = `${inv.title} ${inv.description} ${inv.subject}`.toLowerCase();
  const dsWords = [
    ...tokens(ds.name),
    ...tokens(ds.description),
    ...tokens(ds.type),
    ...ds.tags.flatMap(tokens),
  ];
  return dsWords.reduce((acc, w) => acc + (invText.includes(w) ? 1 : 0), 0);
}

function correlate(investigations, datasets) {
  return investigations.map((inv) => {
    const matched = datasets
      .map((ds) => ({ ...ds, _score: invMatchScore(inv, ds) }))
      .filter((ds) => ds._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 6);
    return { ...inv, matched };
  });
}

function priorityColor(p) {
  if (!p) return "#445566";
  const s = String(p).toLowerCase();
  if (s === "critical" || s === "urgent") return RED;
  if (s === "high")     return AMBER;
  if (s === "medium")   return CY;
  return "#445566";
}

function statusColor(s) {
  if (s === "open")                               return RED;
  if (s === "in-progress" || s === "in_progress") return AMBER;
  if (s === "pending")                            return PURPLE;
  return "#445566";
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const DSINV_RE =
  /\b(dataset[\s-]?invest|invest[\s-]?dataset|data[\s-]?case|case[\s-]?data|dsinv\b|datasets?\s+driv|datasets?\s+support|data[\s-]?dark|which\s+datasets?\s+support|dataset[\s-]?case[\s-]?gap|investigation\s+data)\b/i;

export function isDsInvCorrQuery(q) {
  return DSINV_RE.test(q || "");
}

export async function buildDsInvCorrScript() {
  try {
    const [dsRaw, invRaw] = await Promise.all([
      fetch(`${apiBase()}/v1/datasets`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/v1/investigations`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const datasets       = normaliseDatasets(dsRaw);
    const investigations = normaliseInvestigations(invRaw);
    const correlated     = correlate(investigations, datasets);
    const covered        = correlated.filter((inv) => inv.matched.length > 0);
    const uncovered      = correlated.filter((inv) => inv.matched.length === 0);
    const openUncov      = uncovered.filter((inv) => inv.status === "open");
    return (
      `Dataset-investigation correlator active, sir. ` +
      `${datasets.length} dataset${datasets.length !== 1 ? "s" : ""} cross-referenced against ` +
      `${investigations.length} investigation${investigations.length !== 1 ? "s" : ""}. ` +
      `${covered.length} ${covered.length !== 1 ? "cases have" : "case has"} dataset backing. ` +
      `${uncovered.length} ${uncovered.length !== 1 ? "cases are" : "case is"} operating data-dark` +
      (openUncov.length > 0 ? ` — including ${openUncov.length} open case${openUncov.length !== 1 ? "s" : ""}` : "") +
      `. Select a case to assess its data coverage.`
    );
  } catch (_) {
    return "Dataset-investigation correlator is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function DatasetInvestigationCorrelator() {
  const [visible, setVisible]         = useState(false);
  const [datasets, setDatasets]       = useState([]);
  const [investigations, setInvs]     = useState([]);
  const [loading, setLoading]         = useState(false);
  const [tab, setTab]                 = useState("UNCOVERED");
  const [expanded, setExpanded]       = useState(null);
  const [assessing, setAssessing]     = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [dsRaw, invRaw] = await Promise.all([
        fetch(`${apiBase()}/v1/datasets`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/v1/investigations`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setDatasets(normaliseDatasets(dsRaw));
      setInvs(normaliseInvestigations(invRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:dsinv-toggle", onToggle);
    return () => window.removeEventListener("jarvis:dsinv-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessInvestigation(inv) {
    setAssessing(inv.id);
    const dsList = inv.matched.map((ds) => `"${ds.name}"`).join(", ");
    const prompt =
      `As JARVIS, provide a 2-sentence assessment of whether the available datasets adequately support ` +
      `the investigation "${inv.title}" (status: ${inv.status}). ` +
      `Matched datasets: ${dsList || "none"}. ` +
      `Focus on whether there are data coverage gaps or whether the matched datasets are sufficient.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient data to assess dataset coverage for this investigation, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Assessment unavailable at this time, sir." },
      }));
    }
    setAssessing(null);
  }

  const correlated = correlate(investigations, datasets);
  const covered    = correlated.filter((inv) => inv.matched.length > 0);
  const uncovered  = correlated.filter((inv) => inv.matched.length === 0);
  const openUncov  = uncovered.filter((inv) => inv.status === "open");

  const displayed =
    tab === "ALL"       ? correlated :
    tab === "COVERED"   ? covered    : uncovered;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Dataset-Investigation Correlator (F60)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 65,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : `${CY}44`}`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ DSINV
        {openUncov.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{openUncov.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: Math.max(8, BTN_LEFT - 280), zIndex: 65,
          width: 580, maxHeight: "70vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◈ DATASET-INVESTIGATION CORRELATOR</span>
            <button onClick={fetchData} style={{
              marginLeft: "auto", background: "transparent",
              border: `1px solid ${CY}33`, borderRadius: 3,
              color: `${CY}88`, padding: "2px 6px", fontSize: 7,
              cursor: "pointer", letterSpacing: 1,
            }}>↻ REFRESH</button>
            <button onClick={() => setVisible(false)} style={{
              background: "transparent", border: "none",
              color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["DATASETS",    datasets.length,       CY],
              ["CASES",       investigations.length,  PURPLE],
              ["DATA-BACKED", covered.length,         GREEN],
              ["DATA-DARK",   uncovered.length,       uncovered.length > 0 ? AMBER : "#445566"],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : val}</div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {["ALL", "COVERED", "UNCOVERED"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${CY}22` : "transparent",
                border: `1px solid ${tab === t ? CY : "#1e3040"}`,
                color: tab === t ? CY : "#445566",
                borderRadius: 4, padding: "3px 10px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Investigation rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating investigations against datasets…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "UNCOVERED" ? "All investigations have dataset backing." : "No investigations in this filter."}
            </div>
          ) : (
            displayed.map((inv) => {
              const sc        = statusColor(inv.status);
              const pc        = priorityColor(inv.priority);
              const isOpen    = expanded === inv.id;
              const hasCoverage = inv.matched.length > 0;
              return (
                <div key={inv.id} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${isOpen ? `${CY}44` : "#1a2530"}`,
                  borderLeft: `3px solid ${hasCoverage ? GREEN : AMBER}`,
                  borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                  cursor: "pointer",
                }} onClick={() => setExpanded(isOpen ? null : inv.id)}>
                  {/* Investigation header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 7, color: sc, border: `1px solid ${sc}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                      whiteSpace: "nowrap", textTransform: "uppercase",
                    }}>{inv.status}</span>
                    {inv.priority && (
                      <span style={{
                        fontSize: 7, color: pc, border: `1px solid ${pc}55`,
                        borderRadius: 3, padding: "1px 5px", letterSpacing: 1, whiteSpace: "nowrap",
                      }}>{String(inv.priority).toUpperCase()}</span>
                    )}
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{inv.title}</span>
                    <span style={{
                      fontSize: 7, whiteSpace: "nowrap",
                      color: hasCoverage ? GREEN : AMBER,
                    }}>
                      {hasCoverage
                        ? `${inv.matched.length} dataset${inv.matched.length !== 1 ? "s" : ""}`
                        : "⚠ DATA-DARK"}
                    </span>
                  </div>

                  {inv.description && (
                    <div style={{ color: "#556677", fontSize: 8, lineHeight: 1.4, marginBottom: 4 }}>
                      {inv.description.slice(0, 120)}{inv.description.length > 120 ? "…" : ""}
                    </div>
                  )}

                  {/* Assess button */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {inv.lead && (
                      <span style={{ fontSize: 7, color: "#334455", flex: 1 }}>
                        Lead: {inv.lead}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); assessInvestigation(inv); }}
                      disabled={assessing === inv.id}
                      style={{
                        marginLeft: "auto",
                        background: assessing === inv.id ? "#1a2530" : `${CY}18`,
                        color: assessing === inv.id ? "#445566" : CY,
                        border: `1px solid ${CY}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1, cursor: assessing === inv.id ? "default" : "pointer",
                      }}
                    >{assessing === inv.id ? "…assessing" : "▶ ASSESS"}</button>
                  </div>

                  {/* Expanded dataset list */}
                  {isOpen && hasCoverage && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}18` }}>
                      {inv.matched.map((ds) => (
                        <div key={ds.id} style={{
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid #1e3040",
                          borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                          display: "flex", alignItems: "flex-start", gap: 8,
                        }}>
                          {ds.type && (
                            <span style={{
                              fontSize: 7, color: PURPLE, border: "1px solid #A78BFA44",
                              borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                              textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0,
                            }}>{ds.type}</span>
                          )}
                          <div style={{ flex: 1 }}>
                            <div style={{ color: "#a0b8cc", fontSize: 10 }}>{ds.name}</div>
                            {ds.description && (
                              <div style={{ color: "#445566", fontSize: 8, marginTop: 1 }}>
                                {ds.description.slice(0, 80)}{ds.description.length > 80 ? "…" : ""}
                              </div>
                            )}
                            {ds.rows != null && (
                              <div style={{ color: "#334455", fontSize: 7, marginTop: 2 }}>
                                {ds.rows.toLocaleString()} rows
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: 7, color: `${CY}66`, whiteSpace: "nowrap" }}>
                            score {ds._score}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isOpen && !hasCoverage && (
                    <div style={{
                      marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a2530",
                      color: AMBER, fontSize: 8,
                    }}>
                      ⚠ No dataset coverage found for this investigation.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /v1/datasets + /v1/investigations · 90 s auto-refresh · ▶ ASSESS for AI data-coverage brief
          </div>
        </div>
      )}
    </>
  );
}
