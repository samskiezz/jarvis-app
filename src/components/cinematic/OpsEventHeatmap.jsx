/**
 * OpsEventHeatmap — F70.
 *
 * Fetches /v1/ops/events every 60 s; buckets events by hour-of-day (0–23)
 * from their timestamps; renders a 24-cell frequency heatmap showing when
 * ops events cluster (QUIET=blue → SURGE=red); highlights the busiest and
 * quietest hours; ALL/CRITICAL/WARNING/INFO severity filter tabs; SURGE badge
 * on the button when peak-hour density is high; ▶ ASSESS → /v1/jarvis/agent/chat
 * 2-sentence temporal pattern brief + TTS via jarvis:speak-dossier.
 *
 * Wired in JarvisBrain: "event heatmap" / "ops frequency" / "event timing" /
 *   "when are events peaking" / "evthm"
 *   → jarvis:evthm-toggle + buildEvthmScript()
 *
 * Toggle button: ◈ EVTHM at left:16620, zIndex 65.
 * 60 s auto-refresh. Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const RED   = "#FF3D5A";
const AMB   = "#F5A623";
const GRN   = "#34D399";
const DIM   = "#4E6A7A";
const BTN_LEFT = 16620;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isEvthmQuery(q) {
  return /event.heatmap|ops.frequenc|event.timing|event.densit|when.are.events|hourly.event|evthm|peak.hour|ops.peak/i.test(
    q || ""
  );
}

export async function buildEvthmScript() {
  try {
    const events = await fetchEvents();
    window.dispatchEvent(new CustomEvent("jarvis:evthm-toggle"));
    const buckets = buildBuckets(events, "ALL");
    const peak = maxBucket(buckets);
    const total = events.length;
    if (!total) {
      return "Ops event heatmap is now open, sir. No events found in the current window — the hourly grid is quiet.";
    }
    return `Ops event frequency heatmap online, sir. ${total} event${total !== 1 ? "s" : ""} plotted across 24 hours. Peak activity falls around ${fmtHour(peak.hour)} with ${peak.count} event${peak.count !== 1 ? "s" : ""}. Recommend reviewing that window for operational patterns.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:evthm-toggle"));
    return "Ops event heatmap open, sir. Hourly frequency grid is loading.";
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function fetchEvents() {
  const r = await fetch(`${apiBase()}/v1/ops/events?limit=200`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error("ops/events unavailable");
  const d = await r.json();
  return Array.isArray(d) ? d : d.events || d.items || [];
}

function severityLabel(e) {
  const raw = (e.severity_label || e.severity_name || "").toUpperCase();
  if (raw === "CRITICAL" || (typeof e.severity === "number" && e.severity >= 80)) return "CRITICAL";
  if (raw === "WARNING"  || (typeof e.severity === "number" && e.severity >= 40)) return "WARNING";
  return "INFO";
}

function eventHour(e) {
  const ts = e.timestamp || e.created_at || e.ts || e.occurred_at || null;
  if (!ts) return null;
  try {
    return new Date(ts).getHours();
  } catch {
    return null;
  }
}

function buildBuckets(events, tab) {
  const filtered = tab === "ALL" ? events : events.filter((e) => severityLabel(e) === tab);
  const counts = new Array(24).fill(0);
  filtered.forEach((e) => {
    const h = eventHour(e);
    if (h !== null && h >= 0 && h < 24) counts[h]++;
  });
  return counts.map((count, hour) => ({ hour, count }));
}

function maxBucket(buckets) {
  return buckets.reduce(
    (best, b) => (b.count > best.count ? b : best),
    { hour: 0, count: 0 }
  );
}

function fmtHour(h) {
  const suffix = h >= 12 ? "pm" : "am";
  const disp = h % 12 === 0 ? 12 : h % 12;
  return `${disp}${suffix}`;
}

function heatColour(count, maxCount) {
  if (maxCount === 0 || count === 0) return "rgba(18,32,48,0.6)";
  const ratio = count / maxCount;
  if (ratio < 0.25) return "rgba(0,48,80,0.75)";
  if (ratio < 0.5)  return "rgba(0,100,120,0.80)";
  if (ratio < 0.75) return "rgba(220,130,20,0.85)";
  return "rgba(255,40,60,0.90)";
}

// ─── component ────────────────────────────────────────────────────────────────

export default function OpsEventHeatmap() {
  const [visible, setVisible]   = useState(false);
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState("ALL");
  const [assessment, setAssessment] = useState("");
  const [assessing, setAssessing]   = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:evthm-toggle", onToggle);
    return () => window.removeEventListener("jarvis:evthm-toggle", onToggle);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEvents();
      setEvents(data);
    } catch {
      // leave existing data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [visible, load]);

  const buckets   = buildBuckets(events, tab);
  const peak      = maxBucket(buckets);
  const maxCount  = peak.count;
  const surgeHours = buckets.filter((b) => b.count > 0 && b.count === maxCount).length;

  const assess = useCallback(async () => {
    if (assessing || !events.length) return;
    setAssessing(true);
    setAssessment("");
    try {
      const byHour = buckets
        .filter((b) => b.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((b) => `${fmtHour(b.hour)}:${b.count}`)
        .join(", ");
      const prompt =
        `In exactly 2 sentences: Given ops event frequency data showing events per hour (${byHour}), what temporal pattern does this suggest and what operational risk does that pattern imply? British-butler tone. No markdown.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      if (text) {
        setAssessment(text);
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text } })
        );
      }
    } catch {
      setAssessment("Reasoning core unreachable. Please try again.");
    } finally {
      setAssessing(false);
    }
  }, [assessing, events, buckets]);

  const critCount  = events.filter((e) => severityLabel(e) === "CRITICAL").length;
  const quietHour  = buckets.reduce(
    (best, b) => (b.count < best.count || best.count === -1 ? b : best),
    { hour: 0, count: -1 }
  );

  const TABS = ["ALL", "CRITICAL", "WARNING", "INFO"];
  const tabColour = { CRITICAL: RED, WARNING: AMB, INFO: CY, ALL: CY };

  return (
    <>
      {/* ── toggle button ── */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Ops Event Frequency Heatmap"
        style={{
          position: "fixed",
          bottom: 18,
          left: BTN_LEFT,
          zIndex: 65,
          background: visible ? `${RED}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? RED : CY}55`,
          borderRadius: 4,
          color: visible ? RED : CY,
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9,
          letterSpacing: 1.5,
          padding: "3px 8px",
          cursor: "pointer",
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        ◈ EVTHM
        {critCount > 0 && (
          <span
            style={{
              background: RED,
              color: "#fff",
              borderRadius: 8,
              fontSize: 8,
              padding: "0 4px",
              fontWeight: 700,
            }}
          >
            {critCount}
          </span>
        )}
      </button>

      {/* ── panel ── */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 54,
            left: BTN_LEFT - 420,
            zIndex: 65,
            width: 480,
            maxHeight: "68vh",
            background: "rgba(6,12,20,0.94)",
            border: `1px solid ${CY}22`,
            borderRadius: 8,
            fontFamily: "'JetBrains Mono',monospace",
            color: "#DCEBF5",
            display: "flex",
            flexDirection: "column",
            boxShadow: `0 0 40px rgba(0,0,0,0.6)`,
            backdropFilter: "blur(10px)",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "8px 14px",
              borderBottom: `1px solid ${CY}18`,
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span style={{ color: CY, fontSize: 10, letterSpacing: 2 }}>
              ◈ OPS EVENT FREQUENCY HEATMAP
            </span>
            {loading && (
              <span style={{ color: DIM, fontSize: 9, marginLeft: "auto" }}>
                ◌ loading
              </span>
            )}
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "8px 14px",
              flexShrink: 0,
            }}
          >
            {[
              { label: "EVENTS", val: events.length, col: CY },
              { label: "PEAK HOUR", val: events.length ? fmtHour(peak.hour) : "—", col: AMB },
              { label: "PEAK COUNT", val: events.length ? peak.count : "—", col: peak.count >= 5 ? RED : AMB },
              { label: "QUIET HOUR", val: events.length ? fmtHour(quietHour.hour) : "—", col: GRN },
            ].map(({ label, val, col }) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  background: `${col}0d`,
                  border: `1px solid ${col}22`,
                  borderRadius: 4,
                  padding: "5px 6px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 8, color: DIM, letterSpacing: 1 }}>{label}</div>
                <div style={{ fontSize: 13, color: col, fontWeight: 700 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: "0 14px 8px",
              flexShrink: 0,
            }}
          >
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: "3px 10px",
                  background: tab === t ? `${tabColour[t]}22` : "transparent",
                  border: `1px solid ${tab === t ? tabColour[t] : DIM + "44"}`,
                  borderRadius: 3,
                  color: tab === t ? tabColour[t] : DIM,
                  fontSize: 9,
                  letterSpacing: 1,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* 24-cell heatmap grid (4 rows × 6 cols) */}
          <div style={{ padding: "0 14px 10px", flexShrink: 0 }}>
            {events.length === 0 && !loading ? (
              <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: "16px 0" }}>
                No events available to plot.
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(6, 1fr)",
                  gap: 4,
                }}
              >
                {HOURS.map((h) => {
                  const b = buckets[h];
                  const bg = heatColour(b.count, maxCount);
                  const isCurrent = new Date().getHours() === h;
                  return (
                    <div
                      key={h}
                      title={`${fmtHour(h)} — ${b.count} event${b.count !== 1 ? "s" : ""}`}
                      style={{
                        background: bg,
                        border: isCurrent
                          ? `1px solid ${CY}88`
                          : `1px solid rgba(255,255,255,0.06)`,
                        borderRadius: 3,
                        padding: "6px 4px 4px",
                        textAlign: "center",
                        minHeight: 48,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 2,
                      }}
                    >
                      <div style={{ fontSize: 7, color: "rgba(255,255,255,0.45)", letterSpacing: 0.5 }}>
                        {fmtHour(h)}
                      </div>
                      <div
                        style={{
                          fontSize: b.count > 0 ? 14 : 10,
                          fontWeight: 700,
                          color:
                            b.count === maxCount && maxCount > 0
                              ? RED
                              : b.count > 0
                              ? AMB
                              : "rgba(255,255,255,0.2)",
                        }}
                      >
                        {b.count > 0 ? b.count : "·"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Legend */}
          <div
            style={{
              padding: "0 14px 8px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 8,
              color: DIM,
              flexShrink: 0,
            }}
          >
            <span>QUIET</span>
            {["rgba(0,48,80,0.75)", "rgba(0,100,120,0.80)", "rgba(220,130,20,0.85)", "rgba(255,40,60,0.90)"].map(
              (c, i) => (
                <span
                  key={i}
                  style={{ width: 18, height: 8, background: c, display: "inline-block", borderRadius: 2 }}
                />
              )
            )}
            <span>SURGE</span>
            <span style={{ marginLeft: "auto", color: CY }}>
              ◌ NOW = outlined cell
            </span>
          </div>

          {/* ASSESS button */}
          <div style={{ padding: "0 14px 8px", flexShrink: 0 }}>
            <button
              onClick={assess}
              disabled={assessing || events.length === 0}
              style={{
                width: "100%",
                padding: "5px 0",
                background: assessing ? `${CY}18` : "transparent",
                border: `1px solid ${CY}44`,
                borderRadius: 4,
                color: assessing ? DIM : CY,
                fontSize: 9,
                letterSpacing: 1.5,
                cursor: assessing || events.length === 0 ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {assessing ? "◌ ANALYSING…" : "▶ JARVIS ASSESS TEMPORAL PATTERN"}
            </button>
          </div>

          {/* Assessment text */}
          {assessment && (
            <div
              style={{
                margin: "0 14px 10px",
                padding: "8px 10px",
                background: `${CY}0a`,
                border: `1px solid ${CY}22`,
                borderRadius: 4,
                fontSize: 11,
                color: "#DCEBF5",
                lineHeight: 1.55,
                flexShrink: 0,
              }}
            >
              {assessment}
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              padding: "5px 14px",
              borderTop: `1px solid ${CY}18`,
              fontSize: 9,
              color: DIM,
              letterSpacing: 1,
              flexShrink: 0,
            }}
          >
            /v1/ops/events · 24-hour bucket heatmap · 60s auto-refresh · outlined = current hour
          </div>
        </div>
      )}
    </>
  );
}
