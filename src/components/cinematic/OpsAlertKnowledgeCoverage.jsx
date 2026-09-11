/**
 * OpsAlertKnowledgeCoverage — F702
 * "JARVIS, oalkno / alert knowledge / ops alert context /
 *  contextualized alerts / alert knowledge gap / knowledge alerts /
 *  alert context coverage"
 * Cross-references /v1/ops/alerts against /knowledge/ articles.
 * CONTEXTUALIZED alerts (≥1 article keyword-match) vs UNCONTEXTUALIZED (no KB backing).
 * Coverage % tile; ALL/CONTEXTUALIZED/UNCONTEXTUALIZED filter tabs + search;
 * click-to-expand matched articles with kind badge + hit count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 154_400;
const Z_INDEX  = 238;

const OALKNO_RE =
  /\boalkno\b|\balert.?knowledge\b|\bops.?alert.?context\b|\bcontextualized.?alerts?\b|\balert.?knowledge.?gap\b|\bknowledge.?alerts?\b|\balert.?context.?coverage\b/i;

export function isOalknoQuery(text) {
  return OALKNO_RE.test(text || "");
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

function normaliseAlerts(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.alerts)
    ? data.alerts
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((a, i) => ({
    id:       a.id       || `al-${i}`,
    title:    a.title    || a.name    || a.message || a.description || `Alert ${i + 1}`,
    severity: (a.severity || a.level  || a.priority || "INFO").toString().toUpperCase(),
    source:   a.source   || a.service || a.origin  || "",
    body:     a.body     || a.description || a.details || "",
  }));
}

function normaliseArticles(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.articles)
    ? data.articles
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((a, i) => ({
    id:      a.id      || `art-${i}`,
    title:   a.title   || a.name  || `Article ${i + 1}`,
    kind:    a.kind    || a.type  || a.category || "doc",
    summary: a.summary || a.body  || a.content  || "",
    tags:    Array.isArray(a.tags) ? a.tags.join(" ") : (a.tags || ""),
  }));
}

function crossRef(alerts, articles) {
  return alerts.map((alert) => {
    const haystack = `${alert.title} ${alert.body} ${alert.source}`;
    const matches = articles
      .map((art) => {
        const needle = `${art.title} ${art.summary} ${art.tags}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...art, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...alert, contextualized: matches.length > 0, articles: matches };
  });
}

export async function buildOalknoScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [alRes, artRes] = await Promise.all([
      fetch(`${base}/v1/ops/alerts`,       { headers: hdr }),
      fetch(`${base}/knowledge/articles`,   { headers: hdr }).catch(() =>
        fetch(`${base}/knowledge/`,          { headers: hdr })
      ),
    ]);
    const [alData, artData] = await Promise.all([alRes.json(), artRes.json()]);
    const alerts   = normaliseAlerts(alData);
    const articles = normaliseArticles(artData);
    const rows     = crossRef(alerts, articles);
    const ctx   = rows.filter((r) => r.contextualized).length;
    const unctx = rows.length - ctx;
    const pct   = rows.length ? Math.round((ctx / rows.length) * 100) : 0;
    if (!rows.length) return "No ops alerts found in the system, sir.";
    const topCtx = rows
      .filter((r) => r.contextualized)
      .slice(0, 2)
      .map((r) => `${r.title} → ${r.articles[0]?.title || "?"}`)
      .join("; ");
    const brief = `Ops Alert × Knowledge cross-reference: ${ctx} of ${rows.length} alerts have KB context (${pct}%) — ${unctx} uncontextualized. Top: ${topCtx || "none"}.`;
    const aiRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Ops alerts cross-referenced against ${articles.length} knowledge articles: ${ctx} contextualized / ${unctx} uncontextualized (coverage ${pct}%). Top matches: ${topCtx || "none"}. Provide a 2-sentence knowledge-coverage assessment for operational readiness.`,
      }),
    });
    const aiData = await aiRes.json();
    return aiData?.response || aiData?.message || brief;
  } catch (e) {
    return `Ops alert knowledge cross-reference error: ${e.message}`;
  }
}

function severityColor(sev) {
  if (!sev) return DIM;
  const s = sev.toUpperCase();
  if (s === "CRITICAL") return RED;
  if (s === "HIGH")     return "#FF6600";
  if (s === "WARNING")  return AMB;
  if (s === "INFO")     return CY;
  return GRN;
}

function kindColor(kind) {
  const k = (kind || "").toLowerCase();
  if (k.includes("threat") || k.includes("risk")) return RED;
  if (k.includes("intel"))  return CY;
  if (k.includes("ops"))    return AMB;
  if (k.includes("report")) return "#A070FF";
  return GRN;
}

export default function OpsAlertKnowledgeCoverage() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [brief, setBrief]         = useState("");
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [alRes, artRes] = await Promise.all([
        fetch(`${base}/v1/ops/alerts`,       { headers: hdr }),
        fetch(`${base}/knowledge/articles`,   { headers: hdr }).catch(() =>
          fetch(`${base}/knowledge/`,          { headers: hdr })
        ),
      ]);
      const [alData, artData] = await Promise.all([alRes.json(), artRes.json()]);
      const alerts   = normaliseAlerts(alData);
      const articles = normaliseArticles(artData);
      setRows(crossRef(alerts, articles));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:oalkno-toggle", handler);
    return () => window.removeEventListener("jarvis:oalkno-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const txt = await buildOalknoScript();
      setBrief(txt);
      const ttsRes = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: txt }),
      });
      if (ttsRes.ok) {
        const blob  = await ttsRes.blob();
        const url   = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
      }
    } catch (e) {
      setBrief(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  };

  const ctx   = rows.filter((r) => r.contextualized).length;
  const unctx = rows.length - ctx;
  const pct   = rows.length ? Math.round((ctx / rows.length) * 100) : 0;

  const visible = rows.filter((r) => {
    if (tab === "CONTEXTUALIZED"   && !r.contextualized) return false;
    if (tab === "UNCONTEXTUALIZED" &&  r.contextualized) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q) ||
        r.articles.some((a) => a.title.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const btnStyle = {
    position: "fixed",
    bottom: 8,
    left: BTN_LEFT,
    zIndex: Z_INDEX,
    background: unctx > 0 ? `${AMB}22` : "#0A1628CC",
    border: `1px solid ${unctx > 0 ? AMB : CY}66`,
    borderRadius: 6,
    color: unctx > 0 ? AMB : CY,
    padding: "3px 7px",
    cursor: "pointer",
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: "'JetBrains Mono',ui-monospace,monospace",
    userSelect: "none",
  };

  const panelStyle = {
    position: "fixed",
    bottom: 36,
    left: Math.min(BTN_LEFT, window.innerWidth - 420),
    width: 410,
    maxHeight: "70vh",
    overflowY: "auto",
    background: "#050D1AEE",
    border: `1px solid ${AMB}44`,
    borderRadius: 8,
    zIndex: Z_INDEX + 1,
    display: "flex",
    flexDirection: "column",
    padding: 12,
    fontFamily: "'JetBrains Mono',ui-monospace,monospace",
    fontSize: 10,
    color: "#DCEBF5",
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen((o) => !o)}>
        ◈ OALKNO
        {unctx > 0 && (
          <span style={{ marginLeft: 4, background: AMB, color: "#000", borderRadius: 3, padding: "0 4px" }}>
            {unctx}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 1 }}>◈ OPS ALERT × KNOWLEDGE</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 13 }}>✕</button>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[
              { label: "ALERTS",        val: rows.length, color: CY  },
              { label: "CONTEXTUALIZED", val: ctx,         color: GRN },
              { label: "UNCONTEXTUALIZED", val: unctx,    color: AMB },
              { label: "COVERAGE",      val: `${pct}%`,   color: CY  },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ flex: 1, background: `${color}11`, border: `1px solid ${color}33`, borderRadius: 5, padding: "4px 4px", textAlign: "center" }}>
                <div style={{ color, fontSize: 13, fontWeight: 700 }}>{val}</div>
                <div style={{ color: DIM, fontSize: 7 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
            {["ALL", "CONTEXTUALIZED", "UNCONTEXTUALIZED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  background: tab === t ? `${CY}22` : "transparent",
                  border: `1px solid ${tab === t ? CY : DIM}44`,
                  borderRadius: 4,
                  color: tab === t ? CY : DIM,
                  cursor: "pointer",
                  fontSize: 8,
                  padding: "3px 0",
                  letterSpacing: 0.5,
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search alerts or articles…"
            style={{
              background: "#0A1628",
              border: `1px solid ${CY}33`,
              borderRadius: 4,
              color: "#DCEBF5",
              fontSize: 9,
              padding: "4px 7px",
              marginBottom: 8,
              width: "100%",
              boxSizing: "border-box",
            }}
          />

          {loading && <div style={{ color: DIM, textAlign: "center", padding: 10 }}>loading…</div>}
          {err     && <div style={{ color: RED, marginBottom: 6 }}>⚠ {err}</div>}

          <div style={{ flex: 1, overflowY: "auto" }}>
            {visible.map((row) => (
              <div
                key={row.id}
                style={{
                  marginBottom: 4,
                  background: row.contextualized ? `${GRN}08` : `${AMB}08`,
                  border: `1px solid ${row.contextualized ? GRN : AMB}33`,
                  borderRadius: 5,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", cursor: "pointer" }}
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                >
                  <span style={{
                    fontSize: 8,
                    background: `${severityColor(row.severity)}22`,
                    border: `1px solid ${severityColor(row.severity)}55`,
                    color: severityColor(row.severity),
                    borderRadius: 3,
                    padding: "1px 4px",
                    minWidth: 44,
                    textAlign: "center",
                  }}>
                    {row.severity}
                  </span>
                  <span style={{ color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</span>
                  {row.contextualized ? (
                    <span style={{ color: GRN, fontSize: 8 }}>{row.articles.length} art</span>
                  ) : (
                    <span style={{ color: AMB, fontSize: 8 }}>no KB</span>
                  )}
                </div>
                {expanded === row.id && (
                  <div style={{ padding: "0 8px 8px 8px" }}>
                    {row.source && (
                      <div style={{ color: DIM, fontSize: 9, marginBottom: 4 }}>source: {row.source}</div>
                    )}
                    {row.articles.length > 0 ? (
                      row.articles.slice(0, 5).map((art) => (
                        <div
                          key={art.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "3px 0",
                            borderBottom: `1px solid ${DIM}22`,
                          }}
                        >
                          <span style={{
                            fontSize: 8,
                            background: `${kindColor(art.kind)}22`,
                            border: `1px solid ${kindColor(art.kind)}55`,
                            color: kindColor(art.kind),
                            borderRadius: 3,
                            padding: "1px 4px",
                          }}>
                            {art.kind}
                          </span>
                          <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{art.title}</span>
                          <span style={{ color: DIM, fontSize: 9 }}>hits: {art.hits}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No knowledge articles match this alert — context gap.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!loading && visible.length === 0 && (
              <div style={{ color: DIM, textAlign: "center", padding: 16 }}>No alerts match current filter.</div>
            )}
          </div>

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
