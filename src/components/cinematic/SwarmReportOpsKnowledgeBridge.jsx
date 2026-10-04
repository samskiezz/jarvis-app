import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const GN = "#4CAF50"; const RD = "#FF3D3D";
const CY = "#00E5FF"; const OR = "#FF9800"; const PU = "#CE93D8";
const TE = "#80CBC4";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) || "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT = 1105120;
const Z_IDX = 689;

function normSwarm(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.jobs || raw?.items || raw?.data || []);
  return arr.map((j, i) => ({
    id: j.id || j._id || `j${i}`,
    name: j.name || j.job_name || j.title || `Job ${i + 1}`,
    type: j.type || j.job_type || j.category || "",
    status: j.status || j.state || "unknown",
    tags: Array.isArray(j.tags) ? j.tags : [],
    desc: j.description || j.summary || j.objective || "",
  }));
}

function normReports(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.reports || raw?.items || raw?.data || []);
  return arr.map((r, i) => ({
    id: r.id || r._id || `r${i}`,
    name: r.title || r.name || r.report_name || `Report ${i + 1}`,
    type: r.type || r.report_type || r.category || "",
    tags: Array.isArray(r.tags) ? r.tags : [],
    desc: r.description || r.summary || r.content || "",
  }));
}

function normOpsEvents(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.events || raw?.items || raw?.data || []);
  return arr.map((e, i) => ({
    id: e.id || e._id || `e${i}`,
    name: e.title || e.name || e.event_name || `Event ${i + 1}`,
    type: e.type || e.event_type || e.category || "",
    tags: Array.isArray(e.tags) ? e.tags : [],
    desc: e.description || e.summary || e.details || "",
  }));
}

function normKnowledge(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.articles || raw?.items || raw?.data || raw?.results || []);
  return arr.map((k, i) => ({
    id: k.id || k._id || `k${i}`,
    name: k.title || k.name || k.topic || `Article ${i + 1}`,
    category: k.category || k.type || k.domain || "",
    tags: Array.isArray(k.tags) ? k.tags : [],
    desc: k.summary || k.content || k.description || "",
  }));
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function overlap(jobToks, obj) {
  const objText = [obj.name, obj.type || obj.category || "", obj.desc, ...(obj.tags || [])].join(" ");
  const objToks = new Set(tokens(objText));
  return jobToks.filter(t => objToks.has(t)).length;
}

function classify(job, reports, opsEvents, kb) {
  const jToks = tokens([job.name, job.type, job.desc, ...job.tags].join(" "));
  const hasRep = reports.some(r => overlap(jToks, r) >= 1);
  const hasOps = opsEvents.some(e => overlap(jToks, e) >= 1);
  const hasKb = kb.some(k => overlap(jToks, k) >= 1);
  const count = [hasRep, hasOps, hasKb].filter(Boolean).length;
  if (count === 3) return "FULLY_GROUNDED";
  if (count === 2) return "DUAL_GROUNDED";
  if (count === 1) return "SINGLE_LINKED";
  return "UNGROUNDED";
}

function matchItems(jobToks, list, max = 4) {
  return list
    .map(item => ({ item, score: overlap(jobToks, item) }))
    .filter(x => x.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(x => x.item);
}

function relScore(jobToks, item) {
  const raw = overlap(jobToks, item);
  return Math.min(1, raw / Math.max(1, jobToks.length * 0.3));
}

export async function buildSrockbScript() {
  const base = apiBase();
  const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  const [jr, rr, or_, kr] = await Promise.allSettled([
    fetch(`${base}/entities/SwarmJob`, { headers: hdrs }).then(r => r.json()),
    fetch(`${base}/v1/reports`, { headers: hdrs }).then(r => r.json()),
    fetch(`${base}/v1/ops/events`, { headers: hdrs }).then(r => r.json()),
    fetch(`${base}/knowledge/`, { headers: hdrs }).then(r => r.json()),
  ]);
  const jobs = normSwarm(jr.status === "fulfilled" ? jr.value : []);
  const reports = normReports(rr.status === "fulfilled" ? rr.value : []);
  const opsEvents = normOpsEvents(or_.status === "fulfilled" ? or_.value : []);
  const kb = normKnowledge(kr.status === "fulfilled" ? kr.value : []);
  const total = jobs.length;
  if (!total) return "SROCKB online, sir. No swarm jobs found to assess against reports, ops events, and knowledge.";
  const counts = { FULLY_GROUNDED: 0, DUAL_GROUNDED: 0, SINGLE_LINKED: 0, UNGROUNDED: 0 };
  jobs.forEach(j => counts[classify(j, reports, opsEvents, kb)]++);
  const pct = Math.round((counts.FULLY_GROUNDED / total) * 100);
  return `SROCKB assessment complete, sir. ${total} swarm jobs evaluated against ${reports.length} intelligence reports, ${opsEvents.length} ops events, and ${kb.length} knowledge articles. ${counts.FULLY_GROUNDED} jobs are fully grounded across all three context domains, representing ${pct}% full coverage. ${counts.DUAL_GROUNDED} have dual context, ${counts.SINGLE_LINKED} single context, and ${counts.UNGROUNDED} remain ungrounded with no mission context. Recommend reviewing the ${counts.UNGROUNDED} ungrounded jobs for mission alignment.`;
}

export function isSrockbQuery(q) {
  return /srockb|swarm.{0,20}(report|ops|knowledge|context|mission.?context|intel.?bridge)|mission.?context.?bridge|ungrounded.?swarm|swarm.?intel.?context|swarm.?report.?ops/i.test(q);
}

const TABS = ["ALL", "FULLY_GROUNDED", "DUAL_GROUNDED", "SINGLE_LINKED", "UNGROUNDED"];
const TAB_COL = { FULLY_GROUNDED: GN, DUAL_GROUNDED: CY, SINGLE_LINKED: OR, UNGROUNDED: RD, ALL: AM };

export default function SwarmReportOpsKnowledgeBridge() {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [reports, setReports] = useState([]);
  const [opsEvents, setOpsEvents] = useState([]);
  const [kb, setKb] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [aiText, setAiText] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const base = apiBase();
    const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
    try {
      const [jr, rr, or_, kr] = await Promise.allSettled([
        fetch(`${base}/entities/SwarmJob`, { headers: hdrs }).then(r => r.json()),
        fetch(`${base}/v1/reports`, { headers: hdrs }).then(r => r.json()),
        fetch(`${base}/v1/ops/events`, { headers: hdrs }).then(r => r.json()),
        fetch(`${base}/knowledge/`, { headers: hdrs }).then(r => r.json()),
      ]);
      setJobs(normSwarm(jr.status === "fulfilled" ? jr.value : []));
      setReports(normReports(rr.status === "fulfilled" ? rr.value : []));
      setOpsEvents(normOpsEvents(or_.status === "fulfilled" ? or_.value : []));
      setKb(normKnowledge(kr.status === "fulfilled" ? kr.value : []));
    } catch (e) {
      setErr(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:srockb-toggle", handler);
    return () => window.removeEventListener("jarvis:srockb-toggle", handler);
  }, []);

  useEffect(() => {
    if (open) { load(); }
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true); setAiText("");
    const base = apiBase();
    const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
    const total = jobs.length;
    const counts = { FULLY_GROUNDED: 0, DUAL_GROUNDED: 0, SINGLE_LINKED: 0, UNGROUNDED: 0 };
    jobs.forEach(j => counts[classify(j, reports, opsEvents, kb)]++);
    const prompt = `SROCKB: ${total} swarm jobs vs ${reports.length} reports, ${opsEvents.length} ops events, ${kb.length} KB articles. Fully grounded: ${counts.FULLY_GROUNDED}, dual: ${counts.DUAL_GROUNDED}, single: ${counts.SINGLE_LINKED}, ungrounded: ${counts.UNGROUNDED}. Provide a concise 2-sentence mission context assessment and top recommendation.`;
    try {
      const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdrs,
        body: JSON.stringify({ message: prompt }),
      });
      const data = await resp.json();
      const text = data.response || data.message || data.content || "Assessment complete.";
      setAiText(text);
      const voice = getActiveVoice();
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers: hdrs,
        body: JSON.stringify({ text: text.slice(0, 300), voice }),
      });
    } catch {
      setAiText("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  };

  const enriched = jobs.map(j => {
    const jToks = tokens([j.name, j.type, j.desc, ...j.tags].join(" "));
    return {
      ...j,
      classification: classify(j, reports, opsEvents, kb),
      matchedReports: matchItems(jToks, reports),
      matchedOps: matchItems(jToks, opsEvents),
      matchedKb: matchItems(jToks, kb),
      jToks,
    };
  });

  const counts = { FULLY_GROUNDED: 0, DUAL_GROUNDED: 0, SINGLE_LINKED: 0, UNGROUNDED: 0 };
  enriched.forEach(j => counts[j.classification]++);
  const total = enriched.length;
  const pct = total ? Math.round((counts.FULLY_GROUNDED / total) * 100) : 0;

  const filtered = enriched.filter(j => {
    if (tab !== "ALL" && j.classification !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return j.name.toLowerCase().includes(q) || j.type.toLowerCase().includes(q) || j.desc.toLowerCase().includes(q);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
          background: BG, border: `1px solid ${TE}`, color: TE,
          fontFamily: MN, fontSize: 11, padding: "4px 10px", cursor: "pointer",
          borderRadius: 4, letterSpacing: "0.05em", whiteSpace: "nowrap",
        }}
      >
        ◈ SROCKB
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 16, zIndex: Z_IDX,
      width: 540, maxHeight: "80vh", display: "flex", flexDirection: "column",
      background: BG, border: `1px solid ${TE}`, borderRadius: 8,
      fontFamily: MN, fontSize: 12, color: "#e0e0e0", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "10px 14px", borderBottom: `1px solid rgba(255,255,255,0.08)`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: TE, fontWeight: 700, fontSize: 13, flex: 1 }}>◈ SROCKB — Swarm Mission Context Bridge</span>
        <span style={{ background: "rgba(128,203,196,0.15)", border: `1px solid ${TE}`, color: TE, padding: "1px 7px", borderRadius: 10, fontSize: 10 }}>
          {total} jobs
        </span>
        {counts.UNGROUNDED > 0 && (
          <span style={{ background: "rgba(255,61,61,0.15)", border: `1px solid ${RD}`, color: RD, padding: "1px 7px", borderRadius: 10, fontSize: 10, animation: "pulse 1.5s infinite" }}>
            ⚠ {counts.UNGROUNDED} ungrounded
          </span>
        )}
        <button onClick={assess} disabled={assessing} style={{ background: "transparent", border: `1px solid ${CY}`, color: CY, fontFamily: MN, fontSize: 10, padding: "2px 8px", cursor: "pointer", borderRadius: 3 }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button onClick={load} style={{ background: "transparent", border: `1px solid ${AM}`, color: AM, fontFamily: MN, fontSize: 10, padding: "2px 8px", cursor: "pointer", borderRadius: 3 }}>↺</button>
        <button onClick={() => setOpen(false)} style={{ background: "transparent", border: "none", color: RD, fontFamily: MN, fontSize: 14, padding: "0 4px", cursor: "pointer" }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, padding: "8px 14px" }}>
        {[
          { label: "TOTAL", val: total, col: AM },
          { label: "FULL", val: counts.FULLY_GROUNDED, col: GN },
          { label: "DUAL", val: counts.DUAL_GROUNDED, col: CY },
          { label: "SINGLE", val: counts.SINGLE_LINKED, col: OR },
          { label: "NONE", val: counts.UNGROUNDED, col: RD },
          { label: "RPTS", val: reports.length, col: OR },
          { label: "KB", val: kb.length, col: PU },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background: DIM, border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 4, padding: "4px 2px", textAlign: "center" }}>
            <div style={{ color: col, fontSize: 15, fontWeight: 700 }}>{loading ? "…" : val}</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: "0 14px 8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>Fully grounded coverage</span>
          <span style={{ color: pct >= 70 ? GN : pct >= 40 ? AM : RD, fontSize: 10 }}>{pct}%</span>
        </div>
        <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: pct >= 70 ? GN : pct >= 40 ? AM : RD, borderRadius: 2, transition: "width 0.4s" }} />
        </div>
      </div>

      {/* AI output */}
      {aiText && (
        <div style={{ margin: "0 14px 8px", background: "rgba(0,229,255,0.06)", border: `1px solid ${CY}`, borderRadius: 4, padding: "6px 10px", fontSize: 11, color: CY, maxHeight: 80, overflowY: "auto" }}>
          {aiText}
        </div>
      )}

      {/* Error */}
      {err && <div style={{ margin: "0 14px 8px", color: RD, fontSize: 11 }}>⚠ {err}</div>}

      {/* Tabs + search */}
      <div style={{ padding: "0 14px 6px", display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${TAB_COL[t]}22` : "transparent",
            border: `1px solid ${tab === t ? TAB_COL[t] : "rgba(255,255,255,0.15)"}`,
            color: tab === t ? TAB_COL[t] : "rgba(255,255,255,0.4)",
            fontFamily: MN, fontSize: 9, padding: "2px 7px", cursor: "pointer", borderRadius: 3,
          }}>
            {t === "ALL" ? `ALL (${total})` :
             t === "FULLY_GROUNDED" ? `FULL (${counts.FULLY_GROUNDED})` :
             t === "DUAL_GROUNDED" ? `DUAL (${counts.DUAL_GROUNDED})` :
             t === "SINGLE_LINKED" ? `SINGLE (${counts.SINGLE_LINKED})` :
             `NONE (${counts.UNGROUNDED})`}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search…"
          style={{ marginLeft: "auto", background: DIM, border: "1px solid rgba(255,255,255,0.1)", color: "#e0e0e0", fontFamily: MN, fontSize: 11, padding: "2px 8px", borderRadius: 3, width: 120 }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 10px" }}>
        {loading && <div style={{ color: AM, padding: 10 }}>Loading…</div>}
        {!loading && filtered.length === 0 && <div style={{ color: "rgba(255,255,255,0.3)", padding: 10 }}>No jobs match.</div>}
        {filtered.map(j => {
          const isExp = expanded === j.id;
          const col = TAB_COL[j.classification];
          const pulse = j.classification === "UNGROUNDED";
          return (
            <div key={j.id} style={{ marginBottom: 4, border: `1px solid ${pulse ? RD : "rgba(255,255,255,0.07)"}`, borderRadius: 4, overflow: "hidden", boxShadow: pulse ? `0 0 6px rgba(255,61,61,0.3)` : "none" }}>
              <div onClick={() => setExpanded(isExp ? null : j.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer", background: DIM }}>
                <span style={{ color: col, fontSize: 10, minWidth: 80, fontWeight: 700 }}>{j.classification.replace(/_/g, " ")}</span>
                <span style={{ flex: 1, color: "#e0e0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.name}</span>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>{j.status}</span>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "8px 10px", background: "rgba(0,0,0,0.3)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  {j.desc && <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginBottom: 8 }}>{j.desc}</div>}
                  {/* Report matches */}
                  {j.matchedReports.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: OR, fontSize: 10, marginBottom: 3 }}>◈ REPORTS ({j.matchedReports.length})</div>
                      {j.matchedReports.map(r => {
                        const sc = relScore(j.jToks, r);
                        return (
                          <div key={r.id} style={{ marginBottom: 3, display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ background: `${OR}22`, border: `1px solid ${OR}`, color: OR, fontSize: 9, padding: "0 4px", borderRadius: 2, minWidth: 40, textAlign: "center" }}>{r.type || "RPT"}</span>
                            <span style={{ color: "#e0e0e0", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                            <div style={{ width: 60, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                              <div style={{ width: `${Math.round(sc * 100)}%`, height: "100%", background: OR, borderRadius: 2 }} />
                            </div>
                            <span style={{ color: OR, fontSize: 9, minWidth: 28 }}>{Math.round(sc * 100)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Ops Event matches */}
                  {j.matchedOps.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: CY, fontSize: 10, marginBottom: 3 }}>◈ OPS EVENTS ({j.matchedOps.length})</div>
                      {j.matchedOps.map(e => {
                        const sc = relScore(j.jToks, e);
                        return (
                          <div key={e.id} style={{ marginBottom: 3, display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ background: `${CY}22`, border: `1px solid ${CY}`, color: CY, fontSize: 9, padding: "0 4px", borderRadius: 2, minWidth: 40, textAlign: "center" }}>{e.type || "OPS"}</span>
                            <span style={{ color: "#e0e0e0", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                            <div style={{ width: 60, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                              <div style={{ width: `${Math.round(sc * 100)}%`, height: "100%", background: CY, borderRadius: 2 }} />
                            </div>
                            <span style={{ color: CY, fontSize: 9, minWidth: 28 }}>{Math.round(sc * 100)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Knowledge matches */}
                  {j.matchedKb.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: PU, fontSize: 10, marginBottom: 3 }}>◈ KNOWLEDGE ({j.matchedKb.length})</div>
                      {j.matchedKb.map(k => {
                        const sc = relScore(j.jToks, k);
                        return (
                          <div key={k.id} style={{ marginBottom: 3, display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#e0e0e0", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.name}</span>
                            <div style={{ width: 60, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                              <div style={{ width: `${Math.round(sc * 100)}%`, height: "100%", background: PU, borderRadius: 2 }} />
                            </div>
                            <span style={{ color: PU, fontSize: 9, minWidth: 28 }}>{Math.round(sc * 100)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {j.matchedReports.length === 0 && j.matchedOps.length === 0 && j.matchedKb.length === 0 && (
                    <div style={{ color: RD, fontSize: 10 }}>⚠ No context matches found — mission ungrounded</div>
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
