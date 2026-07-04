/**
 * DecisionDatasetTracker — F135.
 *
 * Parallel-fetches /v1/decision/list + /v1/datasets and keyword-correlates
 * each strategic decision (title / reason / risks / alternatives /
 * expected_outcome) against the dataset catalog to surface whether decisions
 * are DATA-BACKED (at least one empirical dataset exists) vs SPECULATIVE
 * (no data record — intuition-only decision).
 *
 * Stat tiles: decisions / datasets / backed / speculative.
 * Filter tabs: ALL / DATA-BACKED / SPECULATIVE + text search.
 * Expand decision → matched datasets with row-count badge + type badge + score bar.
 * Amber badge on speculative count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence evidence-basis brief + TTS.
 *
 * Toggle: ◈ DECDAS at left:43000, bottom:8, zIndex:88.
 * Event:  jarvis:decdas-toggle
 * Voice:  "decision dataset" / "data-backed decisions" / "evidence decisions"
 *         / "speculative decisions" / "decdas"
 * Refresh: 90s auto-refresh while open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const GREEN  = "#00c878";
const AMBER  = "#F5A623";
const RED    = "#FF3D5A";
const VIOLET = "#A78BFA";
const BTN_LEFT = 43000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isDecdasQuery(q) {
  return /decis.{0,20}dataset|dataset.{0,20}decis|data.backed\s+decision|speculative\s+decision|evidence\s+decision|decision\s+evidence|decdas\b|decision\s+data\s+gap/i.test(
    q || ""
  );
}

export async function buildDecdasScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [dr, dsr] = await Promise.all([
      fetch(`${base}/v1/decision/list`, { headers: hdr }),
      fetch(`${base}/v1/datasets`,      { headers: hdr }),
    ]);
    const decisions = normaliseDecisions(dr.ok  ? await dr.json()  : []);
    const datasets  = normaliseDatasets(dsr.ok ? await dsr.json() : []);
    const { backedIds } = buildCoverage(decisions, datasets);
    const speculative = decisions.length - backedIds.size;
    window.dispatchEvent(new CustomEvent("jarvis:decdas-toggle"));
    if (!decisions.length)
      return "No strategic decisions on record, sir. The decision ledger is empty.";
    return (
      `Decision evidence tracker active, sir. ` +
      `${decisions.length} decision${decisions.length !== 1 ? "s" : ""} cross-referenced ` +
      `against ${datasets.length} dataset${datasets.length !== 1 ? "s" : ""}. ` +
      `${backedIds.size} decision${backedIds.size !== 1 ? "s are" : " is"} data-backed ` +
      `by empirical datasets. ` +
      `${speculative} decision${speculative !== 1 ? "s are" : " is"} speculative — ` +
      `no supporting dataset found.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:decdas-toggle"));
    return "Decision dataset tracker panel open, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function DecisionDatasetTracker() {
  const [visible,    setVisible]    = useState(false);
  const [decisions,  setDecisions]  = useState([]);
  const [datasets,   setDatasets]   = useState([]);
  const [coverage,   setCoverage]   = useState({ backedIds: new Set(), pairs: [] });
  const [loading,    setLoading]    = useState(false);
  const [search,     setSearch]     = useState("");
  const [filter,     setFilter]     = useState("all");
  const [selected,   setSelected]   = useState(null);
  const [aiMap,      setAiMap]      = useState({});
  const [aiLoading,  setAiLoading]  = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [dr, dsr] = await Promise.all([
        fetch(`${base}/v1/decision/list`, { headers: hdr }),
        fetch(`${base}/v1/datasets`,      { headers: hdr }),
      ]);
      const rawDec  = normaliseDecisions(dr.ok  ? await dr.json()  : []);
      const rawDs   = normaliseDatasets(dsr.ok  ? await dsr.json() : []);
      setDecisions(rawDec);
      setDatasets(rawDs);
      setCoverage(buildCoverage(rawDec, rawDs));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:decdas-toggle", onToggle);
    return () => window.removeEventListener("jarvis:decdas-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, 90_000);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function getAiAssessment(dec, matchedDatasets) {
    const did = decId(dec);
    if (aiMap[did] || aiLoading === did) return;
    setAiLoading(did);
    const title   = dec.title || did;
    const dNames  = matchedDatasets.map((d) => d.name).join(", ");
    const hasCover = matchedDatasets.length > 0;
    const prompt = hasCover
      ? `As JARVIS, provide a 2-sentence evidence-basis assessment for strategic decision "${title}". ` +
        `This decision is supported by ${matchedDatasets.length} dataset${matchedDatasets.length !== 1 ? "s" : ""}: ${dNames}. ` +
        `Evaluate whether the empirical evidence is sufficient to justify the decision and note any data gaps.`
      : `As JARVIS, provide a 2-sentence evidence-basis assessment for strategic decision "${title}"${dec.reason ? ` (rationale: "${String(dec.reason).slice(0, 100)}")` : ""}. ` +
        `This decision has NO supporting dataset — it is speculative with no empirical data backing. ` +
        `Recommend what data should be gathered before proceeding.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAiMap((prev) => ({ ...prev, [did]: answer }));
      if (answer)
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
        );
    } catch (_) {
      setAiMap((prev) => ({ ...prev, [did]: "Unable to reach reasoning core." }));
    } finally {
      setAiLoading(null);
    }
  }

  const speculativeCount = decisions.length - coverage.backedIds.size;

  const filtered = decisions.filter((dec) => {
    const did = decId(dec);
    if (filter === "backed"      && !coverage.backedIds.has(did)) return false;
    if (filter === "speculative" &&  coverage.backedIds.has(did)) return false;
    if (search) {
      const s = search.toLowerCase();
      const text = [dec.title, dec.reason, dec.expected, ...(dec.risks || []), ...(dec.alternatives || [])]
        .filter(Boolean).join(" ").toLowerCase();
      if (!text.includes(s)) return false;
    }
    return true;
  });

  const selectedMatches = selected
    ? coverage.pairs
        .filter((p) => p.decId === decId(selected))
        .map((p) => p.dataset)
    : [];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Decision × Dataset Evidence Tracker"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 88,
          height: 26,
          padding: "0 8px",
          background: visible ? `${AMBER}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? AMBER : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? AMBER : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {speculativeCount > 0 && !visible && (
          <span
            style={{
              display: "inline-block",
              marginRight: 5,
              background: AMBER,
              color: "#000",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 9,
              lineHeight: "14px",
              textAlign: "center",
              fontWeight: 700,
            }}
          >
            {speculativeCount > 9 ? "9+" : speculativeCount}
          </span>
        )}
        ◈ DECDAS
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 44,
            left: Math.min(BTN_LEFT, window.innerWidth - 660),
            zIndex: 88,
            width: 640,
            maxHeight: "76vh",
            display: "flex",
            flexDirection: "column",
            background: "rgba(4,10,18,0.96)",
            border: `1px solid ${AMBER}44`,
            borderTop: `2px solid ${AMBER}`,
            borderRadius: 12,
            boxShadow: `0 0 40px ${AMBER}14, 0 8px 32px rgba(0,0,0,0.75)`,
            fontFamily: "'JetBrains Mono', monospace",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderBottom: `1px solid ${AMBER}22`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: AMBER, fontSize: 13 }}>◈</span>
            <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              DECISION × DATASET EVIDENCE TRACKER
            </span>
            {loading && (
              <span style={{ marginLeft: "auto", color: "#6E8AA0", fontSize: 10 }}>loading…</span>
            )}
            <button
              onClick={() => setVisible(false)}
              style={{
                marginLeft: loading ? 0 : "auto",
                background: "transparent",
                border: "none",
                color: "#6E8AA0",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "8px 14px",
              borderBottom: `1px solid #1A2A3A`,
              flexShrink: 0,
            }}
          >
            {[
              { label: "DECISIONS",   val: decisions.length,       col: CY     },
              { label: "DATASETS",    val: datasets.length,        col: VIOLET  },
              { label: "DATA-BACKED", val: coverage.backedIds.size, col: GREEN  },
              { label: "SPECULATIVE", val: speculativeCount,        col: AMBER  },
            ].map((t) => (
              <div
                key={t.label}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid #1A2A3A",
                  borderRadius: 6,
                  padding: "5px 8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 14, color: t.col, fontWeight: 700 }}>{t.val}</div>
                <div style={{ fontSize: 8, color: "#4E6A7A", letterSpacing: 1, marginTop: 1 }}>
                  {t.label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "7px 14px",
              borderBottom: `1px solid #1A2A3A`,
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            {[
              { key: "all",         label: "ALL"         },
              { key: "backed",      label: "DATA-BACKED" },
              { key: "speculative", label: "SPECULATIVE" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => { setFilter(f.key); setSelected(null); }}
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  border: `1px solid ${filter === f.key ? AMBER : "#2A3A4A"}`,
                  background: filter === f.key ? `${AMBER}22` : "transparent",
                  color: filter === f.key ? AMBER : "#6E8AA0",
                  fontSize: 10,
                  letterSpacing: 1,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {f.label}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search decisions…"
              style={{
                marginLeft: "auto",
                padding: "2px 8px",
                borderRadius: 4,
                border: "1px solid #2A3A4A",
                background: "rgba(255,255,255,0.04)",
                color: "#DCEBF5",
                fontSize: 10,
                fontFamily: "inherit",
                width: 140,
                outline: "none",
              }}
            />
          </div>

          {/* Split pane */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            {/* Decision list */}
            <div
              style={{
                width: 240,
                borderRight: `1px solid #1A2A3A`,
                overflowY: "auto",
                flexShrink: 0,
              }}
            >
              {!loading && filtered.length === 0 && (
                <div style={{ padding: 14, color: "#6E8AA0", fontSize: 10 }}>
                  No decisions in this filter.
                </div>
              )}
              {filtered.map((dec) => {
                const did        = decId(dec);
                const isBacked   = coverage.backedIds.has(did);
                const isActive   = selected && decId(selected) === did;
                const matchCount = coverage.pairs.filter((p) => p.decId === did).length;
                return (
                  <div
                    key={did}
                    onClick={() => setSelected(dec)}
                    style={{
                      padding: "9px 12px",
                      borderBottom: `1px solid #0E1A26`,
                      cursor: "pointer",
                      background: isActive ? `${AMBER}10` : "transparent",
                      borderLeft: isActive ? `3px solid ${AMBER}` : "3px solid transparent",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: isBacked ? GREEN : AMBER,
                          flexShrink: 0,
                          boxShadow: !isBacked ? `0 0 4px ${AMBER}` : undefined,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 10,
                          color: "#DCEBF5",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {dec.title || did}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 5, paddingLeft: 12 }}>
                      <span style={{ fontSize: 8, color: isBacked ? GREEN : AMBER, letterSpacing: 1 }}>
                        {isBacked ? `${matchCount} dataset${matchCount !== 1 ? "s" : ""}` : "speculative"}
                      </span>
                      {(dec.risks || []).length > 0 && (
                        <span style={{ fontSize: 8, color: RED, letterSpacing: 1 }}>
                          {(dec.risks || []).length} RSK
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Detail pane */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {!selected && (
                <div style={{ padding: 20, color: "#6E8AA0", fontSize: 10, lineHeight: 1.6 }}>
                  Select a decision to see matched datasets and request an AI evidence assessment.
                </div>
              )}
              {selected && (() => {
                const did = decId(selected);
                return (
                  <div>
                    {/* Decision header + assess button */}
                    <div
                      style={{
                        padding: "10px 14px",
                        borderBottom: `1px solid #1A2A3A`,
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: "#DCEBF5", marginBottom: 3, fontWeight: 700 }}>
                          {selected.title || did}
                        </div>
                        {selected.reason && (
                          <div style={{ fontSize: 10, color: "#4E8A9A", lineHeight: 1.4, marginBottom: 4 }}>
                            {String(selected.reason).slice(0, 140)}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {(selected.risks || []).slice(0, 3).map((r, i) => (
                            <span
                              key={i}
                              style={{
                                fontSize: 8,
                                color: RED,
                                letterSpacing: 1,
                                padding: "1px 5px",
                                border: `1px solid ${RED}44`,
                                borderRadius: 3,
                              }}
                            >
                              {String(r).toUpperCase().slice(0, 28)}
                            </span>
                          ))}
                          {selected.expected && (
                            <span
                              style={{
                                fontSize: 8,
                                color: CY,
                                letterSpacing: 1,
                                padding: "1px 5px",
                                border: `1px solid ${CY}44`,
                                borderRadius: 3,
                              }}
                            >
                              OUTCOME: {String(selected.expected).slice(0, 28).toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => getAiAssessment(selected, selectedMatches)}
                        disabled={!!aiMap[did] || aiLoading === did}
                        style={{
                          flexShrink: 0,
                          padding: "3px 10px",
                          borderRadius: 4,
                          border: `1px solid ${aiMap[did] ? GREEN + "66" : VIOLET + "66"}`,
                          background: aiMap[did]
                            ? `${GREEN}12`
                            : aiLoading === did
                            ? `${VIOLET}22`
                            : "transparent",
                          color: aiMap[did] ? GREEN : VIOLET,
                          fontSize: 9,
                          letterSpacing: 1,
                          cursor: aiMap[did] || aiLoading === did ? "default" : "pointer",
                          fontFamily: "inherit",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {aiMap[did] ? "✓ ASSESSED" : aiLoading === did ? "consulting…" : "▶ ASSESS"}
                      </button>
                    </div>

                    {/* AI assessment */}
                    {aiMap[did] && (
                      <div
                        style={{
                          margin: "10px 14px",
                          padding: "8px 12px",
                          background: `${GREEN}0A`,
                          border: `1px solid ${GREEN}22`,
                          borderRadius: 6,
                          fontSize: 10,
                          color: "#A0D8B0",
                          lineHeight: 1.5,
                        }}
                      >
                        <span
                          style={{
                            color: GREEN,
                            fontSize: 8,
                            letterSpacing: 1,
                            fontWeight: 700,
                            display: "block",
                            marginBottom: 3,
                          }}
                        >
                          JARVIS ASSESSMENT
                        </span>
                        {aiMap[did]}
                      </div>
                    )}

                    {/* Matched datasets or speculative warning */}
                    {selectedMatches.length === 0 ? (
                      <div
                        style={{
                          padding: "14px",
                          color: AMBER,
                          fontSize: 10,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span style={{ fontSize: 14 }}>⚠</span>
                        No supporting datasets found — this decision is speculative.
                      </div>
                    ) : (
                      <div>
                        <div
                          style={{
                            padding: "7px 14px",
                            color: GREEN,
                            fontSize: 10,
                            letterSpacing: 1,
                            fontWeight: 700,
                            borderBottom: `1px solid #1A2A3A`,
                          }}
                        >
                          {selectedMatches.length} MATCHING DATASET{selectedMatches.length !== 1 ? "S" : ""}
                        </div>
                        {selectedMatches.map((ds, i) => {
                          const score = coverage.pairs.find(
                            (p) => p.decId === decId(selected) && p.dataset.id === ds.id
                          )?.matchScore || 0;
                          const dsType = (ds.type || ds.category || "").toUpperCase();
                          return (
                            <div
                              key={`${ds.id}-${i}`}
                              style={{
                                padding: "9px 14px",
                                borderBottom: `1px solid #0E1A26`,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <span style={{ color: GREEN, fontSize: 11, flexShrink: 0 }}>▶</span>
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: "#DCEBF5",
                                    flex: 1,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {ds.name}
                                </span>
                                {ds.rows != null && (
                                  <span
                                    style={{
                                      fontSize: 8,
                                      color: CY,
                                      letterSpacing: 1,
                                      padding: "1px 5px",
                                      border: `1px solid ${CY}44`,
                                      borderRadius: 3,
                                      flexShrink: 0,
                                    }}
                                  >
                                    {Number(ds.rows).toLocaleString()} ROWS
                                  </span>
                                )}
                                {dsType && (
                                  <span
                                    style={{
                                      fontSize: 8,
                                      color: VIOLET,
                                      letterSpacing: 1,
                                      padding: "1px 5px",
                                      border: `1px solid ${VIOLET}44`,
                                      borderRadius: 3,
                                      flexShrink: 0,
                                    }}
                                  >
                                    {dsType}
                                  </span>
                                )}
                              </div>
                              {ds.desc && (
                                <div style={{ paddingLeft: 19, fontSize: 10, color: "#4E8A9A", lineHeight: 1.4, marginBottom: 4 }}>
                                  {String(ds.desc).slice(0, 110)}
                                </div>
                              )}
                              <div style={{ paddingLeft: 19, display: "flex", alignItems: "center", gap: 6 }}>
                                <div
                                  style={{
                                    flex: 1,
                                    height: 3,
                                    background: "#1A2A3A",
                                    borderRadius: 2,
                                    overflow: "hidden",
                                    maxWidth: 120,
                                  }}
                                >
                                  <div
                                    style={{
                                      height: "100%",
                                      width: `${Math.min(100, score * 20)}%`,
                                      background: GREEN,
                                      borderRadius: 2,
                                    }}
                                  />
                                </div>
                                <span style={{ fontSize: 9, color: "#4E6A7A" }}>
                                  score {score}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "5px 14px",
              borderTop: `1px solid ${AMBER}18`,
              fontSize: 10,
              color: "#4E6A7A",
              letterSpacing: 1,
              flexShrink: 0,
            }}
          >
            /v1/decision/list + /v1/datasets · 90s auto-refresh · click ▶ ASSESS for AI evidence analysis
          </div>
        </div>
      )}
    </>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function decId(d) {
  return d.id || d._id || d.decision_id || d.title || "decision";
}

function normaliseDecisions(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.decisions) ? raw.decisions
    : Array.isArray(raw?.items)     ? raw.items
    : Array.isArray(raw?.data)      ? raw.data
    : Array.isArray(raw?.results)   ? raw.results
    : [];
  return arr.map((d, i) => ({
    id:           d.id || d._id || d.decision_id || `dec-${i}`,
    title:        d.title || d.name || `Decision ${i + 1}`,
    reason:       d.reason || d.rationale || "",
    risks:        Array.isArray(d.risks)        ? d.risks        : [],
    alternatives: Array.isArray(d.alternatives) ? d.alternatives : [],
    expected:     d.expected_outcome || d.outcome || "",
    _raw: d,
  }));
}

function normaliseDatasets(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.datasets) ? raw.datasets
    : Array.isArray(raw?.data)     ? raw.data
    : Array.isArray(raw?.items)    ? raw.items
    : Array.isArray(raw?.results)  ? raw.results
    : [];
  return arr.map((d, i) => ({
    id:       d.id || String(i),
    name:     d.name || d.title || d.dataset_name || `Dataset ${i + 1}`,
    rows:     d.rows ?? d.row_count ?? d.record_count ?? null,
    type:     d.type || d.category || "",
    desc:     (d.description || d.desc || d.topic || d.subject || "").toString(),
    tags:     Array.isArray(d.tags) ? d.tags.join(" ") : (d.tags || ""),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function buildCoverage(decisions, datasets) {
  const backedIds = new Set();
  const pairs     = [];

  for (const dec of decisions) {
    const did   = decId(dec);
    const dText = [
      dec.title,
      dec.reason,
      dec.expected,
      ...(dec.risks || []),
      ...(dec.alternatives || []),
    ].filter(Boolean).join(" ");
    const dKws = keywords(dText);
    if (!dKws.length) continue;

    for (const ds of datasets) {
      const sText  = [ds.name, ds.desc, ds.type, ds.tags].filter(Boolean).join(" ");
      const sKws   = keywords(sText);
      const score  = dKws.filter((w) => sKws.includes(w)).length;
      if (score >= 1) {
        backedIds.add(did);
        pairs.push({ decId: did, dataset: ds, matchScore: score });
      }
    }
  }

  pairs.sort((a, b) => b.matchScore - a.matchScore);
  return { backedIds, pairs };
}
