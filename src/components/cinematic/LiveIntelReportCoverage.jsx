/**
 * LiveIntelReportCoverage — F201
 *
 * Parallel-fetches /functions/getLiveIntel (quakes/crypto/FX) + /v1/reports
 * then keyword-correlates each live intel event against the reports catalogue
 * to surface:
 *   REPORTED  (≥1 report match) — live event has intelligence report coverage
 *   UNREPORTED (0 matches)      — live event has no report coverage (blind spot)
 *
 * Stat tiles: events / reports / reported / unreported
 * Filter tabs: ALL / REPORTED / UNREPORTED
 * Text search.
 * Expand event → matched report cards with relevance bar.
 * ▶ ASSESS COVERAGE GAPS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 60 s auto-refresh.
 *
 * Intent: "live intel reports" / "lirpt" / "unreported events" /
 *         "live event coverage" / "live reports" / "intel report gap" /
 *         "unreported intel" / "report coverage"
 *   → jarvis:lirpt-toggle + TTS brief via buildLirptScript()
 *
 * Toggle: ◈ LIRPT at left:34600, bottom:8, zIndex:101.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF4444";
const DIM   = "#4A6070";
const BG    = "rgba(3,5,9,0.97)";
const BTN_LEFT   = 34600;
const REFRESH_MS = 60_000;
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── intent exports ────────────────────────────────────────────────────────────

const LIRPT_RE =
  /\b(lirpt|live.intel.report|intel.report.gap|unreported.intel|unreported.event|live.event.coverage|live.reports?|report.coverage|intel.coverage.gap)\b/i;

export function isLirptQuery(t) { return LIRPT_RE.test(t || ""); }

export async function buildLirptScript() {
  const [iRaw, rRaw] = await Promise.allSettled([
    fetch(`${apiBase()}/functions/getLiveIntel`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
    fetch(`${apiBase()}/v1/reports`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
  ]);
  const events  = normaliseEvents(iRaw.status === "fulfilled" ? iRaw.value : {});
  const reports = normaliseReports(rRaw.status === "fulfilled" ? rRaw.value : []);
  const pairs   = correlate(events, reports);
  const reported   = pairs.filter((p) => p.matches.length >= 1).length;
  const unreported = pairs.filter((p) => p.matches.length === 0).length;
  const topUnreported = pairs
    .filter((p) => p.matches.length === 0)
    .slice(0, 3)
    .map((p) => p.event.name)
    .join(", ") || "none";
  return (
    `Assess JARVIS live intel report coverage in 2 sentences. ` +
    `${events.length} live events vs ${reports.length} reports: ` +
    `${reported} REPORTED (≥1 report match), ` +
    `${unreported} UNREPORTED (no intelligence report covers these live events — coverage gap). ` +
    `Top unreported events: ${topUnreported}.`
  );
}

// ─── normalise helpers ─────────────────────────────────────────────────────────

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (raw && Array.isArray(raw[k])) return raw[k];
  }
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseEvents(data) {
  const events = [];
  if (!data || typeof data !== "object") return events;

  const quakes = Array.isArray(data.earthquakes) ? data.earthquakes : [];
  quakes.forEach((q, i) => {
    events.push({
      id:   q.id || `quake-${i}`,
      type: "seismic",
      name: q.place || q.name || `Magnitude ${q.magnitude} quake`,
      desc: `Mag ${q.magnitude ?? "?"} at ${q.place || "unknown location"}`,
      keywords: `seismic earthquake ${q.place || ""} magnitude disaster geologic`.toLowerCase(),
    });
  });

  const coins = Array.isArray(data.crypto) ? data.crypto : [];
  coins.slice(0, 10).forEach((c, i) => {
    const sym = c.symbol || c.coin || c.currency || `COIN${i}`;
    const chg = c.change_24h ?? c.pct_change ?? null;
    events.push({
      id:   `crypto-${sym}`,
      type: "crypto",
      name: `${sym} ${chg !== null ? (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%" : ""}`.trim(),
      desc: `Cryptocurrency ${sym}: price ${c.price ?? "?"} USD`,
      keywords: `crypto ${sym} ${sym.toLowerCase()} digital asset market finance`.toLowerCase(),
    });
  });

  const fx = Array.isArray(data.fx) ? data.fx : [];
  fx.slice(0, 8).forEach((f, i) => {
    const pair = f.pair || f.symbol || f.currency_pair || `FX${i}`;
    const rate = f.rate ?? f.price ?? "?";
    events.push({
      id:   `fx-${pair}`,
      type: "fx",
      name: `${pair} ${rate}`,
      desc: `FX pair ${pair}: rate ${rate}`,
      keywords: `forex fx ${pair} ${pair.toLowerCase()} currency exchange rate finance`.toLowerCase(),
    });
  });

  return events;
}

function normaliseReports(raw) {
  return normaliseArray(raw, ["reports", "items", "data"]).map((r) => ({
    id:    r.id || r.report_id || String(Math.random()),
    title: r.title || r.name || r.report_title || "Untitled Report",
    type:  r.type || r.category || r.report_type || "",
    desc:  r.summary || r.description || r.abstract || r.content?.slice?.(0, 200) || "",
    tags:  [...(r.tags || []), ...(r.labels || [])].map(String),
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(event, report) {
  const evWords = tokens(`${event.name} ${event.desc} ${event.keywords}`);
  const rpText  = `${report.title} ${report.desc} ${report.type} ${report.tags.join(" ")}`.toLowerCase();
  const hits = evWords.filter((w) => rpText.includes(w));
  return hits.length / Math.max(evWords.length, 1);
}

function correlate(events, reports) {
  return events.map((event) => {
    const scored = reports
      .map((r) => ({ r, score: matchScore(event, r) }))
      .filter((x) => x.score > 0.06)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    return { event, matches: scored };
  });
}

// ─── sub-components ────────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: "1 1 0", minWidth: 55, background: "rgba(0,0,0,0.3)",
      border: `1px solid ${color}33`, borderRadius: 6,
      padding: "6px 8px", textAlign: "center",
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: MONO }}>{value}</div>
      <div style={{ fontSize: 9, color: DIM, letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ScoreBar({ score }) {
  const color = score > 0.5 ? GREEN : score > 0.25 ? AMBER : CY;
  return (
    <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, flex: 1 }}>
      <div style={{
        width: `${Math.round(score * 100)}%`, height: "100%",
        background: color, borderRadius: 2, transition: "width 0.4s ease",
      }} />
    </div>
  );
}

const TYPE_COLOR = { seismic: AMBER, crypto: CY, fx: GREEN };
const TYPE_ICON  = { seismic: "⚡", crypto: "◆", fx: "◈" };

// ─── main component ────────────────────────────────────────────────────────────

export default function LiveIntelReportCoverage() {
  const [open, setOpen]           = useState(false);
  const [pairs, setPairs]         = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [iRes, rRes] = await Promise.allSettled([
        fetch(`${apiBase()}/functions/getLiveIntel`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
        fetch(`${apiBase()}/v1/reports`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      ]);
      const events  = normaliseEvents(iRes.status === "fulfilled" ? iRes.value : {});
      const reports = normaliseReports(rRes.status === "fulfilled" ? rRes.value : []);
      setPairs(correlate(events, reports));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:lirpt-toggle", onToggle);
    return () => window.removeEventListener("jarvis:lirpt-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const reported   = pairs.filter((p) => p.matches.length >= 1);
  const unreported = pairs.filter((p) => p.matches.length === 0);

  const visible = pairs
    .filter((p) => {
      if (tab === "REPORTED")   return p.matches.length >= 1;
      if (tab === "UNREPORTED") return p.matches.length === 0;
      return true;
    })
    .filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.event.name.toLowerCase().includes(q) ||
        p.event.type.toLowerCase().includes(q) ||
        p.matches.some((m) => m.r.title.toLowerCase().includes(q))
      );
    });

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildLirptScript();
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: script }),
      });
      const json = await res.json();
      const text =
        json.response || json.reply || json.message || json.content ||
        json.answer || JSON.stringify(json).slice(0, 200);
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text } })
      );
    } catch (_) {
      // silently ignore
    } finally {
      setAssessing(false);
    }
  }

  const toggleRow = (id) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Live Intel × Reports Coverage (LIRPT)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 101,
          background: "rgba(3,5,9,0.85)", border: `1px solid ${AMBER}55`,
          borderRadius: 4, color: AMBER, fontFamily: MONO, fontSize: 9,
          letterSpacing: 1, padding: "3px 7px", cursor: "pointer",
        }}
      >
        ◈ LIRPT
        {unreported.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 8, fontWeight: 700,
          }}>
            {unreported.length}
          </span>
        )}
      </button>
    );
  }

  const TABS = ["ALL", "REPORTED", "UNREPORTED"];
  const tabColor = (t) => {
    if (t === "UNREPORTED") return AMBER;
    if (t === "REPORTED")   return GREEN;
    return CY;
  };

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 200, bottom: 48, zIndex: 101,
      width: 520, maxHeight: "75vh",
      background: BG, border: `1px solid ${AMBER}66`,
      borderRadius: 8, fontFamily: MONO, fontSize: 10,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: `1px solid ${AMBER}33`,
        background: "rgba(0,0,0,0.4)",
      }}>
        <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2 }}>
          ◈ LIVE INTEL × REPORT COVERAGE
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: "none", border: `1px solid ${CY}66`,
              borderRadius: 4, color: CY, fontFamily: MONO, fontSize: 9,
              letterSpacing: 1, padding: "2px 8px", cursor: "pointer",
            }}
          >
            {assessing ? "…" : "▶ ASSESS COVERAGE GAPS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none", border: "none", color: DIM,
              fontSize: 14, cursor: "pointer", lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="EVENTS"     value={pairs.length}       color={CY}   />
        <Tile label="REPORTS"    value={
          pairs.length > 0
            ? [...new Set(pairs.flatMap((p) => p.matches.map((m) => m.r.id)))].length
            : 0
        } color={CY} />
        <Tile label="REPORTED"   value={reported.length}    color={GREEN} />
        <Tile label="UNREPORTED" value={unreported.length}  color={AMBER} />
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 12px 6px" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${tabColor(t)}22` : "none",
              border: `1px solid ${tab === t ? tabColor(t) : DIM}`,
              borderRadius: 3, color: tab === t ? tabColor(t) : DIM,
              fontFamily: MONO, fontSize: 8, letterSpacing: 1,
              padding: "2px 6px", cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: "auto", background: "rgba(0,0,0,0.4)",
            border: `1px solid ${DIM}`, borderRadius: 3,
            color: CY, fontFamily: MONO, fontSize: 9,
            padding: "2px 6px", width: 120, outline: "none",
          }}
        />
      </div>

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 12px" }}>
        {loading && (
          <div style={{ color: DIM, padding: "8px 0" }}>◌ loading…</div>
        )}
        {error && (
          <div style={{ color: RED, padding: "4px 0" }}>⚠ {error}</div>
        )}
        {!loading && visible.length === 0 && !error && (
          <div style={{ color: DIM, padding: "8px 0" }}>no results</div>
        )}
        {visible.map((p) => {
          const status = p.matches.length >= 1 ? "REPORTED" : "UNREPORTED";
          const statusColor = status === "REPORTED" ? GREEN : AMBER;
          const typeColor = TYPE_COLOR[p.event.type] || CY;
          const typeIcon  = TYPE_ICON[p.event.type] || "◈";
          const isExp = expanded[p.event.id];
          return (
            <div
              key={p.event.id}
              style={{
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                paddingBottom: 6, marginBottom: 6,
              }}
            >
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  cursor: "pointer", padding: "4px 0",
                }}
                onClick={() => toggleRow(p.event.id)}
              >
                <span style={{ color: typeColor, fontSize: 10, flexShrink: 0 }}>
                  {typeIcon}
                </span>
                <span style={{
                  fontSize: 8, border: `1px solid ${statusColor}`,
                  borderRadius: 3, color: statusColor,
                  padding: "1px 4px", letterSpacing: 1, flexShrink: 0,
                }}>
                  {status}
                </span>
                <span style={{
                  color: CY, flex: 1, overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {p.event.name}
                </span>
                <span style={{ color: DIM, fontSize: 8, flexShrink: 0 }}>
                  {p.event.type} · {p.matches.length} rpt
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>
                  {isExp ? "▲" : "▼"}
                </span>
              </div>

              {isExp && (
                <div style={{ paddingLeft: 16, paddingBottom: 4 }}>
                  <div style={{ color: DIM, fontSize: 8, marginBottom: 4 }}>
                    {p.event.desc}
                  </div>
                  {p.matches.length === 0 ? (
                    <div style={{ color: AMBER, fontSize: 9 }}>
                      ⚠ no report covers this live event — UNREPORTED gap
                    </div>
                  ) : (
                    p.matches.map(({ r, score }) => (
                      <div key={r.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        marginBottom: 3,
                      }}>
                        <span style={{
                          color: GREEN, fontSize: 9, flex: 1,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {r.title}
                        </span>
                        {r.type && (
                          <span style={{ color: DIM, fontSize: 8, flexShrink: 0 }}>
                            {r.type}
                          </span>
                        )}
                        <ScoreBar score={score} />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: "4px 12px", borderTop: `1px solid ${AMBER}22`,
        color: DIM, fontSize: 8, letterSpacing: 1,
        display: "flex", justifyContent: "space-between",
      }}>
        <span>LIRPT · /functions/getLiveIntel × /v1/reports</span>
        <span
          onClick={load}
          style={{ cursor: "pointer", color: CY }}
          title="refresh now"
        >
          ↺ {REFRESH_MS / 1000}s
        </span>
      </div>
    </div>
  );
}
