/**
 * F753 — Knowledge × Investigation × Ops Events Triple Nexus (KIOETR)
 * Endpoints: /knowledge/  ×  /v1/investigations  ×  /v1/ops/events
 * Classification: FULLY_COVERED | INVEST_ONLY | OPS_ONLY | DARK
 *
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const DIM = "#8899AA";

const BTN_LEFT = 918_640;
const POLL_MS  = 90_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const KIOETR_RE =
  /\b(kioetr|knowledge\s+investigation\s+ops|knowledge\s+case\s+ops|ops\s+case\s+knowledge|knowledge\s+ops\s+investigation|knowledge\s+triple|case\s+ops\s+articles|knowledge\s+ops\s+events|investigation\s+ops\s+knowledge|knowledge\s+events\s+triple|ops\s+investigation\s+articles|knowledge\s+coverage\s+triple|articles\s+ops\s+investigation)\b/i;

export function isKioetrQuery(t) {
  return KIOETR_RE.test(t || "");
}

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

function normaliseArticles(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.articles))     return raw.articles;
  if (raw && Array.isArray(raw.knowledge))    return raw.knowledge;
  if (raw && Array.isArray(raw.data))         return raw.data;
  if (raw && Array.isArray(raw.items))        return raw.items;
  return [];
}

function normaliseInvestigations(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.investigations)) return raw.investigations;
  if (raw && Array.isArray(raw.data))           return raw.data;
  if (raw && Array.isArray(raw.items))          return raw.items;
  return [];
}

function normaliseEvents(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.events)) return raw.events;
  if (raw && Array.isArray(raw.data))   return raw.data;
  if (raw && Array.isArray(raw.items))  return raw.items;
  return [];
}

function keywords(obj) {
  return [
    obj.name, obj.title, obj.description, obj.label,
    obj.type, obj.category, obj.kind, obj.summary,
    obj.tags, obj.topic, obj.domain, obj.content,
    obj.source, obj.target, obj.entity_type, obj.event_type,
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreMatch(aKw, bKw) {
  if (!aKw || !bKw) return 0;
  return aKw.split(/\s+/).filter(w => w.length > 3 && bKw.includes(w)).length;
}

function buildNexus(articles, investigations, events) {
  return articles.map(art => {
    const aKw = keywords(art);

    const bestInvest = investigations.reduce(
      (best, inv) => {
        const s = scoreMatch(aKw, keywords(inv));
        return s > best.score ? { score: s, inv } : best;
      },
      { score: 0, inv: null },
    );

    const bestEvent = events.reduce(
      (best, ev) => {
        const s = scoreMatch(aKw, keywords(ev));
        return s > best.score ? { score: s, ev } : best;
      },
      { score: 0, ev: null },
    );

    const hasInvest = bestInvest.score > 0;
    const hasEvent  = bestEvent.score  > 0;

    const classification =
      hasInvest && hasEvent ? "FULLY_COVERED"
      : hasInvest           ? "INVEST_ONLY"
      : hasEvent            ? "OPS_ONLY"
      :                       "DARK";

    return {
      art,
      classification,
      bestInvest:  bestInvest.inv,
      investScore: bestInvest.score,
      bestEvent:   bestEvent.ev,
      eventScore:  bestEvent.score,
    };
  });
}

export async function buildKioetrScript() {
  const base = apiBase();
  try {
    const [artR, invR, evR] = await Promise.all([
      fetch(`${base}/knowledge/`,          { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/investigations`,   { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/ops/events`,       { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const articles       = normaliseArticles(await artR.json());
    const investigations = normaliseInvestigations(await invR.json());
    const events         = normaliseEvents(await evR.json());
    const nexus          = buildNexus(articles, investigations, events);
    const covered        = nexus.filter(r => r.classification === "FULLY_COVERED").length;
    const dark           = nexus.filter(r => r.classification === "DARK").length;
    const pct            = articles.length
      ? Math.round((covered / articles.length) * 100) : 0;

    const brief = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Knowledge × Investigation × Ops Events coverage: ${articles.length} knowledge articles, ${covered} fully covered (investigation+ops event), ${dark} dark (no investigation or ops event backing). Coverage ${pct}%. Summarise knowledge intelligence coverage in 2 sentences.`,
      }),
    });
    const bd = await brief.json();
    return (bd.answer || "").trim() ||
      `${articles.length} knowledge articles analysed. ${covered} fully covered (investigation + ops event), ${dark} dark — no investigation or ops event backing detected.`;
  } catch (e) {
    return `KIOETR fetch error: ${e.message}`;
  }
}

const TABS = ["ALL", "FULLY_COVERED", "INVEST_ONLY", "OPS_ONLY", "DARK"];

const BADGE_COLOR = {
  FULLY_COVERED: GN,
  INVEST_ONLY:   CY,
  OPS_ONLY:      AM,
  DARK:          RD,
};

export default function KnowledgeInvestigationOpsTriple() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [badgeDark, setBadgeDark] = useState(0);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    try {
      const [artR, invR, evR] = await Promise.all([
        fetch(`${base}/knowledge/`,        { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/investigations`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/ops/events`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const articles       = normaliseArticles(await artR.json());
      const investigations = normaliseInvestigations(await invR.json());
      const events         = normaliseEvents(await evR.json());
      const nexus          = buildNexus(articles, investigations, events);
      setRows(nexus);
      setBadgeDark(nexus.filter(r => r.classification === "DARK").length);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => {
      if (!v) load();
      return !v;
    });
    window.addEventListener("jarvis:kioetr-toggle", onToggle);
    return () => window.removeEventListener("jarvis:kioetr-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    const matchTab  = tab === "ALL" || r.classification === tab;
    const matchSrch = !search ||
      keywords(r.art).includes(search.toLowerCase()) ||
      (r.bestInvest && keywords(r.bestInvest).includes(search.toLowerCase())) ||
      (r.bestEvent  && keywords(r.bestEvent).includes(search.toLowerCase()));
    return matchTab && matchSrch;
  });

  const counts = {
    total:         rows.length,
    FULLY_COVERED: rows.filter(r => r.classification === "FULLY_COVERED").length,
    INVEST_ONLY:   rows.filter(r => r.classification === "INVEST_ONLY").length,
    OPS_ONLY:      rows.filter(r => r.classification === "OPS_ONLY").length,
    DARK:          rows.filter(r => r.classification === "DARK").length,
  };
  const pct = counts.total ? Math.round((counts.FULLY_COVERED / counts.total) * 100) : 0;

  const panel = open ? (
    <div style={{
      position: "fixed", left: BTN_LEFT, bottom: 56, zIndex: 612,
      width: "min(680px,92vw)", maxHeight: "70vh",
      background: "rgba(6,11,19,0.93)", border: `1px solid ${CY}55`,
      borderRadius: 14, padding: "14px 16px",
      backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${CY}18`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>
          ◈ KIOETR — KNOWLEDGE × INVESTIGATION × OPS EVENTS
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: DIM }}>
          {loading ? "loading…" : `${counts.total} articles · ${pct}% covered`}
        </span>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          ["ARTICLES",    counts.total,          CY],
          ["FULLY COV.",  counts.FULLY_COVERED,  GN],
          ["INVEST ONLY", counts.INVEST_ONLY,    CY],
          ["OPS ONLY",    counts.OPS_ONLY,       AM],
          ["DARK",        counts.DARK,           RD],
          ["COVERAGE",    `${pct}%`,             pct >= 60 ? GN : pct >= 30 ? AM : RD],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{
            background: "rgba(0,0,0,0.4)", border: `1px solid ${col}44`,
            borderRadius: 8, padding: "6px 12px", textAlign: "center", minWidth: 80,
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${CY}22` : "transparent",
              border: `1px solid ${tab === t ? CY : DIM + "55"}`,
              borderRadius: 6, padding: "3px 10px", cursor: "pointer",
              color: tab === t ? CY : DIM, fontSize: 10, letterSpacing: 1,
            }}>{t}</button>
        ))}
      </div>

      {/* search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search articles / investigations / ops events…"
        style={{
          background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`,
          borderRadius: 8, padding: "6px 12px", color: "#DCEBF5",
          fontFamily: "inherit", fontSize: 11, outline: "none",
        }}
      />

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        {visible.slice(0, 80).map((r, i) => {
          const isExp = expanded === i;
          const col   = BADGE_COLOR[r.classification];
          const name  = r.art.title || r.art.name || r.art.topic || `Article ${i + 1}`;
          return (
            <div key={i}
              onClick={() => setExpanded(isExp ? null : i)}
              style={{
                background: isExp ? "rgba(41,231,255,0.06)" : "rgba(0,0,0,0.3)",
                border: `1px solid ${col}33`,
                borderRadius: 8, padding: "7px 12px", cursor: "pointer",
                transition: "background 0.15s",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "#DCEBF5", flex: 1 }}>{name}</span>
                {r.art.category && (
                  <span style={{
                    fontSize: 9, background: `${AM}22`, border: `1px solid ${AM}44`,
                    borderRadius: 4, padding: "1px 6px", color: AM,
                  }}>{r.art.category}</span>
                )}
                <span style={{
                  fontSize: 9, background: `${col}22`, border: `1px solid ${col}55`,
                  borderRadius: 4, padding: "1px 6px", color: col, letterSpacing: 1,
                }}>{r.classification}</span>
              </div>
              {isExp && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                  {r.bestInvest ? (
                    <div style={{ fontSize: 10, color: CY }}>
                      <b style={{ color: CY }}>Investigation:</b>{" "}
                      {r.bestInvest.title || r.bestInvest.name || "investigation"}{" "}
                      <span style={{ color: DIM }}>
                        (status: {r.bestInvest.status || "—"}, hits: {r.investScore})
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: DIM }}>No matching investigation found.</div>
                  )}
                  {r.bestEvent ? (
                    <div style={{ fontSize: 10, color: AM }}>
                      <b style={{ color: AM }}>Ops Event:</b>{" "}
                      {r.bestEvent.title || r.bestEvent.name || r.bestEvent.event_type || "event"}{" "}
                      <span style={{ color: DIM }}>
                        (type: {r.bestEvent.event_type || r.bestEvent.type || "—"}, hits: {r.eventScore})
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: DIM }}>No matching ops event found.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && !loading && (
          <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
            No articles match current filter.
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      {panel}
      <button
        onClick={() => { setOpen(v => { if (!v) load(); return !v; }); }}
        title="Knowledge × Investigation × Ops Events Triple Nexus (KIOETR)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 612,
          background: open ? `${CY}22` : "rgba(5,8,13,0.7)",
          border: `1px solid ${open ? CY : CY + "55"}`,
          borderRadius: 8, cursor: "pointer",
          color: open ? CY : CY + "AA",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, padding: "4px 8px",
          boxShadow: open ? `0 0 18px ${CY}44` : "none",
          backdropFilter: "blur(6px)",
          whiteSpace: "nowrap",
        }}>
        ◈ KIOETR
        {badgeDark > 0 && (
          <span style={{
            marginLeft: 4, background: AM, color: "#04060A",
            borderRadius: 4, fontSize: 8, padding: "1px 4px", fontWeight: 700,
          }}>{badgeDark}</span>
        )}
      </button>
    </>
  );
}
