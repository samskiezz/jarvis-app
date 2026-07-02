/**
 * F105 — Investment × Decision Alignment Tracker
 *
 * Parallel-fetches /entities/Investment + /v1/decision/list, then
 * keyword-correlates each portfolio holding against recorded strategic
 * decisions to surface DECISION-BACKED holdings (at least one strategic
 * rationale on record) vs SPECULATIVE (no decision backing found).
 *
 * Stat tiles: investments / decisions / backed / speculative.
 * Filter tabs: ALL | BACKED | SPECULATIVE.
 * Expand any holding → matched decisions with rationale snippet + relevance score.
 * ▶ ASSESS: sends a 2-sentence AI portfolio-strategy brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ INVDEC  at bottom:8 left:29560, zIndex 60.
 * Voice:   "investment decision / portfolio decision / decision investment / invdec"
 * Event:   jarvis:invdec-toggle
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 29560;
const POLL_MS  = 90_000;

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

const INVDEC_RE =
  /\b(investment[\s-]decision|portfolio[\s-]decision|decision[\s-]investment|invdec|decision[\s-]backed[\s-]holding|speculative[\s-]holding|which[\s-]investments[\s-]have[\s-]decisions?)\b/i;

export function isInvdecQuery(q) { return INVDEC_RE.test(q); }

export async function buildInvdecScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [invRes, decRes] = await Promise.all([
      fetch(`${base}/entities/Investment`, { headers: hdr }),
      fetch(`${base}/v1/decision/list`,    { headers: hdr }),
    ]);
    const invRaw = await invRes.json();
    const decRaw = await decRes.json();
    const investments = normaliseInvestments(invRaw);
    const decisions   = normaliseDecisions(decRaw);

    const backed     = investments.filter((inv) => decisions.some((d) => relevance(inv, d) > 0)).length;
    const speculative = investments.length - backed;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS investment-decision alignment: ${investments.length} holdings, ` +
          `${decisions.length} recorded decisions, ${backed} decision-backed, ` +
          `${speculative} speculative (no decision on record). ` +
          `Give a 2-sentence portfolio-strategy brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Investment-decision alignment analysis complete, sir.").trim();
  } catch {
    return "Investment-decision alignment analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseInvestments(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.investments)        ? raw.investments
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((inv, i) => ({
    id:     inv.id      || String(i),
    name:   inv.name    || inv.title || inv.symbol || `Holding ${i + 1}`,
    type:   (inv.type   || inv.asset_type || inv.category || "").toString(),
    sector: (inv.sector || inv.industry   || "").toString(),
    desc:   (inv.description || inv.notes || inv.memo || "").toString(),
  }));
}

function normaliseDecisions(raw) {
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.data)              ? raw.data
    : Array.isArray(raw?.decisions)         ? raw.decisions
    : Array.isArray(raw?.items)             ? raw.items
    : Array.isArray(raw?.results)           ? raw.results
    : [];
  return arr.map((d, i) => ({
    id:       d.id             || String(i),
    title:    d.title          || d.name   || d.decision || `Decision ${i + 1}`,
    reason:   (d.reason        || d.rationale || d.justification || "").toString(),
    outcome:  (d.expected_outcome || d.outcome || d.expected || "").toString(),
    alts:     (d.alternatives  || d.options || "").toString(),
    risks:    (d.risks         || "").toString(),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()]+/)
    .filter((w) => w.length >= 3);
}

function relevance(inv, dec) {
  const iw = keywords(`${inv.name} ${inv.type} ${inv.sector} ${inv.desc}`);
  const dw = keywords(`${dec.title} ${dec.reason} ${dec.outcome} ${dec.alts} ${dec.risks}`);
  return iw.filter((w) => dw.some((r) => r.includes(w) || w.includes(r))).length;
}

function buildCorrelated(investments, decisions) {
  return investments.map((inv) => {
    const matched = decisions
      .map((d) => ({ ...d, score: relevance(inv, d) }))
      .filter((d) => d.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...inv, decisions: matched, backed: matched.length > 0 };
  });
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "BACKED", "SPECULATIVE"];

export default function InvestmentDecisionAligner() {
  const [open,        setOpen]        = useState(false);
  const [investments, setInvestments] = useState([]);
  const [decisions,   setDecisions]   = useState([]);
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
      const [invRes, decRes] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers: hdr }),
        fetch(`${base}/v1/decision/list`,    { headers: hdr }),
      ]);
      setInvestments(normaliseInvestments(await invRes.json()));
      setDecisions(normaliseDecisions(await decRes.json()));
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
    window.addEventListener("jarvis:invdec-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invdec-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isInvdecQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated   = buildCorrelated(investments, decisions);
  const backedCount  = correlated.filter((inv) => inv.backed).length;
  const specCount    = correlated.filter((inv) => !inv.backed).length;

  const sq = search.toLowerCase();
  const visible = correlated.filter((inv) => {
    if (filter === "BACKED")     return inv.backed;
    if (filter === "SPECULATIVE") return !inv.backed;
    return true;
  }).filter((inv) =>
    !sq || inv.name.toLowerCase().includes(sq) ||
    inv.type.toLowerCase().includes(sq) ||
    inv.sector.toLowerCase().includes(sq)
  );

  async function assess() {
    setAssessing(true);
    const text = await buildInvdecScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Investment-Decision Aligner (◈ INVDEC)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 60,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ INVDEC{specCount > 0 && (
          <span style={{
            marginLeft: 4, background: "#F59E0B", color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{specCount}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 59,
          bottom: 36, left: Math.max(8, BTN_LEFT - 260),
          width: 340,
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
              INVESTMENT–DECISION ALIGNER
            </span>
            <button
              onClick={assess}
              disabled={assessing || investments.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || investments.length === 0) ? 0.4 : 1,
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
              { label: "HOLDINGS",   val: investments.length, color: C.blue    },
              { label: "DECISIONS",  val: decisions.length,   color: C.neon    },
              { label: "BACKED",     val: backedCount,        color: "#4ADE80" },
              { label: "SPEC",       val: specCount,          color: "#F59E0B" },
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

          {/* Search */}
          <div style={{ padding: "0 12px 6px" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="filter holdings…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.3)", border: `1px solid ${S.border}`,
                borderRadius: S.radius, color: S.textHi,
                fontFamily: S.mono, fontSize: S.fs.xs,
                padding: "3px 8px", outline: "none",
              }}
            />
          </div>

          {/* Holding list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && investments.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No holdings match.</div>
            ) : visible.map((inv) => (
              <div key={inv.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${inv.backed ? "#4ADE80" : "#F59E0B"}`,
                  }}
                >
                  <span style={{ color: inv.backed ? "#4ADE80" : "#F59E0B", fontSize: 10, width: 10 }}>
                    {inv.backed ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {inv.name}
                  </span>
                  {inv.type && (
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${C.blue}22`, color: C.blue,
                      border: `1px solid ${C.blue}44`, whiteSpace: "nowrap",
                    }}>
                      {inv.type}
                    </span>
                  )}
                  <span style={{ color: inv.backed ? "#4ADE80" : "#F59E0B", fontSize: "9px", minWidth: 50, textAlign: "right" }}>
                    {inv.backed ? `${inv.decisions.length} DEC` : "SPEC"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === inv.id ? "▴" : "▾"}</span>
                </div>

                {expanded === inv.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {inv.backed ? inv.decisions.map((d) => (
                      <div key={d.id} style={{
                        padding: "3px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <div style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                        }}>
                          <span style={{ color: S.textHi, fontSize: "9px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {d.title}
                          </span>
                          <span style={{ fontSize: "9px", marginLeft: 6, whiteSpace: "nowrap", color: S.text }}>
                            rel:{d.score}
                          </span>
                        </div>
                        {d.reason && (
                          <div style={{ color: S.text, fontSize: "8px", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {d.reason.slice(0, 80)}{d.reason.length > 80 ? "…" : ""}
                          </div>
                        )}
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No matching strategic decisions found for this holding.
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
            /entities/Investment · /v1/decision/list · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
