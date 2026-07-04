/**
 * InvestmentDatasetCorrelator — F139.
 *
 * Parallel-fetches /entities/Investment + /v1/datasets then keyword-correlates
 * each holding against the dataset catalog to surface DATA-BACKED investments
 * (empirical monitoring exists) vs DATA-DARK (no dataset coverage —
 * surveillance blind spot).
 *
 * Stat tiles: investments / datasets / backed / dark
 * Filter tabs: ALL / DATA-BACKED / DATA-DARK
 * Expand holding → matched datasets with row-count badge + type badge + score.
 * Click ▶ ASSESS → /v1/jarvis/agent/chat AI portfolio-data brief
 *   + jarvis:speak-dossier TTS.
 * 90 s auto-refresh.
 *
 * Intent: "investment dataset" / "portfolio data" / "data-backed investments" /
 *         "investment data coverage" / "invds"
 *   → jarvis:invds-toggle + TTS brief via buildInvdsScript()
 *
 * Toggle: ◈ INVDS at left:44680, bottom:8, zIndex 91.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const PURPLE = "#A78BFA";
const BTN_LEFT   = 44680;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseInvestments(raw) {
  return normaliseArray(raw).map((i) => ({
    id:          i.id || i.investment_id || String(Math.random()),
    name:        i.name || i.title || i.asset || i.holding || "Unnamed Holding",
    type:        i.type || i.asset_type || i.category || "",
    sector:      i.sector || i.industry || "",
    description: i.description || i.notes || i.overview || "",
    ticker:      i.ticker || i.symbol || i.code || "",
    tags:        [...(i.tags || []), ...(i.labels || [])].map(String),
  }));
}

function normaliseDatasets(raw) {
  return normaliseArray(raw).map((d) => ({
    id:          d.id || d.dataset_id || String(Math.random()),
    name:        d.name || d.title || d.dataset_name || "Unnamed Dataset",
    description: d.description || d.summary || d.overview || "",
    type:        d.type || d.category || d.dataset_type || "",
    rowCount:    d.row_count ?? d.rows ?? d.count ?? d.records ?? null,
    tags:        [...(d.tags || []), ...(d.keywords || [])].map(String),
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(inv, ds) {
  const dsText = `${ds.name} ${ds.description} ${ds.tags.join(" ")}`.toLowerCase();
  const words = [
    ...tokens(inv.name),
    ...tokens(inv.type),
    ...tokens(inv.sector),
    ...tokens(inv.description),
    ...tokens(inv.ticker),
    ...inv.tags.flatMap(tokens),
  ];
  return words.reduce((acc, w) => acc + (dsText.includes(w) ? 1 : 0), 0);
}

function correlate(investments, datasets) {
  return investments.map((inv) => {
    const matched = datasets
      .map((d) => ({ ...d, _score: matchScore(inv, d) }))
      .filter((d) => d._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...inv, matched };
  });
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const INVDS_RE =
  /investment[\s-]?dataset|portfolio[\s-]?data(?:set)?|data[\s-]?backed[\s-]?invest(?:ment)?s?|investment[\s-]?data[\s-]?coverage|invds\b/i;

export function isInvdsQuery(q) {
  return INVDS_RE.test(q || "");
}

export async function buildInvdsScript() {
  try {
    const [invRaw, dsRaw] = await Promise.all([
      fetch(`${apiBase()}/entities/Investment?limit=100`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/v1/datasets?limit=100`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const investments = normaliseInvestments(invRaw);
    const datasets    = normaliseDatasets(dsRaw);
    const corr        = correlate(investments, datasets);
    const backed      = corr.filter((i) => i.matched.length > 0);
    const dark        = corr.filter((i) => i.matched.length === 0);
    return `Investment dataset correlator active, sir. ${investments.length} holding${investments.length !== 1 ? "s" : ""} cross-referenced against ${datasets.length} dataset${datasets.length !== 1 ? "s" : ""}. ${backed.length} holding${backed.length !== 1 ? "s have" : " has"} empirical dataset backing. ${dark.length} holding${dark.length !== 1 ? "s have" : " has"} no dataset coverage — surveillance blind spots. Select any holding to review matched datasets and request an AI portfolio-data assessment.`;
  } catch (_) {
    return "Investment dataset correlator is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function InvestmentDatasetCorrelator() {
  const [visible, setVisible]     = useState(false);
  const [investments, setInvestments] = useState([]);
  const [datasets, setDatasets]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [invRaw, dsRaw] = await Promise.all([
        fetch(`${apiBase()}/entities/Investment?limit=100`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/v1/datasets?limit=100`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setInvestments(normaliseInvestments(invRaw));
      setDatasets(normaliseDatasets(dsRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:invds-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invds-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessHolding(inv) {
    setAssessing(inv.id);
    const dsTitles = inv.matched.map((d) => `"${d.name}"`).join(", ");
    const prompt = `As JARVIS, provide a 2-sentence portfolio-data assessment for the investment "${inv.name}" (type: ${inv.type || "unknown"}, sector: ${inv.sector || "unspecified"}). Datasets found: ${dsTitles || "none"}. Assess the empirical data backing for this holding and whether the dataset coverage is adequate for informed portfolio management.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient data coverage to assess this holding, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Assessment unavailable at this time, sir." },
      }));
    }
    setAssessing(null);
  }

  const correlated = correlate(investments, datasets);
  const backed     = correlated.filter((i) => i.matched.length > 0);
  const dark       = correlated.filter((i) => i.matched.length === 0);

  const base =
    tab === "DATA-BACKED" ? backed :
    tab === "DATA-DARK"   ? dark   : correlated;

  const displayed = search
    ? base.filter((i) =>
        `${i.name} ${i.type} ${i.sector} ${i.ticker}`.toLowerCase().includes(search.toLowerCase())
      )
    : base;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Investment × Dataset Intelligence Correlator (F139)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 91,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : `${CY}44`}`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ INVDS
        {dark.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{dark.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: Math.max(8, BTN_LEFT - 280), zIndex: 91,
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
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◈ INVESTMENT × DATASET CORRELATOR</span>
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
              ["INVESTMENTS", investments.length, CY],
              ["DATASETS",    datasets.length,    PURPLE],
              ["DATA-BACKED", backed.length,       GREEN],
              ["DATA-DARK",   dark.length,         dark.length > 0 ? AMBER : "#445566"],
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
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["ALL", "DATA-BACKED", "DATA-DARK"].map((t) => (
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

          {/* Search */}
          <input
            type="text"
            placeholder="search holdings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${CY}22`, borderRadius: 4,
              color: "#DCEBF5", padding: "5px 8px",
              fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
              outline: "none", marginBottom: 10,
            }}
          />

          {/* Investment rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating investments against dataset catalog…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "DATA-DARK"
                ? "All holdings appear to have dataset coverage."
                : "No investments in this filter."}
            </div>
          ) : (
            displayed.map((inv) => {
              const isOpen    = expanded === inv.id;
              const hasData   = inv.matched.length > 0;
              return (
                <div key={inv.id} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${isOpen ? `${CY}44` : "#1a2530"}`,
                  borderLeft: `3px solid ${hasData ? GREEN : AMBER}`,
                  borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                  cursor: "pointer",
                }} onClick={() => setExpanded(isOpen ? null : inv.id)}>
                  {/* Holding header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ color: "#DCEBF5", fontSize: 10, fontWeight: "bold" }}>{inv.name}</span>
                        {inv.ticker && (
                          <span style={{
                            fontSize: 7, color: PURPLE,
                            border: `1px solid ${PURPLE}44`,
                            borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                          }}>{inv.ticker}</span>
                        )}
                      </div>
                      {(inv.type || inv.sector) && (
                        <div style={{ color: "#556677", fontSize: 8 }}>
                          {[inv.type, inv.sector].filter(Boolean).join(" · ").slice(0, 80)}
                        </div>
                      )}
                    </div>
                    <span style={{
                      fontSize: 7, whiteSpace: "nowrap",
                      color: hasData ? GREEN : AMBER,
                      border: `1px solid ${hasData ? GREEN : AMBER}44`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                    }}>
                      {hasData
                        ? `${inv.matched.length} dataset${inv.matched.length !== 1 ? "s" : ""}`
                        : "DATA-DARK"}
                    </span>
                  </div>

                  {/* Assess button */}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); assessHolding(inv); }}
                      disabled={assessing === inv.id}
                      style={{
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
                  {isOpen && hasData && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}18` }}>
                      {inv.matched.map((d) => (
                        <div key={d.id} style={{
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid #1e3040",
                          borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                          display: "flex", alignItems: "flex-start", gap: 8,
                        }}>
                          {d.type && (
                            <span style={{
                              fontSize: 7, color: PURPLE, border: "1px solid #A78BFA44",
                              borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                              whiteSpace: "nowrap", flexShrink: 0, textTransform: "uppercase",
                            }}>{d.type}</span>
                          )}
                          <div style={{ flex: 1 }}>
                            <div style={{ color: "#a0b8cc", fontSize: 10 }}>{d.name}</div>
                            {d.rowCount != null && (
                              <div style={{ color: "#334455", fontSize: 7, marginTop: 2 }}>
                                {d.rowCount.toLocaleString()} rows
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: 7, color: `${CY}66`, whiteSpace: "nowrap" }}>
                            score {d._score}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isOpen && !hasData && (
                    <div style={{
                      marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a2530",
                      color: AMBER, fontSize: 8,
                    }}>
                      ⚠ No datasets cover this holding. Consider sourcing empirical data for informed portfolio management.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /entities/Investment + /v1/datasets · 90 s auto-refresh · ▶ ASSESS for AI portfolio-data brief
          </div>
        </div>
      )}
    </>
  );
}
