/**
 * F71 — Investment × Live Intel Opportunity Scanner (ILOS)
 *
 * Parallel-fetches /entities/Investment and /functions/getLiveIntel, then
 * keyword-correlates each investment (name, sector, tags, notes) against
 * live world events (crypto price movements, FX rate changes, seismic events)
 * to surface:
 *
 *   TRIGGERED — at least one live world event keyword-matches this investment
 *   QUIET     — no live events align with this investment currently
 *
 * Stat tiles: investments / live events / triggered / quiet
 * Filter tabs: ALL | TRIGGERED | QUIET + text search
 * Expand investment → matched live events with event type badge (CRYPTO/FX/SEISMIC)
 *   + relevance score bar.
 * Amber badge on triggered count.
 * ▶ ASSESS: 2-sentence portfolio intelligence brief via /v1/jarvis/agent/chat +
 *   jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ ILOS  at left:1800 bottom:18, zIndex:68.
 * Event:   jarvis:ilos-toggle
 * Voice:   "investment intel / live investment / ilos / market opportunity /
 *           investment opportunity / portfolio intel / live portfolio /
 *           investment world events / triggered investments / market signal /
 *           which investments are triggered / portfolio live intel"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT  = 1800;
const POLL_MS   = 60_000;
const AMBER     = "#F59E0B";
const CYAN      = "#29E7FF";
const GREEN     = "#34D399";
const SLATE     = "#6E8AA0";
const VIOLET    = "#A78BFA";
const ROSE      = "#FB7185";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const ILOS_RE =
  /\b(investment\s+intel|live\s+investment[s]?|ilos|market\s+opportunity|investment\s+opportunity|portfolio\s+intel|live\s+portfolio|investment\s+world|triggered\s+investment[s]?|market\s+signal[s]?|which\s+investment[s]?\s+(are\s+)?triggered|portfolio\s+live|investment\s+scan|opportunity\s+scanner|live\s+market\s+signal[s]?)\b/i;

export function isIlosQuery(q) { return ILOS_RE.test(q); }

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseInvestments(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.items ?? raw?.data ?? raw?.investments ?? []);
  return arr.map((x) => ({
    id:     x.id ?? x._id ?? String(Math.random()),
    name:   String(x.name ?? x.title ?? "Investment"),
    sector: String(x.sector ?? x.category ?? x.type ?? ""),
    tags:   Array.isArray(x.tags) ? x.tags.join(" ") : String(x.tags ?? ""),
    notes:  String(x.notes ?? x.description ?? x.summary ?? ""),
  }));
}

function normaliseLiveIntel(raw) {
  const events = [];
  const quakes = Array.isArray(raw?.earthquakes) ? raw.earthquakes : [];
  quakes.forEach((q) => {
    events.push({
      id:    `eq-${q.id ?? q.place ?? Math.random()}`,
      type:  "SEISMIC",
      label: String(q.place ?? q.location ?? "Seismic event"),
      keywords: [
        String(q.place ?? ""),
        String(q.location ?? ""),
        "earthquake", "seismic", "quake",
      ].join(" ").toLowerCase(),
      detail: `M${q.magnitude ?? "?"} at ${q.place ?? "unknown"}`,
    });
  });

  const crypto = Array.isArray(raw?.crypto) ? raw.crypto : [];
  crypto.forEach((c) => {
    const sym   = String(c.symbol ?? c.name ?? "CRYPTO").toUpperCase();
    const label = `${sym} ${c.change_pct != null ? (c.change_pct >= 0 ? "+" : "") + c.change_pct.toFixed(2) + "%" : ""}`;
    events.push({
      id:    `cx-${sym}`,
      type:  "CRYPTO",
      label,
      keywords: [sym, "crypto", "bitcoin", "ethereum", "digital asset", "blockchain"].join(" ").toLowerCase(),
      detail: `${sym} price: ${c.price ?? "n/a"}, change: ${c.change_pct != null ? c.change_pct.toFixed(2) + "%" : "n/a"}`,
    });
  });

  const fx = Array.isArray(raw?.fx) ? raw.fx : [];
  fx.forEach((f) => {
    const pair  = String(f.pair ?? f.symbol ?? f.name ?? "FX").toUpperCase();
    const label = `${pair} ${f.change_pct != null ? (f.change_pct >= 0 ? "+" : "") + f.change_pct.toFixed(2) + "%" : ""}`;
    events.push({
      id:    `fx-${pair}`,
      type:  "FX",
      label,
      keywords: [pair, "forex", "fx", "currency", "exchange rate"].join(" ").toLowerCase(),
      detail: `${pair} rate: ${f.rate ?? f.price ?? "n/a"}, change: ${f.change_pct != null ? f.change_pct.toFixed(2) + "%" : "n/a"}`,
    });
  });

  return events;
}

function relevance(inv, ev) {
  const haystack = [inv.name, inv.sector, inv.tags, inv.notes].join(" ").toLowerCase();
  const needles  = ev.keywords.split(/\s+/).filter((w) => w.length > 2);
  let score = 0;
  needles.forEach((n) => { if (haystack.includes(n)) score += 1; });
  return score;
}

function correlate(investments, events) {
  return investments.map((inv) => {
    const matches = events
      .map((ev) => ({ ev, score: relevance(inv, ev) }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...inv, matches, triggered: matches.length > 0 };
  });
}

// ── async build helper exported for JarvisBrain ───────────────────────────────

export async function buildIlosScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [invRes, intelRes] = await Promise.all([
      fetch(`${base}/entities/Investment`,       { headers: hdr }),
      fetch(`${base}/functions/getLiveIntel`,    { headers: hdr }),
    ]);
    const investments = normaliseInvestments(await invRes.json());
    const events      = normaliseLiveIntel(await intelRes.json());
    const correlated  = correlate(investments, events);

    const triggered = correlated.filter((i) => i.triggered).length;
    const quiet     = investments.length - triggered;
    const cryptoEv  = events.filter((e) => e.type === "CRYPTO").length;
    const fxEv      = events.filter((e) => e.type === "FX").length;
    const seismicEv = events.filter((e) => e.type === "SEISMIC").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS investment × live-intel opportunity scan: ${investments.length} portfolio positions ` +
          `cross-referenced against ${events.length} live world signals ` +
          `(${cryptoEv} crypto, ${fxEv} FX, ${seismicEv} seismic). ` +
          `${triggered} positions show market-event correlation (TRIGGERED); ${quiet} are currently QUIET. ` +
          `Provide a 2-sentence portfolio live-intelligence opportunity brief — formal British butler ` +
          `tone, first person, highlight any critical market signals relevant to the portfolio.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Portfolio live-intelligence scan complete, sir.").trim();
  } catch {
    return "Live-intelligence scan unavailable at this time, sir.";
  }
}

// ── badge colour for event type ───────────────────────────────────────────────

function typeBadgeStyle(type) {
  if (type === "CRYPTO")  return { background: VIOLET, color: "#fff" };
  if (type === "FX")      return { background: CYAN,   color: "#000" };
  if (type === "SEISMIC") return { background: ROSE,   color: "#fff" };
  return { background: SLATE, color: "#fff" };
}

// ── component ─────────────────────────────────────────────────────────────────

export default function InvestmentLiveIntelScanner() {
  const [open,      setOpen]      = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [rows,      setRows]      = useState([]);
  const [events,    setEvents]    = useState([]);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const [err,       setErr]       = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [invRes, intelRes] = await Promise.all([
        fetch(`${base}/entities/Investment`,    { headers: hdr }),
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      ]);
      if (!invRes.ok || !intelRes.ok) throw new Error("fetch failed");
      const investments = normaliseInvestments(await invRes.json());
      const ev          = normaliseLiveIntel(await intelRes.json());
      setRows(correlate(investments, ev));
      setEvents(ev);
      setErr("");
    } catch (e) {
      setErr(String(e.message ?? "Load failed"));
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:ilos-toggle", handler);
    return () => window.removeEventListener("jarvis:ilos-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    const script = await buildIlosScript();
    setBrief(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  }, []);

  if (!open) {
    const triggered = rows.filter((r) => r.triggered).length;
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position:    "fixed",
          left:        BTN_LEFT,
          bottom:      18,
          zIndex:      68,
          background:  triggered > 0 ? "rgba(245,158,11,0.15)" : "rgba(0,0,0,0.55)",
          border:      `1px solid ${triggered > 0 ? AMBER : "#29E7FF44"}`,
          borderRadius: 6,
          color:       triggered > 0 ? AMBER : CYAN,
          fontFamily:  "monospace",
          fontSize:    11,
          padding:     "4px 8px",
          cursor:      "pointer",
          whiteSpace:  "nowrap",
        }}
      >
        ◈ ILOS{triggered > 0 ? ` [${triggered}]` : ""}
      </button>
    );
  }

  const triggered = rows.filter((r) => r.triggered).length;
  const quiet     = rows.length - triggered;

  const visible = rows.filter((r) => {
    if (tab === "TRIGGERED" && !r.triggered) return false;
    if (tab === "QUIET"     &&  r.triggered) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.sector.toLowerCase().includes(q) ||
        r.tags.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const panelStyle = {
    position:   "fixed",
    bottom:     60,
    left:       BTN_LEFT,
    width:      520,
    maxHeight:  520,
    overflowY:  "auto",
    background: "rgba(8,16,26,0.97)",
    border:     "1px solid #29E7FF33",
    borderRadius: 10,
    zIndex:     68,
    padding:    16,
    fontFamily: "monospace",
    color:      "#C8D8E8",
    fontSize:   12,
  };

  const tile = (label, val, col) => (
    <div style={{
      flex: 1, textAlign: "center", background: "rgba(255,255,255,0.04)",
      borderRadius: 6, padding: "6px 4px",
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
      <div style={{ fontSize: 10, color: SLATE }}>{label}</div>
    </div>
  );

  const tabBtn = (label) => (
    <button key={label} onClick={() => setTab(label)} style={{
      background: tab === label ? "#29E7FF22" : "transparent",
      border:     `1px solid ${tab === label ? CYAN : "#29E7FF33"}`,
      borderRadius: 4, color: tab === label ? CYAN : SLATE,
      fontFamily: "monospace", fontSize: 11, padding: "2px 8px", cursor: "pointer",
    }}>{label}</button>
  );

  return (
    <div style={panelStyle}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ color: AMBER, fontWeight: 700, fontSize: 13 }}>
          ◈ INVESTMENT × LIVE INTEL SCANNER
        </span>
        <button onClick={() => setOpen(false)} style={{
          background: "transparent", border: "none", color: SLATE,
          cursor: "pointer", fontSize: 14,
        }}>✕</button>
      </div>

      {err && <div style={{ color: ROSE, marginBottom: 8, fontSize: 11 }}>{err}</div>}

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {tile("INVESTMENTS", rows.length,    CYAN)}
        {tile("LIVE EVENTS", events.length,  VIOLET)}
        {tile("TRIGGERED",   triggered,      AMBER)}
        {tile("QUIET",       quiet,           GREEN)}
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {["ALL", "TRIGGERED", "QUIET"].map(tabBtn)}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          style={{
            marginLeft: "auto", background: "rgba(255,255,255,0.06)",
            border: "1px solid #29E7FF33", borderRadius: 4,
            color: "#C8D8E8", fontSize: 11, padding: "2px 6px", width: 100,
          }}
        />
      </div>

      {/* rows */}
      {visible.length === 0 && (
        <div style={{ color: SLATE, textAlign: "center", padding: 16 }}>No results.</div>
      )}
      {visible.map((inv) => (
        <div key={inv.id} style={{
          background:   "rgba(255,255,255,0.03)",
          border:       `1px solid ${inv.triggered ? AMBER + "55" : "#29E7FF22"}`,
          borderRadius: 6,
          marginBottom: 6,
          overflow:     "hidden",
        }}>
          <div
            onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
            style={{
              display:    "flex",
              alignItems: "center",
              gap:        8,
              padding:    "6px 10px",
              cursor:     "pointer",
            }}
          >
            <span style={{
              fontSize:    10,
              fontWeight:  700,
              padding:     "1px 6px",
              borderRadius: 3,
              background:  inv.triggered ? "rgba(245,158,11,0.2)" : "rgba(52,211,153,0.15)",
              color:       inv.triggered ? AMBER : GREEN,
            }}>
              {inv.triggered ? "TRIGGERED" : "QUIET"}
            </span>
            <span style={{ flex: 1, fontWeight: 600, color: "#E0EEFF" }}>{inv.name}</span>
            {inv.sector && (
              <span style={{ fontSize: 10, color: SLATE }}>{inv.sector}</span>
            )}
            <span style={{ color: SLATE, fontSize: 10 }}>
              {inv.triggered ? `${inv.matches.length} event${inv.matches.length !== 1 ? "s" : ""}` : "—"}
            </span>
          </div>

          {expanded === inv.id && inv.matches.length > 0 && (
            <div style={{ borderTop: "1px solid #29E7FF22", padding: "8px 10px" }}>
              {inv.matches.map(({ ev, score }) => {
                const maxScore = Math.max(...inv.matches.map((m) => m.score), 1);
                return (
                  <div key={ev.id} style={{
                    display:      "flex",
                    alignItems:   "center",
                    gap:          8,
                    marginBottom: 5,
                  }}>
                    <span style={{
                      fontSize:    9,
                      fontWeight:  700,
                      padding:     "1px 5px",
                      borderRadius: 3,
                      ...typeBadgeStyle(ev.type),
                    }}>
                      {ev.type}
                    </span>
                    <span style={{ flex: 1, color: "#C8D8E8", fontSize: 11 }}>{ev.label}</span>
                    <div style={{ width: 60, background: "#1E2A38", borderRadius: 3, height: 6 }}>
                      <div style={{
                        width:        `${Math.round((score / maxScore) * 100)}%`,
                        height:       "100%",
                        background:   AMBER,
                        borderRadius: 3,
                      }} />
                    </div>
                    <span style={{ width: 22, textAlign: "right", color: AMBER, fontSize: 10 }}>
                      {score}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {expanded === inv.id && inv.matches.length === 0 && (
            <div style={{ padding: "6px 10px", color: SLATE, fontSize: 11, borderTop: "1px solid #29E7FF22" }}>
              No live event correlations.
            </div>
          )}
        </div>
      ))}

      {/* assess */}
      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "flex-start" }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            background:   "rgba(245,158,11,0.15)",
            border:       `1px solid ${AMBER}`,
            borderRadius: 4,
            color:        AMBER,
            fontFamily:   "monospace",
            fontSize:     11,
            padding:      "4px 10px",
            cursor:       assessing ? "not-allowed" : "pointer",
          }}
        >
          {assessing ? "Assessing…" : "▶ ASSESS"}
        </button>
        {brief && (
          <div style={{
            flex:       1,
            color:      "#C8D8E8",
            fontSize:   11,
            lineHeight: 1.5,
            background: "rgba(255,255,255,0.04)",
            borderRadius: 6,
            padding:    "6px 8px",
          }}>
            {brief}
          </div>
        )}
      </div>
    </div>
  );
}
