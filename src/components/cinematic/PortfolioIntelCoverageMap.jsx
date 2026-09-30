/**
 * F201 — Investment × Knowledge × Report Portfolio Intelligence Coverage Map (PIKMAP)
 *
 * Parallel-fetches /entities/Investment + /knowledge/ + /v1/reports
 * and keyword-correlates each investment against KB articles AND intelligence reports to classify:
 *
 *   FULLY_COVERED   — matched KB article + intelligence report (maximum coverage)
 *   KNOWLEDGE_ONLY  — KB article match, no report
 *   REPORT_ONLY     — intelligence report match, no KB article
 *   DARK            — no matches (portfolio intelligence blind spot)
 *
 * Stat tiles: INVESTMENTS / KB ARTICLES / REPORTS + four class counts + COVERED%.
 * Amber badge on DARK count.
 * Filter tabs ALL / FULLY_COVERED / KNOWLEDGE_ONLY / REPORT_ONLY / DARK + text search.
 * Expand investment → matched KB article cards (green) + report cards (purple) with relevance bars.
 * ▶ ASSESS PORTFOLIO INTEL → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:pikmap-toggle event.
 *
 * Voice triggers:
 *   "pikmap / portfolio intel / investment knowledge / investment report /
 *    dark investment / portfolio coverage / investment intelligence / portfolio intelligence map"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_054_920;
const Z_INDEX  = 262;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const PIKMAP_RE = /\b(pikmap|portfolio[\s-]intel(?:ligence)?|investment[\s-]knowledge|investment[\s-]report|dark[\s-]investment|portfolio[\s-]coverage|investment[\s-]intelligence|portfolio[\s-]intelligence[\s-]map)\b/i;

export function isPikmapQuery(q = "") { return PIKMAP_RE.test(q); }

export async function buildPikmapScript() {
  const base = apiBase();
  const [invRes, kbRes, repRes] = await Promise.allSettled([
    fetch(`${base}/entities/Investment`).then(r => r.json()),
    fetch(`${base}/knowledge/`).then(r => r.json()),
    fetch(`${base}/v1/reports`).then(r => r.json()),
  ]);
  const investments = (invRes.status === "fulfilled" ? (invRes.value?.items || invRes.value?.investments || invRes.value || []) : []);
  const articles    = (kbRes.status  === "fulfilled" ? (kbRes.value?.items  || kbRes.value?.articles    || kbRes.value  || []) : []);
  const reports     = (repRes.status === "fulfilled" ? (repRes.value?.items || repRes.value?.reports     || repRes.value || []) : []);

  let fullyCovered = 0, dark = 0;
  for (const inv of investments) {
    const kws = keywords(invText(inv));
    const hasKb  = articles.some(a => scoreText(kbText(a),  kws) > 0);
    const hasRep = reports.some(r  => scoreText(repText(r), kws) > 0);
    if (hasKb && hasRep)     fullyCovered++;
    else if (!hasKb && !hasRep) dark++;
  }
  const total      = investments.length;
  const coveredPct = total ? Math.round((fullyCovered / total) * 100) : 0;
  return `PIKMAP Portfolio Intelligence Coverage Map online, sir. I have cross-referenced ${total} portfolio investments against ${articles.length} knowledge base articles and ${reports.length} intelligence reports. ${fullyCovered} investment${fullyCovered === 1 ? " is" : "s are"} fully covered with both KB and report intelligence — ${coveredPct}% portfolio coverage. ${dark} investment${dark === 1 ? " has" : "s have"} no knowledge or report coverage whatsoever, representing critical portfolio intelligence blind spots requiring immediate analysis, sir.`;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function scoreText(text = "", kws = []) {
  if (!kws.length) return 0;
  const t = text.toLowerCase();
  return kws.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
}

function invText(inv) {
  return [inv.name, inv.title, inv.type, inv.sector, inv.description, inv.tags?.join?.(" ")].filter(Boolean).join(" ");
}
function kbText(a) {
  return [a.title, a.content, a.summary, a.tags?.join?.(" "), a.category].filter(Boolean).join(" ");
}
function repText(r) {
  return [r.title, r.description, r.summary, r.type, r.tags?.join?.(" ")].filter(Boolean).join(" ");
}

function classify(inv, articles, reports) {
  const kws = keywords(invText(inv));
  const matchedKb  = articles.filter(a => scoreText(kbText(a),  kws) > 0).map(a => ({ ...a, _score: scoreText(kbText(a), kws) }));
  const matchedRep = reports.filter(r  => scoreText(repText(r), kws) > 0).map(r => ({ ...r, _score: scoreText(repText(r), kws) }));
  const hasKb  = matchedKb.length  > 0;
  const hasRep = matchedRep.length > 0;
  let cls;
  if (hasKb && hasRep)      cls = "FULLY_COVERED";
  else if (hasKb)           cls = "KNOWLEDGE_ONLY";
  else if (hasRep)          cls = "REPORT_ONLY";
  else                      cls = "DARK";
  return { ...inv, _class: cls, _kb: matchedKb, _reports: matchedRep };
}

// ─── colours ──────────────────────────────────────────────────────────────────

const CY     = "#00CFFF";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const GR     = "#22C55E";
const PU     = "#A78BFA";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_COVERED:  GR,
  KNOWLEDGE_ONLY: CY,
  REPORT_ONLY:    PU,
  DARK:           RD,
};

const TABS = ["ALL", "FULLY_COVERED", "KNOWLEDGE_ONLY", "REPORT_ONLY", "DARK"];

// ─── component ────────────────────────────────────────────────────────────────

export default function PortfolioIntelCoverageMap() {
  const [open, setOpen]       = useState(false);
  const [investments, setInv] = useState([]);
  const [articles, setKb]     = useState([]);
  const [reports, setRep]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [assessing, setAss]   = useState(false);
  const [brief, setBrief]     = useState("");
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExp]    = useState({});
  const timerRef              = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const [invR, kbR, repR] = await Promise.allSettled([
      fetch(`${base}/entities/Investment`).then(r => r.json()),
      fetch(`${base}/knowledge/`).then(r => r.json()),
      fetch(`${base}/v1/reports`).then(r => r.json()),
    ]);
    setInv(invR.status === "fulfilled" ? (invR.value?.items || invR.value?.investments || invR.value || []) : []);
    setKb(kbR.status   === "fulfilled" ? (kbR.value?.items  || kbR.value?.articles    || kbR.value  || []) : []);
    setRep(repR.status === "fulfilled" ? (repR.value?.items || repR.value?.reports     || repR.value || []) : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener("jarvis:pikmap-toggle", handler);
    return () => window.removeEventListener("jarvis:pikmap-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const classified = investments.map(inv => classify(inv, articles, reports));

  const counts = {
    FULLY_COVERED:  classified.filter(i => i._class === "FULLY_COVERED").length,
    KNOWLEDGE_ONLY: classified.filter(i => i._class === "KNOWLEDGE_ONLY").length,
    REPORT_ONLY:    classified.filter(i => i._class === "REPORT_ONLY").length,
    DARK:           classified.filter(i => i._class === "DARK").length,
  };
  const total      = classified.length;
  const coveredPct = total ? Math.round((counts.FULLY_COVERED / total) * 100) : 0;

  const filtered = classified.filter(i => {
    if (tab !== "ALL" && i._class !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return (i.name || i.title || "").toLowerCase().includes(s);
    }
    return true;
  });

  async function assess() {
    setAss(true);
    setBrief("");
    const base = apiBase();
    const context = `PIKMAP: ${total} investments, ${articles.length} KB articles, ${reports.length} reports. FULLY_COVERED=${counts.FULLY_COVERED} KNOWLEDGE_ONLY=${counts.KNOWLEDGE_ONLY} REPORT_ONLY=${counts.REPORT_ONLY} DARK=${counts.DARK}. Coverage=${coveredPct}%.`;
    try {
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `You are JARVIS. In exactly 2 sentences, summarise this portfolio intelligence coverage assessment and recommend the priority action: ${context}` }),
      });
      const d = await r.json();
      const msg = d?.response || d?.message || d?.content || "Assessment complete, sir.";
      setBrief(msg);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: msg }),
      }).then(async rr => {
        if (rr.ok) {
          const blob = await rr.blob();
          const url  = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.play();
        }
      }).catch(() => {});
    } catch { setBrief("Assessment unavailable."); }
    setAss(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Portfolio Intelligence Coverage Map (PIKMAP)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, cursor: "pointer",
          background: "transparent", border: `1px solid ${AM}55`,
          color: AM, padding: "3px 7px", borderRadius: 3,
        }}
      >
        ◈ PIKMAP {counts.DARK > 0 && <span style={{ color: RD, marginLeft: 4 }}>●{counts.DARK}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 0, right: 0,
      width: 560, maxHeight: "88vh",
      background: BG, border: `1px solid ${BORDER}`,
      borderRadius: "8px 0 0 0", zIndex: Z_INDEX,
      fontFamily: FONT, display: "flex", flexDirection: "column",
      boxShadow: "0 0 32px rgba(0,207,255,0.08)",
    }}>
      {/* header */}
      <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ color: CY, fontSize: 11, flex: 1, letterSpacing: 1 }}>◈ PORTFOLIO INTEL COVERAGE MAP (PIKMAP)</span>
        {loading && <span style={{ color: AM, fontSize: 9 }}>↻</span>}
        <button onClick={load} style={smallBtn(CY)}>↺</button>
        <button onClick={() => setOpen(false)} style={smallBtn(RD)}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", flexShrink: 0, flexWrap: "wrap" }}>
        {[
          { label: "INVESTMENTS", val: total,           col: CY },
          { label: "KB ARTICLES", val: articles.length, col: GR },
          { label: "REPORTS",     val: reports.length,  col: PU },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background: `${col}11`, border: `1px solid ${col}33`, borderRadius: 4, padding: "5px 10px", minWidth: 90 }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
        {Object.entries(counts).map(([cls, n]) => (
          <div key={cls} style={{ background: `${CLASS_COLOR[cls]}11`, border: `1px solid ${CLASS_COLOR[cls]}33`, borderRadius: 4, padding: "5px 10px", minWidth: 90 }}>
            <div style={{ color: CLASS_COLOR[cls], fontSize: 16, fontWeight: 700 }}>{n}</div>
            <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1 }}>{cls.replace("_", " ")}</div>
          </div>
        ))}
        <div style={{ background: `${GR}11`, border: `1px solid ${GR}33`, borderRadius: 4, padding: "5px 10px", minWidth: 90 }}>
          <div style={{ color: GR, fontSize: 16, fontWeight: 700 }}>{coveredPct}%</div>
          <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1 }}>COVERED</div>
        </div>
      </div>

      {/* coverage bar */}
      <div style={{ padding: "0 14px 8px", flexShrink: 0 }}>
        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${coveredPct}%`, background: `linear-gradient(90deg,${GR},${CY})`, borderRadius: 2, transition: "width 0.5s" }} />
        </div>
      </div>

      {/* assess */}
      <div style={{ padding: "0 14px 8px", flexShrink: 0 }}>
        <button onClick={assess} disabled={assessing} style={{ ...smallBtn(PU), padding: "4px 12px" }}>
          {assessing ? "▷ ASSESSING…" : "▶ ASSESS PORTFOLIO INTEL"}
        </button>
        {brief && <div style={{ color: "#DCEBF5", fontSize: 10, marginTop: 6, lineHeight: 1.5 }}>{brief}</div>}
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexShrink: 0, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            ...smallBtn(tab === t ? CY : "#4A5568"),
            background: tab === t ? `${CY}22` : "transparent",
          }}>
            {t.replace("_", " ")} {t !== "ALL" && <span style={{ color: CLASS_COLOR[t] || "#6E8AA0" }}>({counts[t] ?? filtered.filter(i => i._class === t).length})</span>}
          </button>
        ))}
      </div>

      {/* search */}
      <div style={{ padding: "0 14px 8px", flexShrink: 0 }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search investments…"
          style={{
            width: "100%", boxSizing: "border-box", background: "rgba(0,207,255,0.05)",
            border: `1px solid ${BORDER}`, borderRadius: 4, padding: "5px 10px",
            color: "#DCEBF5", fontSize: 10, fontFamily: FONT, outline: "none",
          }}
        />
      </div>

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 14px" }}>
        {filtered.length === 0 && (
          <div style={{ color: "#4A5568", fontSize: 10, padding: "20px 0", textAlign: "center" }}>
            {loading ? "Loading…" : "No investments found."}
          </div>
        )}
        {filtered.map((inv, idx) => {
          const col   = CLASS_COLOR[inv._class] || CY;
          const isExp = !!expanded[idx];
          return (
            <div key={idx} style={{
              marginBottom: 6, border: `1px solid ${col}33`, borderRadius: 4,
              background: `${col}07`, overflow: "hidden",
            }}>
              <div
                onClick={() => setExp(e => ({ ...e, [idx]: !e[idx] }))}
                style={{ padding: "7px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
              >
                <span style={{ color: col, fontSize: 9, border: `1px solid ${col}55`, borderRadius: 2, padding: "0 4px", flexShrink: 0 }}>
                  {inv._class.replace("_", " ")}
                </span>
                <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>
                  {inv.name || inv.title || `Investment ${idx + 1}`}
                </span>
                {inv.type && (
                  <span style={{ color: AM, fontSize: 9, border: `1px solid ${AM}44`, borderRadius: 2, padding: "0 4px" }}>
                    {inv.type}
                  </span>
                )}
                {inv._kb.length > 0 && (
                  <span style={{ color: GR, fontSize: 9 }}>⊞ {inv._kb.length} KB</span>
                )}
                {inv._reports.length > 0 && (
                  <span style={{ color: PU, fontSize: 9 }}>⊞ {inv._reports.length} RPT</span>
                )}
                <span style={{ color: col, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "0 10px 10px 10px", borderTop: `1px solid ${col}22` }}>
                  {(inv.sector || inv.description) && (
                    <div style={{ color: "#6E8AA0", fontSize: 10, marginTop: 6, marginBottom: 8 }}>
                      {[inv.sector, inv.description].filter(Boolean).join(" · ").slice(0, 120)}
                    </div>
                  )}

                  {inv._kb.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: GR, fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>▸ MATCHED KB ARTICLES</div>
                      {inv._kb.slice(0, 4).map((a, j) => {
                        const maxScore = Math.max(...inv._kb.map(x => x._score), 1);
                        const bar = Math.round((a._score / maxScore) * 100);
                        return (
                          <div key={j} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>
                                {a.title || a.name || "Article"}
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

                  {inv._reports.length > 0 && (
                    <div>
                      <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>▸ MATCHED REPORTS</div>
                      {inv._reports.slice(0, 4).map((r, j) => {
                        const maxScore = Math.max(...inv._reports.map(x => x._score), 1);
                        const bar = Math.round((r._score / maxScore) * 100);
                        return (
                          <div key={j} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>
                                {r.title || r.name || "Report"}
                              </span>
                              {r.type && (
                                <span style={{ color: PU, fontSize: 9, border: `1px solid ${PU}44`, borderRadius: 2, padding: "0 4px" }}>
                                  {r.type}
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

                  {inv._kb.length === 0 && inv._reports.length === 0 && (
                    <div style={{ color: RD, fontSize: 10, marginTop: 6 }}>
                      ◌ No KB or report coverage — portfolio intelligence blind spot
                    </div>
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

function smallBtn(color) {
  return {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10, cursor: "pointer",
    background: "transparent", border: `1px solid ${color}55`,
    color: color, padding: "2px 6px", borderRadius: 3,
  };
}
