/**
 * F53 — Graph Community × Investigation × Report Triple (GCIRT)
 *
 * Parallel-fetches /v1/graph/communities + /v1/investigations + /v1/reports
 * then keyword-correlates each network cluster against both open investigations
 * and the report catalog to surface:
 *   FULLY_COVERED     — cluster has both investigative case AND documentary report
 *   INVESTIGATION_ONLY — cluster has a case but no matching report
 *   REPORT_ONLY        — cluster has a report but no active investigation
 *   DARK               — no investigative or documentary coverage (blind spot)
 *
 * Stat tiles: clusters / investigations / reports / fully-covered / dark
 * Filter tabs: ALL | FULLY_COVERED | INVESTIGATION_ONLY | REPORT_ONLY | DARK
 * Text search across cluster id / member node IDs.
 * Expand any cluster → matched investigations + matched reports.
 * Amber badge on dark count.
 * ▶ ASSESS: 2-sentence community evidence brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ GCIRT  at left:1020 bottom:18, zIndex:68.
 * Event:   jarvis:gcirt-toggle
 * Voice:   "community investigation report" / "cluster evidence" / "gcirt" /
 *          "dark clusters" / "community report gap" / "graph coverage triple"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const PURPLE = "#A78BFA";
const RED    = "#FF3B6B";
const MUTED  = "#6E8AA0";
const BG     = "rgba(4,7,14,0.96)";
const MONO   = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1020;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                      return raw;
  if (raw && Array.isArray(raw.items))         return raw.items;
  if (raw && Array.isArray(raw.data))          return raw.data;
  if (raw && Array.isArray(raw.results))       return raw.results;
  if (raw && typeof raw === "object")          return Object.values(raw);
  return [];
}

function normaliseCommunities(raw) {
  // endpoint returns { communities: {node_id: cluster_id}, n_clusters, count }
  const comMap = raw?.communities || {};
  if (typeof comMap === "object" && !Array.isArray(comMap)) {
    const groups = new Map();
    for (const [nodeId, clusterId] of Object.entries(comMap)) {
      const key = String(clusterId);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(String(nodeId));
    }
    return [...groups.entries()]
      .map(([id, members]) => ({ id, label: `Cluster ${id}`, members, size: members.length }))
      .sort((a, b) => b.size - a.size);
  }
  return normaliseArray(raw).map((c, i) => ({
    id:      String(c.id ?? c.community_id ?? i),
    label:   c.label ?? c.name ?? `Cluster ${i + 1}`,
    size:    c.size ?? c.member_count ?? (Array.isArray(c.members) ? c.members.length : 0),
    members: [
      ...(Array.isArray(c.members)      ? c.members      : []),
      ...(Array.isArray(c.node_ids)     ? c.node_ids     : []),
      ...(Array.isArray(c.member_nodes) ? c.member_nodes : []),
    ].map(String),
  }));
}

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((inv, i) => ({
    id:          String(inv.id ?? inv.investigation_id ?? i),
    title:       inv.title ?? inv.name ?? inv.subject ?? `Investigation ${i + 1}`,
    description: [inv.description, inv.subject, inv.kind, inv.type, inv.status]
                   .filter(Boolean).join(" "),
    status:      inv.status ?? "open",
  }));
}

function normaliseReports(raw) {
  return normaliseArray(raw).map((r, i) => ({
    id:    String(r.id ?? r.report_id ?? i),
    title: r.title ?? r.name ?? r.topic ?? `Report ${i + 1}`,
    text:  [r.title, r.topic, r.description, r.summary, r.generated_by, r.category]
             .filter(Boolean).join(" "),
  }));
}

// ─── keyword scoring ──────────────────────────────────────────────────────────

function buildKeywords(strings) {
  return strings
    .flatMap(s => String(s).toLowerCase().split(/[^a-z0-9]+/))
    .filter(t => t.length >= 3);
}

function scoreMatch(keywords, text) {
  const haystack = text.toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    if (haystack.includes(kw)) hits++;
  }
  return hits;
}

// ─── data ─────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [comRes, invRes, rptRes] = await Promise.all([
    fetch(`${base}/v1/graph/communities`,  { headers: hdr }),
    fetch(`${base}/v1/investigations`,     { headers: hdr }),
    fetch(`${base}/v1/reports`,            { headers: hdr }),
  ]);
  return {
    communities:    normaliseCommunities(await comRes.json()),
    investigations: normaliseInvestigations(await invRes.json()),
    reports:        normaliseReports(await rptRes.json()),
  };
}

// ─── correlation ──────────────────────────────────────────────────────────────

function correlate(communities, investigations, reports) {
  return communities.map(cluster => {
    const kws = buildKeywords([cluster.id, cluster.label, ...cluster.members]);

    const matchedInv = investigations
      .map(inv => ({ inv, score: scoreMatch(kws, `${inv.title} ${inv.description}`) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);

    const matchedRpt = reports
      .map(rpt => ({ rpt, score: scoreMatch(kws, rpt.text) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);

    const hasInv = matchedInv.length > 0;
    const hasRpt = matchedRpt.length > 0;
    const classification =
      hasInv && hasRpt  ? "FULLY_COVERED"      :
      hasInv             ? "INVESTIGATION_ONLY"  :
      hasRpt             ? "REPORT_ONLY"         :
                           "DARK";

    return { ...cluster, matchedInv, matchedRpt, classification };
  });
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const GCIRT_RE =
  /\b(gcirt|graph\s+community\s+(invest(igation)?|report)|community\s+(invest(igation)?|report)\s+(triple|coverage|gap)|cluster\s+(evidence|report|investigation)|dark\s+cluster[s]?|community\s+(evidence|blind\s+spot)|graph\s+coverage\s+triple)\b/i;

export function isGcirtQuery(q) { return GCIRT_RE.test(q); }

export async function buildGcirtScript() {
  try {
    const { communities, investigations, reports } = await fetchAll();
    const rows = correlate(communities, investigations, reports);
    const total   = rows.length;
    const fully   = rows.filter(r => r.classification === "FULLY_COVERED").length;
    const invOnly = rows.filter(r => r.classification === "INVESTIGATION_ONLY").length;
    const rptOnly = rows.filter(r => r.classification === "REPORT_ONLY").length;
    const dark    = rows.filter(r => r.classification === "DARK").length;
    return (
      `Graph community triple coverage: ${total} clusters analysed across ` +
      `${investigations.length} investigations and ${reports.length} reports. ` +
      `${fully} clusters have full coverage, ${invOnly} have investigation-only, ` +
      `${rptOnly} have report-only, and ${dark} clusters are dark — ` +
      `no investigative or documentary evidence links them to the knowledge base.`
    );
  } catch (e) {
    return `Unable to build graph community investigation report brief: ${e.message}`;
  }
}

// ─── colours ─────────────────────────────────────────────────────────────────

const CLASS_COLOR = {
  FULLY_COVERED:      GREEN,
  INVESTIGATION_ONLY: CY,
  REPORT_ONLY:        PURPLE,
  DARK:               RED,
};

const CLASS_LABEL = {
  FULLY_COVERED:      "FULLY COVERED",
  INVESTIGATION_ONLY: "INVESTIGATION",
  REPORT_ONLY:        "REPORT ONLY",
  DARK:               "DARK",
};

const TABS = ["ALL", "FULLY_COVERED", "INVESTIGATION_ONLY", "REPORT_ONLY", "DARK"];

// ─── component ────────────────────────────────────────────────────────────────

export default function GraphCommunityInvestigationReportTriple() {
  const [open,        setOpen]        = useState(false);
  const [rows,        setRows]        = useState([]);
  const [invTotal,    setInvTotal]    = useState(0);
  const [rptTotal,    setRptTotal]    = useState(0);
  const [tab,         setTab]         = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [err,         setErr]         = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { communities, investigations, reports } = await fetchAll();
      setRows(correlate(communities, investigations, reports));
      setInvTotal(investigations.length);
      setRptTotal(reports.length);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:gcirt-toggle", toggle);
    return () => window.removeEventListener("jarvis:gcirt-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildGcirtScript();
      const base = apiBase();
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Graph community investigation report triple summary: ${script}. Give a 2-sentence analytical brief on the coverage state and where attention is needed.` }),
      });
      const d = await res.json();
      const text = d?.response ?? d?.message ?? script;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (e) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: `Assessment error: ${e.message}` } }));
    } finally {
      setAssessing(false);
    }
  }, []);

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.classification !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${r.id} ${r.label} ${r.members.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const dark    = rows.filter(r => r.classification === "DARK").length;
  const fully   = rows.filter(r => r.classification === "FULLY_COVERED").length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Community × Investigation × Report Triple"
        style={{
          position: "fixed", bottom: 18, left: BTN_LEFT, zIndex: 68,
          background: "transparent", border: `1px solid ${CY}44`,
          color: CY, fontFamily: MONO, fontSize: 10, padding: "3px 7px",
          cursor: "pointer", borderRadius: 3, letterSpacing: 1,
        }}
      >
        {dark > 0 && (
          <span style={{
            background: AMBER, color: "#000", borderRadius: 2,
            padding: "0 4px", marginRight: 4, fontSize: 9, fontWeight: 700,
          }}>{dark}</span>
        )}
        ◈ GCIRT
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 60, left: Math.min(BTN_LEFT, window.innerWidth - 530),
      width: 520, maxHeight: "70vh", zIndex: 200,
      background: BG, border: `1px solid ${CY}55`,
      borderRadius: 6, display: "flex", flexDirection: "column",
      fontFamily: MONO, fontSize: 11, color: CY,
      boxShadow: `0 0 24px ${CY}18`,
    }}>
      {/* header */}
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${CY}33`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, letterSpacing: 1 }}>◈ GRAPH COMMUNITY × INVESTIGATION × REPORT</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={assess} disabled={assessing} style={{ background: "transparent", border: `1px solid ${GREEN}55`, color: GREEN, fontFamily: MONO, fontSize: 10, padding: "2px 8px", cursor: "pointer", borderRadius: 3 }}>
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button onClick={() => setOpen(false)} style={{ background: "transparent", border: "none", color: MUTED, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderBottom: `1px solid ${CY}22` }}>
        {[
          { label: "CLUSTERS",  value: rows.length,      color: CY },
          { label: "INVEST.",   value: invTotal,          color: CY },
          { label: "REPORTS",   value: rptTotal,          color: CY },
          { label: "COVERED",   value: fully,             color: GREEN },
          { label: "DARK",      value: dark,              color: dark > 0 ? AMBER : MUTED },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ flex: 1, background: "#0A1220", border: `1px solid ${color}33`, borderRadius: 4, padding: "4px 6px", textAlign: "center" }}>
            <div style={{ color, fontWeight: 700, fontSize: 14 }}>{value}</div>
            <div style={{ color: MUTED, fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "6px 12px", borderBottom: `1px solid ${CY}22`, overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${CY}22` : "transparent",
            border: `1px solid ${tab === t ? CY : CY + "33"}`,
            color: tab === t ? CY : MUTED, fontFamily: MONO, fontSize: 9,
            padding: "2px 7px", cursor: "pointer", borderRadius: 3, whiteSpace: "nowrap",
          }}>
            {t === "FULLY_COVERED" ? "FULL" : t === "INVESTIGATION_ONLY" ? "INVEST" : t === "REPORT_ONLY" ? "RPT" : t}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="search cluster…"
          style={{ flex: 1, minWidth: 80, background: "#0A1220", border: `1px solid ${CY}33`, color: CY, fontFamily: MONO, fontSize: 10, padding: "2px 6px", borderRadius: 3, outline: "none" }}
        />
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 12px" }}>
        {loading && !rows.length && <div style={{ color: MUTED, padding: 8 }}>loading…</div>}
        {err && <div style={{ color: RED, padding: 8 }}>error: {err}</div>}
        {!loading && !err && visible.length === 0 && <div style={{ color: MUTED, padding: 8 }}>no clusters matched</div>}

        {visible.map(r => {
          const isExp = expanded === r.id;
          const clr   = CLASS_COLOR[r.classification];
          return (
            <div key={r.id} style={{ marginBottom: 4, border: `1px solid ${clr}33`, borderRadius: 4, background: "#070d16" }}>
              <div
                onClick={() => setExpanded(isExp ? null : r.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", cursor: "pointer" }}
              >
                <span style={{ color: clr, fontWeight: 700, fontSize: 9, minWidth: 90 }}>{CLASS_LABEL[r.classification]}</span>
                <span style={{ flex: 1, color: CY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.label} <span style={{ color: MUTED }}>({r.size} nodes)</span>
                </span>
                <span style={{ color: MUTED, fontSize: 9 }}>
                  {r.matchedInv.length}I / {r.matchedRpt.length}R
                </span>
                <span style={{ color: MUTED }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {/* progress bar */}
              <div style={{ height: 2, background: "#0A1220", margin: "0 8px 4px" }}>
                <div style={{ width: `${Math.min(100, (r.matchedInv.length + r.matchedRpt.length) * 10)}%`, height: "100%", background: clr, transition: "width 0.3s" }} />
              </div>

              {isExp && (
                <div style={{ padding: "4px 8px 8px", borderTop: `1px solid ${CY}22` }}>
                  {/* members */}
                  <div style={{ color: MUTED, fontSize: 9, marginBottom: 4 }}>
                    Members: {r.members.slice(0, 6).join(", ")}{r.members.length > 6 ? ` +${r.members.length - 6}` : ""}
                  </div>

                  {/* matched investigations */}
                  {r.matchedInv.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: CY, fontSize: 9, marginBottom: 2 }}>INVESTIGATIONS ({r.matchedInv.length})</div>
                      {r.matchedInv.slice(0, 3).map(({ inv, score }) => (
                        <div key={inv.id} style={{ display: "flex", gap: 6, marginBottom: 2 }}>
                          <span style={{ background: `${CY}22`, color: CY, borderRadius: 2, padding: "0 4px", fontSize: 8 }}>sc:{score}</span>
                          <span style={{ color: "#aaa", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.title}</span>
                          <span style={{ color: MUTED, fontSize: 8, marginLeft: "auto" }}>{inv.status}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* matched reports */}
                  {r.matchedRpt.length > 0 && (
                    <div>
                      <div style={{ color: PURPLE, fontSize: 9, marginBottom: 2 }}>REPORTS ({r.matchedRpt.length})</div>
                      {r.matchedRpt.slice(0, 3).map(({ rpt, score }) => (
                        <div key={rpt.id} style={{ display: "flex", gap: 6, marginBottom: 2 }}>
                          <span style={{ background: `${PURPLE}22`, color: PURPLE, borderRadius: 2, padding: "0 4px", fontSize: 8 }}>sc:{score}</span>
                          <span style={{ color: "#aaa", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rpt.title}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {r.matchedInv.length === 0 && r.matchedRpt.length === 0 && (
                    <div style={{ color: RED, fontSize: 9 }}>No matching investigations or reports — DARK cluster</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{ padding: "4px 12px", borderTop: `1px solid ${CY}22`, color: MUTED, fontSize: 9 }}>
        /v1/graph/communities + /v1/investigations + /v1/reports · 90 s auto-refresh
      </div>
    </div>
  );
}
