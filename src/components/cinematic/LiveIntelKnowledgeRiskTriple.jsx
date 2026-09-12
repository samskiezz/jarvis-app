/**
 * LiveIntelKnowledgeRiskTriple — F727
 * "JARVIS, lkrctx / live intel context / world context / intel knowledge risk /
 *  fully contextualized / live world triple / context monitor / intel triple"
 * Cross-references /functions/getLiveIntel × /knowledge/ × /entities/RiskSignal.
 * FULLY_CONTEXTUALIZED: live event ≥1 KB article AND ≥1 risk signal
 * INTEL_ONLY: ≥1 KB article, no risk signal
 * RISK_ONLY: ≥1 risk signal, no KB article
 * BLIND: no KB context, no risk signal
 * Coverage % tile; ALL/FULL/INTEL_ONLY/RISK_ONLY/BLIND filter tabs + search.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence triple-context brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const PRP = "#B06EFF";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 155_260;
const Z_INDEX  = 239;

const LKRCTX_RE =
  /\blkrctx\b|\blive.?intel.?context\b|\bworld.?context\b|\bintel.?knowledge.?risk\b|\bfully.?contextualiz\b|\blive.?world.?triple\b|\bcontext.?monitor\b|\bintel.?triple\b|\blive.?context\b|\bblind.?intel\b|\bworld.?triple.?context\b/i;

export function isLkrctxQuery(text) {
  return LKRCTX_RE.test(text || "");
}

function tokens(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(tokens(a));
  return tokens(b).filter((w) => sa.has(w)).length;
}

function normaliseEvents(data) {
  if (!data) return [];
  const events = [];
  if (Array.isArray(data?.quakes)) {
    data.quakes.forEach((q, i) => events.push({
      id: `quake-${i}`,
      kind: "SEISMIC",
      label: q.place || q.title || `M${q.mag} quake`,
      description: `magnitude ${q.mag ?? "?"} at ${q.place || "unknown location"}`,
    }));
  }
  if (Array.isArray(data?.crypto)) {
    data.crypto.forEach((c, i) => events.push({
      id: `crypto-${i}`,
      kind: "CRYPTO",
      label: c.symbol || c.name || `Crypto ${i + 1}`,
      description: `${c.symbol || c.name} ${c.change_pct != null ? `${c.change_pct > 0 ? "+" : ""}${Number(c.change_pct).toFixed(2)}%` : ""}`,
    }));
  }
  if (Array.isArray(data?.fx)) {
    data.fx.forEach((f, i) => events.push({
      id: `fx-${i}`,
      kind: "FX",
      label: f.pair || `FX ${i + 1}`,
      description: `${f.pair} rate ${f.rate ?? "?"}`,
    }));
  }
  return events;
}

function normaliseArticles(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.articles) ? data.articles
    : Array.isArray(data?.items) ? data.items
    : Array.isArray(data?.data) ? data.data
    : [];
  return arr.map((a, i) => ({
    id: a.id || a.doc_id || `art-${i}`,
    title: a.title || a.name || `Article ${i + 1}`,
    summary: a.summary || a.description || a.body || "",
    kind: a.kind || a.type || "article",
  }));
}

function normaliseSignals(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.signals) ? data.signals
    : Array.isArray(data?.items) ? data.items
    : Array.isArray(data?.data) ? data.data
    : [];
  return arr.map((s, i) => ({
    id: s.id || `sig-${i}`,
    title: s.title || s.name || s.summary || `Signal ${i + 1}`,
    severity: (s.severity || s.level || "MEDIUM").toString().toUpperCase(),
    source: s.source || s.origin || "",
    summary: s.summary || s.description || "",
  }));
}

function classifyEvent(evt, articles, signals) {
  const haystack = `${evt.label} ${evt.description}`;
  const matchedArticles = articles.filter((a) =>
    overlap(haystack, `${a.title} ${a.summary}`) > 0
  );
  const matchedSignals = signals.filter((s) =>
    overlap(haystack, `${s.title} ${s.summary} ${s.source}`) > 0
  );
  const hasKno = matchedArticles.length > 0;
  const hasRsk = matchedSignals.length > 0;
  let tier;
  if (hasKno && hasRsk) tier = "FULL";
  else if (hasKno)      tier = "INTEL_ONLY";
  else if (hasRsk)      tier = "RISK_ONLY";
  else                  tier = "BLIND";
  return { ...evt, tier, matchedArticles, matchedSignals };
}

export async function buildLkrctxScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [liRes, knoRes, rskRes] = await Promise.all([
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      fetch(`${base}/knowledge/articles?limit=200`, { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
    ]);
    const [liData, knoData, rskData] = await Promise.all([
      liRes.json(), knoRes.json(), rskRes.json(),
    ]);
    const events = normaliseEvents(liData);
    const articles = normaliseArticles(knoData);
    const signals = normaliseSignals(rskData);
    const enriched = events.map((e) => classifyEvent(e, articles, signals));
    const full      = enriched.filter((e) => e.tier === "FULL").length;
    const intelOnly = enriched.filter((e) => e.tier === "INTEL_ONLY").length;
    const riskOnly  = enriched.filter((e) => e.tier === "RISK_ONLY").length;
    const blind     = enriched.filter((e) => e.tier === "BLIND").length;
    const pct = events.length
      ? Math.round(((full + intelOnly + riskOnly) / events.length) * 100)
      : 0;
    const topBlind = enriched
      .filter((e) => e.tier === "BLIND")
      .slice(0, 2)
      .map((e) => e.label)
      .join(", ");
    const summary =
      `Live intel triple-context scan: ${events.length} world events — ` +
      `${full} FULL (KB+risk), ${intelOnly} INTEL_ONLY, ${riskOnly} RISK_ONLY, ${blind} BLIND (no context). ` +
      `Coverage ${pct}%. Top uncontextualized: ${topBlind || "none"}.`;
    const aiRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `World-events triple-context check: ${full} events fully contextualized (KB+risk), ` +
          `${blind} blind (no backing). ` +
          `${articles.length} KB articles, ${signals.length} risk signals indexed. ` +
          `Provide a 2-sentence JARVIS operational awareness brief.`,
      }),
    });
    const aiData = await aiRes.json();
    return aiData?.response || aiData?.message || summary;
  } catch (e) {
    return `Live intel triple-context error: ${e.message}`;
  }
}

function tierColor(tier) {
  if (tier === "FULL")       return GRN;
  if (tier === "INTEL_ONLY") return CY;
  if (tier === "RISK_ONLY")  return AMB;
  return RED;
}

function kindColor(kind) {
  if (kind === "SEISMIC") return "#FF6B35";
  if (kind === "CRYPTO")  return "#F5D020";
  if (kind === "FX")      return CY;
  return DIM;
}

function sevColor(sev) {
  if (!sev) return DIM;
  const s = sev.toUpperCase();
  if (s === "CRITICAL") return RED;
  if (s === "HIGH")     return "#FF6B35";
  if (s === "MEDIUM")   return AMB;
  return GRN;
}

export default function LiveIntelKnowledgeRiskTriple() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief]     = useState("");
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [liRes, knoRes, rskRes] = await Promise.all([
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
        fetch(`${base}/knowledge/articles?limit=200`, { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
      ]);
      const [liData, knoData, rskData] = await Promise.all([
        liRes.json(), knoRes.json(), rskRes.json(),
      ]);
      const events   = normaliseEvents(liData);
      const articles = normaliseArticles(knoData);
      const signals  = normaliseSignals(rskData);
      setRows(events.map((e) => classifyEvent(e, articles, signals)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:lkrctx-toggle", handler);
    return () => window.removeEventListener("jarvis:lkrctx-toggle", handler);
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
      const txt = await buildLkrctxScript();
      setBrief(txt);
      const ttsRes = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: txt }),
      });
      if (ttsRes.ok) {
        const blob = await ttsRes.blob();
        new Audio(URL.createObjectURL(blob)).play().catch(() => {});
      }
    } catch (e) {
      setBrief(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  };

  const full      = rows.filter((r) => r.tier === "FULL").length;
  const intelOnly = rows.filter((r) => r.tier === "INTEL_ONLY").length;
  const riskOnly  = rows.filter((r) => r.tier === "RISK_ONLY").length;
  const blind     = rows.filter((r) => r.tier === "BLIND").length;
  const pct = rows.length ? Math.round(((full + intelOnly + riskOnly) / rows.length) * 100) : 0;

  const TABS = ["ALL", "FULL", "INTEL_ONLY", "RISK_ONLY", "BLIND"];

  const visible = rows.filter((r) => {
    if (tab !== "ALL" && r.tier !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.label.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.matchedArticles.some((a) => a.title.toLowerCase().includes(q)) ||
        r.matchedSignals.some((s) => s.title.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const btnStyle = {
    position: "fixed",
    bottom: 8,
    left: BTN_LEFT,
    zIndex: Z_INDEX,
    background: blind > 0 ? `${RED}22` : `${GRN}22`,
    border: `1px solid ${blind > 0 ? RED : GRN}66`,
    borderRadius: 6,
    color: blind > 0 ? RED : GRN,
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
    left: Math.min(BTN_LEFT, (typeof window !== "undefined" ? window.innerWidth : 1920) - 420),
    width: 420,
    maxHeight: "72vh",
    overflowY: "auto",
    background: "#050D1AEE",
    border: `1px solid ${CY}44`,
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
        ◈ LKRCTX
        {blind > 0 && (
          <span style={{ marginLeft: 4, background: RED, color: "#fff", borderRadius: 3, padding: "0 4px" }}>
            {blind}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 1 }}>◈ LIVE INTEL × KB × RISK TRIPLE</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 13 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[
              { label: "EVENTS",     val: rows.length, color: CY  },
              { label: "FULL",       val: full,        color: GRN },
              { label: "INTEL_ONLY", val: intelOnly,   color: CY  },
              { label: "RISK_ONLY",  val: riskOnly,    color: AMB },
              { label: "BLIND",      val: blind,       color: RED },
              { label: "COVERAGE",   val: `${pct}%`,   color: PRP },
            ].map(({ label, val, color }) => (
              <div
                key={label}
                style={{
                  flex: 1, background: `${color}11`,
                  border: `1px solid ${color}33`, borderRadius: 5,
                  padding: "4px 6px", textAlign: "center",
                }}
              >
                <div style={{ color, fontSize: 12, fontWeight: 700 }}>{val}</div>
                <div style={{ color: DIM, fontSize: 7 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 3, marginBottom: 6, flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: "1 1 auto",
                  background: tab === t ? `${CY}22` : "transparent",
                  border: `1px solid ${tab === t ? CY : DIM}44`,
                  borderRadius: 4,
                  color: tab === t ? CY : DIM,
                  cursor: "pointer",
                  fontSize: 8,
                  padding: "3px 2px",
                  letterSpacing: 0.4,
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search events, articles, signals…"
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

          {/* rows */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {visible.map((row) => (
              <div
                key={row.id}
                style={{
                  marginBottom: 4,
                  background: row.tier === "BLIND" ? `${RED}08` : `${tierColor(row.tier)}08`,
                  border: `1px solid ${tierColor(row.tier)}33`,
                  borderRadius: 5,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 8px", cursor: "pointer",
                  }}
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                >
                  {/* kind badge */}
                  <span style={{
                    fontSize: 7, background: `${kindColor(row.kind)}22`,
                    border: `1px solid ${kindColor(row.kind)}55`,
                    color: kindColor(row.kind), borderRadius: 3,
                    padding: "1px 4px", minWidth: 44, textAlign: "center",
                  }}>
                    {row.kind}
                  </span>
                  {/* tier badge */}
                  <span style={{
                    fontSize: 7, background: `${tierColor(row.tier)}22`,
                    border: `1px solid ${tierColor(row.tier)}55`,
                    color: tierColor(row.tier), borderRadius: 3,
                    padding: "1px 4px", minWidth: 60, textAlign: "center",
                  }}>
                    {row.tier}
                  </span>
                  <span style={{
                    color: "#DCEBF5", flex: 1, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap",
                    fontSize: 10,
                  }}>
                    {row.label}
                  </span>
                  <span style={{ color: DIM, fontSize: 8 }}>
                    {row.matchedArticles.length}KB {row.matchedSignals.length}RSK
                  </span>
                </div>
                {expanded === row.id && (
                  <div style={{ padding: "0 8px 8px 8px" }}>
                    <div style={{ color: DIM, fontSize: 9, marginBottom: 4 }}>{row.description}</div>
                    {row.matchedArticles.length > 0 && (
                      <>
                        <div style={{ color: CY, fontSize: 8, marginBottom: 3, letterSpacing: 1 }}>KB ARTICLES</div>
                        {row.matchedArticles.slice(0, 3).map((a) => (
                          <div key={a.id} style={{
                            padding: "2px 0", borderBottom: `1px solid ${DIM}22`,
                            color: "#DCEBF5", fontSize: 9,
                          }}>
                            <span style={{
                              fontSize: 7, background: `${CY}22`, color: CY,
                              borderRadius: 3, padding: "0 4px", marginRight: 5,
                            }}>{a.kind}</span>
                            {a.title}
                          </div>
                        ))}
                      </>
                    )}
                    {row.matchedSignals.length > 0 && (
                      <>
                        <div style={{ color: AMB, fontSize: 8, marginTop: 5, marginBottom: 3, letterSpacing: 1 }}>RISK SIGNALS</div>
                        {row.matchedSignals.slice(0, 3).map((s) => (
                          <div key={s.id} style={{
                            display: "flex", alignItems: "center", gap: 5,
                            padding: "2px 0", borderBottom: `1px solid ${DIM}22`,
                          }}>
                            <span style={{
                              fontSize: 7, background: `${sevColor(s.severity)}22`,
                              color: sevColor(s.severity), borderRadius: 3, padding: "0 4px",
                            }}>{s.severity}</span>
                            <span style={{ color: "#DCEBF5", fontSize: 9, flex: 1 }}>{s.title}</span>
                          </div>
                        ))}
                      </>
                    )}
                    {row.tier === "BLIND" && (
                      <div style={{ color: RED, fontSize: 9, marginTop: 4 }}>
                        ⚠ No knowledge base or risk signal backing — BLIND SPOT.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!loading && visible.length === 0 && (
              <div style={{ color: DIM, textAlign: "center", padding: 16 }}>
                No events match current filter.
              </div>
            )}
          </div>

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${CY}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: `${CY}18`,
                border: `1px solid ${CY}55`,
                borderRadius: 5,
                color: CY,
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
              <div style={{
                marginTop: 8, color: "#DCEBF5", fontSize: 10,
                lineHeight: 1.5, borderLeft: `2px solid ${CY}`, paddingLeft: 8,
              }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
