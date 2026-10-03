/**
 * OpsEventKnowledgeGap — F44.
 *
 * Cross-references live ops events against the knowledge base to surface
 * which events have documented response procedures (DOCUMENTED) and which
 * have no knowledge-base backing (UNDOCUMENTED / dark gaps).
 *
 * Endpoints used:
 *   /v1/ops/events   — live operational events (significant sev≥50)
 *   /knowledge/       — knowledge base articles / runbooks / procedures
 *
 * Stat tiles: events / articles / documented / undocumented
 * Filter tabs: ALL / DOCUMENTED / UNDOCUMENTED
 * Expand event → matched article cards (title + category snippet)
 * ▶ ASSESS per event → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *   via jarvis:speak-dossier.
 * 90 s auto-refresh.
 *
 * Voice: "ops knowledge" / "event docs" / "opknow" / "ops knowledge gap" /
 *        "event knowledge gap" / "ops documentation gap" / "undocumented events"
 *   → jarvis:opknow-toggle + TTS via buildOpsKnowScript()
 *
 * Toggle: ◈ OPKNOW at left:11240, bottom:8, zIndex:67.
 * Mounted in App.jsx; wired in JarvisBrain.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const RED    = "#FF3D5A";
const BTN_LEFT   = 11240;
const REFRESH_MS = 90_000;
const MIN_SEV    = 50;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function toArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && Array.isArray(raw.events))  return raw.events;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseEvents(raw) {
  return toArray(raw)
    .map((e) => ({
      id:       e.id || e.event_id || String(Math.random()),
      title:    e.title || e.name || e.message || e.description || "Unnamed Event",
      service:  e.service || e.source || e.component || "",
      severity: Number(e.severity ?? e.sev ?? e.level ?? 0),
      status:   (e.status || "open").toLowerCase(),
      ts:       e.timestamp || e.created_at || e.time || "",
    }))
    .filter((e) => e.severity >= MIN_SEV);
}

function normaliseArticles(raw) {
  return toArray(raw).map((a) => ({
    id:       a.id || a.article_id || String(Math.random()),
    title:    a.title || a.name || "Untitled",
    category: a.category || a.type || a.tags?.[0] || "",
    summary:  a.summary || a.description || a.body?.slice(0, 200) || "",
    keywords: [
      ...(Array.isArray(a.tags) ? a.tags : []),
      a.category || "", a.service || "", a.title || "",
    ].join(" ").toLowerCase(),
  }));
}

function kwMatch(a = "", b = "") {
  const words = (s) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3);
  const aw = words(a);
  const bw = words(b);
  return aw.some((w) => bw.includes(w));
}

function correlate(events, articles) {
  return events.map((ev) => {
    const evText = `${ev.title} ${ev.service}`;
    const matched = articles.filter(
      (a) =>
        kwMatch(evText, a.title) ||
        kwMatch(evText, a.keywords) ||
        kwMatch(ev.service, a.keywords)
    );
    return { ...ev, articles: matched, documented: matched.length > 0 };
  });
}

// ─── exported helpers for JarvisBrain voice routing ──────────────────────────

export function isOpsKnowQuery(q = "") {
  const lq = q.toLowerCase();
  return (
    lq.includes("opknow") ||
    lq.includes("ops knowledge") ||
    lq.includes("event docs") ||
    lq.includes("event knowledge") ||
    lq.includes("ops knowledge gap") ||
    lq.includes("ops documentation gap") ||
    lq.includes("undocumented events") ||
    lq.includes("event runbook") ||
    lq.includes("ops runbook gap")
  );
}

export async function buildOpsKnowScript() {
  const base = apiBase();
  try {
    const [evRaw, arRaw] = await Promise.all([
      fetch(`${base}/v1/ops/events`).then((r) => r.json()).catch(() => []),
      fetch(`${base}/knowledge/`).then((r) => r.json()).catch(() => []),
    ]);
    const events   = normaliseEvents(evRaw);
    const articles = normaliseArticles(arRaw);
    const corr     = correlate(events, articles);
    const numDoc   = corr.filter((e) => e.documented).length;
    const numDark  = corr.length - numDoc;
    if (!corr.length) return "No significant ops events found to cross-reference against the knowledge base, sir.";
    return `Ops knowledge gap analysis complete, sir. ${corr.length} significant events reviewed against ${articles.length} knowledge base articles. ${numDoc} events have documented procedures; ${numDark} are undocumented — potential response gaps. Review the OPKNOW panel for the full breakdown.`;
  } catch {
    return "Ops knowledge coverage analysis is standing by — endpoint temporarily unreachable, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function OpsEventKnowledgeGap() {
  const [open, setOpen]           = useState(false);
  const [events, setEvents]       = useState([]);
  const [articles, setArticles]   = useState([]);
  const [corr, setCorr]           = useState([]);
  const [filter, setFilter]       = useState("ALL");
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const [evRaw, arRaw] = await Promise.all([
        fetch(`${base}/v1/ops/events`).then((r) => r.json()),
        fetch(`${base}/knowledge/`).then((r) => r.json()),
      ]);
      const evs  = normaliseEvents(evRaw);
      const arts = normaliseArticles(arRaw);
      setEvents(evs);
      setArticles(arts);
      setCorr(correlate(evs, arts));
    } catch (e) {
      setErr(e.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:opknow-toggle", onToggle);
    return () => window.removeEventListener("jarvis:opknow-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess(ev) {
    setAssessing(ev.id);
    try {
      const artTitles = ev.articles.map((a) => a.title).join(", ") || "none";
      const prompt = `Ops event: "${ev.title}" (service: ${ev.service || "unknown"}, severity: ${ev.severity}). Matched knowledge articles: ${artTitles}. In two sentences, assess whether the documented procedures adequately cover this event and what gap exists if any.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const script = (d.answer || "Assessment complete.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch {
      // silent
    } finally {
      setAssessing(null);
    }
  }

  const numDoc  = corr.filter((e) => e.documented).length;
  const numDark = corr.length - numDoc;

  const visible = corr.filter((e) => {
    if (filter === "DOCUMENTED")   return e.documented;
    if (filter === "UNDOCUMENTED") return !e.documented;
    return true;
  });

  const sevColor = (s) => (s >= 90 ? RED : s >= 70 ? AMBER : CY);

  const TILE = { borderRadius: 6, padding: "6px 10px", minWidth: 70, textAlign: "center" };
  const TAB  = (active) => ({
    padding: "3px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer", letterSpacing: 1,
    border: `1px solid ${active ? CY : "#1E3A4A"}`,
    background: active ? `${CY}22` : "transparent",
    color: active ? CY : "#6E8AA0",
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ops Events × Knowledge Gap"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 67,
          padding: "3px 8px", fontSize: 10, letterSpacing: 1.5,
          border: `1px solid ${numDark > 0 ? `${AMBER}88` : `${CY}88`}`,
          borderRadius: 4, cursor: "pointer",
          background: "rgba(5,8,13,0.7)",
          color: numDark > 0 ? AMBER : CY,
          fontFamily: "'JetBrains Mono',monospace",
        }}
      >
        ◈ OPKNOW{numDark > 0 ? ` [${numDark}]` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
      zIndex: 200, width: "min(700px,94vw)", maxHeight: "80vh",
      background: "rgba(6,10,18,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 14, display: "flex", flexDirection: "column",
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
      boxShadow: `0 0 60px ${CY}18`, backdropFilter: "blur(12px)",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
        borderBottom: `1px solid ${CY}22`,
      }}>
        <span style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
          ◈ OPS EVENTS × KNOWLEDGE GAP
        </span>
        {loading && <span style={{ fontSize: 10, color: "#6E8AA0", marginLeft: 4 }}>loading…</span>}
        <button
          onClick={load}
          title="Refresh"
          style={{ marginLeft: "auto", background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14 }}
        >⟳</button>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16 }}
        >✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px", flexWrap: "wrap" }}>
        {[
          { label: "OPS EVENTS",   val: corr.length,     col: CY },
          { label: "KB ARTICLES",  val: articles.length, col: "#A78BFA" },
          { label: "DOCUMENTED",   val: numDoc,          col: GREEN },
          { label: "UNDOCUMENTED", val: numDark,         col: AMBER },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ ...TILE, background: `${col}11`, border: `1px solid ${col}44` }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, padding: "0 16px 10px" }}>
        {["ALL", "DOCUMENTED", "UNDOCUMENTED"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={TAB(filter === f)}>{f}</button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#3A5060" }}>
          sev≥{MIN_SEV} · {REFRESH_MS / 1000}s refresh
        </span>
      </div>

      {/* error */}
      {err && (
        <div style={{ padding: "8px 16px", color: RED, fontSize: 11 }}>
          Error: {err}
        </div>
      )}

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 16px 16px" }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: "#3A5060", fontSize: 12, padding: "20px 0", textAlign: "center" }}>
            No events in this filter.
          </div>
        )}
        {visible.map((ev) => (
          <div key={ev.id} style={{
            marginBottom: 8, borderRadius: 8,
            border: `1px solid ${ev.documented ? `${GREEN}44` : `${AMBER}44`}`,
            background: ev.documented ? `${GREEN}08` : `${AMBER}08`,
          }}>
            {/* event header row */}
            <div
              onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer" }}
            >
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 3,
                background: ev.documented ? `${GREEN}22` : `${AMBER}22`,
                color: ev.documented ? GREEN : AMBER,
              }}>
                {ev.documented ? "DOCUMENTED" : "UNDOCUMENTED"}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
                background: `${sevColor(ev.severity)}22`, color: sevColor(ev.severity),
              }}>
                SEV {ev.severity}
              </span>
              <span style={{ fontSize: 12, color: "#DCEBF5", fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ev.title}
              </span>
              {ev.service && (
                <span style={{ fontSize: 10, color: "#6E8AA0", flexShrink: 0 }}>{ev.service}</span>
              )}
              <span style={{ fontSize: 10, color: "#3A5060" }}>{expanded === ev.id ? "▲" : "▼"}</span>
            </div>

            {/* expanded detail */}
            {expanded === ev.id && (
              <div style={{ padding: "0 12px 10px", borderTop: `1px solid ${CY}11` }}>
                {ev.articles.length === 0 ? (
                  <div style={{ color: AMBER, fontSize: 11, padding: "6px 0" }}>
                    NO MATCHED KNOWLEDGE ARTICLES — response procedure gap
                  </div>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, color: "#6E8AA0", marginBottom: 4, letterSpacing: 1 }}>
                      MATCHED KB ARTICLES ({ev.articles.length}):
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {ev.articles.map((a) => (
                        <div key={a.id} style={{
                          padding: "5px 8px", borderRadius: 5, fontSize: 11,
                          border: `1px solid ${CY}33`, background: `${CY}08`,
                        }}>
                          <span style={{ color: CY, fontWeight: 600 }}>{a.title}</span>
                          {a.category && (
                            <span style={{ color: "#6E8AA0", marginLeft: 6, fontSize: 10 }}>
                              [{a.category}]
                            </span>
                          )}
                          {a.summary && (
                            <div style={{ color: "#8CAAB8", fontSize: 10, marginTop: 2, lineHeight: 1.4 }}>
                              {a.summary.slice(0, 120)}{a.summary.length > 120 ? "…" : ""}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  onClick={() => assess(ev)}
                  disabled={assessing === ev.id}
                  style={{
                    marginTop: 8, padding: "4px 10px", fontSize: 10, letterSpacing: 1,
                    border: `1px solid ${CY}66`, borderRadius: 4, cursor: "pointer",
                    background: assessing === ev.id ? `${CY}22` : "transparent",
                    color: CY, fontFamily: "inherit",
                  }}
                >
                  {assessing === ev.id ? "…" : "▶ ASSESS"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
