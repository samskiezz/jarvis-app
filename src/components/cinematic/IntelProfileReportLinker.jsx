/**
 * F166 — Intel Profile × Report Coverage Linker (IPRPT)
 *
 * Parallel-fetches /entities/IntelProfile + /v1/reports, then keyword-
 * correlates each threat actor (name/description/org/type/aliases) against
 * the report catalog to surface:
 *   DOCUMENTED   — at least one report references this threat actor
 *   UNDOCUMENTED — no report coverage (intelligence documentation gap)
 *
 * Stat tiles: profiles / reports / documented / undocumented
 * Filter tabs: ALL | DOCUMENTED | UNDOCUMENTED
 * Expand any profile → matched reports with type badge + date badge
 *   + relevance score bar.
 * Amber badge on undocumented count.
 * ▶ ASSESS: feeds a 2-sentence threat-documentation brief to
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ IPRPT  at bottom:8 left:55080, zIndex:108.
 * Event:   jarvis:iprpt-toggle
 * Voice:   "intel report / profile report / threat report coverage /
 *           documented threats / undocumented threats / iprpt"
 * Refresh: 120 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 55080;
const POLL_MS  = 120_000;

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ───────────────────────────────────────────────────

const IPRPT_RE =
  /\b(intel\s+report|profile\s+report|threat\s+report\s+coverage|documented\s+threats?|undocumented\s+threats?|iprpt|which\s+actors?\s+have\s+reports?|actor\s+documentation)\b/i;

export function isIprptQuery(q) { return IPRPT_RE.test(q); }

export async function buildIprptScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [profRes, rptRes] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      fetch(`${base}/v1/reports`,             { headers: hdr }),
    ]);
    const profiles = normaliseProfiles(await profRes.json());
    const reports  = normaliseReports(await rptRes.json());

    const documented   = profiles.filter((p) => reports.some((r) => relevance(p, r) > 0)).length;
    const undocumented = profiles.length - documented;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS intel profile report coverage: ${profiles.length} tracked threat actors, ` +
          `${reports.length} intelligence reports on file, ${documented} actors have documented report coverage, ` +
          `${undocumented} actors are undocumented (no report exists — intelligence gap). ` +
          `Give a 2-sentence threat-documentation brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Threat documentation analysis complete, sir.").trim();
  } catch {
    return "Threat documentation analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseProfiles(raw) {
  const arr = Array.isArray(raw)         ? raw
    : Array.isArray(raw?.data)           ? raw.data
    : Array.isArray(raw?.items)          ? raw.items
    : Array.isArray(raw?.results)        ? raw.results
    : [];
  return arr.map((p, i) => ({
    id:           p.id           || String(i),
    name:         p.name         || p.title || `Profile ${i + 1}`,
    desc:         (p.description || p.summary || "").toString(),
    org:          p.org          || p.organisation || p.organization || "",
    type:         p.type         || p.category || "",
    aliases:      Array.isArray(p.aliases) ? p.aliases.join(" ") : (p.aliases || ""),
    threat_level: (p.threat_level || p.risk_level || "").toLowerCase(),
  }));
}

function normaliseReports(raw) {
  const arr = Array.isArray(raw)         ? raw
    : Array.isArray(raw?.data)           ? raw.data
    : Array.isArray(raw?.reports)        ? raw.reports
    : Array.isArray(raw?.items)          ? raw.items
    : Array.isArray(raw?.results)        ? raw.results
    : [];
  return arr.map((r, i) => ({
    id:      r.id       || String(i),
    title:   r.title    || r.name    || `Report ${i + 1}`,
    summary: (r.summary || r.description || r.content || r.abstract || "").toString(),
    type:    r.type     || r.category || r.report_type || "",
    tags:    Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags || ""),
    date:    r.date     || r.created_at || r.year || r.published_at || "",
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(profile, report) {
  const pw = keywords(`${profile.name} ${profile.desc} ${profile.org} ${profile.type} ${profile.aliases}`);
  const rw = keywords(`${report.title} ${report.summary} ${report.tags}`);
  return pw.filter((w) => rw.some((r) => r.includes(w) || w.includes(r))).length;
}

function buildLinked(profiles, reports) {
  return profiles.map((p) => {
    const matched = reports
      .map((r) => ({ ...r, score: relevance(p, r) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...p, reports: matched, documented: matched.length > 0 };
  });
}

// ── colour helpers ────────────────────────────────────────────────────────────

function threatColor(lvl) {
  if (lvl === "critical" || lvl === "high") return "#EF4444";
  if (lvl === "medium")                      return "#F59E0B";
  if (lvl === "low")                         return "#4ADE80";
  return S.text;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "DOCUMENTED", "UNDOCUMENTED"];

export default function IntelProfileReportLinker() {
  const [open,      setOpen]      = useState(false);
  const [profiles,  setProfiles]  = useState([]);
  const [reports,   setReports]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [profRes, rptRes] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
        fetch(`${base}/v1/reports`,             { headers: hdr }),
      ]);
      setProfiles(normaliseProfiles(await profRes.json()));
      setReports(normaliseReports(await rptRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:iprpt-toggle", onToggle);
    return () => window.removeEventListener("jarvis:iprpt-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isIprptQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked       = buildLinked(profiles, reports);
  const documented   = linked.filter((p) => p.documented).length;
  const undocumented = linked.filter((p) => !p.documented).length;

  const visible = linked
    .filter((p) => {
      if (filter === "DOCUMENTED")   return p.documented;
      if (filter === "UNDOCUMENTED") return !p.documented;
      return true;
    })
    .filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.org.toLowerCase().includes(q)  ||
        p.type.toLowerCase().includes(q)
      );
    });

  async function assess() {
    setAssessing(true);
    const text = await buildIprptScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Intel Profile × Report Coverage (◈ IPRPT)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 108,
          background: open ? "rgba(245,158,11,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? "#F59E0B" : S.border}`,
          borderRadius: S.radius, color: open ? "#F59E0B" : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? "0 0 8px #F59E0B44" : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ IPRPT{undocumented > 0 && (
          <span style={{
            marginLeft: 4,
            background: "#F59E0B",
            color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{undocumented}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 107,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: "2px solid #F59E0B",
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "70vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: "#F59E0B", letterSpacing: 2, fontWeight: 700, fontSize: S.fs.xxs }}>
              INTEL PROFILE — REPORT COVERAGE
            </span>
            <button
              onClick={assess}
              disabled={assessing || profiles.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || profiles.length === 0) ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 12px",
          }}>
            {[
              { label: "PROFILES",  val: profiles.length,  color: C.blue    },
              { label: "REPORTS",   val: reports.length,   color: "#F59E0B" },
              { label: "DOCUMENTED",val: documented,        color: "#4ADE80" },
              { label: "UNDOCUM.",  val: undocumented,      color: "#F59E0B" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 6,
                padding: "5px 4px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: S.fs.lg, fontWeight: 700 }}>{val}</div>
                <div style={{ color: S.text, fontSize: "8px", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 12px 4px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1,
                background: filter === t ? "rgba(245,158,11,0.15)" : "transparent",
                border: `1px solid ${filter === t ? "#F59E0B" : S.border}`,
                color: filter === t ? "#F59E0B" : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 12px 6px" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search profiles…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.3)",
                border: `1px solid ${S.border}`, borderRadius: S.radius,
                color: S.textHi, fontFamily: S.mono, fontSize: "9px",
                padding: "3px 7px", outline: "none",
              }}
            />
          </div>

          {/* Profile list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && profiles.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No profiles match.</div>
            ) : visible.map((p) => (
              <div key={p.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${p.documented ? "#4ADE80" : "#F59E0B"}`,
                  }}
                >
                  <span style={{ color: p.documented ? "#4ADE80" : "#F59E0B", fontSize: 10, width: 10 }}>
                    {p.documented ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                  </span>
                  {p.threat_level && (
                    <span style={{
                      fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                      color: threatColor(p.threat_level),
                      border: `1px solid ${threatColor(p.threat_level)}55`,
                      background: `${threatColor(p.threat_level)}11`,
                      whiteSpace: "nowrap",
                    }}>
                      {p.threat_level}
                    </span>
                  )}
                  <span style={{
                    fontSize: "9px", whiteSpace: "nowrap",
                    color: p.documented ? "#4ADE80" : "#F59E0B",
                    minWidth: 60, textAlign: "right",
                  }}>
                    {p.documented ? `${p.reports.length} RPT` : "NO DOCS"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === p.id ? "▴" : "▾"}</span>
                </div>

                {expanded === p.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {p.org && (
                      <div style={{ color: S.text, fontSize: "8px", marginBottom: 4 }}>
                        org: <span style={{ color: S.textHi }}>{p.org}</span>
                        {p.type ? <span style={{ marginLeft: 6 }}>type: <span style={{ color: "#F59E0B" }}>{p.type}</span></span> : null}
                      </div>
                    )}
                    {p.documented ? p.reports.map((rpt) => (
                      <div key={rpt.id} style={{
                        display: "flex", flexDirection: "column",
                        padding: "3px 0", borderBottom: `1px solid ${S.border}22`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {rpt.type && (
                            <span style={{
                              fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                              background: "rgba(245,158,11,0.15)",
                              color: "#F59E0B",
                              border: "1px solid rgba(245,158,11,0.3)",
                              whiteSpace: "nowrap",
                            }}>
                              {rpt.type}
                            </span>
                          )}
                          <span style={{ flex: 1, color: S.textHi, fontSize: "9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {rpt.title}
                          </span>
                          <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>
                            rel:{rpt.score}
                          </span>
                        </div>
                        {rpt.date && (
                          <div style={{ color: S.text, fontSize: "8px", marginTop: 1 }}>
                            {rpt.date.toString().slice(0, 16)}
                          </div>
                        )}
                        {/* relevance bar */}
                        <div style={{ height: 2, background: "rgba(0,0,0,0.3)", borderRadius: 1, marginTop: 3 }}>
                          <div style={{
                            height: "100%", borderRadius: 1,
                            width: `${Math.min(100, rpt.score * 15)}%`,
                            background: "#F59E0B",
                          }} />
                        </div>
                      </div>
                    )) : (
                      <div style={{ color: "#F59E0B", fontSize: "9px", padding: "2px 0" }}>
                        No reports found for this threat actor — intelligence gap.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
          }}>
            /entities/IntelProfile · /v1/reports · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
