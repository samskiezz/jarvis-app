/**
 * OpsEventKnowledgeNexus — F516
 * "JARVIS, ops event knowledge / event context / oevkno /
 *  uncontextualized events / operational knowledge / ops knowledge"
 * Cross-references /v1/ops/events + /knowledge/.
 * Finds CONTEXTUALIZED events (≥1 article keyword-matches) vs UNCONTEXTUALIZED (no knowledge backing).
 * Coverage % tile; ALL/CONTEXTUALIZED/UNCONTEXTUALIZED filter tabs + search; click-to-expand articles.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
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
const BTN_LEFT = 35_000;
const Z_INDEX  = 99;

const OEVKNO_RE =
  /\boevkno\b|\bops.?event.?knowledge\b|\bevent.?context\b|\buncontextualized.?event\b|\bops.?knowledge\b|\boperational.?knowledge\b|\bknowledge.?backed.?event\b|\bops.?event.?article\b|\bevent.?knowledge.?coverage\b/i;

export function isOevknoQuery(text) {
  return OEVKNO_RE.test(text || "");
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

function normaliseEvents(data) {
  if (!data) return [];
  const raw =
    data.events || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((e, i) => ({
    id:          e.id || `ev-${i}`,
    name:        e.name || e.title || e.event_type || e.type || `Event ${i + 1}`,
    severity:    (e.severity || e.level || "INFO").toUpperCase(),
    source:      e.source || e.service || null,
    description: e.description || e.message || e.detail || null,
    tags:        Array.isArray(e.tags) ? e.tags.join(" ") : String(e.tags || ""),
  }));
}

function normaliseArticles(data) {
  if (!data) return [];
  const raw =
    data.articles || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((a, i) => ({
    id:      a.id || `art-${i}`,
    title:   a.title || a.name || `Article ${i + 1}`,
    kind:    (a.kind || a.type || a.category || "GENERAL").toUpperCase(),
    summary: a.summary || a.content || a.body || null,
    tags:    Array.isArray(a.tags) ? a.tags.join(" ") : String(a.tags || ""),
  }));
}

function crossRef(events, articles) {
  return events.map((ev) => {
    const haystack = `${ev.name} ${ev.description || ""} ${ev.tags}`;
    const matches = articles
      .map((art) => ({
        art,
        hits: overlap(haystack, `${art.title} ${art.summary || ""} ${art.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...ev,
      contextualized: matches.length > 0,
      matches:        matches.map(({ art, hits }) => ({ ...art, hits })),
    };
  });
}

// ─── buildOevknoScript (for JarvisBrain) ─────────────────────────────────────

export async function buildOevknoScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [evRes, artRes] = await Promise.all([
      fetch(`${base}/v1/ops/events`, { headers: hdr }),
      fetch(`${base}/knowledge/`,    { headers: hdr }),
    ]);
    const evData  = evRes.ok  ? await evRes.json()  : {};
    const artData = artRes.ok ? await artRes.json() : {};

    const events   = normaliseEvents(evData);
    const articles = normaliseArticles(artData);
    const crossed  = crossRef(events, articles);

    const total            = crossed.length;
    const contextualized   = crossed.filter((e) => e.contextualized).length;
    const uncontextualized = total - contextualized;
    const coverage         = total > 0 ? Math.round((contextualized / total) * 100) : 0;

    const topUncovered = crossed
      .filter((e) => !e.contextualized)
      .slice(0, 3)
      .map((e) => e.name)
      .join(", ");

    const brief =
      `${coverage}% of ${total} ops events have knowledge backing. ` +
      `${contextualized} CONTEXTUALIZED, ${uncontextualized} UNCONTEXTUALIZED.` +
      (topUncovered ? ` Key uncontextualized events: ${topUncovered}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Ops Events × Knowledge Coverage: ${brief} Provide a 2-sentence operational knowledge-gap assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Ops Events × Knowledge Nexus unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const KIND_COLOR = {
  THREAT:    "#FF4466",
  CYBER:     "#29E7FF",
  OPS:       "#FFA500",
  INTEL:     "#00E5A0",
  FINANCIAL: "#A0C4FF",
  RESEARCH:  "#B0FFA0",
  GENERAL:   "#8899AA",
};

const SEV_COLOR = {
  CRITICAL: "#FF4466",
  HIGH:     "#FF7733",
  WARNING:  "#FFA500",
  MEDIUM:   "#FFA500",
  LOW:      "#00E5A0",
  INFO:     "#8899AA",
};

export default function OpsEventKnowledgeNexus() {
  const [open, setOpen]         = useState(false);
  const [events, setEvents]     = useState([]);
  const [articles, setArticles] = useState([]);
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
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [evRes, artRes] = await Promise.all([
        fetch(`${base}/v1/ops/events`, { headers: hdr }),
        fetch(`${base}/knowledge/`,    { headers: hdr }),
      ]);
      const evData  = evRes.ok  ? await evRes.json()  : {};
      const artData = artRes.ok ? await artRes.json() : {};

      const ev  = normaliseEvents(evData);
      const art = normaliseArticles(artData);
      setEvents(ev);
      setArticles(art);
      setCrossed(crossRef(ev, art));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () =>
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    window.addEventListener("jarvis:oevkno-toggle", onToggle);
    return () => window.removeEventListener("jarvis:oevkno-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssess(true);
    setBrief("");
    try {
      const base  = apiBase();
      const hdr   = { Authorization: `Bearer ${API_KEY}` };
      const total            = crossed.length;
      const contextualized   = crossed.filter((e) => e.contextualized).length;
      const uncontextualized = total - contextualized;
      const coverage         = total > 0 ? Math.round((contextualized / total) * 100) : 0;
      const prompt =
        `Ops Events × Knowledge Coverage: ${coverage}% (${contextualized}/${total} contextualized, ${uncontextualized} uncontextualized). Assess in 2 sentences.`;

      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const d    = res.ok ? await res.json() : {};
      const text = d.response || d.message || d.reply || "Assessment complete.";
      setBrief(text);

      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "onyx" }),
      });
    } catch (e) {
      setBrief(`Assessment error: ${e.message}`);
    } finally {
      setAssess(false);
    }
  }, [crossed]);

  const visible = crossed.filter((ev) => {
    if (tab === "CONTEXTUALIZED"   && !ev.contextualized) return false;
    if (tab === "UNCONTEXTUALIZED" &&  ev.contextualized) return false;
    if (query) {
      const q = query.toLowerCase();
      if (
        !ev.name.toLowerCase().includes(q) &&
        !(ev.description || "").toLowerCase().includes(q) &&
        !(ev.source || "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const total            = crossed.length;
  const nCtx             = crossed.filter((e) => e.contextualized).length;
  const nUnctx           = total - nCtx;
  const coverage         = total > 0 ? Math.round((nCtx / total) * 100) : 0;

  const btnStyle = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: Z_INDEX,
    background: "rgba(0,0,0,0.85)",
    border: `1px solid ${CY}`,
    color: CY,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "2px 7px",
    cursor: "pointer",
    borderRadius: 3,
    userSelect: "none",
    display: "flex",
    alignItems: "center",
    gap: 4,
  };

  const panelStyle = {
    position: "fixed",
    right: 18,
    bottom: 54,
    width: 460,
    maxHeight: "78vh",
    overflowY: "auto",
    background: "rgba(0,6,18,0.97)",
    border: `1px solid ${CY}44`,
    borderRadius: 8,
    padding: 16,
    zIndex: 9999,
    fontFamily: "monospace",
    color: CY,
    boxSizing: "border-box",
  };

  return (
    <>
      <button
        style={btnStyle}
        onClick={() => setOpen((v) => { if (!v) load(); return !v; })}
        title="Ops Events × Knowledge Nexus"
      >
        ◈ OEVKNO
        {nUnctx > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 8, padding: "0 4px", fontSize: 9 }}>
            {nUnctx}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: "bold", letterSpacing: 1 }}>OPS EVENTS × KNOWLEDGE NEXUS</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={load}
                style={{ background: "none", border: `1px solid ${CY}55`, color: CY, cursor: "pointer", padding: "2px 8px", borderRadius: 3, fontSize: 10 }}
                title="Refresh"
              >
                ↺
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[
              { label: "COVERAGE",         value: `${coverage}%`, color: coverage > 60 ? GRN : coverage > 30 ? AMB : "#FF4466" },
              { label: "CONTEXTUALIZED",   value: nCtx,           color: GRN },
              { label: "UNCONTEXTUALIZED", value: nUnctx,         color: AMB },
              { label: "ARTICLES",         value: articles.length, color: CY },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  flex: 1, background: "rgba(41,231,255,0.05)",
                  border: `1px solid ${color}33`, borderRadius: 4,
                  padding: "6px 8px", textAlign: "center",
                }}
              >
                <div style={{ fontSize: 16, fontWeight: "bold", color }}>{value}</div>
                <div style={{ fontSize: 8, color: DIM, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assess button + brief */}
          <div style={{ marginBottom: 10 }}>
            <button
              onClick={assess}
              disabled={assessing || crossed.length === 0}
              style={{
                background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.15)",
                border: `1px solid ${CY}88`,
                color: CY, cursor: assessing ? "wait" : "pointer",
                padding: "4px 14px", borderRadius: 3,
                fontSize: 10, fontFamily: "monospace",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, fontSize: 10, color: "#cde", lineHeight: 1.5, padding: "6px 8px", background: "rgba(41,231,255,0.05)", borderRadius: 3 }}>
                {brief}
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {["ALL", "CONTEXTUALIZED", "UNCONTEXTUALIZED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "none",
                  border: `1px solid ${tab === t ? CY : CY + "33"}`,
                  color: tab === t ? CY : DIM,
                  cursor: "pointer", padding: "2px 10px",
                  borderRadius: 3, fontSize: 10, fontFamily: "monospace",
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
            placeholder="Search ops events…"
            style={{
              width: "100%", background: "rgba(41,231,255,0.06)",
              border: `1px solid ${CY}33`, color: CY,
              padding: "4px 8px", borderRadius: 3, fontSize: 10,
              marginBottom: 8, boxSizing: "border-box", fontFamily: "monospace",
            }}
          />

          {/* Event rows */}
          {loading ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>No ops events match.</div>
          ) : (
            visible.map((ev) => (
              <div key={ev.id}>
                <div
                  onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 6px", marginBottom: 3, cursor: "pointer",
                    borderRadius: 3, background: "rgba(41,231,255,0.04)",
                    border: `1px solid ${ev.contextualized ? GRN + "44" : DIM + "22"}`,
                  }}
                >
                  <span style={{ fontSize: 9, color: SEV_COLOR[ev.severity] || DIM, minWidth: 56 }}>
                    {ev.severity}
                  </span>
                  <span style={{ flex: 1, fontSize: 10, color: ev.contextualized ? GRN : DIM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ev.name}
                  </span>
                  {ev.contextualized ? (
                    <span style={{ fontSize: 8, color: GRN }}>⬡ {ev.matches.length} art</span>
                  ) : (
                    <span style={{ fontSize: 8, color: AMB }}>UNCONTEXTUALIZED</span>
                  )}
                </div>

                {expanded === ev.id && ev.contextualized && (
                  <div style={{ marginLeft: 12, marginBottom: 6 }}>
                    {ev.description && (
                      <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>{ev.description}</div>
                    )}
                    {ev.matches.map((art) => (
                      <div
                        key={art.id}
                        style={{
                          padding: "3px 6px", marginBottom: 2, borderRadius: 2,
                          background: "rgba(0,229,160,0.05)",
                          border: `1px solid ${KIND_COLOR[art.kind] || DIM}33`,
                          fontSize: 9,
                        }}
                      >
                        <span style={{ color: KIND_COLOR[art.kind] || DIM, marginRight: 4 }}>[{art.kind}]</span>
                        <span style={{ color: GRN }}>{art.title}</span>
                        <span style={{ color: DIM, marginLeft: 6 }}>hits:{art.hits}</span>
                      </div>
                    ))}
                  </div>
                )}

                {expanded === ev.id && !ev.contextualized && (
                  <div style={{ marginLeft: 12, marginBottom: 6, fontSize: 9, color: DIM }}>
                    No knowledge articles provide context for this ops event.
                    {ev.description && <div style={{ marginTop: 2 }}>{ev.description}</div>}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
