/**
 * F218 — Contact × Ops Event × Dataset × RiskSignal Operational Exposure Nexus (COEDRN)
 *
 * Parallel-fetches /entities/Contact + /v1/ops/events + /v1/datasets + /entities/RiskSignal
 * and keyword-correlates each contact against ops events AND datasets AND risk signals to classify:
 *
 *   FULLY_EXPOSED  — matched ops events + datasets + risk signals (highest exposure)
 *   DUAL_EXPOSED   — matched any two of three sources
 *   SINGLE_TRACKED — matched exactly one source
 *   CLEAR          — no matches in any source
 *
 * Stat tiles: CONTACTS / OPS EVENTS / DATASETS / RISK SIGS + four class counts + EXPOSURE%.
 * Red pulse badge on FULLY_EXPOSED count.
 * Filter tabs ALL / FULLY_EXPOSED / DUAL_EXPOSED / SINGLE_TRACKED / CLEAR + text search.
 * Expand contact → matched ops event cards (blue) + dataset cards (purple) + risk signal cards (red).
 * ▶ ASSESS EXPOSURE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:coedrn-toggle event.
 *
 * Voice triggers:
 *   "coedrn / contact exposure / contact ops data risk /
 *    exposed contacts / operational exposure nexus /
 *    fully exposed contacts / contact multi exposure"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_064_440;
const Z_INDEX  = 279;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const COEDRN_RE = /\b(coedrn|contact[\s-]exposure|contact[\s-]ops[\s-]data[\s-]risk|exposed[\s-]contacts|operational[\s-]exposure[\s-]nexus|fully[\s-]exposed[\s-]contacts|contact[\s-]multi[\s-]exposure)\b/i;

export function isCoedrnQuery(q = "") { return COEDRN_RE.test(q); }

export async function buildCoedrnScript() {
  const base = apiBase();
  const [conRes, opsRes, datRes, rskRes] = await Promise.allSettled([
    fetch(`${base}/entities/Contact`).then(r => r.json()),
    fetch(`${base}/v1/ops/events`).then(r => r.json()),
    fetch(`${base}/v1/datasets`).then(r => r.json()),
    fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
  ]);
  const contacts    = conRes.status === "fulfilled" ? (conRes.value?.items || conRes.value || []) : [];
  const opsEvents   = opsRes.status === "fulfilled" ? (opsRes.value?.items || opsRes.value || []) : [];
  const datasets    = datRes.status === "fulfilled" ? (datRes.value?.items || datRes.value || []) : [];
  const riskSignals = rskRes.status === "fulfilled" ? (rskRes.value?.items || rskRes.value || []) : [];

  let fullyExposed = 0, clear = 0;
  for (const c of contacts) {
    const kws    = keywords(contactText(c));
    const hasOps = opsEvents.some(e => scoreText(opsText(e), kws) > 0);
    const hasDat = datasets.some(d => scoreText(datasetText(d), kws) > 0);
    const hasRsk = riskSignals.some(r => scoreText(riskText(r), kws) > 0);
    if (hasOps && hasDat && hasRsk) fullyExposed++;
    else if (!hasOps && !hasDat && !hasRsk) clear++;
  }
  const total      = contacts.length;
  const exposurePct = total ? Math.round((fullyExposed / total) * 100) : 0;
  return `COEDRN Operational Exposure Nexus online, sir. I have cross-referenced ${total} contacts against ${opsEvents.length} ops events, ${datasets.length} datasets, and ${riskSignals.length} active risk signals. ${fullyExposed} contacts are fully exposed across all three intelligence sources, representing ${exposurePct}% tri-source exposure. ${clear} contacts show no operational exposure — this may indicate untracked personnel or intelligence blind spots requiring immediate review, sir.`;
}

const CY   = "#00CFFF";
const AM   = "#F59E0B";
const RD   = "#EF4444";
const GR   = "#22C55E";
const BL   = "#3B82F6";
const PU   = "#A855F7";
const BG   = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_EXPOSED:  RD,
  DUAL_EXPOSED:   AM,
  SINGLE_TRACKED: CY,
  CLEAR:          "#6E8AA0",
};

const TABS = ["ALL", "FULLY_EXPOSED", "DUAL_EXPOSED", "SINGLE_TRACKED", "CLEAR"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function contactText(c) {
  return [c.name, c.role, c.org, c.organisation, c.email, c.tags, c.department, c.title, c.description].filter(Boolean).join(" ");
}
function opsText(e) {
  return [e.name, e.title, e.description, e.type, e.tags, e.category, e.location, e.actor].filter(Boolean).join(" ");
}
function datasetText(d) {
  return [d.name, d.title, d.description, d.type, d.tags, d.category, d.source, d.schema].filter(Boolean).join(" ");
}
function riskText(r) {
  return [r.name, r.title, r.description, r.type, r.tags, r.category, r.severity, r.signal].filter(Boolean).join(" ");
}

function classify(contact, opsEvents, datasets, riskSignals) {
  const kws         = keywords(contactText(contact));
  const matchedOps  = opsEvents
    .map(e => ({ ...e, _score: scoreText(opsText(e), kws) }))
    .filter(e => e._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedDat  = datasets
    .map(d => ({ ...d, _score: scoreText(datasetText(d), kws) }))
    .filter(d => d._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedRsk  = riskSignals
    .map(r => ({ ...r, _score: scoreText(riskText(r), kws) }))
    .filter(r => r._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);

  const hasOps = matchedOps.length > 0;
  const hasDat = matchedDat.length > 0;
  const hasRsk = matchedRsk.length > 0;
  const matchCount = [hasOps, hasDat, hasRsk].filter(Boolean).length;

  let cls;
  if (matchCount === 3)      cls = "FULLY_EXPOSED";
  else if (matchCount === 2) cls = "DUAL_EXPOSED";
  else if (matchCount === 1) cls = "SINGLE_TRACKED";
  else                       cls = "CLEAR";

  return { ...contact, _cls: cls, _ops: matchedOps, _datasets: matchedDat, _risks: matchedRsk };
}

function smallBtn(col) {
  return {
    fontFamily: FONT, fontSize: 10, background: "transparent",
    border: `1px solid ${col}55`, color: col, padding: "2px 7px",
    borderRadius: 3, cursor: "pointer",
  };
}

function RelevanceBar({ score, max, col }) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  return (
    <div style={{ height: 3, background: "#1A2A3A", borderRadius: 2, marginTop: 3, width: "100%" }}>
      <div style={{ height: 3, width: pct + "%", background: col, borderRadius: 2, transition: "width 0.4s" }} />
    </div>
  );
}

export default function ContactOpsDataRiskNexus() {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [contacts, setContacts]       = useState([]);
  const [opsEvents, setOpsEvents]     = useState([]);
  const [datasets, setDatasets]       = useState([]);
  const [riskSignals, setRiskSignals] = useState([]);
  const [classified, setClassified]   = useState([]);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief]     = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [conRes, opsRes, datRes, rskRes] = await Promise.allSettled([
        fetch(`${base}/entities/Contact`).then(r => r.json()),
        fetch(`${base}/v1/ops/events`).then(r => r.json()),
        fetch(`${base}/v1/datasets`).then(r => r.json()),
        fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
      ]);
      const con = conRes.status === "fulfilled" ? (conRes.value?.items || conRes.value || []) : [];
      const ops = opsRes.status === "fulfilled" ? (opsRes.value?.items || opsRes.value || []) : [];
      const dat = datRes.status === "fulfilled" ? (datRes.value?.items || datRes.value || []) : [];
      const rsk = rskRes.status === "fulfilled" ? (rskRes.value?.items || rskRes.value || []) : [];
      setContacts(con);
      setOpsEvents(ops);
      setDatasets(dat);
      setRiskSignals(rsk);
      setClassified(con.map(c => classify(c, ops, dat, rsk)));
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
    window.addEventListener("jarvis:coedrn-toggle", onToggle);
    return () => window.removeEventListener("jarvis:coedrn-toggle", onToggle);
  }, []);

  const fullyExposed   = classified.filter(c => c._cls === "FULLY_EXPOSED").length;
  const dualExposed    = classified.filter(c => c._cls === "DUAL_EXPOSED").length;
  const singleTracked  = classified.filter(c => c._cls === "SINGLE_TRACKED").length;
  const clear          = classified.filter(c => c._cls === "CLEAR").length;
  const total          = classified.length;
  const exposurePct    = total ? Math.round((fullyExposed / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || contactText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `COEDRN: ${total} contacts — FULLY_EXPOSED: ${fullyExposed}, DUAL_EXPOSED: ${dualExposed}, SINGLE_TRACKED: ${singleTracked}, CLEAR: ${clear} (${exposurePct}% tri-source exposure). Ops events: ${opsEvents.length}. Datasets: ${datasets.length}. Risk signals: ${riskSignals.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `COEDRN operational exposure assessment. Context: ${ctx}. Provide a 2-sentence brief identifying which fully-exposed contacts present the highest operational risk and what immediate protective actions should be taken. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "Exposure assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
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
        title="Contact × Ops Event × Dataset × RiskSignal Operational Exposure Nexus (COEDRN)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${RD}55`,
          color: RD, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
          animation: fullyExposed > 0 ? "coedrnPulse 2s ease-in-out infinite" : "none",
        }}
      >
        {fullyExposed > 0 && (
          <span style={{ background: RD, color: "#fff", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {fullyExposed}
          </span>
        )}
        ◈ COEDRN
        <style>{`@keyframes coedrnPulse{0%,100%{box-shadow:0 0 4px ${RD}44}50%{box-shadow:0 0 12px ${RD}99}}`}</style>
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
        <span style={{ color: RD, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ COEDRN</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          Contact × Ops Event × Dataset × RiskSignal Operational Exposure Nexus
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
          ["CONTACTS",        total,           CY],
          ["OPS EVENTS",      opsEvents.length, BL],
          ["DATASETS",        datasets.length,  PU],
          ["RISK SIGNALS",    riskSignals.length, RD],
          ["FULLY EXPOSED",   fullyExposed,    RD],
          ["DUAL EXPOSED",    dualExposed,     AM],
          ["SINGLE TRACKED",  singleTracked,   CY],
          ["CLEAR",           clear,           GR],
          ["EXPOSURE%",       exposurePct + "%", exposurePct >= 60 ? RD : exposurePct >= 30 ? AM : GR],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,207,255,0.04)", border: `1px solid ${col}33`,
            borderRadius: 5, padding: "5px 10px", minWidth: 80, textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#4A6A80", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Exposure bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: "#4A6A80", letterSpacing: 1, marginBottom: 3 }}>
          TRI-SOURCE EXPOSURE — {exposurePct}%
        </div>
        <div style={{ height: 6, background: "#0D1825", borderRadius: 3 }}>
          <div style={{
            height: 6, borderRadius: 3, transition: "width 0.6s",
            width: exposurePct + "%",
            background: exposurePct >= 60 ? RD : exposurePct >= 30 ? AM : GR,
          }} />
        </div>
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={assess} disabled={assessing || loading} style={{
          ...smallBtn(RD), fontSize: 11, padding: "4px 12px",
          opacity: assessing ? 0.5 : 1,
        }}>
          {assessing ? "◌ assessing…" : "▶ ASSESS EXPOSURE"}
        </button>
        {brief && (
          <div style={{ color: "#DCEBF5", fontSize: 11, lineHeight: 1.5, flex: 1, minWidth: 200 }}>
            {brief}
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            ...smallBtn(tab === t ? RD : "#4A6A80"),
            background: tab === t ? RD + "22" : "transparent",
          }}>
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{
            background: "rgba(0,207,255,0.05)", border: `1px solid ${CY}33`,
            color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px",
            borderRadius: 3, outline: "none", width: 170,
          }}
        />
        <span style={{ color: "#4A6A80", fontSize: 9, marginLeft: "auto" }}>
          {visible.length}/{total} contacts
        </span>
      </div>

      {/* Contact list */}
      {loading && !classified.length ? (
        <div style={{ color: "#4A6A80", fontSize: 11, padding: 20 }}>◌ loading contacts…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((c, i) => {
            const col   = CLASS_COLOR[c._cls] || "#6E8AA0";
            const isExp = expanded === i;
            const maxO  = c._ops[0]?._score || 1;
            const maxD  = c._datasets[0]?._score || 1;
            const maxR  = c._risks[0]?._score || 1;
            return (
              <div key={i} style={{
                border: `1px solid ${col}33`, borderRadius: 5,
                background: "rgba(0,207,255,0.02)", overflow: "hidden",
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
                >
                  <span style={{
                    fontSize: 9, letterSpacing: 1, color: col,
                    border: `1px solid ${col}55`, borderRadius: 3, padding: "1px 5px",
                    whiteSpace: "nowrap",
                  }}>
                    {c._cls}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name || `Contact ${i + 1}`}
                  </span>
                  {c.role && (
                    <span style={{ fontSize: 9, color: "#4A6A80" }}>{c.role}</span>
                  )}
                  <span style={{ color: "#4A6A80", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "0 10px 10px" }}>
                    {(c.org || c.organisation) && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, marginBottom: 6 }}>
                        {c.org || c.organisation}
                      </div>
                    )}

                    {/* Matched ops events */}
                    {c._ops.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: BL, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED OPS EVENTS ({c._ops.length})
                        </div>
                        {c._ops.map((e, ei) => (
                          <div key={ei} style={{
                            background: BL + "11", border: `1px solid ${BL}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: BL, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {e.name || e.title || `Ops Event ${ei + 1}`}
                              </span>
                              {e.type && (
                                <span style={{ fontSize: 8, color: BL, border: `1px solid ${BL}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {e.type}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={e._score} max={maxO} col={BL} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Matched datasets */}
                    {c._datasets.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED DATASETS ({c._datasets.length})
                        </div>
                        {c._datasets.map((d, di) => (
                          <div key={di} style={{
                            background: PU + "11", border: `1px solid ${PU}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: PU, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {d.name || d.title || `Dataset ${di + 1}`}
                              </span>
                              {d.type && (
                                <span style={{ fontSize: 8, color: PU, border: `1px solid ${PU}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {d.type}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={d._score} max={maxD} col={PU} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Matched risk signals */}
                    {c._risks.length > 0 && (
                      <div>
                        <div style={{ color: RD, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED RISK SIGNALS ({c._risks.length})
                        </div>
                        {c._risks.map((r, ri) => (
                          <div key={ri} style={{
                            background: RD + "11", border: `1px solid ${RD}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: RD, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {r.name || r.title || `Risk Signal ${ri + 1}`}
                              </span>
                              {r.severity && (
                                <span style={{ fontSize: 8, color: RD, border: `1px solid ${RD}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {r.severity}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={r._score} max={maxR} col={RD} />
                          </div>
                        ))}
                      </div>
                    )}

                    {c._cls === "CLEAR" && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, fontStyle: "italic", marginTop: 4 }}>
                        No matching ops events, datasets, or risk signals found. Contact has no operational exposure in current intelligence.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && !loading && (
            <div style={{ color: "#4A6A80", fontSize: 11, padding: "20px 0", textAlign: "center" }}>
              No contacts match current filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
