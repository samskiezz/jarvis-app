/**
 * RiskTaskBlockingMap — F300
 * Fetches /entities/RiskSignal + /entities/Task; keyword-matches each risk
 * against task names/descriptions to surface potentially affected missions.
 * Severity-sorted; CRITICAL risks pulse red; stat tiles (total risks, tasks
 * affected, critical count, gap count); expandable rows show matched tasks.
 * ◈ RTMAP toggle; voice "risk tasks"/"blocked tasks"/"risk blocking"/"task risk map".
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

const RISK_TASK_RE =
  /\brisk.?task(s)?\b|\bblocked.?task(s)?\b|\btask.?risk\b|\brisk.?block\b|\brtmap\b|\baffected.?mission(s)?\b|\btask.?threat\b|\brisk.?mission(s)?\b/i;

export function isRiskTaskQuery(text) {
  return RISK_TASK_RE.test(text || "");
}

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function sevColor(sev) {
  const s = (sev || "").toLowerCase();
  if (s === "critical") return RD;
  if (s === "high") return AM;
  if (s === "medium") return CY;
  if (s === "low") return GR;
  return "#888";
}

function tokenize(str) {
  return (str || "")
    .toLowerCase()
    .split(/[\s,;:\-_/()[\]{}\.]+/)
    .filter((t) => t.length >= 4);
}

function matchTasks(risk, tasks) {
  const riskTokens = tokenize((risk.title || "") + " " + (risk.description || ""));
  return tasks.filter((t) => {
    const taskTokens = tokenize((t.title || t.name || "") + " " + (t.description || ""));
    return riskTokens.some((rt) => taskTokens.includes(rt));
  });
}

export async function buildRiskTaskScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [rr, tr] = await Promise.allSettled([
    fetch(`${base}/entities/RiskSignal`, { headers }),
    fetch(`${base}/entities/Task`, { headers }),
  ]);
  if (rr.status !== "fulfilled" || !rr.value.ok)
    return "Risk signal data unavailable, sir.";
  if (tr.status !== "fulfilled" || !tr.value.ok)
    return "Task data unavailable, sir.";
  const rd = await rr.value.json();
  const td = await tr.value.json();
  const risks = Array.isArray(rd)
    ? rd
    : rd.risks || rd.items || rd.data || [];
  const tasks = Array.isArray(td)
    ? td
    : td.tasks || td.items || td.data || [];
  if (!risks.length) return "No active risk signals found, sir.";
  const criticals = risks.filter(
    (r) => (r.severity || r.level || "").toLowerCase() === "critical",
  );
  let totalAffected = 0;
  risks.forEach((r) => {
    totalAffected += matchTasks(r, tasks).length;
  });
  return (
    `Risk-to-task analysis complete, sir. ${risks.length} active risk signals identified, ` +
    `${criticals.length} critical. Approximately ${totalAffected} task-risk intersections detected ` +
    `across ${tasks.length} missions. ` +
    (criticals.length
      ? `Critical threats: ${criticals
          .slice(0, 3)
          .map((r) => r.title || r.name || "unnamed")
          .join(", ")}.`
      : "No critical risks at this time.")
  );
}

export default function RiskTaskBlockingMap() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [filter, setFilter] = useState("all");
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [rr, tr] = await Promise.allSettled([
        fetch(`${base}/entities/RiskSignal`, { headers }),
        fetch(`${base}/entities/Task`, { headers }),
      ]);
      const rOk = rr.status === "fulfilled" && rr.value.ok;
      const tOk = tr.status === "fulfilled" && tr.value.ok;
      const rd = rOk ? await rr.value.json() : null;
      const td = tOk ? await tr.value.json() : null;
      const risks = rd
        ? Array.isArray(rd)
          ? rd
          : rd.risks || rd.items || rd.data || []
        : [];
      const allTasks = td
        ? Array.isArray(td)
          ? td
          : td.tasks || td.items || td.data || []
        : [];
      const mapped = risks
        .map((r) => ({ ...r, _matched: matchTasks(r, allTasks) }))
        .sort((a, b) => {
          const sa = SEV_ORDER[(a.severity || a.level || "").toLowerCase()] ?? 9;
          const sb = SEV_ORDER[(b.severity || b.level || "").toLowerCase()] ?? 9;
          return sa - sb;
        });
      setRows(mapped);
      setTasks(allTasks);
    } catch {}
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:risk-task-map-toggle", onToggle);
    return () => window.removeEventListener("jarvis:risk-task-map-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, fetchData]);

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildRiskTaskScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const answer = (d.answer || script).replace(/<<ACTION:[^>]*>>/g, "").trim();
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }),
      );
    } catch {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Risk-task assessment unavailable." },
        }),
      );
    }
    setAssessing(false);
  }

  function toggleRow(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const criticals = rows.filter(
    (r) => (r.severity || r.level || "").toLowerCase() === "critical",
  );
  const withTasks = rows.filter((r) => r._matched.length > 0);
  const noTasks = rows.filter((r) => r._matched.length === 0);

  const visible =
    filter === "critical"
      ? criticals
      : filter === "affected"
      ? withTasks
      : filter === "gap"
      ? noTasks
      : rows;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Risk × Task Blocking Map"
        style={{
          position: "fixed",
          left: 58440,
          bottom: 8,
          zIndex: 113,
          background: open ? RD : "rgba(5,8,13,0.75)",
          border: `1px solid ${open ? RD : "rgba(255,68,68,0.35)"}`,
          color: open ? "#fff" : RD,
          fontFamily: "monospace",
          fontSize: 10,
          padding: "3px 7px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: "0.05em",
        }}
      >
        ◈ RTMAP
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            right: 18,
            bottom: 90,
            zIndex: 9200,
            width: 340,
            maxHeight: "72vh",
            background: "rgba(5,8,13,0.93)",
            border: `1px solid ${RD}`,
            borderRadius: 8,
            padding: 14,
            fontFamily: "monospace",
            color: CY,
            boxShadow: `0 0 20px rgba(255,68,68,0.18)`,
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <span
              style={{
                fontSize: 11,
                letterSpacing: "0.12em",
                fontWeight: "bold",
                color: RD,
              }}
            >
              ◈ RISK × TASK BLOCKING MAP
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: CY,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ✕
            </button>
          </div>

          {loading && !rows.length && (
            <div
              style={{
                textAlign: "center",
                fontSize: 11,
                opacity: 0.6,
                padding: "12px 0",
              }}
            >
              cross-referencing risks vs missions…
            </div>
          )}

          {rows.length > 0 && (
            <>
              {/* Stat tiles */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr",
                  gap: 5,
                  marginBottom: 10,
                }}
              >
                {[
                  { label: "RISKS", val: rows.length, col: RD },
                  { label: "CRITICAL", val: criticals.length, col: RD },
                  {
                    label: "AFFECTED",
                    val: withTasks.length,
                    col: AM,
                  },
                  { label: "NO MATCH", val: noTasks.length, col: GR },
                ].map(({ label, val, col }) => (
                  <div
                    key={label}
                    style={{
                      background: "rgba(255,68,68,0.05)",
                      borderRadius: 4,
                      padding: "5px 3px",
                      textAlign: "center",
                      border: "1px solid rgba(255,68,68,0.15)",
                    }}
                  >
                    <div
                      style={{ fontSize: 14, fontWeight: "bold", color: col }}
                    >
                      {val}
                    </div>
                    <div style={{ fontSize: 8, opacity: 0.5, marginTop: 1 }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Filter tabs */}
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  marginBottom: 8,
                  flexWrap: "wrap",
                }}
              >
                {[
                  { key: "all", label: "ALL" },
                  { key: "critical", label: "CRITICAL" },
                  { key: "affected", label: "AFFECTED" },
                  { key: "gap", label: "NO MATCH" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    style={{
                      background:
                        filter === key ? RD : "rgba(255,68,68,0.07)",
                      border: `1px solid ${filter === key ? RD : "rgba(255,68,68,0.25)"}`,
                      color: filter === key ? "#fff" : RD,
                      fontFamily: "monospace",
                      fontSize: 9,
                      padding: "2px 6px",
                      borderRadius: 3,
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Risk rows */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  maxHeight: "38vh",
                  marginBottom: 8,
                }}
              >
                {visible.length === 0 && (
                  <div
                    style={{
                      textAlign: "center",
                      opacity: 0.5,
                      fontSize: 10,
                      padding: "10px 0",
                    }}
                  >
                    no risks in this filter
                  </div>
                )}
                {visible.map((risk, i) => {
                  const sev = (risk.severity || risk.level || "unknown").toUpperCase();
                  const col = sevColor(risk.severity || risk.level);
                  const id = risk.id || risk._id || i;
                  const isExpanded = expanded[id];
                  const matched = risk._matched || [];
                  return (
                    <div
                      key={id}
                      style={{
                        borderBottom: "1px solid rgba(255,68,68,0.1)",
                        paddingBottom: 6,
                        marginBottom: 6,
                      }}
                    >
                      <div
                        onClick={() => matched.length > 0 && toggleRow(id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          cursor: matched.length > 0 ? "pointer" : "default",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 8,
                            background: `${col}22`,
                            border: `1px solid ${col}`,
                            color: col,
                            borderRadius: 3,
                            padding: "1px 4px",
                            letterSpacing: "0.06em",
                            minWidth: 44,
                            textAlign: "center",
                          }}
                        >
                          {sev}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            fontSize: 10,
                            color: "#DCEBF5",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {risk.title || risk.name || `Risk #${id}`}
                        </span>
                        {matched.length > 0 && (
                          <span
                            style={{
                              fontSize: 9,
                              color: AM,
                              background: "rgba(255,184,0,0.12)",
                              border: "1px solid rgba(255,184,0,0.3)",
                              borderRadius: 3,
                              padding: "1px 4px",
                            }}
                          >
                            {matched.length}▾
                          </span>
                        )}
                      </div>
                      {isExpanded && matched.length > 0 && (
                        <div
                          style={{
                            marginTop: 5,
                            paddingLeft: 10,
                            borderLeft: `2px solid ${col}44`,
                          }}
                        >
                          {matched.slice(0, 5).map((t, ti) => (
                            <div
                              key={t.id || t._id || ti}
                              style={{
                                fontSize: 9,
                                color: "#A0B8C8",
                                padding: "2px 0",
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 8,
                                  color: CY,
                                  background: "rgba(41,231,255,0.08)",
                                  border: "1px solid rgba(41,231,255,0.2)",
                                  borderRadius: 2,
                                  padding: "0 3px",
                                }}
                              >
                                {(t.status || "?").toLowerCase()}
                              </span>
                              {t.title || t.name || `Task ${ti + 1}`}
                            </div>
                          ))}
                          {matched.length > 5 && (
                            <div
                              style={{
                                fontSize: 9,
                                opacity: 0.5,
                                paddingTop: 2,
                              }}
                            >
                              +{matched.length - 5} more
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Assess button */}
          <button
            onClick={assess}
            disabled={assessing || !rows.length}
            style={{
              width: "100%",
              background: "rgba(255,68,68,0.08)",
              border: `1px solid ${RD}`,
              color: RD,
              fontFamily: "monospace",
              fontSize: 10,
              padding: "5px 0",
              borderRadius: 4,
              cursor: assessing || !rows.length ? "not-allowed" : "pointer",
              letterSpacing: "0.08em",
              opacity: assessing || !rows.length ? 0.5 : 1,
            }}
          >
            {assessing ? "▶ ASSESSING…" : "▶ ASSESS — JARVIS BRIEF"}
          </button>
        </div>
      )}
    </>
  );
}
