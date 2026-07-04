import { useState, useEffect, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AM = "#FFAA33";
const RD = "#FF4444";
const GN = "#33FF88";
const API_KEY =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_KEY) ||
  "dev-key";

const SEV_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function tokenise(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function relevance(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const setB = new Set(bTokens);
  const shared = aTokens.filter((t) => setB.has(t)).length;
  return Math.round((shared / Math.max(aTokens.length, bTokens.length)) * 100);
}

export function isRskscenQuery(q) {
  return /risk.?scen|scenario.?risk|unplanned.?risk|rskscen|which risks have scenarios|risks without plans|scenario.?cover|risk.?plan/i.test(
    q
  );
}

export async function buildRskscenScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}` };
  const [rsR, scR] = await Promise.allSettled([
    fetch(`${base}/entities/RiskSignal`, { headers: h }).then((r) => r.json()),
    fetch(`${base}/v1/scenario/list`, { headers: h }).then((r) => r.json()),
  ]);
  const signals = (rsR.status === "fulfilled" ? rsR.value?.data ?? rsR.value : []) || [];
  const scenarios = (scR.status === "fulfilled" ? scR.value?.data ?? scR.value : []) || [];
  const unplanned = signals.filter((sig) => {
    const sigTok = tokenise(
      [sig.title, sig.description, sig.type, sig.severity, ...(sig.tags || [])].join(" ")
    );
    return !scenarios.some((sc) => {
      const scTok = tokenise(
        [sc.name, sc.description, sc.objective, sc.type].join(" ")
      );
      return relevance(sigTok, scTok) >= 5;
    });
  });
  const critHigh = unplanned.filter((s) =>
    ["CRITICAL", "HIGH"].includes((s.severity || "").toUpperCase())
  ).length;
  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message: `Risk signal × scenario coverage: ${signals.length} signals, ${scenarios.length} scenarios, ${unplanned.length} unplanned (${critHigh} CRITICAL/HIGH). Provide a 2-sentence risk-planning gap assessment.`,
    }),
  });
  const d = await r.json();
  return (d.answer || "Risk-scenario coverage analysis complete.").replace(
    /<<ACTION:[^>]*>>/g,
    ""
  ).trim();
}

export default function RiskScenarioCoverage() {
  const [open, setOpen] = useState(false);
  const [signals, setSignals] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [briefing, setBriefing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const h = { Authorization: `Bearer ${API_KEY}` };
    const [rsR, scR] = await Promise.allSettled([
      fetch(`${base}/entities/RiskSignal`, { headers: h }).then((r) => r.json()),
      fetch(`${base}/v1/scenario/list`, { headers: h }).then((r) => r.json()),
    ]);
    const sigs =
      (rsR.status === "fulfilled" ? rsR.value?.data ?? rsR.value : []) || [];
    const scens =
      (scR.status === "fulfilled" ? scR.value?.data ?? scR.value : []) || [];
    setSignals(sigs);
    setScenarios(scens);
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:rskscen-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rskscen-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90000);
    return () => clearInterval(id);
  }, [open, load]);

  const enriched = signals.map((sig) => {
    const sigTok = tokenise(
      [sig.title, sig.description, sig.type, sig.severity, ...(sig.tags || [])].join(" ")
    );
    const matches = scenarios
      .map((sc) => {
        const scTok = tokenise(
          [sc.name, sc.description, sc.objective, sc.type].join(" ")
        );
        const score = relevance(sigTok, scTok);
        return score >= 5 ? { ...sc, score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    return { ...sig, matches, planned: matches.length > 0 };
  }).sort((a, b) => {
    const sa = SEV_ORDER[(a.severity || "").toUpperCase()] ?? 4;
    const sb = SEV_ORDER[(b.severity || "").toUpperCase()] ?? 4;
    if (sa !== sb) return sa - sb;
    return a.planned === b.planned ? 0 : a.planned ? 1 : -1;
  });

  const planned = enriched.filter((s) => s.planned).length;
  const unplanned = enriched.filter((s) => !s.planned).length;

  const visible = enriched.filter((s) => {
    if (filter === "PLANNED" && !s.planned) return false;
    if (filter === "UNPLANNED" && s.planned) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (s.title || "").toLowerCase().includes(q) ||
        (s.type || "").toLowerCase().includes(q) ||
        (s.severity || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function assess(sig) {
    setAssessing(sig.id || sig.title);
    setBriefing(null);
    const base = apiBase();
    try {
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Risk signal: "${sig.title}" (${sig.severity || "UNKNOWN"}) — scenario coverage: ${sig.matches?.length || 0} scenarios matched. ${sig.planned ? "This risk has scenario coverage." : "This risk has NO scenario coverage — planning gap."} Provide a 2-sentence risk-planning coverage assessment.`,
        }),
      });
      const d = await r.json();
      const text = (d.answer || "Assessment complete.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBriefing({ id: sig.id || sig.title, text });
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setBriefing({ id: sig.id || sig.title, text: "Assessment unavailable." });
    }
    setAssessing(null);
  }

  const sevColor = (s) => {
    const u = (s || "").toUpperCase();
    if (u === "CRITICAL") return RD;
    if (u === "HIGH") return AM;
    if (u === "MEDIUM") return "#FFDD55";
    return "#88BBCC";
  };

  if (!open) {
    const unplannedCritHigh = enriched.filter(
      (s) => !s.planned && ["CRITICAL", "HIGH"].includes((s.severity || "").toUpperCase())
    ).length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Risk Signal × Scenario Coverage (RSKSCEN)"
        style={{
          position: "fixed",
          left: 49160,
          bottom: 8,
          zIndex: 99,
          background: "rgba(5,8,13,0.82)",
          border: `1px solid ${CY}55`,
          color: CY,
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10,
          letterSpacing: 1,
          padding: "4px 8px",
          borderRadius: 4,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ RSKSCEN
        {unplannedCritHigh > 0 && (
          <span
            style={{
              marginLeft: 5,
              background: RD,
              color: "#fff",
              borderRadius: 8,
              padding: "1px 5px",
              fontSize: 9,
            }}
          >
            {unplannedCritHigh}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 60,
        right: 18,
        width: "min(680px,92vw)",
        maxHeight: "80vh",
        zIndex: 999,
        background: "rgba(5,10,18,0.96)",
        border: `1px solid ${CY}44`,
        borderRadius: 12,
        fontFamily: "'JetBrains Mono',monospace",
        color: "#DCEBF5",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: `0 0 60px ${CY}18`,
      }}
    >
      {/* header */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: `1px solid ${CY}22`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
          ◈ RISK × SCENARIO COVERAGE
        </span>
        {loading && (
          <span style={{ color: "#6E8AA0", fontSize: 10 }}>loading…</span>
        )}
        <button
          onClick={() => setOpen(false)}
          style={{
            marginLeft: "auto",
            background: "none",
            border: "none",
            color: "#6E8AA0",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          ✕
        </button>
      </div>

      {/* stat tiles */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "10px 14px",
          borderBottom: `1px solid ${CY}15`,
          flexShrink: 0,
        }}
      >
        {[
          { label: "SIGNALS", val: signals.length, col: CY },
          { label: "SCENARIOS", val: scenarios.length, col: "#88BBCC" },
          { label: "PLANNED", val: planned, col: GN },
          { label: "UNPLANNED", val: unplanned, col: RD },
        ].map(({ label, val, col }) => (
          <div
            key={label}
            style={{
              flex: 1,
              background: "rgba(41,231,255,0.04)",
              border: `1px solid ${col}33`,
              borderRadius: 6,
              padding: "6px 8px",
              textAlign: "center",
            }}
          >
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* filters + search */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "8px 14px",
          borderBottom: `1px solid ${CY}15`,
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        {["ALL", "PLANNED", "UNPLANNED"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? `${CY}22` : "transparent",
              border: `1px solid ${filter === f ? CY : CY + "33"}`,
              color: filter === f ? CY : "#6E8AA0",
              borderRadius: 4,
              padding: "3px 8px",
              fontSize: 10,
              cursor: "pointer",
              letterSpacing: 1,
            }}
          >
            {f}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search signals…"
          style={{
            marginLeft: "auto",
            background: "rgba(41,231,255,0.06)",
            border: `1px solid ${CY}33`,
            borderRadius: 4,
            color: "#DCEBF5",
            padding: "3px 8px",
            fontSize: 10,
            outline: "none",
            width: 160,
          }}
        />
      </div>

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1, padding: "6px 14px 14px" }}>
        {visible.length === 0 && (
          <div style={{ color: "#6E8AA0", fontSize: 11, padding: "20px 0", textAlign: "center" }}>
            {loading ? "Loading risk signals…" : "No signals match current filter."}
          </div>
        )}
        {visible.map((sig) => {
          const id = sig.id || sig.title;
          const isExp = expanded === id;
          const sev = (sig.severity || "UNKNOWN").toUpperCase();
          const sc = sevColor(sev);
          return (
            <div
              key={id}
              style={{
                background: "rgba(41,231,255,0.03)",
                border: `1px solid ${sig.planned ? CY + "22" : RD + "33"}`,
                borderRadius: 6,
                marginBottom: 6,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  cursor: "pointer",
                }}
                onClick={() => setExpanded(isExp ? null : id)}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: sig.planned ? GN : RD,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 9,
                    padding: "2px 5px",
                    borderRadius: 3,
                    background: sc + "22",
                    color: sc,
                    border: `1px solid ${sc}44`,
                    flexShrink: 0,
                  }}
                >
                  {sev}
                </span>
                <span style={{ fontSize: 11, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {sig.title || sig.id}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    padding: "2px 6px",
                    borderRadius: 3,
                    background: sig.planned ? GN + "22" : RD + "22",
                    color: sig.planned ? GN : RD,
                    border: `1px solid ${sig.planned ? GN : RD}44`,
                    flexShrink: 0,
                    letterSpacing: 1,
                  }}
                >
                  {sig.planned ? `PLANNED (${sig.matches.length})` : "UNPLANNED"}
                </span>
                <span style={{ color: "#6E8AA0", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div
                  style={{
                    borderTop: `1px solid ${CY}15`,
                    padding: "8px 10px",
                    background: "rgba(0,0,0,0.2)",
                  }}
                >
                  {sig.description && (
                    <div style={{ color: "#8AABB8", fontSize: 10, marginBottom: 8, lineHeight: 1.5 }}>
                      {sig.description}
                    </div>
                  )}

                  {sig.matches.length === 0 ? (
                    <div style={{ color: RD, fontSize: 10, marginBottom: 8 }}>
                      ⚠ No scenarios plan for this risk — planning gap.
                    </div>
                  ) : (
                    <>
                      <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                        MATCHED SCENARIOS ({sig.matches.length})
                      </div>
                      {sig.matches.slice(0, 5).map((sc, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 5,
                          }}
                        >
                          <span style={{ fontSize: 9, color: "#88BBCC", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {sc.name || sc.id}
                          </span>
                          {sc.type && (
                            <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, background: `${CY}15`, color: CY, border: `1px solid ${CY}33`, flexShrink: 0 }}>
                              {sc.type}
                            </span>
                          )}
                          {sc.status && (
                            <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, background: "rgba(136,187,204,0.1)", color: "#88BBCC", border: "1px solid #88BBCC33", flexShrink: 0 }}>
                              {sc.status}
                            </span>
                          )}
                          <div style={{ width: 60, height: 4, background: "#0a1520", borderRadius: 2, flexShrink: 0, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${sc.score}%`, background: CY, borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: 9, color: "#6E8AA0", flexShrink: 0 }}>{sc.score}%</span>
                        </div>
                      ))}
                    </>
                  )}

                  <button
                    onClick={() => assess(sig)}
                    disabled={assessing === id}
                    style={{
                      marginTop: 6,
                      background: `${CY}15`,
                      border: `1px solid ${CY}44`,
                      color: CY,
                      borderRadius: 4,
                      padding: "4px 10px",
                      fontSize: 10,
                      cursor: "pointer",
                      letterSpacing: 1,
                    }}
                  >
                    {assessing === id ? "…" : "▶ ASSESS"}
                  </button>

                  {briefing?.id === id && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: "6px 8px",
                        background: `${CY}08`,
                        border: `1px solid ${CY}22`,
                        borderRadius: 4,
                        fontSize: 10,
                        color: "#DCEBF5",
                        lineHeight: 1.5,
                      }}
                    >
                      {briefing.text}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
