/**
 * OpsEventInvestigationNexus — F704
 * "JARVIS, oeinv / ops event investigation / case-backed events /
 *  which events have investigations / event case coverage /
 *  investigation events / ops investigation nexus"
 * Cross-references /v1/ops/events against /v1/investigations.
 * CASE-BACKED events (≥1 investigation keyword-match) vs UNTRACKED (no case backing).
 * Coverage % tile; ALL/CASE-BACKED/UNTRACKED filter tabs + search;
 * click-to-expand matched investigations with status badge + hit count.
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
const BTN_LEFT = 156_120;
const Z_INDEX  = 240;

const OEINV_RE =
  /\boeinv\b|\bops.?event.?invest\b|\bcase.?backed.?events?\b|\bwhich.?events?.?have.?invest\b|\bevent.?case.?coverage\b|\binvestigation.?events?\b|\bops.?invest.?nexus\b|\bops.?investigation.?nexus\b/i;

export function isOeinvQuery(text) {
  return OEINV_RE.test(text || "");
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

function normaliseInvestigations(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.investigations)
    ? data.investigations
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((inv, i) => ({
    id:      inv.id      || `inv-${i}`,
    title:   inv.title   || inv.name   || inv.case_title || `Case ${i + 1}`,
    status:  (inv.status || "OPEN").toString().toUpperCase(),
    lead:    inv.lead    || inv.owner  || inv.assigned_to || "",
    summary: inv.summary || inv.description || inv.body || "",
    type:    inv.type    || inv.kind   || "",
  }));
}

function crossRef(events, investigations) {
  return events.map((ev) => {
    const haystack = `${ev.title} ${ev.description} ${ev.source} ${ev.type}`;
    const matches = investigations
      .map((inv) => {
        const needle = `${inv.title} ${inv.summary} ${inv.type} ${inv.lead}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...inv, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...ev, matches, linked: matches.length > 0 };
  });
}

function statusColor(s) {
  if (s === "OPEN")      return GRN;
  if (s === "ACTIVE")    return CY;
  if (s === "ESCALATED") return RED;
  if (s === "CLOSED")    return DIM;
  return AMB;
}

function sevColor(s) {
  if (s === "CRITICAL") return RED;
  if (s === "HIGH")     return AMB;
  if (s === "WARNING")  return AMB;
  return CY;
}

export async function buildOeinvScript() {
  try {
    const base = apiBase();
    const [evRes, invRes] = await Promise.all([
      fetch(`${base}/v1/ops/events`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/investigations`,{ headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const [evData, invData] = await Promise.all([evRes.json(), invRes.json()]);
    const events        = normaliseEvents(evData);
    const investigations = normaliseInvestigations(invData);
    const enriched      = crossRef(events, investigations);
    const backed        = enriched.filter((e) => e.linked);
    const pct           = events.length > 0 ? Math.round((backed.length / events.length) * 100) : 0;
    const topBacked     = backed.slice(0, 3).map((e) => e.title).join(", ");
    return (
      `Ops event–investigation nexus: ${events.length} events cross-referenced against ` +
      `${investigations.length} investigations. ` +
      `${backed.length} are case-backed (${pct}% coverage), ` +
      `${events.length - backed.length} remain untracked. ` +
      (topBacked ? `Top case-backed events: ${topBacked}.` : "")
    ).trim();
  } catch {
    return "Unable to reach the ops events or investigations endpoint, sir.";
  }
}

export default function OpsEventInvestigationNexus() {
  const [open, setOpen]       = useState(false);
  const [events, setEvents]   = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [assess, setAssess]   = useState("");
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [evRes, invRes] = await Promise.all([
        fetch(`${base}/v1/ops/events`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/investigations`,{ headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [evData, invData] = await Promise.all([evRes.json(), invRes.json()]);
      setEvents(normaliseEvents(evData));
      setInvestigations(normaliseInvestigations(invData));
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [open, load]);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:oeinv-toggle", toggle);
    return () => window.removeEventListener("jarvis:oeinv-toggle", toggle);
  }, []);

  const enriched = crossRef(events, investigations);
  const backed   = enriched.filter((e) => e.linked);
  const pct      = events.length > 0 ? Math.round((backed.length / events.length) * 100) : 0;

  const filtered = enriched
    .filter((e) => {
      if (tab === "CASE-BACKED") return e.linked;
      if (tab === "UNTRACKED")   return !e.linked;
      return true;
    })
    .filter((e) => {
      const q = search.toLowerCase();
      return !q || e.title.toLowerCase().includes(q) || e.source.toLowerCase().includes(q);
    });

  async function runAssess() {
    setAssessing(true); setAssess("");
    try {
      const prompt =
        `JARVIS ops event investigation nexus: ${events.length} events, ` +
        `${investigations.length} investigations. ${backed.length} case-backed (${pct}%). ` +
        `Give a 2-sentence operational coverage brief.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssess(txt);
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: txt }),
      });
    } catch {
      setAssess("Assessment unavailable.");
    }
    setAssessing(false);
  }

  const tile = (label, val, color) => (
    <div style={{ flex: 1, minWidth: 90, background: "rgba(0,0,0,0.35)", borderRadius: 8,
      padding: "8px 10px", border: `1px solid ${color}33`, textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
      <div style={{ fontSize: 9, color: DIM, letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );

  const TABS = ["ALL", "CASE-BACKED", "UNTRACKED"];

  return (
    <>
      {/* trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Ops Events × Investigations (OEINV)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: open ? CY : "rgba(5,8,13,0.82)", color: open ? "#04060A" : CY,
          border: `1px solid ${CY}`, borderRadius: 6, padding: "3px 8px",
          fontSize: 10, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: 1, boxShadow: `0 0 10px ${CY}44`, whiteSpace: "nowrap",
        }}>
        ◈ OEINV
        {!open && backed.length > 0 && (
          <span style={{ marginLeft: 4, background: AMB, color: "#000", borderRadius: 3,
            padding: "0 4px", fontSize: 9, fontWeight: 700 }}>
            {backed.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: BTN_LEFT - 360, bottom: 36, zIndex: Z_INDEX,
          width: 420, maxHeight: "70vh", display: "flex", flexDirection: "column",
          background: "rgba(6,10,18,0.96)", border: `1px solid ${CY}44`, borderRadius: 12,
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          boxShadow: `0 0 40px ${CY}22`, overflow: "hidden",
        }}>
          {/* header */}
          <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: CY, fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>
              OPS EVENTS × INVESTIGATIONS
            </span>
            <span style={{ marginLeft: "auto", fontSize: 9, color: DIM }}>
              {loading ? "loading…" : `${events.length} events · ${investigations.length} cases`}
            </span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none",
              color: DIM, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 12px", flexWrap: "wrap" }}>
            {tile("EVENTS",      events.length,             CY)}
            {tile("INVESTIGS",   investigations.length,     AMB)}
            {tile("CASE-BACKED", backed.length,             GRN)}
            {tile("UNTRACKED",   events.length - backed.length, RED)}
            {tile("COVERAGE",    `${pct}%`,                 pct >= 60 ? GRN : pct >= 30 ? AMB : RED)}
          </div>

          {/* filter tabs + search */}
          <div style={{ display: "flex", gap: 4, padding: "0 12px 6px", flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? CY : "rgba(0,0,0,0.4)", color: tab === t ? "#04060A" : CY,
                border: `1px solid ${CY}44`, borderRadius: 4, padding: "2px 8px",
                fontSize: 9, cursor: "pointer", letterSpacing: 1,
              }}>{t}</button>
            ))}
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="search events…"
              style={{ marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`,
                borderRadius: 4, padding: "2px 8px", fontSize: 9, color: "#DCEBF5",
                outline: "none", width: 130 }}
            />
          </div>

          {/* event list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 8px" }}>
            {filtered.length === 0 && (
              <div style={{ color: DIM, fontSize: 10, padding: "12px 0", textAlign: "center" }}>
                {loading ? "Loading data…" : "No events match."}
              </div>
            )}
            {filtered.map((ev) => (
              <div key={ev.id}>
                <div
                  onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                  style={{
                    padding: "6px 8px", marginBottom: 4, borderRadius: 6, cursor: "pointer",
                    background: expanded === ev.id ? "rgba(41,231,255,0.06)" : "rgba(0,0,0,0.25)",
                    border: `1px solid ${ev.linked ? GRN : RED}33`,
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                  <span style={{ fontSize: 9, color: sevColor(ev.severity), fontWeight: 700,
                    minWidth: 52 }}>
                    {ev.severity}
                  </span>
                  <span style={{ fontSize: 10, flex: 1, color: "#DCEBF5" }}>{ev.title}</span>
                  <span style={{ fontSize: 9, color: ev.linked ? GRN : RED, fontWeight: 700 }}>
                    {ev.linked ? `${ev.matches.length} case${ev.matches.length !== 1 ? "s" : ""}` : "UNTRACKED"}
                  </span>
                  <span style={{ fontSize: 10, color: DIM }}>{expanded === ev.id ? "▲" : "▼"}</span>
                </div>
                {expanded === ev.id && (
                  <div style={{ marginBottom: 6, padding: "6px 10px", borderRadius: 6,
                    background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}22` }}>
                    {ev.source && (
                      <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>
                        SOURCE: {ev.source}
                      </div>
                    )}
                    {ev.description && (
                      <div style={{ fontSize: 9, color: "#9AAFBF", marginBottom: 6 }}>
                        {ev.description}
                      </div>
                    )}
                    {ev.linked ? (
                      ev.matches.map((inv) => (
                        <div key={inv.id} style={{ padding: "4px 6px", marginBottom: 3,
                          borderRadius: 4, background: "rgba(0,229,160,0.06)",
                          border: `1px solid ${statusColor(inv.status)}33`, fontSize: 9 }}>
                          <span style={{ color: statusColor(inv.status), fontWeight: 700,
                            marginRight: 6 }}>
                            {inv.status}
                          </span>
                          <span style={{ color: "#DCEBF5" }}>{inv.title}</span>
                          <span style={{ color: DIM, marginLeft: 6 }}>
                            ({inv.hits} hit{inv.hits !== 1 ? "s" : ""})
                          </span>
                          {inv.lead && (
                            <span style={{ color: DIM, marginLeft: 6 }}>· lead: {inv.lead}</span>
                          )}
                        </div>
                      ))
                    ) : (
                      <div style={{ color: RED, fontSize: 9, padding: "4px 0" }}>
                        No investigation case matched for this event.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* assess */}
          {assess && (
            <div style={{ margin: "0 12px 8px", padding: "8px 10px", borderRadius: 6,
              background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}33`,
              fontSize: 10, color: "#DCEBF5", lineHeight: 1.5 }}>
              {assess}
            </div>
          )}
          <div style={{ padding: "6px 12px 10px", borderTop: `1px solid ${CY}22` }}>
            <button onClick={runAssess} disabled={assessing} style={{
              background: assessing ? "rgba(0,0,0,0.4)" : CY, color: assessing ? CY : "#04060A",
              border: `1px solid ${CY}`, borderRadius: 5, padding: "4px 14px",
              fontSize: 10, cursor: assessing ? "not-allowed" : "pointer",
              fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1, fontWeight: 700,
            }}>
              {assessing ? "▶ assessing…" : "▶ ASSESS"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
