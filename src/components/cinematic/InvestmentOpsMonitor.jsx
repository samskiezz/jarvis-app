import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const RED    = "#FF3D5A";
const BTN_LEFT   = 50280;
const REFRESH_MS = 60 * 1000;
const API_KEY    = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── normalisation helpers ────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") {
    const first = Object.values(raw).find(Array.isArray);
    if (first) return first;
  }
  return [];
}

function normaliseInvestments(raw) {
  return normaliseArray(raw).map((r) => ({
    id:          r.id || r._id || String(Math.random()),
    name:        r.name || r.title || r.symbol || r.ticker || "Unnamed",
    type:        r.type || r.asset_type || r.category || "",
    sector:      r.sector || r.industry || "",
    description: r.description || r.notes || r.summary || "",
    ticker:      r.ticker || r.symbol || r.code || "",
    tags:        Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags || ""),
    value:       r.value || r.amount || r.current_value || null,
  }));
}

function normaliseOpsEvents(raw) {
  return normaliseArray(raw).map((r) => ({
    id:       r.id || r._id || String(Math.random()),
    title:    r.title || r.name || r.type || r.message || "Unnamed Event",
    type:     r.type || r.event_type || r.category || "",
    severity: r.severity || r.level || r.priority || "medium",
    service:  r.service || r.source || r.actor || r.system || "",
    message:  r.message || r.description || r.details || r.summary || "",
    status:   r.status || r.state || "active",
    tags:     Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags || ""),
  }));
}

// ── keyword correlation ──────────────────────────────────────────────────────

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function score(investment, event) {
  const invKw  = new Set(keywords(`${investment.name} ${investment.type} ${investment.sector} ${investment.description} ${investment.ticker} ${investment.tags}`));
  const evKw   = keywords(`${event.title} ${event.type} ${event.service} ${event.message} ${event.tags}`);
  if (!invKw.size || !evKw.length) return 0;
  const hits = evKw.filter((k) => invKw.has(k)).length;
  return Math.round((hits / Math.max(evKw.length, 1)) * 100);
}

function correlate(investments, events) {
  return investments.map((inv) => {
    const matches = events
      .map((ev) => ({ ev, sc: score(inv, ev) }))
      .filter((x) => x.sc > 0)
      .sort((a, b) => b.sc - a.sc)
      .map(({ ev, sc }) => ({ ...ev, relevance: sc }));
    return { ...inv, matches, impacted: matches.length > 0 };
  });
}

// ── intent exports ───────────────────────────────────────────────────────────

const INVOPS_RE = /\b(investment\s+ops|portfolio\s+ops|ops\s+impact|investment\s+impact|invops|portfolio\s+disruption|ops\s+event\s+impact|holdings\s+disruption)\b/i;

export function isInvOpsQuery(q) {
  return INVOPS_RE.test(q || "");
}

export async function buildInvOpsScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };

  const [invRaw, evRaw] = await Promise.all([
    fetch(`${base}/entities/Investment`, { headers }).then((r) => r.ok ? r.json() : []),
    fetch(`${base}/v1/ops/events`,       { headers }).then((r) => r.ok ? r.json() : []),
  ]);

  const investments = normaliseInvestments(invRaw);
  const events      = normaliseOpsEvents(evRaw);
  const rows        = correlate(investments, events);
  const impacted    = rows.filter((r) => r.impacted);
  const clear       = rows.filter((r) => !r.impacted);

  const brief = `${impacted.length} of ${rows.length} portfolio holdings are impacted by ${events.length} live operational events. ` +
    (impacted.length
      ? `Top exposure: ${impacted[0].name} matched ${impacted[0].matches.length} ops event(s) — immediate portfolio review recommended.`
      : "No holdings match active operational disruptions at this time.");

  const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method:  "POST",
    headers,
    body: JSON.stringify({ message: `Investment × Ops Event Monitor: ${brief} Provide a 2-sentence operational impact assessment for the portfolio.` }),
  });
  if (!resp.ok) return brief;
  const data = await resp.json();
  return data?.response || data?.message || data?.answer || brief;
}

// ── severity badge colour ────────────────────────────────────────────────────

function sevColor(sev) {
  const s = String(sev || "").toLowerCase();
  if (s === "critical" || s === "high") return RED;
  if (s === "medium" || s === "warn")   return AMBER;
  return GREEN;
}

// ── component ────────────────────────────────────────────────────────────────

export default function InvestmentOpsMonitor() {
  const [open,      setOpen]      = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [query,     setQuery]     = useState("");
  const [rows,      setRows]      = useState([]);
  const [events,    setEvents]    = useState([]);
  const [expanded,  setExpanded]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base    = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [invRaw, evRaw] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers }).then((r) => r.ok ? r.json() : []),
        fetch(`${base}/v1/ops/events`,       { headers }).then((r) => r.ok ? r.json() : []),
      ]);
      const investments = normaliseInvestments(invRaw);
      const opsEvents   = normaliseOpsEvents(evRaw);
      setEvents(opsEvents);
      setRows(correlate(investments, opsEvents));
    } catch (_) {
      // network failure — retain stale state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:invops-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invops-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const answer = await buildInvOpsScript();
      setBrief(answer);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  };

  const impacted = rows.filter((r) => r.impacted);
  const clear    = rows.filter((r) => !r.impacted);
  const hasCrit  = impacted.some((r) => r.matches.some((m) => /critical|high/i.test(m.severity)));

  const filtered = (() => {
    const base = tab === "IMPACTED" ? impacted : tab === "CLEAR" ? clear : rows;
    if (!query.trim()) return base;
    const q = query.toLowerCase();
    return base.filter((r) =>
      r.name.toLowerCase().includes(q) ||
      r.sector.toLowerCase().includes(q) ||
      r.type.toLowerCase().includes(q)
    );
  })();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investment × Ops Event Monitor"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 76,
          background: "rgba(0,0,0,0.7)", border: `1px solid ${hasCrit ? RED : CY}`,
          color: hasCrit ? RED : CY, fontFamily: "monospace", fontSize: 10,
          padding: "3px 7px", borderRadius: 4, cursor: "pointer", letterSpacing: 1,
        }}
      >
        ◆ INVOPS {impacted.length > 0 && <span style={{ color: hasCrit ? RED : AMBER }}>({impacted.length})</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 560, bottom: 50, width: 590, maxHeight: "82vh",
      background: "rgba(0,0,0,0.93)", border: `1px solid ${CY}`,
      borderRadius: 8, fontFamily: "monospace", fontSize: 11, color: CY,
      display: "flex", flexDirection: "column", zIndex: 76, overflow: "hidden",
    }}>
      {/* header */}
      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${CY}33`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, letterSpacing: 2 }}>◆ INVESTMENT × OPS MONITOR</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${CY}22` }}>
        {[
          { label: "HOLDINGS", val: rows.length,    col: CY   },
          { label: "OPS EVENTS", val: events.length, col: CY   },
          { label: "IMPACTED",  val: impacted.length, col: hasCrit ? RED : AMBER },
          { label: "CLEAR",     val: clear.length,   col: GREEN },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ flex: 1, textAlign: "center", background: "rgba(255,255,255,0.04)", borderRadius: 4, padding: "4px 0" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 9, opacity: 0.6 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* tabs + search */}
      <div style={{ display: "flex", gap: 6, padding: "6px 12px", alignItems: "center" }}>
        {["ALL", "IMPACTED", "CLEAR"].map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? CY : "transparent",
            color: tab === t ? "#000" : CY,
            border: `1px solid ${CY}`, borderRadius: 3, fontSize: 10,
            padding: "2px 8px", cursor: "pointer",
          }}>{t}</button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="filter holdings…"
          style={{
            flex: 1, background: "rgba(255,255,255,0.05)", border: `1px solid ${CY}55`,
            color: CY, borderRadius: 3, padding: "2px 6px", fontSize: 10, outline: "none",
          }}
        />
        {loading && <span style={{ opacity: 0.5, fontSize: 10 }}>↻</span>}
      </div>

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {filtered.length === 0 && (
          <div style={{ padding: 16, opacity: 0.5, textAlign: "center" }}>No holdings match.</div>
        )}
        {filtered.map((inv) => (
          <div key={inv.id} style={{ borderBottom: `1px solid ${CY}11` }}>
            <div
              onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
              style={{
                padding: "6px 12px", cursor: "pointer", display: "flex",
                justifyContent: "space-between", alignItems: "center",
                background: expanded === inv.id ? "rgba(41,231,255,0.05)" : "transparent",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: inv.impacted ? (hasCrit && inv.matches.some((m) => /critical|high/i.test(m.severity)) ? RED : AMBER) : GREEN, fontWeight: 700 }}>
                  {inv.impacted ? "⚡" : "✓"}
                </span>
                <span style={{ fontWeight: 600 }}>{inv.name}</span>
                {inv.ticker && <span style={{ opacity: 0.5 }}>[{inv.ticker}]</span>}
                {inv.sector && <span style={{ fontSize: 9, opacity: 0.5 }}>{inv.sector}</span>}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {inv.impacted && (
                  <span style={{ color: AMBER, fontSize: 9 }}>{inv.matches.length} event{inv.matches.length !== 1 ? "s" : ""}</span>
                )}
                <span style={{ color: inv.impacted ? AMBER : GREEN, fontSize: 10 }}>
                  {inv.impacted ? "IMPACTED" : "CLEAR"}
                </span>
                <span style={{ opacity: 0.4 }}>{expanded === inv.id ? "▲" : "▼"}</span>
              </div>
            </div>

            {expanded === inv.id && (
              <div style={{ padding: "4px 20px 10px", background: "rgba(0,0,0,0.3)" }}>
                {inv.description && (
                  <div style={{ opacity: 0.6, fontSize: 10, marginBottom: 6 }}>{inv.description.slice(0, 120)}</div>
                )}
                {inv.impacted ? (
                  inv.matches.map((m) => (
                    <div key={m.id} style={{
                      background: "rgba(41,231,255,0.05)", border: `1px solid ${CY}22`,
                      borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontWeight: 600, color: sevColor(m.severity) }}>{m.title}</span>
                        <span style={{ fontSize: 9, color: CY, opacity: 0.7 }}>score {m.relevance}%</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span style={{
                          fontSize: 9, border: `1px solid ${sevColor(m.severity)}`,
                          color: sevColor(m.severity), borderRadius: 2, padding: "1px 4px",
                        }}>{(m.severity || "med").toUpperCase()}</span>
                        {m.type && <span style={{ fontSize: 9, opacity: 0.6 }}>{m.type}</span>}
                        {m.service && <span style={{ fontSize: 9, opacity: 0.5 }}>svc: {m.service}</span>}
                        <span style={{
                          fontSize: 9, border: `1px solid ${m.status === "active" ? RED : CY}44`,
                          color: m.status === "active" ? RED : CY, borderRadius: 2, padding: "1px 4px",
                        }}>{(m.status || "active").toUpperCase()}</span>
                      </div>
                      {m.message && (
                        <div style={{ opacity: 0.5, fontSize: 9, marginTop: 3 }}>{m.message.slice(0, 100)}</div>
                      )}
                      {/* relevance bar */}
                      <div style={{ marginTop: 4, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                        <div style={{ width: `${m.relevance}%`, height: "100%", background: sevColor(m.severity), borderRadius: 2 }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ opacity: 0.4, fontSize: 10 }}>No operational event overlap detected.</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* assess footer */}
      <div style={{ padding: "8px 12px", borderTop: `1px solid ${CY}22` }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            background: assessing ? "rgba(41,231,255,0.1)" : CY,
            color: assessing ? CY : "#000",
            border: `1px solid ${CY}`, borderRadius: 4,
            padding: "4px 14px", cursor: assessing ? "not-allowed" : "pointer",
            fontFamily: "monospace", fontWeight: 700, fontSize: 11, width: "100%",
          }}
        >
          {assessing ? "▶ ASSESSING…" : "▶ ASSESS PORTFOLIO OPS IMPACT"}
        </button>
        {brief && (
          <div style={{ marginTop: 6, fontSize: 10, color: CY, opacity: 0.85, lineHeight: 1.5 }}>
            {brief}
          </div>
        )}
      </div>
    </div>
  );
}
