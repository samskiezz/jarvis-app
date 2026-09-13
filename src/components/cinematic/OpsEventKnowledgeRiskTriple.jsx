/**
 * F100 — Ops Event × Knowledge × Risk Signal Triple (OEKR)
 *
 * Answers: "For each live ops event, which KB articles and risk signals
 *           correlate to it — and which events have no coverage at all?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /v1/ops/events        → live ops events
 *   GET /knowledge/           → KB articles
 *   GET /entities/RiskSignal  → active risk signals
 *
 * Each ops event is keyword-matched against both KB articles AND risk signals:
 *   FULL_COVERAGE  — linked to ≥1 KB article AND ≥1 risk signal
 *   KB_ONLY        — linked to ≥1 KB article but no risk signal
 *   RISK_ONLY      — linked to ≥1 risk signal but no KB article
 *   DARK           — no link to either source
 *
 * Stat tiles:  ops events / KB articles / risk signals / dark count
 * Amber badge: DARK count on button.
 * Expand row:  matched KB articles + matched risk signals with scores.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ OEKR  at left:3300 bottom:18, zIndex:68.
 * Event:   jarvis:oekr-toggle
 * Voice:   "ops knowledge risk / oekr / ops event coverage / ops triple /
 *           knowledge risk ops / ops coverage triple / which ops events have no coverage"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 3300;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const SEV_COLOR = {
  critical: RED,
  error:    RED,
  warning:  AMBER,
  warn:     AMBER,
  info:     CY,
  ok:       GREEN,
};

const CLASS_COLOR = {
  FULL_COVERAGE: GREEN,
  KB_ONLY:       CY,
  RISK_ONLY:     AMBER,
  DARK:          RED,
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  return [];
}

function tokens(str) {
  return String(str || "").toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function opsText(ev) {
  return [
    ev.type, ev.event_type, ev.resource, ev.service,
    ev.description, ev.message, ev.summary,
    Array.isArray(ev.tags) ? ev.tags.join(" ") : ev.tags,
  ].join(" ");
}

function kbText(art) {
  return [
    art.title, art.content, art.summary, art.topic, art.category,
    Array.isArray(art.tags) ? art.tags.join(" ") : art.tags,
  ].join(" ");
}

function riskText(rs) {
  return [
    rs.name, rs.title, rs.description, rs.summary,
    rs.severity, rs.category, rs.source,
    Array.isArray(rs.tags) ? rs.tags.join(" ") : rs.tags,
  ].join(" ");
}

function score(srcText, targetText) {
  const src = new Set(tokens(srcText));
  return tokens(targetText).filter(t => src.has(t)).length;
}

function sevColor(ev) {
  const s = String(ev.severity || ev.level || ev.status || "info").toLowerCase();
  return SEV_COLOR[s] || MUTED;
}

function classify(kbMatches, riskMatches) {
  const hasKb   = kbMatches.length   > 0;
  const hasRisk = riskMatches.length > 0;
  if (hasKb && hasRisk) return "FULL_COVERAGE";
  if (hasKb)            return "KB_ONLY";
  if (hasRisk)          return "RISK_ONLY";
  return "DARK";
}

// ─── fetch ───────────────────────────────────────────────────────────────────

async function fetchAll() {
  const base    = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [oer, kbr, rsr] = await Promise.all([
    fetch(`${base}/v1/ops/events`,        { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/knowledge/`,           { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/RiskSignal`,  { headers }).then(r => r.json()).catch(() => []),
  ]);
  const opsEvents   = normArr(oer);
  const kbArticles  = normArr(kbr);
  const riskSignals = normArr(rsr);

  const correlated = opsEvents.map(ev => {
    const evText = opsText(ev);
    const kbMatches = kbArticles
      .map(art => ({ art, sc: score(evText, kbText(art)) }))
      .filter(x => x.sc > 0)
      .sort((a, b) => b.sc - a.sc);
    const riskMatches = riskSignals
      .map(rs => ({ rs, sc: score(evText, riskText(rs)) }))
      .filter(x => x.sc > 0)
      .sort((a, b) => b.sc - a.sc);
    return {
      ev,
      classification: classify(kbMatches, riskMatches),
      kbMatches,
      riskMatches,
    };
  });

  return {
    correlated,
    opsCount:  opsEvents.length,
    kbCount:   kbArticles.length,
    riskCount: riskSignals.length,
  };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isOekrQuery(q) {
  const t = q.toLowerCase();
  return (
    t.includes("oekr") ||
    t.includes("ops knowledge risk") ||
    t.includes("ops event coverage") ||
    t.includes("ops triple") ||
    t.includes("knowledge risk ops") ||
    t.includes("ops coverage triple") ||
    t.includes("which ops events have no coverage") ||
    t.includes("dark ops events") ||
    t.includes("ops event triple")
  );
}

export async function buildOekrScript() {
  try {
    const base    = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}` };
    const [oer, kbr, rsr] = await Promise.all([
      fetch(`${base}/v1/ops/events`,       { headers }).then(r => r.json()).catch(() => []),
      fetch(`${base}/knowledge/`,          { headers }).then(r => r.json()).catch(() => []),
      fetch(`${base}/entities/RiskSignal`, { headers }).then(r => r.json()).catch(() => []),
    ]);
    const opsEvents   = normArr(oer);
    const kbArticles  = normArr(kbr);
    const riskSignals = normArr(rsr);
    let full = 0, kbOnly = 0, riskOnly = 0, dark = 0;
    for (const ev of opsEvents) {
      const evText  = opsText(ev);
      const hasKb   = kbArticles.some(art  => score(evText, kbText(art))   > 0);
      const hasRisk = riskSignals.some(rs  => score(evText, riskText(rs))  > 0);
      if (hasKb && hasRisk)      full++;
      else if (hasKb)            kbOnly++;
      else if (hasRisk)          riskOnly++;
      else                       dark++;
    }
    return (
      `Ops Event × Knowledge × Risk Triple: ${opsEvents.length} ops events correlated against ` +
      `${kbArticles.length} KB articles and ${riskSignals.length} risk signals. ` +
      `${full} FULL_COVERAGE, ${kbOnly} KB_ONLY, ${riskOnly} RISK_ONLY, ${dark} DARK (no coverage).`
    );
  } catch (e) {
    return `OEKR check failed: ${e.message}`;
  }
}

// ─── assess ──────────────────────────────────────────────────────────────────

async function runAssess(correlated, setText, speak) {
  const full     = correlated.filter(c => c.classification === "FULL_COVERAGE").length;
  const dark     = correlated.filter(c => c.classification === "DARK").length;
  const kbOnly   = correlated.filter(c => c.classification === "KB_ONLY").length;
  const riskOnly = correlated.filter(c => c.classification === "RISK_ONLY").length;
  const topDark  = correlated
    .filter(c => c.classification === "DARK")
    .slice(0, 2)
    .map(c => {
      const ev = c.ev || {};
      return ev.type || ev.event_type || ev.resource || ev.id || "event";
    })
    .join(", ");
  const prompt =
    `You are JARVIS. In 2 sentences, brief the operator on Ops Event × Knowledge × Risk Signal triple coverage: ` +
    `${full} ops events have FULL_COVERAGE (both KB article and risk signal links), ` +
    `${kbOnly} KB_ONLY, ${riskOnly} RISK_ONLY, and ${dark} DARK ops events with no coverage` +
    (topDark ? ` (darkest: ${topDark})` : "") +
    `. Conclude with the most urgent recommendation for reducing DARK ops events.`;
  const base    = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  try {
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers, body: JSON.stringify({ message: prompt }),
    });
    const j    = await r.json();
    const text = j.response || j.reply || j.message || JSON.stringify(j);
    setText(text);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    speak(text);
  } catch (e) {
    setText(`ASSESS error: ${e.message}`);
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function OpsEventKnowledgeRiskTriple() {
  const [open, setOpen]             = useState(false);
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState(null);
  const [filter, setFilter]         = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const result = await fetchAll();
      setData(result);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:oekr-toggle", handler);
    return () => window.removeEventListener("jarvis:oekr-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const speak = useCallback((text) => {
    const base = apiBase();
    fetch(`${base}/v1/voice/tts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: localStorage.getItem("jarvis_voice") || "ash" }),
    }).then(r => r.blob()).then(b => {
      const url = URL.createObjectURL(b);
      new Audio(url).play().catch(() => {});
    }).catch(() => {});
  }, []);

  if (!open) {
    const darkCount = data?.correlated?.filter(c => c.classification === "DARK").length ?? 0;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ops Event × Knowledge × Risk Triple (OEKR)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: "rgba(4,7,14,0.82)", border: `1px solid ${AMBER}44`,
          color: AMBER, fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "3px 8px", borderRadius: 3, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ OEKR
        {darkCount > 0 && (
          <span style={{
            background: AMBER, color: "#000", borderRadius: 8,
            padding: "0 5px", fontSize: 9, fontWeight: 700,
          }}>{darkCount}</span>
        )}
      </button>
    );
  }

  const { correlated = [], opsCount = 0, kbCount = 0, riskCount = 0 } = data || {};
  const full     = correlated.filter(c => c.classification === "FULL_COVERAGE").length;
  const kbOnly   = correlated.filter(c => c.classification === "KB_ONLY").length;
  const riskOnly = correlated.filter(c => c.classification === "RISK_ONLY").length;
  const dark     = correlated.filter(c => c.classification === "DARK").length;

  const visible = correlated.filter(c => {
    if (filter !== "ALL" && c.classification !== filter) return false;
    if (search) {
      const q  = search.toLowerCase();
      const ev = c.ev || {};
      const t  = [
        ev.type, ev.event_type, ev.resource, ev.service,
        ev.description, ev.message,
      ].join(" ").toLowerCase();
      if (!t.includes(q)) return false;
    }
    return true;
  });

  const TAB_STYLE = (active, col = AMBER) => ({
    background: active ? col : "transparent",
    color: active ? "#000" : MUTED,
    border: `1px solid ${active ? col : MUTED}44`,
    borderRadius: 3, padding: "2px 8px", fontSize: 9,
    fontFamily: MONO, cursor: "pointer", letterSpacing: 1,
  });

  return (
    <div style={{
      position: "fixed", right: 18, top: 60, width: 560, maxHeight: "80vh",
      background: BG, border: `1px solid ${AMBER}55`, borderRadius: 6,
      fontFamily: MONO, fontSize: 11, color: CY, zIndex: 160,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: `1px solid ${AMBER}33`, flexShrink: 0,
      }}>
        <span style={{ color: AMBER, fontWeight: 700, letterSpacing: 2 }}>
          ◈ OPS EVENT × KNOWLEDGE × RISK (OEKR)
        </span>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: MUTED,
          cursor: "pointer", fontSize: 14, lineHeight: 1,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4,1fr)",
        gap: 6, padding: "8px 12px", flexShrink: 0,
      }}>
        {[
          ["OPS EVTS", opsCount,   CY],
          ["KB ARTS",  kbCount,    CY],
          ["SIGNALS",  riskCount,  CY],
          ["DARK",     dark,       RED],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(255,255,255,0.03)", border: `1px solid ${col}33`,
            borderRadius: 4, padding: "5px 8px", textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 13, fontWeight: 700 }}>{loading ? "…" : val}</div>
            <div style={{ color: MUTED, fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* classification summary bar */}
      <div style={{
        display: "flex", gap: 6, padding: "0 12px 6px", flexShrink: 0, flexWrap: "wrap",
      }}>
        {[
          ["FULL", full, GREEN],
          ["KB_ONLY", kbOnly, CY],
          ["RISK_ONLY", riskOnly, AMBER],
          ["DARK", dark, RED],
        ].map(([label, val, col]) => (
          <span key={label} style={{
            background: col + "22", border: `1px solid ${col}44`,
            color: col, borderRadius: 3, padding: "1px 7px",
            fontSize: 9, fontFamily: MONO, letterSpacing: 1,
          }}>
            {label}: {loading ? "…" : val}
          </span>
        ))}
      </div>

      {/* filter tabs + search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "0 12px 6px", flexShrink: 0, flexWrap: "wrap",
      }}>
        {["ALL", "FULL_COVERAGE", "KB_ONLY", "RISK_ONLY", "DARK"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={TAB_STYLE(filter === f)}>
            {f === "FULL_COVERAGE" ? "FULL" : f}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search ops events…"
          style={{
            background: "rgba(255,255,255,0.04)", border: `1px solid ${MUTED}44`,
            color: CY, fontFamily: MONO, fontSize: 10, borderRadius: 3,
            padding: "2px 8px", outline: "none", flex: 1, minWidth: 100,
          }}
        />
        <button
          onClick={async () => {
            if (assessing) return;
            setAssessing(true); setAssessText("");
            await runAssess(correlated, setAssessText, speak);
            setAssessing(false);
          }}
          style={TAB_STYLE(false, CY)}
        >
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {assessText && (
        <div style={{
          margin: "0 12px 6px", padding: "6px 10px",
          background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}33`,
          borderRadius: 4, color: CY, fontSize: 10, lineHeight: 1.5, flexShrink: 0,
        }}>
          {assessText}
        </div>
      )}

      {err && (
        <div style={{ margin: "0 12px 6px", color: RED, fontSize: 10, flexShrink: 0 }}>
          {err}
        </div>
      )}

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: MUTED, textAlign: "center", padding: 18, fontSize: 10 }}>
            No ops events match filter.
          </div>
        )}
        {visible.map((c, i) => {
          const ev    = c.ev || {};
          const isEx  = expanded === i;
          const cls   = c.classification;
          const col   = CLASS_COLOR[cls] || MUTED;
          const sev   = String(ev.severity || ev.level || ev.status || "info").toUpperCase();
          const sc    = sevColor(ev);
          return (
            <div key={i} style={{
              borderBottom: `1px solid ${CY}0D`, cursor: "pointer",
            }} onClick={() => setExpanded(isEx ? null : i)}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "7px 12px",
              }}>
                <span style={{
                  background: col + "33", color: col,
                  borderRadius: 3, padding: "1px 6px",
                  fontSize: 8, fontWeight: 700, flexShrink: 0,
                }}>
                  {cls === "FULL_COVERAGE" ? "FULL" : cls}
                </span>
                <span style={{
                  background: sc + "33", color: sc,
                  borderRadius: 3, padding: "1px 5px",
                  fontSize: 8, flexShrink: 0,
                }}>
                  {sev}
                </span>
                <span style={{ color: CY, flex: 1, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ev.type || ev.event_type || ev.resource || ev.description || ev.id || "Ops Event"}
                </span>
                <span style={{ color: MUTED, fontSize: 9 }}>
                  {c.kbMatches.length}KB · {c.riskMatches.length}RSK
                </span>
                <span style={{ color: MUTED, fontSize: 9 }}>{isEx ? "▲" : "▼"}</span>
              </div>

              {isEx && (
                <div style={{ padding: "0 12px 10px", background: "rgba(255,255,255,0.02)" }}>
                  {/* KB matches */}
                  {c.kbMatches.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>
                        KB ARTICLES ({c.kbMatches.length})
                      </div>
                      {c.kbMatches.slice(0, 3).map((m, mi) => {
                        const art  = m.art || {};
                        const maxSc = c.kbMatches[0]?.sc || 1;
                        const pct  = Math.round((m.sc / maxSc) * 100);
                        return (
                          <div key={mi} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <span style={{
                                background: CY + "22", color: CY,
                                borderRadius: 3, padding: "1px 5px", fontSize: 8, flexShrink: 0,
                              }}>
                                {String(art.topic || art.category || "KB").toUpperCase().slice(0, 12)}
                              </span>
                              <span style={{ color: CY, fontSize: 10, flex: 1 }}>
                                {art.title || art.id || "Article"}
                              </span>
                              <span style={{ color: MUTED, fontSize: 8 }}>{m.sc}pt</span>
                            </div>
                            <div style={{ height: 2, background: `${CY}22`, borderRadius: 1, margin: "2px 0 0" }}>
                              <div style={{ height: 2, width: `${pct}%`, background: CY, borderRadius: 1 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Risk matches */}
                  {c.riskMatches.length > 0 && (
                    <div>
                      <div style={{ color: AMBER, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>
                        RISK SIGNALS ({c.riskMatches.length})
                      </div>
                      {c.riskMatches.slice(0, 3).map((m, mi) => {
                        const rs   = m.rs || {};
                        const maxSc = c.riskMatches[0]?.sc || 1;
                        const pct  = Math.round((m.sc / maxSc) * 100);
                        const sv   = String(rs.severity || "info").toLowerCase();
                        const sc2  = SEV_COLOR[sv] || MUTED;
                        return (
                          <div key={mi} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <span style={{
                                background: sc2 + "33", color: sc2,
                                borderRadius: 3, padding: "1px 5px", fontSize: 8, flexShrink: 0,
                              }}>
                                {String(rs.severity || "?").toUpperCase()}
                              </span>
                              <span style={{ color: AMBER, fontSize: 10, flex: 1 }}>
                                {rs.name || rs.title || rs.id || "Risk Signal"}
                              </span>
                              <span style={{ color: MUTED, fontSize: 8 }}>{m.sc}pt</span>
                            </div>
                            <div style={{ height: 2, background: `${AMBER}22`, borderRadius: 1, margin: "2px 0 0" }}>
                              <div style={{ height: 2, width: `${pct}%`, background: AMBER, borderRadius: 1 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {c.kbMatches.length === 0 && c.riskMatches.length === 0 && (
                    <div style={{ color: RED, fontSize: 9 }}>
                      No KB articles or risk signals link to this ops event.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        borderTop: `1px solid ${AMBER}22`, padding: "5px 12px",
        color: MUTED, fontSize: 9, letterSpacing: 1, flexShrink: 0,
        display: "flex", justifyContent: "space-between",
      }}>
        <span>OPS × KB × RISK — {visible.length}/{correlated.length} events</span>
        <span>auto-refresh 60s</span>
      </div>
    </div>
  );
}
