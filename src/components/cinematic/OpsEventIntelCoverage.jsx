/**
 * F152 — Ops Event × Knowledge × Report Real-Time Intelligence Coverage (OKRTRIC)
 *
 * Answers: "Which active operational events lack knowledge-base backing
 *           or intelligence-report coverage — and therefore represent
 *           undocumented blind spots?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /v1/ops/events   → list of recent operational events
 *   GET /knowledge/      → knowledge-base articles
 *   GET /v1/reports      → intelligence reports
 *
 * Classification per ops event (keyword correlation):
 *   FULLY_DOCUMENTED  — matched both a KB article AND a report
 *   KB_BACKED         — matched only a KB article
 *   REPORT_COVERED    — matched only a report
 *   UNDOCUMENTED      — matched neither (blind spot)
 *
 * Stat tiles: OPS EVENTS / KB ARTICLES / REPORTS / FULLY DOC. / UNDOCUMENTED
 * Coverage bar shows FULLY_DOCUMENTED + KB_BACKED + REPORT_COVERED as % of total.
 * ▶ ASSESS: 2-sentence AI brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ OKRTRIC  at left:1027480 bottom:8, zIndex:213.
 * Event:   jarvis:okrtric-toggle
 * Voice:   "okrtric / ops coverage / ops documentation / undocumented events /
 *           event knowledge report / ops intelligence coverage / intel gap ops /
 *           ops intel coverage"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const PURPLE = "#9B59B6";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1027480;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && Array.isArray(raw.events))  return raw.events;
  return [];
}

function tokens(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function overlap(a, b) {
  const sa = new Set(tokens(a));
  return tokens(b).filter((t) => sa.has(t)).length;
}

function score(event, item) {
  const eTxt = `${event.name || ""} ${event.title || ""} ${event.description || ""} ${event.type || ""}`;
  const iTxt = `${item.name || ""} ${item.title || ""} ${item.description || ""} ${item.tags?.join?.(" ") || ""}`;
  return overlap(eTxt, iTxt);
}

function classify(kbMatch, repMatch) {
  if (kbMatch && repMatch) return "FULLY_DOCUMENTED";
  if (kbMatch)             return "KB_BACKED";
  if (repMatch)            return "REPORT_COVERED";
  return "UNDOCUMENTED";
}

function classColor(cls) {
  if (cls === "FULLY_DOCUMENTED") return GREEN;
  if (cls === "KB_BACKED")        return CY;
  if (cls === "REPORT_COVERED")   return PURPLE;
  return RED;
}

// ─── exported brain helpers ───────────────────────────────────────────────────

export function isOkrtricQuery(q) {
  const t = q.toLowerCase();
  return (
    t.includes("okrtric") ||
    t.includes("ops coverage") ||
    t.includes("ops documentation") ||
    t.includes("undocumented event") ||
    t.includes("event knowledge report") ||
    t.includes("ops intelligence coverage") ||
    t.includes("intel gap ops") ||
    t.includes("ops intel coverage")
  );
}

export async function buildOkrtricScript() {
  const base = apiBase();
  const [evRaw, kbRaw, repRaw] = await Promise.all([
    fetch(`${base}/v1/ops/events`).then((r) => r.json()).catch(() => []),
    fetch(`${base}/knowledge/`).then((r) => r.json()).catch(() => []),
    fetch(`${base}/v1/reports`).then((r) => r.json()).catch(() => []),
  ]);
  const events  = normArr(evRaw);
  const kb      = normArr(kbRaw);
  const reports = normArr(repRaw);

  let undoc = 0;
  let fully = 0;
  events.forEach((ev) => {
    const hasKb  = kb.some((k) => score(ev, k) >= 1);
    const hasRep = reports.some((r) => score(ev, r) >= 1);
    const cls = classify(hasKb, hasRep);
    if (cls === "FULLY_DOCUMENTED") fully++;
    if (cls === "UNDOCUMENTED")     undoc++;
  });
  const covPct = events.length
    ? Math.round(((events.length - undoc) / events.length) * 100)
    : 0;

  return (
    `OKRTRIC Ops Intelligence Coverage online, sir. ` +
    `${events.length} operational events cross-referenced against ${kb.length} knowledge articles and ${reports.length} intelligence reports. ` +
    `${fully} events are fully documented, ${undoc} events remain undocumented blind spots — ` +
    `${covPct}% intelligence coverage overall. ` +
    `I recommend prioritising the ${undoc} undocumented events for immediate knowledge-base and reporting action.`
  );
}

// ─── component ───────────────────────────────────────────────────────────────

export default function OpsEventIntelCoverage() {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [events,  setEvents]  = useState([]);
  const [kb,      setKb]      = useState([]);
  const [reports, setReports] = useState([]);
  const [filter,  setFilter]  = useState("ALL");
  const [search,  setSearch]  = useState("");
  const [expanded,setExpanded]= useState(null);
  const [brief,   setBrief]   = useState("");
  const [assessing,setAssessing]=useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const [evRaw, kbRaw, repRaw] = await Promise.all([
        fetch(`${base}/v1/ops/events`).then((r) => r.json()).catch(() => []),
        fetch(`${base}/knowledge/`).then((r) => r.json()).catch(() => []),
        fetch(`${base}/v1/reports`).then((r) => r.json()).catch(() => []),
      ]);
      setEvents(normArr(evRaw));
      setKb(normArr(kbRaw));
      setReports(normArr(repRaw));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:okrtric-toggle", onToggle);
    return () => window.removeEventListener("jarvis:okrtric-toggle", onToggle);
  }, []);

  // Enrich each event with classification
  const enriched = events.map((ev) => {
    const kbMatches  = kb.filter((k) => score(ev, k) >= 1);
    const repMatches = reports.filter((r) => score(ev, r) >= 1);
    const cls = classify(kbMatches.length > 0, repMatches.length > 0);
    return { ...ev, cls, kbMatches, repMatches };
  });

  const counts = {
    FULLY_DOCUMENTED: enriched.filter((e) => e.cls === "FULLY_DOCUMENTED").length,
    KB_BACKED:        enriched.filter((e) => e.cls === "KB_BACKED").length,
    REPORT_COVERED:   enriched.filter((e) => e.cls === "REPORT_COVERED").length,
    UNDOCUMENTED:     enriched.filter((e) => e.cls === "UNDOCUMENTED").length,
  };

  const covPct = events.length
    ? Math.round(((events.length - counts.UNDOCUMENTED) / events.length) * 100)
    : 0;

  const FILTERS = ["ALL", "FULLY_DOCUMENTED", "KB_BACKED", "REPORT_COVERED", "UNDOCUMENTED"];

  const visible = enriched
    .filter((e) => filter === "ALL" || e.cls === filter)
    .filter((e) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        (e.name || e.title || "").toLowerCase().includes(s) ||
        (e.description || "").toLowerCase().includes(s)
      );
    });

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const ctx =
        `Ops events: ${events.length}. KB articles: ${kb.length}. Reports: ${reports.length}. ` +
        `FULLY_DOCUMENTED: ${counts.FULLY_DOCUMENTED}. KB_BACKED: ${counts.KB_BACKED}. ` +
        `REPORT_COVERED: ${counts.REPORT_COVERED}. UNDOCUMENTED: ${counts.UNDOCUMENTED}. ` +
        `Coverage: ${covPct}%. ` +
        `Top undocumented events: ${enriched.filter((e) => e.cls === "UNDOCUMENTED").slice(0, 3).map((e) => e.name || e.title || e.id).join(", ")}.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Assess operational intelligence coverage: ${ctx} In 2 sentences: what is the intelligence gap severity and which undocumented events pose the highest risk?`,
        }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setBrief("Intelligence assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  const undocBadge = counts.UNDOCUMENTED;

  // ─── render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Ops Event × Knowledge × Report Intelligence Coverage (OKRTRIC)"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 213,
          background: open ? CY : "rgba(4,7,14,0.80)",
          border: `1px solid ${CY}`,
          color: open ? "#04060A" : CY,
          fontFamily: MONO,
          fontSize: 10,
          padding: "3px 7px",
          cursor: "pointer",
          borderRadius: 3,
          whiteSpace: "nowrap",
          backdropFilter: "blur(6px)",
        }}
      >
        ◈ OKRTRIC
        {undocBadge > 0 && !open && (
          <span
            style={{
              marginLeft: 5,
              background: RED,
              color: "#fff",
              borderRadius: 8,
              padding: "1px 5px",
              fontSize: 9,
              fontWeight: 700,
            }}
          >
            {undocBadge}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            top: 60,
            left: "50%",
            transform: "translateX(-50%)",
            width: "min(860px, 95vw)",
            maxHeight: "80vh",
            overflowY: "auto",
            background: BG,
            border: `1px solid ${CY}44`,
            borderRadius: 8,
            zIndex: 9000,
            padding: 20,
            fontFamily: MONO,
            color: CY,
            boxShadow: `0 0 40px ${CY}22`,
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
                ◈ OKRTRIC
              </span>
              <span style={{ fontSize: 10, color: MUTED, marginLeft: 10 }}>
                Ops Event × Knowledge × Report Intelligence Coverage
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 16 }}
            >
              ✕
            </button>
          </div>

          {loading && (
            <div style={{ color: MUTED, fontSize: 11, marginBottom: 10 }}>Loading…</div>
          )}
          {error && (
            <div style={{ color: RED, fontSize: 11, marginBottom: 10 }}>Error: {error}</div>
          )}

          {/* Stat tiles */}
          {!loading && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {[
                { label: "OPS EVENTS",       val: events.length,              c: CY    },
                { label: "KB ARTICLES",       val: kb.length,                  c: CY    },
                { label: "REPORTS",           val: reports.length,             c: PURPLE },
                { label: "FULLY DOC.",        val: counts.FULLY_DOCUMENTED,    c: GREEN  },
                { label: "KB BACKED",         val: counts.KB_BACKED,           c: CY    },
                { label: "REPORT ONLY",       val: counts.REPORT_COVERED,      c: PURPLE },
                { label: "UNDOCUMENTED",      val: counts.UNDOCUMENTED,        c: RED   },
              ].map(({ label, val, c }) => (
                <div
                  key={label}
                  style={{
                    background: "rgba(41,231,255,0.05)",
                    border: `1px solid ${c}44`,
                    borderRadius: 4,
                    padding: "6px 12px",
                    minWidth: 90,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{val}</div>
                  <div style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Coverage bar */}
          {!loading && events.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>
                INTEL COVERAGE — {covPct}%
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${covPct}%`,
                    background: covPct >= 80 ? GREEN : covPct >= 50 ? AMBER : RED,
                    borderRadius: 3,
                    transition: "width 0.4s",
                  }}
                />
              </div>
            </div>
          )}

          {/* Assess button + brief */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <button
              onClick={assess}
              disabled={assessing || events.length === 0}
              style={{
                background: assessing ? "rgba(41,231,255,0.1)" : CY,
                border: "none",
                color: assessing ? CY : "#04060A",
                fontFamily: MONO,
                fontSize: 10,
                padding: "5px 12px",
                cursor: assessing ? "default" : "pointer",
                borderRadius: 3,
                fontWeight: 700,
              }}
            >
              {assessing ? "⌛ ASSESSING…" : "▶ ASSESS COVERAGE"}
            </button>
            {brief && (
              <div style={{ fontSize: 10, color: AMBER, flex: 1, lineHeight: 1.5 }}>{brief}</div>
            )}
          </div>

          {/* Filters + search */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? CY : "rgba(41,231,255,0.06)",
                  border: `1px solid ${filter === f ? CY : CY + "44"}`,
                  color: filter === f ? "#04060A" : CY,
                  fontFamily: MONO,
                  fontSize: 9,
                  padding: "3px 8px",
                  cursor: "pointer",
                  borderRadius: 3,
                }}
              >
                {f.replace(/_/g, " ")}
                {f !== "ALL" && (
                  <span style={{ marginLeft: 4, opacity: 0.7 }}>
                    ({counts[f] ?? enriched.filter((e) => e.cls === f).length})
                  </span>
                )}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search events…"
              style={{
                background: "rgba(41,231,255,0.06)",
                border: `1px solid ${CY}33`,
                color: CY,
                fontFamily: MONO,
                fontSize: 10,
                padding: "3px 8px",
                borderRadius: 3,
                outline: "none",
                marginLeft: "auto",
                width: 160,
              }}
            />
          </div>

          {/* Event rows */}
          {visible.length === 0 && !loading && (
            <div style={{ color: MUTED, fontSize: 11, textAlign: "center", padding: 20 }}>
              No events match the current filter.
            </div>
          )}
          {visible.map((ev) => {
            const id  = ev.id || ev._id || ev.name || ev.title || JSON.stringify(ev).slice(0, 20);
            const lbl = ev.name || ev.title || ev.type || id;
            const desc = ev.description || ev.summary || "";
            const isExp = expanded === id;
            const c = classColor(ev.cls);
            return (
              <div
                key={id}
                style={{
                  borderBottom: `1px solid ${CY}11`,
                  padding: "8px 0",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                  onClick={() => setExpanded(isExp ? null : id)}
                >
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: c,
                      background: c + "22",
                      borderRadius: 3,
                      padding: "2px 6px",
                      whiteSpace: "nowrap",
                      minWidth: 110,
                      textAlign: "center",
                    }}
                  >
                    {ev.cls.replace(/_/g, " ")}
                  </span>
                  <span style={{ fontSize: 11, color: CY, flex: 1 }}>{lbl}</span>
                  {ev.type && (
                    <span style={{ fontSize: 9, color: MUTED, background: "rgba(255,255,255,0.05)", borderRadius: 3, padding: "2px 5px" }}>
                      {ev.type}
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: MUTED }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {desc && (
                  <div style={{ fontSize: 9, color: MUTED, marginTop: 3, marginLeft: 118, lineHeight: 1.4 }}>
                    {desc.slice(0, 120)}{desc.length > 120 ? "…" : ""}
                  </div>
                )}

                {isExp && (
                  <div style={{ marginTop: 10, marginLeft: 118 }}>
                    {/* KB matches */}
                    {ev.kbMatches.length > 0 ? (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 9, color: GREEN, fontWeight: 700, marginBottom: 4 }}>
                          ◉ KB ARTICLES ({ev.kbMatches.length})
                        </div>
                        {ev.kbMatches.slice(0, 3).map((k, i) => {
                          const kLbl = k.name || k.title || `article-${i}`;
                          const rel = Math.min(100, score(ev, k) * 20);
                          return (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 9, color: GREEN, flex: 1 }}>{kLbl.slice(0, 50)}</span>
                              <div style={{ width: 80, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                                <div style={{ width: `${rel}%`, height: "100%", background: GREEN, borderRadius: 2 }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: 9, color: RED, marginBottom: 8 }}>✗ No matching KB articles</div>
                    )}

                    {/* Report matches */}
                    {ev.repMatches.length > 0 ? (
                      <div>
                        <div style={{ fontSize: 9, color: PURPLE, fontWeight: 700, marginBottom: 4 }}>
                          ◈ REPORTS ({ev.repMatches.length})
                        </div>
                        {ev.repMatches.slice(0, 3).map((rep, i) => {
                          const rLbl = rep.name || rep.title || `report-${i}`;
                          const rel = Math.min(100, score(ev, rep) * 20);
                          return (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 9, color: PURPLE, flex: 1 }}>{rLbl.slice(0, 50)}</span>
                              {rep.type && (
                                <span style={{ fontSize: 8, color: MUTED, background: PURPLE + "22", borderRadius: 2, padding: "1px 4px" }}>
                                  {rep.type}
                                </span>
                              )}
                              <div style={{ width: 80, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                                <div style={{ width: `${rel}%`, height: "100%", background: PURPLE, borderRadius: 2 }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: 9, color: RED }}>✗ No matching intelligence reports</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
