/**
 * F178 — Report × Investigation Intelligence Bridge (RIIB)
 *
 * Parallel-fetches /v1/reports + /v1/investigations, then
 * keyword-correlates each investigation against the report catalog to surface:
 *   SUPPORTED — at least one report provides documentary evidence for the case
 *   BLIND     — investigation has no matching reports (evidence gap)
 *
 * Stat tiles: investigations / reports / supported / blind
 * Filter tabs: ALL | SUPPORTED | BLIND
 * Text search across investigation titles / types / statuses.
 * Expand any investigation → matched reports with topic badge + relevance score.
 * Amber badge on blind count.
 * ▶ ASSESS: 2-sentence investigation-evidence brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ RIIB  at bottom:8 left:61240, zIndex:119.
 * Event:   jarvis:riib-toggle
 * Voice:   "report investigation / investigation evidence / riib /
 *           unsupported investigations / investigation documents /
 *           which investigations have reports / evidence gap"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 61240;
const POLL_MS  = 90_000;
const AMBER    = "#F59E0B";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ───────────────────────────────────────────────────

const RIIB_RE =
  /\b(report\s+invest(igation|igat(e|or)[s]?)|invest(igation|igat(e|or)[s]?)\s+report[s]?|investigation\s+evidence|evidence\s+gap|riib|unsupported\s+invest(igation|igation[s]?)|investigation\s+document[s]?|which\s+invest(igation[s]?)?\s+(have|has|lack[s]?|need[s]?)\s+report[s]?|blind\s+invest(igation[s]?)|case\s+evidence)\b/i;

export function isRiibQuery(q) { return RIIB_RE.test(q); }

export async function buildRiibScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [repRes, invRes] = await Promise.all([
      fetch(`${base}/v1/reports`,       { headers: hdr }),
      fetch(`${base}/v1/investigations`, { headers: hdr }),
    ]);
    const reports        = normaliseReports(await repRes.json());
    const investigations = normaliseInvestigations(await invRes.json());

    const supported = investigations.filter((inv) => reports.some((r) => relevance(inv, r) > 0)).length;
    const blind     = investigations.length - supported;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS investigation evidence bridge: ${investigations.length} open investigations, ` +
          `${reports.length} reports in the document catalog. ${supported} investigations have ` +
          `at least one supporting report; ${blind} investigations are running blind with no ` +
          `documentary evidence in the catalog. Provide a 2-sentence investigation-evidence ` +
          `gap brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Investigation evidence analysis complete, sir.").trim();
  } catch {
    return "Investigation evidence bridge unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseReports(raw) {
  const arr = Array.isArray(raw)         ? raw
    : Array.isArray(raw?.reports)        ? raw.reports
    : Array.isArray(raw?.data)           ? raw.data
    : Array.isArray(raw?.results)        ? raw.results
    : Array.isArray(raw?.items)          ? raw.items
    : [];
  return arr.map((r, i) => ({
    id:      r.id      || r.report_id    || String(i),
    title:   r.title   || r.name         || r.label    || `Report ${i + 1}`,
    topic:   r.topic   || r.category     || r.type     || r.domain   || "",
    tags:    Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags || ""),
    summary: (r.summary || r.abstract || r.description || r.content || "").toString().slice(0, 300),
  }));
}

function normaliseInvestigations(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.investigations)       ? raw.investigations
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.results)              ? raw.results
    : Array.isArray(raw?.items)                ? raw.items
    : [];
  return arr.map((inv, i) => ({
    id:      inv.id       || inv.investigation_id || String(i),
    title:   inv.title    || inv.name             || inv.label      || `Investigation ${i + 1}`,
    type:    inv.type     || inv.category         || inv.kind       || "",
    status:  inv.status   || inv.state            || "open",
    tags:    Array.isArray(inv.tags) ? inv.tags.join(" ") : (inv.tags || ""),
    summary: (inv.summary || inv.description || inv.notes || "").toString().slice(0, 300),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(investigation, report) {
  const iw = keywords(`${investigation.title} ${investigation.type} ${investigation.summary} ${investigation.tags}`);
  const rw = keywords(`${report.title} ${report.topic} ${report.summary} ${report.tags}`);
  return iw.filter((w) => rw.some((p) => p.includes(w) || w.includes(p))).length;
}

function buildLinked(investigations, reports) {
  return investigations.map((inv) => {
    const matched = reports
      .map((r) => ({ ...r, score: relevance(inv, r) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...inv, reports: matched, supported: matched.length > 0 };
  });
}

function topicColor(topic) {
  const lc = String(topic || "").toLowerCase();
  if (lc.includes("threat") || lc.includes("security")) return "#F87171";
  if (lc.includes("intel") || lc.includes("signal"))    return "#60A5FA";
  if (lc.includes("finance") || lc.includes("invest"))  return "#34D399";
  if (lc.includes("network") || lc.includes("graph"))   return "#A78BFA";
  if (lc.includes("ops") || lc.includes("operation"))   return "#FB923C";
  return "#94A3B8";
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "SUPPORTED", "BLIND"];

export default function ReportInvestigationBridge() {
  const [open,           setOpen]           = useState(false);
  const [investigations, setInvestigations] = useState([]);
  const [reports,        setReports]        = useState([]);
  const [loading,        setLoading]        = useState(false);
  const [filter,         setFilter]         = useState("ALL");
  const [search,         setSearch]         = useState("");
  const [expanded,       setExpanded]       = useState(null);
  const [assessing,      setAssessing]      = useState(false);
  const [lastFetch,      setLastFetch]      = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [repRes, invRes] = await Promise.all([
        fetch(`${base}/v1/reports`,       { headers: hdr }),
        fetch(`${base}/v1/investigations`, { headers: hdr }),
      ]);
      setReports(normaliseReports(await repRes.json()));
      setInvestigations(normaliseInvestigations(await invRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:riib-toggle", onToggle);
    return () => window.removeEventListener("jarvis:riib-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildRiibScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked    = buildLinked(investigations, reports);
  const supported = linked.filter((inv) => inv.supported).length;
  const blind     = linked.length - supported;

  const displayed = linked.filter((inv) => {
    if (filter === "SUPPORTED" && !inv.supported) return false;
    if (filter === "BLIND"     && inv.supported)  return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      inv.title.toLowerCase().includes(q)  ||
      inv.type.toLowerCase().includes(q)   ||
      inv.status.toLowerCase().includes(q)
    );
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Report × Investigation Intelligence Bridge (RIIB)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 119,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${AMBER}55`,
          color: AMBER, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {blind > 0
          ? <><span style={{ background: AMBER, color: "#04060A", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{blind}</span>◈ RIIB</>
          : "◈ RIIB"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 119,
      width: 480, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${AMBER}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${AMBER}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${AMBER}33` }}>
        <span style={{ color: AMBER, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ RIIB</span>
        <span style={{ color: "#6E8AA0", fontSize: 9, flex: 1 }}>REPORT × INVESTIGATION BRIDGE</span>
        {lastFetch && <span style={{ color: "#6E8AA0", fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: AMBER, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${AMBER}22` }}>
        {[
          { label: "INVESTIGATIONS", value: linked.length,  col: "#60A5FA" },
          { label: "REPORTS",        value: reports.length, col: "#A78BFA" },
          { label: "SUPPORTED",      value: supported,      col: "#34D399" },
          { label: "BLIND",          value: blind,          col: AMBER },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: "#6E8AA0", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${AMBER}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${AMBER}22` : "none",
            border: `1px solid ${filter === t ? AMBER : "#6E8AA0"}`,
            color: filter === t ? AMBER : "#6E8AA0",
            borderRadius: 5, padding: "2px 8px", fontSize: 9,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search investigations…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${AMBER}`,
          color: AMBER, borderRadius: 5, padding: "2px 8px",
          fontSize: 9, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* investigation list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: "#6E8AA0", fontSize: 10, textAlign: "center", padding: 20 }}>
            No investigations match the current filter.
          </div>
        )}
        {displayed.map((inv) => {
          const isExp  = expanded === inv.id;
          const status = inv.supported ? "SUPPORTED" : "BLIND";
          const col    = inv.supported ? "#34D399" : AMBER;
          return (
            <div key={inv.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : inv.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${AMBER}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${inv.supported ? "#34D39944" : AMBER + "44"}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col,
                }}>
                  {status}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{inv.title}</span>
                {inv.type && <span style={{ fontSize: 8, color: "#6E8AA0" }}>{inv.type}</span>}
                {inv.supported && (
                  <span style={{ fontSize: 8, color: "#34D399" }}>{inv.reports.length} doc{inv.reports.length !== 1 ? "s" : ""}</span>
                )}
                <span style={{ color: "#6E8AA0", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${AMBER}22` }}>
                  {inv.status && (
                    <div style={{ fontSize: 9, color: "#6E8AA0", marginBottom: 6 }}>
                      status: {inv.status}{inv.summary ? ` · ${inv.summary.slice(0, 100)}` : ""}
                    </div>
                  )}
                  {inv.reports.length === 0 ? (
                    <div style={{ fontSize: 9, color: AMBER }}>No reports found in the document catalog for this investigation.</div>
                  ) : (
                    inv.reports.map((r) => (
                      <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: `${topicColor(r.topic)}22`, color: topicColor(r.topic),
                          letterSpacing: 1,
                        }}>
                          {String(r.topic || "DOC").toUpperCase().slice(0, 8)}
                        </span>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5" }}>{r.title}</span>
                        <span style={{ fontSize: 8, color: AMBER }}>rel:{r.score}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
