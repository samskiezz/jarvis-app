/**
 * ScenarioRiskReadiness — F305
 * Fetches /v1/scenario/list + /entities/RiskSignal;
 * keyword-matches each active risk signal against scenario titles/descriptions
 * to surface which risks have a scenario playbook (COVERED) vs which don't (EXPOSED).
 * Stat tiles (risks / covered / exposed / scenarios);
 * severity-sorted rows; expandable rows show matched scenarios with status badges;
 * filter tabs ALL / COVERED / EXPOSED;
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS;
 * ◈ SRMAP toggle (left:61240, bottom:8, zIndex:118);
 * voice "scenario risk"/"risk playbook"/"risk coverage"/"response readiness"/"srmap";
 * jarvis:scenario-risk-readiness-toggle event; 90-s auto-refresh.
 * Additive-only — no edits to CinematicShell/CinematicHome/JarvisLoader.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GR = "#00FF9F";
const AM = "#FFB800";
const RD = "#FF4444";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const POLL_MS = 90_000;

const SRMAP_RE =
  /\bscenario.?risk\b|\brisk.?playbook\b|\brisk.?coverage\b|\bresponse.?readiness\b|\bplaybook.?coverage\b|\bsrmap\b|\bscenario.?coverage\b|\brisk.?scenario\b|\bwhich.?risks.?have\b|\bexposed.?risk\b/i;

export function isScenarioRiskReadinessQuery(text) {
  return SRMAP_RE.test(text || "");
}

function tokenize(str) {
  return (str || "")
    .toLowerCase()
    .split(/[\s,;:\-_/()[\]{}\.]+/)
    .filter((t) => t.length >= 3);
}

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function matchScenarios(risk, scenarios) {
  const rTokens = tokenize(
    (risk.title || risk.name || "") +
      " " +
      (risk.description || "") +
      " " +
      (risk.category || risk.type || "") +
      " " +
      (risk.tags || []).join(" "),
  );
  return scenarios.filter((s) => {
    const sText = [s.title, s.name, s.description, s.type, s.category]
      .filter(Boolean)
      .join(" ");
    const sTokens = tokenize(sText);
    return rTokens.some((rt) => sTokens.includes(rt));
  });
}

export async function buildScenarioRiskReadinessScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [sr, rr] = await Promise.allSettled([
    fetch(`${base}/v1/scenario/list`, { headers }),
    fetch(`${base}/entities/RiskSignal`, { headers }),
  ]);
  if (rr.status !== "fulfilled" || !rr.value.ok)
    return "Risk signal data unavailable, sir.";
  const rd = await rr.value.json();
  const risks = Array.isArray(rd) ? rd : rd.risks || rd.items || rd.data || [];
  const scenarios =
    sr.status === "fulfilled" && sr.value.ok
      ? await sr.value
          .json()
          .then((d) => Array.isArray(d) ? d : d.scenarios || d.items || d.data || [])
      : [];
  const covered = risks.filter(
    (r) => matchScenarios(r, scenarios).length > 0,
  );
  const exposed = risks.filter(
    (r) => matchScenarios(r, scenarios).length === 0,
  );
  if (!risks.length) return "No risk signal data available, sir.";
  const criticalExposed = exposed.filter(
    (r) => (r.severity || "").toLowerCase() === "critical",
  );
  return (
    `Scenario readiness assessment complete. ${risks.length} active risk signals assessed against ${scenarios.length} scenarios. ` +
    `${covered.length} risks have scenario playbook coverage. ` +
    `${exposed.length} risks are exposed with no matching scenario. ` +
    (criticalExposed.length > 0
      ? `Warning: ${criticalExposed.length} critical risks are without playbook coverage. Top gap: ${criticalExposed[0].title || criticalExposed[0].name || "unknown"}.`
      : "All critical risks have scenario coverage.")
  );
}

const TAG = {
  background: "rgba(0,0,0,0.75)",
  border: `1px solid ${CY}33`,
  borderRadius: 6,
  padding: "2px 7px",
  fontSize: 10,
  color: CY,
};
const STAT_BOX = {
  background: "rgba(0,0,0,0.55)",
  border: `1px solid ${CY}33`,
  borderRadius: 8,
  padding: "10px 16px",
  minWidth: 90,
  textAlign: "center",
};
const SEV_COLORS = {
  critical: RD,
  high: AM,
  medium: CY,
  low: GR,
  info: "#888",
};

function SevBadge({ sev }) {
  const s = (sev || "").toLowerCase();
  const col = SEV_COLORS[s] || CY;
  return (
    <span
      style={{
        ...TAG,
        borderColor: col + "55",
        color: col,
        textTransform: "uppercase",
        letterSpacing: 1,
      }}
    >
      {sev || "unknown"}
    </span>
  );
}

export default function ScenarioRiskReadiness() {
  const [open, setOpen] = useState(false);
  const [risks, setRisks] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const [assessText, setAssessText] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [sr, rr] = await Promise.allSettled([
        fetch(`${base}/v1/scenario/list`, { headers }),
        fetch(`${base}/entities/RiskSignal`, { headers }),
      ]);
      if (rr.status === "fulfilled" && rr.value.ok) {
        const d = await rr.value.json();
        setRisks(Array.isArray(d) ? d : d.risks || d.items || d.data || []);
      } else {
        setErr("Risk signal fetch failed");
      }
      if (sr.status === "fulfilled" && sr.value.ok) {
        const d = await sr.value.json();
        setScenarios(
          Array.isArray(d) ? d : d.scenarios || d.items || d.data || [],
        );
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:scenario-risk-readiness-toggle", handler);
    return () =>
      window.removeEventListener(
        "jarvis:scenario-risk-readiness-toggle",
        handler,
      );
  }, []);

  const mapped = risks.map((r) => ({
    ...r,
    _scenarios: matchScenarios(r, scenarios),
  }));

  mapped.sort((a, b) => {
    const aSev = SEV_ORDER[(a.severity || "").toLowerCase()] ?? 99;
    const bSev = SEV_ORDER[(b.severity || "").toLowerCase()] ?? 99;
    return aSev - bSev;
  });

  const filtered = mapped
    .filter((r) => {
      if (tab === "COVERED") return r._scenarios.length > 0;
      if (tab === "EXPOSED") return r._scenarios.length === 0;
      return true;
    })
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (r.title || r.name || "").toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q) ||
        (r.category || "").toLowerCase().includes(q)
      );
    });

  const coveredCount = mapped.filter((r) => r._scenarios.length > 0).length;
  const exposedCount = mapped.filter((r) => r._scenarios.length === 0).length;
  const criticalExposedCount = mapped.filter(
    (r) =>
      r._scenarios.length === 0 &&
      (r.severity || "").toLowerCase() === "critical",
  ).length;

  async function handleAssess() {
    setAssessing(true);
    setAssessText("");
    try {
      const base = apiBase();
      const prompt = `Briefly assess scenario readiness coverage: ${coveredCount} of ${mapped.length} risk signals have scenario playbook coverage, ${exposedCount} are exposed with no matching scenario, ${criticalExposedCount} of those are critical severity. Summarize in 2 sentences.`;
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      if (res.ok) {
        const d = await res.json();
        const txt = d.response || d.message || d.content || "";
        setAssessText(txt);
        window.dispatchEvent(
          new CustomEvent("jarvis:speak", { detail: { text: txt } }),
        );
      } else {
        setAssessText("Assessment unavailable at this time.");
      }
    } catch {
      setAssessText("Assessment failed.");
    } finally {
      setAssessing(false);
    }
  }

  const TABS = ["ALL", "COVERED", "EXPOSED"];

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          bottom: 8,
          left: 61240,
          zIndex: 118,
          background: open ? `${CY}22` : "rgba(0,0,0,0.7)",
          border: `1px solid ${CY}55`,
          borderRadius: 6,
          color: CY,
          fontSize: 10,
          padding: "3px 8px",
          cursor: "pointer",
          fontFamily: "monospace",
          letterSpacing: 1,
          whiteSpace: "nowrap",
        }}
        title="Scenario × RiskSignal Readiness Coverage"
      >
        ◈ SRMAP
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            top: 40,
            right: 16,
            width: 580,
            maxHeight: "82vh",
            background: "rgba(5,10,18,0.97)",
            border: `1px solid ${CY}55`,
            borderRadius: 12,
            zIndex: 9200,
            display: "flex",
            flexDirection: "column",
            fontFamily: "monospace",
            color: CY,
            boxShadow: `0 0 40px ${CY}22`,
            overflow: "hidden",
          }}
        >
          {/* header */}
          <div
            style={{
              padding: "12px 16px 8px",
              borderBottom: `1px solid ${CY}22`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 12, letterSpacing: 2 }}>
              ◈ SCENARIO × RISK READINESS COVERAGE
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: CY,
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "10px 16px",
              borderBottom: `1px solid ${CY}11`,
            }}
          >
            <div style={STAT_BOX}>
              <div style={{ fontSize: 18, fontWeight: "bold", color: CY }}>
                {mapped.length}
              </div>
              <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>
                RISKS
              </div>
            </div>
            <div style={STAT_BOX}>
              <div style={{ fontSize: 18, fontWeight: "bold", color: GR }}>
                {coveredCount}
              </div>
              <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>
                COVERED
              </div>
            </div>
            <div style={{ ...STAT_BOX, position: "relative" }}>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: "bold",
                  color: exposedCount > 0 ? RD : GR,
                }}
              >
                {exposedCount}
              </div>
              <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>
                EXPOSED
              </div>
              {criticalExposedCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 6,
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: RD,
                    boxShadow: `0 0 6px ${RD}`,
                    animation: "srmapPulse 1.2s ease-in-out infinite",
                  }}
                />
              )}
            </div>
            <div style={STAT_BOX}>
              <div style={{ fontSize: 18, fontWeight: "bold", color: AM }}>
                {scenarios.length}
              </div>
              <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>
                SCENARIOS
              </div>
            </div>
          </div>

          {/* filter tabs + search */}
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: "8px 16px 0",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "rgba(0,0,0,0.4)",
                  border: `1px solid ${tab === t ? CY : CY + "33"}`,
                  borderRadius: 5,
                  color: tab === t ? CY : "#666",
                  fontSize: 9,
                  padding: "3px 10px",
                  cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search risks…"
              style={{
                flex: 1,
                background: "rgba(0,0,0,0.5)",
                border: `1px solid ${CY}33`,
                borderRadius: 5,
                color: CY,
                fontSize: 10,
                padding: "3px 8px",
                outline: "none",
                fontFamily: "monospace",
                marginLeft: 4,
                minWidth: 100,
              }}
            />
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                background: assessing ? `${CY}11` : `${CY}22`,
                border: `1px solid ${CY}55`,
                borderRadius: 5,
                color: CY,
                fontSize: 9,
                padding: "3px 10px",
                cursor: assessing ? "default" : "pointer",
                letterSpacing: 1,
                marginLeft: 4,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* assess result */}
          {assessText && (
            <div
              style={{
                margin: "6px 16px 0",
                padding: "7px 10px",
                background: "rgba(0,0,0,0.4)",
                border: `1px solid ${CY}33`,
                borderRadius: 6,
                fontSize: 10,
                color: "#aec8e0",
                lineHeight: 1.5,
              }}
            >
              {assessText}
            </div>
          )}

          {/* list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 12px" }}>
            {loading && !risks.length && (
              <div
                style={{
                  color: "#666",
                  fontSize: 11,
                  textAlign: "center",
                  paddingTop: 24,
                }}
              >
                loading…
              </div>
            )}
            {err && (
              <div style={{ color: RD, fontSize: 10, padding: "8px 0" }}>
                ⚠ {err}
              </div>
            )}
            {!loading && !err && filtered.length === 0 && (
              <div
                style={{
                  color: "#555",
                  fontSize: 11,
                  textAlign: "center",
                  paddingTop: 24,
                }}
              >
                no risks match this filter
              </div>
            )}
            {filtered.map((risk, idx) => {
              const isCovered = risk._scenarios.length > 0;
              const rowKey = risk.id || risk.title || idx;
              const isExp = !!expanded[rowKey];
              const dotColor = isCovered ? GR : RD;
              return (
                <div
                  key={rowKey}
                  style={{
                    borderBottom: `1px solid ${CY}18`,
                    marginBottom: 4,
                    paddingBottom: 4,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                      padding: "5px 0",
                    }}
                    onClick={() =>
                      setExpanded((prev) => ({
                        ...prev,
                        [rowKey]: !isExp,
                      }))
                    }
                  >
                    <span
                      style={{ color: dotColor, fontSize: 13, minWidth: 14 }}
                    >
                      ●
                    </span>
                    <span style={{ flex: 1, fontSize: 11, color: CY }}>
                      {risk.title || risk.name || `Risk #${idx + 1}`}
                    </span>
                    <SevBadge sev={risk.severity} />
                    {isCovered ? (
                      <span
                        style={{
                          ...TAG,
                          borderColor: GR + "55",
                          color: GR,
                          fontSize: 9,
                        }}
                      >
                        {risk._scenarios.length} SCENARIO
                        {risk._scenarios.length > 1 ? "S" : ""}
                      </span>
                    ) : (
                      <span
                        style={{
                          ...TAG,
                          borderColor: RD + "55",
                          color: RD,
                          fontSize: 9,
                        }}
                      >
                        EXPOSED
                      </span>
                    )}
                    <span style={{ color: "#555", fontSize: 10 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>
                  {isExp && (
                    <div style={{ paddingLeft: 22, paddingBottom: 6 }}>
                      {risk.description && (
                        <div
                          style={{
                            fontSize: 9,
                            color: "#666",
                            marginBottom: 6,
                            lineHeight: 1.4,
                          }}
                        >
                          {risk.description}
                        </div>
                      )}
                      {risk._scenarios.length > 0 ? (
                        <div>
                          <div
                            style={{
                              fontSize: 9,
                              color: GR,
                              letterSpacing: 1,
                              marginBottom: 4,
                            }}
                          >
                            MATCHED SCENARIOS
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 3,
                            }}
                          >
                            {risk._scenarios.map((s, si) => (
                              <div
                                key={s.id || si}
                                style={{
                                  background: "rgba(0,0,0,0.4)",
                                  border: `1px solid ${GR}22`,
                                  borderRadius: 6,
                                  padding: "4px 10px",
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "center",
                                }}
                              >
                                <span
                                  style={{ flex: 1, fontSize: 10, color: "#ccc" }}
                                >
                                  {s.title || s.name || `Scenario #${si + 1}`}
                                </span>
                                {s.status && (
                                  <span
                                    style={{
                                      ...TAG,
                                      borderColor: GR + "33",
                                      color: GR,
                                      fontSize: 9,
                                    }}
                                  >
                                    {s.status}
                                  </span>
                                )}
                                {s.type && (
                                  <span
                                    style={{
                                      ...TAG,
                                      borderColor: CY + "33",
                                      color: CY,
                                      fontSize: 9,
                                    }}
                                  >
                                    {s.type}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div
                          style={{
                            fontSize: 10,
                            color: RD,
                            padding: "4px 0",
                          }}
                        >
                          no scenario playbook — this risk is uncovered
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* footer */}
          <div
            style={{
              padding: "6px 16px",
              borderTop: `1px solid ${CY}22`,
              fontSize: 9,
              color: "#555",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>
              auto-refresh 90 s · {filtered.length} of {mapped.length} risks
              shown
            </span>
            {loading && <span style={{ color: AM }}>refreshing…</span>}
          </div>
        </div>
      )}
      <style>{`@keyframes srmapPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.6)}}`}</style>
    </>
  );
}
