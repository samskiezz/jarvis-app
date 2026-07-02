/**
 * F98 — Intel Profile × Risk Signal Linker
 *
 * Parallel-fetches /entities/IntelProfile + /entities/RiskSignal, then
 * keyword-correlates each threat actor / subject-of-interest
 * (name/description/org/type/aliases) against active risk signals
 * (title/description/type/tags) to surface CONFIRMED profiles
 * (at least one signal match — active threat corroboration) vs
 * UNCONFIRMED profiles (no risk-signal evidence found).
 *
 * Stat tiles: profiles / signals / confirmed / unconfirmed.
 * Filter tabs: ALL | CONFIRMED | UNCONFIRMED + text search.
 * Expand any profile → matched risk signals with severity badge + relevance score.
 * Amber badge on confirmed count; red when any CRITICAL signal matches.
 * ▶ ASSESS: /v1/jarvis/agent/chat 2-sentence threat-activation brief
 *   + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ IPRSK  at bottom:8 left:27840, zIndex 69.
 * Event:   jarvis:iprsk-toggle
 * Voice:   "intel profile risk / actor risk signal / threat actor signal /
 *           confirmed threats / iprsk"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 27840;
const POLL_MS  = 90_000;

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

// ── exported intent helpers ──────────────────────────────────────────────────

const IPRSK_RE =
  /\b(intel\s+profile\s+risk|actor\s+risk\s+signal|threat\s+actor\s+signal|confirmed\s+threats?|iprsk)\b/i;

export function isIprskQuery(q) { return IPRSK_RE.test(q); }

export async function buildIprskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [pRes, sRes] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,   { headers: hdr }),
    ]);
    const pRaw = await pRes.json();
    const sRaw = await sRes.json();
    const profiles = normaliseProfiles(pRaw);
    const signals  = normaliseSignals(sRaw);

    const confirmed   = profiles.filter((p) => signals.some((s) => relevance(p, s) > 0)).length;
    const unconfirmed = profiles.length - confirmed;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS intel profile risk activation status: ${profiles.length} threat actors on file, ` +
          `${signals.length} active risk signals, ${confirmed} profiles have keyword corroboration ` +
          `with at least one active risk signal, ${unconfirmed} profiles show no signal match. ` +
          `Give a 2-sentence threat-activation brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Intel profile risk activation assessment complete, sir.").trim();
  } catch {
    return "Intel profile risk linker analysis unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseProfiles(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.profiles)           ? raw.profiles
    : Array.isArray(raw?.intel_profiles)     ? raw.intel_profiles
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((p, i) => ({
    id:           p.id            || String(i),
    name:         p.name          || p.title         || `Profile ${i + 1}`,
    description:  (p.description  || p.details       || p.summary || "").toString().slice(0, 200),
    org:          p.org           || p.organisation   || p.organization || p.affiliation || "",
    type:         p.type          || p.profile_type   || p.category || "",
    aliases:      Array.isArray(p.aliases) ? p.aliases.join(" ") : (p.aliases || p.aka || ""),
    threat_level: (p.threat_level || p.threat        || p.risk_level || "").toUpperCase(),
  }));
}

function normaliseSignals(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.signals)         ? raw.signals
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : [];
  return arr.map((s, i) => ({
    id:          s.id            || String(i),
    title:       s.title         || s.name           || `Signal ${i + 1}`,
    description: (s.description  || s.details        || s.summary || "").toString().slice(0, 200),
    type:        s.type          || s.signal_type     || s.category || "",
    severity:    (s.severity     || s.level           || "").toUpperCase(),
    tags:        Array.isArray(s.tags) ? s.tags.join(" ") : (s.tags || s.tag || ""),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]]+/)
    .filter((w) => w.length >= 3);
}

function relevance(profile, signal) {
  const pw = keywords(
    `${profile.name} ${profile.description} ${profile.org} ${profile.type} ${profile.aliases}`
  );
  const sw = keywords(`${signal.title} ${signal.description} ${signal.type} ${signal.tags}`);
  return pw.filter((w) => sw.some((s) => s.includes(w) || w.includes(s))).length;
}

function buildCorrelated(profiles, signals) {
  return profiles.map((prof) => {
    const matched = signals
      .map((s) => ({ ...s, score: relevance(prof, s) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    const confirmed   = matched.length > 0;
    const hasCritical = matched.some((s) => s.severity === "CRITICAL");
    return { ...prof, signals: matched, confirmed, hasCritical };
  });
}

const SEVERITY_COLOR = {
  CRITICAL: "#FF4444",
  HIGH:     "#FF8800",
  MEDIUM:   "#F0B429",
  LOW:      "#4ADE80",
};

const THREAT_COLOR = {
  CRITICAL: "#FF4444",
  HIGH:     "#FF8800",
  MEDIUM:   "#F0B429",
  LOW:      "#4ADE80",
};

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "CONFIRMED", "UNCONFIRMED"];
const ACCENT = "#C084FC";

export default function IntelProfileRiskLinker() {
  const [open,      setOpen]      = useState(false);
  const [profiles,  setProfiles]  = useState([]);
  const [signals,   setSignals]   = useState([]);
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
      const [pRes, sRes] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`,   { headers: hdr }),
      ]);
      const pRaw = await pRes.json();
      const sRaw = await sRes.json();
      setProfiles(normaliseProfiles(pRaw));
      setSignals(normaliseSignals(sRaw));
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
    window.addEventListener("jarvis:iprsk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:iprsk-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isIprskQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated     = buildCorrelated(profiles, signals);
  const confirmedCount = correlated.filter((p) =>  p.confirmed).length;
  const unconfirmedCnt = correlated.filter((p) => !p.confirmed).length;
  const criticalBadge  = correlated.some((p) => p.hasCritical);

  const sq = search.toLowerCase();
  const visible = correlated.filter((prof) => {
    if (filter === "CONFIRMED"   && !prof.confirmed) return false;
    if (filter === "UNCONFIRMED" &&  prof.confirmed) return false;
    if (sq && !`${prof.name} ${prof.org} ${prof.type}`.toLowerCase().includes(sq)) return false;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildIprskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Intel Profile–Risk Signal Linker (◈ IPRSK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? `${ACCENT}22` : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? ACCENT : S.border}`,
          borderRadius: S.radius, color: open ? ACCENT : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${ACCENT}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ IPRSK{confirmedCount > 0 && (
          <span style={{
            marginLeft: 4,
            background: criticalBadge ? "#FF4444" : "#FF8800",
            color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{confirmedCount}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 260),
          width: 340,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${ACCENT}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "68vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: ACCENT, letterSpacing: 2, fontWeight: 700 }}>
              INTEL PROFILE–RISK LINKER
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
              { label: "PROFILES",    val: profiles.length,  color: ACCENT    },
              { label: "SIGNALS",     val: signals.length,   color: C.neon    },
              { label: "CONFIRMED",   val: confirmedCount,   color: "#FF8800" },
              { label: "UNCONFIRMED", val: unconfirmedCnt,   color: "#4ADE80" },
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
                flex: 1, background: filter === t ? `${ACCENT}22` : "transparent",
                border: `1px solid ${filter === t ? ACCENT : S.border}`,
                color: filter === t ? ACCENT : S.text,
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
              placeholder="Search profiles…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.3)", border: `1px solid ${S.border}`,
                borderRadius: S.radius, color: S.textHi,
                fontFamily: S.mono, fontSize: S.fs.xxs, padding: "4px 8px",
                outline: "none",
              }}
            />
          </div>

          {/* Profile list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && profiles.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No profiles match.</div>
            ) : visible.map((prof) => {
              const rowColor = prof.confirmed
                ? (prof.hasCritical ? "#FF4444" : "#FF8800")
                : "#4ADE80";
              const tlColor  = THREAT_COLOR[prof.threat_level] || S.text;
              return (
                <div key={prof.id} style={{ marginBottom: 6 }}>
                  <div
                    onClick={() => setExpanded(expanded === prof.id ? null : prof.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                      background: "rgba(0,0,0,0.25)",
                      borderLeft: `3px solid ${rowColor}`,
                    }}
                  >
                    <span style={{ color: rowColor, fontSize: 10, width: 10 }}>
                      {prof.confirmed ? "●" : "○"}
                    </span>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {prof.name}
                      </div>
                      {(prof.type || prof.org) && (
                        <div style={{ color: S.text, fontSize: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {prof.type}{prof.org ? ` · ${prof.org}` : ""}
                        </div>
                      )}
                    </div>
                    {prof.threat_level && (
                      <span style={{
                        fontSize: "8px", padding: "0 4px", borderRadius: 3,
                        background: `${tlColor}22`, color: tlColor,
                        border: `1px solid ${tlColor}44`, whiteSpace: "nowrap",
                      }}>
                        {prof.threat_level}
                      </span>
                    )}
                    <span style={{ color: rowColor, fontSize: "9px", minWidth: 54, textAlign: "right" }}>
                      {prof.confirmed ? `${prof.signals.length} SIG` : "UNCONF"}
                    </span>
                    <span style={{ color: S.text, fontSize: 9 }}>{expanded === prof.id ? "▴" : "▾"}</span>
                  </div>

                  {expanded === prof.id && (
                    <div style={{
                      margin: "2px 0 2px 18px",
                      background: "rgba(0,0,0,0.18)", borderRadius: 4,
                      padding: "5px 8px",
                    }}>
                      {prof.confirmed ? prof.signals.map((sig) => {
                        const sevColor = SEVERITY_COLOR[sig.severity] || S.text;
                        return (
                          <div key={sig.id} style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "2px 0", borderBottom: `1px solid ${S.border}33`,
                          }}>
                            <span style={{ flex: 1, color: S.textHi, fontSize: "9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {sig.title}
                            </span>
                            {sig.severity && (
                              <span style={{
                                fontSize: "8px", padding: "0 4px", borderRadius: 3,
                                background: `${sevColor}22`, color: sevColor,
                                border: `1px solid ${sevColor}44`,
                                whiteSpace: "nowrap",
                              }}>
                                {sig.severity}
                              </span>
                            )}
                            <span style={{ color: C.blue, fontSize: "9px", whiteSpace: "nowrap" }}>
                              rel:{sig.score}
                            </span>
                          </div>
                        );
                      }) : (
                        <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                          No active risk signals correlate with this profile — unconfirmed.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
          }}>
            /entities/IntelProfile · /entities/RiskSignal · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
