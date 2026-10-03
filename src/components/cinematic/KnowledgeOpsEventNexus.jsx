/**
 * KnowledgeOpsEventNexus — F706
 *
 * Polls GET /knowledge/ + GET /v1/ops/events every 90 s.
 * Cross-references: which knowledge articles are REFERENCED by ≥1 ops event
 * (keyword overlap in title/summary) vs UNREFERENCED.
 *
 * Voice intents: "knoevt" | "knowledge ops events" | "ops events knowledge"
 *                | "which knowledge covers ops" | "knowledge event coverage"
 *                | "event documentation coverage" | "knowledge ops coverage"
 * Strip button: ◈ KNOEVT   left:884040  bottom:8  zIndex:242
 * Custom event: jarvis:knoevt-toggle
 *
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFB347";
const DIM = "#566878";
const POLL = 90_000;
const BTN_LEFT = 884040;
const ZIDX = 242;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const KNOEVT_RE =
  /\b(knoevt|knowledge[.\s-]*ops[.\s-]*event|ops[.\s-]*event[.\s-]*knowledge|which[.\s]*knowledge[.\s]*covers[.\s]*ops|knowledge[.\s]*event[.\s]*coverage|event[.\s]*doc[.\s]*coverage|knowledge[.\s]*ops[.\s]*coverage)\b/i;

export function isKnoevtQuery(q) {
  return KNOEVT_RE.test(q || "");
}

export async function buildKnoevtScript() {
  try {
    const [kr, er] = await Promise.all([
      fetch(`${apiBase()}/knowledge/`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/ops/events`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const articles = kr.ok ? ((await kr.json())?.results ?? []) : [];
    const events   = er.ok ? ((await er.json())?.results ?? []) : [];

    if (!articles.length && !events.length)
      return "Knowledge and ops-events data are unavailable at present, sir.";

    const evTokens = events.flatMap(e =>
      `${e.title||""} ${e.summary||""} ${e.description||""} ${e.kind||""}`.toLowerCase().split(/\W+/).filter(t => t.length > 3)
    );
    const evSet = new Set(evTokens);

    const referenced = articles.filter(a => {
      const words = `${a.title||""} ${a.summary||""} ${a.content||""}`.toLowerCase().split(/\W+/).filter(t => t.length > 3);
      return words.some(w => evSet.has(w));
    });

    const pct = articles.length ? Math.round((referenced.length / articles.length) * 100) : 0;

    const brief = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: `Knowledge ops-events nexus: ${articles.length} knowledge articles, ${events.length} ops events, ${referenced.length} articles referenced by ops events (${pct}%). Provide a 2-sentence operational brief on knowledge coverage of ops events.` }),
    }).then(r => r.ok ? r.json() : null).then(d => d?.response || d?.reply || "").catch(() => "");

    return (
      `Knowledge × Ops Events Nexus, sir. ${articles.length} articles, ${events.length} ops events. ` +
      `${referenced.length} articles (${pct}%) are referenced by ops events; ${articles.length - referenced.length} are unreferenced. ` +
      (brief || "")
    ).trim();
  } catch {
    return "I was unable to retrieve the knowledge ops-events nexus at this time, sir.";
  }
}

const PANEL = {
  position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
  zIndex: ZIDX + 10, width: "min(560px,95vw)",
  background: "rgba(4,8,14,0.94)", border: `1px solid ${CY}44`, borderRadius: 12,
  backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
  boxShadow: `0 0 48px ${CY}18`, fontFamily: "'JetBrains Mono',monospace",
  color: "#DCEBF5", overflow: "hidden",
};
const HDR = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
  background: "rgba(41,231,255,0.05)",
};

function keywords(str) {
  return str.toLowerCase().split(/\W+/).filter(t => t.length > 3);
}

function scoreArticle(article, evTokenSet) {
  const words = keywords(`${article.title||""} ${article.summary||""} ${article.content||""}`);
  return words.filter(w => evTokenSet.has(w)).length;
}

export default function KnowledgeOpsEventNexus() {
  const [open, setOpen]     = useState(false);
  const [articles, setArts] = useState([]);
  const [events, setEvts]   = useState([]);
  const [loading, setLoad]  = useState(false);
  const [err, setErr]       = useState(null);
  const [tab, setTab]       = useState("ALL");
  const [q, setQ]           = useState("");
  const [expanded, setExp]  = useState(null);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoad(true); setErr(null);
    try {
      const [kr, er] = await Promise.all([
        fetch(`${apiBase()}/knowledge/`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/v1/ops/events`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      setArts(kr.ok ? ((await kr.json())?.results ?? []) : []);
      setEvts(er.ok ? ((await er.json())?.results ?? []) : []);
    } catch (e) { setErr(e.message); }
    finally { setLoad(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:knoevt-toggle", h);
    return () => window.removeEventListener("jarvis:knoevt-toggle", h);
  }, []);

  const evTokenSet = new Set(events.flatMap(e =>
    keywords(`${e.title||""} ${e.summary||""} ${e.description||""} ${e.kind||""}`)));

  const enriched = articles.map(a => ({ ...a, hits: scoreArticle(a, evTokenSet) }));
  const referenced   = enriched.filter(a => a.hits > 0);
  const unreferenced = enriched.filter(a => a.hits === 0);

  const pct = articles.length ? Math.round((referenced.length / articles.length) * 100) : 0;

  const visible = enriched
    .filter(a => tab === "ALL" || (tab === "REFERENCED" ? a.hits > 0 : a.hits === 0))
    .filter(a => !q || (a.title||"").toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Knowledge × Ops Events coverage nexus"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: ZIDX,
          padding: "4px 10px", background: open ? CY : "rgba(5,8,13,0.75)",
          color: open ? "#04060A" : CY, border: `1px solid ${CY}`,
          borderRadius: 6, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
      >
        ◈ KNOEVT
      </button>

      {open && (
        <div style={PANEL}>
          <div style={HDR}>
            <span style={{ color: CY, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>
              ◈ Knowledge × Ops Events Nexus
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {["ALL","REFERENCED","UNREFERENCED"].map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  fontSize: 8, padding: "2px 7px", borderRadius: 4,
                  border: `1px solid ${tab===t ? CY : "#2a3a4a"}`,
                  background: tab===t ? `${CY}22` : "transparent",
                  color: tab===t ? CY : DIM, cursor: "pointer",
                  fontFamily: "inherit", textTransform: "uppercase", letterSpacing: 1,
                }}>{t}</button>
              ))}
              <button onClick={() => setOpen(false)} style={{
                background:"none", border:"none", color: DIM,
                cursor:"pointer", fontSize:14, marginLeft:4, lineHeight:1,
              }}>×</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
            {[
              ["ARTICLES", articles.length, CY],
              ["OPS EVENTS", events.length, AMB],
              ["REFERENCED", referenced.length, GRN],
              ["UNREFERENCED", unreferenced.length, "#e8203c"],
              ["COVERAGE", `${pct}%`, pct >= 60 ? GRN : pct >= 30 ? AMB : "#e8203c"],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                flex: "1 1 80px", background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}18`, borderRadius: 8, padding: "6px 10px", textAlign:"center",
              }}>
                <div style={{ fontSize: 16, color: col, fontVariantNumeric: "tabular-nums" }}>{val}</div>
                <div style={{ fontSize: 8, color: DIM, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 14px 8px" }}>
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Filter articles…"
              style={{
                width: "100%", boxSizing: "border-box", background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}22`, borderRadius: 6, color: "#DCEBF5",
                fontFamily: "inherit", fontSize: 10, padding: "5px 9px", outline: "none",
              }}
            />
          </div>

          {/* List */}
          <div style={{ padding: "0 14px 10px", maxHeight: 300, overflowY: "auto" }}>
            {loading && !articles.length && (
              <div style={{ color: DIM, fontSize: 10 }}>◌ Loading…</div>
            )}
            {err && <div style={{ color: "#e8203c", fontSize: 10 }}>⚠ {err}</div>}
            {visible.map((a, i) => (
              <div key={a.id || i}>
                <div
                  onClick={() => setExp(exp => exp === i ? null : i)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "5px 0",
                    borderBottom: "1px solid rgba(41,231,255,0.06)", cursor: "pointer",
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: a.hits > 0 ? GRN : "#e8203c",
                  }} />
                  <span style={{ flex: 1, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.title || a.id || "Untitled"}
                  </span>
                  {a.hits > 0 && (
                    <span style={{ fontSize: 8, color: GRN, minWidth: 44, textAlign: "right" }}>
                      {a.hits} hit{a.hits !== 1 ? "s" : ""}
                    </span>
                  )}
                  {a.hits === 0 && (
                    <span style={{ fontSize: 8, color: DIM, minWidth: 44, textAlign: "right" }}>
                      —
                    </span>
                  )}
                </div>
                {expanded === i && (
                  <div style={{ padding: "6px 10px 6px 18px", background: "rgba(41,231,255,0.03)", borderRadius: 6, marginBottom: 4 }}>
                    {a.summary && <div style={{ fontSize: 10, color: "#DCEBF5", marginBottom: 4 }}>{a.summary}</div>}
                    {a.hits > 0 && (
                      <div style={{ fontSize: 9, color: GRN }}>
                        ✓ Referenced by {a.hits} ops-event token{a.hits !== 1 ? "s" : ""}
                      </div>
                    )}
                    {a.hits === 0 && (
                      <div style={{ fontSize: 9, color: DIM }}>Not referenced by any ops event</div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!loading && !err && visible.length === 0 && (
              <div style={{ color: DIM, fontSize: 10 }}>No articles match.</div>
            )}
          </div>

          <div style={{ padding: "6px 14px", borderTop: `1px solid rgba(41,231,255,0.06)`, fontSize: 8, color: DIM, display: "flex", justifyContent: "space-between" }}>
            <span>Source: /knowledge/ × /v1/ops/events</span>
            <span style={{ color: loading ? AMB : GRN }}>
              {loading ? "◌ updating" : `${visible.length} shown · ${tab}`}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
