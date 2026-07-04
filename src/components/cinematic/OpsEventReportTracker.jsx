/**
 * OpsEventReportTracker — F124.
 *
 * Parallel-fetches /v1/ops/events + /v1/reports and keyword-correlates
 * each operational event (message / service / type) against the report
 * catalogue to surface:
 *   DOCUMENTED  — event linked to at least one report (post-incident or
 *                 analysis document exists)
 *   UNDOCUMENTED — event with no paper trail (intelligence gap)
 *
 * Stat tiles: events / reports / documented / undocumented.
 * Filter tabs: ALL | DOCUMENTED | UNDOCUMENTED + text search.
 * Expand event → matched reports with relevance score + type badge.
 * Amber badge on undocumented CRITICAL/HIGH count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence incident-documentation
 *   brief + TTS via jarvis:speak-dossier.
 *
 * Toggle:  ◈ OERPT at left:37400, bottom:8, zIndex:78.
 * Event:   jarvis:oerpt-toggle
 * Voice:   "ops report" / "event report" / "incident report" /
 *          "oerpt" / "undocumented events"
 * Refresh: 90s auto-refresh while open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const GREEN  = "#00c878";
const AMBER  = "#F5A623";
const VIOLET = "#A78BFA";
const RED    = "#FF3D5A";
const BTN_LEFT = 37400;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalisation ────────────────────────────────────────────────────────────

function normaliseEvents(raw) {
  const arr = Array.isArray(raw)         ? raw
    : Array.isArray(raw?.data)           ? raw.data
    : Array.isArray(raw?.events)         ? raw.events
    : Array.isArray(raw?.items)          ? raw.items
    : Array.isArray(raw?.results)        ? raw.results
    : [];
  return arr.map((ev, i) => ({
    id:        ev.id          || String(i),
    message:   ev.message     || ev.title    || ev.description || ev.msg   || `Event ${i + 1}`,
    severity:  (ev.severity   || ev.level    || ev.type        || "info").toLowerCase(),
    service:   ev.service     || ev.source   || ev.actor       || ev.component || "",
    eventType: ev.event_type  || ev.type     || ev.kind        || "",
    ts:        ev.timestamp   || ev.created_at || ev.time      || null,
  }));
}

function normaliseReports(raw) {
  const arr = Array.isArray(raw)         ? raw
    : Array.isArray(raw?.data)           ? raw.data
    : Array.isArray(raw?.reports)        ? raw.reports
    : Array.isArray(raw?.items)          ? raw.items
    : Array.isArray(raw?.results)        ? raw.results
    : [];
  return arr.map((r, i) => ({
    id:    r.id       || String(i),
    title: r.title    || r.name     || r.heading  || `Report ${i + 1}`,
    body:  (r.content || r.body     || r.text     || r.summary || r.description || "").toString().slice(0, 400),
    type:  r.type     || r.category || r.report_type || "",
    tags:  Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags || ""),
  }));
}

// ─── keyword correlation ──────────────────────────────────────────────────────

function tokenize(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s,;:_\-/\.]+/)
    .filter((t) => t.length > 2);
}

function relevance(ev, report) {
  const evTokens = new Set([
    ...tokenize(ev.message),
    ...tokenize(ev.service),
    ...tokenize(ev.eventType),
  ]);
  const rptTokens = [
    ...tokenize(report.title),
    ...tokenize(report.body),
    ...tokenize(report.tags),
  ];
  if (!evTokens.size || !rptTokens.length) return 0;
  const hits = rptTokens.filter((t) => evTokens.has(t)).length;
  return Math.min(100, Math.round((hits / Math.max(evTokens.size, rptTokens.length)) * 100 * 4));
}

function buildCoverage(events, reports) {
  const documented = new Set();
  const pairs = [];
  for (const ev of events) {
    for (const rpt of reports) {
      const score = relevance(ev, rpt);
      if (score >= 10) {
        documented.add(ev.id);
        pairs.push({ evId: ev.id, report: rpt, score });
      }
    }
  }
  return { documented, pairs };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isOerptQuery(q) {
  return /ops\s*report|event\s*report|incident\s*report|oerpt\b|undocumented\s*event/i.test(q || "");
}

export async function buildOerptScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [evRes, rptRes] = await Promise.all([
      fetch(`${base}/v1/ops/events`, { headers: hdr }),
      fetch(`${base}/v1/reports`,    { headers: hdr }),
    ]);
    const events  = normaliseEvents(evRes.ok  ? await evRes.json()  : []);
    const reports = normaliseReports(rptRes.ok ? await rptRes.json() : []);
    const { documented } = buildCoverage(events, reports);
    const undocumented = events.length - documented.size;
    window.dispatchEvent(new CustomEvent("jarvis:oerpt-toggle"));
    if (!events.length)
      return "No operational events on record, sir. The ops event log is empty.";
    return (
      `Ops-event report documentation tracker active, sir. ` +
      `${events.length} event${events.length !== 1 ? "s" : ""} cross-referenced against ` +
      `${reports.length} report${reports.length !== 1 ? "s" : ""}. ` +
      `${documented.size} event${documented.size !== 1 ? "s are" : " is"} DOCUMENTED ` +
      `with at least one post-incident report. ` +
      `${undocumented} event${undocumented !== 1 ? "s are" : " is"} UNDOCUMENTED — ` +
      `no paper trail on record.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:oerpt-toggle"));
    return "Ops-event report tracker is standing by, sir.";
  }
}

// ─── severity helpers ─────────────────────────────────────────────────────────

const SEV_COLOR = (s) =>
  s === "critical" ? RED
  : s === "high"   ? AMBER
  : s === "warning"  || s === "warn" ? "#F5C842"
  : s === "medium" ? "#F5A623"
  : GREEN;

// ─── component ────────────────────────────────────────────────────────────────

export default function OpsEventReportTracker() {
  const [visible,   setVisible]   = useState(false);
  const [events,    setEvents]    = useState([]);
  const [reports,   setReports]   = useState([]);
  const [coverage,  setCoverage]  = useState({ documented: new Set(), pairs: [] });
  const [loading,   setLoading]   = useState(false);
  const [search,    setSearch]    = useState("");
  const [filter,    setFilter]    = useState("all");
  const [selected,  setSelected]  = useState(null);
  const [aiMap,     setAiMap]     = useState({});
  const [aiLoading, setAiLoading] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [evRes, rptRes] = await Promise.all([
        fetch(`${base}/v1/ops/events`, { headers: hdr }),
        fetch(`${base}/v1/reports`,    { headers: hdr }),
      ]);
      const rawEvents  = normaliseEvents(evRes.ok   ? await evRes.json()  : []);
      const rawReports = normaliseReports(rptRes.ok ? await rptRes.json() : []);
      setEvents(rawEvents);
      setReports(rawReports);
      setCoverage(buildCoverage(rawEvents, rawReports));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:oerpt-toggle", onToggle);
    return () => window.removeEventListener("jarvis:oerpt-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function getAiAssessment(ev, matchedReports) {
    const eid = ev.id;
    if (aiMap[eid] || aiLoading === eid) return;
    setAiLoading(eid);
    const hasCover = matchedReports.length > 0;
    const rptNames = matchedReports.map((r) => r.title).join(", ");
    const prompt = hasCover
      ? `As JARVIS, provide a 2-sentence incident-documentation assessment for the operational event: "${ev.message}". ` +
        `This event is backed by ${matchedReports.length} report${matchedReports.length !== 1 ? "s" : ""}: ${rptNames}. ` +
        `Assess whether the documentation is sufficient and note any residual intelligence gaps.`
      : `As JARVIS, provide a 2-sentence incident-documentation assessment for the operational event: "${ev.message}" ` +
        `(severity: ${ev.severity}${ev.service ? `, service: ${ev.service}` : ""}). ` +
        `This event has NO report documentation — it is an undocumented incident. ` +
        `Recommend what report or post-incident analysis should be produced.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAiMap((prev) => ({ ...prev, [eid]: answer }));
      if (answer)
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
        );
    } catch (_) {
      setAiMap((prev) => ({ ...prev, [eid]: "Unable to reach reasoning core." }));
    } finally {
      setAiLoading(null);
    }
  }

  const undocumentedCount = events.length - coverage.documented.size;
  const critHighUndoc = events.filter(
    (ev) =>
      (ev.severity === "critical" || ev.severity === "high") &&
      !coverage.documented.has(ev.id)
  ).length;

  const filtered = events.filter((ev) => {
    if (filter === "documented"   &&  !coverage.documented.has(ev.id)) return false;
    if (filter === "undocumented" &&   coverage.documented.has(ev.id)) return false;
    if (search) {
      const s = search.toLowerCase();
      const text = [ev.message, ev.service, ev.eventType, ev.severity]
        .filter(Boolean).join(" ").toLowerCase();
      if (!text.includes(s)) return false;
    }
    return true;
  });

  const selectedMatches = selected
    ? coverage.pairs
        .filter((p) => p.evId === selected.id)
        .sort((a, b) => b.score - a.score)
        .map((p) => p.report)
    : [];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Ops Event × Report Documentation Tracker"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 78,
          height: 26,
          padding: "0 8px",
          background: visible ? `${AMBER}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? AMBER : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? AMBER : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {critHighUndoc > 0 && !visible && (
          <span
            style={{
              display: "inline-block",
              marginRight: 5,
              background: AMBER,
              color: "#000",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 9,
              lineHeight: "14px",
              textAlign: "center",
              fontWeight: 700,
            }}
          >
            {critHighUndoc > 9 ? "9+" : critHighUndoc}
          </span>
        )}
        ◈ OERPT
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 44,
            left: Math.min(BTN_LEFT, window.innerWidth - 660),
            zIndex: 78,
            width: 640,
            maxHeight: "76vh",
            display: "flex",
            flexDirection: "column",
            background: "rgba(4,10,18,0.96)",
            border: `1px solid ${AMBER}44`,
            borderTop: `2px solid ${AMBER}`,
            borderRadius: 12,
            boxShadow: `0 0 40px ${AMBER}14, 0 8px 32px rgba(0,0,0,0.75)`,
            fontFamily: "'JetBrains Mono', monospace",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderBottom: `1px solid ${AMBER}22`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: AMBER, fontSize: 13 }}>◈</span>
            <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              OPS EVENT × REPORT DOCUMENTATION
            </span>
            {loading && (
              <span style={{ marginLeft: "auto", color: "#6E8AA0", fontSize: 10 }}>loading…</span>
            )}
            <button
              onClick={() => setVisible(false)}
              style={{
                marginLeft: loading ? 0 : "auto",
                background: "transparent",
                border: "none",
                color: "#6E8AA0",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "8px 14px",
              borderBottom: "1px solid #1A2A3A",
              flexShrink: 0,
            }}
          >
            {[
              { label: "EVENTS",        val: events.length,           col: CY     },
              { label: "REPORTS",       val: reports.length,          col: VIOLET },
              { label: "DOCUMENTED",    val: coverage.documented.size, col: GREEN  },
              { label: "UNDOCUMENTED",  val: undocumentedCount,       col: AMBER  },
            ].map((t) => (
              <div
                key={t.label}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid #1A2A3A",
                  borderRadius: 6,
                  padding: "5px 8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 14, color: t.col, fontWeight: 700 }}>{t.val}</div>
                <div style={{ fontSize: 8, color: "#4E6A7A", letterSpacing: 1, marginTop: 1 }}>
                  {t.label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "7px 14px",
              borderBottom: "1px solid #1A2A3A",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            {["all", "documented", "undocumented"].map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setSelected(null); }}
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  border: `1px solid ${filter === f ? AMBER : "#2A3A4A"}`,
                  background: filter === f ? `${AMBER}22` : "transparent",
                  color: filter === f ? AMBER : "#6E8AA0",
                  fontSize: 10,
                  letterSpacing: 1,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textTransform: "uppercase",
                }}
              >
                {f}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search events…"
              style={{
                marginLeft: "auto",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid #2A3A4A",
                borderRadius: 4,
                padding: "3px 8px",
                color: "#A0B8C8",
                fontSize: 10,
                fontFamily: "inherit",
                outline: "none",
                width: 140,
              }}
            />
          </div>

          {/* Event list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
            {filtered.length === 0 && !loading && (
              <div style={{ padding: "20px 14px", color: "#4E6A7A", fontSize: 11, textAlign: "center" }}>
                No events match the current filter.
              </div>
            )}
            {filtered.map((ev) => {
              const isDoc     = coverage.documented.has(ev.id);
              const isExpanded = selected?.id === ev.id;
              const matches   = coverage.pairs
                .filter((p) => p.evId === ev.id)
                .sort((a, b) => b.score - a.score);
              const sevCol    = SEV_COLOR(ev.severity);

              return (
                <div
                  key={ev.id}
                  style={{
                    borderBottom: "1px solid #0E1E2E",
                    background: isExpanded ? "rgba(245,166,35,0.04)" : "transparent",
                  }}
                >
                  {/* Event row */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 14px",
                      cursor: "pointer",
                    }}
                    onClick={() => setSelected(isExpanded ? null : ev)}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background: isDoc ? GREEN : AMBER,
                        boxShadow: isDoc ? `0 0 6px ${GREEN}` : `0 0 6px ${AMBER}`,
                      }}
                    />
                    <span style={{
                      flex: 1,
                      color: isDoc ? "#C8E8D0" : "#D8C090",
                      fontSize: 11,
                      wordBreak: "break-word",
                    }}>
                      {ev.message}
                    </span>
                    {ev.severity && (
                      <span
                        style={{
                          fontSize: 9,
                          letterSpacing: 1,
                          color: sevCol,
                          border: `1px solid ${sevCol}55`,
                          borderRadius: 3,
                          padding: "1px 5px",
                          flexShrink: 0,
                          textTransform: "uppercase",
                        }}
                      >
                        {ev.severity}
                      </span>
                    )}
                    {ev.service && (
                      <span style={{ fontSize: 9, color: "#5E7A8A", letterSpacing: 1, flexShrink: 0 }}>
                        {ev.service}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: isDoc ? GREEN : AMBER, flexShrink: 0, marginLeft: 4 }}>
                      {isDoc ? `${matches.length} RPT` : "UNDOC"}
                    </span>
                    <span style={{ color: "#3E5A6A", fontSize: 12, flexShrink: 0 }}>
                      {isExpanded ? "▾" : "▸"}
                    </span>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div
                      style={{
                        padding: "0 14px 10px 28px",
                        borderTop: "1px solid #1A2A3A",
                        background: "rgba(0,0,0,0.2)",
                      }}
                    >
                      {/* Matched reports */}
                      {selectedMatches.length === 0 ? (
                        <div style={{ padding: "8px 0", color: "#6E8AA0", fontSize: 10 }}>
                          No matching reports found. This event has no documentation on record.
                        </div>
                      ) : (
                        selectedMatches.map((rpt) => {
                          const pairScore = coverage.pairs.find(
                            (p) => p.evId === ev.id && p.report.id === rpt.id
                          )?.score ?? 0;
                          return (
                            <div
                              key={rpt.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "5px 0",
                                borderBottom: "1px solid #0E1E2E",
                              }}
                            >
                              <span style={{ fontSize: 10, color: "#A0C8A0", flex: 1, wordBreak: "break-word" }}>
                                {rpt.title}
                              </span>
                              {rpt.type && (
                                <span
                                  style={{
                                    fontSize: 9,
                                    color: VIOLET,
                                    border: `1px solid ${VIOLET}44`,
                                    borderRadius: 3,
                                    padding: "1px 5px",
                                    flexShrink: 0,
                                  }}
                                >
                                  {rpt.type}
                                </span>
                              )}
                              <div
                                style={{
                                  width: 48,
                                  height: 4,
                                  background: "#1A2A3A",
                                  borderRadius: 2,
                                  overflow: "hidden",
                                  flexShrink: 0,
                                }}
                              >
                                <div
                                  style={{
                                    width: `${pairScore}%`,
                                    height: "100%",
                                    background: GREEN,
                                    borderRadius: 2,
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: 9, color: "#5E7A8A", width: 28, textAlign: "right", flexShrink: 0 }}>
                                {pairScore}%
                              </span>
                            </div>
                          );
                        })
                      )}

                      {/* ASSESS button */}
                      <div style={{ marginTop: 8, display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); getAiAssessment(ev, selectedMatches); }}
                          disabled={aiLoading === ev.id}
                          style={{
                            padding: "3px 10px",
                            background: `${AMBER}22`,
                            border: `1px solid ${AMBER}66`,
                            borderRadius: 4,
                            color: AMBER,
                            fontSize: 10,
                            fontFamily: "inherit",
                            cursor: aiLoading === ev.id ? "wait" : "pointer",
                            flexShrink: 0,
                          }}
                        >
                          {aiLoading === ev.id ? "…" : "▶ ASSESS"}
                        </button>
                        {aiMap[ev.id] && (
                          <span style={{ fontSize: 10, color: "#8AA8B8", lineHeight: 1.5 }}>
                            {aiMap[ev.id]}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "5px 14px",
              borderTop: "1px solid #1A2A3A",
              flexShrink: 0,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 9, color: "#3E6A5A", letterSpacing: 1 }}>
              90s AUTO-REFRESH · /v1/ops/events · /v1/reports
            </span>
            <span style={{ fontSize: 9, color: "#3E5A6A" }}>
              {filtered.length} / {events.length} events
            </span>
          </div>
        </div>
      )}
    </>
  );
}
