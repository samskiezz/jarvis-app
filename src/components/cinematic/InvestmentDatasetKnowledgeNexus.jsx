/**
 * InvestmentDatasetKnowledgeNexus — F101 (INVDKNEX).
 *
 * Pulls /entities/Investment × /v1/datasets × /knowledge/ and keyword-correlates
 * each investment against datasets AND KB articles, classifying each as:
 *
 *   FULLY_COVERED  — matched at least one dataset AND one KB article
 *   DATA_ONLY      — matched a dataset but no KB article
 *   KB_ONLY        — matched a KB article but no dataset
 *   DARK           — no dataset or KB backing (intelligence blind spot)
 *
 * Amber pulse on DARK count.
 *
 * Layout:
 *   • 5 stat tiles: INVESTMENTS / DATASETS / KB ARTS / FULLY COVERED / DARK
 *   • Coverage % bar
 *   • Filter tabs: ALL / FULLY_COVERED / DATA_ONLY / KB_ONLY / DARK
 *   • Text search on investment name / type / symbol
 *   • Expandable rows → matched datasets (cyan) + KB articles (amber)
 *   • ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle:  ◈ INVDKNEX at left:979400, bottom:8, zIndex:125
 * Mounted: App.jsx
 * Wired:   JarvisBrain.jsx via isInvdknexQuery / buildInvdknexScript
 *
 * Voice: "invdknex" / "investment dataset" / "investment knowledge" /
 *        "dark investment" / "investment backing" / "portfolio coverage" /
 *        "investment intelligence" / "investment data knowledge"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#FFB347";
const GREEN = "#00c878";
const RED   = "#FF3D5A";
const DIM   = "#1a2a38";

const BTN_LEFT   = 979400;
const REFRESH_MS = 120_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function normalise(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function keywords(str = "") {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function matches(entity, pool) {
  const eks = keywords(
    [entity.name, entity.symbol, entity.type, entity.description, entity.ticker].join(" ")
  );
  if (!eks.length) return [];
  return pool.filter(item => {
    const pks = keywords(
      [item.title, item.subject, item.name, item.description, item.content, item.type].join(" ")
    );
    return eks.some(k => pks.includes(k));
  });
}

function classify(dataHits, kbHits) {
  if (dataHits > 0 && kbHits > 0) return "FULLY_COVERED";
  if (dataHits > 0)                return "DATA_ONLY";
  if (kbHits > 0)                  return "KB_ONLY";
  return "DARK";
}

const CLASS_ORDER = ["FULLY_COVERED", "DATA_ONLY", "KB_ONLY", "DARK"];

async function fetchData() {
  const base = apiBase();
  const hdr  = authHdr();
  const [rawInv, rawDS, rawKB] = await Promise.all([
    fetch(`${base}/entities/Investment`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/datasets`,         { headers: hdr }).then(r => r.json()),
    fetch(`${base}/knowledge/`,          { headers: hdr }).then(r => r.json()),
  ]);
  const investments = normalise(rawInv);
  const datasets    = normalise(rawDS);
  const kb          = normalise(rawKB);

  const rows = investments.map(inv => {
    const dataMatches = matches(inv, datasets);
    const kbMatches   = matches(inv, kb);
    return {
      ...inv,
      _class: classify(dataMatches.length, kbMatches.length),
      _data:  dataMatches,
      _kb:    kbMatches,
    };
  });

  const counts = {};
  for (const cls of CLASS_ORDER) counts[cls] = 0;
  for (const r of rows) counts[r._class]++;

  return { investments: rows, datasets, kb, counts };
}

export async function buildInvdknexScript() {
  try {
    const d = await fetchData();
    const dark = d.counts.DARK;
    return (
      `Investment portfolio intelligence coverage assessment. ` +
      `${d.investments.length} investments correlated against ${d.datasets.length} datasets and ${d.kb.length} knowledge articles. ` +
      `${d.counts.FULLY_COVERED} fully covered, ${d.counts.DATA_ONLY} data-only, ` +
      `${d.counts.KB_ONLY} KB-only, ${dark} dark (no backing). ` +
      (dark > 0
        ? `Priority gap: ${dark} investments have no dataset or knowledge article backing — intelligence blind spots requiring immediate enrichment.`
        : `All investments have data or knowledge backing — portfolio intelligence is complete.`)
    );
  } catch {
    return "Investment dataset knowledge coverage check. Assess portfolio intelligence gaps.";
  }
}

export function isInvdknexQuery(q = "") {
  const t = q.toLowerCase();
  return (
    t.includes("invdknex") ||
    t.includes("investment dataset") ||
    t.includes("investment knowledge") ||
    t.includes("dark investment") ||
    t.includes("investment backing") ||
    t.includes("portfolio coverage") ||
    t.includes("investment intelligence") ||
    t.includes("investment data knowledge")
  );
}

// ── subcomponents ──────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      background: DIM, borderRadius: 6, padding: "5px 10px",
      display: "flex", flexDirection: "column", alignItems: "center", minWidth: 72,
    }}>
      <span style={{ fontSize: 16, fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace" }}>
        {value}
      </span>
      <span style={{ fontSize: 8, color: "#6E8AA0", letterSpacing: 1.5, marginTop: 1 }}>{label}</span>
    </div>
  );
}

function ScoreBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 9, color: "#8AABB8", letterSpacing: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>{label}</span>
        <span style={{ fontSize: 9, color, fontWeight: 700 }}>{value}</span>
      </div>
      <div style={{ height: 4, background: "#0d1922", borderRadius: 2 }}>
        <div style={{
          height: "100%", width: `${pct}%`, background: color,
          borderRadius: 2, transition: "width 0.5s",
        }} />
      </div>
    </div>
  );
}

function Row({ row }) {
  const [expanded, setExpanded] = useState(false);

  const clsColor = {
    FULLY_COVERED: GREEN,
    DATA_ONLY:     CY,
    KB_ONLY:       AMBER,
    DARK:          RED,
  }[row._class] || "#888";

  const isDark = row._class === "DARK";

  return (
    <div style={{
      marginBottom: 6, background: DIM, borderRadius: 6, overflow: "hidden",
      border: `1px solid ${isDark ? AMBER + "44" : "#1a2a38"}`,
    }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
      >
        <span style={{
          fontSize: 9, color: clsColor, fontWeight: 700, letterSpacing: 1,
          minWidth: 90, textTransform: "uppercase",
          animation: isDark ? "invdkpulse 1.4s ease-in-out infinite" : "none",
        }}>
          {row._class.replace(/_/g, " ")}
        </span>
        <span style={{ flex: 1, fontSize: 11, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.name || row.symbol || row.id || "—"}
        </span>
        <span style={{ fontSize: 9, color: "#6E8AA0" }}>{row.type || row.symbol || ""}</span>
        <span style={{ fontSize: 10, color: "#6E8AA0", marginLeft: 4 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "4px 10px 10px", borderTop: "1px solid #0d1922" }}>
          {row._data.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 8, color: CY, letterSpacing: 1.5, marginBottom: 4 }}>DATASETS ({row._data.length})</div>
              {row._data.slice(0, 5).map((d, i) => (
                <ScoreBar key={i} label={d.name || d.title || "untitled"} value={i + 1} max={row._data.length} color={CY} />
              ))}
            </div>
          )}
          {row._kb.length > 0 && (
            <div>
              <div style={{ fontSize: 8, color: AMBER, letterSpacing: 1.5, marginBottom: 4 }}>KB ARTICLES ({row._kb.length})</div>
              {row._kb.slice(0, 5).map((a, i) => (
                <ScoreBar key={i} label={a.title || a.subject || a.name || "untitled"} value={i + 1} max={row._kb.length} color={AMBER} />
              ))}
            </div>
          )}
          {row._data.length === 0 && row._kb.length === 0 && (
            <div style={{ fontSize: 9, color: RED, letterSpacing: 1 }}>NO DATASETS OR KB ARTICLES MATCHED — INTELLIGENCE BLIND SPOT</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────

export default function InvestmentDatasetKnowledgeNexus() {
  const [open,    setOpen]    = useState(false);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab,     setTab]     = useState("ALL");
  const [search,  setSearch]  = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchData();
      setData(d);
    } catch {
      /* backend not reachable — silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:invdknex-toggle", handler);
    return () => window.removeEventListener("jarvis:invdknex-toggle", handler);
  }, []);

  const dark      = data ? data.counts.DARK : 0;
  const total     = data ? data.investments.length : 0;
  const covered   = data ? data.counts.FULLY_COVERED : 0;
  const covPct    = total > 0 ? Math.round((covered / total) * 100) : 0;
  const btnColor  = dark > 0 ? AMBER : CY;

  const filtered = (data?.investments ?? []).filter(r => {
    const matchTab = tab === "ALL" || r._class === tab;
    const q = search.toLowerCase();
    const matchSearch = !q || [r.name, r.type, r.symbol, r.ticker].join(" ").toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const TABS = ["ALL", ...CLASS_ORDER];

  return (
    <>
      <style>{`
        @keyframes invdkpulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.35; }
        }
        @keyframes invdkbtnpulse {
          0%,100% { box-shadow:0 0 0 0 #FFB34744; }
          50%      { box-shadow:0 0 0 6px #FFB34700; }
        }
      `}</style>

      {/* toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 125,
          background: open ? btnColor : "rgba(5,10,18,0.85)",
          border: `1px solid ${btnColor}`,
          color: open ? "#000" : btnColor,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700,
          letterSpacing: 1.5, padding: "4px 8px", borderRadius: 5,
          cursor: "pointer", whiteSpace: "nowrap",
          animation: dark > 0 && !open ? "invdkbtnpulse 1.4s ease-in-out infinite" : "none",
        }}
      >
        ◈ INVDKNEX
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 80, left: "50%", transform: "translateX(-50%)",
          width: "min(620px, 94vw)", zIndex: 900,
          background: "rgba(5,10,18,0.96)", border: `1px solid ${btnColor}44`,
          borderRadius: 14, padding: "18px 20px", backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${btnColor}22`,
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          maxHeight: "80vh", display: "flex", flexDirection: "column",
        }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
            <span style={{ color: btnColor, fontWeight: 700, fontSize: 13, letterSpacing: 3 }}>
              ◈ INVESTMENT DATASET KNOWLEDGE NEXUS
            </span>
            <span style={{ marginLeft: 8, fontSize: 9, color: "#6E8AA0", letterSpacing: 2 }}>INVDKNEX</span>
            {loading && <span style={{ marginLeft: "auto", fontSize: 9, color: CY }}>LOADING…</span>}
            <button
              onClick={() => setOpen(false)}
              style={{ marginLeft: loading ? 8 : "auto", background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16, padding: "0 4px" }}
            >✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <Tile label="INVESTMENTS"   value={total}                        color={CY}    />
            <Tile label="DATASETS"      value={data?.datasets.length ?? "—"} color={CY}    />
            <Tile label="KB ARTS"       value={data?.kb.length       ?? "—"} color={AMBER} />
            <Tile label="FULLY COVERED" value={covered}                      color={GREEN} />
            <Tile label="DARK"          value={dark}                         color={AMBER} />
          </div>

          {/* coverage bar */}
          {data && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 9, color: "#8AABB8", letterSpacing: 1 }}>PORTFOLIO COVERAGE</span>
                <span style={{ fontSize: 9, color: covPct >= 75 ? GREEN : covPct >= 40 ? AMBER : RED, fontWeight: 700 }}>
                  {covPct}%
                </span>
              </div>
              <div style={{ height: 5, background: "#0d1922", borderRadius: 3 }}>
                <div style={{
                  height: "100%", borderRadius: 3, transition: "width 0.5s",
                  width: `${covPct}%`,
                  background: covPct >= 75 ? GREEN : covPct >= 40 ? AMBER : RED,
                }} />
              </div>
            </div>
          )}

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? CY : "transparent",
                color: tab === t ? "#000" : "#6E8AA0",
                border: `1px solid ${tab === t ? CY : "#1a2a38"}`,
                borderRadius: 4, padding: "3px 8px",
                fontSize: 8, fontWeight: 700, letterSpacing: 1, cursor: "pointer",
                fontFamily: "'JetBrains Mono',monospace",
              }}>{t.replace(/_/g, " ")}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search name / type / symbol…"
            style={{
              background: DIM, border: "1px solid #1a2a38", borderRadius: 5,
              color: "#DCEBF5", fontFamily: "'JetBrains Mono',monospace",
              fontSize: 10, padding: "5px 10px", marginBottom: 10, width: "100%", boxSizing: "border-box",
            }}
          />

          {/* rows */}
          <div style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}>
            {!data && !loading && (
              <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 11, padding: 20 }}>
                No data loaded.
              </div>
            )}
            {filtered.length === 0 && data && (
              <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 11, padding: 20 }}>
                No investments match this filter.
              </div>
            )}
            {filtered.map((row, i) => (
              <Row key={row.id || row.name || row.symbol || i} row={row} />
            ))}
          </div>

          {/* assess */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, paddingTop: 10, borderTop: "1px solid #0d1922" }}>
            <button
              onClick={async () => {
                const script = await buildInvdknexScript();
                window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { text: script } }));
              }}
              style={{
                background: btnColor, color: "#000", border: "none", borderRadius: 6,
                padding: "6px 16px", cursor: "pointer", fontSize: 11, fontWeight: 700,
                letterSpacing: 1.5, fontFamily: "'JetBrains Mono',monospace",
              }}
            >▶ ASSESS</button>
          </div>
        </div>
      )}
    </>
  );
}
