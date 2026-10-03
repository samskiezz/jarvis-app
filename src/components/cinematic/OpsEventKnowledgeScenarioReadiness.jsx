import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const CY = "#00E5FF"; const GN = "#4CAF50";
const OR = "#FF9800"; const RD = "#FF3D3D";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const REFRESH_MS = 90_000;
const BTN_LEFT   = 1098400;
const Z_IDX      = 677;

const OKRSRI_RE = /\b(okrsri|ops readiness|ops knowledge scenario|event knowledge|event scenario readiness|response readiness|operational readiness index)\b/i;
export function isOkrsriQuery(t) { return OKRSRI_RE.test(t || ""); }

function tokens(s) {
  return String(s || "").toLowerCase().split(/[\s,;:|\/\-_]+/).filter(w => w.length > 3);
}
function overlap(a, b) {
  const sa = new Set(tokens(a));
  let n = 0;
  for (const w of tokens(b)) if (sa.has(w)) n++;
  return n;
}

function normEvents(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.events) ? raw.events
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data) ? raw.data
    : [];
  return arr.map(e => ({
    id: e.id || e._id || "",
    label: e.title || e.name || e.label || e.event_type || String(e.id || ""),
    description: e.description || e.summary || e.details || "",
    type: e.type || e.category || e.event_type || "",
    severity: e.severity || e.level || "",
    tags: Array.isArray(e.tags) ? e.tags.join(" ") : String(e.tags || ""),
  }));
}

function normKnowledge(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.articles) ? raw.articles
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data) ? raw.data
    : [];
  return arr.map(k => ({
    id: k.id || k._id || "",
    label: k.title || k.name || k.label || String(k.id || ""),
    description: k.content || k.summary || k.body || k.description || "",
    category: k.category || k.type || "",
    tags: Array.isArray(k.tags) ? k.tags.join(" ") : String(k.tags || ""),
  }));
}

function normScenarios(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.scenarios) ? raw.scenarios
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data) ? raw.data
    : [];
  return arr.map(s => ({
    id: s.id || s._id || "",
    label: s.name || s.title || s.label || String(s.id || ""),
    description: s.description || s.summary || s.objective || "",
    type: s.type || s.category || "",
    tags: Array.isArray(s.tags) ? s.tags.join(" ") : String(s.tags || ""),
  }));
}

function classify(evt, knowledge, scenarios) {
  const hay = evt.label + " " + evt.description + " " + evt.type + " " + evt.tags;
  const hasKB       = knowledge.some(k => overlap(hay, k.label + " " + k.description + " " + k.category + " " + k.tags) >= 1);
  const hasScenario = scenarios.some(s => overlap(hay, s.label + " " + s.description + " " + s.type + " " + s.tags) >= 1);
  if (hasKB && hasScenario) return "FULLY_PREPARED";
  if (hasKB)                return "KB_ONLY";
  if (hasScenario)          return "SCENARIO_ONLY";
  return "UNPREPARED";
}

function relevance(hay, itemText) {
  return Math.min(100, overlap(hay, itemText) * 20);
}

const clsColor = cls => ({
  FULLY_PREPARED: GN,
  KB_ONLY:        CY,
  SCENARIO_ONLY:  OR,
  UNPREPARED:     RD,
}[cls] || "#888");

const clsLabel = cls => ({
  FULLY_PREPARED: "FULLY PREPARED",
  KB_ONLY:        "KB ONLY",
  SCENARIO_ONLY:  "SCENARIO ONLY",
  UNPREPARED:     "UNPREPARED",
}[cls] || cls);

export async function buildOkrsriScript() {
  const base = apiBase();
  const hdr = { Authorization: `Bearer ${API_KEY}` };
  const [evRaw, kbRaw, scRaw] = await Promise.all([
    fetch(`${base}/v1/ops/events`,    { headers: hdr }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/knowledge/`,        { headers: hdr }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/scenario/list`,  { headers: hdr }).then(r => r.ok ? r.json() : []),
  ]);
  const events    = normEvents(evRaw);
  const knowledge = normKnowledge(kbRaw);
  const scenarios = normScenarios(scRaw);
  const counts = { FULLY_PREPARED: 0, KB_ONLY: 0, SCENARIO_ONLY: 0, UNPREPARED: 0 };
  events.forEach(e => counts[classify(e, knowledge, scenarios)]++);
  return `OKRSRI online, sir. ${events.length} operational events assessed for response readiness. `
    + `${counts.FULLY_PREPARED} fully prepared (KB + playbook), ${counts.KB_ONLY} knowledge-only, `
    + `${counts.SCENARIO_ONLY} scenario-only, ${counts.UNPREPARED} unprepared — readiness gaps detected. `
    + `${knowledge.length} KB articles and ${scenarios.length} scenarios correlated.`;
}

export default function OpsEventKnowledgeScenarioReadiness() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [knowledge, setKnowledge] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [evRaw, kbRaw, scRaw] = await Promise.all([
        fetch(`${base}/v1/ops/events`,   { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/knowledge/`,       { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/scenario/list`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      ]);
      setEvents(normEvents(evRaw));
      setKnowledge(normKnowledge(kbRaw));
      setScenarios(normScenarios(scRaw));
    } catch { /* stay stale */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener("jarvis:okrsri-toggle", handler);
    return () => window.removeEventListener("jarvis:okrsri-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const classified = events.map(e => ({ ...e, cls: classify(e, knowledge, scenarios) }));
  const unpreparedCount = classified.filter(e => e.cls === "UNPREPARED").length;

  const tabs = ["ALL", "FULLY_PREPARED", "KB_ONLY", "SCENARIO_ONLY", "UNPREPARED"];
  const filtered = classified
    .filter(e => tab === "ALL" || e.cls === tab)
    .filter(e => !search || e.label.toLowerCase().includes(search.toLowerCase()) || e.description.toLowerCase().includes(search.toLowerCase()));

  const counts = { FULLY_PREPARED: 0, KB_ONLY: 0, SCENARIO_ONLY: 0, UNPREPARED: 0 };
  classified.forEach(e => counts[e.cls]++);

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const hdr = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const ctx = `${classified.length} ops events: ${counts.FULLY_PREPARED} fully prepared, ${counts.KB_ONLY} KB-only, ${counts.SCENARIO_ONLY} scenario-only, ${counts.UNPREPARED} unprepared.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ message: `OKRSRI operational readiness assessment: ${ctx} Give a 2-sentence brief on response readiness gaps and recommended priority actions.` }),
      });
      const d = await r.json();
      const text = d.response || d.answer || d.message || d.result || "";
      setBrief(text);
      if (text) {
        const ttsR = await fetch(`${base}/v1/voice/tts`, {
          method: "POST", headers: hdr,
          body: JSON.stringify({ text, voice: getActiveVoice() }),
        });
        if (ttsR.ok) {
          const blob = await ttsR.blob();
          new Audio(URL.createObjectURL(blob)).play();
        }
      }
    } catch { setBrief("Assessment unavailable — backend unreachable."); }
    setAssessing(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
          background: open ? `${AM}22` : "rgba(10,14,24,0.82)",
          border: `1px solid ${open ? AM : "#333"}`,
          borderRadius: 4, color: open ? AM : "#666",
          fontFamily: MN, fontSize: 9, fontWeight: 700,
          padding: "3px 8px", cursor: "pointer", letterSpacing: 1,
        }}
      >
        ◈ OKRSRI
        {unpreparedCount > 0 && (
          <span style={{
            marginLeft: 5, background: RD, color: "#fff",
            borderRadius: 8, fontSize: 8, padding: "1px 5px", fontWeight: 900,
          }}>{unpreparedCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: Math.min(BTN_LEFT, window.innerWidth - 480),
          width: 460, maxHeight: "72vh", overflowY: "auto",
          background: BG, border: `1px solid ${AM}55`, borderRadius: 8,
          zIndex: Z_IDX + 1, padding: 14, fontFamily: MN,
          boxShadow: `0 0 24px ${AM}22`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ color: AM, fontWeight: 900, fontSize: 12, letterSpacing: 2 }}>OKRSRI — OPS RESPONSE READINESS INDEX</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#555", fontSize: 14, cursor: "pointer" }}>✕</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["EVENTS",         classified.length,                           "#888"],
              ["FULLY PREPARED", counts.FULLY_PREPARED,                       GN],
              ["PARTIAL",        counts.KB_ONLY + counts.SCENARIO_ONLY,       CY],
              ["UNPREPARED",     counts.UNPREPARED,                           RD],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background: `${color}11`, border: `1px solid ${color}33`, borderRadius: 5, padding: "6px 4px", textAlign: "center" }}>
                <div style={{ color, fontWeight: 900, fontSize: 16 }}>{loading ? "…" : val}</div>
                <div style={{ color: "#666", fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {classified.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ color: "#888", fontSize: 9 }}>READINESS COVERAGE</span>
                <span style={{ color: GN, fontSize: 9, fontWeight: 700 }}>{Math.round(counts.FULLY_PREPARED / classified.length * 100)}%</span>
              </div>
              <div style={{ background: "#111", borderRadius: 3, height: 4 }}>
                <div style={{ width: `${Math.round(counts.FULLY_PREPARED / classified.length * 100)}%`, height: "100%", background: GN, borderRadius: 3 }} />
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {tabs.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${AM}22` : "none",
                border: `1px solid ${tab === t ? AM : "#333"}`,
                color: tab === t ? AM : "#555",
                borderRadius: 3, fontSize: 8, padding: "2px 7px", cursor: "pointer", fontFamily: MN,
              }}>{t === "ALL" ? `ALL (${classified.length})` : `${clsLabel(t)} (${counts[t] || 0})`}</button>
            ))}
          </div>

          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search ops events…"
            style={{
              width: "100%", background: "#0a0f18", border: "1px solid #222", borderRadius: 4,
              color: "#ccc", fontFamily: MN, fontSize: 11, padding: "5px 8px",
              marginBottom: 8, boxSizing: "border-box",
            }}
          />

          {loading && <div style={{ color: "#555", textAlign: "center", padding: 20, fontSize: 11 }}>Loading…</div>}

          {!loading && filtered.map(evt => {
            const hay = evt.label + " " + evt.description + " " + evt.type + " " + evt.tags;
            const isExp = expanded === evt.id;
            const matchedKB       = knowledge.filter(k => overlap(hay, k.label + " " + k.description + " " + k.category + " " + k.tags) >= 1);
            const matchedScenarios = scenarios.filter(s => overlap(hay, s.label + " " + s.description + " " + s.type + " " + s.tags) >= 1);
            return (
              <div key={evt.id} style={{
                background: DIM, border: `1px solid ${clsColor(evt.cls)}22`,
                borderRadius: 5, marginBottom: 6, padding: "7px 10px",
                animation: evt.cls === "UNPREPARED" ? "okrsriPulse 2.4s ease-in-out infinite" : "none",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ color: "#fff", fontWeight: 700 }}>{evt.label}</span>
                    {evt.type     && <span style={{ color: "#888", marginLeft: 6, fontSize: 10 }}>{evt.type}</span>}
                    {evt.severity && <span style={{ color: OR,    marginLeft: 6, fontSize: 10 }}>{evt.severity}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{
                      background: `${clsColor(evt.cls)}22`, border: `1px solid ${clsColor(evt.cls)}`,
                      color: clsColor(evt.cls), borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700,
                    }}>{clsLabel(evt.cls)}</span>
                    <button onClick={() => setExpanded(isExp ? null : evt.id)} style={{
                      background: "none", border: `1px solid #333`, borderRadius: 3,
                      color: "#888", fontSize: 9, padding: "1px 5px", cursor: "pointer",
                    }}>{isExp ? "▲" : "▼"}</button>
                  </div>
                </div>

                {isExp && (
                  <div style={{ marginTop: 8 }}>
                    {matchedKB.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ color: GN, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>MATCHED KB ARTICLES ({matchedKB.length})</div>
                        {matchedKB.slice(0, 4).map(k => {
                          const rel = relevance(hay, k.label + " " + k.description + " " + k.category + " " + k.tags);
                          return (
                            <div key={k.id} style={{ background: `${GN}0a`, border: `1px solid ${GN}22`, borderRadius: 3, padding: "4px 8px", marginBottom: 3 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ color: "#ccc", fontSize: 11 }}>{k.label}</span>
                                {k.category && <span style={{ background: `${GN}22`, color: GN, borderRadius: 2, padding: "0 4px", fontSize: 8 }}>{k.category}</span>}
                              </div>
                              <div style={{ marginTop: 3, background: "#111", borderRadius: 2, height: 3 }}>
                                <div style={{ width: `${rel}%`, height: "100%", background: GN, borderRadius: 2 }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {matchedScenarios.length > 0 && (
                      <div>
                        <div style={{ color: CY, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>MATCHED SCENARIOS ({matchedScenarios.length})</div>
                        {matchedScenarios.slice(0, 4).map(s => {
                          const rel = relevance(hay, s.label + " " + s.description + " " + s.type + " " + s.tags);
                          return (
                            <div key={s.id} style={{ background: `${CY}0a`, border: `1px solid ${CY}22`, borderRadius: 3, padding: "4px 8px", marginBottom: 3 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ color: "#ccc", fontSize: 11 }}>{s.label}</span>
                                {s.type && <span style={{ background: `${CY}22`, color: CY, borderRadius: 2, padding: "0 4px", fontSize: 8 }}>{s.type}</span>}
                              </div>
                              <div style={{ marginTop: 3, background: "#111", borderRadius: 2, height: 3 }}>
                                <div style={{ width: `${rel}%`, height: "100%", background: CY, borderRadius: 2 }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {matchedKB.length === 0 && matchedScenarios.length === 0 && (
                      <div style={{ color: RD, fontSize: 10, padding: "4px 0" }}>No KB article or scenario match — operational readiness gap.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={assess}
            disabled={assessing}
            style={{
              marginTop: 10, width: "100%", background: assessing ? "#111" : `${AM}22`,
              border: `1px solid ${AM}`, borderRadius: 4, color: AM,
              fontFamily: MN, fontSize: 11, fontWeight: 700, padding: "6px 0", cursor: assessing ? "default" : "pointer",
            }}
          >
            {assessing ? "ASSESSING…" : "▶ ASSESS RESPONSE READINESS"}
          </button>
          {brief && (
            <div style={{ marginTop: 8, background: `${AM}11`, border: `1px solid ${AM}33`, borderRadius: 4, padding: 8, color: "#ccc", fontSize: 11, lineHeight: 1.5 }}>
              {brief}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes okrsriPulse {
          0%,100% { border-color: ${RD}22; }
          50% { border-color: ${RD}88; box-shadow: 0 0 6px ${RD}44; }
        }
      `}</style>
    </>
  );
}
