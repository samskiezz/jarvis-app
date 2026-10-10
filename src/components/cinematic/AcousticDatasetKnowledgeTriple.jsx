/**
 * F749 — Acoustic × Dataset × Knowledge Triple Nexus (ACDKNTRI)
 * Endpoints: /v1/acoustic/contacts  ×  /v1/datasets  ×  /knowledge/articles
 * Classification: FULLY_DOCUMENTED | DATA_ONLY | KNOWLEDGE_ONLY | DARK
 *
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const DIM = "#8899AA";

const BTN_LEFT = 915_200;
const POLL_MS  = 90_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const ACDKNTRI_RE =
  /\b(acdkntri|acoustic\s+dataset\s+knowledge|acoustic\s+data\s+knowledge|sensor\s+dataset\s+knowledge|acoustic\s+knowledge|acoustic\s+data\s+context|acoustic\s+signal\s+context|sensor\s+knowledge\s+gap|acoustic\s+knowledge\s+gap|acoustic\s+data\s+coverage)\b/i;

export function isAcdkntriQuery(t) {
  return ACDKNTRI_RE.test(t || "");
}

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw)
    ? raw
    : raw.contacts || raw.data || raw.items || [];
  return arr.filter(Boolean);
}

function normaliseDatasets(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.datasets)) return raw.datasets;
  if (raw && Array.isArray(raw.data))     return raw.data;
  if (raw && Array.isArray(raw.items))    return raw.items;
  return [];
}

function normaliseArticles(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.articles)) return raw.articles;
  if (raw && Array.isArray(raw.data))     return raw.data;
  if (raw && Array.isArray(raw.items))    return raw.items;
  return [];
}

function keywords(obj) {
  return [
    obj.name, obj.title, obj.description, obj.label,
    obj.type, obj.category, obj.kind, obj.summary,
    obj.tags, obj.role, obj.subject, obj.topic,
    obj.frequency, obj.mmsi, obj.vessel_name,
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

function buildNexus(contacts, datasets, articles) {
  return contacts.map(contact => {
    const cKw = keywords(contact);

    const bestDs = datasets.reduce(
      (best, ds) => {
        const s = scoreMatch(cKw, keywords(ds));
        return s > best.score ? { score: s, ds } : best;
      },
      { score: 0, ds: null },
    );

    const bestArt = articles.reduce(
      (best, art) => {
        const s = scoreMatch(cKw, keywords(art));
        return s > best.score ? { score: s, art } : best;
      },
      { score: 0, art: null },
    );

    const hasDs  = bestDs.score  > 0;
    const hasArt = bestArt.score > 0;

    const status =
      hasDs && hasArt ? "FULLY_DOCUMENTED" :
      hasDs           ? "DATA_ONLY"         :
      hasArt          ? "KNOWLEDGE_ONLY"    :
                        "DARK";

    return {
      contact,
      matchedDs  : hasDs  ? bestDs.ds   : null,
      matchedArt : hasArt ? bestArt.art : null,
      dsScore    : bestDs.score,
      artScore   : bestArt.score,
      status,
    };
  });
}

async function fetchAll() {
  const base = apiBase();
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const [cRaw, dRaw, aRaw] = await Promise.all([
    fetch(`${base}/v1/acoustic/contacts?limit=200`, { headers: hdr })
      .then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${base}/v1/datasets`)
      .then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${base}/knowledge/articles`)
      .then(r => r.ok ? r.json() : []).catch(() => []),
  ]);
  return {
    contacts : normaliseContacts(cRaw),
    datasets : normaliseDatasets(dRaw),
    articles : normaliseArticles(aRaw),
  };
}

export async function buildAcdkntriScript() {
  try {
    const { contacts, datasets, articles } = await fetchAll();
    if (!contacts.length) return "No acoustic contacts found for triple nexus analysis, sir.";
    const nexus  = buildNexus(contacts, datasets, articles);
    const fully  = nexus.filter(r => r.status === "FULLY_DOCUMENTED").length;
    const dataO  = nexus.filter(r => r.status === "DATA_ONLY").length;
    const knowO  = nexus.filter(r => r.status === "KNOWLEDGE_ONLY").length;
    const dark   = nexus.filter(r => r.status === "DARK").length;
    const cov    = contacts.length
      ? Math.round((fully / contacts.length) * 100) : 0;
    const darkNames = nexus
      .filter(r => r.status === "DARK")
      .slice(0, 3)
      .map(r => r.contact.name || r.contact.vessel_name || r.contact.mmsi || "Unknown")
      .join("; ");
    return (
      `Acoustic Dataset Knowledge Triple Nexus: ${contacts.length} acoustic contacts cross-referenced ` +
      `against ${datasets.length} datasets and ${articles.length} knowledge articles. ` +
      `${fully} fully documented (dataset + article match). ` +
      `${dataO} dataset only. ${knowO} knowledge only. ` +
      `${dark} dark — no data or knowledge coverage${darkNames ? `: ${darkNames}` : ""}. ` +
      `Overall coverage: ${cov}%. Dark contacts represent sensor intelligence gaps requiring attention.`
    );
  } catch {
    return "Acoustic Dataset Knowledge Triple Nexus data unavailable.";
  }
}

const STATUS_META = {
  FULLY_DOCUMENTED : { label: "FULLY DOCUMENTED", col: GN  },
  DATA_ONLY        : { label: "DATA ONLY",         col: CY  },
  KNOWLEDGE_ONLY   : { label: "KNOWLEDGE ONLY",    col: AM  },
  DARK             : { label: "DARK",              col: RD  },
};

export default function AcousticDatasetKnowledgeTriple() {
  const [open,    setOpen]    = useState(false);
  const [rows,    setRows]    = useState([]);
  const [counts,  setCounts]  = useState({
    FULLY_DOCUMENTED: 0, DATA_ONLY: 0, KNOWLEDGE_ONLY: 0, DARK: 0,
  });
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(null);
  const [filter,  setFilter]  = useState("ALL");
  const [search,  setSearch]  = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { contacts, datasets, articles } = await fetchAll();
      const nexus = buildNexus(contacts, datasets, articles);
      setRows(nexus);
      setCounts({
        FULLY_DOCUMENTED : nexus.filter(r => r.status === "FULLY_DOCUMENTED").length,
        DATA_ONLY        : nexus.filter(r => r.status === "DATA_ONLY").length,
        KNOWLEDGE_ONLY   : nexus.filter(r => r.status === "KNOWLEDGE_ONLY").length,
        DARK             : nexus.filter(r => r.status === "DARK").length,
      });
    } catch (e) {
      setErr(e.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:acdkntri-toggle", toggle);
    return () => window.removeEventListener("jarvis:acdkntri-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const sq = search.toLowerCase();
  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.status !== filter) return false;
    if (!sq) return true;
    const c = r.contact;
    const label = (c.name || c.vessel_name || c.mmsi || "").toLowerCase();
    return label.includes(sq);
  });

  const cov = rows.length
    ? Math.round((counts.FULLY_DOCUMENTED / rows.length) * 100) : 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position    : "fixed",
          bottom      : 8,
          left        : BTN_LEFT,
          zIndex      : 608,
          background  : open ? "rgba(41,231,255,0.14)" : "rgba(20,24,32,0.82)",
          border      : `1px solid ${open ? CY : DIM}`,
          color       : open ? CY : DIM,
          borderRadius: 6,
          padding     : "3px 10px",
          fontSize    : 11,
          cursor      : "pointer",
          fontFamily  : "monospace",
          letterSpacing: "0.05em",
          whiteSpace  : "nowrap",
        }}
        title="Acoustic × Dataset × Knowledge Triple Nexus (F749)"
      >
        ACDKNTRI
        {counts.DARK > 0 && (
          <span style={{
            marginLeft  : 5,
            background  : AM,
            color       : "#000",
            borderRadius: 3,
            padding     : "0 4px",
            fontSize    : 9,
            fontWeight  : 700,
          }}>
            {counts.DARK}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position     : "fixed",
            bottom       : 36,
            left         : BTN_LEFT,
            width        : 860,
            maxHeight    : 560,
            zIndex       : 608,
            background   : "rgba(10,13,20,0.97)",
            border       : `1px solid ${CY}`,
            borderRadius : 10,
            boxShadow    : `0 0 32px ${CY}44`,
            display      : "flex",
            flexDirection: "column",
            overflow     : "hidden",
            fontFamily   : "monospace",
          }}
        >
          {/* Header */}
          <div style={{
            padding     : "8px 14px 6px",
            borderBottom: `1px solid ${CY}44`,
            display     : "flex",
            alignItems  : "center",
            gap         : 10,
            flexShrink  : 0,
          }}>
            <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: "0.1em" }}>
              ACOUSTIC × DATASET × KNOWLEDGE — TRIPLE NEXUS
            </span>
            <span style={{ color: DIM, fontSize: 10, marginLeft: "auto" }}>F749</span>
            {loading && <span style={{ color: AM, fontSize: 10 }}>LOADING…</span>}
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>

          {/* Stat bar */}
          <div style={{
            display     : "flex",
            gap         : 8,
            padding     : "5px 14px",
            borderBottom: `1px solid ${CY}22`,
            flexShrink  : 0,
            flexWrap    : "wrap",
          }}>
            {[
              { label: "CONTACTS",  val: rows.length,         col: CY },
              { label: "COVERAGE",  val: `${cov}%`,           col: GN },
              { label: "FULL DOC",  val: counts.FULLY_DOCUMENTED, col: GN },
              { label: "DARK",      val: counts.DARK,         col: RD },
            ].map(tile => (
              <span key={tile.label} style={{
                background  : `${tile.col}11`,
                border      : `1px solid ${tile.col}44`,
                color       : tile.col,
                borderRadius: 4,
                padding     : "2px 10px",
                fontSize    : 10,
              }}>
                {tile.label}: <strong>{tile.val}</strong>
              </span>
            ))}

            {/* Filter tabs */}
            {Object.entries(STATUS_META).map(([k, m]) => (
              <button
                key={k}
                onClick={() => setFilter(f => f === k ? "ALL" : k)}
                style={{
                  background  : filter === k ? `${m.col}22` : "transparent",
                  border      : `1px solid ${filter === k ? m.col : DIM + "66"}`,
                  color       : filter === k ? m.col : DIM,
                  borderRadius: 4,
                  padding     : "2px 8px",
                  fontSize    : 10,
                  cursor      : "pointer",
                  fontFamily  : "monospace",
                }}
              >
                {m.label} ({counts[k]})
              </button>
            ))}
            <button
              onClick={() => setFilter("ALL")}
              style={{
                background  : filter === "ALL" ? `${CY}22` : "transparent",
                border      : `1px solid ${filter === "ALL" ? CY : DIM + "66"}`,
                color       : filter === "ALL" ? CY : DIM,
                borderRadius: 4,
                padding     : "2px 8px",
                fontSize    : 10,
                cursor      : "pointer",
                fontFamily  : "monospace",
              }}
            >
              ALL ({rows.length})
            </button>
            <button
              onClick={load}
              style={{
                marginLeft  : "auto",
                background  : "transparent",
                border      : `1px solid ${DIM}66`,
                color       : DIM,
                borderRadius: 4,
                padding     : "2px 8px",
                fontSize    : 10,
                cursor      : "pointer",
              }}
            >↺</button>
          </div>

          {/* Search */}
          <div style={{ padding: "4px 14px", borderBottom: `1px solid ${CY}11`, flexShrink: 0 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search contacts…"
              style={{
                width       : "100%",
                background  : "transparent",
                border      : `1px solid ${DIM}44`,
                color       : "#E0EAF2",
                borderRadius: 4,
                padding     : "3px 8px",
                fontSize    : 11,
                fontFamily  : "monospace",
                outline     : "none",
              }}
            />
          </div>

          {err && (
            <div style={{ padding: "6px 14px", color: RD, fontSize: 11 }}>
              ERROR: {err}
            </div>
          )}

          <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, padding: "12px 14px" }}>
                No contacts{filter !== "ALL" ? ` matching filter: ${filter}` : ""}{sq ? ` for "${search}"` : ""}.
              </div>
            )}
            {visible.map((row, i) => {
              const c    = row.contact;
              const meta = STATUS_META[row.status];
              const name = c.name || c.vessel_name || c.mmsi || `Contact #${i + 1}`;
              const kind = c.type || c.category || c.kind || c.frequency || "";
              const dsLabel  = row.matchedDs
                ? (row.matchedDs.name || row.matchedDs.title || "Dataset")
                : null;
              const artLabel = row.matchedArt
                ? (row.matchedArt.title || row.matchedArt.name || "Article")
                : null;
              const dsKind   = row.matchedDs?.kind  || row.matchedDs?.format  || "";
              const artKind  = row.matchedArt?.kind || row.matchedArt?.type   || "";
              return (
                <div
                  key={i}
                  style={{
                    padding     : "6px 14px",
                    borderBottom: `1px solid ${CY}11`,
                    display     : "flex",
                    gap         : 10,
                    alignItems  : "flex-start",
                  }}
                >
                  <span style={{
                    minWidth     : 148,
                    fontSize     : 9,
                    color        : meta.col,
                    fontWeight   : 700,
                    letterSpacing: "0.06em",
                    paddingTop   : 1,
                  }}>
                    {meta.label}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#E8EEF6", fontSize: 11, fontWeight: 600 }}>
                      {name}
                      {kind && (
                        <span style={{ color: DIM, fontWeight: 400, marginLeft: 6, fontSize: 10 }}>
                          [{kind}]
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                      {dsLabel && (
                        <span style={{ color: CY, fontSize: 9, background: `${CY}12`, borderRadius: 3, padding: "1px 5px" }}>
                          DS: {dsLabel}{dsKind ? ` [${dsKind}]` : ""} ×{row.dsScore}
                        </span>
                      )}
                      {artLabel && (
                        <span style={{ color: AM, fontSize: 9, background: `${AM}12`, borderRadius: 3, padding: "1px 5px" }}>
                          KB: {artLabel}{artKind ? ` [${artKind}]` : ""} ×{row.artScore}
                        </span>
                      )}
                      {!dsLabel && !artLabel && (
                        <span style={{ color: RD, fontSize: 9, background: `${RD}12`, borderRadius: 3, padding: "1px 5px" }}>
                          NO DATA OR KNOWLEDGE COVERAGE
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{
            padding   : "4px 14px",
            borderTop : `1px solid ${CY}22`,
            color     : DIM,
            fontSize  : 9,
            flexShrink: 0,
          }}>
            /v1/acoustic/contacts × /v1/datasets × /knowledge/articles | poll {POLL_MS / 1000}s | F749
          </div>
        </div>
      )}
    </>
  );
}
