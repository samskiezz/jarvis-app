/**
 * LiveWorldKnowledgeNexus — F554 (LWKNO)
 * "JARVIS, live world knowledge / world event context / lwkno /
 *  real world knowledge / intel context / seismic knowledge / world intel knowledge"
 * Cross-references /functions/getLiveIntel + /knowledge/.
 * Finds CONTEXTUALIZED events (≥1 article keyword-matches) vs UNCONTEXTUALIZED blind spots.
 * Coverage % tile; ALL/CONTEXTUALIZED/UNCONTEXTUALIZED filter tabs + search.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence live-world-knowledge brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4466";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 53_060;
const Z_INDEX  = 120;

const LWKNO_RE =
  /\blwkno\b|\blive.?world.?knowledge\b|\bworld.?event.?context\b|\breal.?world.?knowledge\b|\bintel.?context\b|\bseismic.?knowledge\b|\bworld.?intel.?knowledge\b|\blive.?intel.?knowledge\b|\bworld.?knowledge.?context\b|\breal.?world.?context\b|\blive.?event.?knowledge\b/i;

export function isLwknoQuery(text) {
  return LWKNO_RE.test(text || "");
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
  const events = [];
  if (!data) return events;

  // Seismic events
  const quakes = Array.isArray(data.earthquakes) ? data.earthquakes :
    (data.seismic || data.quakes || []);
  quakes.forEach((q, i) => {
    events.push({
      id:   `quake-${i}`,
      kind: "SEISMIC",
      name: q.location || q.place || q.name || `Earthquake ${i + 1}`,
      detail: `M${q.magnitude || q.mag || "?"} ${q.location || q.place || ""}`,
    });
  });

  // Crypto events
  const crypto = Array.isArray(data.crypto) ? data.crypto : [];
  crypto.forEach((c, i) => {
    events.push({
      id:   `crypto-${i}`,
      kind: "CRYPTO",
      name: c.symbol || c.name || `Crypto ${i + 1}`,
      detail: `${c.symbol || "?"} price ${c.price != null ? c.price : "?"}`,
    });
  });

  // FX events
  const fx = Array.isArray(data.fx) ? data.fx :
    (data.forex || data.rates || []);
  fx.forEach((f, i) => {
    events.push({
      id:   `fx-${i}`,
      kind: "FX",
      name: f.pair || f.symbol || f.name || `FX ${i + 1}`,
      detail: `${f.pair || f.symbol || "?"} rate ${f.rate != null ? f.rate : "?"}`,
    });
  });

  return events;
}

function normaliseArticles(data) {
  if (!data) return [];
  const raw =
    data.articles || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((a, i) => ({
    id:      a.id || `art-${i}`,
    title:   a.title || a.name || `Article ${i + 1}`,
    kind:    (a.kind || a.type || a.category || "note").toUpperCase(),
    summary: a.summary || a.description || a.content || "",
    tags:    Array.isArray(a.tags) ? a.tags.join(" ") : String(a.tags || ""),
  }));
}

function crossRef(events, articles) {
  return events.map((ev) => {
    const haystack = `${ev.name} ${ev.detail}`;
    const matches = articles
      .map((a) => ({
        a,
        hits: overlap(haystack, `${a.title} ${a.summary} ${a.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...ev,
      contextualized: matches.length > 0,
      matches: matches.map(({ a, hits }) => ({ ...a, hits })),
    };
  });
}

// ─── buildLwknoScript (for JarvisBrain) ──────────────────────────────────────

export async function buildLwknoScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [evRes, artRes] = await Promise.all([
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      fetch(`${base}/knowledge/`,             { headers: hdr }),
    ]);
    const evData  = evRes.ok  ? await evRes.json()  : {};
    const artData = artRes.ok ? await artRes.json() : {};

    const events   = normaliseEvents(evData);
    const articles = normaliseArticles(artData);
    const crossed  = crossRef(events, articles);

    const total           = crossed.length;
    const contextualized  = crossed.filter((e) => e.contextualized).length;
    const uncontextualized = total - contextualized;
    const coverage         = total > 0 ? Math.round((contextualized / total) * 100) : 0;
    const topUnknown       = crossed
      .filter((e) => !e.contextualized)
      .slice(0, 2)
      .map((e) => e.name)
      .join(", ");

    const chatRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Live World Intel × Knowledge Nexus (LWKNO): ${total} live world events total (seismic, crypto, FX), ${contextualized} have knowledge article context (${coverage}%), ${uncontextualized} are uncontextualized blind spots. Top unknown events: ${topUnknown || "none"}. In exactly 2 sentences, assess the live-world knowledge coverage posture.`,
      }),
    });
    const chatData = chatRes.ok ? await chatRes.json() : {};
    return chatData.response || chatData.message || chatData.answer ||
      `LWKNO: ${contextualized}/${total} live world events have knowledge context (${coverage}%). ${uncontextualized} real-world events have no documented knowledge backing.`;
  } catch {
    return "LWKNO: Unable to fetch live world intel or knowledge articles.";
  }
}

// ─── kind colour ─────────────────────────────────────────────────────────────

function kindColour(kind) {
  if (kind === "SEISMIC") return RED;
  if (kind === "CRYPTO")  return AMB;
  if (kind === "FX")      return GRN;
  return DIM;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function LiveWorldKnowledgeNexus() {
  const [open,        setOpen]        = useState(false);
  const [articles,    setArticles]    = useState([]);
  const [crossed,     setCrossed]     = useState([]);
  const [tab,         setTab]         = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const [assessment,  setAssessment]  = useState("");
  const [badge,       setBadge]       = useState(0);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [evRes, artRes] = await Promise.all([
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
        fetch(`${base}/knowledge/`,             { headers: hdr }),
      ]);
      const evData  = evRes.ok  ? await evRes.json()  : {};
      const artData = artRes.ok ? await artRes.json() : {};
      const ev  = normaliseEvents(evData);
      const art = normaliseArticles(artData);
      const cx  = crossRef(ev, art);
      setArticles(art);
      setCrossed(cx);
      setBadge(cx.filter((e) => !e.contextualized).length);
    } catch {
      /* silently ignore network errors */
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:lwkno-toggle", handler);
    return () => window.removeEventListener("jarvis:lwkno-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment("");
    try {
      const brief = await buildLwknoScript();
      setAssessment(brief);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } }));
    } finally {
      setAssessing(false);
    }
  }, []);

  const total            = crossed.length;
  const contextualized   = crossed.filter((e) => e.contextualized).length;
  const uncontextualized = total - contextualized;
  const coverage         = total > 0 ? Math.round((contextualized / total) * 100) : 0;

  const visible = crossed.filter((e) => {
    if (tab === "CONTEXTUALIZED"   && !e.contextualized) return false;
    if (tab === "UNCONTEXTUALIZED" &&  e.contextualized) return false;
    if (search) {
      const q = search.toLowerCase();
      return e.name.toLowerCase().includes(q) || e.kind.toLowerCase().includes(q);
    }
    return true;
  });

  // ── floating button ──
  const btn = (
    <button
      onClick={() => setOpen((v) => !v)}
      style={{
        position:   "fixed",
        left:       BTN_LEFT,
        bottom:     8,
        zIndex:     Z_INDEX,
        background: badge > 0 ? "rgba(255,165,0,0.18)" : "rgba(41,231,255,0.10)",
        border:     `1px solid ${badge > 0 ? AMB : CY}`,
        color:      badge > 0 ? AMB : CY,
        borderRadius: 6,
        padding:    "3px 9px",
        fontSize:   11,
        cursor:     "pointer",
        fontFamily: "monospace",
      }}
    >
      ◈ LWKNO{badge > 0 && <span style={{ marginLeft: 5, background: AMB, color: "#000", borderRadius: 9, padding: "0 5px", fontSize: 10 }}>{badge}</span>}
    </button>
  );

  if (!open) return btn;

  return (
    <>
      {btn}
      <div style={{
        position: "fixed", top: 60, right: 20, width: 560, maxHeight: "80vh",
        background: "rgba(5,15,30,0.97)", border: `1px solid ${CY}`,
        borderRadius: 10, zIndex: Z_INDEX + 1, display: "flex", flexDirection: "column",
        fontFamily: "monospace", color: CY, overflow: "hidden",
        boxShadow: `0 0 24px ${CY}44`,
      }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${CY}33` }}>
          <span style={{ fontWeight: 700, letterSpacing: 2 }}>◈ LWKNO — LIVE WORLD × KNOWLEDGE</span>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${CY}22` }}>
          {[
            ["EVENTS",          total,            CY],
            ["CONTEXTUALIZED",  contextualized,   GRN],
            ["BLIND SPOTS",     uncontextualized, AMB],
            ["COVERAGE",        `${coverage}%`,   coverage >= 70 ? GRN : coverage >= 40 ? AMB : RED],
            ["ARTICLES",        articles.length,  DIM],
          ].map(([label, val, col]) => (
            <div key={label} style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
              <div style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* assess */}
        <div style={{ padding: "6px 14px", borderBottom: `1px solid ${CY}22`, display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={assess} disabled={assessing} style={{ background: "rgba(41,231,255,0.12)", border: `1px solid ${CY}`, color: CY, borderRadius: 5, padding: "3px 12px", cursor: "pointer", fontSize: 11 }}>
            {assessing ? "▶ …" : "▶ ASSESS"}
          </button>
          {assessment && <span style={{ fontSize: 11, color: GRN, flex: 1, lineHeight: 1.4 }}>{assessment}</span>}
        </div>

        {/* filter tabs */}
        <div style={{ display: "flex", gap: 6, padding: "6px 14px", borderBottom: `1px solid ${CY}22` }}>
          {["ALL", "CONTEXTUALIZED", "UNCONTEXTUALIZED"].map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ background: tab === t ? CY : "rgba(41,231,255,0.08)", border: `1px solid ${CY}44`, color: tab === t ? "#000" : CY, borderRadius: 4, padding: "2px 10px", cursor: "pointer", fontSize: 10 }}>{t}</button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search events…"
            style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: `1px solid ${CY}44`, color: CY, borderRadius: 4, padding: "2px 8px", fontSize: 10, outline: "none" }}
          />
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
          {visible.length === 0 && <div style={{ color: DIM, fontSize: 12, padding: 12 }}>No events match.</div>}
          {visible.map((ev) => (
            <div key={ev.id} style={{ marginBottom: 8 }}>
              <div
                onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                  padding: "5px 8px", borderRadius: 5,
                  background: ev.contextualized ? "rgba(0,229,160,0.06)" : "rgba(255,165,0,0.06)",
                  border: `1px solid ${ev.contextualized ? GRN + "44" : AMB + "44"}`,
                }}
              >
                <span style={{ width: 14, height: 14, borderRadius: "50%", background: ev.contextualized ? GRN : AMB, display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: kindColour(ev.kind), letterSpacing: 1, flexShrink: 0 }}>{ev.kind}</span>
                <span style={{ flex: 1, fontSize: 12, color: ev.contextualized ? GRN : AMB }}>{ev.name}</span>
                {ev.detail && <span style={{ fontSize: 10, color: DIM }}>{ev.detail}</span>}
                <span style={{ fontSize: 10, color: ev.contextualized ? GRN : AMB, marginLeft: "auto" }}>
                  {ev.contextualized ? `${ev.matches.length} article${ev.matches.length !== 1 ? "s" : ""}` : "BLIND SPOT"}
                </span>
                <span style={{ fontSize: 10, color: DIM }}>{expanded === ev.id ? "▲" : "▼"}</span>
              </div>

              {expanded === ev.id && ev.matches.length > 0 && (
                <div style={{ marginTop: 4, marginLeft: 22, display: "flex", flexDirection: "column", gap: 4 }}>
                  {ev.matches.map((a) => (
                    <div key={a.id} style={{ background: "rgba(41,231,255,0.05)", border: `1px solid ${CY}22`, borderRadius: 4, padding: "4px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: CY, letterSpacing: 1 }}>{a.kind}</span>
                        <span style={{ fontSize: 11, color: GRN, flex: 1 }}>{a.title}</span>
                        <span style={{ fontSize: 10, color: DIM }}>{a.hits} hit{a.hits !== 1 ? "s" : ""}</span>
                      </div>
                      {a.summary && (
                        <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>
                          {a.summary.slice(0, 120)}{a.summary.length > 120 ? "…" : ""}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {expanded === ev.id && ev.matches.length === 0 && (
                <div style={{ marginTop: 4, marginLeft: 22, fontSize: 10, color: DIM }}>No knowledge articles found for this event.</div>
              )}
            </div>
          ))}
        </div>

        <div style={{ padding: "5px 14px", borderTop: `1px solid ${CY}22`, fontSize: 9, color: DIM }}>
          Auto-refresh every {POLL_MS / 1000}s · /functions/getLiveIntel + /knowledge/
        </div>
      </div>
    </>
  );
}
