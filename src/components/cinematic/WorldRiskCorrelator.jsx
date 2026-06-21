/**
 * F71 — Live World × Risk Correlator
 *
 * Parallel-fetches /functions/getLiveIntel (earthquakes) and
 * /entities/RiskSignal, then keyword-correlates each live seismic event
 * against the risk signal catalog to surface whether a quake has an
 * existing RISK SIGNAL (CORROBORATED) or falls outside tracked coverage
 * (SOLO — no risk signal mentions that region or topic).
 *
 * Stat tiles: quakes / risks / corroborated / solo.
 * Filter tabs: ALL | CORROBORATED | SOLO.
 * Expand any quake → matched risk signals with relevance score + severity.
 * ▶ ASSESS: sends a 2-sentence AI geophysical-risk brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ WRLRSK  at bottom:8 left:9228, zIndex 69.
 * Voice:   "world risk / quake risk / geo risk / wrlrsk / geophysical risk / live world risk"
 * Event:   jarvis:wrlrsk-toggle
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 9228;
const POLL_MS  = 90_000;
const API_KEY  = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

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

const WRLRSK_RE =
  /\b(world\s+risk|quake\s+risk|geo\s*[\s-]?risk|geophysical\s+risk|live\s+world\s+risk|wrlrsk|seismic\s+risk\s+correlation|earthquake\s+risk\s+map)\b/i;

export function isWrlrskQuery(q) { return WRLRSK_RE.test(q); }

export async function buildWrlrskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [intelRes, riskRes] = await Promise.all([
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,    { headers: hdr }),
    ]);
    const intelRaw = await intelRes.json();
    const riskRaw  = await riskRes.json();
    const quakes   = normaliseQuakes(intelRaw);
    const risks    = normaliseRisks(riskRaw);

    const corroborated = quakes.filter((q) => risks.some((r) => relevance(q, r) > 0)).length;
    const solo         = quakes.length - corroborated;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS geophysical-risk correlation: ${quakes.length} live seismic events, ` +
          `${risks.length} risk signals on file, ${corroborated} quake locations corroborated ` +
          `by an existing risk signal, ${solo} events have no matching risk signal coverage. ` +
          `Give a 2-sentence geophysical-risk intelligence brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Geophysical risk correlation complete, sir.").trim();
  } catch {
    return "Geophysical risk correlation is unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseQuakes(raw) {
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.earthquakes)        ? raw.earthquakes
    : Array.isArray(raw?.seismic)            ? raw.seismic
    : Array.isArray(raw?.data)               ? raw.data
    : [];
  return arr.slice(0, 100).map((q, i) => ({
    id:    q.id    || String(i),
    place: q.place || q.location || q.title || `Quake ${i + 1}`,
    mag:   parseFloat(q.mag || q.magnitude || 0),
    depth: parseFloat(q.depth || 0),
    lat:   parseFloat(q.lat || q.latitude  || 0),
    lng:   parseFloat(q.lng || q.longitude || q.lon || 0),
  }));
}

function normaliseRisks(raw) {
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.risk_signals)       ? raw.risk_signals
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((r, i) => ({
    id:       r.id       || String(i),
    title:    r.title    || r.name    || r.signal_name || `Risk ${i + 1}`,
    desc:     (r.description || r.summary || r.category || r.tags || "").toString(),
    severity: (r.severity || r.level  || "").toLowerCase(),
  }));
}

function placeKeywords(place) {
  return String(place || "")
    .toLowerCase()
    .replace(/\d+km\s+\w+\s+of\s+/gi, "")
    .split(/[\s,./|:@_\-]+/)
    .filter((w) => w.length >= 3);
}

function riskKeywords(risk) {
  return String(`${risk.title} ${risk.desc}`)
    .toLowerCase()
    .split(/[\s_\-.,/|:@]+/)
    .filter((w) => w.length >= 3);
}

function relevance(quake, risk) {
  const qw = placeKeywords(quake.place);
  const rw = riskKeywords(risk);
  return qw.filter((w) => rw.some((s) => s.includes(w) || w.includes(s))).length;
}

function buildCorrelated(quakes, risks) {
  return quakes.map((q) => {
    const matched = risks
      .map((r) => ({ ...r, score: relevance(q, r) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...q, risks: matched, corroborated: matched.length > 0 };
  });
}

// ── severity colour ───────────────────────────────────────────────────────────

function sevColor(sev) {
  if (sev === "critical") return "#EF4444";
  if (sev === "high")     return "#F97316";
  if (sev === "medium")   return "#F59E0B";
  return C.blue;
}

function magColor(mag) {
  if (mag >= 7) return "#EF4444";
  if (mag >= 6) return "#F97316";
  if (mag >= 5) return "#F59E0B";
  return C.neon;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "CORROBORATED", "SOLO"];

export default function WorldRiskCorrelator() {
  const [open,       setOpen]       = useState(false);
  const [quakes,     setQuakes]     = useState([]);
  const [risks,      setRisks]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [filter,     setFilter]     = useState("ALL");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [lastFetch,  setLastFetch]  = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [intelRes, riskRes] = await Promise.all([
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`,    { headers: hdr }),
      ]);
      setQuakes(normaliseQuakes(await intelRes.json()));
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
    window.addEventListener("jarvis:wrlrsk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:wrlrsk-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isWrlrskQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated    = buildCorrelated(quakes, risks);
  const corroborated  = correlated.filter((q) => q.corroborated).length;
  const solo          = correlated.filter((q) => !q.corroborated).length;

  const visible = correlated.filter((q) => {
    if (filter === "CORROBORATED") return q.corroborated;
    if (filter === "SOLO")         return !q.corroborated;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildWrlrskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Live World × Risk Correlator (◈ WRLRSK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ WRLRSK{solo > 0 && (
          <span style={{
            marginLeft: 4, background: "#F97316", color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{solo}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${C.neon}`,
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
            <span style={{ color: C.neon, letterSpacing: 2, fontWeight: 700 }}>
              WORLD × RISK
            </span>
            <button
              onClick={assess}
              disabled={assessing || quakes.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || quakes.length === 0) ? 0.4 : 1,
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
              { label: "QUAKES",  val: quakes.length, color: C.blue    },
              { label: "RISKS",   val: risks.length,  color: C.gold    },
              { label: "CORR",    val: corroborated,  color: "#4ADE80" },
              { label: "SOLO",    val: solo,           color: "#F97316" },
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
          <div style={{ display: "flex", gap: 4, padding: "0 12px 6px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1, background: filter === t ? `${C.neon}22` : "transparent",
                border: `1px solid ${filter === t ? C.neon : S.border}`,
                color: filter === t ? C.neon : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Quake list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && quakes.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No events match.</div>
            ) : visible.map((q) => (
              <div key={q.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === q.id ? null : q.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${q.corroborated ? "#4ADE80" : "#F97316"}`,
                  }}
                >
                  <span style={{ color: q.corroborated ? "#4ADE80" : "#F97316", fontSize: 10, width: 10 }}>
                    {q.corroborated ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "9px" }}>
                    {q.place}
                  </span>
                  {q.mag > 0 && (
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${magColor(q.mag)}22`, color: magColor(q.mag),
                      border: `1px solid ${magColor(q.mag)}44`,
                      whiteSpace: "nowrap",
                    }}>
                      M{q.mag.toFixed(1)}
                    </span>
                  )}
                  <span style={{ color: q.corroborated ? "#4ADE80" : "#F97316", fontSize: "9px", minWidth: 42, textAlign: "right" }}>
                    {q.corroborated ? `${q.risks.length} RSK` : "SOLO"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === q.id ? "▴" : "▾"}</span>
                </div>

                {expanded === q.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {q.corroborated ? q.risks.map((r) => (
                      <div key={r.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "2px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <span style={{ color: S.textHi, fontSize: "9px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.title}
                        </span>
                        <span style={{ fontSize: "9px", marginLeft: 6, whiteSpace: "nowrap", color: r.severity ? sevColor(r.severity) : S.text }}>
                          {r.severity ? `${r.severity} ` : ""}rel:{r.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No risk signals cover this seismic event location.
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
            /functions/getLiveIntel · /entities/RiskSignal · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
