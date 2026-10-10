/**
 * KnowledgeCategoryHeatmap — F40.
 * Polls /knowledge/ → groups articles by category/kind → ranked bar chart.
 * Stat tiles: TOTAL / CATEGORIES / LARGEST / NO_CATEGORY.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts. ◈ KCAT toggle button.
 * Additive only — mounted in App.jsx.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const AM  = "#F59E0B";
const GR  = "#4ADE80";
const DIM = "#1A2A36";
const BG  = "rgba(0,10,20,0.96)";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const KCAT_RE =
  /\bknowledge\s?categor|knowledge\s?heatmap|knowledge\s?distribution|kcat\b|kb\s?categor/i;

const REFRESH_MS = 120_000;
const BTN_LEFT   = 929820;
const Z          = 625;

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

async function fetchKnowledge() {
  const r = await fetch(`${apiBase()}/knowledge/`, { headers: authHdr() });
  if (!r.ok) throw new Error(`knowledge/ ${r.status}`);
  const d = await r.json();
  const arr = Array.isArray(d) ? d
    : Array.isArray(d?.data) ? d.data
    : Array.isArray(d?.items) ? d.items
    : Array.isArray(d?.knowledge) ? d.knowledge
    : Array.isArray(d?.articles) ? d.articles
    : [];
  return arr.map((x) => ({
    id:       x.id || x._id || String(Math.random()),
    title:    x.title || x.name || x.subject || "(untitled)",
    category: x.category || x.kind || x.type || x.topic_type || "",
  }));
}

function groupByCategory(articles) {
  const map = {};
  for (const a of articles) {
    const cat = a.category.trim() || "(none)";
    map[cat] = (map[cat] || 0) + 1;
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => ({ cat, count }));
}

export function isKcatQuery(text) {
  return KCAT_RE.test(text || "");
}

export async function buildKcatScript() {
  let articles = [];
  try {
    articles = await fetchKnowledge();
  } catch (_) {}
  if (!articles.length)
    return "The knowledge base is empty or unreachable. No category data available, sir.";
  const groups = groupByCategory(articles);
  const noCat  = articles.filter((a) => !a.category.trim()).length;
  const top3   = groups.slice(0, 3).map((g) => `${g.cat} (${g.count})`).join(", ");
  return (
    `Knowledge base contains ${articles.length} articles across ${groups.length} ` +
    `categories. Top categories: ${top3}. ` +
    (noCat ? `${noCat} articles lack a category and should be classified.` : "All articles are categorised.")
  );
}

const TILE = {
  background: "rgba(0,255,200,0.05)",
  border: "1px solid rgba(41,231,255,0.2)",
  borderRadius: 6,
  padding: "6px 12px",
  minWidth: 90,
  textAlign: "center",
};

function Tile({ label, value, color = CY }) {
  return (
    <div style={TILE}>
      <div style={{ color, fontSize: 20, fontWeight: 700, fontFamily: "monospace" }}>{value}</div>
      <div style={{ color: "#6B8CA3", fontSize: 9, letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

export default function KnowledgeCategoryHeatmap() {
  const [open,     setOpen]     = useState(false);
  const [groups,   setGroups]   = useState([]);
  const [total,    setTotal]    = useState(0);
  const [noCat,    setNoCat]    = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState("");
  const [assessing,setAssessing]= useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const articles = await fetchKnowledge();
      setTotal(articles.length);
      setNoCat(articles.filter((a) => !a.category.trim()).length);
      setGroups(groupByCategory(articles));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen((o) => {
        if (!o) load();
        return !o;
      });
    };
    window.addEventListener("jarvis:kcat-toggle", toggle);
    return () => window.removeEventListener("jarvis:kcat-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const handleAssess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildKcatScript();
      const voice  = getActiveVoice();
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Knowledge category heatmap assessment: ${script}` }),
      });
      const j = await res.json();
      const reply = j.response || j.message || j.answer || script;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: reply, voice },
      }));
    } catch (_) {
      const fallback = await buildKcatScript().catch(() => "Knowledge assessment unavailable.");
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: fallback, voice: getActiveVoice() },
      }));
    } finally {
      setAssessing(false);
    }
  }, []);

  const maxCount = groups[0]?.count || 1;
  const largest  = groups[0]?.cat  || "—";

  const barColor = (i) => {
    if (i < 3) return GR;
    if (i < 6) return CY;
    return AM;
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { setOpen((o) => { if (!o) load(); return !o; }); }}
        style={{
          position:   "fixed",
          left:       BTN_LEFT,
          bottom:     8,
          zIndex:     Z,
          background: open ? "rgba(41,231,255,0.18)" : "rgba(0,10,20,0.7)",
          border:     `1px solid ${open ? CY : "rgba(41,231,255,0.3)"}`,
          color:      open ? CY : "#6B8CA3",
          borderRadius: 4,
          padding:    "3px 8px",
          fontSize:   10,
          cursor:     "pointer",
          fontFamily: "monospace",
          letterSpacing: 1,
          whiteSpace: "nowrap",
        }}
        title="Knowledge Category Heatmap (KCAT)"
      >
        ◈ KCAT {total > 0 && <span style={{ color: GR }}>{total}</span>}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position:   "fixed",
            left:       "50%",
            top:        "50%",
            transform:  "translate(-50%,-50%)",
            zIndex:     Z + 1,
            width:      520,
            maxHeight:  600,
            background: BG,
            border:     `1px solid ${CY}44`,
            borderRadius: 10,
            boxShadow:  `0 0 40px ${CY}22`,
            display:    "flex",
            flexDirection: "column",
            overflow:   "hidden",
            fontFamily: "monospace",
          }}
        >
          {/* Header */}
          <div style={{
            display:    "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding:    "10px 16px",
            borderBottom: `1px solid ${CY}33`,
          }}>
            <span style={{ color: CY, fontSize: 13, letterSpacing: 2 }}>
              ◈ KNOWLEDGE CATEGORIES
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleAssess}
                disabled={assessing}
                style={{
                  background: assessing ? "#0A2030" : "rgba(41,231,255,0.1)",
                  border:     `1px solid ${CY}55`,
                  color:      assessing ? "#6B8CA3" : CY,
                  borderRadius: 4,
                  padding:    "3px 10px",
                  fontSize:   10,
                  cursor:     assessing ? "default" : "pointer",
                  letterSpacing: 1,
                }}
              >
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "transparent",
                  border:     "none",
                  color:      "#6B8CA3",
                  fontSize:   16,
                  cursor:     "pointer",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "12px 16px", flexWrap: "wrap" }}>
            <Tile label="TOTAL" value={loading ? "…" : total} color={CY} />
            <Tile label="CATEGORIES" value={loading ? "…" : groups.length} color={GR} />
            <Tile label="LARGEST" value={loading ? "…" : (groups[0]?.count ?? "—")} color={AM} />
            <Tile label="NO CATEGORY" value={loading ? "…" : noCat} color={noCat ? "#EF4444" : "#6B8CA3"} />
          </div>

          {/* Error */}
          {err && (
            <div style={{ color: "#EF4444", fontSize: 11, padding: "4px 16px" }}>
              ⚠ {err}
            </div>
          )}

          {/* Bar chart */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 12px" }}>
            {loading && !groups.length ? (
              <div style={{ color: "#6B8CA3", fontSize: 11, padding: "20px 0", textAlign: "center" }}>
                Loading knowledge categories…
              </div>
            ) : groups.length === 0 ? (
              <div style={{ color: "#6B8CA3", fontSize: 11, padding: "20px 0", textAlign: "center" }}>
                No knowledge articles found.
              </div>
            ) : (
              groups.map((g, i) => {
                const pct = Math.round((g.count / maxCount) * 100);
                const col = barColor(i);
                const isBig = g.cat === largest;
                return (
                  <div
                    key={g.cat}
                    style={{
                      marginBottom: 8,
                      padding:      "6px 10px",
                      background:   isBig ? "rgba(74,222,128,0.06)" : DIM,
                      borderRadius: 5,
                      border:       isBig ? `1px solid ${GR}44` : "1px solid transparent",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ color: col, fontSize: 11, maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g.cat}
                      </span>
                      <span style={{ color: "#6B8CA3", fontSize: 10 }}>{g.count} art.</span>
                    </div>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{
                        height:     "100%",
                        width:      `${pct}%`,
                        background: col,
                        borderRadius: 3,
                        transition: "width 0.4s ease",
                      }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div style={{
            borderTop: `1px solid ${CY}22`,
            padding:   "6px 16px",
            color:     "#6B8CA3",
            fontSize:  9,
            letterSpacing: 1,
          }}>
            AUTO-REFRESH 120 s · SOURCE /knowledge/
            {loading && " · LOADING…"}
          </div>
        </div>
      )}
    </>
  );
}
