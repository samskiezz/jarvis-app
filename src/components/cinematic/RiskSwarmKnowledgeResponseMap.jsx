/**
 * F199 — RiskSignal × SwarmJob × Knowledge Autonomous Risk Response Map (ARSRMAP)
 *
 * Parallel-fetches /entities/RiskSignal + /entities/SwarmJob + /knowledge/
 * and keyword-correlates each risk signal against swarm jobs AND KB articles to classify:
 *
 *   FULLY_COVERED     — matched swarm + KB (active autonomous response with knowledge backing)
 *   SWARM_ACTIVE      — swarm job present, no KB guidance
 *   KNOWLEDGE_GUIDED  — KB present, no swarm job active
 *   EXPOSED           — neither (autonomous response gap)
 *
 * Stat tiles: RISK SIGNALS / SWARM JOBS / KB ARTICLES + four class counts + COVERED%.
 * Red badge on EXPOSED count.
 * Filter tabs ALL / FULLY_COVERED / SWARM_ACTIVE / KNOWLEDGE_GUIDED / EXPOSED + text search.
 * Expand signal → matched swarm job cards (purple) + KB article cards (green) with relevance bars.
 * ▶ ASSESS RESPONSE COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:arsrmap-toggle event.
 *
 * Voice triggers:
 *   "arsrmap / autonomous risk response / risk swarm / swarm response / exposed risk /
 *    risk response coverage / swarm knowledge / risk swarm knowledge / autonomous response map"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_053_800;
const Z_INDEX  = 260;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const ARSRMAP_RE = /\b(arsrmap|autonomous[\s-]risk[\s-]response|risk[\s-]swarm|swarm[\s-]response|exposed[\s-]risks?|risk[\s-]response[\s-]coverage|swarm[\s-]knowledge|risk[\s-]swarm[\s-]knowledge|autonomous[\s-]response[\s-]map)\b/i;

export function isArsrmapQuery(q = "") { return ARSRMAP_RE.test(q); }

export async function buildArsrmapScript() {
  const base = apiBase();
  const [rsRes, swRes, kbRes] = await Promise.allSettled([
    fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
    fetch(`${base}/entities/SwarmJob`).then(r => r.json()),
    fetch(`${base}/knowledge/`).then(r => r.json()),
  ]);
  const signals = rsRes.status === "fulfilled" ? (rsRes.value?.items || rsRes.value?.signals || rsRes.value || []) : [];
  const swarms  = swRes.status === "fulfilled" ? (swRes.value?.items || swRes.value?.jobs    || swRes.value || []) : [];
  const kb      = kbRes.status === "fulfilled" ? (kbRes.value?.items || kbRes.value?.articles || kbRes.value || []) : [];

  let fullyCovered = 0, exposed = 0;
  for (const sig of signals) {
    const kws   = keywords(signalText(sig));
    const hasSw = swarms.some(s => scoreText(swarmText(s), kws) > 0);
    const hasKb = kb.some(a    => scoreText(kbText(a),     kws) > 0);
    if (hasSw && hasKb) fullyCovered++;
    else if (!hasSw && !hasKb) exposed++;
  }
  const total       = signals.length;
  const coveredPct  = total ? Math.round((fullyCovered / total) * 100) : 0;
  return `ARSRMAP Autonomous Risk Response Map online, sir. I have cross-referenced ${total} active risk signals against ${swarms.length} swarm jobs and ${kb.length} knowledge base articles. ${fullyCovered} risk signals are fully covered by both an active autonomous swarm response and knowledge-base guidance, representing ${coveredPct}% coverage. ${exposed} signals are completely exposed — no swarm running and no KB guidance in place. Recommend immediate autonomous response triage on those ${exposed} exposed risk signals to close the coverage gap, sir.`;
}

const CY     = "#00CFFF";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const GR     = "#22C55E";
const PU     = "#A78BFA";
const CW     = "#67E8F9";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_COVERED:    GR,
  SWARM_ACTIVE:     PU,
  KNOWLEDGE_GUIDED: CY,
  EXPOSED:          RD,
};

const TABS = ["ALL", "FULLY_COVERED", "SWARM_ACTIVE", "KNOWLEDGE_GUIDED", "EXPOSED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function signalText(s) {
  return [s.title, s.name, s.description, s.type, s.category, s.severity, s.source, s.tags, s.status, s.location].filter(Boolean).join(" ");
}
function swarmText(s) {
  return [s.title, s.name, s.description, s.type, s.status, s.tags, s.category, s.objective, s.mission].filter(Boolean).join(" ");
}
function kbText(a) {
  return [a.title, a.name, a.summary, a.content, a.tags, a.category, a.topic, a.description].filter(Boolean).join(" ");
}

function classify(signal, swarms, kb) {
  const kws = keywords(signalText(signal));
  const matchedSwarms = swarms
    .map(s => ({ ...s, _score: scoreText(swarmText(s), kws) }))
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedKb = kb
    .map(a => ({ ...a, _score: scoreText(kbText(a), kws) }))
    .filter(a => a._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const hasSw = matchedSwarms.length > 0;
  const hasKb = matchedKb.length > 0;
  let cls;
  if (hasSw && hasKb)  cls = "FULLY_COVERED";
  else if (hasSw)      cls = "SWARM_ACTIVE";
  else if (hasKb)      cls = "KNOWLEDGE_GUIDED";
  else                 cls = "EXPOSED";
  return { ...signal, _cls: cls, _swarms: matchedSwarms, _kb: matchedKb };
}

export default function RiskSwarmKnowledgeResponseMap() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [signals, setSignals]       = useState([]);
  const [swarms, setSwarms]         = useState([]);
  const [kb, setKb]                 = useState([]);
  const [classified, setClassified] = useState([]);
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [brief, setBrief]           = useState("");
  const [assessing, setAssessing]   = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [rsRes, swRes, kbRes] = await Promise.allSettled([
        fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
        fetch(`${base}/entities/SwarmJob`).then(r => r.json()),
        fetch(`${base}/knowledge/`).then(r => r.json()),
      ]);
      const rs = rsRes.status === "fulfilled" ? (rsRes.value?.items || rsRes.value?.signals  || rsRes.value || []) : [];
      const sw = swRes.status === "fulfilled" ? (swRes.value?.items || swRes.value?.jobs     || swRes.value || []) : [];
      const kbArr = kbRes.status === "fulfilled" ? (kbRes.value?.items || kbRes.value?.articles || kbRes.value || []) : [];
      setSignals(rs);
      setSwarms(sw);
      setKb(kbArr);
      setClassified(rs.map(s => classify(s, sw, kbArr)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:arsrmap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:arsrmap-toggle", onToggle);
  }, []);

  const fullyCovered    = classified.filter(c => c._cls === "FULLY_COVERED").length;
  const swarmActive     = classified.filter(c => c._cls === "SWARM_ACTIVE").length;
  const knowledgeGuided = classified.filter(c => c._cls === "KNOWLEDGE_GUIDED").length;
  const exposed         = classified.filter(c => c._cls === "EXPOSED").length;
  const total           = classified.length;
  const coveredPct      = total ? Math.round((fullyCovered / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || signalText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `ARSRMAP: ${total} risk signals — FULLY_COVERED: ${fullyCovered}, SWARM_ACTIVE: ${swarmActive}, KNOWLEDGE_GUIDED: ${knowledgeGuided}, EXPOSED: ${exposed} (${coveredPct}% covered). Swarm jobs: ${swarms.length}. KB articles: ${kb.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `ARSRMAP autonomous risk response map assessment. Context: ${ctx}. Provide a 2-sentence operational brief identifying which exposed risk signals represent the highest autonomous response gap and recommend the most urgent swarm deployment or knowledge-base article to address the coverage deficit. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "Response coverage assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      const tts = await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: txt }),
      });
      if (tts.ok) {
        const blob = await tts.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
      }
    } catch (e) {
      setBrief("Assessment unavailable: " + e.message);
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="RiskSignal × SwarmJob × Knowledge Autonomous Risk Response Map (ARSRMAP)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${RD}55`,
          color: RD, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {exposed > 0 && (
          <span style={{ background: RD, color: "#fff", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {exposed}
          </span>
        )}
        ◈ ARSRMAP
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: Z_INDEX,
      background: BG, fontFamily: FONT, overflowY: "auto", padding: "18px 20px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ color: CY, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ ARSRMAP</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          RiskSignal × SwarmJob × Knowledge Autonomous Risk Response Map
        </span>
        {loading && <span style={{ color: AM, fontSize: 10 }}>◌ loading…</span>}
        <button onClick={load} style={smallBtn(CY)} title="Refresh">↺</button>
        <button onClick={() => setOpen(false)} style={smallBtn(RD)}>✕</button>
      </div>

      {error && (
        <div style={{ color: RD, fontSize: 11, marginBottom: 10, padding: "6px 10px", border: `1px solid ${RD}44`, borderRadius: 4 }}>
          {error}
        </div>
      )}

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          ["RISK SIGNALS",     total,           CY],
          ["SWARM JOBS",       swarms.length,   PU],
          ["KB ARTICLES",      kb.length,       GR],
          ["FULLY COVERED",    fullyCovered,    GR],
          ["SWARM ACTIVE",     swarmActive,     PU],
          ["KNOWLEDGE GUIDED", knowledgeGuided, CW],
          ["EXPOSED",          exposed,         RD],
          ["COVERED%",         coveredPct + "%", GR],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,207,255,0.04)", border: `1px solid ${col}33`,
            borderRadius: 5, padding: "5px 10px", minWidth: 90, textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>AUTONOMOUS RISK RESPONSE COVERAGE</div>
        <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", position: "relative", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${coveredPct}%`, background: GR, borderRadius: 3, transition: "width 0.4s" }} />
        </div>
        <div style={{ color: GR, fontSize: 9, marginTop: 2 }}>{coveredPct}% of risk signals covered by active swarm response + knowledge guidance</div>
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={assess} disabled={assessing} style={{
          fontFamily: FONT, fontSize: 10, letterSpacing: 1, cursor: assessing ? "not-allowed" : "pointer",
          background: assessing ? "rgba(0,207,255,0.1)" : "rgba(0,207,255,0.15)",
          border: `1px solid ${CY}66`, color: CY, padding: "4px 10px", borderRadius: 4,
        }}>
          {assessing ? "◌ assessing…" : "▶ ASSESS RESPONSE COVERAGE"}
        </button>
      </div>
      {brief && (
        <div style={{ color: "#DCEBF5", fontSize: 12, lineHeight: 1.5, marginBottom: 12,
          padding: "8px 12px", background: "rgba(0,207,255,0.06)", borderRadius: 6,
          border: `1px solid ${CY}22` }}>
          {brief}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontFamily: FONT, fontSize: 9, letterSpacing: 1, padding: "3px 8px", borderRadius: 4,
            cursor: "pointer",
            background: tab === t ? (CLASS_COLOR[t] || CY) : "rgba(0,207,255,0.06)",
            border: `1px solid ${tab === t ? (CLASS_COLOR[t] || CY) : "rgba(0,207,255,0.18)"}`,
            color: tab === t ? (t === "EXPOSED" ? "#fff" : "#000") : (CLASS_COLOR[t] || CY),
          }}>
            {t.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="search risk signals…"
        style={{
          fontFamily: FONT, fontSize: 11, width: "100%", maxWidth: 340, marginBottom: 12,
          background: "rgba(0,207,255,0.04)", border: `1px solid ${BORDER}`,
          color: "#DCEBF5", borderRadius: 4, padding: "5px 10px", outline: "none",
        }}
      />

      {/* Signal list */}
      {visible.length === 0 && !loading && (
        <div style={{ color: "#6E8AA0", fontSize: 11 }}>No risk signals match current filter.</div>
      )}
      {visible.map((sig, i) => {
        const col   = CLASS_COLOR[sig._cls];
        const isExp = expanded === i;
        const name  = sig.title || sig.name || `Risk Signal ${i + 1}`;
        return (
          <div key={i} style={{
            marginBottom: 6, border: `1px solid ${col}33`, borderRadius: 6,
            background: "rgba(0,207,255,0.02)", overflow: "hidden",
          }}>
            <div
              onClick={() => setExpanded(isExp ? null : i)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
            >
              <span style={{ color: col, fontSize: 9, letterSpacing: 1, border: `1px solid ${col}55`,
                borderRadius: 3, padding: "1px 5px", minWidth: 130, textAlign: "center" }}>
                {sig._cls.replace(/_/g, " ")}
              </span>
              <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{name}</span>
              {sig.severity && (
                <span style={{ color: RD, fontSize: 9, border: `1px solid ${RD}44`, borderRadius: 2, padding: "0 4px" }}>
                  {sig.severity}
                </span>
              )}
              {sig._swarms.length > 0 && (
                <span style={{ color: PU, fontSize: 9 }}>⊕ {sig._swarms.length} swarm{sig._swarms.length !== 1 ? "s" : ""}</span>
              )}
              {sig._kb.length > 0 && (
                <span style={{ color: GR, fontSize: 9 }}>⊕ {sig._kb.length} kb</span>
              )}
              <span style={{ color: col, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
            </div>

            {isExp && (
              <div style={{ padding: "0 10px 10px 10px", borderTop: `1px solid ${col}22` }}>
                {sig.description && (
                  <div style={{ color: "#6E8AA0", fontSize: 10, marginTop: 6, marginBottom: 8 }}>
                    {String(sig.description).slice(0, 200)}
                  </div>
                )}

                {sig._swarms.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>▸ MATCHED SWARM JOBS</div>
                    {sig._swarms.map((s, j) => {
                      const maxScore = Math.max(...sig._swarms.map(x => x._score), 1);
                      const bar = Math.round((s._score / maxScore) * 100);
                      return (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>
                              {s.title || s.name || "Swarm Job"}
                            </span>
                            {s.status && (
                              <span style={{ color: PU, fontSize: 9, border: `1px solid ${PU}44`, borderRadius: 2, padding: "0 4px" }}>
                                {s.status}
                              </span>
                            )}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.05)", marginTop: 2 }}>
                            <div style={{ height: "100%", width: `${bar}%`, background: PU, borderRadius: 2, opacity: 0.7 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {sig._kb.length > 0 && (
                  <div>
                    <div style={{ color: GR, fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>▸ MATCHED KB ARTICLES</div>
                    {sig._kb.map((a, k) => {
                      const maxScore = Math.max(...sig._kb.map(x => x._score), 1);
                      const bar = Math.round((a._score / maxScore) * 100);
                      return (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>
                              {a.title || a.name || "KB Article"}
                            </span>
                            {a.category && (
                              <span style={{ color: GR, fontSize: 9, border: `1px solid ${GR}44`, borderRadius: 2, padding: "0 4px" }}>
                                {a.category}
                              </span>
                            )}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.05)", marginTop: 2 }}>
                            <div style={{ height: "100%", width: `${bar}%`, background: GR, borderRadius: 2, opacity: 0.7 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {sig._swarms.length === 0 && sig._kb.length === 0 && (
                  <div style={{ color: RD, fontSize: 10, marginTop: 6 }}>
                    ◌ No swarm or KB match — risk signal completely exposed
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function smallBtn(color) {
  return {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10, cursor: "pointer",
    background: "transparent", border: `1px solid ${color}55`,
    color: color, padding: "2px 6px", borderRadius: 3,
  };
}
