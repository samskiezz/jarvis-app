/**
 * F68 – Contact × SwarmJob × Scenario Coverage Nexus (CSJSCOV)
 * Cross-correlates /entities/Contact × /entities/SwarmJob × /v1/scenario/list
 * Classifies each contact:
 *   FULLY_ENGAGED – matched swarm job AND scenario
 *   SWARM_ONLY    – matched swarm job, no scenario
 *   SCENARIO_ONLY – matched scenario, no swarm job
 *   UNENGAGED     – no match in either (coordination gap)
 * UNENGAGED rows pulse red.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT   = 951880;
const Z          = 651;
const REFRESH_MS = 90_000;

const CY   = "#29E7FF";
const AM   = "#F5A623";
const RD   = "#FF3B3B";
const GR   = "#00c878";
const DIM  = "#3a5060";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
function authHdr() { return { Authorization: `Bearer ${API_KEY}` }; }

const CSJSCOV_RE = /\b(csjscov|contact.{0,16}(swarm|scenario|engagement|coverage)|swarm.{0,16}contact|scenario.{0,16}contact|unengaged.{0,16}contact|contact.engagement|contact.swarm.coverage|contact.scenario.coverage|contact.automation.gap)\b/i;

export function isCsjscovQuery(text) { return CSJSCOV_RE.test(text || ""); }

export async function buildCsjscovScript() {
  try {
    const base = apiBase();
    const [cRes, sRes, scRes] = await Promise.all([
      fetch(`${base}/entities/Contact`,    { headers: authHdr() }),
      fetch(`${base}/entities/SwarmJob`,   { headers: authHdr() }),
      fetch(`${base}/v1/scenario/list`,    { headers: authHdr() }),
    ]);
    const [contacts, swarms, scenarios] = await Promise.all([
      cRes.ok  ? cRes.json()  : [],
      sRes.ok  ? sRes.json()  : [],
      scRes.ok ? scRes.json() : [],
    ]);
    const cArr  = (Array.isArray(contacts)  ? contacts  : contacts?.data  ?? []).slice(0, 200);
    const swArr = (Array.isArray(swarms)    ? swarms    : swarms?.data    ?? []).slice(0, 200);
    const scArr = (Array.isArray(scenarios) ? scenarios : scenarios?.data ?? []).slice(0, 200);
    const classified = classifyContacts(cArr, swArr, scArr);
    const unengaged     = classified.filter(r => r.cls === "UNENGAGED").length;
    const fullyEngaged  = classified.filter(r => r.cls === "FULLY_ENGAGED").length;
    return `CSJSCOV coverage nexus: ${cArr.length} contacts, ${swArr.length} swarm jobs, ${scArr.length} scenarios. ` +
      `Engagement: FULLY_ENGAGED ${fullyEngaged}, SWARM_ONLY ${classified.filter(r => r.cls === "SWARM_ONLY").length}, ` +
      `SCENARIO_ONLY ${classified.filter(r => r.cls === "SCENARIO_ONLY").length}, UNENGAGED ${unengaged}. ` +
      (unengaged > 0
        ? `${unengaged} contact${unengaged !== 1 ? "s" : ""} have no swarm job or scenario coverage — coordination gaps requiring attention.`
        : "All contacts have at least one swarm job or scenario association.");
  } catch (e) {
    return `CSJSCOV nexus unavailable: ${e.message}`;
  }
}

function tok(str) {
  return String(str || "").toLowerCase().split(/\W+/).filter(t => t.length > 2);
}
function overlap(a, b) {
  const setB = new Set(b);
  return a.some(t => setB.has(t));
}

function classifyContacts(contacts, swarms, scenarios) {
  return contacts.map(ct => {
    const ctoks = tok(
      (ct.name || ct.full_name || "") + " " +
      (ct.role || ct.title || ct.department || "") + " " +
      (ct.description || ct.bio || ct.notes || "") + " " +
      (Array.isArray(ct.tags) ? ct.tags.join(" ") : "")
    );

    const matchedSw = swarms.filter(sw => {
      const stoks = tok(
        (sw.name || sw.title || "") + " " +
        (sw.description || sw.type || sw.target || "") + " " +
        (Array.isArray(sw.tags) ? sw.tags.join(" ") : "")
      );
      return overlap(ctoks, stoks);
    });

    const matchedSc = scenarios.filter(sc => {
      const sctoks = tok(
        (sc.name || sc.title || "") + " " +
        (sc.description || sc.objective || sc.type || "") + " " +
        (Array.isArray(sc.tags) ? sc.tags.join(" ") : "")
      );
      return overlap(ctoks, sctoks);
    });

    const hasSw = matchedSw.length > 0;
    const hasSc = matchedSc.length > 0;
    let cls = "UNENGAGED";
    if (hasSw && hasSc) cls = "FULLY_ENGAGED";
    else if (hasSw)     cls = "SWARM_ONLY";
    else if (hasSc)     cls = "SCENARIO_ONLY";

    return { ...ct, cls, matchedSw, matchedSc };
  });
}

const CLS_ORDER = ["FULLY_ENGAGED", "SWARM_ONLY", "SCENARIO_ONLY", "UNENGAGED"];
const CLS_COLOUR = {
  FULLY_ENGAGED:  GR,
  SWARM_ONLY:     CY,
  SCENARIO_ONLY:  AM,
  UNENGAGED:      RD,
};

export default function ContactSwarmScenarioNexus() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const [cRes, sRes, scRes] = await Promise.all([
        fetch(`${base}/entities/Contact`,  { headers: authHdr() }),
        fetch(`${base}/entities/SwarmJob`, { headers: authHdr() }),
        fetch(`${base}/v1/scenario/list`,  { headers: authHdr() }),
      ]);
      const [contacts, swarms, scenarios] = await Promise.all([
        cRes.ok  ? cRes.json()  : [],
        sRes.ok  ? sRes.json()  : [],
        scRes.ok ? scRes.json() : [],
      ]);
      const cArr  = (Array.isArray(contacts)  ? contacts  : contacts?.data  ?? []).slice(0, 200);
      const swArr = (Array.isArray(swarms)    ? swarms    : swarms?.data    ?? []).slice(0, 200);
      const scArr = (Array.isArray(scenarios) ? scenarios : scenarios?.data ?? []).slice(0, 200);
      setRows(classifyContacts(cArr, swArr, scArr));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => { if (!o) load(); return !o; });
    window.addEventListener("jarvis:csjscov-toggle", onToggle);
    return () => window.removeEventListener("jarvis:csjscov-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildCsjscovScript();
      const base = apiBase();
      const chatRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      const chatData = chatRes.ok ? await chatRes.json() : null;
      const reply = chatData?.reply || chatData?.response || chatData?.message || script;
      const ttsText = String(reply).slice(0, 400);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: ttsText, voice: getActiveVoice() }),
      });
    } catch (_) {}
    setAssessing(false);
  }, [assessing]);

  const total       = rows.length;
  const fullyEng    = rows.filter(r => r.cls === "FULLY_ENGAGED").length;
  const swarmOnly   = rows.filter(r => r.cls === "SWARM_ONLY").length;
  const scenOnly    = rows.filter(r => r.cls === "SCENARIO_ONLY").length;
  const unengaged   = rows.filter(r => r.cls === "UNENGAGED").length;

  const filtered = rows
    .filter(r => tab === "ALL" || r.cls === tab)
    .filter(r => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (r.name || r.full_name || "").toLowerCase().includes(q) ||
        (r.role || r.title || "").toLowerCase().includes(q) ||
        (r.department || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => CLS_ORDER.indexOf(a.cls) - CLS_ORDER.indexOf(b.cls));

  const btnStyle = {
    position: "fixed",
    bottom: 8,
    left: BTN_LEFT,
    zIndex: Z,
    background: open ? "rgba(41,231,255,0.18)" : "rgba(0,0,0,0.55)",
    border: `1px solid ${open ? CY : "#1e3a45"}`,
    color: open ? CY : "#4a8fa8",
    fontFamily: MONO,
    fontSize: 10,
    padding: "3px 7px",
    borderRadius: 4,
    cursor: "pointer",
    letterSpacing: "0.04em",
    transition: "all 0.15s",
  };

  const panelStyle = {
    position: "fixed",
    top: 60,
    left: "50%",
    transform: "translateX(-50%)",
    width: "min(820px, 96vw)",
    maxHeight: "78vh",
    overflowY: "auto",
    zIndex: Z + 10,
    background: "rgba(6,18,28,0.97)",
    border: `1px solid ${CY}44`,
    borderRadius: 10,
    padding: "18px 20px",
    fontFamily: SANS,
    color: "#c8e6f0",
    boxShadow: "0 0 36px rgba(41,231,255,0.12)",
  };

  return (
    <>
      <button style={btnStyle} onClick={() => { setOpen(o => { if (!o) load(); return !o; }); }}>
        ◈ CSJSCOV
      </button>

      {open && (
        <div style={panelStyle}>
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontFamily: MONO, fontSize: 13, color: CY, letterSpacing: "0.08em" }}>
              CONTACT × SWARM × SCENARIO COVERAGE
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  background: assessing ? "#0a2030" : "rgba(41,231,255,0.1)",
                  border: `1px solid ${CY}66`,
                  color: CY, fontFamily: MONO, fontSize: 10, padding: "3px 10px",
                  borderRadius: 4, cursor: assessing ? "not-allowed" : "pointer",
                }}
              >
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: "#4a8fa8", fontSize: 16, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {[
              { label: "CONTACTS",       val: total,     col: CY },
              { label: "FULLY ENGAGED",  val: fullyEng,  col: GR },
              { label: "SWARM ONLY",     val: swarmOnly, col: CY },
              { label: "SCENARIO ONLY",  val: scenOnly,  col: AM },
              { label: "UNENGAGED",      val: unengaged, col: RD },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.03)", border: `1px solid ${col}33`,
                borderRadius: 6, padding: "7px 14px", minWidth: 90, textAlign: "center",
              }}>
                <div style={{ fontFamily: MONO, fontSize: 18, color: col }}>{val}</div>
                <div style={{ fontSize: 9, color: "#5a8fa8", letterSpacing: "0.06em", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {["ALL", ...CLS_ORDER].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CLS_COLOUR[t] || CY}22` : "transparent",
                  border: `1px solid ${tab === t ? (CLS_COLOUR[t] || CY) : "#1e3a45"}`,
                  color: tab === t ? (CLS_COLOUR[t] || CY) : "#4a8fa8",
                  fontFamily: MONO, fontSize: 9, padding: "3px 9px",
                  borderRadius: 4, cursor: "pointer",
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search contacts…"
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.3)", border: "1px solid #1e3a45",
                color: CY, fontFamily: MONO, fontSize: 10, padding: "3px 8px",
                borderRadius: 4, outline: "none", width: 160,
              }}
            />
          </div>

          {/* status */}
          {loading && <div style={{ color: "#4a8fa8", fontFamily: MONO, fontSize: 11, marginBottom: 8 }}>loading…</div>}
          {error   && <div style={{ color: RD, fontFamily: MONO, fontSize: 11, marginBottom: 8 }}>error: {error}</div>}

          {/* rows */}
          {filtered.map((row, i) => {
            const id    = row.id || row._id || row.name || row.full_name || i;
            const isExp = expanded === id;
            const isUng = row.cls === "UNENGAGED";
            return (
              <div
                key={id}
                style={{
                  background: isUng ? "rgba(255,59,59,0.06)" : "rgba(255,255,255,0.025)",
                  border: `1px solid ${isUng ? RD + "44" : "#1e3a45"}`,
                  borderRadius: 6, marginBottom: 6, padding: "8px 12px",
                  animation: isUng ? "pulse-red 2s infinite" : "none",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 10 }}
                  onClick={() => setExpanded(isExp ? null : id)}
                >
                  <span style={{ fontFamily: MONO, fontSize: 9, color: CLS_COLOUR[row.cls], minWidth: 118 }}>
                    {row.cls}
                  </span>
                  <span style={{ flex: 1, fontSize: 12, color: "#c8e6f0" }}>
                    {row.name || row.full_name || `Contact #${i + 1}`}
                    {(row.role || row.title) && (
                      <span style={{ color: "#4a8fa8", marginLeft: 8, fontSize: 10 }}>
                        {row.role || row.title}
                      </span>
                    )}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: "#4a8fa8" }}>
                    SW:{row.matchedSw.length} SC:{row.matchedSc.length}
                  </span>
                  <span style={{ color: "#4a8fa8", fontSize: 12 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1e3a45" }}>
                    {row.matchedSw.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: AM, marginBottom: 4 }}>SWARM JOBS</div>
                        {row.matchedSw.slice(0, 5).map((sw, j) => (
                          <div key={j} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                              <span style={{ fontSize: 11, color: "#c8e6f0" }}>{sw.name || sw.title || `Job ${j + 1}`}</span>
                              <span style={{ fontFamily: MONO, fontSize: 9, color: "#4a8fa8" }}>{sw.status || sw.type || ""}</span>
                            </div>
                            <div style={{ height: 3, background: DIM, borderRadius: 2 }}>
                              <div style={{ height: "100%", width: `${58 + (j % 4) * 11}%`, background: AM, borderRadius: 2 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {row.matchedSc.length > 0 && (
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: GR, marginBottom: 4 }}>SCENARIOS</div>
                        {row.matchedSc.slice(0, 5).map((sc, j) => (
                          <div key={j} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                              <span style={{ fontSize: 11, color: "#c8e6f0" }}>{sc.name || sc.title || `Scenario ${j + 1}`}</span>
                              <span style={{ fontFamily: MONO, fontSize: 9, color: "#4a8fa8" }}>{sc.type || sc.status || ""}</span>
                            </div>
                            <div style={{ height: 3, background: DIM, borderRadius: 2 }}>
                              <div style={{ height: "100%", width: `${52 + (j % 5) * 10}%`, background: GR, borderRadius: 2 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {row.matchedSw.length === 0 && row.matchedSc.length === 0 && (
                      <div style={{ color: RD, fontFamily: MONO, fontSize: 10 }}>
                        No swarm job or scenario match — coordination gap.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && !loading && (
            <div style={{ color: "#4a8fa8", fontFamily: MONO, fontSize: 11, textAlign: "center", padding: 20 }}>
              no contacts match
            </div>
          )}

          <style>{`
            @keyframes pulse-red {
              0%,100% { box-shadow: 0 0 0 0 rgba(255,59,59,0); }
              50%      { box-shadow: 0 0 8px 2px rgba(255,59,59,0.25); }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
