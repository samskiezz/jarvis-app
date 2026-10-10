import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const CY = "#00E5FF"; const OR = "#FF9800";
const RD = "#FF3D3D"; const GN = "#4CAF50"; const PU = "#CE93D8";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const REFRESH_MS = 90_000;
const BTN_LEFT   = 1101760;
const Z_IDX      = 683;

/* ── normalizers ─────────────────────────────────────────────────────────── */
function normSignals(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)
    ? raw
    : (raw.risk_signals ?? raw.signals ?? raw.data ?? raw.items ?? []);
  return arr.map((s, i) => ({
    id:       String(s.id       ?? s.signal_id  ?? i),
    name:     String(s.name     ?? s.title      ?? s.label ?? `Signal-${i}`),
    severity: String(s.severity ?? s.level      ?? ""),
    category: String(s.category ?? s.type       ?? ""),
    tags:     Array.isArray(s.tags) ? s.tags.map(String) : [],
    desc:     String(s.description ?? s.desc ?? s.detail ?? ""),
  }));
}

function normSkills(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)
    ? raw
    : (raw.skills ?? raw.aip_skills ?? raw.data ?? raw.items ?? []);
  return arr.map((s, i) => ({
    id:       String(s.id       ?? s.skill_id   ?? i),
    name:     String(s.name     ?? s.title      ?? s.label ?? `Skill-${i}`),
    category: String(s.category ?? s.type       ?? ""),
    score:    Number(s.score    ?? s.rating     ?? s.confidence ?? 0),
    tags:     Array.isArray(s.tags) ? s.tags.map(String) : [],
    desc:     String(s.description ?? s.desc ?? s.capability ?? ""),
  }));
}

function normEvents(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)
    ? raw
    : (raw.events ?? raw.ops_events ?? raw.data ?? raw.items ?? []);
  return arr.map((e, i) => ({
    id:       String(e.id       ?? e.event_id   ?? i),
    name:     String(e.name     ?? e.title      ?? e.label ?? `Event-${i}`),
    severity: String(e.severity ?? e.level      ?? ""),
    type:     String(e.type     ?? e.event_type ?? ""),
    tags:     Array.isArray(e.tags) ? e.tags.map(String) : [],
    desc:     String(e.description ?? e.desc ?? e.summary ?? ""),
  }));
}

/* ── token overlap ───────────────────────────────────────────────────────── */
function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function overlap(sigToks, obj) {
  const objToks = tokens(obj.name + " " + (obj.desc || "") + " " + (obj.tags || []).join(" "));
  return sigToks.filter(t => objToks.includes(t)).length;
}

/* ── classification ──────────────────────────────────────────────────────── */
function classify(sig, skills, events) {
  const tt = tokens(sig.name + " " + sig.desc + " " + sig.tags.join(" ") + " " + sig.category);
  const hasSkill = skills.some(s => overlap(tt, s) >= 1);
  const hasEvent = events.some(e => overlap(tt, e) >= 1);
  if (hasSkill && hasEvent) return "FULLY_RESPONDED";
  if (hasSkill)             return "AUTOMATED_ONLY";
  if (hasEvent)             return "EVENT_DRIVEN";
  return "UNRESPONDED";
}

function matchSkills(sig, skills) {
  const tt = tokens(sig.name + " " + sig.desc + " " + sig.tags.join(" "));
  return skills.filter(s => overlap(tt, s) >= 1).slice(0, 4);
}

function matchEvents(sig, events) {
  const tt = tokens(sig.name + " " + sig.desc + " " + sig.tags.join(" "));
  return events.filter(e => overlap(tt, e) >= 1).slice(0, 4);
}

function relevanceScore(sig, item) {
  const tt = tokens(sig.name + " " + sig.desc + " " + sig.tags.join(" "));
  return Math.min(1, overlap(tt, item) / 3);
}

/* ── build script (exported for JarvisBrain) ─────────────────────────────── */
export async function buildArscovScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [sR, skR, eR] = await Promise.all([
    fetch(`${base}/entities/RiskSignal`, { headers }),
    fetch(`${base}/v1/aip/skill`,        { headers }),
    fetch(`${base}/v1/ops/events`,       { headers }),
  ]);
  const [sJ, skJ, eJ] = await Promise.all([sR.json(), skR.json(), eR.json()]);
  const signals = normSignals(sJ);
  const skills  = normSkills(skJ);
  const events  = normEvents(eJ);
  const classified = signals.map(s => ({ ...s, cls: classify(s, skills, events) }));
  const fullyResp  = classified.filter(s => s.cls === "FULLY_RESPONDED").length;
  const autoOnly   = classified.filter(s => s.cls === "AUTOMATED_ONLY").length;
  const evtDriven  = classified.filter(s => s.cls === "EVENT_DRIVEN").length;
  const unresponded = classified.filter(s => s.cls === "UNRESPONDED").length;
  const pct = signals.length ? Math.round((fullyResp / signals.length) * 100) : 0;
  return `ARSCOV online, sir. ${signals.length} risk signals correlated against ${skills.length} AIP skills and ${events.length} ops events. ` +
    `${fullyResp} fully responded, ${autoOnly} automated-only, ${evtDriven} event-driven, ${unresponded} unresponded — ${pct}% full response coverage.`;
}

/* ── voice trigger ───────────────────────────────────────────────────────── */
export function isArscovQuery(q) {
  const lower = (q || "").toLowerCase();
  return /arscov|automated response coverage|risk signal response|unresponded risk|risk automation coverage|response coverage index/.test(lower);
}

/* ── stat tile ───────────────────────────────────────────────────────────── */
function StatTile({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: DIM, borderRadius: 6, padding: "8px 10px", minWidth: 70, textAlign: "center" }}>
      <div style={{ fontFamily: MN, fontSize: 18, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}

const CLS_META = {
  FULLY_RESPONDED:  { color: GN, label: "FULLY RESP"  },
  AUTOMATED_ONLY:   { color: PU, label: "AUTO ONLY"   },
  EVENT_DRIVEN:     { color: AM, label: "EVENT DRIVEN" },
  UNRESPONDED:      { color: RD, label: "UNRESPONDED"  },
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

function RelevanceBar({ score, color }) {
  return (
    <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: "100%", width: `${Math.round(score * 100)}%`, background: color, borderRadius: 2 }} />
    </div>
  );
}

/* ── main component ──────────────────────────────────────────────────────── */
export default function RiskSignalAutomatedResponseCoverage() {
  const [open, setOpen]         = useState(false);
  const [signals, setSignals]   = useState([]);
  const [skills, setSkills]     = useState([]);
  const [events, setEvents]     = useState([]);
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
      const [sR, skR, eR] = await Promise.all([
        fetch(`${base}/entities/RiskSignal`, { headers }),
        fetch(`${base}/v1/aip/skill`,        { headers }),
        fetch(`${base}/v1/ops/events`,       { headers }),
      ]);
      const [sJ, skJ, eJ] = await Promise.all([sR.json(), skR.json(), eR.json()]);
      const sigs  = normSignals(sJ);
      const skils = normSkills(skJ);
      const evts  = normEvents(eJ);
      const classified = sigs.map(s => ({
        ...s,
        cls:           classify(s, skils, evts),
        matchedSkills: matchSkills(s, skils),
        matchedEvents: matchEvents(s, evts),
      }));
      setSignals(classified); setSkills(skils); setEvents(evts);
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:arscov-toggle", handler);
    return () => window.removeEventListener("jarvis:arscov-toggle", handler);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildArscovScript();
      const base   = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const chatR = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers,
        body: JSON.stringify({ message: `ARSCOV assessment: ${script}. Provide a 2-sentence automated response coverage brief.` }),
      });
      const chatJ = await chatR.json();
      const reply = chatJ.response ?? chatJ.message ?? chatJ.content ?? script;
      const ttsR = await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers,
        body: JSON.stringify({ text: reply, voice: getActiveVoice() }),
      });
      if (ttsR.ok) {
        const blob = await ttsR.blob();
        const url  = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
        audio.onended = () => URL.revokeObjectURL(url);
      }
    } catch { /* non-critical */ }
    setAssessing(false);
  }, [assessing]);

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{ position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_IDX,
          background: "rgba(255,61,61,0.08)", border: "1px solid rgba(255,61,61,0.35)",
          color: RD, fontFamily: MN, fontSize: 10, padding: "4px 9px", borderRadius: 4,
          cursor: "pointer", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
        ◈ ARSCOV
      </button>
    );
  }

  const fullyResp  = signals.filter(s => s.cls === "FULLY_RESPONDED").length;
  const autoOnly   = signals.filter(s => s.cls === "AUTOMATED_ONLY").length;
  const evtDriven  = signals.filter(s => s.cls === "EVENT_DRIVEN").length;
  const unresponded = signals.filter(s => s.cls === "UNRESPONDED").length;
  const covPct = signals.length ? Math.round((fullyResp / signals.length) * 100) : 0;

  const TABS = ["ALL", "FULLY_RESPONDED", "AUTOMATED_ONLY", "EVENT_DRIVEN", "UNRESPONDED"];
  const visible = signals.filter(s => {
    if (filter !== "ALL" && s.cls !== filter) return false;
    if (search) {
      const lc = search.toLowerCase();
      return s.name.toLowerCase().includes(lc) || s.category.toLowerCase().includes(lc);
    }
    return true;
  });

  return (
    <div style={{ position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
      background: "rgba(0,0,0,0.55)", zIndex: Z_IDX, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: BG, border: "1px solid rgba(255,61,61,0.18)", borderRadius: 10,
        width: "min(900px,96vw)", maxHeight: "88vh", display: "flex", flexDirection: "column",
        boxShadow: "0 0 40px rgba(0,0,0,0.7)", overflow: "hidden" }}>

        {/* header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: MN, fontSize: 11, color: RD, fontWeight: 700, letterSpacing: "0.08em" }}>
            ◈ ARSCOV — Automated Response Coverage
          </span>
          <span style={{ marginLeft: "auto", fontFamily: MN, fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
            {signals.length} signals · {skills.length} skills · {events.length} events
          </span>
          {unresponded > 0 && (
            <span style={{ fontFamily: MN, fontSize: 10, fontWeight: 700, color: AM,
              border: `1px solid ${AM}`, borderRadius: 3, padding: "1px 6px" }}>
              {unresponded} UNRESPONDED
            </span>
          )}
          <button onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)",
              fontSize: 16, cursor: "pointer", padding: "0 4px" }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
          <StatTile label="RISK SIGNALS" value={signals.length}  color={RD} />
          <StatTile label="AIP SKILLS"   value={skills.length}   color={PU} />
          <StatTile label="OPS EVENTS"   value={events.length}   color={OR} />
          <StatTile label="FULLY RESP."  value={fullyResp}       color={GN} />
          <StatTile label="AUTO ONLY"    value={autoOnly}        color={PU} />
          <StatTile label="EVENT DRIVEN" value={evtDriven}       color={AM} />
          <StatTile label="UNRESPONDED"  value={unresponded}     color={RD} />
          <StatTile label="COV%"         value={`${covPct}%`}    color={covPct >= 70 ? GN : covPct >= 40 ? AM : RD} />
        </div>

        {/* coverage bar */}
        <div style={{ padding: "0 14px 8px" }}>
          <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
            <div style={{ height: "100%", width: `${covPct}%`, borderRadius: 3,
              background: covPct >= 70 ? GN : covPct >= 40 ? AM : RD }} />
          </div>
        </div>

        {/* filter tabs */}
        <div style={{ display: "flex", gap: 6, padding: "0 14px 8px", flexWrap: "wrap", alignItems: "center" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setFilter(t)}
              style={{ background: filter === t ? "rgba(255,61,61,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${filter === t ? RD : "rgba(255,255,255,0.12)"}`,
                color: filter === t ? RD : "rgba(255,255,255,0.5)",
                fontFamily: MN, fontSize: 9, padding: "3px 8px", borderRadius: 4,
                cursor: "pointer", letterSpacing: "0.05em" }}>
              {t.replace(/_/g, " ")}
            </button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search signals…"
            style={{ marginLeft: "auto", background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)", color: "#fff",
              fontFamily: MN, fontSize: 10, padding: "3px 8px", borderRadius: 4, width: 140 }} />
        </div>

        {/* assess button */}
        <div style={{ padding: "0 14px 8px" }}>
          <button onClick={assess} disabled={assessing}
            style={{ background: assessing ? "rgba(255,61,61,0.05)" : "rgba(255,61,61,0.12)",
              border: `1px solid ${assessing ? "rgba(255,61,61,0.2)" : RD}`,
              color: assessing ? "rgba(255,61,61,0.4)" : RD,
              fontFamily: MN, fontSize: 10, padding: "5px 14px", borderRadius: 4,
              cursor: assessing ? "default" : "pointer", letterSpacing: "0.06em" }}>
            {assessing ? "▶ ASSESSING…" : "▶ ASSESS RESPONSE COVERAGE"}
          </button>
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 12px" }}>
          {loading && (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)",
              fontFamily: MN, fontSize: 11, padding: 32 }}>Loading…</div>
          )}
          {error && (
            <div style={{ textAlign: "center", color: RD,
              fontFamily: MN, fontSize: 11, padding: 32 }}>{error}</div>
          )}
          {!loading && !error && visible.length === 0 && (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.25)",
              fontFamily: MN, fontSize: 11, padding: 32 }}>No signals match.</div>
          )}
          {visible.map(sig => (
            <div key={sig.id}
              style={{ marginBottom: 4, borderRadius: 6,
                background: sig.cls === "UNRESPONDED" ? "rgba(255,61,61,0.06)" : DIM,
                border: sig.cls === "UNRESPONDED"
                  ? "1px solid rgba(255,61,61,0.18)"
                  : "1px solid rgba(255,255,255,0.06)",
                animation: sig.cls === "UNRESPONDED" ? "pulse 2s infinite" : "none" }}>
              <div onClick={() => setExpanded(e => e === sig.id ? null : sig.id)}
                style={{ padding: "8px 12px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: MN, fontSize: 11, color: RD, flex: 1, fontWeight: 600 }}>
                  {sig.name}
                </span>
                {sig.category && (
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: MN }}>{sig.category}</span>
                )}
                {sig.severity && (
                  <span style={{ fontSize: 9, color: AM, fontFamily: MN, fontWeight: 700 }}>{sig.severity}</span>
                )}
                <ClsBadge cls={sig.cls} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: MN }}>
                  {expanded === sig.id ? "▲" : "▼"}
                </span>
              </div>
              {expanded === sig.id && (
                <div style={{ padding: "0 12px 12px", display: "flex", gap: 12 }}>
                  {/* skills */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: PU, fontFamily: MN, fontWeight: 700,
                      marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      AIP Skills ({sig.matchedSkills.length})
                    </div>
                    {sig.matchedSkills.length === 0
                      ? <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: MN }}>No matching skills.</div>
                      : sig.matchedSkills.map(s => (
                          <div key={s.id} style={{ background: "rgba(206,147,216,0.07)", borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: "#fff", fontFamily: MN }}>{s.name}</div>
                            {s.category && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{s.category}</div>}
                            <RelevanceBar score={relevanceScore(sig, s)} color={PU} />
                          </div>
                        ))}
                  </div>
                  {/* events */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: OR, fontFamily: MN, fontWeight: 700,
                      marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Ops Events ({sig.matchedEvents.length})
                    </div>
                    {sig.matchedEvents.length === 0
                      ? <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: MN }}>No matching events.</div>
                      : sig.matchedEvents.map(e => (
                          <div key={e.id} style={{ background: "rgba(255,152,0,0.07)", borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: "#fff", fontFamily: MN }}>{e.name}</div>
                            {e.type && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>{e.type}</div>}
                            <RelevanceBar score={relevanceScore(sig, e)} color={OR} />
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
