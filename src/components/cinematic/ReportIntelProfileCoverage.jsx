/**
 * F48 — Report × Intel Profile Coverage (RPIP)
 *
 * Parallel-fetches /v1/reports + /entities/IntelProfile, then
 * keyword-correlates each tracked intel profile (name/category/description/aliases/tags)
 * against the intelligence report corpus (title/summary/type) to surface:
 *   PROFILED    — at least one report covers this intel profile / threat actor
 *   UNMONITORED — no report in the corpus references this profile (intelligence gap)
 *
 * Stat tiles: reports / profiles / profiled / unmonitored
 * Filter tabs: ALL | PROFILED | UNMONITORED
 * Expand any profile → matched reports with type badge + relevance score.
 * Amber badge on UNMONITORED count (intelligence gap indicator).
 * ▶ ASSESS: 2-sentence intel-profile report-coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ RPIP  at bottom:8 left:70760, zIndex:136.
 * Event:   jarvis:rpip-toggle
 * Voice:   "report intel profile / intel profile report / rpip /
 *           profiled reports / unmonitored profiles / threat actor report coverage /
 *           which profiles have reports / intelligence gap / report gap"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 70760;
const POLL_MS  = 90_000;
const AMBER    = "#F59E0B";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

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

const RPIP_RE =
  /\b(report\s+intel(\s+profile)?|intel(\s+profile)?\s+report|rpip|profiled\s+report|unmonitored\s+profile|threat\s+actor\s+report\s+coverage|which\s+(profiles?|intel|threat\s+actors?)\s+(have|lack|missing)\s+(report|coverage|documentation)|intelligence\s+gap|report\s+gap|profile\s+report\s+coverage|intel\s+report\s+gap)\b/i;

export function isRpipQuery(q) { return RPIP_RE.test(q); }

export async function buildRpipScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [repRes, profileRes] = await Promise.all([
      fetch(`${base}/v1/reports`,            { headers: hdr }),
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
    ]);
    const reports  = normaliseReports(await repRes.json());
    const profiles = normaliseProfiles(await profileRes.json());

    const profiled     = profiles.filter((p) => reports.some((r) => relevance(p, r) > 0)).length;
    const unmonitored  = profiles.length - profiled;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS intel profile × report coverage: ${profiles.length} tracked threat actor and ` +
          `intel profiles cross-referenced against ${reports.length} intelligence reports — ` +
          `${profiled} profiles have at least one report documenting them; ` +
          `${unmonitored} profiles have zero report coverage — a critical intelligence gap. ` +
          `Give a 2-sentence intel-profile report-coverage brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Intel profile report coverage analysis complete, sir.").trim();
  } catch {
    return "Intel profile report coverage check unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseReports(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.reports)            ? raw.reports
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((r, i) => ({
    id:      r.id          || r.report_id   || String(i),
    title:   r.title       || r.name        || `Report ${i + 1}`,
    summary: (r.summary    || r.description || r.content || r.body || "").toString().slice(0, 300),
    type:    r.type        || r.report_type || r.category || "",
    tags:    Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags || ""),
  }));
}

function normaliseProfiles(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.profiles)           ? raw.profiles
    : Array.isArray(raw?.intel_profiles)     ? raw.intel_profiles
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.results)            ? raw.results
    : Array.isArray(raw?.items)              ? raw.items
    : [];
  return arr.map((p, i) => ({
    id:          p.id          || p.profile_id  || String(i),
    name:        p.name        || p.title        || p.actor   || `Profile ${i + 1}`,
    category:    p.category    || p.type         || p.threat_type || p.classification || "",
    description: (p.description || p.summary    || p.overview || p.details || "").toString().slice(0, 300),
    aliases:     Array.isArray(p.aliases) ? p.aliases.join(" ") : (p.aliases || p.aka || ""),
    tags:        Array.isArray(p.tags) ? p.tags.join(" ") : (p.tags || ""),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(profile, report) {
  const pw = keywords(`${profile.name} ${profile.category} ${profile.description} ${profile.aliases} ${profile.tags}`.slice(0, 400));
  const rw = keywords(`${report.title} ${report.summary} ${report.type} ${report.tags}`.slice(0, 400));
  return pw.filter((w) => rw.some((a) => a.includes(w) || w.includes(a))).length;
}

function buildLinked(profiles, reports) {
  return profiles.map((profile) => {
    const matched = reports
      .map((r) => ({ ...r, score: relevance(profile, r) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...profile, reports: matched, profiled: matched.length > 0 };
  });
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "PROFILED", "UNMONITORED"];

export default function ReportIntelProfileCoverage() {
  const [open,        setOpen]     = useState(false);
  const [reports,     setReports]  = useState([]);
  const [profiles,    setProfiles] = useState([]);
  const [loading,     setLoading]  = useState(false);
  const [filter,      setFilter]   = useState("ALL");
  const [search,      setSearch]   = useState("");
  const [expanded,    setExpanded] = useState(null);
  const [assessing,   setAssessing] = useState(false);
  const [lastFetch,   setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [repRes, profileRes] = await Promise.all([
        fetch(`${base}/v1/reports`,            { headers: hdr }),
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      ]);
      setReports(normaliseReports(await repRes.json()));
      setProfiles(normaliseProfiles(await profileRes.json()));
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
    window.addEventListener("jarvis:rpip-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rpip-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "");
      if (isRpipQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked      = buildLinked(profiles, reports);
  const profiled    = linked.filter((p) => p.profiled).length;
  const unmonitored = linked.filter((p) => !p.profiled).length;

  const visible = linked
    .filter((p) => {
      if (filter === "PROFILED")    return p.profiled;
      if (filter === "UNMONITORED") return !p.profiled;
      return true;
    })
    .filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    });

  async function assess() {
    setAssessing(true);
    const text = await buildRpipScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Report × Intel Profile Coverage (◈ RPIP)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 136,
          background: open ? `${AMBER}22` : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? AMBER : S.border}`,
          borderRadius: S.radius, color: open ? AMBER : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${AMBER}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ RPIP{unmonitored > 0 && (
          <span style={{
            marginLeft: 4,
            background: AMBER,
            color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{unmonitored}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 136,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${AMBER}`,
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
            <span style={{ color: AMBER, letterSpacing: 2, fontWeight: 700, fontSize: S.fs.xxs }}>
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
            gap: 6, padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            {[
              { label: "REPORTS",     value: reports.length,  color: S.textLo },
              { label: "PROFILES",    value: profiles.length, color: S.textLo },
              { label: "PROFILED",    value: profiled,        color: "#4ADE80" },
              { label: "UNMONITORED", value: unmonitored,     color: AMBER    },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.04)", borderRadius: 4,
                padding: "4px 6px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: 15, fontWeight: 700 }}>{value}</div>
                <div style={{ color: S.textLo, fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Tabs + search */}
          <div style={{
            display: "flex", gap: 4, padding: "6px 12px",
            borderBottom: `1px solid ${S.border}`,
          }}>
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                style={{
                  background: filter === t ? `${AMBER}22` : "transparent",
                  border: `1px solid ${filter === t ? AMBER : S.border}`,
                  color: filter === t ? AMBER : S.textLo,
                  borderRadius: 4, padding: "2px 8px",
                  fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="filter…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.06)",
                border: `1px solid ${S.border}`, borderRadius: 4,
                color: S.textHi, fontFamily: S.mono, fontSize: S.fs.xxs,
                padding: "2px 6px", width: 80, outline: "none",
              }}
            />
          </div>

          {/* Profile list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 12px" }}>
            {loading && profiles.length === 0 && (
              <div style={{ color: S.textLo, textAlign: "center", padding: 16 }}>Loading…</div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ color: S.textLo, textAlign: "center", padding: 16 }}>No profiles match.</div>
            )}
            {visible.map((profile) => (
              <div key={profile.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === profile.id ? null : profile.id)}
                  style={{
                    background: "rgba(255,255,255,0.04)", borderRadius: 4,
                    padding: "6px 8px", cursor: "pointer",
                    border: `1px solid ${profile.profiled ? "#4ADE8033" : `${AMBER}44`}`,
                    display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      color: profile.profiled ? S.textHi : AMBER,
                      fontWeight: 600, fontSize: S.fs.xxs,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {profile.name}
                    </div>
                    {profile.category && (
                      <div style={{ color: S.textLo, fontSize: 9, marginTop: 2 }}>{profile.category}</div>
                    )}
                  </div>
                  <span style={{
                    fontSize: 9, borderRadius: 3, padding: "1px 5px", flexShrink: 0,
                    background: profile.profiled ? "rgba(74,222,128,0.10)" : `${AMBER}18`,
                    color: profile.profiled ? "#4ADE80" : AMBER,
                    border: `1px solid ${profile.profiled ? "#4ADE8044" : `${AMBER}44`}`,
                  }}>
                    {profile.profiled ? "PROFILED" : "UNMONITORED"}
                  </span>
                </div>

                {/* Expanded: matched reports */}
                {expanded === profile.id && profile.reports.length > 0 && (
                  <div style={{
                    marginTop: 2, marginLeft: 8,
                    borderLeft: `2px solid ${AMBER}44`, paddingLeft: 8,
                  }}>
                    {profile.reports.slice(0, 5).map((r) => (
                      <div key={r.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "3px 0", borderBottom: `1px solid ${S.border}11`,
                      }}>
                        <span style={{
                          color: S.textHi, fontSize: S.fs.xxs,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          maxWidth: "65%",
                        }}>
                          {r.title}
                        </span>
                        <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                          {r.type && (
                            <span style={{
                              fontSize: 8, borderRadius: 3, padding: "1px 4px",
                              background: `${AMBER}18`,
                              color: AMBER,
                              border: `1px solid ${AMBER}44`,
                            }}>
                              {String(r.type).toUpperCase().slice(0, 10)}
                            </span>
                          )}
                          <span style={{
                            fontSize: 8, color: S.textLo,
                            background: "rgba(255,255,255,0.06)",
                            borderRadius: 3, padding: "1px 4px",
                          }}>
                            rel:{r.score}
                          </span>
                        </div>
                      </div>
                    ))}
                    {profile.reports.length > 5 && (
                      <div style={{ color: S.textLo, fontSize: 9, padding: "2px 0" }}>
                        +{profile.reports.length - 5} more reports
                      </div>
                    )}
                  </div>
                )}
                {expanded === profile.id && profile.reports.length === 0 && (
                  <div style={{
                    marginTop: 2, marginLeft: 8,
                    borderLeft: `2px solid ${AMBER}44`, paddingLeft: 8,
                    color: AMBER, fontSize: 9, padding: "4px 0 4px 8px",
                  }}>
                    No intelligence reports cover this profile — gap identified.
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.textLo, fontSize: 8, letterSpacing: 1, display: "flex",
            justifyContent: "space-between", alignItems: "center",
          }}>
            <span>RPIP · 90s AUTO-REFRESH</span>
            <span>{lastFetch ? lastFetch.toLocaleTimeString() : "—"}</span>
          </div>
        </div>
      )}
    </>
  );
}
