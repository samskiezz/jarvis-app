/**
 * F153 — Intel Profile × Ops Event Activity Linker
 *
 * Parallel-fetches /entities/IntelProfile + /v1/ops/events, then keyword-
 * correlates each threat actor (name/description/org/type/aliases) against
 * live operational events to surface:
 *   ACTIVE  — at least one ops event corroborates activity for this profile
 *   DORMANT — no operational footprint detected
 *
 * Stat tiles: profiles / events / active / dormant
 * Filter tabs: ALL | ACTIVE | DORMANT
 * Expand any profile → matched events with severity badge + service + timestamp
 *   + relevance score.
 * Red badge on ACTIVE count when any matched event is CRITICAL.
 * ▶ ASSESS: feeds a 2-sentence actor-activity brief to /v1/jarvis/agent/chat
 *   + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ IPACT  at bottom:8 left:50840, zIndex:101.
 * Event:   jarvis:ipact-toggle
 * Voice:   "intel activity / actor activity / active threats / threat ops events / ipact"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 50840;
const POLL_MS  = 60_000;

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

const IPACT_RE =
  /\b(intel\s+activit|actor\s+activit|active\s+threats?|threat\s+ops\s+events?|ipact|which\s+actors?\s+are\s+active|operational\s+footprint)\b/i;

export function isIpactQuery(q) { return IPACT_RE.test(q); }

export async function buildIpactScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [profRes, evRes] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      fetch(`${base}/v1/ops/events`,         { headers: hdr }),
    ]);
    const profiles = normaliseProfiles(await profRes.json());
    const events   = normaliseEvents(await evRes.json());

    const active  = profiles.filter((p) => events.some((ev) => relevance(p, ev) > 0)).length;
    const dormant = profiles.length - active;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS intel profile ops activity: ${profiles.length} tracked threat actors, ` +
          `${events.length} live operational events, ${active} actors show operational corroboration, ` +
          `${dormant} actors appear dormant (no matching ops events). ` +
          `Give a 2-sentence actor-activity intelligence brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Actor activity analysis complete, sir.").trim();
  } catch {
    return "Actor activity analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseProfiles(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((p, i) => ({
    id:           p.id          || String(i),
    name:         p.name        || p.title  || `Profile ${i + 1}`,
    desc:         (p.description || p.summary || "").toString(),
    org:          p.org         || p.organisation || p.organization || "",
    type:         p.type        || p.category || "",
    aliases:      Array.isArray(p.aliases) ? p.aliases.join(" ") : (p.aliases || ""),
    threat_level: (p.threat_level || p.risk_level || "").toLowerCase(),
  }));
}

function normaliseEvents(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.events)             ? raw.events
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((ev, i) => ({
    id:        ev.id       || String(i),
    title:     ev.title    || ev.name     || ev.event_type || ev.type || `Event ${i + 1}`,
    message:   (ev.description || ev.message || ev.summary || "").toString(),
    severity:  (ev.severity    || ev.level   || "").toLowerCase(),
    service:   ev.service  || ev.source   || ev.actor || "",
    ts:        ev.timestamp || ev.created_at || ev.date || "",
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(profile, event) {
  const pw = keywords(`${profile.name} ${profile.desc} ${profile.org} ${profile.type} ${profile.aliases}`);
  const ew = keywords(`${event.title} ${event.message} ${event.service}`);
  return pw.filter((w) => ew.some((e) => e.includes(w) || w.includes(e))).length;
}

function buildLinked(profiles, events) {
  return profiles.map((p) => {
    const matched = events
      .map((ev) => ({ ...ev, score: relevance(p, ev) }))
      .filter((ev) => ev.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...p, events: matched, active: matched.length > 0 };
  });
}

// ── severity helpers ──────────────────────────────────────────────────────────

function sevColor(sev) {
  if (sev === "critical") return "#EF4444";
  if (sev === "high")     return "#F97316";
  if (sev === "medium")   return "#F59E0B";
  return C.blue;
}

function threatColor(lvl) {
  if (lvl === "critical" || lvl === "high")   return "#EF4444";
  if (lvl === "medium")                        return "#F59E0B";
  if (lvl === "low")                           return "#4ADE80";
  return S.text;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "ACTIVE", "DORMANT"];

export default function IntelProfileOpsLinker() {
  const [open,      setOpen]      = useState(false);
  const [profiles,  setProfiles]  = useState([]);
  const [events,    setEvents]    = useState([]);
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
      const [profRes, evRes] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
        fetch(`${base}/v1/ops/events`,         { headers: hdr }),
      ]);
      setProfiles(normaliseProfiles(await profRes.json()));
      setEvents(normaliseEvents(await evRes.json()));
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
    window.addEventListener("jarvis:ipact-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ipact-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isIpactQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked  = buildLinked(profiles, events);
  const active  = linked.filter((p) => p.active).length;
  const dormant = linked.filter((p) => !p.active).length;

  const hasCritical = linked.some(
    (p) => p.active && p.events.some((ev) => ev.severity === "critical")
  );

  const visible = linked
    .filter((p) => {
      if (filter === "ACTIVE")  return p.active;
      if (filter === "DORMANT") return !p.active;
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
    const text = await buildIpactScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Intel Profile × Ops Event Activity Linker (◈ IPACT)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 101,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ IPACT{active > 0 && (
          <span style={{
            marginLeft: 4,
            background: hasCritical ? "#EF4444" : "#F97316",
            color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{active}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 100,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${C.neon}`,
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
            <span style={{ color: C.neon, letterSpacing: 2, fontWeight: 700, fontSize: S.fs.xxs }}>
              INTEL PROFILE — OPS ACTIVITY
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
              { label: "PROFILES", val: profiles.length, color: C.blue    },
              { label: "OPS EVT",  val: events.length,   color: C.neon    },
              { label: "ACTIVE",   val: active,           color: "#F97316" },
              { label: "DORMANT",  val: dormant,          color: S.text    },
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
                background: filter === t ? `${C.neon}22` : "transparent",
                border: `1px solid ${filter === t ? C.neon : S.border}`,
                color: filter === t ? C.neon : S.text,
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
                    borderLeft: `3px solid ${p.active ? "#F97316" : S.border}`,
                  }}
                >
                  <span style={{ color: p.active ? "#F97316" : S.text, fontSize: 10, width: 10 }}>
                    {p.active ? "●" : "○"}
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
                    color: p.active ? "#F97316" : S.text,
                    minWidth: 50, textAlign: "right",
                  }}>
                    {p.active ? `${p.events.length} EVT` : "DORMANT"}
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
                        {p.type ? <span style={{ marginLeft: 6 }}>type: <span style={{ color: C.neon }}>{p.type}</span></span> : null}
                      </div>
                    )}
                    {p.active ? p.events.map((ev) => (
                      <div key={ev.id} style={{
                        display: "flex", flexDirection: "column",
                        padding: "3px 0", borderBottom: `1px solid ${S.border}22`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {ev.severity && (
                            <span style={{
                              fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                              background: `${sevColor(ev.severity)}22`,
                              color: sevColor(ev.severity),
                              border: `1px solid ${sevColor(ev.severity)}44`,
                              whiteSpace: "nowrap",
                            }}>
                              {ev.severity}
                            </span>
                          )}
                          <span style={{ flex: 1, color: S.textHi, fontSize: "9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {ev.title}
                          </span>
                          <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>
                            rel:{ev.score}
                          </span>
                        </div>
                        {(ev.service || ev.ts) && (
                          <div style={{ color: S.text, fontSize: "8px", marginTop: 1 }}>
                            {ev.service && <span>{ev.service}</span>}
                            {ev.service && ev.ts && <span style={{ margin: "0 4px" }}>·</span>}
                            {ev.ts && <span>{ev.ts.toString().slice(0, 16)}</span>}
                          </div>
                        )}
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No matching ops events for this threat actor.
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
            /entities/IntelProfile · /v1/ops/events · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
