/**
 * F96 — Ops Event × Risk Signal Correlator
 *
 * Parallel-fetches /v1/ops/events + /entities/RiskSignal, then keyword-correlates
 * each ops event (type / message / service / actor) against active risk signals
 * (title / description / type / tags) to surface:
 *   FLAGGED  — event linked to at least one risk signal (operational corroboration)
 *   ISOLATED — event with no risk signal match (may indicate novel threat or noise)
 *
 * Stat tiles: events / signals / flagged / isolated.
 * Filter tabs: ALL | FLAGGED | ISOLATED.
 * Text search across event messages.
 * Expand any event → matched risk signals with severity badge + relevance score.
 * Red badge on CRITICAL-FLAGGED event count.
 * ▶ ASSESS: 2-sentence AI ops-risk brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ OEVRSK  at bottom:8 left:26720, zIndex 70.
 * Voice:   "ops event risk / event risk signal / which ops events have risks /
 *           flagged events / event risk correlation / oevrsk"
 * Event:   jarvis:oevrsk-toggle
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 26720;
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

// ── exported intent helpers ──────────────────────────────────────────────────

const OEVRSK_RE =
  /\b(ops\s+event\s+risk|event\s+risk\s+(signal|correlation)|which\s+ops\s+events?\s+(have|has)\s+risks?|flagged\s+events?|event\s+risk\s+correl|oevrsk)\b/i;

export function isOevrskQuery(q) { return OEVRSK_RE.test(q); }

export async function buildOevrskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [evRes, rsRes] = await Promise.all([
      fetch(`${base}/v1/ops/events`,          { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,    { headers: hdr }),
    ]);
    const evRaw = await evRes.json();
    const rsRaw = await rsRes.json();
    const events  = normaliseEvents(evRaw);
    const signals = normaliseSignals(rsRaw);

    const flagged  = events.filter((ev) => signals.some((rs) => relevance(ev, rs) > 0)).length;
    const isolated = events.length - flagged;
    const critFlag = events.filter(
      (ev) =>
        (ev.severity || "").toLowerCase() === "critical" &&
        signals.some((rs) => relevance(ev, rs) > 0)
    ).length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS ops-risk correlation analysis: ${events.length} recent ops events examined against ` +
          `${signals.length} active risk signals. ${flagged} events are FLAGGED (corroborated by at ` +
          `least one risk signal), ${isolated} are ISOLATED (no risk-signal match), ` +
          `${critFlag} CRITICAL events have direct risk signal correlation. ` +
          `Give a 2-sentence ops-risk intelligence brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Ops-risk correlation analysis complete, sir.").trim();
  } catch {
    return "Ops-risk correlation analysis unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function normaliseEvents(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.events)          ? raw.events
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : [];
  return arr
    .map((ev, i) => ({
      id:        ev.id          || String(i),
      message:   ev.message     || ev.title    || ev.description || ev.msg   || `Event ${i + 1}`,
      severity:  (ev.severity   || ev.level    || ev.type        || "info").toLowerCase(),
      service:   ev.service     || ev.source   || ev.actor       || ev.component || "",
      eventType: ev.event_type  || ev.type     || ev.kind        || "",
      ts:        ev.timestamp   || ev.created_at || ev.time      || null,
    }))
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
}

function normaliseSignals(raw) {
  const arr = Array.isArray(raw)                 ? raw
    : Array.isArray(raw?.data)                   ? raw.data
    : Array.isArray(raw?.risk_signals)           ? raw.risk_signals
    : Array.isArray(raw?.signals)                ? raw.signals
    : Array.isArray(raw?.items)                  ? raw.items
    : Array.isArray(raw?.results)                ? raw.results
    : [];
  return arr.map((s, i) => ({
    id:          s.id           || String(i),
    title:       s.title        || s.name         || s.signal_name || `Signal ${i + 1}`,
    description: (s.description || s.summary      || s.body        || "").toString().slice(0, 200),
    severity:    (s.severity    || s.level         || s.risk_level  || "low").toLowerCase(),
    type:        s.type         || s.category      || s.signal_type || "",
    tags:        Array.isArray(s.tags) ? s.tags.join(" ") : (s.tags || ""),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]]+/)
    .filter((w) => w.length >= 3);
}

function relevance(event, signal) {
  const ew = keywords(`${event.message} ${event.service} ${event.eventType}`);
  const sw = keywords(`${signal.title} ${signal.description} ${signal.type} ${signal.tags}`);
  return ew.filter((w) => sw.some((s) => s.includes(w) || w.includes(s))).length;
}

function buildCorrelated(events, signals) {
  return events.map((ev) => {
    const matched = signals
      .map((rs) => ({ ...rs, score: relevance(ev, rs) }))
      .filter((rs) => rs.score > 0)
      .sort((a, b) => {
        const sevDiff = (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9);
        return sevDiff !== 0 ? sevDiff : b.score - a.score;
      });
    return { ...ev, signals: matched, flagged: matched.length > 0 };
  });
}

function sevColor(sev) {
  if (sev === "critical") return "#FF3333";
  if (sev === "high")     return "#FF8800";
  if (sev === "medium")   return "#FFD700";
  if (sev === "info")     return "#60A5FA";
  return "#6B7280";
}

function relTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60)   return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "FLAGGED", "ISOLATED"];

export default function OpsEventRiskCorrelator() {
  const [open,      setOpen]      = useState(false);
  const [events,    setEvents]    = useState([]);
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
      const [evRes, rsRes] = await Promise.all([
        fetch(`${base}/v1/ops/events`,         { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`,   { headers: hdr }),
      ]);
      const evRaw = await evRes.json();
      const rsRaw = await rsRes.json();
      setEvents(normaliseEvents(evRaw));
      setSignals(normaliseSignals(rsRaw));
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
    window.addEventListener("jarvis:oevrsk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:oevrsk-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isOevrskQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated = buildCorrelated(events, signals);
  const flagged    = correlated.filter((ev) => ev.flagged).length;
  const isolated   = correlated.filter((ev) => !ev.flagged).length;
  const critFlag   = correlated.filter(
    (ev) => ev.flagged && ev.severity === "critical"
  ).length;

  const sq = search.toLowerCase();
  const visible = correlated.filter((ev) => {
    if (filter === "FLAGGED"  && !ev.flagged)  return false;
    if (filter === "ISOLATED" &&  ev.flagged)  return false;
    if (sq && !ev.message.toLowerCase().includes(sq) &&
              !ev.service.toLowerCase().includes(sq))  return false;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildOevrskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Ops Event–Risk Correlator (◈ OEVRSK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 70,
          background: open ? "rgba(255,51,51,0.15)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? "#FF3333" : S.border}`,
          borderRadius: S.radius, color: open ? "#FF3333" : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? "0 0 8px #FF333344" : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ OEVRSK{critFlag > 0 && (
          <span style={{
            marginLeft: 4, background: "#FF3333", color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{critFlag}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 69,
          bottom: 36, left: Math.max(8, BTN_LEFT - 300),
          width: 380,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: "2px solid #FF3333",
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "72vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: "#FF3333", letterSpacing: 2, fontWeight: 700 }}>
              OPS EVENT–RISK CORRELATOR
            </span>
            <button
              onClick={assess}
              disabled={assessing || events.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || events.length === 0) ? 0.4 : 1,
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
              { label: "EVENTS",   val: events.length,  color: C.neon    },
              { label: "SIGNALS",  val: signals.length, color: C.blue    },
              { label: "FLAGGED",  val: flagged,         color: "#FF8800" },
              { label: "ISOLATED", val: isolated,        color: "#6B7280" },
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
              <button key={t} onClick={() => { setFilter(t); setExpanded(null); }} style={{
                flex: 1, background: filter === t ? "#FF333322" : "transparent",
                border: `1px solid ${filter === t ? "#FF3333" : S.border}`,
                color: filter === t ? "#FF3333" : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 12px 6px" }}>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setExpanded(null); }}
              placeholder="search events…"
              style={{
                width: "100%", background: "rgba(0,0,0,0.3)",
                border: `1px solid ${S.border}`, borderRadius: S.radius,
                color: S.textHi, fontFamily: S.mono, fontSize: S.fs.xxs,
                padding: "4px 8px", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Event list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && events.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No events match.</div>
            ) : visible.map((ev) => (
              <div key={ev.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${ev.flagged ? sevColor(ev.severity) : "#6B7280"}`,
                  }}
                >
                  <span style={{
                    fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                    background: `${sevColor(ev.severity)}22`, color: sevColor(ev.severity),
                    border: `1px solid ${sevColor(ev.severity)}55`,
                    whiteSpace: "nowrap", textTransform: "uppercase", flexShrink: 0,
                  }}>
                    {ev.severity || "INFO"}
                  </span>
                  <span style={{
                    flex: 1, color: S.textHi,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    fontSize: "9px",
                  }}>
                    {ev.message}
                  </span>
                  {ev.ts && (
                    <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {relTime(ev.ts)}
                    </span>
                  )}
                  <span style={{
                    color: ev.flagged ? "#FF8800" : "#6B7280",
                    fontSize: "9px", minWidth: 48, textAlign: "right",
                    whiteSpace: "nowrap", flexShrink: 0,
                  }}>
                    {ev.flagged ? `${ev.signals.length} RSK` : "SOLO"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9, flexShrink: 0 }}>
                    {expanded === ev.id ? "▴" : "▾"}
                  </span>
                </div>

                {expanded === ev.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {ev.service && (
                      <div style={{ color: S.text, fontSize: "8px", marginBottom: 4 }}>
                        service: <span style={{ color: C.neon }}>{ev.service}</span>
                      </div>
                    )}
                    {ev.flagged ? ev.signals.map((rs) => (
                      <div key={rs.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <span style={{
                          fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                          background: `${sevColor(rs.severity)}22`, color: sevColor(rs.severity),
                          border: `1px solid ${sevColor(rs.severity)}55`,
                          whiteSpace: "nowrap", textTransform: "uppercase", flexShrink: 0,
                        }}>
                          {rs.severity || "LOW"}
                        </span>
                        <span style={{
                          color: S.textHi, fontSize: "9px", flex: 1,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {rs.title}
                        </span>
                        <span style={{ color: C.blue, fontSize: "9px", whiteSpace: "nowrap" }}>
                          rel:{rs.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: "#6B7280", fontSize: "9px", padding: "2px 0" }}>
                        No matching risk signals — isolated event.
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
            /v1/ops/events · /entities/RiskSignal · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
