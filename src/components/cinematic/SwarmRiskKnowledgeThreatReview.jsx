import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const CY = "#00E5FF"; const OR = "#FF9800";
const PU = "#CE93D8"; const RD = "#FF3D3D"; const GN = "#4CAF50";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const REFRESH_MS = 90_000;
const BTN_LEFT   = 1100640;
const Z_IDX      = 681;

/* ── normalizers ─────────────────────────────────────────────────────────── */
function normSwarm(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.jobs ?? raw.swarm_jobs ?? raw.data ?? raw.items ?? []);
  return arr.map((j, i) => ({
    id:     String(j.id      ?? j.job_id    ?? i),
    name:   String(j.name    ?? j.title     ?? j.label ?? `SwarmJob-${i}`),
    status: String(j.status  ?? j.state     ?? ""),
    type:   String(j.type    ?? j.job_type  ?? ""),
    tags:   Array.isArray(j.tags) ? j.tags.map(String) : [],
    desc:   String(j.description ?? j.desc ?? j.objective ?? ""),
  }));
}

function normRisk(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.signals ?? raw.risk_signals ?? raw.data ?? raw.items ?? []);
  return arr.map((s, i) => ({
    id:       String(s.id       ?? s.signal_id  ?? i),
    name:     String(s.name     ?? s.title      ?? s.label ?? `RiskSignal-${i}`),
    severity: String(s.severity ?? s.level      ?? s.risk_level ?? ""),
    category: String(s.category ?? s.type       ?? ""),
    tags:     Array.isArray(s.tags) ? s.tags.map(String) : [],
    desc:     String(s.description ?? s.desc ?? s.summary ?? ""),
  }));
}

function normKnowledge(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.entries ?? raw.articles ?? raw.data ?? raw.items ?? []);
  return arr.map((k, i) => ({
    id:    String(k.id    ?? k.entry_id ?? i),
    name:  String(k.name  ?? k.title    ?? k.heading ?? `KnowledgeItem-${i}`),
    topic: String(k.topic ?? k.category ?? k.domain  ?? ""),
    tags:  Array.isArray(k.tags) ? k.tags.map(String) : [],
    desc:  String(k.description ?? k.desc ?? k.content ?? k.summary ?? ""),
  }));
}

/* ── token overlap ───────────────────────────────────────────────────────── */
function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function overlap(toks, obj) {
  const objToks = tokens(obj.name + " " + (obj.desc || "") + " " + (obj.tags || []).join(" "));
  return toks.filter(t => objToks.includes(t)).length;
}

/* ── classification ──────────────────────────────────────────────────────── */
function classify(job, riskSignals, knowledge) {
  const tt = tokens(job.name + " " + job.desc + " " + job.tags.join(" ") + " " + job.type);
  const hasRisk  = riskSignals.some(s => overlap(tt, s) >= 1);
  const hasKnow  = knowledge.some(k => overlap(tt, k) >= 1);
  if (hasRisk && hasKnow) return "FULLY_ARMED";
  if (hasRisk)            return "SIGNAL_ONLY";
  if (hasKnow)            return "KNOWLEDGE_BACKED";
  return "ISOLATED";
}

function matchRisk(job, riskSignals) {
  const tt = tokens(job.name + " " + job.desc + " " + job.tags.join(" "));
  return riskSignals.filter(s => overlap(tt, s) >= 1).slice(0, 4);
}

function matchKnowledge(job, knowledge) {
  const tt = tokens(job.name + " " + job.desc + " " + job.tags.join(" "));
  return knowledge.filter(k => overlap(tt, k) >= 1).slice(0, 4);
}

/* ── relevance bar ───────────────────────────────────────────────────────── */
function relevanceScore(job, item) {
  const tt = tokens(job.name + " " + job.desc + " " + job.tags.join(" "));
  const sc = overlap(tt, item);
  return Math.min(1, sc / 3);
}

/* ── build script (exported for JarvisBrain) ─────────────────────────────── */
export async function buildTeixrevScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [jR, sR, kR] = await Promise.all([
    fetch(`${base}/entities/SwarmJob`, { headers }),
    fetch(`${base}/entities/RiskSignal`, { headers }),
    fetch(`${base}/knowledge/`, { headers }),
  ]);
  const [jJ, sJ, kJ] = await Promise.all([jR.json(), sR.json(), kR.json()]);
  const jobs      = normSwarm(jJ);
  const signals   = normRisk(sJ);
  const knowledge = normKnowledge(kJ);
  const classified = jobs.map(j => ({ ...j, cls: classify(j, signals, knowledge) }));
  const fully    = classified.filter(j => j.cls === "FULLY_ARMED").length;
  const signOnly = classified.filter(j => j.cls === "SIGNAL_ONLY").length;
  const knowBk   = classified.filter(j => j.cls === "KNOWLEDGE_BACKED").length;
  const isolated = classified.filter(j => j.cls === "ISOLATED").length;
  const pct      = jobs.length ? Math.round((fully / jobs.length) * 100) : 0;
  return `TEIXREV online, sir. ${jobs.length} swarm jobs correlated against ${signals.length} risk signals and ${knowledge.length} knowledge items. ` +
    `${fully} fully armed, ${signOnly} signal-only, ${knowBk} knowledge-backed, ${isolated} isolated — ${pct}% full-arm coverage.`;
}

/* ── voice trigger ───────────────────────────────────────────────────────── */
export function isTeixrevQuery(q) {
  const lower = (q || "").toLowerCase();
  return /teixrev|swarm risk knowledge|swarm execution intel|threat execution review|swarm threat intel|swarm knowledge risk/.test(lower);
}

/* ── stat tile ───────────────────────────────────────────────────────────── */
function StatTile({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: DIM, borderRadius: 6, padding: "8px 10px", minWidth: 80, textAlign: "center" }}>
      <div style={{ fontFamily: MN, fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}

/* ── badge ───────────────────────────────────────────────────────────────── */
const CLS_META = {
  FULLY_ARMED:       { color: GN,  label: "FULLY ARMED" },
  SIGNAL_ONLY:       { color: AM,  label: "SIGNAL ONLY" },
  KNOWLEDGE_BACKED:  { color: CY,  label: "KNOWLEDGE BACKED" },
  ISOLATED:          { color: RD,  label: "ISOLATED" },
};

function ClsBadge({ cls }) {
  const m = CLS_META[cls] || { color: OR, label: cls };
  return (
    <span style={{ fontFamily: MN, fontSize: 9, fontWeight: 700, color: m.color,
      border: `1px solid ${m.color}`, borderRadius: 3, padding: "1px 5px", letterSpacing: "0.06em" }}>
      {m.label}
    </span>
  );
}

/* ── relevance bar component ─────────────────────────────────────────────── */
function RelevanceBar({ score, color }) {
  return (
    <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: "100%", width: `${Math.round(score * 100)}%`, background: color, borderRadius: 2 }} />
    </div>
  );
}

/* ── main component ──────────────────────────────────────────────────────── */
export default function SwarmRiskKnowledgeThreatReview() {
  const [open, setOpen]         = useState(false);
  const [jobs, setJobs]         = useState([]);
  const [signals, setSignals]   = useState([]);
  const [knowledge, setKnow]    = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [jR, sR, kR] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`, { headers }),
        fetch(`${base}/entities/RiskSignal`, { headers }),
        fetch(`${base}/knowledge/`, { headers }),
      ]);
      const [jJ, sJ, kJ] = await Promise.all([jR.json(), sR.json(), kR.json()]);
      setJobs(normSwarm(jJ));
      setSignals(normRisk(sJ));
      setKnow(normKnowledge(kJ));
    } catch (e) {
      setError(e.message || "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:teixrev-toggle", handler);
    return () => window.removeEventListener("jarvis:teixrev-toggle", handler);
  }, []);

  const classified = jobs.map(j => ({
    ...j,
    cls:         classify(j, signals, knowledge),
    matchedRisk: matchRisk(j, signals),
    matchedKnow: matchKnowledge(j, knowledge),
  }));

  const tabs  = ["ALL", "FULLY_ARMED", "SIGNAL_ONLY", "KNOWLEDGE_BACKED", "ISOLATED"];
  const shown = classified
    .filter(j => filter === "ALL" || j.cls === filter)
    .filter(j => !search || j.name.toLowerCase().includes(search.toLowerCase()));

  const fully    = classified.filter(j => j.cls === "FULLY_ARMED").length;
  const isolated = classified.filter(j => j.cls === "ISOLATED").length;
  const pct      = jobs.length ? Math.round((fully / jobs.length) * 100) : 0;

  const assess = async () => {
    setAssessing(true);
    try {
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Assess swarm execution threat intelligence: ${jobs.length} jobs, ${signals.length} risk signals, ${knowledge.length} knowledge items. ${fully} fully armed, ${isolated} isolated. Provide a 2-sentence brief on the threat execution coverage posture and top priority.`,
        }),
      });
      const d = await r.json();
      const text = (d.answer || "").trim();
      if (text) {
        try {
          const voice = getActiveVoice();
          const vr = await fetch(`${base}/v1/voice/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
            body: JSON.stringify({ text, voice }),
          });
          if (vr.ok) {
            const blob = await vr.blob();
            const url  = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.onended = () => URL.revokeObjectURL(url);
            audio.play().catch(() => {});
          }
        } catch {}
      }
    } catch {}
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="TEIXREV — SwarmJob × RiskSignal × Knowledge Threat Execution Intelligence Review"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_IDX,
          background: "rgba(255,152,0,0.15)", border: "1px solid #FF9800",
          borderRadius: 4, color: "#FF9800", fontFamily: MN,
          fontSize: 10, fontWeight: 700, padding: "3px 7px", cursor: "pointer",
          letterSpacing: "0.07em", whiteSpace: "nowrap",
        }}
      >
        ◈ TEIXREV
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: Z_IDX,
      background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center",
    }}
      onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div style={{
        width: "min(960px,96vw)", maxHeight: "88vh", background: BG,
        border: "1px solid rgba(255,152,0,0.35)", borderRadius: 10,
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 0 40px rgba(255,152,0,0.12)",
      }}>
        {/* header */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: MN, fontSize: 13, fontWeight: 700, color: OR, letterSpacing: "0.08em" }}>◈ TEIXREV</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", flex: 1 }}>SwarmJob × RiskSignal × Knowledge — Threat Execution Intelligence Review</span>
          {loading && <span style={{ fontSize: 10, color: CY, fontFamily: MN }}>LOADING…</span>}
          {error   && <span style={{ fontSize: 10, color: RD, fontFamily: MN }}>⚠ {error}</span>}
          <button onClick={load} style={{ background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, color: "rgba(255,255,255,0.6)", fontSize: 10, cursor: "pointer", padding: "2px 8px", fontFamily: MN }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 16, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, padding: "12px 18px 0" }}>
          <StatTile label="SWARM JOBS"   value={jobs.length}      color={OR} />
          <StatTile label="RISK SIGNALS" value={signals.length}   color={RD} />
          <StatTile label="KNOWLEDGE"    value={knowledge.length} color={CY} />
          <StatTile label="ARM COVERAGE" value={`${pct}%`}        color={pct >= 60 ? GN : pct >= 30 ? AM : RD} />
          {isolated > 0 && (
            <div style={{ alignSelf: "center", fontFamily: MN, fontSize: 11, color: RD, border: `1px solid ${RD}`, borderRadius: 4, padding: "3px 8px", animation: "pulse 1.5s infinite" }}>
              {isolated} ISOLATED
            </div>
          )}
        </div>

        {/* tabs + search + assess */}
        <div style={{ display: "flex", gap: 6, padding: "10px 18px 0", flexWrap: "wrap", alignItems: "center" }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setFilter(t)} style={{
              background: filter === t ? OR : "rgba(255,255,255,0.05)",
              border: `1px solid ${filter === t ? OR : "rgba(255,255,255,0.15)"}`,
              borderRadius: 4, color: filter === t ? "#000" : "rgba(255,255,255,0.6)",
              fontSize: 10, fontFamily: MN, cursor: "pointer", padding: "3px 9px", fontWeight: filter === t ? 700 : 400,
            }}>{t.replace("_", " ")}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search jobs…"
            style={{ marginLeft: "auto", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, color: "#fff", fontFamily: MN, fontSize: 11, padding: "3px 10px", outline: "none", width: 160 }}
          />
          <button onClick={assess} disabled={assessing || !jobs.length} style={{
            background: assessing ? "rgba(0,229,255,0.1)" : "rgba(0,229,255,0.15)", border: `1px solid ${CY}`,
            borderRadius: 4, color: CY, fontFamily: MN, fontSize: 10, cursor: "pointer", padding: "3px 10px", fontWeight: 700,
          }}>▶ {assessing ? "…" : "ASSESS"}</button>
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 18px 18px" }}>
          {shown.length === 0 && !loading && (
            <div style={{ color: "rgba(255,255,255,0.3)", fontFamily: MN, fontSize: 11, textAlign: "center", marginTop: 40 }}>No results.</div>
          )}
          {shown.map(job => (
            <div key={job.id} style={{
              background: DIM, borderRadius: 6, marginBottom: 6, overflow: "hidden",
              border: job.cls === "ISOLATED" ? `1px solid ${RD}44` : "1px solid rgba(255,255,255,0.06)",
            }}>
              <div
                onClick={() => setExpanded(expanded === job.id ? null : job.id)}
                style={{ padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
              >
                <span style={{ fontFamily: MN, fontSize: 11, color: OR, flex: 1, fontWeight: 600 }}>{job.name}</span>
                {job.type && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: MN }}>{job.type}</span>}
                <ClsBadge cls={job.cls} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: MN }}>{expanded === job.id ? "▲" : "▼"}</span>
              </div>
              {expanded === job.id && (
                <div style={{ padding: "0 12px 12px", display: "flex", gap: 12 }}>
                  {/* risk signal matches */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: RD, fontFamily: MN, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Risk Signals ({job.matchedRisk.length})
                    </div>
                    {job.matchedRisk.length === 0
                      ? <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: MN }}>No matching signals.</div>
                      : job.matchedRisk.map(s => (
                          <div key={s.id} style={{ background: "rgba(255,61,61,0.07)", borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: "#fff", fontFamily: MN }}>{s.name}</div>
                            {s.severity && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>Severity: {s.severity}</div>}
                            <RelevanceBar score={relevanceScore(job, s)} color={RD} />
                          </div>
                        ))}
                  </div>
                  {/* knowledge matches */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: CY, fontFamily: MN, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Knowledge ({job.matchedKnow.length})
                    </div>
                    {job.matchedKnow.length === 0
                      ? <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: MN }}>No matching knowledge.</div>
                      : job.matchedKnow.map(k => (
                          <div key={k.id} style={{ background: "rgba(0,229,255,0.07)", borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: "#fff", fontFamily: MN }}>{k.name}</div>
                            {k.topic && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>Topic: {k.topic}</div>}
                            <RelevanceBar score={relevanceScore(job, k)} color={CY} />
                          </div>
                        ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.45 } }`}</style>
    </div>
  );
}
