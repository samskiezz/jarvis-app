/**
 * ScenarioInvestigationReportCoverage — F56 (SIRACOV).
 * /v1/scenario/list × /v1/investigations × /v1/reports
 * Keyword-correlates each scenario against active investigations AND published reports.
 * Classification:
 *   FULLY_ACTIONABLE  — matched ≥1 investigation AND ≥1 report
 *   INVESTIGATED_ONLY — matched investigation, no report
 *   REPORTED_ONLY     — matched report, no investigation
 *   UNACTIONABLE      — no investigation, no report (coverage blind spot)
 * Stat tiles: SCENARIOS / FULLY_ACTIONABLE / INVESTIGATED / REPORTED / UNACTIONABLE
 * Filter tabs + text search. Expand row → matched investigations (amber) + reports (green).
 * ▶ ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts.
 * ◈ SIRACOV button left:941560 bottom:8 zIndex:639.
 * 90-s auto-refresh. Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY = "#29E7FF";
const GR = "#4ADE80";
const AM = "#F59E0B";
const RD = "#EF4444";
const PU = "#A78BFA";
const BG = "rgba(0,10,20,0.96)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT = 941560;
const Z = 639;

const SIRACOV_RE =
  /\bsiracov\b|scenario\s+coverage|scenario\s+action|scenario\s+report|scenario\s+investigation\s+coverage|action\s+coverage|unactionable\s+scenario|scenario\s+backing|scenario\s+documentation\s+gap|scenario\s+actionability/i;

export function isSiracovQuery(text) {
  return SIRACOV_RE.test(text || "");
}

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function keywords(str) {
  if (!str) return [];
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

function scoreMatch(scenarioKws, items, nameField) {
  let best = 0;
  const matches = [];
  for (const item of items) {
    const itemText = [
      item[nameField] || "",
      item.title || "",
      item.name || "",
      item.description || "",
      item.summary || "",
      item.status || "",
    ]
      .join(" ")
      .toLowerCase();
    const hits = scenarioKws.filter((kw) => itemText.includes(kw)).length;
    if (hits > 0) {
      const score = Math.min(100, Math.round((hits / Math.max(1, scenarioKws.length)) * 100));
      matches.push({ item, score });
      if (score > best) best = score;
    }
  }
  matches.sort((a, b) => b.score - a.score);
  return { matches: matches.slice(0, 5), best };
}

async function fetchAll() {
  const base = apiBase();
  const [sRes, iRes, rRes] = await Promise.allSettled([
    fetch(`${base}/v1/scenario/list`, { headers: authHdr() }),
    fetch(`${base}/v1/investigations`, { headers: authHdr() }),
    fetch(`${base}/v1/reports`, { headers: authHdr() }),
  ]);

  const toArr = (res) => {
    if (res.status !== "fulfilled" || !res.value.ok) return [];
    return res.value.json().then((d) =>
      Array.isArray(d) ? d : d.items ?? d.results ?? d.data ?? []
    );
  };

  const [scenarios, investigations, reports] = await Promise.all([
    toArr(sRes),
    toArr(iRes),
    toArr(rRes),
  ]);

  return { scenarios, investigations, reports };
}

function classify(scenario, investigations, reports) {
  const kws = keywords(
    [scenario.name, scenario.title, scenario.description, scenario.summary, scenario.id]
      .filter(Boolean)
      .join(" ")
  );
  if (kws.length === 0) {
    return { invMatches: [], repMatches: [], classification: "UNACTIONABLE" };
  }
  const { matches: invMatches } = scoreMatch(kws, investigations, "title");
  const { matches: repMatches } = scoreMatch(kws, reports, "title");
  const hasInv = invMatches.length > 0;
  const hasRep = repMatches.length > 0;
  let classification;
  if (hasInv && hasRep) classification = "FULLY_ACTIONABLE";
  else if (hasInv) classification = "INVESTIGATED_ONLY";
  else if (hasRep) classification = "REPORTED_ONLY";
  else classification = "UNACTIONABLE";
  return { invMatches, repMatches, classification };
}

export async function buildSiracovScript() {
  try {
    const { scenarios, investigations, reports } = await fetchAll();
    const rows = scenarios.map((s) => classify(s, investigations, reports));
    const fully = rows.filter((r) => r.classification === "FULLY_ACTIONABLE").length;
    const invOnly = rows.filter((r) => r.classification === "INVESTIGATED_ONLY").length;
    const repOnly = rows.filter((r) => r.classification === "REPORTED_ONLY").length;
    const unact = rows.filter((r) => r.classification === "UNACTIONABLE").length;
    const base = apiBase();
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...authHdr(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Scenario action coverage: ${scenarios.length} scenarios analysed against ${investigations.length} investigations and ${reports.length} reports. ${fully} fully actionable (both investigation + report), ${invOnly} investigation-only, ${repOnly} report-only, ${unact} unactionable (no backing). Give a two-sentence operational assessment of scenario readiness and which gaps require urgent investigation or documentation.`,
      }),
    });
    if (r.ok) {
      const d = await r.json();
      return (
        d.response ||
        d.answer ||
        d.text ||
        `Scenario coverage: ${fully}/${scenarios.length} fully actionable. ${unact} scenarios lack both investigation and report backing.`
      );
    }
  } catch { /* fall through */ }
  try {
    const { scenarios, investigations, reports } = await fetchAll();
    const rows = scenarios.map((s) => classify(s, investigations, reports));
    const fully = rows.filter((r) => r.classification === "FULLY_ACTIONABLE").length;
    const unact = rows.filter((r) => r.classification === "UNACTIONABLE").length;
    return `Scenario coverage: ${scenarios.length} total, ${fully} fully actionable against ${investigations.length} investigations and ${reports.length} reports. ${unact} unactionable scenarios require urgent backing.`;
  } catch {
    return "Scenario investigation report coverage data unavailable.";
  }
}

const CLASS_COLOR = {
  FULLY_ACTIONABLE: GR,
  INVESTIGATED_ONLY: AM,
  REPORTED_ONLY: CY,
  UNACTIONABLE: RD,
};
const CLASS_LABEL = {
  FULLY_ACTIONABLE: "FULLY ACTIONABLE",
  INVESTIGATED_ONLY: "INVESTIGATED ONLY",
  REPORTED_ONLY: "REPORTED ONLY",
  UNACTIONABLE: "UNACTIONABLE",
};
const TABS = ["ALL", "FULLY_ACTIONABLE", "INVESTIGATED_ONLY", "REPORTED_ONLY", "UNACTIONABLE"];

export default function ScenarioInvestigationReportCoverage() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [scenarioCount, setScenarioCount] = useState(0);
  const [invCount, setInvCount] = useState(0);
  const [repCount, setRepCount] = useState(0);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { scenarios, investigations, reports } = await fetchAll();
      setScenarioCount(scenarios.length);
      setInvCount(investigations.length);
      setRepCount(reports.length);
      const enriched = scenarios.map((s) => {
        const { invMatches, repMatches, classification } = classify(
          s,
          investigations,
          reports
        );
        return {
          id: s.id ?? s._id ?? Math.random().toString(36).slice(2),
          name: s.name || s.title || "(unnamed scenario)",
          description: s.description || s.summary || "",
          status: s.status || "",
          classification,
          invMatches,
          repMatches,
        };
      });
      const order = {
        UNACTIONABLE: 0,
        INVESTIGATED_ONLY: 1,
        REPORTED_ONLY: 2,
        FULLY_ACTIONABLE: 3,
      };
      enriched.sort((a, b) => (order[a.classification] ?? 4) - (order[b.classification] ?? 4));
      setRows(enriched);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((o) => {
        if (!o) load();
        return !o;
      });
    };
    window.addEventListener("jarvis:siracov-toggle", onToggle);
    return () => window.removeEventListener("jarvis:siracov-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    setAssessText("");
    try {
      const script = await buildSiracovScript();
      setAssessText(script);
      const voice = getActiveVoice?.() || "ash";
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: script, voice }),
      });
    } catch {
      setAssessText("Assessment unavailable.");
    }
    setAssessing(false);
  }

  const fully = rows.filter((r) => r.classification === "FULLY_ACTIONABLE").length;
  const invOnly = rows.filter((r) => r.classification === "INVESTIGATED_ONLY").length;
  const repOnly = rows.filter((r) => r.classification === "REPORTED_ONLY").length;
  const unact = rows.filter((r) => r.classification === "UNACTIONABLE").length;

  const visible = rows.filter((r) => {
    if (tab !== "ALL" && r.classification !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
    }
    return true;
  });

  const tile = (label, val, col, pulse) => (
    <div key={label} style={{ textAlign: "center", minWidth: 90 }}>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: col,
          letterSpacing: 1,
          animation:
            pulse && val > 0 ? "sirapulse 1.4s ease-in-out infinite" : "none",
        }}
      >
        {val}
      </div>
      <div
        style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1, marginTop: 2 }}
      >
        {label}
      </div>
    </div>
  );

  const classBadge = (cls) => (
    <span
      style={{
        fontSize: 9,
        padding: "1px 6px",
        borderRadius: 4,
        background: `${CLASS_COLOR[cls]}22`,
        color: CLASS_COLOR[cls],
        border: `1px solid ${CLASS_COLOR[cls]}55`,
        letterSpacing: 1,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {CLASS_LABEL[cls]}
    </span>
  );

  if (!open)
    return (
      <button
        onClick={() => {
          setOpen(true);
          load();
        }}
        title="Scenario × Investigation × Report Action Coverage"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z,
          padding: "3px 9px",
          borderRadius: 5,
          cursor: "pointer",
          background: "rgba(0,10,20,0.7)",
          border: `1px solid ${AM}55`,
          color: AM,
          fontFamily: MN,
          fontSize: 10,
          letterSpacing: 1,
          boxShadow: `0 0 8px ${AM}33`,
          animation:
            unact > 0 ? "sirapulse 2s ease-in-out infinite" : "none",
        }}
      >
        ◈ SIRACOV
      </button>
    );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: Z,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,5,12,0.82)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          width: "min(860px,96vw)",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          background: BG,
          border: `1px solid ${AM}44`,
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: `0 0 60px ${AM}18`,
          fontFamily: MN,
        }}
      >
        {/* header */}
        <div
          style={{
            padding: "14px 18px",
            borderBottom: `1px solid ${AM}22`,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              color: AM,
              fontWeight: 700,
              letterSpacing: 2,
              fontSize: 13,
            }}
          >
            ◈ SCENARIO ACTION COVERAGE
          </span>
          {unact > 0 && (
            <span
              style={{
                fontSize: 10,
                color: RD,
                letterSpacing: 1,
                animation: "sirapulse 1.4s ease-in-out infinite",
              }}
            >
              ⚠ {unact} UNACTIONABLE
            </span>
          )}
          {loading && (
            <span style={{ color: "#6E8AA0", fontSize: 10 }}>
              refreshing…
            </span>
          )}
          {err && (
            <span style={{ color: RD, fontSize: 10 }}>⚠ {err}</span>
          )}
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              marginLeft: "auto",
              padding: "3px 10px",
              borderRadius: 5,
              cursor: "pointer",
              background: assessing ? "#2a1a0a" : `${AM}22`,
              border: `1px solid ${AM}55`,
              color: AM,
              fontFamily: MN,
              fontSize: 10,
            }}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              padding: "3px 8px",
              borderRadius: 5,
              cursor: "pointer",
              background: "transparent",
              border: `1px solid #334`,
              color: "#6E8AA0",
              fontFamily: MN,
              fontSize: 11,
            }}
          >
            ✕
          </button>
        </div>

        {/* stat tiles */}
        <div
          style={{
            display: "flex",
            gap: 24,
            padding: "12px 18px",
            borderBottom: `1px solid ${AM}18`,
            flexWrap: "wrap",
          }}
        >
          {tile("SCENARIOS", scenarioCount, CY, false)}
          {tile("FULLY ACTIONABLE", fully, GR, false)}
          {tile("INVESTIGATED", invOnly, AM, false)}
          {tile("REPORTED", repOnly, CY, false)}
          {tile("UNACTIONABLE", unact, RD, true)}
        </div>

        {/* meta bar */}
        <div
          style={{
            padding: "4px 18px",
            borderBottom: `1px solid ${AM}12`,
            fontSize: 10,
            color: "#4A5568",
            display: "flex",
            gap: 16,
          }}
        >
          <span>📋 {invCount} investigations</span>
          <span>📄 {repCount} reports</span>
        </div>

        {/* assess output */}
        {assessText && (
          <div
            style={{
              margin: "8px 18px",
              padding: "8px 12px",
              borderRadius: 8,
              background: `${AM}11`,
              border: `1px solid ${AM}33`,
              color: "#DCEBF5",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {assessText}
          </div>
        )}

        {/* filter tabs + search */}
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "8px 18px",
            borderBottom: `1px solid ${AM}18`,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "2px 10px",
                borderRadius: 4,
                cursor: "pointer",
                background:
                  tab === t ? `${CLASS_COLOR[t] || AM}22` : "transparent",
                border: `1px solid ${
                  tab === t ? CLASS_COLOR[t] || AM : "#334"
                }`,
                color: tab === t ? CLASS_COLOR[t] || AM : "#6E8AA0",
                fontFamily: MN,
                fontSize: 10,
              }}
            >
              {t === "ALL" ? "ALL" : CLASS_LABEL[t]}
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search scenario…"
            style={{
              marginLeft: "auto",
              padding: "3px 10px",
              borderRadius: 5,
              background: "rgba(0,20,40,0.8)",
              border: `1px solid ${AM}33`,
              color: "#DCEBF5",
              fontFamily: MN,
              fontSize: 11,
              width: 190,
              outline: "none",
            }}
          />
        </div>

        {/* scenario rows */}
        <div style={{ overflowY: "auto", flex: 1, padding: "8px 18px" }}>
          {visible.length === 0 && !loading && (
            <div
              style={{
                color: "#6E8AA0",
                fontSize: 12,
                padding: "24px 0",
                textAlign: "center",
              }}
            >
              {err ? "Load failed." : "No scenarios match."}
            </div>
          )}
          {visible.map((row) => {
            const isUnact = row.classification === "UNACTIONABLE";
            const isExp = expanded === row.id;
            return (
              <div
                key={row.id}
                style={{
                  borderBottom: `1px solid ${AM}11`,
                  padding: "7px 0",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: "pointer",
                  }}
                  onClick={() => setExpanded(isExp ? null : row.id)}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: CLASS_COLOR[row.classification],
                      boxShadow: isUnact ? `0 0 8px ${RD}` : "none",
                      animation: isUnact
                        ? "sirapulse 1.2s ease-in-out infinite"
                        : "none",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        color: isUnact ? "#FFCCCC" : "#DCEBF5",
                        fontSize: 12,
                        fontWeight: isUnact ? 700 : 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {row.name}
                    </div>
                    {row.description && (
                      <div
                        style={{
                          fontSize: 10,
                          color: "#6E8AA0",
                          marginTop: 2,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {row.description}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                    {classBadge(row.classification)}
                    <span style={{ fontSize: 9, color: "#4A5568" }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>
                </div>

                {isExp && (
                  <div
                    style={{
                      marginTop: 8,
                      paddingLeft: 18,
                      display: "flex",
                      gap: 16,
                      flexWrap: "wrap",
                    }}
                  >
                    {/* investigations */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div
                        style={{
                          fontSize: 10,
                          color: AM,
                          letterSpacing: 1,
                          marginBottom: 4,
                        }}
                      >
                        INVESTIGATIONS ({row.invMatches.length})
                      </div>
                      {row.invMatches.length === 0 ? (
                        <div style={{ fontSize: 10, color: "#4A5568" }}>
                          none matched
                        </div>
                      ) : (
                        row.invMatches.map(({ item, score }, i) => (
                          <div
                            key={i}
                            style={{ marginBottom: 4 }}
                          >
                            <div
                              style={{
                                fontSize: 11,
                                color: "#DCEBF5",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {item.title || item.name || "(untitled)"}
                            </div>
                            <div
                              style={{
                                height: 3,
                                borderRadius: 2,
                                background: `${AM}22`,
                                marginTop: 2,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  width: `${score}%`,
                                  background: AM,
                                  borderRadius: 2,
                                }}
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* reports */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div
                        style={{
                          fontSize: 10,
                          color: GR,
                          letterSpacing: 1,
                          marginBottom: 4,
                        }}
                      >
                        REPORTS ({row.repMatches.length})
                      </div>
                      {row.repMatches.length === 0 ? (
                        <div style={{ fontSize: 10, color: "#4A5568" }}>
                          none matched
                        </div>
                      ) : (
                        row.repMatches.map(({ item, score }, i) => (
                          <div
                            key={i}
                            style={{ marginBottom: 4 }}
                          >
                            <div
                              style={{
                                fontSize: 11,
                                color: "#DCEBF5",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {item.title || item.name || "(untitled)"}
                            </div>
                            <div
                              style={{
                                height: 3,
                                borderRadius: 2,
                                background: `${GR}22`,
                                marginTop: 2,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  width: `${score}%`,
                                  background: GR,
                                  borderRadius: 2,
                                }}
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div
          style={{
            padding: "6px 18px",
            borderTop: `1px solid ${AM}18`,
            fontSize: 10,
            color: "#4A5568",
            letterSpacing: 1,
          }}
        >
          {visible.length} of {rows.length} · auto-refresh 90 s ·
          /v1/scenario/list × /v1/investigations × /v1/reports
        </div>
      </div>
      <style>{`@keyframes sirapulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.5)}}`}</style>
    </div>
  );
}
