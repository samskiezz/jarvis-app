/**
 * F171 — Intel Profile × Risk Signal Threat Attribution (TATTR)
 *
 * Parallel-fetches /entities/IntelProfile + /entities/RiskSignal, then
 * keyword-correlates each active risk signal against known threat actor
 * profiles to surface:
 *   ATTRIBUTED    — at least one threat actor has keyword overlap with this risk
 *   UNATTRIBUTED  — no threat actor context found (intelligence gap)
 *
 * Stat tiles: profiles / risks / attributed / unattributed
 * Filter tabs: ALL | ATTRIBUTED | UNATTRIBUTED
 * Expand any risk → matched profiles with actor type badge + relevance score.
 * Red badge on unattributed count when any unattributed risk is CRITICAL.
 * ▶ ASSESS: 2-sentence threat-attribution brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ TATTR  at bottom:8 left:57320, zIndex:112.
 * Event:   jarvis:tattr-toggle
 * Voice:   "threat attribution / actor risk / who drives risk / intel attribution /
 *           which actors / tattr / risk actor"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 57320;
const POLL_MS  = 60_000;
const CRIMSON  = "#F87171";

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

const TATTR_RE =
  /\b(threat\s+attribution|actor\s+risk|who\s+(drives?|is\s+behind)\s+(this\s+)?risk|intel\s+attribution|which\s+(actor|profile)s?\s+(drive|behind|linked?\s+to)\s+risk|tattr|risk\s+actor|threat\s+actor\s+risk|attribution\s+map)\b/i;

export function isTattrQuery(q) { return TATTR_RE.test(q); }

export async function buildTattrScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [profRes, riskRes] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,   { headers: hdr }),
    ]);
    const profiles = normaliseProfiles(await profRes.json());
    const risks    = normaliseRisks(await riskRes.json());

    const attributed   = risks.filter((r) => profiles.some((p) => relevance(r, p) > 0)).length;
    const unattributed = risks.length - attributed;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS threat attribution analysis: ${profiles.length} intel profiles on record, ` +
          `${risks.length} active risk signals, ${attributed} risks have known threat-actor ` +
          `attribution, ${unattributed} risk signals lack any actor attribution (intelligence gap). ` +
          `Give a 2-sentence threat-attribution coverage brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Threat attribution analysis complete, sir.").trim();
  } catch {
    return "Threat attribution analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseProfiles(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.profiles)         ? raw.profiles
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.results)          ? raw.results
    : Array.isArray(raw?.items)            ? raw.items
    : [];
  return arr.map((p, i) => ({
    id:          p.id          || p.profile_id  || String(i),
    name:        p.name        || p.actor_name  || p.alias || `Actor ${i + 1}`,
    type:        p.type        || p.actor_type  || p.category || "",
    description: (p.description || p.summary   || p.bio || p.notes || "").toString(),
    tags:        Array.isArray(p.tags) ? p.tags.join(" ") : (p.tags || ""),
  }));
}

function normaliseRisks(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.risks)            ? raw.risks
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : [];
  return arr.map((r, i) => ({
    id:          r.id          || r.risk_id     || String(i),
    title:       r.title       || r.name        || r.signal || `Risk ${i + 1}`,
    severity:    r.severity    || r.level       || r.priority || "medium",
    description: (r.description || r.summary   || r.notes || "").toString(),
    tags:        Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags || ""),
    status:      r.status      || r.state       || "active",
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(risk, profile) {
  const rw = keywords(`${risk.title} ${risk.description.slice(0, 300)} ${risk.tags}`);
  const pw = keywords(`${profile.name} ${profile.description.slice(0, 300)} ${profile.tags} ${profile.type}`);
  return rw.filter((w) => pw.some((a) => a.includes(w) || w.includes(a))).length;
}

function buildLinked(risks, profiles) {
  return risks.map((r) => {
    const matched = profiles
      .map((p) => ({ ...p, score: relevance(r, p) }))
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...r, profiles: matched, attributed: matched.length > 0 };
  });
}

function severityColor(s) {
  const sv = String(s || "").toLowerCase();
  if (sv === "critical")          return "#F87171";
  if (sv === "high")              return "#FB923C";
  if (sv === "medium")            return "#FBBF24";
  return "#4ADE80";
}

function actorTypeColor(t) {
  const ty = String(t || "").toLowerCase();
  if (ty.includes("state") || ty.includes("nation")) return "#818CF8";
  if (ty.includes("crime") || ty.includes("criminal")) return "#F87171";
  if (ty.includes("hack") || ty.includes("group"))    return "#FBBF24";
  return "#94A3B8";
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "ATTRIBUTED", "UNATTRIBUTED"];

export default function ThreatAttributionMapper() {
  const [open,       setOpen]       = useState(false);
  const [profiles,   setProfiles]   = useState([]);
  const [risks,      setRisks]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [filter,     setFilter]     = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [lastFetch,  setLastFetch]  = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [profRes, riskRes] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`,   { headers: hdr }),
      ]);
      setProfiles(normaliseProfiles(await profRes.json()));
      setRisks(normaliseRisks(await riskRes.json()));
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
    window.addEventListener("jarvis:tattr-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tattr-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "");
      if (isTattrQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked       = buildLinked(risks, profiles);
  const attributed   = linked.filter((r) => r.attributed).length;
  const unattributed = linked.filter((r) => !r.attributed).length;

  const hasCriticalUnattributed = linked.some(
    (r) => !r.attributed && String(r.severity).toLowerCase() === "critical"
  );

  const visible = linked
    .filter((r) => {
      if (filter === "ATTRIBUTED")   return r.attributed;
      if (filter === "UNATTRIBUTED") return !r.attributed;
      return true;
    })
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        String(r.severity).toLowerCase().includes(q)
      );
    });

  async function assess() {
    setAssessing(true);
    const text = await buildTattrScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Intel Profile × Risk Signal Threat Attribution (◈ TATTR)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 112,
          background: open ? `${CRIMSON}22` : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? CRIMSON : S.border}`,
          borderRadius: S.radius, color: open ? CRIMSON : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${CRIMSON}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ TATTR{unattributed > 0 && (
          <span style={{
            marginLeft: 4,
            background: hasCriticalUnattributed ? CRIMSON : "#F59E0B",
            color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{unattributed}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 113,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${CRIMSON}`,
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
            <span style={{ color: CRIMSON, letterSpacing: 2, fontWeight: 700, fontSize: S.fs.xxs }}>
              THREAT ATTRIBUTION — RISK SIGNALS
            </span>
            <button
              onClick={assess}
              disabled={assessing || risks.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || risks.length === 0) ? 0.4 : 1,
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
              { label: "ACTORS",      val: profiles.length, color: "#818CF8" },
              { label: "RISKS",       val: risks.length,    color: C.neon    },
              { label: "ATTRIBUTED",  val: attributed,      color: "#4ADE80" },
              { label: "UNATTRIB.",   val: unattributed,    color: CRIMSON   },
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
                background: filter === t ? `${CRIMSON}22` : "transparent",
                border: `1px solid ${filter === t ? CRIMSON : S.border}`,
                color: filter === t ? CRIMSON : S.text,
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
              placeholder="search risks…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.3)",
                border: `1px solid ${S.border}`, borderRadius: S.radius,
                color: S.textHi, fontFamily: S.mono, fontSize: "9px",
                padding: "3px 7px", outline: "none",
              }}
            />
          </div>

          {/* Risk list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && risks.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No risks match.</div>
            ) : visible.map((r) => (
              <div key={r.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${r.attributed ? "#4ADE80" : CRIMSON}`,
                  }}
                >
                  <span style={{ color: r.attributed ? "#4ADE80" : CRIMSON, fontSize: 10, width: 10 }}>
                    {r.attributed ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.title}
                  </span>
                  <span style={{
                    fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                    background: `${severityColor(r.severity)}22`,
                    color: severityColor(r.severity),
                    border: `1px solid ${severityColor(r.severity)}44`,
                    whiteSpace: "nowrap",
                  }}>
                    {String(r.severity || "med").toUpperCase()}
                  </span>
                  <span style={{
                    fontSize: "9px", whiteSpace: "nowrap",
                    color: r.attributed ? "#4ADE80" : CRIMSON,
                    minWidth: 68, textAlign: "right",
                  }}>
                    {r.attributed ? `${r.profiles.length} ACTOR${r.profiles.length !== 1 ? "S" : ""}` : "UNATTRIBUTED"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === r.id ? "▴" : "▾"}</span>
                </div>

                {expanded === r.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {r.attributed ? r.profiles.map((p) => (
                      <div key={p.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderBottom: `1px solid ${S.border}22`,
                      }}>
                        <span style={{
                          fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                          background: `${actorTypeColor(p.type)}22`,
                          color: actorTypeColor(p.type),
                          border: `1px solid ${actorTypeColor(p.type)}44`,
                          whiteSpace: "nowrap",
                        }}>
                          {(p.type || "ACTOR").toUpperCase().slice(0, 12)}
                        </span>
                        <span style={{ flex: 1, color: S.textHi, fontSize: "9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.name}
                        </span>
                        <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>
                          rel:{p.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: CRIMSON, fontSize: "9px", padding: "2px 0" }}>
                        No known threat actor attribution for this risk signal.
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
            /entities/IntelProfile · /entities/RiskSignal · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
