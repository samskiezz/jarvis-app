/**
 * F56 — Decision Ledger Browser
 *
 * Fetches /v1/decision/list → scrollable log of recorded decisions with
 * title / reason / risks / alternatives columns.  Click ▶ ASSESS on any
 * decision → /v1/jarvis/agent/chat 2-sentence strategic commentary + TTS
 * via jarvis:speak-dossier.
 *
 * Toggle:  ◈ DECIS  at bottom:8 left:12140, zIndex 69.
 * Voice:   "decision ledger / decisions / decision log / decis"
 * Event:   jarvis:decis-toggle
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 12140;
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

// ── exported intent helpers ────────────────────────────────────────────────────

const DECIS_RE =
  /\b(decision[\s-]+ledger|decision[\s-]+log|decisions?|decis|logged[\s-]+decision|past[\s-]+decision|decision[\s-]+record|decision[\s-]+vault)\b/i;

export function isDecisQuery(q) { return DECIS_RE.test(q); }

export async function buildDecisScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const res  = await fetch(`${base}/v1/decision/list`, { headers: hdr });
    const data = await res.json();
    const items = normalise(data);
    const risky = items.filter((d) => d.risks.length > 0).length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS decision ledger status: ${items.length} recorded decisions on file, ` +
          `${risky} carry documented risks, ${items.length - risky} are clean decisions. ` +
          `Deliver a 2-sentence strategic decision-health brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Decision ledger reviewed, sir.").trim();
  } catch {
    return "The decision ledger is unavailable at this time, sir.";
  }
}

// ── normalise ─────────────────────────────────────────────────────────────────

function normalise(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.decisions)       ? raw.decisions
    : Array.isArray(raw?.data)            ? raw.data
    : [];
  return arr.slice(0, 60).map((d, i) => ({
    id:          d.id           || String(i),
    title:       d.title        || d.name || `Decision ${i + 1}`,
    reason:      d.reason       || d.rationale || "",
    risks:       Array.isArray(d.risks)        ? d.risks        : [],
    alternatives:Array.isArray(d.alternatives) ? d.alternatives : [],
    rejected:    Array.isArray(d.rejected)     ? d.rejected     : [],
    expected:    d.expected_outcome || d.outcome || "",
    status:      (d.status      || d.state || "").toLowerCase(),
    created_at:  d.created_at   || d.ts || null,
  }));
}

function fmtDate(ts) {
  if (!ts) return "";
  try { return new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }); }
  catch { return ""; }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function DecisionLedgerBrowser() {
  const [open,      setOpen]      = useState(false);
  const [decisions, setDecisions] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef  = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${apiBase()}/v1/decision/list`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      const data = await res.json();
      setDecisions(normalise(data));
      setLastFetch(new Date());
    } catch {
      /* keep stale */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:decis-toggle", toggle);
    return () => window.removeEventListener("jarvis:decis-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess(d) {
    setAssessing(d.id);
    try {
      const body = {
        message:
          `JARVIS, assess this recorded decision: "${d.title}". ` +
          `Reason given: "${d.reason || "none"}". ` +
          `Documented risks: ${d.risks.length ? d.risks.join("; ") : "none"}. ` +
          `Alternatives considered: ${d.alternatives.length ? d.alternatives.join("; ") : "none"}. ` +
          `Deliver a 2-sentence strategic assessment of this decision — formal British butler tone, first person.`,
      };
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      const answer = (data.answer || "Assessment unavailable, sir.").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Decision assessment is offline, sir." },
      }));
    } finally {
      setAssessing(null);
    }
  }

  const riskyCount = decisions.filter((d) => d.risks.length > 0).length;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("jarvis:decis-toggle"))}
        title="Decision Ledger Browser"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? `${C.gold}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${open ? C.gold : S.border}`,
          color: open ? C.gold : S.text,
          fontFamily: S.mono, fontSize: S.fs.xs, letterSpacing: 1,
          padding: "3px 8px", borderRadius: S.radius, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ DECIS
        {riskyCount > 0 && (
          <span style={{
            marginLeft: 5,
            background: "#F97316",
            color: "#000",
            borderRadius: 6,
            fontSize: "7px",
            padding: "1px 4px",
            fontWeight: 700,
          }}>{riskyCount}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: BTN_LEFT - 320, zIndex: 69,
          width: 380, maxHeight: 500,
          background: "rgba(8,14,22,0.95)", border: `1px solid ${C.gold}44`,
          borderRadius: 12, display: "flex", flexDirection: "column",
          fontFamily: S.mono, backdropFilter: "blur(10px)",
          boxShadow: `0 0 40px ${C.gold}22`,
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px 8px",
            borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: C.gold, fontSize: S.fs.sm, letterSpacing: 2, fontWeight: 700 }}>
              DECISION LEDGER
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: S.text, cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>

          {/* Stats row */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3,1fr)",
            gap: 6, padding: "8px 12px",
          }}>
            {[
              { label: "DECISIONS", val: decisions.length, color: C.gold  },
              { label: "W/ RISKS",  val: riskyCount,       color: "#F97316" },
              { label: "CLEAN",     val: decisions.length - riskyCount, color: C.neon },
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

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && decisions.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : decisions.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No decisions recorded yet.</div>
            ) : decisions.map((d) => (
              <div key={d.id} style={{ marginBottom: 6 }}>
                {/* Row header */}
                <div
                  onClick={() => setExpanded(expanded === d.id ? null : d.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${d.risks.length > 0 ? "#F97316" : C.gold}`,
                  }}
                >
                  <span style={{ color: d.risks.length > 0 ? "#F97316" : C.gold, fontSize: 10, width: 10 }}>
                    {d.risks.length > 0 ? "⚠" : "●"}
                  </span>
                  <span style={{
                    flex: 1, color: S.textHi, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "9px",
                  }}>
                    {d.title}
                  </span>
                  {d.created_at && (
                    <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>
                      {fmtDate(d.created_at)}
                    </span>
                  )}
                  {d.risks.length > 0 && (
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      color: "#F97316", border: "1px solid #F9731644", whiteSpace: "nowrap",
                    }}>
                      {d.risks.length} RSK
                    </span>
                  )}
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === d.id ? "▴" : "▾"}</span>
                </div>

                {/* Expanded detail */}
                {expanded === d.id && (
                  <div style={{
                    margin: "2px 0 2px 14px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "6px 8px",
                  }}>
                    {d.reason && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ color: C.gold, fontSize: "8px", letterSpacing: 1, marginBottom: 2 }}>REASON</div>
                        <div style={{ color: S.textHi, fontSize: "9px", lineHeight: 1.4 }}>{d.reason}</div>
                      </div>
                    )}
                    {d.expected && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ color: C.neon, fontSize: "8px", letterSpacing: 1, marginBottom: 2 }}>EXPECTED OUTCOME</div>
                        <div style={{ color: S.textHi, fontSize: "9px", lineHeight: 1.4 }}>{d.expected}</div>
                      </div>
                    )}
                    {d.risks.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ color: "#F97316", fontSize: "8px", letterSpacing: 1, marginBottom: 2 }}>RISKS</div>
                        {d.risks.map((r, i) => (
                          <div key={i} style={{
                            color: S.textHi, fontSize: "9px", lineHeight: 1.4,
                            padding: "1px 0", borderBottom: `1px solid ${S.border}22`,
                          }}>• {r}</div>
                        ))}
                      </div>
                    )}
                    {d.alternatives.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ color: C.blue, fontSize: "8px", letterSpacing: 1, marginBottom: 2 }}>ALTERNATIVES CONSIDERED</div>
                        {d.alternatives.map((a, i) => (
                          <div key={i} style={{ color: S.textHi, fontSize: "9px", lineHeight: 1.4 }}>• {a}</div>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); assess(d); }}
                      disabled={assessing === d.id}
                      style={{
                        marginTop: 4, padding: "3px 10px",
                        background: assessing === d.id ? `${C.gold}22` : "transparent",
                        border: `1px solid ${C.gold}`,
                        color: C.gold, borderRadius: 4, cursor: "pointer",
                        fontFamily: S.mono, fontSize: "8px", letterSpacing: 1,
                      }}
                    >
                      {assessing === d.id ? "▸ ANALYSING…" : "▶ ASSESS"}
                    </button>
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
            /v1/decision/list · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
