/**
 * F737 — Investigation × Dataset × Knowledge Triple Nexus (IDKNTRI)
 *
 * Cross-references /v1/investigations × /v1/datasets × /knowledge/articles.
 * Keyword-matches each open investigation against available datasets and
 * knowledge articles to surface under-documented cases.
 *
 *   FULLY_GROUNDED — investigation matches ≥1 dataset AND ≥1 KB article
 *   DATASET_ONLY   — backed by a dataset, no matching KB article
 *   KB_ONLY        — KB article exists, no matching dataset
 *   DARK           — no dataset or KB article coverage for this case
 *
 * Stat tiles: INVESTIGATIONS | FULLY GROUNDED | DATASET ONLY | KB ONLY | DARK | COVERAGE %
 * Filter tabs: ALL | FULLY_GROUNDED | DATASET_ONLY | KB_ONLY | DARK + search
 * Expand investigation → matched datasets (type badge + hits) + matched articles (kind badge + hits)
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence case documentation brief + TTS
 *
 * Button: ◈ IDKNTRI  left:906400 bottom:8 zIndex:596
 * Event:  jarvis:idkntri-toggle
 * Refresh: 90 s auto-poll
 * Voice:  "idkntri / investigation dataset knowledge / case documentation / grounded investigation /
 *          dark investigation / case data / investigation knowledge / documented case /
 *          case triple nexus / investigation data coverage"
 */
import { useCallback, useEffect, useRef, useState } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const PR  = "#B47FFF";
const DIM = "#8899AA";
const DK  = "#556677";

const BTN_LEFT = 906400;
const POLL_MS  = 90_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const IDKNTRI_RE =
  /\b(idkntri|investigation[\s._-]?dataset[\s._-]?knowledge|case[\s._-]?documentation|grounded[\s._-]?investigation|dark[\s._-]?investigation|case[\s._-]?data|investigation[\s._-]?knowledge|documented[\s._-]?case|case[\s._-]?triple[\s._-]?nexus|investigation[\s._-]?data[\s._-]?coverage)\b/i;

export function isIdkntriQuery(t) {
  return IDKNTRI_RE.test(t || "");
}

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  return (env.VITE_API_BASE_URL || "").replace(/\/$/, "") || "http://localhost:8000";
}

function normaliseInvestigations(data) {
  if (!data) return [];
  const raw = data.investigations || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((inv, i) => ({
    id:     inv.id     || `inv-${i}`,
    title:  inv.title  || inv.name || inv.subject || `Investigation ${i + 1}`,
    status: (inv.status || inv.state || "OPEN").toUpperCase(),
    kind:   inv.kind   || inv.type  || inv.category || "",
    tags:   [inv.title, inv.name, inv.subject, inv.kind, inv.type, ...(inv.tags || [])].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function normaliseDatasets(data) {
  if (!data) return [];
  const raw = data.datasets || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((d, i) => ({
    id:   d.id   || `ds-${i}`,
    name: d.name || d.title || d.dataset_name || `Dataset ${i + 1}`,
    kind: d.kind || d.type  || d.source_type  || "",
    tags: [d.name, d.title, d.kind, d.type, d.source_type, ...(d.tags || [])].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function normaliseArticles(data) {
  if (!data) return [];
  const raw = data.articles || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((a, i) => ({
    id:   a.id   || `art-${i}`,
    name: a.title || a.name || a.subject || `Article ${i + 1}`,
    kind: a.kind || a.type  || a.category || "",
    tags: [a.title, a.name, a.subject, a.kind, a.tags?.join(" ")].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function kw(obj) {
  return [obj.name || obj.title, ...(obj.tags || [])].filter(Boolean).join(" ").toLowerCase();
}

function scoreMatch(aKw, bKw) {
  const words = aKw.split(/\s+/).filter(w => w.length > 3);
  let hits = 0;
  for (const w of words) if (bKw.includes(w)) hits++;
  return hits;
}

function classifyInv(inv, datasets, articles) {
  const ik = kw(inv);
  const matchedDatasets = datasets.filter(d => scoreMatch(ik, kw(d)) > 0).map(d => ({ ...d, hits: scoreMatch(ik, kw(d)) }));
  const matchedArticles = articles.filter(a => scoreMatch(ik, kw(a)) > 0).map(a => ({ ...a, hits: scoreMatch(ik, kw(a)) }));
  const hasDs = matchedDatasets.length > 0;
  const hasKb = matchedArticles.length > 0;
  let classification;
  if (hasDs && hasKb)  classification = "FULLY_GROUNDED";
  else if (hasDs)      classification = "DATASET_ONLY";
  else if (hasKb)      classification = "KB_ONLY";
  else                 classification = "DARK";
  return { ...inv, classification, matchedDatasets, matchedArticles };
}

const STATUS_COLOR = { OPEN: CY, ACTIVE: GN, PENDING: AM, CLOSED: DIM, RESOLVED: DIM, UNKNOWN: DK };
const KIND_COLOR   = { THREAT: RD, FRAUD: AM, INTEL: CY, INTERNAL: PR, DEFAULT: DIM };
const CLS_COLOR    = { FULLY_GROUNDED: GN, DATASET_ONLY: CY, KB_ONLY: PR, DARK: DK };

export async function buildIdkntriScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  try {
    const [iRes, dRes, aRes] = await Promise.all([
      fetch(`${base}/v1/investigations`, { headers: h }),
      fetch(`${base}/v1/datasets`, { headers: h }),
      fetch(`${base}/knowledge/articles?limit=200`, { headers: h }),
    ]);
    const [iData, dData, aData] = await Promise.all([
      iRes.ok ? iRes.json() : {},
      dRes.ok ? dRes.json() : {},
      aRes.ok ? aRes.json() : {},
    ]);
    const investigations = normaliseInvestigations(iData);
    const datasets       = normaliseDatasets(dData);
    const articles       = normaliseArticles(aData);
    const classified = investigations.map(inv => classifyInv(inv, datasets, articles));
    const fully   = classified.filter(c => c.classification === "FULLY_GROUNDED").length;
    const dsOnly  = classified.filter(c => c.classification === "DATASET_ONLY").length;
    const kbOnly  = classified.filter(c => c.classification === "KB_ONLY").length;
    const dark    = classified.filter(c => c.classification === "DARK").length;
    const pct     = investigations.length ? Math.round((fully / investigations.length) * 100) : 0;
    const top3    = classified.filter(c => c.classification === "DARK").slice(0, 3).map(c => c.title).join(", ");
    const prompt  = `Investigation dataset-knowledge triple nexus: ${investigations.length} cases; ${fully} fully grounded (dataset + KB), ${dsOnly} dataset-only, ${kbOnly} KB-only, ${dark} dark (no data or knowledge context, ${pct}% fully grounded). Dark cases: ${top3 || "none"}. In 2 sentences, summarise the case documentation gaps and highest-risk undocumented investigations.`;
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers: h,
      body: JSON.stringify({ message: prompt }),
    });
    if (r.ok) {
      const d = await r.json();
      return d.response || d.message || `${investigations.length} cases: ${fully} fully grounded, ${dark} dark (${pct}%).`;
    }
    return `${investigations.length} cases: ${fully} fully grounded, ${dsOnly} dataset-only, ${kbOnly} KB-only, ${dark} dark. Coverage: ${pct}%.`;
  } catch (e) {
    return `Investigation dataset-knowledge triple nexus unavailable: ${e.message}`;
  }
}

export default function InvestigationDatasetKnowledgeTriple() {
  const [open, setOpen]           = useState(false);
  const [investigations, setInvestigations] = useState([]);
  const [datasets, setDatasets]   = useState([]);
  const [articles, setArticles]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]         = useState("");
  const timerRef                  = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const h = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
    try {
      const [iRes, dRes, aRes] = await Promise.all([
        fetch(`${base}/v1/investigations`, { headers: h }),
        fetch(`${base}/v1/datasets`, { headers: h }),
        fetch(`${base}/knowledge/articles?limit=200`, { headers: h }),
      ]);
      const [iData, dData, aData] = await Promise.all([
        iRes.ok ? iRes.json() : {},
        dRes.ok ? dRes.json() : {},
        aRes.ok ? aRes.json() : {},
      ]);
      setInvestigations(normaliseInvestigations(iData));
      setDatasets(normaliseDatasets(dData));
      setArticles(normaliseArticles(aData));
    } catch {
      // retain prior data silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => !o); if (!investigations.length) load(); };
    window.addEventListener("jarvis:idkntri-toggle", toggle);
    return () => window.removeEventListener("jarvis:idkntri-toggle", toggle);
  }, [load, investigations.length]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const classified = investigations.map(inv => classifyInv(inv, datasets, articles));
  const fully   = classified.filter(c => c.classification === "FULLY_GROUNDED").length;
  const dsOnly  = classified.filter(c => c.classification === "DATASET_ONLY").length;
  const kbOnly  = classified.filter(c => c.classification === "KB_ONLY").length;
  const dark    = classified.filter(c => c.classification === "DARK").length;
  const pct     = classified.length ? Math.round((fully / classified.length) * 100) : 0;

  const visible = classified.filter(inv => {
    if (tab !== "ALL" && inv.classification !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return inv.title.toLowerCase().includes(q) || inv.kind.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    try {
      const txt = await buildIdkntriScript();
      setBrief(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } finally {
      setAssessing(false);
    }
  };

  const S = {
    btn: {
      position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 596,
      background: dark > 0 ? `${RD}22` : "#0A1628CC",
      border: `1px solid ${dark > 0 ? RD : CY}44`, borderRadius: 6, padding: "4px 10px",
      color: CY, fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
    },
    badge: {
      display: "inline-block", marginLeft: 4, padding: "1px 5px",
      background: RD, borderRadius: 8, color: "#fff", fontSize: 9, fontWeight: 700,
    },
    panel: {
      position: "fixed", bottom: 48, left: BTN_LEFT - 20, zIndex: 597,
      width: 600, maxHeight: "80vh", display: "flex", flexDirection: "column",
      background: "#050F1E", border: `1px solid ${CY}33`, borderRadius: 8,
      fontFamily: "monospace", fontSize: 11, color: CY,
    },
    header: { padding: "10px 14px 6px", borderBottom: `1px solid ${CY}22`, display: "flex", justifyContent: "space-between", alignItems: "center" },
    tiles:  { display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${CY}22`, flexWrap: "wrap" },
    tile:   (col) => ({ background: `${col}18`, border: `1px solid ${col}44`, borderRadius: 6, padding: "4px 10px", textAlign: "center" }),
    tabs:   { display: "flex", gap: 6, padding: "6px 14px", borderBottom: `1px solid ${CY}22` },
    tab:    (active) => ({ padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontSize: 10, background: active ? `${CY}22` : "transparent", border: `1px solid ${active ? CY : DK}`, color: active ? CY : DIM }),
    search: { margin: "6px 14px", background: "#0A1A2A", border: `1px solid ${CY}33`, borderRadius: 4, padding: "4px 8px", color: CY, fontSize: 11, width: "calc(100% - 28px)" },
    list:   { overflowY: "auto", flex: 1 },
    row:    (id) => ({ padding: "8px 14px", borderBottom: `1px solid ${CY}11`, cursor: "pointer", background: expanded === id ? `${CY}08` : "transparent" }),
    badge2: (col) => ({ display: "inline-block", padding: "1px 6px", borderRadius: 3, background: `${col}22`, border: `1px solid ${col}55`, color: col, fontSize: 9, marginRight: 4 }),
    bar:    (col, hits) => ({ display: "inline-block", width: `${Math.min(hits * 4, 80)}px`, height: 6, background: col, borderRadius: 2, marginLeft: 4, verticalAlign: "middle" }),
    assess: { margin: "8px 14px", padding: "5px 12px", background: `${GN}22`, border: `1px solid ${GN}55`, borderRadius: 5, color: GN, cursor: "pointer", fontSize: 10 },
    brief:  { margin: "4px 14px 10px", padding: "8px", background: "#0A1628", border: `1px solid ${CY}22`, borderRadius: 4, fontSize: 10, color: DIM, lineHeight: 1.5 },
    footer: { padding: "6px 14px", borderTop: `1px solid ${CY}22`, color: DIM, fontSize: 9 },
  };

  if (!open) return (
    <button style={S.btn} onClick={() => { setOpen(true); load(); }}>
      ◈ IDKNTRI {dark > 0 && <span style={S.badge}>{dark}</span>}
    </button>
  );

  return (
    <>
      <button style={S.btn} onClick={() => setOpen(false)}>◈ IDKNTRI ✕</button>
      <div style={S.panel}>
        <div style={S.header}>
          <span>◈ INVESTIGATION × DATASET × KNOWLEDGE TRIPLE NEXUS</span>
          <span style={{ color: DIM, fontSize: 9 }}>{loading ? "refreshing…" : `${classified.length} cases`}</span>
        </div>

        <div style={S.tiles}>
          {[
            ["INVESTIGATIONS", classified.length, CY],
            ["FULLY GROUNDED", fully,              GN],
            ["DATASET ONLY",   dsOnly,             CY],
            ["KB ONLY",        kbOnly,             PR],
            ["DARK",           dark,               DK],
            ["COVERAGE %",     `${pct}%`,          pct >= 70 ? GN : pct >= 40 ? AM : RD],
          ].map(([label, val, col]) => (
            <div key={label} style={S.tile(col)}>
              <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
              <div style={{ color: DIM, fontSize: 9 }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={S.tabs}>
          {["ALL", "FULLY_GROUNDED", "DATASET_ONLY", "KB_ONLY", "DARK"].map(t => (
            <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>{t.replace(/_/g, " ")}</button>
          ))}
        </div>

        <input
          style={S.search}
          placeholder="Search investigations…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div style={S.list}>
          {visible.length === 0 && (
            <div style={{ padding: "16px 14px", color: DIM, textAlign: "center" }}>
              {loading ? "Loading…" : "No investigations match."}
            </div>
          )}
          {visible.map(inv => (
            <div key={inv.id}>
              <div style={S.row(inv.id)} onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}>
                <span style={S.badge2(STATUS_COLOR[inv.status] || DIM)}>{inv.status}</span>
                <span style={S.badge2(CLS_COLOR[inv.classification] || DIM)}>{inv.classification.replace(/_/g, " ")}</span>
                <strong style={{ color: CY }}>{inv.title}</strong>
                {inv.kind && <span style={{ color: DIM, marginLeft: 6 }}>[{inv.kind}]</span>}
                <span style={{ color: DIM, float: "right" }}>
                  {inv.matchedDatasets.length} ds · {inv.matchedArticles.length} kb
                </span>
              </div>
              {expanded === inv.id && (
                <div style={{ padding: "8px 14px 10px 28px", background: "#060E1C", borderBottom: `1px solid ${CY}11` }}>
                  <div style={{ display: "flex", gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: CY, fontSize: 9, marginBottom: 4 }}>DATASETS ({inv.matchedDatasets.length})</div>
                      {inv.matchedDatasets.length === 0 && <div style={{ color: DK }}>None matched</div>}
                      {inv.matchedDatasets.slice(0, 5).map(d => (
                        <div key={d.id} style={{ marginBottom: 3 }}>
                          <span style={S.badge2(AM)}>{d.kind || "DS"}</span>
                          <span style={{ color: AM }}>{d.name}</span>
                          <span style={S.bar(AM, d.hits)} />
                          <span style={{ color: DIM, marginLeft: 4 }}>×{d.hits}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: PR, fontSize: 9, marginBottom: 4 }}>KB ARTICLES ({inv.matchedArticles.length})</div>
                      {inv.matchedArticles.length === 0 && <div style={{ color: DK }}>None matched</div>}
                      {inv.matchedArticles.slice(0, 5).map(a => (
                        <div key={a.id} style={{ marginBottom: 3 }}>
                          <span style={S.badge2(PR)}>{a.kind || "ART"}</span>
                          <span style={{ color: PR }}>{a.name}</span>
                          <span style={S.bar(PR, a.hits)} />
                          <span style={{ color: DIM, marginLeft: 4 }}>×{a.hits}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <button style={S.assess} onClick={assess} disabled={assessing}>
          {assessing ? "Assessing…" : "▶ ASSESS — case documentation brief"}
        </button>
        {brief && <div style={S.brief}>{brief}</div>}

        <div style={S.footer}>
          /v1/investigations × /v1/datasets × /knowledge/articles · 90 s refresh
        </div>
      </div>
    </>
  );
}
