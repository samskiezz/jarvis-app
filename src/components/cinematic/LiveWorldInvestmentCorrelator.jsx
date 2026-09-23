/**
 * LiveWorldInvestmentCorrelator — F563
 * "JARVIS, live world investment / lwinv / world investment / portfolio signal"
 * Cross-references /functions/getLiveIntel + /entities/Investment.
 * Finds WORLD-SIGNALED investments (≥1 live event keyword-matches) vs QUIET.
 * Coverage % tile; ALL/WORLD-SIGNALED/QUIET filter tabs + search; click-to-expand event detail.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 59_080;
const Z_INDEX  = 127;

const LWINV_RE =
  /\blwinv\b|\blive.?world.?invest\w*\b|\bworld.?invest\w*\b|\bportfolio.?signal\b|\blive.?intel.?invest\w*\b|\breal.?world.?portfolio\b|\bworld.?signaled.?invest\w*\b|\bmarket.?event.?portfolio\b|\blive.?portfolio\b|\bworld.?portfolio\b/i;

export function isLwinvQuery(text) {
  return LWINV_RE.test(text || "");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseLiveEvents(data) {
  if (!data) return [];
  const all = [];

  const quakes = Array.isArray(data.earthquakes) ? data.earthquakes : [];
  quakes.forEach((q, i) => {
    all.push({
      id: q.id || `quake-${i}`,
      kind: "SEISMIC",
      name: q.place || q.name || `Magnitude ${q.magnitude} quake`,
      description: `Mag ${q.magnitude ?? "?"} at ${q.place || "unknown location"}. ${q.type || ""}`,
      tags: ["seismic", "earthquake", "geologic", "disaster", q.place || ""].join(" "),
    });
  });

  const coins = Array.isArray(data.crypto) ? data.crypto
    : Array.isArray(data.coins) ? data.coins : [];
  coins.forEach((c, i) => {
    const sym = c.symbol || c.coin || c.currency || `COIN${i}`;
    const chg = c.change_pct ?? c.change ?? c.pct_change ?? null;
    all.push({
      id: `crypto-${sym}`,
      kind: "CRYPTO",
      name: `${sym} ${chg !== null ? (chg >= 0 ? `+${chg.toFixed(2)}%` : `${chg.toFixed(2)}%`) : ""}`.trim(),
      description: `Cryptocurrency ${sym}: price ${c.price ?? "?"} USD.${chg !== null ? ` Change: ${chg.toFixed(2)}%` : ""}`,
      tags: `crypto ${sym} ${sym.toLowerCase()} digital asset market finance currency`.trim(),
    });
  });

  const fx = Array.isArray(data.fx) ? data.fx
    : Array.isArray(data.currencies) ? data.currencies : [];
  fx.forEach((f, i) => {
    const pair = f.pair || f.symbol || f.currency_pair || `FX${i}`;
    const rate = f.rate ?? f.price ?? null;
    all.push({
      id: `fx-${pair}`,
      kind: "FX",
      name: `${pair} ${rate !== null ? `@ ${rate}` : ""}`.trim(),
      description: `FX pair ${pair}. Rate: ${rate ?? "?"}.`,
      tags: `currency forex fx ${pair} ${pair.toLowerCase()} monetary exchange finance market`.trim(),
    });
  });

  return all;
}

function normaliseInvestments(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.investments)     ? raw.investments
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : [];
  return arr.map((inv, i) => ({
    id:          inv.id           || String(i),
    name:        inv.name         || inv.ticker   || inv.symbol   || `Investment ${i + 1}`,
    type:        (inv.type        || inv.asset_type || inv.category || "").toString().toUpperCase(),
    sector:      inv.sector       || inv.industry || "",
    description: (inv.description || inv.notes    || inv.details  || "").toString().slice(0, 200),
    value:       inv.value        || inv.amount   || inv.balance  || null,
    tags:        Array.isArray(inv.tags) ? inv.tags.join(" ") : (inv.tags || ""),
  }));
}

function crossRef(investments, events) {
  return investments.map((inv) => {
    const haystack = `${inv.name} ${inv.description} ${inv.sector} ${inv.type} ${inv.tags}`;
    const matches = events
      .map((ev) => ({
        ev,
        hits: overlap(haystack, `${ev.name} ${ev.description} ${ev.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...inv,
      signaled: matches.length > 0,
      matches: matches.map(({ ev, hits }) => ({ ...ev, hits })),
    };
  });
}

// ─── buildLwinvScript (for JarvisBrain) ──────────────────────────────────────

export async function buildLwinvScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [liveRes, invRes] = await Promise.all([
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      fetch(`${base}/entities/Investment`,    { headers: hdr }),
    ]);
    const liveData = liveRes.ok ? await liveRes.json() : {};
    const invData  = invRes.ok  ? await invRes.json()  : {};

    const events  = normaliseLiveEvents(liveData);
    const invs    = normaliseInvestments(invData);
    const crossed = crossRef(invs, events);

    const total    = crossed.length;
    const signaled = crossed.filter((inv) => inv.signaled).length;
    const quiet    = total - signaled;
    const coverage = total > 0 ? Math.round((signaled / total) * 100) : 0;
    const topSignaled = crossed
      .filter((inv) => inv.signaled)
      .slice(0, 2)
      .map((inv) => inv.name)
      .join(", ");

    const brief =
      `${coverage}% of ${total} investments correlate with live world events. ` +
      `${signaled} WORLD-SIGNALED, ${quiet} QUIET.` +
      (topSignaled ? ` Top signaled holdings: ${topSignaled}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Live World × Investment Portfolio Correlation: ${brief} Provide a 2-sentence portfolio risk assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Live World × Investment Correlator unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const KIND_COLOR = { SEISMIC: "#FF6B35", CRYPTO: GRN, FX: CY };

export default function LiveWorldInvestmentCorrelator() {
  const [open, setOpen]       = useState(false);
  const [investments, setInvestments] = useState([]);
  const [events, setEvents]   = useState([]);
  const [crossed, setCrossed] = useState([]);
  const [tab, setTab]         = useState("ALL");
  const [query, setQuery]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssess] = useState(false);
  const [brief, setBrief]     = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [liveRes, invRes] = await Promise.all([
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
        fetch(`${base}/entities/Investment`,    { headers: hdr }),
      ]);
      const liveData = liveRes.ok ? await liveRes.json() : {};
      const invData  = invRes.ok  ? await invRes.json()  : {};

      const evs  = normaliseLiveEvents(liveData);
      const invs = normaliseInvestments(invData);
      setEvents(evs);
      setInvestments(invs);
      setCrossed(crossRef(invs, evs));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => {
      if (!v) load();
      return !v;
    });
    window.addEventListener("jarvis:lwinv-toggle", onToggle);
    return () => window.removeEventListener("jarvis:lwinv-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssess(true);
    setBrief("");
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const total    = crossed.length;
      const signaled = crossed.filter((inv) => inv.signaled).length;
      const quiet    = total - signaled;
      const coverage = total > 0 ? Math.round((signaled / total) * 100) : 0;
      const prompt = `Live World × Investment: ${coverage}% world-signal coverage (${signaled}/${total} signaled, ${quiet} quiet). Provide a 2-sentence portfolio risk assessment.`;
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const d = res.ok ? await res.json() : {};
      const text = d.response || d.message || d.reply || "Assessment complete.";
      setBrief(text);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "onyx" }),
      });
    } catch (e) {
      setBrief(`Assessment error: ${e.message}`);
    } finally {
      setAssess(false);
    }
  }, [crossed]);

  const visible = crossed.filter((inv) => {
    if (tab === "WORLD-SIGNALED" && !inv.signaled) return false;
    if (tab === "QUIET"          &&  inv.signaled) return false;
    if (query) {
      const q = query.toLowerCase();
      if (
        !inv.name.toLowerCase().includes(q) &&
        !inv.description.toLowerCase().includes(q) &&
        !inv.type.toLowerCase().includes(q) &&
        !inv.sector.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const total     = crossed.length;
  const nSignaled = crossed.filter((inv) => inv.signaled).length;
  const nQuiet    = total - nSignaled;
  const coverage  = total > 0 ? Math.round((nSignaled / total) * 100) : 0;

  const btnStyle = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: Z_INDEX,
    background: "rgba(0,0,0,0.85)",
    border: `1px solid ${CY}`,
    color: CY,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "2px 7px",
    cursor: "pointer",
    borderRadius: 3,
    userSelect: "none",
    display: "flex",
    alignItems: "center",
    gap: 4,
  };

  const panelStyle = {
    position: "fixed",
    right: 18,
    bottom: 54,
    width: 460,
    maxHeight: "78vh",
    overflowY: "auto",
    background: "rgba(0,6,18,0.97)",
    border: `1px solid ${CY}44`,
    borderRadius: 8,
    padding: 16,
    zIndex: 9999,
    fontFamily: "monospace",
    color: CY,
    boxSizing: "border-box",
  };

  return (
    <>
      <button
        style={btnStyle}
        onClick={() => { setOpen((v) => { if (!v) load(); return !v; }); }}
        title="Live World × Investment Correlator"
      >
        ◈ LWINV
        {nSignaled > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 8, padding: "0 4px", fontSize: 9 }}>
            {nSignaled}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>LIVE WORLD × PORTFOLIO</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={load}
                style={{ background: "none", border: `1px solid ${CY}55`, color: CY, cursor: "pointer", padding: "2px 8px", borderRadius: 3, fontSize: 10 }}
                title="Refresh"
              >
                ↺
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[
              { label: "COVERAGE",       value: `${coverage}%`, color: coverage > 60 ? GRN : coverage > 30 ? AMB : "#FF4466" },
              { label: "WORLD-SIGNALED", value: nSignaled,      color: AMB },
              { label: "QUIET",          value: nQuiet,         color: DIM },
              { label: "LIVE EVENTS",    value: events.length,  color: CY },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  flex: 1, background: "rgba(41,231,255,0.05)", border: `1px solid ${color}33`,
                  borderRadius: 4, padding: "6px 8px", textAlign: "center",
                }}
              >
                <div style={{ fontSize: 16, fontWeight: "bold", color }}>{value}</div>
                <div style={{ fontSize: 8, color: DIM, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assess */}
          <div style={{ marginBottom: 10 }}>
            <button
              onClick={assess}
              disabled={assessing || crossed.length === 0}
              style={{
                background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.15)",
                border: `1px solid ${CY}88`,
                color: CY, cursor: assessing ? "wait" : "pointer",
                padding: "4px 14px", borderRadius: 3, fontSize: 10, fontFamily: "monospace",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, fontSize: 10, color: "#cde", lineHeight: 1.5, padding: "6px 8px", background: "rgba(41,231,255,0.05)", borderRadius: 3 }}>
                {brief}
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {["ALL", "WORLD-SIGNALED", "QUIET"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "none",
                  border: `1px solid ${tab === t ? CY : CY + "33"}`,
                  color: tab === t ? CY : DIM,
                  cursor: "pointer", padding: "2px 10px", borderRadius: 3,
                  fontSize: 10, fontFamily: "monospace",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search investments…"
            style={{
              width: "100%", background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}33`,
              color: CY, padding: "4px 8px", borderRadius: 3, fontSize: 10,
              marginBottom: 8, boxSizing: "border-box", fontFamily: "monospace",
            }}
          />

          {/* Investment rows */}
          {loading ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>No investments match.</div>
          ) : (
            visible.map((inv) => (
              <div key={inv.id}>
                <div
                  onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 6px", marginBottom: 3, cursor: "pointer",
                    borderRadius: 3, background: "rgba(41,231,255,0.04)",
                    border: `1px solid ${inv.signaled ? AMB + "55" : DIM + "22"}`,
                  }}
                >
                  {inv.type && (
                    <span style={{
                      fontSize: 8, padding: "1px 4px", borderRadius: 2,
                      background: `${CY}11`, color: CY,
                      minWidth: 36, textAlign: "center",
                    }}>
                      {inv.type.slice(0, 6)}
                    </span>
                  )}
                  <span style={{ flex: 1, fontSize: 10, color: inv.signaled ? AMB : DIM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {inv.name}
                    {inv.sector ? <span style={{ color: DIM, marginLeft: 4, fontSize: 9 }}>· {inv.sector}</span> : null}
                  </span>
                  {inv.signaled ? (
                    <span style={{ fontSize: 8, color: AMB }}>⬡ {inv.matches.length} ev</span>
                  ) : (
                    <span style={{ fontSize: 8, color: DIM }}>QUIET</span>
                  )}
                </div>

                {/* Expanded matched events */}
                {expanded === inv.id && inv.signaled && (
                  <div style={{ marginLeft: 12, marginBottom: 6 }}>
                    {inv.description && (
                      <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>{inv.description.slice(0, 120)}</div>
                    )}
                    {inv.matches.map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          padding: "3px 6px", marginBottom: 2, borderRadius: 2,
                          background: "rgba(255,165,0,0.05)", border: `1px solid ${KIND_COLOR[ev.kind] || DIM}33`,
                          fontSize: 9,
                        }}
                      >
                        <span style={{ color: KIND_COLOR[ev.kind] || DIM, marginRight: 4 }}>[{ev.kind}]</span>
                        <span style={{ color: AMB }}>{ev.name}</span>
                        <span style={{ color: DIM, marginLeft: 6 }}>hits:{ev.hits}</span>
                      </div>
                    ))}
                  </div>
                )}

                {expanded === inv.id && !inv.signaled && (
                  <div style={{ marginLeft: 12, marginBottom: 6, fontSize: 9, color: DIM }}>
                    No live world events correlate with this investment.
                    {inv.description && <div style={{ marginTop: 2 }}>{inv.description.slice(0, 120)}</div>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
