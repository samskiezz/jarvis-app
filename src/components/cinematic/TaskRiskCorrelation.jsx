/**
 * TaskRiskCorrelation — F46.
 *
 * Data sources (confirmed-real endpoints):
 *   GET /entities/Task         → open mission tasks
 *   GET /entities/RiskSignal   → active risk signals
 *
 * For each RiskSignal, keyword-matches against Task titles/descriptions to
 * classify as MITIGATED (≥1 task addresses it) or EXPOSED (no task covers it).
 *
 * Displays:
 *   - Stat tiles: total risks / mitigated / exposed
 *   - ALL / MITIGATED / EXPOSED / CRITICAL filter tabs
 *   - Per-risk row: severity chip + title + matched task chips on expand
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle: ◈ TRISK at bottom strip, zIndex:153.
 * Badge: red=exposed count, green=all mitigated.
 * 90 s auto-refresh.
 *
 * Voice triggers: "task risk"/"trisk"/"risk tasks"/"risk task coverage"/
 *   "which risks have tasks"/"unmitigated risks"
 *
 * Exports isTaskRiskQuery / buildTaskRiskScript for JarvisBrain.
 * Mounted in src/App.jsx.
 */
import { useEffect, useRef, useState } from "react";

const API = import.meta.env.VITE_API_URL ?? "";
const CY = "#29E7FF";
const AM = "#FFB340";
const RD = "#FF4444";
const GR = "#00c878";
const DM = "rgba(5,12,20,0.93)";
const MONO = "'JetBrains Mono','Courier New',monospace";
const SANS = "'Inter',system-ui,sans-serif";

export function isTaskRiskQuery(q) {
  return /\b(task\s*risk|trisk|risk\s*tasks?|risk\s*task\s*coverage|which risks have tasks|unmitigated risks|mitigated risks)\b/i.test(q);
}

export function buildTaskRiskScript(rows) {
  const exposed = rows.filter((r) => r.status === "EXPOSED");
  const mitigated = rows.filter((r) => r.status === "MITIGATED");
  return (
    `Task-risk coverage: ${mitigated.length} risks mitigated, ${exposed.length} exposed. ` +
    (exposed.length
      ? `Top exposed: ${exposed.slice(0, 3).map((r) => r.risk.title || r.risk.id).join(", ")}.`
      : "All active risks have matching tasks.")
  );
}

function sev(r) {
  const s = String(r.severity ?? r.level ?? "medium").toLowerCase();
  if (s === "critical") return 4;
  if (s === "high") return 3;
  if (s === "medium") return 2;
  return 1;
}

function sevColor(r) {
  const s = sev(r);
  if (s === 4) return RD;
  if (s === 3) return AM;
  if (s === 2) return CY;
  return GR;
}

function keywords(obj) {
  return [
    obj.title ?? "",
    obj.name ?? "",
    obj.description ?? "",
    obj.signal ?? "",
    obj.category ?? "",
    obj.type ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
}

function correlate(risks, tasks) {
  return risks.map((risk) => {
    const rk = keywords(risk);
    const matched = tasks.filter((t) => {
      const tk = keywords(t);
      return rk.some((w) => tk.includes(w));
    });
    return {
      risk,
      tasks: matched,
      status: matched.length > 0 ? "MITIGATED" : "EXPOSED",
    };
  });
}

export default function TaskRiskCorrelation() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("ALL");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [tr, rr] = await Promise.all([
        fetch(`${API}/entities/Task`),
        fetch(`${API}/entities/RiskSignal`),
      ]);
      const [td, rd] = await Promise.all([tr.json(), rr.json()]);
      const tasks = Array.isArray(td) ? td : (td.items ?? td.results ?? []);
      const risks = Array.isArray(rd) ? rd : (rd.items ?? rd.results ?? []);
      setRows(correlate(risks, tasks));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open]);

  useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener("jarvis:trisk-show", h);
    return () => window.removeEventListener("jarvis:trisk-show", h);
  }, []);

  async function assess() {
    if (!rows.length) return;
    setAssessing(true);
    setAssessText("");
    const script = buildTaskRiskScript(rows);
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Briefly assess this task-risk coverage in 2 sentences: ${script}` }),
      });
      const d = await r.json();
      const text = d.response ?? d.message ?? d.content ?? script;
      setAssessText(text);
      await fetch(`${API}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
    } catch {
      setAssessText(script);
    } finally {
      setAssessing(false);
    }
  }

  const exposed = rows.filter((r) => r.status === "EXPOSED");
  const mitigated = rows.filter((r) => r.status === "MITIGATED");
  const critical = rows.filter((r) => sev(r.risk) === 4);

  const visible = rows.filter((r) => {
    if (tab === "MITIGATED") return r.status === "MITIGATED";
    if (tab === "EXPOSED") return r.status === "EXPOSED";
    if (tab === "CRITICAL") return sev(r.risk) === 4;
    return true;
  });

  const badge = exposed.length > 0 ? exposed.length : null;
  const badgeColor = exposed.length > 0 ? RD : GR;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: 11800, zIndex: 153,
          background: "rgba(5,12,20,0.82)", border: `1px solid ${RD}44`,
          color: RD, fontFamily: MONO, fontSize: 9, letterSpacing: 1.5,
          padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ TRISK
        {badge && (
          <span style={{
            background: badgeColor, color: "#000", borderRadius: 3,
            padding: "1px 4px", fontSize: 9, fontWeight: 700,
          }}>
            {badge}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 18, width: 460, maxHeight: "82vh",
      background: DM, border: `1px solid ${RD}44`, borderTop: `2px solid ${RD}`,
      borderRadius: 10, zIndex: 9800, display: "flex", flexDirection: "column",
      boxShadow: `0 0 40px ${RD}18`, fontFamily: SANS, overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
        borderBottom: `1px solid ${RD}22`,
      }}>
        <span style={{ fontFamily: MONO, color: RD, fontSize: 11 }}>◈</span>
        <span style={{ flex: 1, color: CY, fontFamily: MONO, fontSize: 12, letterSpacing: 1.5 }}>
          TASK × RISK CORRELATION
        </span>
        <span style={{ color: "#3a5060", fontFamily: MONO, fontSize: 9 }}>90s</span>
        <button onClick={load} disabled={loading} style={btnStyle(CY)}>↺</button>
        <button onClick={() => setOpen(false)} style={btnStyle("#3a5060")}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px" }}>
        {[
          { label: "RISKS", val: rows.length, color: CY },
          { label: "MITIGATED", val: mitigated.length, color: GR },
          { label: "EXPOSED", val: exposed.length, color: RD },
          { label: "CRITICAL", val: critical.length, color: AM },
        ].map((t) => (
          <div key={t.label} style={{
            flex: 1, background: `${t.color}11`, border: `1px solid ${t.color}33`,
            borderRadius: 6, padding: "5px 8px", textAlign: "center",
          }}>
            <div style={{ color: t.color, fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>{t.val}</div>
            <div style={{ color: "#3a5060", fontFamily: MONO, fontSize: 8, letterSpacing: 1.5 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px" }}>
        {["ALL", "MITIGATED", "EXPOSED", "CRITICAL"].map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "3px 10px", borderRadius: 4, fontSize: 10, fontFamily: MONO,
            letterSpacing: 1, cursor: "pointer", border: "none",
            background: tab === t ? RD : "rgba(255,68,68,0.08)",
            color: tab === t ? "#000" : "#7aafbf",
          }}>{t}</button>
        ))}
        <button onClick={assess} disabled={assessing || !rows.length} style={{
          marginLeft: "auto", padding: "3px 10px", borderRadius: 4,
          fontSize: 10, fontFamily: MONO, letterSpacing: 1, cursor: "pointer",
          border: `1px solid ${CY}44`, background: "transparent", color: CY,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* assess text */}
      {assessText && (
        <div style={{
          margin: "0 14px 8px", padding: "8px 10px", background: `${CY}0a`,
          border: `1px solid ${CY}22`, borderRadius: 6, color: "#a0c8d8",
          fontSize: 11, lineHeight: 1.5,
        }}>
          {assessText}
        </div>
      )}

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 8px 10px" }}>
        {loading && <Dim>Loading…</Dim>}
        {err && <Dim style={{ color: RD }}>Error: {err}</Dim>}
        {!loading && !err && visible.length === 0 && <Dim>No results.</Dim>}
        {visible
          .sort((a, b) => sev(b.risk) - sev(a.risk))
          .map((row, i) => {
            const isExp = expanded === i;
            const sc = sevColor(row.risk);
            return (
              <div key={i} style={{
                marginBottom: 4, borderRadius: 6, border: `1px solid ${sc}22`,
                background: isExp ? `${sc}08` : "transparent", overflow: "hidden",
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 10px", cursor: "pointer",
                  }}
                >
                  <span style={{
                    fontFamily: MONO, fontSize: 9, letterSpacing: 1,
                    color: sc, border: `1px solid ${sc}44`, borderRadius: 3,
                    padding: "1px 5px", flexShrink: 0,
                  }}>
                    {String(row.risk.severity ?? row.risk.level ?? "med").toUpperCase()}
                  </span>
                  <span style={{ flex: 1, color: "#C0DCE8", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.risk.title ?? row.risk.signal ?? row.risk.id}
                  </span>
                  <span style={{
                    fontFamily: MONO, fontSize: 9, letterSpacing: 1,
                    color: row.status === "MITIGATED" ? GR : RD,
                  }}>
                    {row.status}
                  </span>
                  <span style={{ color: "#3a5060", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>
                {isExp && (
                  <div style={{ padding: "0 10px 10px" }}>
                    {row.tasks.length > 0 ? (
                      <>
                        <div style={{ color: "#3a5060", fontFamily: MONO, fontSize: 9, letterSpacing: 1.5, marginBottom: 5 }}>MATCHING TASKS</div>
                        {row.tasks.map((t, ti) => (
                          <div key={ti} style={{
                            background: `${GR}0d`, border: `1px solid ${GR}22`,
                            borderRadius: 4, padding: "4px 8px", marginBottom: 4,
                            color: "#a0d8b8", fontSize: 11,
                          }}>
                            {t.title ?? t.name ?? t.id}
                            {t.status && (
                              <span style={{ marginLeft: 8, fontFamily: MONO, fontSize: 9, color: "#3a5060" }}>
                                [{t.status}]
                              </span>
                            )}
                          </div>
                        ))}
                      </>
                    ) : (
                      <div style={{ color: RD, fontSize: 11, fontFamily: MONO }}>No matching tasks found.</div>
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

function btnStyle(color) {
  return {
    background: "transparent", border: `1px solid ${color}44`,
    color, fontFamily: MONO, fontSize: 11, padding: "2px 7px",
    borderRadius: 4, cursor: "pointer",
  };
}

function Dim({ children, style }) {
  return (
    <div style={{
      padding: "14px", color: "#3a5060", fontFamily: MONO,
      fontSize: 11, textAlign: "center", ...style,
    }}>
      {children}
    </div>
  );
}
