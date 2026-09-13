/**
 * OpsEventRiskSignalNexus — F703
 * "JARVIS, oersk / ops event risk / event risk signal /
 *  risk-backed events / which events have risk signals /
 *  event risk coverage / ops event risk nexus"
 * Cross-references /v1/ops/events against /entities/RiskSignal.
 * SIGNAL-BACKED events (≥1 risk signal keyword-match) vs QUIET (no risk backing).
 * Coverage % tile; ALL/SIGNAL-BACKED/QUIET filter tabs + search;
 * click-to-expand matched signals with severity badge + hit count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 155_260;
const Z_INDEX  = 239;

const OERSK_RE =
  /\boersk\b|\bops.?event.?risk\b|\bevent.?risk.?signal\b|\brisk.?backed.?events?\b|\bwhich.?events?.?have.?risk\b|\bevent.?risk.?coverage\b|\bops.?event.?risk.?nexus\b/i;

export function isOerskQuery(text) {
  return OERSK_RE.test(text || "");
}

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

function normaliseEvents(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.events)
    ? data.events
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((e, i) => ({
    id:          e.id          || `ev-${i}`,
    title:       e.title       || e.name    || e.message || e.description || `Event ${i + 1}`,
    severity:    (e.severity   || e.level   || e.priority || "INFO").toString().toUpperCase(),
    source:      e.source      || e.service || e.origin  || "",
    description: e.description || e.body    || e.details || "",
    type:        e.type        || e.kind    || "",
  }));
}

function normaliseSignals(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.signals)
    ? data.signals
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((s, i) => ({
    id:       s.id       || `sig-${i}`,
    title:    s.title    || s.name    || s.signal || `Signal ${i + 1}`,
    severity: (s.severity || s.level  || s.priority || "INFO").toString().toUpperCase(),
    source:   s.source   || s.origin  || "",
    tags:     Array.isArray(s.tags) ? s.tags.join(" ") : (s.tags || ""),
    body:     s.description || s.body || s.details || "",
  }));
}

function crossRef(events, signals) {
  return events.map((ev) => {
    const haystack = `${ev.title} ${ev.description} ${ev.source} ${ev.type}`;
    const matches = signals
      .map((sig) => {
        const needle = `${sig.title} ${sig.body} ${sig.tags} ${sig.source}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...sig, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...ev, signalBacked: matches.length > 0, signals: matches };
  });
}

export async function buildOerskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [evRes, sigRes] = await Promise.all([
      fetch(`${base}/v1/ops/events`,      { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
    ]);
    const [evData, sigData] = await Promise.all([evRes.json(), sigRes.json()]);
    const events  = normaliseEvents(evData);
    const signals = normaliseSignals(sigData);
    const rows    = crossRef(events, signals);
    const backed  = rows.filter((r) => r.signalBacked).length;
    const quiet   = rows.length - backed;
    const pct     = rows.length ? Math.round((backed / rows.length) * 100) : 0;
    if (!rows.length) return "No ops events found in the system, sir.";
    const topBacked = rows
      .filter((r) => r.signalBacked)
      .slice(0, 2)
      .map((r) => `${r.title} → ${r.signals[0]?.title || "?"}`)
      .join("; ");
    const brief = `Ops Events × Risk Signal cross-reference: ${backed} of ${rows.length} events have risk signal backing (${pct}%) — ${quiet} quiet/unlinked. Top: ${topBacked || "none"}.`;
    const aiRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Ops events cross-referenced against ${signals.length} risk signals: ${backed} signal-backed / ${quiet} quiet (coverage ${pct}%). Top matches: ${topBacked || "none"}. Provide a 2-sentence operational risk-signal coverage assessment.`,
      }),
    });
    const aiData = await aiRes.json();
    return aiData?.response || aiData?.message || brief;
  } catch (e) {
    return `Ops event risk-signal cross-reference error: ${e.message}`;
  }
}

function severityColor(sev) {
  if (!sev) return DIM;
  const s = sev.toUpperCase();
  if (s === "CRITICAL") return RED;
  if (s === "HIGH")     return "#FF6600";
  if (s === "WARNING")  return AMB;
  if (s === "INFO")     return CY;
  return GRN;
}

export default function OpsEventRiskSignalNexus() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [brief, setBrief]         = useState("");
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [evRes, sigRes] = await Promise.all([
        fetch(`${base}/v1/ops/events`,      { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
      ]);
      const [evData, sigData] = await Promise.all([evRes.json(), sigRes.json()]);
      const events  = normaliseEvents(evData);
      const signals = normaliseSignals(sigData);
      setRows(crossRef(events, signals));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:oersk-toggle", handler);
    return () => window.removeEventListener("jarvis:oersk-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const txt = await buildOerskScript();
      setBrief(txt);
      const ttsRes = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: txt }),
      });
      if (ttsRes.ok) {
        const blob  = await ttsRes.blob();
        const url   = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
      }
    } catch (e) {
      setBrief(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  };

  const backed = rows.filter((r) => r.signalBacked).length;
  const quiet  = rows.length - backed;
  const pct    = rows.length ? Math.round((backed / rows.length) * 100) : 0;

  const visible = rows.filter((r) => {
    if (tab === "SIGNAL-BACKED" && !r.signalBacked) return false;
    if (tab === "QUIET"         &&  r.signalBacked) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q) ||
        r.signals.some((s) => s.title.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const btnStyle = {
    position: "fixed",
    bottom: 8,
    left: BTN_LEFT,
    zIndex: Z_INDEX,
    background: backed > 0 ? `${RED}18` : "#0A1628CC",
    border: `1px solid ${backed > 0 ? RED : CY}55`,
    borderRadius: 6,
    color: backed > 0 ? RED : CY,
    padding: "3px 7px",
    cursor: "pointer",
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: "'JetBrains Mono',ui-monospace,monospace",
    userSelect: "none",
  };

  const panelStyle = {
    position: "fixed",
    bottom: 36,
    left: Math.min(BTN_LEFT, window.innerWidth - 420),
    width: 410,
    maxHeight: "70vh",
    overflowY: "auto",
    background: "#050D1AEE",
    border: `1px solid ${RED}44`,
    borderRadius: 8,
    zIndex: Z_INDEX + 1,
    display: "flex",
    flexDirection: "column",
    padding: 12,
    fontFamily: "'JetBrains Mono',ui-monospace,monospace",
    fontSize: 10,
    color: "#DCEBF5",
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen((o) => !o)}>
        ◈ OERSK
        {backed > 0 && (
          <span style={{ marginLeft: 4, background: RED, color: "#fff", borderRadius: 3, padding: "0 4px" }}>
            {backed}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: RED, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>
              ◈ OPS EVENTS × RISK SIGNALS
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
            >
              ✕
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[
              { label: "EVENTS",        val: rows.length, color: CY  },
              { label: "RISK SIGNALS",  val: rows.reduce((n, r) => n + r.signals.length, 0), color: "#A070FF" },
              { label: "SIGNAL-BACKED", val: backed,      color: RED  },
              { label: "QUIET",         val: quiet,       color: AMB  },
              { label: "COVERAGE",      val: `${pct}%`,   color: pct >= 50 ? GRN : AMB },
            ].map((t) => (
              <div
                key={t.label}
                style={{
                  flex: 1,
                  background: "rgba(0,20,50,0.6)",
                  border: `1px solid ${t.color}33`,
                  borderRadius: 5,
                  padding: "4px 2px",
                  textAlign: "center",
                }}
              >
                <div style={{ color: t.color, fontWeight: 700, fontSize: 11 }}>{t.val}</div>
                <div style={{ color: DIM, fontSize: 8, marginTop: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Tabs + search */}
          <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 8 }}>
            {["ALL", "SIGNAL-BACKED", "QUIET"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? RED : "rgba(0,20,50,0.5)",
                  color: tab === t ? "#fff" : DIM,
                  border: "none",
                  borderRadius: 4,
                  padding: "2px 7px",
                  cursor: "pointer",
                  fontSize: 9,
                  fontWeight: tab === t ? 700 : 400,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search events…"
              style={{
                marginLeft: "auto",
                background: "rgba(0,10,30,0.8)",
                border: `1px solid ${CY}33`,
                color: "#DCEBF5",
                borderRadius: 4,
                padding: "2px 6px",
                fontSize: 9,
                width: 110,
                outline: "none",
              }}
            />
          </div>

          {/* Error */}
          {err && (
            <div style={{ color: RED, fontSize: 9, marginBottom: 6 }}>Error: {err}</div>
          )}

          {/* Event rows */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading && !rows.length && (
              <div style={{ color: CY, textAlign: "center", padding: 12 }}>loading…</div>
            )}
            {!loading && !visible.length && (
              <div style={{ color: DIM, textAlign: "center", padding: 12 }}>no events</div>
            )}
            {visible.map((ev) => {
              const isExp = expanded === ev.id;
              return (
                <div
                  key={ev.id}
                  onClick={() => setExpanded(isExp ? null : ev.id)}
                  style={{
                    padding: "6px 8px",
                    marginBottom: 4,
                    borderRadius: 5,
                    background: isExp ? "rgba(255,68,68,0.08)" : "rgba(0,10,30,0.4)",
                    border: `1px solid ${ev.signalBacked ? RED : DIM}33`,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: ev.signalBacked ? RED : DIM,
                        flexShrink: 0,
                        display: "inline-block",
                      }}
                    />
                    <span style={{ flex: 1, color: "#DCEBF5", fontSize: 10 }}>{ev.title}</span>
                    {ev.severity !== "INFO" && (
                      <span
                        style={{
                          fontSize: 8,
                          color: severityColor(ev.severity),
                          border: `1px solid ${severityColor(ev.severity)}55`,
                          borderRadius: 3,
                          padding: "0 4px",
                        }}
                      >
                        {ev.severity}
                      </span>
                    )}
                    {ev.signalBacked ? (
                      <span style={{ color: RED, fontSize: 9 }}>
                        {ev.signals.length} signal{ev.signals.length !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span style={{ color: DIM, fontSize: 9 }}>QUIET</span>
                    )}
                    <span style={{ color: DIM, fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 6, paddingLeft: 13 }}>
                      {ev.source && (
                        <div style={{ color: DIM, fontSize: 9, marginBottom: 4 }}>
                          source: {ev.source}
                        </div>
                      )}
                      {ev.signalBacked && ev.signals.length > 0 && (
                        <div>
                          <div style={{ color: RED, fontSize: 9, marginBottom: 3 }}>
                            Matched risk signals:
                          </div>
                          {ev.signals.map((sig) => (
                            <div
                              key={sig.id}
                              style={{
                                background: "rgba(255,40,40,0.1)",
                                border: `1px solid ${severityColor(sig.severity)}44`,
                                borderRadius: 4,
                                padding: "3px 7px",
                                marginBottom: 3,
                                fontSize: 9,
                              }}
                            >
                              <span
                                style={{
                                  color: severityColor(sig.severity),
                                  fontWeight: 700,
                                  marginRight: 5,
                                }}
                              >
                                [{sig.severity}]
                              </span>
                              <span style={{ color: "#DCEBF5" }}>{sig.title}</span>
                              <span style={{ color: DIM, marginLeft: 6 }}>{sig.hits} hit{sig.hits !== 1 ? "s" : ""}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${DIM}33` }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? DIM : RED,
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "3px 10px",
                cursor: assessing ? "not-allowed" : "pointer",
                fontWeight: 700,
                fontSize: 10,
                fontFamily: "inherit",
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            <button
              onClick={load}
              style={{
                background: "rgba(0,20,50,0.7)",
                color: CY,
                border: `1px solid ${CY}33`,
                borderRadius: 4,
                padding: "3px 7px",
                cursor: "pointer",
                fontSize: 10,
                fontFamily: "inherit",
              }}
            >
              ↺
            </button>
            {brief && (
              <span
                style={{
                  flex: 1,
                  color: DIM,
                  fontSize: 8,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {brief}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
