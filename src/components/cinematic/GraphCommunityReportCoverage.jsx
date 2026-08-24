/**
 * F92 — Graph Community × Report Coverage (GCRPT)
 *
 * Parallel-fetches /v1/graph/communities + /v1/reports,
 * then keyword-correlates each network cluster against the intelligence
 * report corpus to surface:
 *
 *   REPORTED  — at least one report covers this community's domain
 *   UNCHARTED — no report documentation — intelligence gap
 *
 * Stat tiles: communities / reports / reported / uncharted
 * Filter tabs: ALL | REPORTED | UNCHARTED + text search
 * Expand any cluster → matched reports with type badge + relevance score.
 * Amber badge on UNCHARTED count.
 * ▶ ASSESS: 2-sentence community-documentation brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ GCRPT  at bottom:8 left:64600, zIndex:123.
 * Event:   jarvis:gcrpt-toggle
 * Voice:   "community report / report community / gcrpt /
 *           reported community / uncharted community /
 *           community documentation / community report coverage /
 *           which communities have reports"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 64600;
const POLL_MS  = 90_000;
const AMBER    = "#F59E0B";
const SLATE    = "#6E8AA0";
const BLUE     = "#60A5FA";
const VIOLET   = "#A78BFA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const GCRPT_RE =
  /\b(communit\w*\s+report[s]?|report[s]?\s+communit\w*|gcrpt|reported\s+communit\w*|uncharted\s+communit\w*|communit\w*\s+documentation|communit\w*\s+report\s+coverage|which\s+communities\s+have\s+reports?|communit\w*\s+intel\s+doc[s]?|communit\w*\s+report\s+gap)\b/i;

export function isGcrptQuery(q) { return GCRPT_RE.test(q); }

export async function buildGcrptScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [commRes, rptRes] = await Promise.all([
      fetch(`${base}/v1/graph/communities`, { headers: hdr }),
      fetch(`${base}/v1/reports`,           { headers: hdr }),
    ]);
    const communities = normaliseCommunities(await commRes.json());
    const reports     = normaliseReports(await rptRes.json());

    const reported  = communities.filter(
      (c) => reports.some((r) => relevance(c, r) > 0)
    ).length;
    const uncharted = communities.length - reported;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS community documentation brief: ${communities.length} graph communities ` +
          `correlated against ${reports.length} intelligence reports. ` +
          `${reported} communities are REPORTED (at least one report covers their domain); ` +
          `${uncharted} communities remain UNCHARTED (no report documentation found — intelligence gap). ` +
          `Provide a 2-sentence community-documentation coverage assessment — formal British butler ` +
          `tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Community report coverage analysis complete, sir.").trim();
  } catch {
    return "Community report coverage unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseCommunities(raw) {
  const arr = Array.isArray(raw)                ? raw
    : Array.isArray(raw?.communities)           ? raw.communities
    : Array.isArray(raw?.clusters)              ? raw.clusters
    : Array.isArray(raw?.data)                  ? raw.data
    : Array.isArray(raw?.results)               ? raw.results
    : Array.isArray(raw?.items)                 ? raw.items
    : [];
  return arr.map((c, i) => ({
    id:      c.id        || c.community_id  || String(i),
    label:   c.label     || c.name          || c.title     || `Community ${i + 1}`,
    members: Array.isArray(c.members) ? c.members.join(" ") : (c.members || ""),
    summary: (c.summary  || c.description   || c.notes     || "").toString().slice(0, 300),
    size:    c.size      || (Array.isArray(c.members) ? c.members.length : 0) || 0,
  }));
}

function normaliseReports(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.reports)         ? raw.reports
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.results)         ? raw.results
    : Array.isArray(raw?.items)           ? raw.items
    : [];
  return arr.map((r, i) => ({
    id:    r.id    || String(i),
    label: r.title || r.name || r.subject || `Report ${i + 1}`,
    type:  r.type  || r.category || r.kind || "REPORT",
    tokens: tok(`${r.title || ""} ${r.name || ""} ${r.summary || ""} ${r.description || ""} ${(r.tags || []).join(" ")}`),
  }));
}

function tok(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function relevance(community, report) {
  const cw = tok(`${community.label} ${community.members} ${community.summary}`);
  const rv = new Set(report.tokens);
  return cw.filter((w) => rv.has(w)).length;
}

function buildLinked(communities, reports) {
  return communities.map((c) => {
    const matched = reports
      .map((r) => ({ ...r, score: relevance(c, r) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    return { ...c, reports: matched, reported: matched.length > 0 };
  });
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "REPORTED", "UNCHARTED"];

export default function GraphCommunityReportCoverage() {
  const [open,        setOpen]        = useState(false);
  const [communities, setCommunities] = useState([]);
  const [reports,     setReports]     = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [filter,      setFilter]      = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const [lastFetch,   setLastFetch]   = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [commRes, rptRes] = await Promise.all([
        fetch(`${base}/v1/graph/communities`, { headers: hdr }),
        fetch(`${base}/v1/reports`,           { headers: hdr }),
      ]);
      setCommunities(normaliseCommunities(await commRes.json()));
      setReports(normaliseReports(await rptRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:gcrpt-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gcrpt-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildGcrptScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked    = buildLinked(communities, reports);
  const reported  = linked.filter((c) => c.reported).length;
  const uncharted = linked.length - reported;

  const displayed = linked.filter((c) => {
    if (filter === "REPORTED"  && !c.reported) return false;
    if (filter === "UNCHARTED" && c.reported)  return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return c.label.toLowerCase().includes(q) || c.members.toLowerCase().includes(q);
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Graph Community × Report Coverage (GCRPT)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 123,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${AMBER}55`,
          color: AMBER, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {uncharted > 0
          ? <><span style={{ background: AMBER, color: "#04060A", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{uncharted}</span>◈ GCRPT</>
          : "◈ GCRPT"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 123,
      width: 480, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${AMBER}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${AMBER}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${AMBER}33` }}>
        <span style={{ color: AMBER, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ GCRPT</span>
        <span style={{ color: SLATE, fontSize: 9, flex: 1 }}>COMMUNITY × REPORT COVERAGE</span>
        {lastFetch && <span style={{ color: SLATE, fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: AMBER, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${AMBER}22` }}>
        {[
          { label: "COMMUNITIES", value: linked.length, col: BLUE   },
          { label: "REPORTS",     value: reports.length, col: VIOLET },
          { label: "REPORTED",    value: reported,       col: "#34D399" },
          { label: "UNCHARTED",   value: uncharted,      col: AMBER  },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: SLATE, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${AMBER}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${AMBER}22` : "none",
            border: `1px solid ${filter === t ? AMBER : SLATE}`,
            color: filter === t ? AMBER : SLATE,
            borderRadius: 5, padding: "2px 8px", fontSize: 9,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search communities…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${AMBER}`,
          color: AMBER, borderRadius: 5, padding: "2px 8px",
          fontSize: 9, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* community list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: SLATE, fontSize: 10, textAlign: "center", padding: 20 }}>
            No communities match the current filter.
          </div>
        )}
        {displayed.map((c) => {
          const isExp = expanded === c.id;
          const col   = c.reported ? "#34D399" : AMBER;
          const badge = c.reported ? "REPORTED" : "UNCHARTED";
          return (
            <div key={c.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${AMBER}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${c.reported ? "#34D39944" : `${AMBER}44`}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col,
                }}>
                  {badge}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{c.label}</span>
                {c.size > 0 && <span style={{ fontSize: 8, color: SLATE }}>{c.size} nodes</span>}
                {c.reported && (
                  <span style={{ fontSize: 8, color: "#34D399" }}>{c.reports.length} report{c.reports.length !== 1 ? "s" : ""}</span>
                )}
                <span style={{ color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${AMBER}22` }}>
                  {c.summary && (
                    <div style={{ fontSize: 9, color: SLATE, marginBottom: 6 }}>
                      {c.summary.slice(0, 120)}
                    </div>
                  )}
                  {c.reports.length === 0 ? (
                    <div style={{ fontSize: 9, color: AMBER }}>No intelligence reports currently cover this community's domain.</div>
                  ) : (
                    c.reports.map((r, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: `${VIOLET}22`, color: VIOLET,
                          letterSpacing: 1, flexShrink: 0,
                        }}>
                          {String(r.type).toUpperCase().slice(0, 8)}
                        </span>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", flexShrink: 0 }}>
                          <div style={{ height: "100%", borderRadius: 2, background: AMBER, width: `${Math.min(100, r.score * 20)}%` }} />
                        </div>
                        <span style={{ fontSize: 8, color: AMBER, flexShrink: 0 }}>{r.score}</span>
                      </div>
                    ))
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
