/**
 * InvestigationKnowledgeGrounding — F65
 * /v1/investigations × /knowledge/ → keyword-correlates each open investigation
 * against KB articles to surface GROUNDED (≥2 articles) / PARTIAL (1) / BARE (0).
 * Voice: "investigation knowledge"/"invkg"/"case knowledge"/
 *        "knowledge gap cases"/"ungrounded cases"/"investigation kb"/"case kb".
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const GRN = "#4ADE80";
const AMB = "#FFBB33";
const RED = "#FF4455";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const INVKG_RE =
  /\binvestigation\s*knowledge\b|\binvkg\b|\bcase\s*knowledge\b|\bknowledge\s*gap\s*cases?\b|\bungrounded\s*cases?\b|\binvestigation\s*kb\b|\bcase\s*kb\b|\bunbacked\s*cases?\b|\bcase\s*grounding\b/i;

export function isInvkgQuery(text) {
  return INVKG_RE.test(text || "");
}

async function fetchInvestigations() {
  const r = await fetch(`${apiBase()}/v1/investigations`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)              ? d
    : Array.isArray(d?.data)           ? d.data
    : Array.isArray(d?.results)        ? d.results
    : Array.isArray(d?.investigations) ? d.investigations
    : Array.isArray(d?.items)          ? d.items
    : [];
}

async function fetchKnowledge() {
  const r = await fetch(`${apiBase()}/knowledge/`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)              ? d
    : Array.isArray(d?.items)          ? d.items
    : Array.isArray(d?.data)           ? d.data
    : Array.isArray(d?.results)        ? d.results
    : Array.isArray(d?.articles)       ? d.articles
    : [];
}

function invKeywords(inv) {
  return [
    inv?.title, inv?.name, inv?.case_name,
    inv?.description, inv?.summary, inv?.details,
    inv?.subject, inv?.target,
    inv?.tags?.join?.(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function articleKeywords(article) {
  return [
    article?.title, article?.name, article?.summary,
    article?.body, article?.category,
    article?.tags?.join?.(" "), article?.content,
    article?.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function correlate(inv, articles) {
  const invKw   = invKeywords(inv);
  const tokens  = invKw.split(/\W+/).filter((t) => t.length > 3);
  const matched = articles.filter((art) => {
    const artKw     = articleKeywords(art);
    const artTokens = artKw.split(/\W+/).filter((t) => t.length > 3);
    return tokens.some((t) => artKw.includes(t)) || artTokens.some((t) => invKw.includes(t));
  });
  const status =
    matched.length >= 2 ? "GROUNDED"
    : matched.length === 1 ? "PARTIAL"
    : "BARE";
  return { matched, status };
}

function invLabel(inv) {
  return inv?.title || inv?.name || inv?.case_name || "Unnamed Investigation";
}

export async function buildInvkgScript() {
  const [investigations, articles] = await Promise.all([fetchInvestigations(), fetchKnowledge()]);
  if (!investigations.length) return "Investigation knowledge grounding data is unavailable, sir.";
  const rows = investigations.map((inv) => {
    const { matched, status } = correlate(inv, articles);
    return { inv, matched, status };
  });
  const grounded = rows.filter((r) => r.status === "GROUNDED");
  const partial  = rows.filter((r) => r.status === "PARTIAL");
  const bare     = rows.filter((r) => r.status === "BARE");
  const bareNames = bare.slice(0, 3).map((r) => invLabel(r.inv)).join(", ");
  return (
    `Investigation Knowledge Grounding: ${investigations.length} open cases assessed against ${articles.length} KB articles. ` +
    `${grounded.length} GROUNDED, ${partial.length} PARTIAL, ${bare.length} BARE. ` +
    (bare.length
      ? `Cases with no KB backing: ${bareNames}.`
      : "All investigations have at least one matching knowledge article, sir.")
  );
}

export default function InvestigationKnowledgeGrounding() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [filter, setFilter]       = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [loading, setLoading]     = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [investigations, articles] = await Promise.all([fetchInvestigations(), fetchKnowledge()]);
      const built = investigations.map((inv) => {
        const { matched, status } = correlate(inv, articles);
        return { inv, matched, status };
      });
      setRows(built);
    } catch {
      // keep stale data
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen((v) => { if (!v) refresh(); return !v; });
    window.addEventListener("jarvis:invkg-toggle", toggle);
    return () => window.removeEventListener("jarvis:invkg-toggle", toggle);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(refresh, 90_000);
    return () => clearInterval(id);
  }, [open, refresh]);

  const grounded = rows.filter((r) => r.status === "GROUNDED");
  const partial  = rows.filter((r) => r.status === "PARTIAL");
  const bare     = rows.filter((r) => r.status === "BARE");

  const visible = rows.filter((r) => {
    if (filter === "GROUNDED" && r.status !== "GROUNDED") return false;
    if (filter === "PARTIAL"  && r.status !== "PARTIAL")  return false;
    if (filter === "BARE"     && r.status !== "BARE")     return false;
    if (search) {
      const label = invLabel(r.inv).toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  async function assess(row) {
    const label    = invLabel(row.inv);
    setAssessing(label);
    const artNames = row.matched.map((a) => a.title || a.name || "Unknown").join(", ") || "none";
    const prompt =
      `JARVIS investigation "${label}" is ${row.status} in the knowledge base. ` +
      (row.matched.length
        ? `Matching KB articles: ${artNames}.`
        : "No knowledge articles currently document this investigation.") +
      " Provide a 2-sentence knowledge gap brief and recommended documentation action.";
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const brief = d?.response || d?.message || d?.content || "Assessment complete.";
      const voice = getActiveVoice?.() ?? "ash";
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: brief, voice }),
      });
    } catch {
      // ignore TTS errors
    }
    setAssessing(null);
  }

  if (!open) {
    const bareCount = bare.length;
    return (
      <button
        onClick={() => { setOpen(true); refresh(); }}
        title="Investigation × Knowledge Grounding (F65)"
        style={{
          position: "fixed", left: 17400, bottom: 8, zIndex: 73,
          background: "rgba(5,8,13,0.72)", border: `1px solid ${bareCount > 0 ? AMB : CY}55`,
          borderRadius: 6, padding: "3px 9px", cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 11, color: bareCount > 0 ? AMB : CY,
          letterSpacing: 1, backdropFilter: "blur(6px)",
        }}
      >
        ◈ INVKG{bareCount > 0 && <sup style={{ color: AMB, marginLeft: 2 }}>{bareCount}</sup>}
      </button>
    );
  }

  const statusColor = (s) =>
    s === "GROUNDED" ? GRN : s === "PARTIAL" ? AMB : RED;

  return (
    <div style={{
      position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
      background: "rgba(2,5,10,0.88)", zIndex: 9100, display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'JetBrains Mono',monospace",
    }}>
      <div style={{
        width: "min(820px,94vw)", maxHeight: "88vh", overflowY: "auto",
        background: "rgba(8,14,22,0.96)", border: `1px solid ${CY}44`,
        borderRadius: 14, padding: "20px 22px",
        boxShadow: `0 0 60px ${CY}18`,
      }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ color: CY, fontSize: 13, letterSpacing: 3, textShadow: `0 0 12px ${CY}` }}>
            ◈ INVESTIGATION × KNOWLEDGE GROUNDING
          </span>
          {loading && <span style={{ color: CY, fontSize: 10, marginLeft: "auto" }}>refreshing…</span>}
          <button onClick={() => setOpen(false)}
            style={{ marginLeft: loading ? 0 : "auto", background: "none", border: "none",
              cursor: "pointer", color: "#6E8AA0", fontSize: 16 }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          {[
            { label: "CASES",    val: rows.length,      col: CY  },
            { label: "GROUNDED", val: grounded.length,  col: GRN },
            { label: "PARTIAL",  val: partial.length,   col: AMB },
            { label: "BARE",     val: bare.length,      col: RED },
          ].map(({ label, val, col }) => (
            <div key={label} style={{
              flex: "1 1 120px", background: "rgba(41,231,255,0.05)",
              border: `1px solid ${col}33`, borderRadius: 8, padding: "8px 12px", textAlign: "center",
            }}>
              <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{val}</div>
              <div style={{ color: "#6E8AA0", fontSize: 10, letterSpacing: 1, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* filter + search */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {["ALL", "GROUNDED", "PARTIAL", "BARE"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                background: filter === f ? `${CY}22` : "none",
                border: `1px solid ${filter === f ? CY : "#6E8AA0"}55`,
                borderRadius: 5, padding: "3px 10px", cursor: "pointer",
                color: filter === f ? CY : "#6E8AA0", fontSize: 11,
              }}>{f}</button>
          ))}
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="search cases…"
            style={{
              marginLeft: "auto", background: "rgba(41,231,255,0.06)",
              border: `1px solid ${CY}33`, borderRadius: 5,
              padding: "3px 10px", color: CY, fontSize: 11,
              outline: "none", width: 160,
            }}
          />
        </div>

        {/* rows */}
        {visible.length === 0 && (
          <div style={{ color: "#6E8AA0", fontSize: 12, textAlign: "center", padding: 20 }}>
            {loading ? "Loading…" : "No investigations match current filter."}
          </div>
        )}
        {visible.map((row, i) => {
          const label  = invLabel(row.inv);
          const isExp  = expanded === i;
          const col    = statusColor(row.status);
          const busy   = assessing === label;
          return (
            <div key={i} style={{
              border: `1px solid ${col}33`, borderRadius: 8, marginBottom: 8,
              background: "rgba(8,14,22,0.6)",
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : i)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer" }}
              >
                <span style={{ color: col, fontSize: 10, letterSpacing: 1, minWidth: 90 }}>{row.status}</span>
                <span style={{ color: "#DCEBF5", fontSize: 12, flex: 1 }}>{label}</span>
                {row.inv?.status && (
                  <span style={{ color: "#6E8AA0", fontSize: 10 }}>{row.inv.status}</span>
                )}
                <span style={{ color: "#6E8AA0", fontSize: 10 }}>
                  {row.matched.length} article{row.matched.length !== 1 ? "s" : ""}
                </span>
                <span style={{ color: CY, fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "0 12px 12px" }}>
                  {row.matched.length === 0 ? (
                    <div style={{ color: RED, fontSize: 11, marginBottom: 8 }}>
                      No matching knowledge articles — this investigation is BARE.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      {row.matched.map((art, j) => (
                        <div key={j} style={{
                          background: "rgba(74,222,128,0.07)", border: `1px solid ${GRN}33`,
                          borderRadius: 6, padding: "5px 10px", fontSize: 11,
                        }}>
                          <div style={{ color: GRN }}>{art.title || art.name || "Article"}</div>
                          {art.category && (
                            <div style={{ color: "#6E8AA0", fontSize: 10, marginTop: 1 }}>{art.category}</div>
                          )}
                          {(art.summary || art.description) && (
                            <div style={{ color: "#6E8AA0", marginTop: 2, maxWidth: 260 }}>
                              {(art.summary || art.description).slice(0, 80)}
                              {(art.summary || art.description).length > 80 ? "…" : ""}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => assess(row)}
                    disabled={busy}
                    style={{
                      background: busy ? "rgba(41,231,255,0.05)" : `${CY}18`,
                      border: `1px solid ${CY}44`, borderRadius: 5,
                      padding: "4px 12px", cursor: busy ? "wait" : "pointer",
                      color: CY, fontSize: 11,
                    }}
                  >
                    {busy ? "assessing…" : "▶ ASSESS"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
