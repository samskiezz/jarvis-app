/**
 * F183 — Investment × Risk Signal Exposure Tracker (INVRISEX)
 *
 * Parallel-fetches /entities/Investment and /entities/RiskSignal, then
 * keyword-correlates each investment (by name, sector, tags, notes) against
 * active risk signals (by title, category, description, tags) to surface:
 *
 *   EXPOSED — at least one active risk signal keyword-matches this investment
 *   CLEAR   — no active risk signal aligns with this investment
 *
 * Stat tiles: investments / risk signals / exposed / clear
 * Filter tabs: ALL | EXPOSED | CLEAR + text search
 * Expand investment → matched risk signals with severity badge + relevance score.
 * Red badge on exposed count.
 * ▶ ASSESS: 2-sentence portfolio risk brief via /v1/jarvis/agent/chat +
 *   jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ INVRISEX  at bottom:8 left:64040, zIndex:124.
 * Event:   jarvis:invrisex-toggle
 * Voice:   "investment risk / portfolio exposure / invrisex / portfolio risk /
 *           risk exposure / risky investments / exposed investments"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 64040;
const POLL_MS  = 60_000;
const RED      = "#FF4444";
const GREEN    = "#34D399";
const AMBER    = "#F59E0B";
const SLATE    = "#6E8AA0";
const CYAN     = "#29E7FF";
const VIOLET   = "#A78BFA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const INVRISEX_RE =
  /\b(investment\s+risk[s]?|portfolio\s+(risk[s]?|exposure)|invrisex|risk\s+exposure|risky\s+investment[s]?|exposed\s+investment[s]?|portfolio\s+threat[s]?|which\s+investment[s]?\s+(are\s+)?(at\s+risk|exposed)|investment\s+threat[s]?|asset\s+risk[s]?|risk\s+portfolio)\b/i;

export function isInvrisexQuery(q) { return INVRISEX_RE.test(q); }

export async function buildInvrisexScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [invRes, riskRes] = await Promise.all([
      fetch(`${base}/entities/Investment`, { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,  { headers: hdr }),
    ]);
    const investments = normaliseInvestments(await invRes.json());
    const risks       = normaliseRisks(await riskRes.json());

    const exposed = investments.filter(
      (inv) => risks.some((r) => relevance(inv, r) > 0)
    ).length;
    const clear = investments.length - exposed;

    const criticals = risks.filter((r) =>
      ["critical", "high", "severe"].includes(String(r.severity || "").toLowerCase())
    ).length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS investment portfolio risk exposure analysis: ${investments.length} investment positions ` +
          `cross-referenced against ${risks.length} active risk signals (${criticals} critical/high severity). ` +
          `${exposed} positions are exposed to at least one active risk signal; ${clear} positions show ` +
          `no current risk alignment. ` +
          `Provide a 2-sentence portfolio risk exposure brief — formal British butler ` +
          `tone, first person, include recommendation if exposures are critical.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Portfolio risk exposure analysis complete, sir.").trim();
  } catch {
    return "Investment risk exposure assessment unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseInvestments(raw) {
  const arr = Array.isArray(raw)            ? raw
    : Array.isArray(raw?.investments)       ? raw.investments
    : Array.isArray(raw?.items)             ? raw.items
    : Array.isArray(raw?.data)              ? raw.data
    : Array.isArray(raw?.results)           ? raw.results
    : [];
  return arr.map((inv, i) => ({
    id:      inv.id           || inv.investment_id   || String(i),
    name:    inv.name         || inv.title           || inv.asset       || `Investment ${i + 1}`,
    sector:  inv.sector       || inv.category        || inv.type        || "",
    value:   inv.value        || inv.amount          || inv.balance     || null,
    currency: inv.currency    || inv.ccy             || "USD",
    status:  inv.status       || inv.state           || "active",
    tags:    Array.isArray(inv.tags) ? inv.tags.join(" ") : (inv.tags || ""),
    notes:   (inv.notes       || inv.description     || inv.summary     || "").toString().slice(0, 300),
  }));
}

function normaliseRisks(raw) {
  const arr = Array.isArray(raw)            ? raw
    : Array.isArray(raw?.risks)             ? raw.risks
    : Array.isArray(raw?.risk_signals)      ? raw.risk_signals
    : Array.isArray(raw?.items)             ? raw.items
    : Array.isArray(raw?.data)              ? raw.data
    : Array.isArray(raw?.results)           ? raw.results
    : [];
  return arr.map((r, i) => ({
    id:       r.id            || r.risk_id            || String(i),
    title:    r.title         || r.name               || r.label        || `Risk ${i + 1}`,
    severity: r.severity      || r.level              || r.priority     || "medium",
    category: r.category      || r.type               || r.kind         || "",
    tags:     Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags        || ""),
    summary:  (r.description  || r.summary            || r.notes        || "").toString().slice(0, 300),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"'%]+/)
    .filter((w) => w.length >= 3);
}

function relevance(investment, risk) {
  const iw = keywords(
    `${investment.name} ${investment.sector} ${investment.tags} ${investment.notes}`
  );
  const rw = keywords(
    `${risk.title} ${risk.category} ${risk.tags} ${risk.summary}`
  );
  return iw.filter((w) => rw.some((p) => p.includes(w) || w.includes(p))).length;
}

function buildLinked(investments, risks) {
  return investments.map((inv) => {
    const matched = risks
      .map((r) => ({ ...r, score: relevance(inv, r) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...inv, risks: matched, exposed: matched.length > 0 };
  });
}

function severityColor(sev) {
  const lc = String(sev || "").toLowerCase();
  if (lc === "critical" || lc === "severe") return RED;
  if (lc === "high")                         return "#FF8C42";
  if (lc === "medium")                       return AMBER;
  if (lc === "low")                          return GREEN;
  return SLATE;
}

function statusColor(status) {
  const lc = String(status || "").toLowerCase();
  if (lc.includes("active") || lc.includes("open"))   return GREEN;
  if (lc.includes("close") || lc.includes("exit"))    return SLATE;
  if (lc.includes("watch") || lc.includes("review"))  return AMBER;
  return CYAN;
}

function fmtValue(value, currency) {
  if (value == null) return null;
  const n = Number(value);
  if (isNaN(n)) return null;
  if (Math.abs(n) >= 1_000_000) return `${currency} ${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)    return `${currency} ${(n / 1_000).toFixed(1)}K`;
  return `${currency} ${n.toFixed(2)}`;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "EXPOSED", "CLEAR"];

export default function InvestmentRiskExposureTracker() {
  const [open,        setOpen]        = useState(false);
  const [investments, setInvestments] = useState([]);
  const [risks,       setRisks]       = useState([]);
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
      const [invRes, riskRes] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`,  { headers: hdr }),
      ]);
      setInvestments(normaliseInvestments(await invRes.json()));
      setRisks(normaliseRisks(await riskRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:invrisex-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invrisex-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildInvrisexScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked  = buildLinked(investments, risks);
  const exposed = linked.filter((inv) => inv.exposed).length;
  const clear   = linked.length - exposed;

  const displayed = linked.filter((inv) => {
    if (filter === "EXPOSED" && !inv.exposed) return false;
    if (filter === "CLEAR"   && inv.exposed)  return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      inv.name.toLowerCase().includes(q) ||
      inv.sector.toLowerCase().includes(q) ||
      inv.notes.toLowerCase().includes(q)
    );
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Investment × Risk Signal Exposure Tracker (INVRISEX)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 124,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${RED}55`,
          color: RED, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {exposed > 0
          ? <><span style={{ background: RED, color: "#fff", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{exposed}</span>◈ INVRISEX</>
          : "◈ INVRISEX"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 124,
      width: 500, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${RED}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${RED}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${RED}33` }}>
        <span style={{ color: RED, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ INVRISEX</span>
        <span style={{ color: SLATE, fontSize: 9, flex: 1 }}>INVESTMENT × RISK SIGNAL EXPOSURE</span>
        {lastFetch && <span style={{ color: SLATE, fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: RED, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${RED}22` }}>
        {[
          { label: "INVESTMENTS", value: linked.length,   col: SLATE  },
          { label: "RISK SIGNALS", value: risks.length,   col: VIOLET },
          { label: "EXPOSED",      value: exposed,        col: RED    },
          { label: "CLEAR",        value: clear,          col: GREEN  },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: SLATE, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${RED}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${RED}22` : "none",
            border: `1px solid ${filter === t ? RED : SLATE}`,
            color: filter === t ? RED : SLATE,
            borderRadius: 5, padding: "2px 8px", fontSize: 9,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${RED}`,
          color: RED, borderRadius: 5, padding: "2px 8px",
          fontSize: 9, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* investment list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: SLATE, fontSize: 10, textAlign: "center", padding: 20 }}>
            No investments match the current filter.
          </div>
        )}
        {displayed.map((inv) => {
          const isExp   = expanded === inv.id;
          const col     = inv.exposed ? RED : GREEN;
          const badge   = inv.exposed ? "EXPOSED" : "CLEAR";
          const valStr  = fmtValue(inv.value, inv.currency);
          return (
            <div key={inv.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : inv.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${RED}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${inv.exposed ? `${RED}44` : "#6E8AA022"}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col,
                  flexShrink: 0,
                }}>
                  {badge}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{inv.name}</span>
                {inv.sector && (
                  <span style={{
                    fontSize: 8, padding: "1px 5px", borderRadius: 4,
                    background: `${VIOLET}22`, color: VIOLET, letterSpacing: 1,
                  }}>
                    {inv.sector.slice(0, 10).toUpperCase()}
                  </span>
                )}
                {valStr && (
                  <span style={{ fontSize: 8, color: CYAN }}>{valStr}</span>
                )}
                <span style={{
                  fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                  background: `${statusColor(inv.status)}22`, color: statusColor(inv.status),
                  letterSpacing: 1,
                }}>
                  {String(inv.status || "ACTIVE").toUpperCase().slice(0, 8)}
                </span>
                {inv.exposed && (
                  <span style={{ fontSize: 8, color: RED }}>{inv.risks.length} risk{inv.risks.length !== 1 ? "s" : ""}</span>
                )}
                <span style={{ color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${RED}22` }}>
                  {inv.notes && (
                    <div style={{ fontSize: 9, color: SLATE, marginBottom: 6 }}>
                      {inv.notes.slice(0, 120)}
                    </div>
                  )}
                  {inv.risks.length === 0 ? (
                    <div style={{ fontSize: 9, color: GREEN }}>
                      No active risk signals correlate with this investment — portfolio position appears clear.
                    </div>
                  ) : (
                    inv.risks.map((r) => (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: `${severityColor(r.severity)}22`, color: severityColor(r.severity),
                          letterSpacing: 1, flexShrink: 0,
                        }}>
                          {String(r.severity || "MED").toUpperCase().slice(0, 4)}
                        </span>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5" }}>{r.title}</span>
                        {r.category && (
                          <span style={{ fontSize: 8, color: VIOLET }}>{r.category.slice(0, 12)}</span>
                        )}
                        <span style={{ fontSize: 8, color: RED }}>rel:{r.score}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
