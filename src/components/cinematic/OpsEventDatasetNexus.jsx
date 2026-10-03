/**
 * OpsEventDatasetNexus — F619
 * "JARVIS, ops event dataset / dataset ops / oevdset / data-backed ops / ops data coverage / which ops events have data"
 * Cross-references /v1/ops/events + /v1/datasets.
 * Finds DATA-BACKED ops events (≥1 dataset keyword-matches) vs DATA-DARK (no dataset backing).
 * Coverage % tile; ALL/BACKED/DATA-DARK filter tabs + search; click-to-expand matched datasets.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence data-intelligence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 95_920;
const Z_INDEX  = 170;

const OEVDSET_RE =
  /\boevdset\b|\bops.?event.?dataset\b|\bdataset.?ops\b|\bdata.?backed.?ops\b|\bops.?data.?coverage\b|\bwhich.?ops.?events.?have.?data\b|\bops.?events.?data\b|\bdata.?for.?ops\b|\bops.?data\b/i;

export function isOevdsetQuery(text) {
  return OEVDSET_RE.test(text || "");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

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

function normaliseEvents(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.events)
    ? raw.events
    : Array.isArray(raw?.data)
    ? raw.data
    : [];
  return arr.map((e, i) => ({
    id:       e.id       || e.event_id || String(i),
    title:    e.title    || e.name     || e.summary  || `Event ${i + 1}`,
    severity: (e.severity || e.level   || "INFO").toString().toUpperCase(),
    source:   e.source   || e.service  || "",
    message:  e.message  || e.description || e.body || "",
    ts:       e.ts       || e.timestamp || e.created_at || "",
  }));
}

function normaliseDatasets(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.datasets)
    ? raw.datasets
    : Array.isArray(raw?.data)
    ? raw.data
    : [];
  return arr.map((d, i) => ({
    id:    d.id    || d.dataset_id || String(i),
    name:  d.name  || d.title      || `Dataset ${i + 1}`,
    kind:  (d.kind || d.type       || d.format || "UNKNOWN").toString().toUpperCase(),
    rows:  d.rows  ?? d.row_count  ?? d.count ?? null,
    description: (d.description || d.summary || "").toString().slice(0, 300),
    tags:  Array.isArray(d.tags) ? d.tags.join(" ") : (d.tags || ""),
  }));
}

function crossRef(events, datasets) {
  return events.map((ev) => {
    const haystack = `${ev.title} ${ev.message} ${ev.source} ${ev.severity}`;
    const matches = datasets
      .map((ds) => ({
        ds,
        hits: overlap(haystack, `${ds.name} ${ds.description} ${ds.tags} ${ds.kind}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...ev,
      backed: matches.length > 0,
      matches: matches.map(({ ds, hits }) => ({ ...ds, hits })),
    };
  });
}

// ─── buildOevdsetScript (for JarvisBrain) ────────────────────────────────────

export async function buildOevdsetScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [evRes, dsRes] = await Promise.all([
      fetch(`${base}/v1/ops/events`,  { headers: hdr }),
      fetch(`${base}/v1/datasets`,    { headers: hdr }),
    ]);
    const evData = evRes.ok ? await evRes.json() : {};
    const dsData = dsRes.ok ? await dsRes.json() : {};

    const events   = normaliseEvents(evData);
    const datasets = normaliseDatasets(dsData);
    const crossed  = crossRef(events, datasets);

    const total    = crossed.length;
    const backed   = crossed.filter((e) => e.backed).length;
    const dark     = total - backed;
    const coverage = total > 0 ? Math.round((backed / total) * 100) : 0;
    const topDark  = crossed
      .filter((e) => !e.backed)
      .slice(0, 2)
      .map((e) => e.title)
      .join(", ");

    const brief =
      `${coverage}% of ${total} ops events have dataset backing. ` +
      `${backed} DATA-BACKED, ${dark} DATA-DARK.` +
      (topDark ? ` Top dark events: ${topDark}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Ops Events × Dataset Nexus: ${brief} Provide a 2-sentence data-intelligence assessment of which operational events lack dataset backing and what that gap means for evidence-based response.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Ops Events × Dataset Nexus unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const SEV_COLOR = { CRITICAL: "#FF4455", WARNING: AMB, INFO: CY };

export default function OpsEventDatasetNexus() {
  const [open, setOpen]         = useState(false);
  const [crossed, setCrossed]   = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [query, setQuery]       = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssess]  = useState(false);
  const [brief, setBrief]       = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [evRes, dsRes] = await Promise.all([
        fetch(`${base}/v1/ops/events`, { headers: hdr }),
        fetch(`${base}/v1/datasets`,   { headers: hdr }),
      ]);
      const evData = evRes.ok ? await evRes.json() : {};
      const dsData = dsRes.ok ? await dsRes.json() : {};
      const ev = normaliseEvents(evData);
      const ds = normaliseDatasets(dsData);
      setCrossed(crossRef(ev, ds));
    } catch (_) {
      // silent — show stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => { setOpen((o) => !o); load(); };
    window.addEventListener("jarvis:oevdset-toggle", onToggle);
    return () => window.removeEventListener("jarvis:oevdset-toggle", onToggle);
  }, [load]);

  const assess = useCallback(async () => {
    setAssess(true);
    try {
      const result = await buildOevdsetScript();
      setBrief(result);
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ text: result.slice(0, 400) }),
      });
    } catch (_) {
      setBrief("Assessment unavailable.");
    } finally {
      setAssess(false);
    }
  }, []);

  const backed   = crossed.filter((e) => e.backed).length;
  const dark     = crossed.length - backed;
  const coverage = crossed.length > 0 ? Math.round((backed / crossed.length) * 100) : 0;

  const visible = crossed.filter((e) => {
    if (tab === "BACKED"    && !e.backed) return false;
    if (tab === "DATA-DARK" &&  e.backed) return false;
    if (query) {
      const q = query.toLowerCase();
      return (
        e.title.toLowerCase().includes(q) ||
        e.severity.toLowerCase().includes(q) ||
        e.source.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const panelStyle = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 50,
    width: 340,
    maxHeight: 520,
    background: "rgba(0,8,20,0.97)",
    border: `1px solid ${CY}44`,
    borderRadius: 6,
    zIndex: Z_INDEX,
    display: "flex",
    flexDirection: "column",
    fontFamily: "monospace",
    overflow: "hidden",
  };

  return (
    <>
      {/* Dock button */}
      <button
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z_INDEX,
          background: dark > 0 ? "rgba(255,165,0,0.12)" : "rgba(0,8,20,0.85)",
          border: `1px solid ${dark > 0 ? AMB : DIM}55`,
          borderRadius: 4,
          color: dark > 0 ? AMB : DIM,
          fontSize: 9,
          padding: "3px 6px",
          cursor: "pointer",
          fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◈ OEVDSET{dark > 0 && (
          <span style={{
            marginLeft: 4,
            background: AMB,
            color: "#000",
            borderRadius: 3,
            padding: "0 3px",
            fontSize: 8,
          }}>{dark}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{
            padding: "8px 10px 6px",
            borderBottom: `1px solid ${CY}33`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <span style={{ color: CY, fontSize: 11, fontWeight: 700, flex: 1 }}>
              ◈ OPS EVENTS × DATASETS
            </span>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? "rgba(41,231,255,0.05)" : "rgba(41,231,255,0.12)",
                border: `1px solid ${CY}44`,
                borderRadius: 3,
                color: CY,
                fontSize: 9,
                padding: "2px 6px",
                cursor: assessing ? "wait" : "pointer",
                fontFamily: "monospace",
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, fontSize: 12, cursor: "pointer" }}
            >
              ✕
            </button>
          </div>

          {/* Stats */}
          <div style={{
            display: "flex",
            gap: 6,
            padding: "6px 10px",
            borderBottom: `1px solid ${CY}22`,
          }}>
            {[
              { label: "EVENTS",   val: crossed.length, col: CY },
              { label: "BACKED",   val: backed,          col: GRN },
              { label: "DATA-DARK", val: dark,           col: AMB },
              { label: "COVERAGE", val: `${coverage}%`,  col: GRN },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1,
                background: "rgba(41,231,255,0.04)",
                border: `1px solid ${col}33`,
                borderRadius: 3,
                padding: "4px 3px",
                textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 12, fontWeight: 700 }}>{val}</div>
                <div style={{ color: DIM, fontSize: 8 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* AI brief */}
          {brief && (
            <div style={{
              padding: "4px 10px 2px",
              fontSize: 9,
              color: DIM,
              borderBottom: `1px solid ${CY}11`,
              maxHeight: 60,
              overflowY: "auto",
            }}>
              {brief}
            </div>
          )}

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "4px 10px" }}>
            {["ALL", "BACKED", "DATA-DARK"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "transparent",
                  border: `1px solid ${tab === t ? CY : DIM}44`,
                  borderRadius: 3,
                  color: tab === t ? CY : DIM,
                  fontSize: 8,
                  padding: "2px 6px",
                  cursor: "pointer",
                  fontFamily: "monospace",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search ops events…"
            style={{
              margin: "0 10px 4px",
              padding: "3px 6px",
              background: "rgba(41,231,255,0.05)",
              border: `1px solid ${CY}33`,
              borderRadius: 3,
              color: CY,
              fontSize: 9,
              outline: "none",
              fontFamily: "monospace",
            }}
          />

          {/* Event rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 10px 8px" }}>
            {loading ? (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>No events match.</div>
            ) : (
              visible.map((ev) => (
                <div key={ev.id}>
                  <div
                    onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "5px 6px",
                      marginBottom: 3,
                      cursor: "pointer",
                      borderRadius: 3,
                      background: "rgba(41,231,255,0.04)",
                      border: `1px solid ${ev.backed ? GRN + "44" : AMB + "33"}`,
                    }}
                  >
                    <span style={{
                      fontSize: 8,
                      padding: "1px 4px",
                      borderRadius: 2,
                      background: `${SEV_COLOR[ev.severity] || CY}22`,
                      color: SEV_COLOR[ev.severity] || CY,
                      minWidth: 50,
                      textAlign: "center",
                    }}>
                      {ev.severity.slice(0, 8)}
                    </span>
                    <span style={{
                      flex: 1,
                      fontSize: 10,
                      color: ev.backed ? GRN : DIM,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {ev.title}
                    </span>
                    {ev.backed ? (
                      <span style={{ fontSize: 8, color: GRN }}>⬡ {ev.matches.length} ds</span>
                    ) : (
                      <span style={{ fontSize: 8, color: AMB }}>DARK</span>
                    )}
                  </div>

                  {/* Expanded matched datasets */}
                  {expanded === ev.id && ev.backed && (
                    <div style={{ marginLeft: 12, marginBottom: 6 }}>
                      {ev.message && (
                        <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>
                          {ev.message.slice(0, 120)}
                        </div>
                      )}
                      {ev.matches.map((ds) => (
                        <div
                          key={ds.id}
                          style={{
                            padding: "3px 6px",
                            marginBottom: 2,
                            borderRadius: 2,
                            background: "rgba(0,229,160,0.05)",
                            border: `1px solid ${GRN}33`,
                            fontSize: 9,
                          }}
                        >
                          <span style={{
                            color: CY,
                            fontSize: 8,
                            padding: "1px 3px",
                            borderRadius: 2,
                            background: "rgba(41,231,255,0.1)",
                          }}>
                            {ds.kind.slice(0, 8)}
                          </span>
                          <span style={{ color: GRN, marginLeft: 4 }}>{ds.name}</span>
                          {ds.rows !== null && (
                            <span style={{ color: DIM, marginLeft: 6 }}>{ds.rows.toLocaleString()} rows</span>
                          )}
                          <span style={{ color: DIM, marginLeft: 6 }}>hits:{ds.hits}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {expanded === ev.id && !ev.backed && (
                    <div style={{ marginLeft: 12, marginBottom: 6, fontSize: 9, color: DIM }}>
                      No datasets correlate with this ops event.
                      {ev.message && (
                        <div style={{ marginTop: 2 }}>{ev.message.slice(0, 120)}</div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
