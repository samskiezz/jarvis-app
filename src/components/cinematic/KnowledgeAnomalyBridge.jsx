/**
 * F106 — Knowledge × Anomaly Intelligence Bridge (KAIB)
 *
 * Parallel-fetches /knowledge/ + /v1/jarvis/analytics/anomalies every 60 s.
 * Keyword-correlates each KB article (title/summary/content/tags/topic)
 * against active metric anomalies (metric/description) to classify:
 *   ALARMED   — at least one active anomaly is linked to this KB article
 *   STABLE    — no anomaly correlation found
 *
 * Amber badge on ALARMED count so the operator sees at a glance which
 * KB areas are currently under metric stress.
 *
 * Voice intents: "knowledge anomaly / anomaly knowledge / kaib /
 *                kb anomaly / anomaly kb / alarmed knowledge /
 *                knowledge metric / knowledge alert anomaly"
 * Strip button: ◈ KAIB  left:3540 bottom:18 zIndex:68
 * Custom event: jarvis:kaib-toggle
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const RED = "#FF4466";
const DIM = "#5A7A9A";
const POLL = 60_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const hdrs = { Authorization: `Bearer ${API_KEY}` };

const KAIB_RE =
  /\b(knowledge[._\s]?anomaly|anomaly[._\s]?knowledge|kaib|kb[._\s]?anomaly|anomaly[._\s]?kb|alarmed[._\s]?knowledge|knowledge[._\s]?metric|knowledge[._\s]?alert[._\s]?anomaly)\b/i;

export function isKaibQuery(t) { return KAIB_RE.test(t || ""); }

function tokenize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevance(article, anomaly) {
  const a = tokenize([
    article.title, article.summary, article.content,
    (article.tags || []).join(" "), article.topic || "",
  ].join(" "));
  const b = tokenize([
    anomaly.metric || anomaly.metric_name || "",
    anomaly.description || anomaly.label || "",
  ].join(" "));
  const setB = new Set(b);
  const hits = a.filter(w => setB.has(w)).length;
  if (!hits) return 0;
  return Math.round((hits / Math.max(a.length, 1)) * 100);
}

function severityColor(severity) {
  if (!severity) return DIM;
  const s = String(severity).toUpperCase();
  if (s === "HIGH") return RED;
  if (s === "MEDIUM") return AMB;
  return DIM;
}

export async function buildKaibScript() {
  try {
    const base = apiBase();
    const [kr, ar] = await Promise.all([
      fetch(`${base}/knowledge/`, { headers: hdrs }),
      fetch(`${base}/v1/jarvis/analytics/anomalies`, { headers: hdrs }),
    ]);
    const [kd, ad] = await Promise.all([kr.json(), ar.json()]);
    const articles = Array.isArray(kd) ? kd : kd.articles || kd.results || kd.items || [];
    const anomalies = Array.isArray(ad) ? ad : ad.anomalies || ad.results || [];
    const alarmed = articles.filter(a => anomalies.some(an => relevance(a, an) > 0)).length;
    const stable = articles.length - alarmed;
    return `Knowledge × Anomaly Bridge: ${articles.length} KB articles cross-referenced against ${anomalies.length} active metric anomalies. ${alarmed} articles are ALARMED (correlated with live anomalies), ${stable} are STABLE (no anomaly link). ${alarmed > 0 ? `Recommend reviewing the ${alarmed} alarmed knowledge areas for operational relevance to current metric deviations.` : "No KB articles currently linked to active anomalies — knowledge base appears stable."}`;
  } catch {
    return "Knowledge and anomaly data temporarily unavailable.";
  }
}

const BTN = {
  position: "fixed", left: 3540, bottom: 18, zIndex: 68,
  background: "rgba(0,20,40,0.82)", border: `1px solid ${CY}44`,
  color: CY, fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
  letterSpacing: 1.4, padding: "4px 8px", cursor: "pointer",
  borderRadius: 3, userSelect: "none",
};
const PANEL = {
  position: "fixed", bottom: 52, left: 3430, width: 420,
  background: "rgba(0,10,24,0.97)", border: `1px solid ${CY}55`,
  borderRadius: 6, zIndex: 200, fontFamily: "'JetBrains Mono',monospace",
  color: CY, fontSize: 10, padding: 14, maxHeight: 520, overflowY: "auto",
};
const ROW_ST = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "4px 0", borderBottom: `1px solid ${CY}18`, cursor: "pointer",
};
const BADGE = (c) => ({
  fontSize: 8, letterSpacing: 1, padding: "1px 5px",
  borderRadius: 2, background: c + "22", border: `1px solid ${c}55`, color: c,
});

export default function KnowledgeAnomalyBridge() {
  const [open, setOpen] = useState(false);
  const [articles, setArticles] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const [kr, ar] = await Promise.all([
        fetch(`${base}/knowledge/`, { headers: hdrs }),
        fetch(`${base}/v1/jarvis/analytics/anomalies`, { headers: hdrs }),
      ]);
      const [kd, ad] = await Promise.all([kr.json(), ar.json()]);
      const rawArticles = Array.isArray(kd) ? kd : kd.articles || kd.results || kd.items || [];
      const rawAnomalies = Array.isArray(ad) ? ad : ad.anomalies || ad.results || [];
      setArticles(rawArticles.map(a => ({
        ...a,
        matches: rawAnomalies
          .map(an => ({ ...an, score: relevance(a, an) }))
          .filter(an => an.score > 0)
          .sort((x, y) => y.score - x.score),
      })));
      setAnomalies(rawAnomalies);
    } catch {}
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.query && !isKaibQuery(e.detail.query)) return;
      setOpen(v => !v);
    };
    window.addEventListener("jarvis:kaib-toggle", handler);
    return () => window.removeEventListener("jarvis:kaib-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const classified = articles.map(a => ({ ...a, status: a.matches?.length > 0 ? "ALARMED" : "STABLE" }));
  const filtered = classified
    .filter(a => tab === "ALL" || a.status === tab)
    .filter(a => !search || [a.title, a.topic, (a.tags || []).join(" ")].join(" ").toLowerCase().includes(search.toLowerCase()));

  const alarmed = classified.filter(a => a.status === "ALARMED").length;
  const stable = classified.filter(a => a.status === "STABLE").length;

  const assess = async () => {
    setAssessing(true); setAssessment("");
    const script = await buildKaibScript();
    setAssessment(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  };

  if (!open) {
    return (
      <button style={BTN} onClick={() => setOpen(true)} title="Knowledge × Anomaly Intelligence Bridge">
        ◈ KAIB{alarmed > 0 && <span style={{ marginLeft: 4, color: AMB }}>▲{alarmed}</span>}
      </button>
    );
  }

  return (
    <>
      <button style={{ ...BTN, borderColor: CY }} onClick={() => setOpen(false)}>◈ KAIB ✕</button>
      <div style={PANEL}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ color: CY, letterSpacing: 2, fontSize: 9 }}>KNOWLEDGE × ANOMALY BRIDGE</span>
          <button onClick={assess} disabled={assessing}
            style={{ fontSize: 8, color: GRN, background: "none", border: `1px solid ${GRN}44`, borderRadius: 2, padding: "1px 6px", cursor: "pointer" }}>
            {assessing ? "…" : "▶ ASSESS"}
          </button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, marginBottom: 8 }}>
          {[
            ["ARTICLES", articles.length, CY],
            ["ANOMALIES", anomalies.length, CY],
            ["ALARMED", alarmed, AMB],
            ["STABLE", stable, GRN],
          ].map(([label, val, c]) => (
            <div key={label} style={{ background: "#0a1628", borderRadius: 3, padding: "4px 6px", textAlign: "center" }}>
              <div style={{ color: c, fontSize: 13, fontWeight: 700 }}>{val}</div>
              <div style={{ color: DIM, fontSize: 7, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
          {["ALL", "ALARMED", "STABLE"].map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ fontSize: 8, padding: "2px 7px", borderRadius: 2, cursor: "pointer",
                background: tab === t ? CY + "22" : "none",
                color: tab === t ? CY : DIM,
                border: `1px solid ${tab === t ? CY + "55" : DIM + "33"}` }}>
              {t}
            </button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search articles…"
            style={{ marginLeft: "auto", fontSize: 8, background: "#0a1628", border: `1px solid ${CY}33`,
              borderRadius: 2, color: CY, padding: "2px 6px", width: 110, outline: "none" }} />
        </div>

        {/* Article rows */}
        {filtered.length === 0 && (
          <div style={{ color: DIM, fontSize: 9, textAlign: "center", padding: 12 }}>No data yet — fetching…</div>
        )}
        {filtered.map((a, i) => {
          const isExp = expanded === i;
          const sc = a.status === "ALARMED" ? AMB : GRN;
          return (
            <div key={a.id || a.title || i}>
              <div style={ROW_ST} onClick={() => setExpanded(isExp ? null : i)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: CY, fontSize: 9 }}>{a.title || a.id}</span>
                  {a.topic && <span style={{ color: DIM, fontSize: 8, marginLeft: 4 }}>{a.topic}</span>}
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={BADGE(sc)}>{a.status}</span>
                  <span style={{ color: DIM, fontSize: 8 }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>
              {isExp && (
                <div style={{ background: "#060f1e", borderRadius: 3, padding: "6px 8px", marginBottom: 4 }}>
                  {a.matches?.length > 0 ? (
                    a.matches.slice(0, 8).map((an, j) => (
                      <div key={j} style={{ marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ color: CY, fontSize: 8 }}>
                            {an.metric || an.metric_name || an.label || an.id || "anomaly"}
                          </span>
                          <div style={{ display: "flex", gap: 4 }}>
                            {an.severity && (
                              <span style={BADGE(severityColor(an.severity))}>{an.severity}</span>
                            )}
                            {an.zscore !== undefined && (
                              <span style={{ color: AMB, fontSize: 8 }}>|z|={Math.abs(an.zscore).toFixed(1)}</span>
                            )}
                            <span style={{ color: GRN, fontSize: 8 }}>{an.score}%</span>
                          </div>
                        </div>
                        <div style={{ height: 3, background: CY + "18", borderRadius: 2 }}>
                          <div style={{ height: "100%", width: `${an.score}%`, background: AMB, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: GRN, fontSize: 8 }}>No active anomalies correlated with this KB article.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {assessment && (
          <div style={{ marginTop: 8, background: "#0a1628", borderRadius: 3, padding: 8, color: GRN, fontSize: 8, lineHeight: 1.5 }}>
            {assessment}
          </div>
        )}
      </div>
    </>
  );
}
