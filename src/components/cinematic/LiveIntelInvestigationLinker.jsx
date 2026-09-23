/**
 * LiveIntelInvestigationLinker — F210.
 *
 * Parallel-fetches /functions/getLiveIntel (real-time earthquakes + markets)
 * and /v1/investigations (open cases).
 *
 * Keyword-correlates each live-intel event against open investigation
 * titles, descriptions, and subjects to surface:
 *   LINKED   — live event with ≥1 matching open investigation
 *   UNLINKED — live event with no matching case (potential gap)
 *
 * Stat tiles: events / investigations / linked / unlinked
 * Filter tabs: LINKED / UNLINKED / ALL + text search
 * Expand event → matched investigations with relevance score.
 * ▶ ASSESS per event → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *   via jarvis:speak-dossier.
 * 5-min auto-refresh.
 *
 * Intent: "live intel investigation" / "intel case link" / "which investigations
 *         match live events" / "liilink" / "live event case" / "case intel match"
 *   → jarvis:liilink-toggle + TTS brief via buildLiilinkScript()
 *
 * Toggle: ◈ LIILINK at left:30360, bottom:8, zIndex:60.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getLiveIntel } from "@/api/backendFunctions";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF4466";

const BTN_LEFT   = 30360;
const REFRESH_MS = 300_000; // 5 min

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalisers ─────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((inv) => ({
    id:          inv.id || inv.case_id || String(Math.random()),
    title:       inv.title || inv.name || inv.case_name || "Unnamed Case",
    description: inv.description || inv.summary || inv.details || "",
    status:      (inv.status || "open").toLowerCase(),
    priority:    inv.priority || inv.severity || "",
    subject:     inv.subject || inv.target || "",
  }));
}

/** Convert getLiveIntel payload into a flat list of labelled events. */
function extractEvents(data) {
  const events = [];

  const quakes = Array.isArray(data?.earthquakes) ? data.earthquakes : [];
  quakes.forEach((q) => {
    const place = q.place || q.location || q.region || "";
    const mag   = q.mag != null ? Number(q.mag).toFixed(1) : "";
    events.push({
      id:       `quake-${q.id || place}`,
      type:     "SEISMIC",
      label:    place ? `M${mag} — ${place}` : `Magnitude ${mag} earthquake`,
      keywords: place
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2),
      mag:      Number(mag) || 0,
      raw:      q,
    });
  });

  const markets = Array.isArray(data?.markets) ? data.markets : [];
  markets.forEach((m) => {
    const sym  = m.symbol || m.ticker || m.name || "";
    const chg  = m.change_pct ?? m.changePercent ?? m.pct_change ?? null;
    const label = chg != null
      ? `${sym} ${chg >= 0 ? "+" : ""}${Number(chg).toFixed(2)}%`
      : sym;
    if (!sym) return;
    events.push({
      id:       `mkt-${sym}`,
      type:     m.asset_type === "FX" || m.type === "FX" ? "FX" : "CRYPTO",
      label,
      keywords: sym.toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/).filter((w) => w.length > 0),
      chg:      Number(chg) || 0,
      raw:      m,
    });
  });

  return events;
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(event, inv) {
  const invText = `${inv.title} ${inv.description} ${inv.subject}`.toLowerCase();
  return event.keywords.reduce((acc, w) => acc + (invText.includes(w) ? 1 : 0), 0)
    + tokens(inv.title).reduce((acc, w) => acc + (event.label.toLowerCase().includes(w) ? 1 : 0), 0);
}

function correlate(events, invs) {
  return events.map((ev) => {
    const matched = invs
      .map((inv) => ({ ...inv, _score: matchScore(ev, inv) }))
      .filter((inv) => inv._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...ev, matched };
  });
}

// ─── type colour helper ───────────────────────────────────────────────────────

function typeCol(t) {
  if (t === "SEISMIC") return RED;
  if (t === "CRYPTO")  return "#A78BFA";
  if (t === "FX")      return CY;
  return AMBER;
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const LIILINK_RE =
  /live.{0,12}intel.{0,15}invest|intel.{0,12}case.{0,12}link|which.{0,15}invest.{0,15}match.{0,10}live|liilink\b|live.{0,10}event.{0,10}case|case.{0,10}intel.{0,10}match|investigat.{0,15}live.{0,12}intel/i;

export function isLiilinkQuery(q) {
  return LIILINK_RE.test(q || "");
}

export async function buildLiilinkScript() {
  try {
    const [intelData, invRaw] = await Promise.all([
      getLiveIntel({ type: "all" }),
      fetch(`${apiBase()}/v1/investigations`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const events  = extractEvents(intelData);
    const invs    = normaliseInvestigations(invRaw);
    const corr    = correlate(events, invs);
    const linked  = corr.filter((e) => e.matched.length > 0);
    const unlinked = corr.filter((e) => e.matched.length === 0);
    return `Live intel investigation correlation complete, sir. ${events.length} live event${events.length !== 1 ? "s" : ""} cross-referenced against ${invs.length} open investigation${invs.length !== 1 ? "s" : ""}. ${linked.length} event${linked.length !== 1 ? "s" : ""} match${linked.length === 1 ? "es" : ""} active cases — I recommend reviewing those connections. ${unlinked.length} event${unlinked.length !== 1 ? "s have" : " has"} no corresponding investigation; consider opening new cases for the highest-severity items.`;
  } catch (_) {
    return "Live intel investigation linker is standing by, sir.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function LiveIntelInvestigationLinker() {
  const [visible, setVisible]     = useState(false);
  const [events, setEvents]       = useState([]);
  const [invs, setInvs]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [intelData, invRaw] = await Promise.all([
        getLiveIntel({ type: "all" }),
        fetch(`${apiBase()}/v1/investigations`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setEvents(extractEvents(intelData));
      setInvs(normaliseInvestigations(invRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:liilink-toggle", onToggle);
    return () => window.removeEventListener("jarvis:liilink-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessEvent(ev, matched) {
    setAssessing(ev.id);
    const caseList = matched.length > 0
      ? matched.map((inv) => `"${inv.title}"`).join(", ")
      : "none";
    const prompt = `As JARVIS, provide a 2-sentence operational brief on the live intel event "${ev.label}" (type: ${ev.type}) and its relationship to open investigations: ${caseList}. Comment on operational significance and recommended action.`;
    try {
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await res.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Assessment unavailable, sir.";
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
      );
    } catch (_) {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Assessment unavailable at this time, sir." },
        })
      );
    }
    setAssessing(null);
  }

  const correlated = correlate(events, invs);
  const linked     = correlated.filter((e) => e.matched.length > 0);
  const unlinked   = correlated.filter((e) => e.matched.length === 0);

  const base =
    tab === "LINKED"   ? linked   :
    tab === "UNLINKED" ? unlinked : correlated;

  const displayed = search.trim()
    ? base.filter((e) =>
        e.label.toLowerCase().includes(search.toLowerCase()) ||
        e.type.toLowerCase().includes(search.toLowerCase())
      )
    : base;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Live Intel × Investigation Linker (F210)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 60,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : `${CY}44`}`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ LIILINK
        {unlinked.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{unlinked.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: Math.max(8, BTN_LEFT - 300), zIndex: 60,
          width: 640, maxHeight: "74vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${CY}33`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}14`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
              ◈ LIVE INTEL × INVESTIGATION LINKER
            </span>
            <button
              onClick={fetchData}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${CY}33`, borderRadius: 3,
                color: `${CY}88`, padding: "2px 6px", fontSize: 7,
                cursor: "pointer", letterSpacing: 1,
              }}
            >↻ REFRESH</button>
            <button
              onClick={() => setVisible(false)}
              style={{
                background: "transparent", border: "none",
                color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1,
              }}
            >✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, marginBottom: 10,
          }}>
            {[
              ["EVENTS",       correlated.length, CY],
              ["CASES",        invs.length,        "#A78BFA"],
              ["LINKED",       linked.length,      GREEN],
              ["UNLINKED",     unlinked.length,    unlinked.length > 0 ? AMBER : "#445566"],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: "bold" }}>
                  {loading ? "…" : val}
                </div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {["ALL", "LINKED", "UNLINKED"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${CY}22` : "transparent",
                border: `1px solid ${tab === t ? CY : "#1e3040"}`,
                color: tab === t ? CY : "#445566",
                borderRadius: 4, padding: "3px 10px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search events…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.04)",
                border: `1px solid ${CY}33`, borderRadius: 4,
                color: "#DCEBF5", padding: "3px 8px", fontSize: 8,
                fontFamily: "'JetBrains Mono',monospace", outline: "none", width: 140,
              }}
            />
          </div>

          {/* Event rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating live events against open investigations…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "UNLINKED"
                ? "All live events have matching investigations."
                : "No items in this filter."}
            </div>
          ) : (
            displayed.map((ev) => {
              const isLinked = ev.matched.length > 0;
              const isOpen   = expanded === ev.id;
              const col      = typeCol(ev.type);
              return (
                <div
                  key={ev.id}
                  onClick={() => setExpanded(isOpen ? null : ev.id)}
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${isOpen ? `${CY}44` : "#1a2530"}`,
                    borderLeft: `3px solid ${isLinked ? GREEN : AMBER}`,
                    borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                    cursor: "pointer",
                  }}
                >
                  {/* Event header row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 7, color: col,
                      border: `1px solid ${col}44`,
                      borderRadius: 3, padding: "1px 5px",
                      letterSpacing: 1, whiteSpace: "nowrap",
                      textTransform: "uppercase", flexShrink: 0,
                    }}>{ev.type}</span>
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ev.label}
                    </span>
                    <span style={{
                      fontSize: 7, whiteSpace: "nowrap",
                      color: isLinked ? GREEN : AMBER,
                    }}>
                      {isLinked
                        ? `${ev.matched.length} case${ev.matched.length !== 1 ? "s" : ""}`
                        : "⚠ UNLINKED"}
                    </span>
                  </div>

                  {/* Assess button */}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 5 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); assessEvent(ev, ev.matched); }}
                      disabled={assessing === ev.id}
                      style={{
                        background: assessing === ev.id ? "#1a2530" : `${CY}18`,
                        color: assessing === ev.id ? "#445566" : CY,
                        border: `1px solid ${CY}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1,
                        cursor: assessing === ev.id ? "default" : "pointer",
                      }}
                    >
                      {assessing === ev.id ? "…assessing" : "▶ ASSESS"}
                    </button>
                  </div>

                  {/* Expanded: matched investigations */}
                  {isOpen && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}18` }}>
                      {ev.matched.length === 0 ? (
                        <div style={{
                          color: AMBER, fontSize: 8, lineHeight: 1.5,
                          background: `${AMBER}0a`, borderRadius: 4, padding: "6px 8px",
                        }}>
                          ⚠ No open investigations match this live event. Consider opening a new case.
                        </div>
                      ) : (
                        ev.matched.map((inv) => (
                          <div key={inv.id} style={{
                            background: "rgba(255,255,255,0.02)",
                            border: "1px solid #1e3040",
                            borderLeft: `3px solid ${GREEN}`,
                            borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                            display: "flex", alignItems: "flex-start", gap: 8,
                          }}>
                            {inv.status && (
                              <span style={{
                                fontSize: 7, color: inv.status === "open" ? GREEN : "#445566",
                                border: "1px solid #1e3040", borderRadius: 3,
                                padding: "1px 5px", letterSpacing: 1,
                                whiteSpace: "nowrap", flexShrink: 0, textTransform: "uppercase",
                              }}>{inv.status}</span>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: "#a0b8cc", fontSize: 10 }}>{inv.title}</div>
                              {inv.description && (
                                <div style={{ color: "#445566", fontSize: 8, marginTop: 1 }}>
                                  {inv.description.slice(0, 80)}
                                  {inv.description.length > 80 ? "…" : ""}
                                </div>
                              )}
                            </div>
                            <div style={{ fontSize: 7, color: `${GREEN}66`, whiteSpace: "nowrap", flexShrink: 0 }}>
                              match {inv._score}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{
            marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right",
          }}>
            /functions/getLiveIntel + /v1/investigations · 5-min auto-refresh · ▶ ASSESS for AI event-case brief
          </div>
        </div>
      )}
    </>
  );
}
