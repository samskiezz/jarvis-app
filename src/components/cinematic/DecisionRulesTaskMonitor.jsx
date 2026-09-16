/**
 * DecisionRulesTaskMonitor — F487
 * "JARVIS, rules task / task rules / rule coverage / task monitoring /
 *  rtkmon / which tasks have rules / unmonitored tasks / task decision rules"
 * Cross-references /v1/rules + /entities/Task to surface RULE-BACKED tasks
 * (covered by ≥1 active watchtower decision rule) vs UNMONITORED tasks
 * (no automation coverage — manual execution risk).
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const RED = "#FF4444";
const ORG = "#FF8C42";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 120_000;

const RTKMON_RE =
  /\brtkmon\b|\brules?.task\b|\btask.?rules?\b|\brule.coverage\b|\btask.monitoring\b|\bwhich.tasks.have.rules\b|\bunmonitored.tasks?\b|\btask.decision.rules?\b|\btask.automation.coverage\b|\bbacked.tasks?\b|\brule.backed\b/i;

export function isRtkmonQuery(text) {
  return RTKMON_RE.test(text || "");
}

function normaliseRules(data) {
  if (!data) return [];
  const raw = data.rules || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:       r.id || `rule-${i}`,
    name:     (r.name || r.title || r.label || `Rule ${i + 1}`).trim(),
    target:   (r.target || r.condition_target || r.entity || "").toLowerCase(),
    severity: (r.severity || r.priority || "LOW").toUpperCase(),
    enabled:  r.enabled !== false && r.active !== false && r.status !== "disabled",
    condition: r.condition || r.condition_expr || r.expression || null,
  })).filter(r => r.enabled);
}

function normaliseTasks(data) {
  if (!data) return [];
  const raw = data.tasks || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((t, i) => ({
    id:     t.id || `t-${i}`,
    title:  (t.title || t.name || t.summary || `Task ${i + 1}`).trim(),
    status: (t.status || t.state || "PENDING").toUpperCase(),
    priority: (t.priority || "NORMAL").toUpperCase(),
    tags:   [...(t.tags || []), t.kind, t.type, t.category].filter(Boolean).map(x => String(x).toLowerCase()),
  }));
}

function severityOrder(s) {
  if (s === "CRITICAL") return 0;
  if (s === "HIGH")     return 1;
  if (s === "MEDIUM")   return 2;
  return 3;
}

function severityColor(s) {
  if (s === "CRITICAL") return RED;
  if (s === "HIGH")     return ORG;
  if (s === "MEDIUM")   return "#FFD700";
  return GRN;
}

function tokenise(str) {
  return (str || "").toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean);
}

function matchScore(task, rule) {
  const taskWords = new Set([...tokenise(task.title), ...task.tags]);
  const ruleWords = new Set([...tokenise(rule.name), ...tokenise(rule.target)]);
  let hits = 0;
  for (const w of ruleWords) {
    if (w.length > 3 && taskWords.has(w)) hits++;
  }
  return hits;
}

function classify(tasks, rules) {
  return tasks.map(t => {
    const matched = rules
      .map(r => ({ ...r, score: matchScore(t, r) }))
      .filter(r => r.score > 0)
      .sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity) || b.score - a.score);
    return { ...t, matched, backed: matched.length > 0 };
  });
}

export async function buildRtkmonScript() {
  let rules = [], tasks = [];
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [rr, tr] = await Promise.all([
      fetch(`${base}/v1/rules`,    { headers: hdr }),
      fetch(`${base}/entities/Task`, { headers: hdr }),
    ]);
    if (rr.ok) rules = normaliseRules(await rr.json());
    if (tr.ok) tasks = normaliseTasks(await tr.json());
  } catch (_) {}

  if (!tasks.length) return "Unable to retrieve task rule coverage data at this time, sir.";

  const rows = classify(tasks, rules);
  const backed     = rows.filter(r => r.backed).length;
  const unmonitored = rows.length - backed;
  const pct = rows.length ? Math.round((backed / rows.length) * 100) : 0;

  const parts = [
    `Decision rules task monitor: ${tasks.length} task${tasks.length !== 1 ? "s" : ""} cross-referenced against ${rules.length} active rule${rules.length !== 1 ? "s" : ""}.`,
    `${backed} task${backed !== 1 ? "s are" : " is"} RULE-BACKED with automation coverage — ${pct}% monitored.`,
  ];
  if (unmonitored > 0) {
    parts.push(`${unmonitored} task${unmonitored !== 1 ? "s are" : " is"} UNMONITORED — running without watchtower decision rule support.`);
  } else {
    parts.push("All tasks have active decision rule coverage, sir.");
  }

  return parts.join(" ");
}

export default function DecisionRulesTaskMonitor() {
  const [open,     setOpen]     = useState(false);
  const [rows,     setRows]     = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [lastTs,   setLastTs]   = useState(null);
  const [tab,      setTab]      = useState("ALL");
  const [expanded, setExpanded] = useState(null);
  const [assessing,setAssessing]= useState(false);
  const [brief,    setBrief]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [rr, tr] = await Promise.all([
        fetch(`${base}/v1/rules`,      { headers: hdr }),
        fetch(`${base}/entities/Task`, { headers: hdr }),
      ]);
      const rules = rr.ok ? normaliseRules(await rr.json()) : [];
      const tasks = tr.ok ? normaliseTasks(await tr.json()) : [];
      setRows(classify(tasks, rules));
      setLastTs(Date.now());
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, POLL_MS);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (RTKMON_RE.test(q)) { setOpen(true); load(); }
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:rtkmon-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rtkmon-toggle", onToggle);
  }, []);

  const backed      = rows.filter(r => r.backed).length;
  const unmonitored = rows.length - backed;
  const pct         = rows.length ? Math.round((backed / rows.length) * 100) : 0;

  const filtered = rows.filter(r => {
    if (tab === "BACKED")      return r.backed;
    if (tab === "UNMONITORED") return !r.backed;
    return true;
  });

  const ts = lastTs ? new Date(lastTs).toLocaleTimeString("en-GB", { hour12: false }) : null;

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `RTKMON assessment: ${rows.length} tasks cross-referenced against decision rules. ${backed} are RULE-BACKED (${pct}% coverage); ${unmonitored} are UNMONITORED. In 2 sentences, identify the most critical unmonitored tasks and the recommended automation action to close the coverage gap.`,
        }),
      });
      const d = await r.json();
      setBrief((d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim());
    } catch (_) {
      setBrief("Assessment unavailable — check agent endpoint.");
    }
    setAssessing(false);
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Decision Rules × Task Monitor — F487"
        style={{
          position: "fixed", left: 16080, bottom: 8, zIndex: 77,
          background: open ? CY + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? CY : CY + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : CY,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${CY}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        RTKMON
        {unmonitored > 0 && (
          <span style={{
            background: RED + "33", color: RED,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {unmonitored}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 77,
          width: "min(620px,96vw)", maxHeight: "min(680px,84vh)",
          background: "rgba(4,6,14,0.97)",
          border: `1px solid ${CY}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%",
              background: CY, boxShadow: `0 0 10px ${CY}`,
              display: "inline-block",
              animation: loading ? "rtkpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: CY, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              DECISION RULES × TASK MONITOR
            </span>
            <span style={{ marginLeft: "auto", color: DIM, fontSize: 9 }}>
              {loading ? "SYNCING" : ts ? `UPDATED ${ts}` : "—"} · {POLL_MS / 1000}s
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: DIM,
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>✕</button>
          </div>

          {/* Stats tiles */}
          <div style={{
            display: "flex", gap: 8, padding: "10px 14px",
            borderBottom: `1px solid ${CY}11`,
          }}>
            {[
              { label: "TASKS",      val: rows.length,    col: CY },
              { label: "BACKED",     val: backed,         col: GRN },
              { label: "UNMONITORED",val: unmonitored,    col: unmonitored > 0 ? RED : DIM },
              { label: "COVERAGE",   val: `${pct}%`,      col: pct >= 80 ? GRN : pct >= 50 ? ORG : RED },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1, background: "rgba(255,255,255,0.03)",
                border: `1px solid ${col}22`, borderRadius: 8,
                padding: "8px 10px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 900 }}>{val}</div>
                <div style={{ color: DIM, fontSize: 8, letterSpacing: 2, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 6, padding: "8px 14px",
            borderBottom: `1px solid ${CY}11`,
          }}>
            {["ALL", "BACKED", "UNMONITORED"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? CY + "22" : "none",
                border: `1px solid ${tab === t ? CY + "88" : CY + "22"}`,
                borderRadius: 6, color: tab === t ? CY : DIM,
                cursor: "pointer", padding: "4px 10px",
                fontSize: 9, letterSpacing: 1, fontWeight: 700,
              }}>{t}</button>
            ))}
            <button onClick={assess} disabled={assessing} style={{
              marginLeft: "auto",
              background: assessing ? CY + "33" : "none",
              border: `1px solid ${CY}55`, borderRadius: 6,
              color: CY, cursor: assessing ? "not-allowed" : "pointer",
              padding: "4px 10px", fontSize: 9, letterSpacing: 1,
            }}>
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Brief */}
          {brief && (
            <div style={{
              padding: "8px 14px", borderBottom: `1px solid ${CY}11`,
              color: "#DCEBF5", fontSize: 11, lineHeight: 1.55,
              background: "rgba(41,231,255,0.04)",
            }}>{brief}</div>
          )}

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
            {loading && !rows.length ? (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
                Loading task rule coverage…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
                No tasks match this filter.
              </div>
            ) : filtered.map(row => (
              <div key={row.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  style={{
                    background: row.backed ? "rgba(0,229,160,0.06)" : "rgba(255,68,68,0.06)",
                    border: `1px solid ${row.backed ? GRN + "33" : RED + "22"}`,
                    borderRadius: 8, padding: "8px 12px",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                  }}
                >
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: row.backed ? GRN : RED,
                    boxShadow: `0 0 6px ${row.backed ? GRN : RED}`,
                    flexShrink: 0,
                  }} />
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, wordBreak: "break-word" }}>
                    {row.title}
                  </span>
                  <span style={{
                    fontSize: 8, letterSpacing: 1, fontWeight: 700,
                    color: row.backed ? GRN : RED,
                    background: (row.backed ? GRN : RED) + "22",
                    borderRadius: 4, padding: "2px 6px", flexShrink: 0,
                  }}>
                    {row.backed ? `${row.matched.length} RULE${row.matched.length !== 1 ? "S" : ""}` : "UNMONITORED"}
                  </span>
                  <span style={{ color: DIM, fontSize: 9, flexShrink: 0 }}>
                    {expanded === row.id ? "▲" : "▼"}
                  </span>
                </div>

                {expanded === row.id && (
                  <div style={{
                    background: "rgba(255,255,255,0.02)", borderRadius: "0 0 8px 8px",
                    border: `1px solid ${CY}11`, borderTop: "none",
                    padding: "8px 12px",
                  }}>
                    <div style={{ color: DIM, fontSize: 9, marginBottom: 6, letterSpacing: 1 }}>
                      STATUS: {row.status} · PRIORITY: {row.priority}
                    </div>
                    {row.backed ? (
                      <>
                        <div style={{ color: GRN, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          MATCHED RULES:
                        </div>
                        {row.matched.map(m => (
                          <div key={m.id} style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "4px 0", borderBottom: `1px solid ${CY}09`,
                          }}>
                            <span style={{
                              fontSize: 8, color: severityColor(m.severity),
                              background: severityColor(m.severity) + "22",
                              borderRadius: 4, padding: "1px 5px", flexShrink: 0,
                            }}>{m.severity}</span>
                            <span style={{ color: "#DCEBF5", fontSize: 10 }}>{m.name}</span>
                            {m.target && (
                              <span style={{ color: DIM, fontSize: 9, marginLeft: "auto" }}>
                                → {m.target}
                              </span>
                            )}
                          </div>
                        ))}
                      </>
                    ) : (
                      <div style={{ color: RED, fontSize: 10, fontStyle: "italic" }}>
                        No active decision rules cover this task — manual execution only.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{
            padding: "6px 14px", borderTop: `1px solid ${CY}11`,
            color: DIM, fontSize: 9, letterSpacing: 1,
          }}>
            /v1/rules · /entities/Task · /v1/jarvis/agent/chat
          </div>
        </div>
      )}

      <style>{`@keyframes rtkpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.4)}}`}</style>
    </>
  );
}
