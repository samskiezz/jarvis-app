import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const GN = "#4CAF50"; const RD = "#FF3D3D";
const CY = "#00E5FF"; const OR = "#FF9800"; const TE = "#80CBC4";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) || "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT = 1106240;
const Z_IDX = 691;

function normTasks(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.tasks || raw?.items || raw?.data || []);
  return arr.map((t, i) => ({
    id: t.id || t._id || `task${i}`,
    name: t.title || t.name || t.task_name || `Task ${i + 1}`,
    priority: t.priority || t.urgency || "",
    status: t.status || t.state || "",
    tags: Array.isArray(t.tags) ? t.tags : [],
    desc: t.description || t.summary || t.notes || t.objective || "",
  }));
}

function normDatasets(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.datasets || raw?.items || raw?.data || []);
  return arr.map((d, i) => ({
    id: d.id || d._id || `ds${i}`,
    name: d.name || d.title || d.dataset_name || `Dataset ${i + 1}`,
    type: d.type || d.dataset_type || d.category || "",
    tags: Array.isArray(d.tags) ? d.tags : [],
    desc: d.description || d.summary || "",
  }));
}

function normAlerts(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.alerts || raw?.items || raw?.data || []);
  return arr.map((a, i) => ({
    id: a.id || a._id || `al${i}`,
    name: a.title || a.name || a.alert_name || `Alert ${i + 1}`,
    severity: a.severity || a.level || a.priority || "medium",
    type: a.type || a.alert_type || a.category || "",
    tags: Array.isArray(a.tags) ? a.tags : [],
    desc: a.description || a.summary || a.message || a.details || "",
  }));
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function overlap(taskToks, obj) {
  const objText = [obj.name, obj.type || "", obj.desc, ...(obj.tags || []), obj.severity || ""].join(" ");
  const objToks = new Set(tokens(objText));
  return taskToks.filter(t => objToks.has(t)).length;
}

function classify(task, datasets, alerts) {
  const tToks = tokens([task.name, task.priority, task.status, task.desc, ...task.tags].join(" "));
  const hasDs = datasets.some(d => overlap(tToks, d) >= 1);
  const hasAlt = alerts.some(a => overlap(tToks, a) >= 1);
  if (hasDs && hasAlt) return "FULLY_COVERED";
  if (hasDs) return "DATASET_LINKED";
  if (hasAlt) return "ALERT_DRIVEN";
  return "UNCOVERED";
}

function matchItems(taskToks, list, max = 4) {
  return list
    .map(item => ({ item, score: overlap(taskToks, item) }))
    .filter(x => x.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(x => x.item);
}

function relScore(taskToks, item) {
  const raw = overlap(taskToks, item);
  return Math.min(1, raw / Math.max(1, taskToks.length * 0.3));
}

export async function buildTdoacovScript() {
  const base = apiBase();
  const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  const [tr, dr, ar] = await Promise.allSettled([
    fetch(`${base}/entities/Task`, { headers: hdrs }).then(r => r.json()),
    fetch(`${base}/v1/datasets`, { headers: hdrs }).then(r => r.json()),
    fetch(`${base}/v1/ops/alerts`, { headers: hdrs }).then(r => r.json()),
  ]);
  const tasks = normTasks(tr.status === "fulfilled" ? tr.value : []);
  const datasets = normDatasets(dr.status === "fulfilled" ? dr.value : []);
  const alerts = normAlerts(ar.status === "fulfilled" ? ar.value : []);
  const total = tasks.length;
  if (!total) return "TDOACOV online, sir. No tasks found to evaluate against the workflow intelligence coverage matrix.";
  const counts = { FULLY_COVERED: 0, DATASET_LINKED: 0, ALERT_DRIVEN: 0, UNCOVERED: 0 };
  tasks.forEach(t => counts[classify(t, datasets, alerts)]++);
  const pct = Math.round((counts.FULLY_COVERED / total) * 100);
  return `TDOACOV workflow intelligence coverage assessment complete, sir. ${total} tasks evaluated against ${datasets.length} datasets and ${alerts.length} operational alerts. ${counts.FULLY_COVERED} tasks have full coverage with both dataset and alert linkage, representing ${pct}% coverage. ${counts.DATASET_LINKED} are dataset-linked only, ${counts.ALERT_DRIVEN} are alert-driven only, and ${counts.UNCOVERED} remain uncovered with no workflow intelligence context. Recommend immediate dataset or alert linkage for the ${counts.UNCOVERED} uncovered tasks.`;
}

export function isTdoacovQuery(q) {
  return /tdoacov|task.{0,20}dataset.{0,20}alert|task.{0,25}(workflow|coverage|intelligence).{0,20}(coverage|index|matrix)|uncovered.?task|task.{0,20}ops.{0,20}(alert|coverage)|workflow.?intelligence.?coverage|task.?workflow.?coverage|dataset.?alert.?coverage|task.?ops.?coverage|task.?coverage.?matrix/i.test(q);
}

const FILTER_TABS = ["ALL", "FULLY_COVERED", "DATASET_LINKED", "ALERT_DRIVEN", "UNCOVERED"];

const COVER_COLOR = {
  FULLY_COVERED: GN,
  DATASET_LINKED: CY,
  ALERT_DRIVEN: AM,
  UNCOVERED: RD,
};

const COVER_LABEL = {
  FULLY_COVERED: "FULLY COVERED",
  DATASET_LINKED: "DATASET LINKED",
  ALERT_DRIVEN: "ALERT DRIVEN",
  UNCOVERED: "UNCOVERED",
};

function TdoacovPanel({ onClose }) {
  const [tasks, setTasks] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [brief, setBrief] = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const base = apiBase();
      const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const [tr, dr, ar] = await Promise.allSettled([
        fetch(`${base}/entities/Task`, { headers: hdrs }).then(r => r.json()),
        fetch(`${base}/v1/datasets`, { headers: hdrs }).then(r => r.json()),
        fetch(`${base}/v1/ops/alerts`, { headers: hdrs }).then(r => r.json()),
      ]);
      const tArr = normTasks(tr.status === "fulfilled" ? tr.value : []);
      const dArr = normDatasets(dr.status === "fulfilled" ? dr.value : []);
      const aArr = normAlerts(ar.status === "fulfilled" ? ar.value : []);
      setTasks(tArr); setDatasets(dArr); setAlerts(aArr);
      const built = tArr.map(t => {
        const tToks = tokens([t.name, t.priority, t.status, t.desc, ...t.tags].join(" "));
        const cover = classify(t, dArr, aArr);
        return {
          ...t,
          cover,
          matchedDatasets: matchItems(tToks, dArr),
          matchedAlerts: matchItems(tToks, aArr),
          relDs: dArr.reduce((acc, d) => { acc[d.id] = relScore(tToks, d); return acc; }, {}),
          relAlts: aArr.reduce((acc, a) => { acc[a.id] = relScore(tToks, a); return acc; }, {}),
        };
      });
      setRows(built);
    } catch (e) {
      setErr(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  const counts = { FULLY_COVERED: 0, DATASET_LINKED: 0, ALERT_DRIVEN: 0, UNCOVERED: 0 };
  rows.forEach(r => counts[r.cover]++);
  const total = rows.length;
  const covPct = total ? Math.round((counts.FULLY_COVERED / total) * 100) : 0;
  const barColor = covPct >= 70 ? GN : covPct >= 40 ? AM : RD;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.cover !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.name.toLowerCase().includes(s) || r.status.toLowerCase().includes(s) || r.priority.toLowerCase().includes(s);
    }
    return true;
  });

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const script = await buildTdoacovScript();
      setBrief(script);
      const voice = typeof getActiveVoice === "function" ? getActiveVoice() : "ash";
      const r = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: script, voice }),
      });
      if (r.ok) {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.play();
      }
    } catch { setBrief("Assessment unavailable."); }
    setAssessing(false);
  }

  const panelStyle = {
    position: "fixed", bottom: 52, left: BTN_LEFT, zIndex: Z_IDX,
    width: 820, maxHeight: "80vh", overflowY: "auto",
    background: BG, border: `1px solid ${CY}44`, borderRadius: 12,
    padding: "16px 18px", fontFamily: MN, color: "#DCEBF5",
    boxShadow: `0 0 60px ${CY}18`, backdropFilter: "blur(10px)",
  };

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ TDOACOV — TASK × DATASET × OPS ALERT WORKFLOW COVERAGE</span>
        <button onClick={load} title="Refresh" style={{ marginLeft: "auto", background: "none", border: `1px solid ${CY}44`, borderRadius: 6, color: CY, cursor: "pointer", padding: "2px 8px", fontSize: 10 }}>↻</button>
        <button onClick={onClose} style={{ background: "none", border: `1px solid ${RD}44`, borderRadius: 6, color: RD, cursor: "pointer", padding: "2px 8px", fontSize: 10 }}>✕</button>
      </div>

      {loading && <div style={{ color: CY, fontSize: 11 }}>Loading task workflow intelligence coverage…</div>}
      {err && <div style={{ color: RD, fontSize: 11 }}>Error: {err}</div>}

      {!loading && !err && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {[
              ["TASKS", total, CY],
              ["DATASETS", datasets.length, TE],
              ["OPS ALERTS", alerts.length, OR],
              ["FULLY COV.", counts.FULLY_COVERED, GN],
              ["DATASET", counts.DATASET_LINKED, CY],
              ["ALERT", counts.ALERT_DRIVEN, AM],
              ["UNCOVERED", counts.UNCOVERED, RD],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background: DIM, border: `1px solid ${color}33`, borderRadius: 8, padding: "6px 10px", minWidth: 90, textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
            <div style={{ background: DIM, border: `1px solid ${barColor}33`, borderRadius: 8, padding: "6px 10px", minWidth: 90, textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: barColor }}>{covPct}%</div>
              <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>COV%</div>
            </div>
          </div>

          <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, marginBottom: 12, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${covPct}%`, background: barColor, borderRadius: 3, transition: "width 0.6s" }} />
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            {FILTER_TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${CY}22` : "none",
                border: `1px solid ${tab === t ? CY : CY + "33"}`,
                borderRadius: 6, color: tab === t ? CY : "#6E8AA0",
                cursor: "pointer", padding: "3px 10px", fontSize: 10, fontFamily: MN,
              }}>{t.replace(/_/g, " ")}{t !== "ALL" ? ` (${counts[t] ?? 0})` : ` (${total})`}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search tasks…"
              style={{ marginLeft: "auto", background: DIM, border: `1px solid ${CY}33`, borderRadius: 6, color: "#DCEBF5", padding: "3px 10px", fontSize: 10, fontFamily: MN, outline: "none", width: 160 }}
            />
          </div>

          {counts.UNCOVERED > 0 && (
            <div style={{ marginBottom: 10, padding: "6px 10px", background: `${RD}11`, border: `1px solid ${RD}44`, borderRadius: 8, fontSize: 11, color: RD }}>
              ⚠ {counts.UNCOVERED} task{counts.UNCOVERED > 1 ? "s" : ""} with no workflow intelligence coverage — dataset or alert linkage recommended.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {visible.map(row => {
              const isExp = expanded === row.id;
              const cc = COVER_COLOR[row.cover];
              const isUncovered = row.cover === "UNCOVERED";
              const tToks = tokens([row.name, row.priority, row.status, row.desc, ...row.tags].join(" "));
              return (
                <div key={row.id} style={{
                  background: DIM, border: `1px solid ${cc}33`, borderRadius: 8,
                  overflow: "hidden",
                  animation: isUncovered ? "tdoacovpulse 2s ease-in-out infinite" : "none",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : row.id)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer" }}
                  >
                    <span style={{ fontSize: 10, color: cc, fontWeight: 700, minWidth: 120 }}>{COVER_LABEL[row.cover]}</span>
                    <span style={{ fontSize: 12, color: "#DCEBF5", flex: 1 }}>{row.name}</span>
                    {row.status && <span style={{ fontSize: 10, color: TE }}>{row.status}</span>}
                    {row.priority && <span style={{ fontSize: 9, color: AM, border: `1px solid ${AM}44`, borderRadius: 4, padding: "1px 5px" }}>{row.priority}</span>}
                    <span style={{ fontSize: 10, color: "#6E8AA0" }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "0 12px 12px" }}>
                      {row.desc && <div style={{ fontSize: 11, color: "#6E8AA0", marginBottom: 10 }}>{row.desc}</div>}

                      {row.matchedDatasets.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 9, color: TE, letterSpacing: 1, marginBottom: 4 }}>MATCHED DATASETS</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {row.matchedDatasets.map(d => (
                              <div key={d.id} style={{ background: `${TE}0a`, border: `1px solid ${TE}33`, borderRadius: 6, padding: "5px 8px", display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 11, color: "#DCEBF5", flex: 1 }}>{d.name}</span>
                                {d.type && <span style={{ fontSize: 9, color: TE, border: `1px solid ${TE}44`, borderRadius: 4, padding: "1px 4px" }}>{d.type}</span>}
                                <div style={{ width: 60, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${Math.round(relScore(tToks, d) * 100)}%`, background: TE, borderRadius: 2 }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {row.matchedAlerts.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 9, color: OR, letterSpacing: 1, marginBottom: 4 }}>MATCHED OPS ALERTS</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {row.matchedAlerts.map(a => (
                              <div key={a.id} style={{ background: `${OR}0a`, border: `1px solid ${OR}33`, borderRadius: 6, padding: "5px 8px", display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 11, color: "#DCEBF5", flex: 1 }}>{a.name}</span>
                                {a.severity && <span style={{ fontSize: 9, color: a.severity === "critical" ? RD : a.severity === "high" ? OR : AM, border: `1px solid ${OR}44`, borderRadius: 4, padding: "1px 4px" }}>{a.severity}</span>}
                                <div style={{ width: 60, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${Math.round(relScore(tToks, a) * 100)}%`, background: OR, borderRadius: 2 }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {row.cover === "UNCOVERED" && (
                        <div style={{ padding: "6px 8px", background: `${RD}11`, border: `1px solid ${RD}44`, borderRadius: 6, fontSize: 10, color: RD }}>
                          ⚠ No matching datasets or operational alerts found for this task — workflow intelligence linkage missing.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && !loading && (
              <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 11, padding: 20 }}>No tasks match current filter.</div>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <button
              onClick={assess} disabled={assessing}
              style={{ background: assessing ? `${CY}22` : `${CY}11`, border: `1px solid ${CY}55`, borderRadius: 8, color: CY, cursor: assessing ? "default" : "pointer", padding: "6px 16px", fontSize: 11, fontFamily: MN, letterSpacing: 1 }}
            >
              {assessing ? "◍ ASSESSING…" : "▶ ASSESS WORKFLOW COVERAGE"}
            </button>
          </div>
          {brief && (
            <div style={{ marginTop: 10, padding: "10px 12px", background: `${CY}08`, border: `1px solid ${CY}33`, borderRadius: 8, fontSize: 11, color: "#DCEBF5", lineHeight: 1.6 }}>
              {brief}
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes tdoacovpulse {
          0%, 100% { border-color: ${RD}33; }
          50% { border-color: ${RD}99; box-shadow: 0 0 12px ${RD}44; }
        }
      `}</style>
    </div>
  );
}

export default function TaskDatasetOpsAlertCoverage() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:tdoacov-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tdoacov-toggle", onToggle);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="TDOACOV — Task × Dataset × Ops Alert Workflow Coverage"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
          background: open ? `${CY}22` : "rgba(6,10,18,0.82)",
          border: `1px solid ${open ? CY : CY + "44"}`,
          borderRadius: 8, color: open ? CY : CY + "99",
          cursor: "pointer", padding: "4px 10px", fontSize: 10,
          fontFamily: MN, letterSpacing: 1,
          boxShadow: open ? `0 0 20px ${CY}44` : "none",
        }}
      >
        ◈ TDOACOV
      </button>
      {open && <TdoacovPanel onClose={() => setOpen(false)} />}
    </>
  );
}
