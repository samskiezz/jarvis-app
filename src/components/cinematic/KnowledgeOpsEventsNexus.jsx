/**
 * KnowledgeOpsEventsNexus — F641
 * "JARVIS, knowops / knowledge ops / ops knowledge / knowledge in ops /
 *  knowledge events / which articles mention ops events / knowledge ops signal /
 *  article ops event / ops event knowledge"
 * Cross-references /knowledge/ articles against /v1/ops/events.
 * SIGNALLED articles (≥1 ops event keyword-matches) vs QUIET (no ops signal).
 * Coverage % tile; ALL/SIGNALLED/QUIET filter tabs + search; click-to-expand matched events.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence knowledge-ops brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";
const ORG = "#FF6B35";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 106_240;
const Z_INDEX  = 182;

const KNOWOPS_RE =
  /\bknowops\b|\bknowledge.?ops\b|\bops.?knowledge\b|\bknowledge.?in.?ops\b|\bknowledge.?events?\b|\bwhich.?articles?.mention.?ops\b|\bknowledge.?ops.?signal\b|\barticle.?ops.?event\b|\bops.?event.?knowledge\b|\bops.?backed.?knowledge\b/i;

export function isKnowopsQuery(text) {
  return KNOWOPS_RE.test(text || "");
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

function normaliseArticles(data) {
  if (!data) return [];
  const raw =
    data.articles || data.items || data.results || data.knowledge ||
    (Array.isArray(data) ? data : []);
  return raw.map((a, i) => ({
    id:      a.id    || `art-${i}`,
    title:   a.title || a.name  || `Article ${i + 1}`,
    kind:    a.kind  || a.type  || a.category || "article",
    summary: a.summary || a.content || a.body || a.text || "",
    tags:    Array.isArray(a.tags) ? a.tags.join(" ") : (a.tags || ""),
  }));
}

function normaliseOpsEvents(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.events)
    ? data.events
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((e, i) => ({
    id:       e.id       || e.event_id || String(i),
    title:    e.title    || e.name     || e.summary  || `Event ${i + 1}`,
    severity: (e.severity || e.level   || "INFO").toString().toUpperCase(),
    source:   e.source   || e.service  || "",
    message:  e.message  || e.description || e.body || "",
  }));
}

function crossRef(articles, events) {
  return articles.map((art) => {
    const haystack = `${art.title} ${art.summary} ${art.tags}`;
    const matches = events
      .map((ev) => {
        const needle = `${ev.title} ${ev.source} ${ev.message}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...ev, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...art, signalled: matches.length > 0, events: matches };
  });
}

export async function buildKnowopsScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [artRes, opsRes] = await Promise.all([
      fetch(`${base}/knowledge/`,      { headers: hdr }),
      fetch(`${base}/v1/ops/events`,   { headers: hdr }),
    ]);
    const [artData, opsData] = await Promise.all([artRes.json(), opsRes.json()]);
    const articles = normaliseArticles(artData);
    const events   = normaliseOpsEvents(opsData);
    const rows     = crossRef(articles, events);
    const signalled = rows.filter((r) => r.signalled).length;
    const quiet     = rows.length - signalled;
    const pct = rows.length ? Math.round((signalled / rows.length) * 100) : 0;
    if (!rows.length) return "No knowledge articles found in the system, sir.";
    const topSignalled = rows
      .filter((r) => r.signalled)
      .slice(0, 2)
      .map((r) => r.title)
      .join("; ");
    return (
      `${signalled} of ${rows.length} knowledge articles are correlated with active ops events (${pct}% ops coverage). ` +
      (signalled > 0
        ? `Ops-signalled articles include: ${topSignalled || "unknown"} — these knowledge items appear in live operational signals.`
        : `${quiet} article${quiet !== 1 ? "s" : ""} show no ops event correlation — knowledge base appears operationally quiet.`)
    );
  } catch {
    return "Unable to reach knowledge or ops events endpoints, sir.";
  }
}

const SEV_COLOR = {
  CRITICAL: RED,
  HIGH:     ORG,
  MEDIUM:   AMB,
  WARNING:  AMB,
  INFO:     CY,
  LOW:      GRN,
};

export default function KnowledgeOpsEventsNexus() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [artRes, opsRes] = await Promise.all([
        fetch(`${base}/knowledge/`,    { headers: hdr }),
        fetch(`${base}/v1/ops/events`, { headers: hdr }),
      ]);
      const [artData, opsData] = await Promise.all([artRes.json(), opsRes.json()]);
      const articles = normaliseArticles(artData);
      const events   = normaliseOpsEvents(opsData);
      setRows(crossRef(articles, events));
    } catch {
      /* silently ignore fetch errors */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen((p) => !p); if (!rows.length) load(); };
    window.addEventListener("jarvis:knowops-toggle", handler);
    return () => window.removeEventListener("jarvis:knowops-toggle", handler);
  }, [load, rows.length]);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const signalled = rows.filter((r) => r.signalled).length;
  const quiet     = rows.length - signalled;
  const pct       = rows.length ? Math.round((signalled / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => {
      if (filter === "SIGNALLED") return r.signalled;
      if (filter === "QUIET")     return !r.signalled;
      return true;
    })
    .filter((r) =>
      !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.kind.toLowerCase().includes(search.toLowerCase())
    );

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const summary = await buildKnowopsScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `JARVIS knowledge-ops brief: ${summary}` }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || summary;
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setBrief("Assessment unavailable — check backend connectivity, sir.");
    } finally {
      setAssessing(false);
    }
  };

  return (
    <>
      {/* HUD button */}
      <button
        onClick={() => { setOpen((p) => !p); if (!rows.length) load(); }}
        style={{
          position: "fixed",
          left:     BTN_LEFT,
          bottom:   8,
          zIndex:   Z_INDEX,
          background: signalled > 0 ? `${AMB}22` : "rgba(0,0,0,0.55)",
          border:   `1px solid ${signalled > 0 ? AMB : CY}55`,
          borderRadius: 5,
          color:    signalled > 0 ? AMB : CY,
          padding:  "3px 8px",
          fontSize: 9,
          letterSpacing: 1,
          cursor:   "pointer",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ KNOWOPS
        {signalled > 0 && (
          <span style={{ marginLeft: 5, background: AMB, color: "#000", borderRadius: 9, padding: "0 5px", fontSize: 8, fontWeight: 700 }}>
            {signalled}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: Math.min(BTN_LEFT, window.innerWidth - 360),
            bottom: 36,
            zIndex: Z_INDEX + 1,
            width: 340,
            maxHeight: 480,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            background: "rgba(6,12,22,0.97)",
            border: `1px solid ${CY}33`,
            borderRadius: 8,
            padding: 14,
            fontFamily: "monospace",
            backdropFilter: "blur(12px)",
          }}
        >
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>KNOWLEDGE × OPS EVENTS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 12 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[
              { label: "ARTICLES",   value: rows.length, col: CY },
              { label: "SIGNALLED",  value: signalled,   col: AMB },
              { label: "QUIET",      value: quiet,       col: GRN },
              { label: "OPS COV",    value: `${pct}%`,   col: pct >= 50 ? GRN : AMB },
            ].map((t) => (
              <div key={t.label} style={{ flex: 1, background: `${t.col}11`, border: `1px solid ${t.col}33`, borderRadius: 5, padding: "5px 4px", textAlign: "center" }}>
                <div style={{ color: t.col, fontSize: 12, fontWeight: 700 }}>{t.value}</div>
                <div style={{ color: DIM, fontSize: 7, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search articles…"
            style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${CY}33`, borderRadius: 4, color: "#DCEBF5", padding: "4px 8px", fontSize: 10, marginBottom: 6, outline: "none" }}
          />

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["ALL", "SIGNALLED", "QUIET"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  flex: 1,
                  background: filter === f ? `${CY}22` : "transparent",
                  border: `1px solid ${filter === f ? CY : CY + "33"}`,
                  borderRadius: 4,
                  color: filter === f ? CY : DIM,
                  padding: "3px 0",
                  fontSize: 8,
                  cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* list */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {loading && <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 16 }}>Loading…</div>}
            {!loading && visible.length === 0 && (
              <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 16 }}>No articles match filter.</div>
            )}
            {visible.map((art) => (
              <div
                key={art.id}
                onClick={() => setExpanded(expanded === art.id ? null : art.id)}
                style={{
                  background: art.signalled ? `${AMB}09` : "rgba(255,255,255,0.02)",
                  border: `1px solid ${art.signalled ? AMB + "33" : CY + "1A"}`,
                  borderRadius: 5,
                  padding: "6px 8px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    fontSize: 8,
                    border: `1px solid ${art.signalled ? AMB : GRN}44`,
                    borderRadius: 3,
                    padding: "1px 4px",
                    color: art.signalled ? AMB : GRN,
                    letterSpacing: 1,
                  }}>
                    {art.signalled ? "SIGNALLED" : "QUIET"}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{art.title}</span>
                  {art.signalled && (
                    <span style={{ color: DIM, fontSize: 9 }}>{art.events.length} ev</span>
                  )}
                </div>
                {art.kind && (
                  <div style={{ color: DIM, fontSize: 9, marginLeft: 16 }}>{art.kind.slice(0, 30)}</div>
                )}

                {expanded === art.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${AMB}22`, paddingTop: 6 }}>
                    {art.signalled ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {art.events.map((ev) => (
                          <div key={ev.id} style={{ background: "rgba(255,165,0,0.04)", border: `1px solid ${AMB}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{
                                color: SEV_COLOR[ev.severity] || CY,
                                fontSize: 9,
                                border: `1px solid ${(SEV_COLOR[ev.severity] || CY)}44`,
                                borderRadius: 3,
                                padding: "1px 4px",
                              }}>
                                {ev.severity}
                              </span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{ev.title}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {ev.hits}</span>
                            </div>
                            {ev.source && (
                              <div style={{ color: DIM, fontSize: 8, marginTop: 2 }}>{ev.source}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No ops events matched this article — knowledge operationally quiet.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${AMB}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: `${AMB}18`,
                border: `1px solid ${AMB}55`,
                borderRadius: 5,
                color: AMB,
                padding: "5px 12px",
                cursor: "pointer",
                fontSize: 10,
                letterSpacing: 1,
                width: "100%",
                opacity: assessing ? 0.6 : 1,
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${AMB}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
