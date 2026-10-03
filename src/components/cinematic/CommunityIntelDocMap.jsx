/**
 * F165 — Graph Community × Report × Investigation Intelligence Documentation Map (CGRIMAP)
 *
 * Parallel-fetches /v1/graph/communities + /v1/reports + /v1/investigations
 * Keyword-correlates each community cluster (name/description/members/tags) against
 * intelligence reports AND open investigations to classify:
 *   FULLY_DOCUMENTED  — matched both a report AND an investigation
 *   REPORT_ONLY       — matched a report, no investigation
 *   INVESTIGATED_ONLY — matched an investigation, no report
 *   UNDOCUMENTED      — no matches (intelligence blind spot)
 *
 * Stat tiles: COMMUNITIES / REPORTS / INVESTIGATIONS + all four class counts + DOC%.
 * Amber badge on undocumented count.
 * Filter tabs ALL / FULLY_DOCUMENTED / REPORT_ONLY / INVESTIGATED_ONLY / UNDOCUMENTED + text search.
 * Expand community → matched report cards (purple, type badge) +
 *                    matched investigation cards (cyan, priority badge) with relevance bars.
 * ▶ ASSESS DOCUMENTATION → /v1/jarvis/agent/chat 2-sentence intel-gap brief + TTS.
 * 90-s auto-refresh. jarvis:cgrimap-toggle event.
 *
 * Voice triggers: "cgrimap / community intel doc / graph community documentation /
 *                  undocumented community / community report / community investigation /
 *                  network documentation / community intel gap".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_034_760;
const Z_INDEX  = 226;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const CGRIMAP_RE = /\b(cgrimap|community[\s-]intel[\s-]doc|graph[\s-]community[\s-]doc(?:umentation)?|undocumented[\s-]communit(?:y|ies)|community[\s-]report|community[\s-]investigation|network[\s-]documentation|community[\s-]intel[\s-]gap)\b/i;

const PU     = "#8B5CF6";
const CY     = "#00CFFF";
const AM     = "#F59E0B";
const GR     = "#22C55E";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(139,92,246,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_DOCUMENTED:  GR,
  REPORT_ONLY:       PU,
  INVESTIGATED_ONLY: CY,
  UNDOCUMENTED:      AM,
};
const TABS = ["ALL", "FULLY_DOCUMENTED", "REPORT_ONLY", "INVESTIGATED_ONLY", "UNDOCUMENTED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function communityText(c) {
  const members = Array.isArray(c.members) ? c.members.join(" ") : (c.members || "");
  return `${c.name || c.label || c.id || ""} ${c.description || ""} ${members} ${(c.tags || []).join(" ")}`;
}
function reportText(r) {
  return `${r.title || r.name || ""} ${r.description || ""} ${r.type || ""} ${(r.tags || []).join(" ")} ${r.summary || ""}`;
}
function invText(i) {
  return `${i.title || i.name || ""} ${i.description || ""} ${i.status || ""} ${i.priority || ""}`;
}

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

async function loadAll() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [commRes, repRes, invRes] = await Promise.allSettled([
    fetch(`${apiBase}/v1/graph/communities`, { headers }),
    fetch(`${apiBase}/v1/reports`,           { headers }),
    fetch(`${apiBase}/v1/investigations`,    { headers }),
  ]);
  const communities = commRes.status === "fulfilled" && commRes.value.ok
    ? normaliseArray(await commRes.value.json(), ["communities", "clusters", "groups"])
    : [];
  const reports = repRes.status === "fulfilled" && repRes.value.ok
    ? normaliseArray(await repRes.value.json(), ["reports", "items"])
    : [];
  const investigations = invRes.status === "fulfilled" && invRes.value.ok
    ? normaliseArray(await invRes.value.json(), ["investigations", "cases"])
    : [];
  return { communities, reports, investigations };
}

function correlate(communities, reports, investigations) {
  return communities.map(c => {
    const kws = keywords(communityText(c));
    const matchedReports = reports
      .map(r => ({ report: r, rel: score(reportText(r), kws) }))
      .filter(x => x.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const matchedInvs = investigations
      .map(i => ({ inv: i, rel: score(invText(i), kws) }))
      .filter(x => x.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const hasReport = matchedReports.length > 0;
    const hasInv    = matchedInvs.length > 0;
    const cls = hasReport && hasInv ? "FULLY_DOCUMENTED"
              : hasReport           ? "REPORT_ONLY"
              : hasInv              ? "INVESTIGATED_ONLY"
              :                       "UNDOCUMENTED";
    return { ...c, _cls: cls, _reports: matchedReports, _invs: matchedInvs };
  });
}

export function isCgrimapQuery(q = "") { return CGRIMAP_RE.test(q); }

export async function buildCgrimapScript() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [commRes, repRes, invRes] = await Promise.allSettled([
    fetch(`${apiBase}/v1/graph/communities`, { headers }),
    fetch(`${apiBase}/v1/reports`,           { headers }),
    fetch(`${apiBase}/v1/investigations`,    { headers }),
  ]);
  const communities = commRes.status === "fulfilled" && commRes.value.ok
    ? normaliseArray(await commRes.value.json(), ["communities", "clusters", "groups"]) : [];
  const reports = repRes.status === "fulfilled" && repRes.value.ok
    ? normaliseArray(await repRes.value.json(), ["reports", "items"]) : [];
  const investigations = invRes.status === "fulfilled" && invRes.value.ok
    ? normaliseArray(await invRes.value.json(), ["investigations", "cases"]) : [];
  const rows = correlate(communities, reports, investigations);
  const fullyDoc   = rows.filter(r => r._cls === "FULLY_DOCUMENTED").length;
  const undoc      = rows.filter(r => r._cls === "UNDOCUMENTED").length;
  const docPct     = rows.length ? Math.round((rows.length - undoc) / rows.length * 100) : 0;
  return `CGRIMAP Community Intelligence Documentation Map online, sir. Across ${rows.length} graph community clusters cross-referenced against ${reports.length} intelligence reports and ${investigations.length} investigations, ${fullyDoc} communities are fully documented with both report and investigation coverage. ${undoc} communities remain undocumented — ${docPct}% intelligence documentation coverage. Opening the panel for full visibility now.`;
}

export default function CommunityIntelDocMap() {
  const [open,       setOpen]       = useState(false);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [rows,       setRows]       = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [expanded,   setExpanded]   = useState(null);
  const [totals,     setTotals]     = useState({ communities: 0, reports: 0, investigations: 0 });
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { communities, reports, investigations } = await loadAll();
      setTotals({ communities: communities.length, reports: reports.length, investigations: investigations.length });
      setRows(correlate(communities, reports, investigations));
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(v => { if (!v) load(); return !v; }); };
    window.addEventListener("jarvis:cgrimap-toggle", toggle);
    return () => window.removeEventListener("jarvis:cgrimap-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true); setAssessment("");
    try {
      const body = await buildCgrimapScript();
      const res = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
        },
        body: JSON.stringify({ message: `You are JARVIS. In exactly 2 sentences, assess this graph community intelligence documentation coverage:\n${body}` }),
      });
      const data = await res.json();
      const txt  = data?.response || data?.message || data?.content || "";
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessment("Unable to assess community documentation coverage at this time, sir.");
    } finally {
      setAssessing(false);
    }
  }

  const counts = {
    FULLY_DOCUMENTED:  rows.filter(r => r._cls === "FULLY_DOCUMENTED").length,
    REPORT_ONLY:       rows.filter(r => r._cls === "REPORT_ONLY").length,
    INVESTIGATED_ONLY: rows.filter(r => r._cls === "INVESTIGATED_ONLY").length,
    UNDOCUMENTED:      rows.filter(r => r._cls === "UNDOCUMENTED").length,
  };
  const docPct = rows.length
    ? Math.round((rows.length - counts.UNDOCUMENTED) / rows.length * 100) : 0;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r._cls !== tab) return false;
    if (search) {
      const t = communityText(r).toLowerCase();
      return search.toLowerCase().split(/\s+/).every(w => t.includes(w));
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Graph Community × Report × Investigation Intelligence Documentation Map (CGRIMAP)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.82)", border: `1px solid ${PU}44`,
          color: PU, fontFamily: FONT, fontSize: 10, letterSpacing: 2,
          padding: "4px 10px", borderRadius: 6, cursor: "pointer",
          backdropFilter: "blur(6px)", whiteSpace: "nowrap",
        }}
      >
        ◈ CGRIMAP
        {counts.UNDOCUMENTED > 0 && (
          <span style={{ marginLeft: 6, background: AM, color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>
            {counts.UNDOCUMENTED}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
      zIndex: Z_INDEX, background: "rgba(2,6,14,0.88)", display: "flex",
      alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)",
    }}>
      <div style={{
        width: "min(860px,96vw)", maxHeight: "88vh", overflowY: "auto",
        background: BG, border: `1px solid ${BORDER}`, borderRadius: 16,
        fontFamily: FONT, color: "#DCEBF5", padding: "20px 24px",
        boxShadow: `0 0 60px ${PU}18`,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <span style={{ color: PU, letterSpacing: 3, fontSize: 13, fontWeight: 700 }}>◈ CGRIMAP</span>
            <span style={{ marginLeft: 12, fontSize: 11, color: "#6E8AA0" }}>
              Graph Community × Report × Investigation — Intelligence Documentation Map
            </span>
          </div>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          {[
            ["COMMUNITIES",      totals.communities,     PU],
            ["REPORTS",          totals.reports,          "#3B82F6"],
            ["INVESTIGATIONS",   totals.investigations,   CY],
            ["FULLY DOC.",       counts.FULLY_DOCUMENTED,  GR],
            ["REPORT ONLY",      counts.REPORT_ONLY,       PU],
            ["INVESTIGATED",     counts.INVESTIGATED_ONLY, CY],
            ["UNDOCUMENTED",     counts.UNDOCUMENTED,       AM],
          ].map(([label, val, color]) => (
            <div key={label} style={{
              background: "rgba(139,92,246,0.04)", border: `1px solid ${color}33`,
              borderRadius: 8, padding: "8px 14px", minWidth: 80, textAlign: "center",
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
              <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1, marginTop: 2 }}>{label}</div>
            </div>
          ))}
          <div style={{
            background: "rgba(139,92,246,0.04)", border: `1px solid ${GR}33`,
            borderRadius: 8, padding: "8px 14px", minWidth: 80, textAlign: "center",
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: GR }}>{docPct}%</div>
            <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1, marginTop: 2 }}>DOC COVERAGE</div>
          </div>
        </div>

        {/* Coverage bar */}
        <div style={{ height: 4, background: "#0D1B2A", borderRadius: 4, marginBottom: 14 }}>
          <div style={{ height: "100%", width: `${docPct}%`, background: `linear-gradient(90deg,${PU},${GR})`, borderRadius: 4, transition: "width .5s" }} />
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? `${CLASS_COLOR[t] || PU}22` : "transparent",
              border: `1px solid ${tab === t ? (CLASS_COLOR[t] || PU) : "#1E3048"}`,
              color: tab === t ? (CLASS_COLOR[t] || PU) : "#6E8AA0",
              borderRadius: 6, padding: "3px 10px", fontSize: 10, cursor: "pointer", letterSpacing: 1,
            }}>{t.replace(/_/g, " ")}</button>
          ))}
          <input
            placeholder="search communities…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              marginLeft: "auto", background: "rgba(139,92,246,0.05)", border: `1px solid ${PU}33`,
              borderRadius: 6, color: "#DCEBF5", padding: "3px 10px", fontSize: 11, fontFamily: FONT,
            }}
          />
        </div>

        {/* Assess */}
        <div style={{ marginBottom: 12 }}>
          <button onClick={assess} disabled={assessing} style={{
            background: assessing ? "#0D1B2A" : `${GR}22`, border: `1px solid ${GR}66`,
            color: GR, borderRadius: 6, padding: "4px 14px", fontSize: 11, cursor: assessing ? "default" : "pointer", letterSpacing: 1,
          }}>
            {assessing ? "assessing…" : "▶ ASSESS DOCUMENTATION"}
          </button>
          {assessment && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#B0CCE0", lineHeight: 1.6, background: "rgba(139,92,246,0.04)", borderRadius: 8, padding: "8px 12px" }}>
              {assessment}
            </div>
          )}
        </div>

        {loading && <div style={{ color: "#6E8AA0", fontSize: 11, marginBottom: 8 }}>loading community intelligence data…</div>}
        {error   && <div style={{ color: "#EF4444", fontSize: 11, marginBottom: 8 }}>error: {error}</div>}

        {/* Rows */}
        {visible.map((c, i) => {
          const id    = c.id || c.community_id || i;
          const isExp = expanded === id;
          const clsColor = CLASS_COLOR[c._cls] || AM;
          return (
            <div key={id} style={{ borderBottom: `1px solid ${BORDER}`, marginBottom: 4 }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 4px", cursor: "pointer",
                  background: isExp ? "rgba(139,92,246,0.04)" : "transparent",
                  borderRadius: 6,
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: clsColor, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12 }}>{c.name || c.label || c.id || "—"}</span>
                {c.size !== undefined && (
                  <span style={{ fontSize: 9, color: "#6E8AA0" }}>{c.size} nodes</span>
                )}
                <span style={{
                  fontSize: 9, letterSpacing: 1, padding: "2px 7px", borderRadius: 4,
                  border: `1px solid ${clsColor}55`, color: clsColor, flexShrink: 0,
                }}>{c._cls.replace(/_/g, " ")}</span>
                <span style={{ fontSize: 10, color: "#6E8AA0" }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "8px 16px 12px", fontSize: 11 }}>
                  {c.description && (
                    <div style={{ color: "#8EA8BF", marginBottom: 8, lineHeight: 1.5 }}>{c.description}</div>
                  )}

                  {/* Report matches */}
                  {c._reports.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ color: PU, fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>
                        ◈ INTELLIGENCE REPORTS ({c._reports.length})
                      </div>
                      {c._reports.map(({ report: r, rel }, ri) => (
                        <div key={ri} style={{
                          background: "rgba(139,92,246,0.05)", borderRadius: 6, padding: "6px 10px",
                          marginBottom: 4, border: `1px solid ${PU}22`,
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: "#DCEBF5", fontSize: 11 }}>{r.title || r.name || "—"}</span>
                            {r.type && (
                              <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, border: `1px solid ${PU}55`, color: PU }}>
                                {r.type}
                              </span>
                            )}
                          </div>
                          <div style={{ height: 3, background: "#0D1B2A", borderRadius: 2, marginTop: 5 }}>
                            <div style={{ height: "100%", width: `${Math.min(rel * 20, 100)}%`, background: PU, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Investigation matches */}
                  {c._invs.length > 0 && (
                    <div>
                      <div style={{ color: CY, fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>
                        ⬡ INVESTIGATIONS ({c._invs.length})
                      </div>
                      {c._invs.map(({ inv: inv, rel }, ii) => (
                        <div key={ii} style={{
                          background: "rgba(0,207,255,0.05)", borderRadius: 6, padding: "6px 10px",
                          marginBottom: 4, border: `1px solid ${CY}22`,
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: "#DCEBF5", fontSize: 11 }}>{inv.title || inv.name || "—"}</span>
                            {inv.priority && (
                              <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, border: `1px solid ${CY}55`, color: CY }}>
                                {inv.priority}
                              </span>
                            )}
                          </div>
                          <div style={{ height: 3, background: "#0D1B2A", borderRadius: 2, marginTop: 5 }}>
                            <div style={{ height: "100%", width: `${Math.min(rel * 20, 100)}%`, background: CY, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {c._reports.length === 0 && c._invs.length === 0 && (
                    <div style={{ color: AM, fontSize: 11 }}>No intelligence reports or investigations matched this community — undocumented in the knowledge base.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {!loading && visible.length === 0 && (
          <div style={{ color: "#6E8AA0", fontSize: 12, textAlign: "center", padding: "20px 0" }}>
            No communities match the current filter.
          </div>
        )}

        <div style={{ marginTop: 14, fontSize: 9, color: "#3A5060", textAlign: "right", letterSpacing: 1 }}>
          CGRIMAP · auto-refresh 90s · /v1/graph/communities + /v1/reports + /v1/investigations
        </div>
      </div>
    </div>
  );
}
