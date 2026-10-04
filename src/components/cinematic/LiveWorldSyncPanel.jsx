/**
 * LiveWorldSyncPanel — F111 (LIVSYNC).
 *
 * Correlates live world events from /functions/getLiveIntel (earthquakes,
 * crypto moves, FX spikes) against active scenarios AND risk signals to surface
 * TRIPLE_ALERT moments — events that simultaneously trigger both a known
 * scenario response plan AND an active risk domain.
 *
 * Data sources:
 *   /functions/getLiveIntel   → live world events (quakes / crypto / FX)
 *   /v1/scenario/list         → active response scenarios
 *   /entities/RiskSignal      → active risk signals (threat domains)
 *
 * Classification per live event (via shared keyword tokens):
 *   TRIPLE_ALERT    — ≥1 scenario match AND ≥1 risk signal match
 *   SCENARIO_ONLY   — matches a scenario but no risk signal
 *   RISK_ONLY       — matches a risk signal but no scenario
 *   AMBIENT         — no operational match (background noise)
 *
 * Visual:
 *   • Stat tiles: EVENTS / SCENARIOS / RISK SIGNALS / TRIPLE ALERTS / AMBIENT
 *   • Filter tabs: ALL / TRIPLE_ALERT / SCENARIO_ONLY / RISK_ONLY / AMBIENT
 *   • Expandable rows → amber scenario bars + red risk-severity bars
 *   • Red pulse on TRIPLE_ALERT count
 *   • ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 *
 * Toggle: ⚡ LIVSYNC  left:987140  bottom:8  zIndex:134
 * Event:  jarvis:livsync-toggle
 * Wired:  App.jsx + JarvisBrain.jsx (isLivsyncQuery / buildLivsyncScript)
 *
 * Voice: "livsync" / "live sync" / "world convergence" / "live intel convergence" /
 *        "triple alert" / "world alert" / "real world convergence" / "live scenario" /
 *        "live risk" / "world scenario risk"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const RED   = "#FF3D5A";
const GREEN = "#00c878";
const MONO  = "'JetBrains Mono','Courier New',monospace";

const BTN_LEFT   = 987140;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function normalise(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function tokens(text) {
  if (!text) return [];
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(t => t.length > 2);
}

function overlap(tokA, tokB) {
  const setB = new Set(tokB);
  return tokA.filter(t => setB.has(t));
}

function pct(hits, total) {
  if (!total) return 0;
  return Math.round((hits / total) * 100);
}

function eventType(ev) {
  if (ev._kind === "quake" || ev.magnitude != null) return "SEISMIC";
  if (ev._kind === "crypto" || ev.symbol != null || ev.coin != null) return "CRYPTO";
  if (ev._kind === "fx"    || ev.pair   != null) return "FX";
  return "EVENT";
}

function eventLabel(ev) {
  const kind = eventType(ev);
  if (kind === "SEISMIC") {
    const mag  = ev.magnitude != null ? `M${ev.magnitude}` : "";
    const loc  = ev.place || ev.location || "";
    return [mag, loc].filter(Boolean).join(" – ") || "Earthquake";
  }
  if (kind === "CRYPTO") {
    const sym = ev.symbol || ev.coin || ev.name || "Crypto";
    const chg = ev.change_pct != null ? `${ev.change_pct > 0 ? "+" : ""}${ev.change_pct.toFixed(1)}%` : "";
    return [sym, chg].filter(Boolean).join(" ");
  }
  if (kind === "FX") {
    const pair = ev.pair || ev.currency || "FX";
    const rate = ev.rate != null ? String(ev.rate) : "";
    return [pair, rate].filter(Boolean).join(" @ ");
  }
  return ev.title || ev.name || ev.description || "Event";
}

function eventTokens(ev) {
  const kind = eventType(ev);
  if (kind === "SEISMIC") return tokens([ev.place, ev.location, ev.region, "earthquake seismic tremor quake geology tectonic"].join(" "));
  if (kind === "CRYPTO")  return tokens([ev.symbol, ev.coin, ev.name, "crypto currency digital asset blockchain market finance investment"].join(" "));
  if (kind === "FX")      return tokens([ev.pair, ev.currency, "currency forex exchange rate financial market investment economics"].join(" "));
  return tokens([ev.title, ev.name, ev.description, ev.category].join(" "));
}

async function loadData() {
  const base = apiBase();
  const hdr  = authHdr();

  const [intelRaw, scenariosRaw, risksRaw] = await Promise.all([
    fetch(`${base}/functions/getLiveIntel`,   { headers: hdr }).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/v1/scenario/list`,          { headers: hdr }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/RiskSignal`,       { headers: hdr }).then(r => r.json()).catch(() => []),
  ]);

  const allEvents = [
    ...(intelRaw.earthquakes || intelRaw.quakes || []).map(e => ({ ...e, _kind: "quake" })),
    ...(intelRaw.crypto || []).map(e => ({ ...e, _kind: "crypto" })),
    ...(intelRaw.fx || intelRaw.forex || []).map(e => ({ ...e, _kind: "fx" })),
  ];

  const scenarios = normalise(scenariosRaw).slice(0, 200);
  const risks     = normalise(risksRaw);

  const scenToks = scenarios.map(s => ({
    id:    s.id || s.scenario_id || String(Math.random()),
    label: s.name || s.title || s.scenario_id || "Scenario",
    toks:  tokens([s.name, s.title, s.description, s.category, s.domain].join(" ")),
  }));

  const riskToks = risks.map(r => ({
    id:    r.id || r.name,
    label: r.name || r.title || String(r.id),
    sev:   (r.severity || "").toLowerCase(),
    toks:  tokens([r.name, r.title, r.description, r.category, r.source].join(" ")),
  }));

  const rows = allEvents.map(ev => {
    const evToks = eventTokens(ev);

    const matchedScenarios = scenToks.map(s => {
      const hits = overlap(evToks, s.toks);
      return hits.length ? { ...s, hits: hits.length, pct: pct(hits.length, s.toks.length) } : null;
    }).filter(Boolean).sort((a, b) => b.hits - a.hits).slice(0, 5);

    const matchedRisks = riskToks.map(r => {
      const hits = overlap(evToks, r.toks);
      return hits.length ? { ...r, hits: hits.length, pct: pct(hits.length, r.toks.length) } : null;
    }).filter(Boolean).sort((a, b) => b.hits - a.hits).slice(0, 5);

    const hasScen = matchedScenarios.length > 0;
    const hasRisk = matchedRisks.length > 0;
    const cls = hasScen && hasRisk ? "TRIPLE_ALERT"
              : hasScen            ? "SCENARIO_ONLY"
              : hasRisk            ? "RISK_ONLY"
              :                      "AMBIENT";

    return {
      id:               ev.id || String(Math.random()),
      label:            eventLabel(ev),
      kind:             eventType(ev),
      cls,
      matchedScenarios,
      matchedRisks,
    };
  });

  const counts = {
    events:       rows.length,
    scenarios:    scenarios.length,
    risks:        risks.length,
    tripleAlert:  rows.filter(r => r.cls === "TRIPLE_ALERT").length,
    scenarioOnly: rows.filter(r => r.cls === "SCENARIO_ONLY").length,
    riskOnly:     rows.filter(r => r.cls === "RISK_ONLY").length,
    ambient:      rows.filter(r => r.cls === "AMBIENT").length,
  };

  return { rows, counts };
}

// ── exported helpers for JarvisBrain ─────────────────────────────────────────

export function isLivsyncQuery(q) {
  const s = q.toLowerCase();
  return s.includes("livsync") || s.includes("live sync") ||
    s.includes("world convergence") || s.includes("live intel convergence") ||
    s.includes("triple alert") || s.includes("world alert") ||
    s.includes("real world convergence") || s.includes("live scenario") ||
    s.includes("world scenario risk") || s.includes("live risk sync");
}

export async function buildLivsyncScript() {
  try {
    const { counts } = await loadData();
    const tripleMsg = counts.tripleAlert > 0
      ? `${counts.tripleAlert} TRIPLE ALERT event(s) — real-world signals simultaneously matching active scenarios AND risk domains. Immediate review recommended.`
      : "No live world events are currently aligned to both scenarios and risk signals.";
    return (
      `Live world convergence sync: ${counts.events} world events scanned ` +
      `(quakes, crypto moves, FX spikes). ` +
      `Cross-referenced against ${counts.scenarios} scenarios and ${counts.risks} risk signals. ` +
      `${tripleMsg} ` +
      `Scenario-only: ${counts.scenarioOnly}. Risk-only: ${counts.riskOnly}. ` +
      `Ambient (no match): ${counts.ambient}.`
    );
  } catch {
    return "Live world convergence data unavailable.";
  }
}

// ── colour helpers ────────────────────────────────────────────────────────────

function clsColor(cls) {
  return cls === "TRIPLE_ALERT"   ? RED
       : cls === "SCENARIO_ONLY"  ? AMBER
       : cls === "RISK_ONLY"      ? "#c87fff"
       :                            "rgba(255,255,255,0.25)";
}

function kindColor(kind) {
  return kind === "SEISMIC" ? AMBER : kind === "CRYPTO" ? GREEN : CY;
}

function sevColor(sev) {
  return sev === "critical" ? RED : sev === "high" ? AMBER : CY;
}

const TABS = ["ALL", "TRIPLE_ALERT", "SCENARIO_ONLY", "RISK_ONLY", "AMBIENT"];

// ── component ─────────────────────────────────────────────────────────────────

export default function LiveWorldSyncPanel() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [counts, setCounts]     = useState({ events:0, scenarios:0, risks:0, tripleAlert:0, scenarioOnly:0, riskOnly:0, ambient:0 });
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssess]  = useState(false);
  const [assessment, setAsmTxt] = useState("");
  const timer = useRef(null);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:livsync-toggle", handler);
    return () => window.removeEventListener("jarvis:livsync-toggle", handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadData();
      setRows(result.rows);
      setCounts(result.counts);
    } catch (e) {
      setError(e.message || "Load error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssess(true);
    setAsmTxt("");
    try {
      const script = await buildLivsyncScript();
      setAsmTxt(script);
      const base = apiBase();
      const chatRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHdr() },
        body: JSON.stringify({ message: script }),
      });
      if (chatRes.ok) {
        const d = await chatRes.json();
        const reply = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
        if (reply) {
          await fetch(`${base}/v1/voice/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHdr() },
            body: JSON.stringify({ text: reply, voice: "onyx" }),
          });
          setAsmTxt(reply);
        }
      }
    } catch {
      setAsmTxt("Assessment failed.");
    } finally {
      setAssess(false);
    }
  }, []);

  const filtered = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.label.toLowerCase().includes(s) || r.kind.toLowerCase().includes(s) || r.cls.includes(s.toUpperCase());
    }
    return true;
  });

  const tripleCount = counts.tripleAlert;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 134,
          background: "rgba(0,0,0,0.75)", border: `1px solid ${RED}`,
          color: tripleCount > 0 ? RED : CY, fontFamily: MONO,
          fontSize: 10, padding: "3px 7px", cursor: "pointer", borderRadius: 4,
          animation: tripleCount > 0 ? "jarvis-pulse 1.4s infinite" : "none",
        }}
      >
        ⚡ LIVSYNC{tripleCount > 0 ? ` ×${tripleCount}` : ""}
      </button>
    );
  }

  const panelW = 680;

  return (
    <div style={{
      position: "fixed", top: 60, right: 16, width: panelW,
      maxHeight: "85vh", overflowY: "auto", zIndex: 5000,
      background: "rgba(0,4,12,0.97)", border: `1px solid ${RED}`,
      borderRadius: 10, fontFamily: MONO, color: CY,
      boxShadow: `0 0 40px rgba(255,61,90,0.3)`,
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: `1px solid rgba(255,61,90,0.3)` }}>
        <span style={{ fontSize: 12, color: RED, fontWeight: 700, letterSpacing: 2 }}>
          ⚡ LIVE WORLD SYNC  <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>real-world convergence</span>
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none",
          color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
        {[
          ["EVENTS",       counts.events,       CY],
          ["SCENARIOS",    counts.scenarios,     AMBER],
          ["RISK SIGNALS", counts.risks,         "#c87fff"],
          ["TRIPLE ALERTS",tripleCount,          RED],
          ["AMBIENT",      counts.ambient,       "rgba(255,255,255,0.4)"],
        ].map(([label, val, col]) => (
          <div key={label} style={{ flex: "1 1 100px", background: "rgba(0,0,0,0.5)",
            border: `1px solid ${col}33`, borderRadius: 6, padding: "6px 10px",
            animation: label === "TRIPLE ALERTS" && tripleCount > 0 ? "jarvis-pulse 1.4s infinite" : "none" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ padding: "0 14px 8px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            style={{ background: filter === t ? "rgba(41,231,255,0.15)" : "none",
              border: `1px solid ${filter === t ? CY : "rgba(255,255,255,0.2)"}`,
              color: filter === t ? CY : "rgba(255,255,255,0.5)",
              fontFamily: MONO, fontSize: 9, padding: "3px 8px", borderRadius: 4, cursor: "pointer" }}>
            {t}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search…"
          style={{ marginLeft: "auto", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
            color: CY, fontFamily: MONO, fontSize: 10, padding: "3px 8px", borderRadius: 4, width: 130 }} />
        <button onClick={assess} disabled={assessing}
          style={{ background: "rgba(41,231,255,0.1)", border: `1px solid ${CY}`,
            color: CY, fontFamily: MONO, fontSize: 9, padding: "3px 9px", borderRadius: 4, cursor: "pointer" }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {assessment && (
        <div style={{ margin: "0 14px 8px", padding: "8px 10px",
          background: "rgba(41,231,255,0.07)", border: `1px solid ${CY}33`,
          borderRadius: 6, fontSize: 10, color: "rgba(255,255,255,0.8)", lineHeight: 1.55 }}>
          {assessment}
        </div>
      )}

      {loading && <div style={{ padding: 14, fontSize: 10, color: AMBER }}>Loading world events…</div>}
      {error   && <div style={{ padding: 14, fontSize: 10, color: RED }}>⚠ {error}</div>}

      {/* rows */}
      <div style={{ padding: "0 14px 14px" }}>
        {filtered.length === 0 && !loading && (
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", padding: "10px 0" }}>No events match filter.</div>
        )}
        {filtered.map(row => {
          const isExp = expanded === row.id;
          const col   = clsColor(row.cls);
          const kCol  = kindColor(row.kind);
          return (
            <div key={row.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : row.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                  padding: "6px 10px", borderRadius: 6,
                  background: isExp ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.4)",
                  border: `1px solid ${col}55`,
                  animation: row.cls === "TRIPLE_ALERT" ? "jarvis-pulse 1.4s infinite" : "none" }}>
                <span style={{ fontSize: 9, color: kCol, minWidth: 52, fontWeight: 700 }}>{row.kind}</span>
                <span style={{ flex: 1, fontSize: 10, color: "rgba(255,255,255,0.85)", overflow: "hidden",
                  whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{row.label}</span>
                <span style={{ fontSize: 9, color: col, fontWeight: 700, minWidth: 90, textAlign: "right" }}>{row.cls}</span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "8px 14px", background: "rgba(0,0,0,0.6)",
                  borderRadius: "0 0 6px 6px", border: `1px solid ${col}33`, borderTop: "none" }}>
                  {row.matchedScenarios.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 9, color: AMBER, marginBottom: 4, letterSpacing: 1 }}>SCENARIO MATCHES</div>
                      {row.matchedScenarios.map(s => (
                        <div key={s.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.75)", overflow: "hidden",
                              whiteSpace: "nowrap", textOverflow: "ellipsis", maxWidth: "75%" }}>{s.label}</span>
                            <span style={{ fontSize: 9, color: AMBER }}>{s.pct}%</span>
                          </div>
                          <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${s.pct}%`, background: AMBER,
                              borderRadius: 2, transition: "width 0.4s" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {row.matchedRisks.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: RED, marginBottom: 4, letterSpacing: 1 }}>RISK SIGNAL MATCHES</div>
                      {row.matchedRisks.map(r => (
                        <div key={r.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.75)", overflow: "hidden",
                              whiteSpace: "nowrap", textOverflow: "ellipsis", maxWidth: "70%" }}>{r.label}</span>
                            <span style={{ fontSize: 9, color: sevColor(r.sev) }}>{r.sev || "—"} · {r.pct}%</span>
                          </div>
                          <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${r.pct}%`, background: sevColor(r.sev),
                              borderRadius: 2, transition: "width 0.4s" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {row.matchedScenarios.length === 0 && row.matchedRisks.length === 0 && (
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>No operational matches. Ambient background signal.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{ padding: "6px 14px 10px", borderTop: "1px solid rgba(255,255,255,0.07)",
        fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
        {filtered.length}/{rows.length} events · 60-s auto-refresh · /functions/getLiveIntel × /v1/scenario/list × /entities/RiskSignal
      </div>
    </div>
  );
}
