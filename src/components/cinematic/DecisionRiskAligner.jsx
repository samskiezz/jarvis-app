/**
 * F90 — Decision × Risk Signal Aligner
 *
 * Parallel-fetches /v1/decision/list + /entities/RiskSignal, then
 * keyword-correlates each strategic decision (title/reason/risks/alternatives/
 * expected_outcome) against active risk signals (title/description/type/tags)
 * to surface RISK-AWARE decisions (at least one corroborating signal) vs BLIND
 * decisions (no risk-signal evidence backing them).
 *
 * Stat tiles: decisions / signals / risk-aware / blind.
 * Filter tabs: ALL | RISK-AWARE | BLIND + text search.
 * Expand any decision → matched signals with severity badge + relevance score.
 * Amber badge on blind-decision count.
 * ▶ ASSESS: /v1/jarvis/agent/chat 2-sentence strategic risk-alignment brief
 *   + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ DECRSK  at bottom:8 left:23920, zIndex 69.
 * Event:   jarvis:decrsk-toggle
 * Voice:   "decision risk / risky decisions / risk-aware decisions /
 *           decision risk alignment / blind decisions / decrsk"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 23920;
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

const DECRSK_RE =
  /\b(decision\s+risk|risky\s+decisions?|risk[\s-]aware\s+decisions?|blind\s+decisions?|decision\s+risk\s+alignment|decrsk)\b/i;

export function isDecrskQuery(q) { return DECRSK_RE.test(q); }

export async function buildDecrskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [dRes, sRes] = await Promise.all([
      fetch(`${base}/v1/decision/list`,    { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
    ]);
    const dRaw = await dRes.json();
    const sRaw = await sRes.json();
    const decisions = normaliseDecisions(dRaw);
    const signals   = normaliseSignals(sRaw);

    const riskAware = decisions.filter((d) =>
      signals.some((s) => relevance(d, s) > 0)
    ).length;
    const blind = decisions.length - riskAware;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS strategic alignment status: ${decisions.length} recorded decisions, ` +
          `${signals.length} active risk signals on file, ${riskAware} decisions are corroborated ` +
          `by at least one risk signal, ${blind} decisions have no risk-signal evidence backing them. ` +
          `Give a 2-sentence strategic risk-alignment brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Strategic risk alignment assessment complete, sir.").trim();
  } catch {
    return "Decision–risk signal alignment unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseDecisions(raw) {
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.decisions)          ? raw.decisions
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((d, i) => ({
    id:              d.id               || String(i),
    title:           d.title            || d.name       || d.decision || `Decision ${i + 1}`,
    reason:          (d.reason          || d.rationale  || d.justification || "").toString().slice(0, 300),
    risks:           (d.risks           || d.risk_notes || d.risk_factors   || "").toString().slice(0, 200),
    alternatives:    (d.alternatives    || d.options    || "").toString().slice(0, 200),
    expectedOutcome: (d.expected_outcome || d.outcome   || d.impact         || "").toString().slice(0, 200),
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
    title:       s.title         || s.name        || `Signal ${i + 1}`,
    description: (s.description  || s.details     || s.summary || "").toString().slice(0, 200),
    type:        s.type          || s.signal_type  || s.category || "",
    severity:    (s.severity     || s.level        || "").toUpperCase(),
    tags:        Array.isArray(s.tags) ? s.tags.join(" ") : (s.tags || s.tag || ""),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]]+/)
    .filter((w) => w.length >= 3);
}

function relevance(decision, signal) {
  const dw = keywords(
    `${decision.title} ${decision.reason} ${decision.risks} ${decision.alternatives} ${decision.expectedOutcome}`
  );
  const sw = keywords(`${signal.title} ${signal.description} ${signal.type} ${signal.tags}`);
  return dw.filter((w) => sw.some((s) => s.includes(w) || w.includes(s))).length;
}

function buildCorrelated(decisions, signals) {
  return decisions.map((dec) => {
    const matched = signals
      .map((s) => ({ ...s, score: relevance(dec, s) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...dec, signals: matched, riskAware: matched.length > 0 };
  });
}

const SEVERITY_COLOR = {
  CRITICAL: "#FF4444",
  HIGH:     "#FF8800",
  MEDIUM:   "#F0B429",
  LOW:      "#4ADE80",
};

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "RISK-AWARE", "BLIND"];

export default function DecisionRiskAligner() {
  const [open,      setOpen]      = useState(false);
  const [decisions, setDecisions] = useState([]);
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
      const [dRes, sRes] = await Promise.all([
        fetch(`${base}/v1/decision/list`,    { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
      ]);
      const dRaw = await dRes.json();
      const sRaw = await sRes.json();
      setDecisions(normaliseDecisions(dRaw));
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
    window.addEventListener("jarvis:decrsk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:decrsk-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isDecrskQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated = buildCorrelated(decisions, signals);
  const riskAware  = correlated.filter((d) =>  d.riskAware).length;
  const blind      = correlated.filter((d) => !d.riskAware).length;

  const sq = search.toLowerCase();
  const visible = correlated.filter((dec) => {
    if (filter === "RISK-AWARE" && !dec.riskAware) return false;
    if (filter === "BLIND"      &&  dec.riskAware) return false;
    if (sq && !`${dec.title} ${dec.reason}`.toLowerCase().includes(sq)) return false;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildDecrskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Decision–Risk Aligner (◈ DECRSK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? "rgba(255,68,68,0.15)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? "#FF8800" : S.border}`,
          borderRadius: S.radius, color: open ? "#FF8800" : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? "0 0 8px #FF880044" : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ DECRSK{blind > 0 && (
          <span style={{
            marginLeft: 4, background: "#FF8800", color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{blind}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 260),
          width: 340,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: "2px solid #FF8800",
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
            <span style={{ color: "#FF8800", letterSpacing: 2, fontWeight: 700 }}>
              DECISION–RISK ALIGNER
            </span>
            <button
              onClick={assess}
              disabled={assessing || decisions.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || decisions.length === 0) ? 0.4 : 1,
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
              { label: "DECISIONS",  val: decisions.length, color: C.blue    },
              { label: "SIGNALS",    val: signals.length,   color: C.neon    },
              { label: "RISK-AWARE", val: riskAware,        color: "#4ADE80" },
              { label: "BLIND",      val: blind,            color: "#FF8800" },
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
                flex: 1, background: filter === t ? "rgba(255,136,0,0.18)" : "transparent",
                border: `1px solid ${filter === t ? "#FF8800" : S.border}`,
                color: filter === t ? "#FF8800" : S.text,
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
              placeholder="Search decisions…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.3)", border: `1px solid ${S.border}`,
                borderRadius: S.radius, color: S.textHi,
                fontFamily: S.mono, fontSize: S.fs.xxs, padding: "4px 8px",
                outline: "none",
              }}
            />
          </div>

          {/* Decision list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && decisions.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No decisions match.</div>
            ) : visible.map((dec) => (
              <div key={dec.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === dec.id ? null : dec.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${dec.riskAware ? "#4ADE80" : "#FF8800"}`,
                  }}
                >
                  <span style={{ color: dec.riskAware ? "#4ADE80" : "#FF8800", fontSize: 10, width: 10 }}>
                    {dec.riskAware ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {dec.title}
                  </span>
                  <span style={{ color: dec.riskAware ? "#4ADE80" : "#FF8800", fontSize: "9px", minWidth: 52, textAlign: "right" }}>
                    {dec.riskAware ? `${dec.signals.length} SIG` : "BLIND"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === dec.id ? "▴" : "▾"}</span>
                </div>

                {expanded === dec.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {dec.reason && (
                      <div style={{ color: S.text, fontSize: "9px", marginBottom: 4, fontStyle: "italic" }}>
                        {dec.reason.slice(0, 120)}{dec.reason.length > 120 ? "…" : ""}
                      </div>
                    )}
                    {dec.riskAware ? dec.signals.map((sig) => {
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
                        No active risk signals corroborate this decision — strategic blind spot.
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
            /v1/decision/list · /entities/RiskSignal · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
