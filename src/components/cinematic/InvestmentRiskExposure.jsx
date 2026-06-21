/**
 * F79 — Investment × RiskSignal Exposure
 *
 * Parallel-fetches /entities/Investment + /entities/RiskSignal, then
 * keyword-correlates each investment (name / type / sector / description)
 * against active risk signals to surface EXPOSED vs SAFE holdings.
 *
 * Stat tiles: investments / risks / exposed / safe.
 * Filter tabs: ALL | EXPOSED | SAFE.
 * Expand any investment → matched risk signals with severity badge + score.
 * ▶ ASSESS: sends a 2-sentence AI portfolio-risk brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ INVRSK  at bottom:8 left:10060, zIndex 69.
 * Voice:   "investment risk / portfolio risk / risky investments /
 *           which investments are exposed / invrsk"
 * Event:   jarvis:invrsk-toggle
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 10060;
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

// ── exported intent helpers ──────────────────────────────────────────────────

const INVRSK_RE =
  /\b(investment\s+risk|portfolio\s+risk|risky\s+investments?|which\s+investments?\s+(are\s+)?exposed|exposed\s+investments?|invest(?:ment)?\s+exposure|invrsk)\b/i;

export function isInvrskQuery(q) { return INVRSK_RE.test(q); }

export async function buildInvrskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [iRes, rRes] = await Promise.all([
      fetch(`${base}/entities/Investment`,  { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,  { headers: hdr }),
    ]);
    const iRaw = await iRes.json();
    const rRaw = await rRes.json();
    const investments = normaliseInvestments(iRaw);
    const risks       = normaliseRisks(rRaw);

    const exposed = investments.filter((inv) =>
      risks.some((r) => relevance(inv, r) > 0)
    ).length;
    const safe = investments.length - exposed;

    const topRisk = risks.find((r) => r.severity === "critical") ||
                    risks.find((r) => r.severity === "high") ||
                    risks[0];

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS portfolio-risk correlation: ${investments.length} investments, ` +
          `${risks.length} active risk signals, ${exposed} investments exposed to risk signals, ` +
          `${safe} investments currently safe. ` +
          `${topRisk ? `Highest-severity risk: "${topRisk.name}" (${topRisk.severity}). ` : ""}` +
          `Give a 2-sentence portfolio-risk brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Portfolio risk analysis complete, sir.").trim();
  } catch {
    return "Investment risk correlation unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseInvestments(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.investments)          ? raw.investments
    : Array.isArray(raw?.items)                ? raw.items
    : Array.isArray(raw?.results)              ? raw.results
    : [];
  return arr.map((inv, i) => ({
    id:          inv.id           || String(i),
    name:        inv.name         || inv.ticker   || inv.symbol   || `Investment ${i + 1}`,
    type:        inv.type         || inv.asset_type || inv.category || "",
    sector:      inv.sector       || inv.industry || "",
    description: (inv.description || inv.notes    || inv.details  || "").toString().slice(0, 200),
    value:       inv.value        || inv.amount   || inv.balance  || null,
  }));
}

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function normaliseRisks(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.risks)            ? raw.risks
    : Array.isArray(raw?.signals)          ? raw.signals
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : [];
  return arr
    .map((r, i) => ({
      id:          r.id          || String(i),
      name:        r.name        || r.title       || r.signal     || `Risk ${i + 1}`,
      description: (r.description || r.message   || r.details    || "").toString().slice(0, 300),
      severity:    (r.severity   || r.level       || "low").toLowerCase(),
      category:    r.category    || r.type        || r.asset_class || "",
    }))
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]]+/)
    .filter((w) => w.length >= 3);
}

function relevance(investment, risk) {
  const iw = keywords(`${investment.name} ${investment.type} ${investment.sector} ${investment.description}`);
  const rw = keywords(`${risk.name} ${risk.description} ${risk.category}`);
  return iw.filter((w) => rw.some((r) => r.includes(w) || w.includes(r))).length;
}

function buildCorrelated(investments, risks) {
  return investments.map((inv) => {
    const matched = risks
      .map((r) => ({ ...r, score: relevance(inv, r) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9) || b.score - a.score);
    return { ...inv, risks: matched, exposed: matched.length > 0 };
  });
}

function sevColor(sev) {
  if (sev === "critical") return "#FF3333";
  if (sev === "high")     return "#FF8800";
  if (sev === "medium")   return "#FFD700";
  return "#6B7280";
}

function fmtValue(v) {
  if (v == null) return null;
  const n = Number(v);
  if (isNaN(n)) return String(v);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "EXPOSED", "SAFE"];

export default function InvestmentRiskExposure() {
  const [open,        setOpen]        = useState(false);
  const [investments, setInvestments] = useState([]);
  const [risks,       setRisks]       = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [filter,      setFilter]      = useState("ALL");
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const [lastFetch,   setLastFetch]   = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [iRes, rRes] = await Promise.all([
        fetch(`${base}/entities/Investment`,  { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`,  { headers: hdr }),
      ]);
      const iRaw = await iRes.json();
      const rRaw = await rRes.json();
      setInvestments(normaliseInvestments(iRaw));
      setRisks(normaliseRisks(rRaw));
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
    window.addEventListener("jarvis:invrsk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invrsk-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isInvrskQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated = buildCorrelated(investments, risks);
  const exposed    = correlated.filter((inv) => inv.exposed).length;
  const safe       = correlated.filter((inv) => !inv.exposed).length;

  const visible = correlated.filter((inv) => {
    if (filter === "EXPOSED") return inv.exposed;
    if (filter === "SAFE")    return !inv.exposed;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildInvrskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Investment–Risk Exposure (◈ INVRSK)"
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
        ◈ INVRSK{exposed > 0 && (
          <span style={{
            marginLeft: 4, background: "#FF3333", color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{exposed}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
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
              INVESTMENT–RISK EXPOSURE
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
              { label: "HOLDINGS", val: investments.length, color: C.neon    },
              { label: "RISKS",    val: risks.length,        color: C.blue    },
              { label: "EXPOSED",  val: exposed,             color: "#FF3333" },
              { label: "SAFE",     val: safe,                color: "#4ADE80" },
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

          {/* Investment list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && investments.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No investments match.</div>
            ) : visible.map((inv) => (
              <div key={inv.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${inv.exposed ? "#FF3333" : "#4ADE80"}`,
                  }}
                >
                  <span style={{ color: inv.exposed ? "#FF3333" : "#4ADE80", fontSize: 10, width: 10 }}>
                    {inv.exposed ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {inv.name}
                  </span>
                  {inv.type && (
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${C.blue}22`, color: C.blue,
                      border: `1px solid ${C.blue}44`,
                      maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {inv.type}
                    </span>
                  )}
                  {fmtValue(inv.value) && (
                    <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>
                      {fmtValue(inv.value)}
                    </span>
                  )}
                  <span style={{ color: inv.exposed ? "#FF3333" : "#4ADE80", fontSize: "9px", minWidth: 44, textAlign: "right" }}>
                    {inv.exposed ? `${inv.risks.length} RSK` : "SAFE"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === inv.id ? "▴" : "▾"}</span>
                </div>

                {expanded === inv.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {inv.exposed ? inv.risks.map((r) => (
                      <div key={r.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <span style={{
                          fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                          background: `${sevColor(r.severity)}22`, color: sevColor(r.severity),
                          border: `1px solid ${sevColor(r.severity)}55`,
                          whiteSpace: "nowrap", textTransform: "uppercase",
                        }}>
                          {r.severity}
                        </span>
                        <span style={{ color: S.textHi, fontSize: "9px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.name}
                        </span>
                        {r.category && (
                          <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>
                            {r.category}
                          </span>
                        )}
                        <span style={{ color: C.blue, fontSize: "9px", marginLeft: 2, whiteSpace: "nowrap" }}>
                          rel:{r.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No active risk signals linked to this investment.
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
            /entities/Investment · /entities/RiskSignal · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
