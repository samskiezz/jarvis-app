/**
 * F170 — SwarmJob × Graph Community × Knowledge × Contact Mission Intelligence Network (SMICNET)
 *
 * Parallel-fetches /entities/SwarmJob + /v1/graph/communities + /knowledge/ + /entities/Contact
 * and keyword-correlates each swarm job (name/description/type/status/tags) against
 * graph community clusters AND KB articles AND contacts to classify:
 *
 *   FULLY_NETWORKED  — matched all three (community + KB + contact)
 *   DUAL_NETWORKED   — matched any two
 *   SINGLE_LINKED    — matched exactly one
 *   ISOLATED         — no matches (mission intelligence gap)
 *
 * Stat tiles: SWARM JOBS / COMMUNITIES / KB ARTICLES / CONTACTS + four class counts + NETWORK%.
 * Amber badge on isolated count.
 * Filter tabs ALL / FULLY_NETWORKED / DUAL_NETWORKED / SINGLE_LINKED / ISOLATED + text search.
 * Expand job → matched community cards (purple) + KB article cards (green) + contact cards (orange)
 *              with relevance bars.
 * ▶ ASSESS NETWORK → /v1/jarvis/agent/chat 2-sentence mission intelligence network brief + TTS.
 * 90-s auto-refresh. jarvis:smicnet-toggle event.
 *
 * Voice triggers: "smicnet / swarm mission intel / swarm network / mission intelligence network /
 *                  isolated swarm mission / swarm community / swarm knowledge contact".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_037_560;
const Z_INDEX  = 231;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const SMICNET_RE = /\b(smicnet|swarm[\s-]mission[\s-]intel(?:ligence)?|swarm[\s-]network|mission[\s-]intelligence[\s-]network|isolated[\s-]swarm[\s-]mission|swarm[\s-]community|swarm[\s-]knowledge[\s-]contact)\b/i;

const PU     = "#A855F7";
const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const OR     = "#F97316";
const RD     = "#EF4444";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_NETWORKED: GR,
  DUAL_NETWORKED:  CY,
  SINGLE_LINKED:   PU,
  ISOLATED:        AM,
};

const TABS = ["ALL", "FULLY_NETWORKED", "DUAL_NETWORKED", "SINGLE_LINKED", "ISOLATED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function jobText(j) {
  return `${j.name || j.title || ""} ${j.description || j.summary || ""} ${j.type || j.job_type || ""} ${j.status || ""} ${(j.tags || []).join(" ")}`;
}
function communityText(c) {
  return `${c.name || c.label || c.id || ""} ${c.description || c.summary || ""} ${(c.members || []).join(" ")} ${(c.tags || []).join(" ")}`;
}
function kbText(k) {
  return `${k.title || k.name || ""} ${k.content || k.description || k.summary || ""} ${k.category || k.type || ""} ${(k.tags || []).join(" ")}`;
}
function contactText(c) {
  return `${c.name || c.full_name || ""} ${c.role || c.title || ""} ${c.organisation || c.org || c.company || ""} ${c.email || ""} ${(c.tags || []).join(" ")}`;
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
  const [jobRes, commRes, kbRes, contRes] = await Promise.allSettled([
    fetch(`${apiBase}/entities/SwarmJob`,        { headers }),
    fetch(`${apiBase}/v1/graph/communities`,     { headers }),
    fetch(`${apiBase}/knowledge/`,               { headers }),
    fetch(`${apiBase}/entities/Contact`,         { headers }),
  ]);
  const jobs       = jobRes.status   === "fulfilled" && jobRes.value.ok
    ? normaliseArray(await jobRes.value.json(),  ["jobs", "swarm_jobs", "items"]) : [];
  const communities = commRes.status === "fulfilled" && commRes.value.ok
    ? normaliseArray(await commRes.value.json(), ["communities", "clusters", "items"]) : [];
  const articles   = kbRes.status    === "fulfilled" && kbRes.value.ok
    ? normaliseArray(await kbRes.value.json(),   ["articles", "knowledge", "items"]) : [];
  const contacts   = contRes.status  === "fulfilled" && contRes.value.ok
    ? normaliseArray(await contRes.value.json(), ["contacts", "people", "items"]) : [];
  return { jobs, communities, articles, contacts };
}

function correlate(jobs, communities, articles, contacts) {
  return jobs.map(j => {
    const kws = keywords(jobText(j));
    const matchedComms = communities
      .map(c => ({ comm: c, rel: score(communityText(c), kws) }))
      .filter(x => x.rel > 0).sort((a, b) => b.rel - a.rel).slice(0, 4);
    const matchedKB = articles
      .map(a => ({ art: a, rel: score(kbText(a), kws) }))
      .filter(x => x.rel > 0).sort((a, b) => b.rel - a.rel).slice(0, 4);
    const matchedConts = contacts
      .map(c => ({ cont: c, rel: score(contactText(c), kws) }))
      .filter(x => x.rel > 0).sort((a, b) => b.rel - a.rel).slice(0, 4);
    const hits = (matchedComms.length > 0 ? 1 : 0) + (matchedKB.length > 0 ? 1 : 0) + (matchedConts.length > 0 ? 1 : 0);
    const cls = hits === 3 ? "FULLY_NETWORKED"
              : hits === 2 ? "DUAL_NETWORKED"
              : hits === 1 ? "SINGLE_LINKED"
              :               "ISOLATED";
    return { ...j, _cls: cls, _comms: matchedComms, _kb: matchedKB, _conts: matchedConts };
  });
}

export function isSmicnetQuery(q = "") { return SMICNET_RE.test(q); }

export async function buildSmicnetScript() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [jobRes, commRes, kbRes, contRes] = await Promise.allSettled([
    fetch(`${apiBase}/entities/SwarmJob`,    { headers }),
    fetch(`${apiBase}/v1/graph/communities`, { headers }),
    fetch(`${apiBase}/knowledge/`,           { headers }),
    fetch(`${apiBase}/entities/Contact`,     { headers }),
  ]);
  const jobs        = jobRes.status   === "fulfilled" && jobRes.value.ok
    ? normaliseArray(await jobRes.value.json(),  ["jobs", "swarm_jobs", "items"]) : [];
  const communities = commRes.status  === "fulfilled" && commRes.value.ok
    ? normaliseArray(await commRes.value.json(), ["communities", "clusters", "items"]) : [];
  const articles    = kbRes.status    === "fulfilled" && kbRes.value.ok
    ? normaliseArray(await kbRes.value.json(),   ["articles", "knowledge", "items"]) : [];
  const contacts    = contRes.status  === "fulfilled" && contRes.value.ok
    ? normaliseArray(await contRes.value.json(), ["contacts", "people", "items"]) : [];
  const rows        = correlate(jobs, communities, articles, contacts);
  const fullyNet    = rows.filter(r => r._cls === "FULLY_NETWORKED").length;
  const isolated    = rows.filter(r => r._cls === "ISOLATED").length;
  const netPct      = rows.length ? Math.round((rows.length - isolated) / rows.length * 100) : 0;
  return `SMICNET Mission Intelligence Network online, sir. Across ${rows.length} swarm jobs cross-referenced against ${communities.length} graph communities, ${articles.length} knowledge articles, and ${contacts.length} contacts, ${fullyNet} missions are fully networked. ${isolated} remain isolated — ${netPct}% mission network coverage. Opening the panel for full visibility now.`;
}

export default function SwarmMissionIntelNet() {
  const [open,       setOpen]       = useState(false);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [rows,       setRows]       = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [expanded,   setExpanded]   = useState(null);
  const [totals,     setTotals]     = useState({ jobs: 0, communities: 0, articles: 0, contacts: 0 });
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { jobs, communities, articles, contacts } = await loadAll();
      setTotals({ jobs: jobs.length, communities: communities.length, articles: articles.length, contacts: contacts.length });
      setRows(correlate(jobs, communities, articles, contacts));
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(v => { if (!v) load(); return !v; }); };
    window.addEventListener("jarvis:smicnet-toggle", toggle);
    return () => window.removeEventListener("jarvis:smicnet-toggle", toggle);
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
      const body = await buildSmicnetScript();
      const res = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
        },
        body: JSON.stringify({ message: `You are JARVIS. In exactly 2 sentences, assess this mission intelligence network coverage:\n${body}` }),
      });
      const data = await res.json();
      const txt  = data?.response || data?.message || data?.content || "";
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessment("Unable to assess mission intelligence network at this time, sir.");
    } finally {
      setAssessing(false);
    }
  }

  const counts = {
    FULLY_NETWORKED: rows.filter(r => r._cls === "FULLY_NETWORKED").length,
    DUAL_NETWORKED:  rows.filter(r => r._cls === "DUAL_NETWORKED").length,
    SINGLE_LINKED:   rows.filter(r => r._cls === "SINGLE_LINKED").length,
    ISOLATED:        rows.filter(r => r._cls === "ISOLATED").length,
  };
  const netPct = rows.length ? Math.round((rows.length - counts.ISOLATED) / rows.length * 100) : 0;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r._cls !== tab) return false;
    if (!search) return true;
    return jobText(r).toLowerCase().includes(search.toLowerCase());
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.85)", border: "1px solid rgba(0,207,255,0.35)",
          color: CY, fontFamily: FONT, fontSize: 10, padding: "3px 7px",
          cursor: "pointer", borderRadius: 3, letterSpacing: 1,
        }}
      >
        ◈ SMICNET{counts.ISOLATED > 0 && <span style={{ color: AM, marginLeft: 4 }}>{counts.ISOLATED}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 50, right: 20, zIndex: Z_INDEX,
      width: 640, maxHeight: "78vh", display: "flex", flexDirection: "column",
      background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
      fontFamily: FONT, color: CY, boxShadow: "0 0 32px rgba(0,207,255,0.15)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ fontSize: 11, letterSpacing: 2, color: CY }}>◈ SMICNET — MISSION INTELLIGENCE NETWORK</span>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: RD, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
        {[
          ["SWARM JOBS",     totals.jobs,              CY],
          ["COMMUNITIES",    totals.communities,        PU],
          ["KB ARTICLES",    totals.articles,           GR],
          ["CONTACTS",       totals.contacts,           OR],
          ["FULLY NET.",     counts.FULLY_NETWORKED,    GR],
          ["DUAL NET.",      counts.DUAL_NETWORKED,     CY],
          ["SINGLE LINK.",   counts.SINGLE_LINKED,      PU],
          ["ISOLATED",       counts.ISOLATED,           AM],
          [`NETWORK ${netPct}%`, netPct,               netPct >= 80 ? GR : netPct >= 50 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,0,0,0.35)", border: `1px solid ${col}33`,
            borderRadius: 4, padding: "4px 10px", textAlign: "center", minWidth: 68,
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 8, color: "#888", letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: "0 14px 8px" }}>
        <div style={{ height: 4, background: "#111", borderRadius: 2 }}>
          <div style={{ height: 4, width: `${netPct}%`,
            background: netPct >= 80 ? GR : AM,
            borderRadius: 2, transition: "width 0.4s" }} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "rgba(0,207,255,0.15)" : "rgba(0,0,0,0.3)",
            border: `1px solid ${tab === t ? CY : "#333"}`,
            color: tab === t ? CY : "#666", fontSize: 9, padding: "3px 8px",
            cursor: "pointer", borderRadius: 3, letterSpacing: 1,
          }}>{t.replace(/_/g, " ")}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "0 14px 8px" }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search swarm jobs..."
          style={{
            width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid #333",
            color: CY, fontFamily: FONT, fontSize: 10, padding: "4px 8px",
            borderRadius: 3, boxSizing: "border-box", outline: "none",
          }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 8px" }}>
        {loading && <div style={{ color: "#555", fontSize: 10, padding: 8 }}>Loading…</div>}
        {error   && <div style={{ color: RD,   fontSize: 10, padding: 8 }}>{error}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color: "#555", fontSize: 10, padding: 8 }}>No swarm jobs match.</div>
        )}
        {visible.map((j, i) => {
          const id    = j.id || j._id || i;
          const name  = j.name || j.title || `SwarmJob ${i + 1}`;
          const status = j.status || j.state || "";
          const isExp = expanded === id;
          const col   = CLASS_COLOR[j._cls] || CY;
          return (
            <div key={id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "rgba(0,0,0,0.3)", border: `1px solid ${col}33`,
                  borderRadius: 4, padding: "6px 10px", cursor: "pointer",
                }}
              >
                <div>
                  <span style={{ fontSize: 11, color: CY }}>{name}</span>
                  {status && <span style={{ fontSize: 9, color: "#666", marginLeft: 8 }}>{status}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 9, color: col, letterSpacing: 1 }}>{j._cls.replace(/_/g, " ")}</span>
                  <span style={{ fontSize: 9, color: "#555" }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>

              {isExp && (
                <div style={{ padding: "6px 10px", background: "rgba(0,0,0,0.2)",
                  borderLeft: `2px solid ${col}`, marginLeft: 4 }}>
                  {/* Matched communities */}
                  {j._comms.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: PU, marginBottom: 4, letterSpacing: 1 }}>GRAPH COMMUNITIES</div>
                      {j._comms.map(({ comm: c, rel }, k) => (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#ccc" }}>{c.name || c.label || c.id || `Community ${k + 1}`}</span>
                            <span style={{ fontSize: 9, color: PU, padding: "1px 5px",
                              background: "rgba(168,85,247,0.12)", borderRadius: 2 }}>CLUSTER</span>
                          </div>
                          <div style={{ height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: 3, width: `${Math.min(rel * 20, 100)}%`,
                              background: PU, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Matched KB articles */}
                  {j._kb.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: GR, marginBottom: 4, letterSpacing: 1 }}>KB ARTICLES</div>
                      {j._kb.map(({ art: a, rel }, k) => (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#ccc" }}>{a.title || a.name || `Article ${k + 1}`}</span>
                            <span style={{ fontSize: 9, color: GR, padding: "1px 5px",
                              background: "rgba(34,197,94,0.1)", borderRadius: 2 }}>{a.category || a.type || "KB"}</span>
                          </div>
                          <div style={{ height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: 3, width: `${Math.min(rel * 20, 100)}%`,
                              background: GR, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Matched contacts */}
                  {j._conts.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: OR, marginBottom: 4, letterSpacing: 1 }}>CONTACTS</div>
                      {j._conts.map(({ cont: c, rel }, k) => (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#ccc" }}>{c.name || c.full_name || `Contact ${k + 1}`}</span>
                            <span style={{ fontSize: 9, color: OR, padding: "1px 5px",
                              background: "rgba(249,115,22,0.1)", borderRadius: 2 }}>{c.role || c.title || "CONTACT"}</span>
                          </div>
                          <div style={{ height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: 3, width: `${Math.min(rel * 20, 100)}%`,
                              background: OR, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {j._comms.length === 0 && j._kb.length === 0 && j._conts.length === 0 && (
                    <div style={{ fontSize: 9, color: "#555" }}>No communities, KB articles, or contacts matched this swarm job.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess */}
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}` }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? "rgba(0,0,0,0.3)" : "rgba(0,207,255,0.08)",
          border: `1px solid ${assessing ? "#333" : CY}`,
          color: assessing ? "#555" : CY, fontFamily: FONT, fontSize: 10,
          padding: "4px 12px", cursor: assessing ? "not-allowed" : "pointer", borderRadius: 3,
        }}>
          {assessing ? "Assessing…" : "▶ ASSESS MISSION INTELLIGENCE NETWORK"}
        </button>
        {assessment && (
          <div style={{ marginTop: 8, fontSize: 10, color: "#aaa", lineHeight: 1.5,
            padding: "6px 10px", background: "rgba(0,207,255,0.05)",
            border: "1px solid rgba(0,207,255,0.15)", borderRadius: 4 }}>
            {assessment}
          </div>
        )}
      </div>
    </div>
  );
}
