/**
 * F76 — Investment × Investigation Coverage (INVCASE)
 *
 * Parallel-fetches /entities/Investment + /v1/investigations, then
 * keyword-correlates each portfolio position against open cases to classify:
 *   UNDER_INVESTIGATION — at least one investigation references this asset
 *   CLEAN               — no open investigation linked to this investment
 *
 * Stat tiles:  positions / cases / under investigation / clean
 * Filter tabs: ALL | UNDER_INVESTIGATION | CLEAN
 * Text search: across investment name / ticker / description.
 * Expand row → matched investigation cards with status badge + relevance score bar.
 * Amber badge on under-investigation count.
 * ▶ ASSESS: 2-sentence portfolio risk brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ INVCASE  at left:21320 bottom:8, zIndex:79.
 * Event:   jarvis:invcase-toggle
 * Voice:   "investment investigation" / "portfolio case" / "invcase"
 *          / "under investigation" / "portfolio inquiry" / "investment case"
 *          / "which investments are investigated"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 21320;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise ────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseInvestments(raw) {
  return normaliseArray(raw).map((inv, i) => ({
    id:          String(inv.id ?? inv.investment_id ?? i),
    name:        inv.name ?? inv.asset_name ?? inv.ticker ?? inv.symbol ?? `Investment ${i + 1}`,
    ticker:      inv.ticker ?? inv.symbol ?? "",
    description: [inv.description, inv.sector, inv.type, inv.asset_class, inv.notes, inv.tags]
                   .filter(Boolean).join(" "),
    value:       inv.value ?? inv.current_value ?? inv.amount ?? null,
  }));
}

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((inv, i) => ({
    id:     String(inv.id ?? inv.investigation_id ?? i),
    name:   inv.name ?? inv.title ?? inv.subject ?? `Investigation ${i + 1}`,
    status: inv.status ?? inv.state ?? "open",
    body:   [inv.description, inv.details, inv.subject, inv.notes, inv.context, inv.entities]
              .filter(Boolean).join(" ").slice(0, 400),
  }));
}

// ─── keyword scoring ──────────────────────────────────────────────────────────

function buildKeywords(strings) {
  return strings
    .flatMap(s => String(s).toLowerCase().split(/[^a-z0-9]+/))
    .filter(t => t.length >= 3);
}

function scoreMatch(keywords, haystack) {
  const h = String(haystack).toLowerCase();
  return keywords.filter(k => h.includes(k)).length;
}

function correlate(investments, investigations) {
  return investments.map(pos => {
    const posKw = buildKeywords([pos.name, pos.ticker, pos.description]);
    const matches = investigations
      .map(inv => {
        const score = scoreMatch(posKw, `${inv.name} ${inv.body}`);
        return score > 0 ? { ...inv, score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    return { ...pos, matches, status: matches.length > 0 ? "UNDER_INVESTIGATION" : "CLEAN" };
  });
}

// ─── async helpers ────────────────────────────────────────────────────────────

async function fetchJSON(url) {
  const r = await fetch(`${apiBase}${url}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchData() {
  const [rawInv, rawCases] = await Promise.all([
    fetchJSON("/entities/Investment"),
    fetchJSON("/v1/investigations"),
  ]);
  const investments   = normaliseInvestments(rawInv);
  const investigations = normaliseInvestigations(rawCases);
  return correlate(investments, investigations);
}

async function agentBrief(rows) {
  const investigated = rows.filter(r => r.status === "UNDER_INVESTIGATION");
  const total = rows.length;
  const pct = total > 0 ? Math.round((investigated.length / total) * 100) : 0;
  const topNames = investigated.slice(0, 3).map(r => r.name).join(", ") || "none";
  const prompt =
    `Investment portfolio: ${total} positions. ${investigated.length} (${pct}%) ` +
    `are referenced by open investigations (${topNames}). ` +
    `Provide a 2-sentence risk assessment for the portfolio and recommend immediate action.`;
  const r = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ message: prompt }),
  });
  if (!r.ok) throw new Error(`agent HTTP ${r.status}`);
  const j = await r.json();
  return j.response ?? j.message ?? j.text ?? String(j);
}

// ─── voice exports ────────────────────────────────────────────────────────────

const TRIGGERS = [
  "investment investigation", "portfolio case", "invcase",
  "under investigation", "portfolio inquiry", "investment case",
  "which investments are investigated", "investment risk case",
];

export function isInvcaseQuery(q) {
  const lq = String(q).toLowerCase();
  return TRIGGERS.some(t => lq.includes(t));
}

export async function buildInvcaseScript() {
  const rows = await fetchData();
  const investigated = rows.filter(r => r.status === "UNDER_INVESTIGATION");
  const clean = rows.filter(r => r.status === "CLEAN");
  const topNames = investigated.slice(0, 3).map(r => r.name).join(", ") || "none";
  return (
    `Investment investigation coverage: ${rows.length} positions monitored. ` +
    `${investigated.length} under investigation (${topNames}), ` +
    `${clean.length} clean. ` +
    (investigated.length > 0
      ? `Recommend immediate compliance review of flagged positions.`
      : `Portfolio is clear of active investigations.`)
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export default function InvestmentInvestigationCoverage() {
  const [open,     setOpen]     = useState(false);
  const [rows,     setRows]     = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [filter,   setFilter]   = useState("ALL");
  const [query,    setQuery]    = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,    setBrief]    = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setRows(await fetchData());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(v => !v); };
    window.addEventListener("jarvis:invcase-toggle", toggle);
    return () => window.removeEventListener("jarvis:invcase-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const investigated = rows.filter(r => r.status === "UNDER_INVESTIGATION");
  const clean        = rows.filter(r => r.status === "CLEAN");

  const visible = rows
    .filter(r => filter === "ALL" || r.status === filter)
    .filter(r =>
      !query || r.name.toLowerCase().includes(query.toLowerCase()) ||
      r.ticker.toLowerCase().includes(query.toLowerCase()) ||
      r.description.toLowerCase().includes(query.toLowerCase())
    );

  const assess = async () => {
    setAssessing(true); setBrief("");
    try {
      const text = await agentBrief(rows);
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (e) {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  };

  const statusColor = s => s === "UNDER_INVESTIGATION" ? AMBER : GREEN;
  const statusLabel = s => s === "UNDER_INVESTIGATION" ? "UNDER INVESTIGATION" : "CLEAN";

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      style={{
        position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 79,
        background: "rgba(4,7,14,0.88)", border: `1px solid ${CY}44`,
        borderRadius: 6, padding: "4px 10px", cursor: "pointer",
        color: CY, fontFamily: MONO, fontSize: 10, letterSpacing: 2,
        display: "flex", alignItems: "center", gap: 6,
      }}
    >
      ◈ INVCASE
      {investigated.length > 0 && (
        <span style={{ background: AMBER, color: "#000", borderRadius: 9, padding: "0 5px", fontSize: 9 }}>
          {investigated.length}
        </span>
      )}
    </button>
  );

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT, bottom: 48, zIndex: 79,
      width: "min(500px, 92vw)", maxHeight: "78vh",
      background: BG, border: `1px solid ${CY}44`, borderRadius: 12,
      display: "flex", flexDirection: "column", overflow: "hidden",
      boxShadow: `0 0 60px ${CY}14`, fontFamily: MONO,
    }}>
      {/* Header */}
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
        display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
          INVESTMENT × INVESTIGATION
        </span>
        <span style={{ marginLeft: "auto", fontSize: 9, color: MUTED, letterSpacing: 1 }}>
          {loading ? "LOADING…" : `${rows.length} POSITIONS`}
        </span>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 13 }}>
          ✕
        </button>
      </div>

      {/* Stat tiles */}
      {rows.length > 0 && (
        <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${CY}11` }}>
          {[
            { label: "POSITIONS", val: rows.length, col: CY },
            { label: "CASES", val: rows.reduce((s, r) => s + r.matches.length, 0), col: MUTED },
            { label: "INVESTIGATED", val: investigated.length, col: AMBER },
            { label: "CLEAN", val: clean.length, col: GREEN },
          ].map(t => (
            <div key={t.label} style={{ flex: 1, background: "rgba(41,231,255,0.04)",
              borderRadius: 6, padding: "5px 6px", textAlign: "center" }}>
              <div style={{ color: t.col, fontSize: 14, fontWeight: 700 }}>{t.val}</div>
              <div style={{ color: MUTED, fontSize: 8, letterSpacing: 1 }}>{t.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter + search */}
      <div style={{ display: "flex", gap: 6, padding: "6px 14px",
        borderBottom: `1px solid ${CY}11`, flexWrap: "wrap" }}>
        {["ALL", "UNDER_INVESTIGATION", "CLEAN"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              background: filter === f ? `${CY}22` : "transparent",
              border: `1px solid ${filter === f ? CY : CY + "33"}`,
              borderRadius: 4, padding: "2px 8px", color: filter === f ? CY : MUTED,
              fontSize: 9, letterSpacing: 1, cursor: "pointer",
            }}>
            {f === "UNDER_INVESTIGATION" ? "INVESTIGATED" : f}
          </button>
        ))}
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          placeholder="search investments…"
          style={{ marginLeft: "auto", background: "rgba(41,231,255,0.06)",
            border: `1px solid ${CY}22`, borderRadius: 4, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 10, outline: "none", fontFamily: MONO, width: 140 }}
        />
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {error && (
          <div style={{ padding: "12px 14px", color: RED, fontSize: 11 }}>⚠ {error}</div>
        )}
        {!error && visible.length === 0 && !loading && (
          <div style={{ padding: "14px 18px", color: MUTED, fontSize: 11, textAlign: "center" }}>
            No positions
          </div>
        )}
        {visible.map(pos => (
          <div key={pos.id}>
            <div
              onClick={() => setExpanded(expanded === pos.id ? null : pos.id)}
              style={{ padding: "7px 14px", cursor: "pointer", display: "flex",
                alignItems: "center", gap: 8, borderLeft: `2px solid ${statusColor(pos.status)}22`,
                background: expanded === pos.id ? "rgba(41,231,255,0.04)" : "transparent" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%",
                background: statusColor(pos.status), flexShrink: 0,
                boxShadow: pos.status === "UNDER_INVESTIGATION" ? `0 0 6px ${AMBER}` : "none" }} />
              <span style={{ color: "#DCEBF5", fontSize: 12, flex: 1 }}>{pos.name}</span>
              {pos.ticker && (
                <span style={{ color: MUTED, fontSize: 9, letterSpacing: 1 }}>{pos.ticker}</span>
              )}
              <span style={{ color: statusColor(pos.status), fontSize: 9, letterSpacing: 1 }}>
                {statusLabel(pos.status)}
              </span>
              {pos.matches.length > 0 && (
                <span style={{ color: AMBER, fontSize: 9 }}>+{pos.matches.length}</span>
              )}
            </div>
            {expanded === pos.id && pos.matches.length > 0 && (
              <div style={{ paddingLeft: 24, paddingBottom: 6 }}>
                {pos.matches.map(inv => (
                  <div key={inv.id} style={{ padding: "5px 14px 5px 0",
                    borderLeft: `1px solid ${AMBER}33`, marginLeft: 8, paddingLeft: 10,
                    marginBottom: 3 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "#DCEBF5", fontSize: 11 }}>{inv.name}</span>
                      <span style={{ color: MUTED, fontSize: 9, letterSpacing: 1 }}>
                        {inv.status.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ marginTop: 2, background: `${CY}11`, borderRadius: 2, height: 3 }}>
                      <div style={{ height: "100%", borderRadius: 2, background: AMBER,
                        width: `${Math.min(100, inv.score * 20)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: "7px 14px", borderTop: `1px solid ${CY}11`,
        display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={assess} disabled={assessing || rows.length === 0}
          style={{ background: `${CY}15`, border: `1px solid ${CY}44`, borderRadius: 5,
            padding: "3px 10px", color: CY, fontSize: 10, letterSpacing: 1,
            cursor: "pointer", opacity: assessing ? 0.5 : 1 }}>
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>
        {brief && (
          <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, lineHeight: 1.4 }}>
            {brief}
          </span>
        )}
      </div>
    </div>
  );
}
