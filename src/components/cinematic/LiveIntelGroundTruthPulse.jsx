/**
 * F88 — Live Intel × Knowledge × Risk Signal Ground Truth Pulse (LKRPULSE)
 *
 * Data sources (confirmed-real endpoints):
 *   GET /functions/getLiveIntel
 *       → { earthquakes:[...], crypto:[...], fx:[...] }
 *   GET /knowledge/
 *       → { items:[{id,title,content,tags,...}] }
 *   GET /entities/RiskSignal
 *       → [ {id,title,description,severity,tags,...} ]
 *   POST /v1/jarvis/agent/chat  { message }  → { answer }
 *   POST /v1/voice/tts           { text }    → audio
 *
 * Logic:
 *   Parallel-fetches live world events (quakes/crypto/fx), knowledge articles,
 *   and risk signals; keyword-correlates each intel event against KB articles
 *   AND risk signals to classify:
 *     CONFIRMED   — backed by ≥1 KB article + ≥1 risk signal
 *     MONITORED   — risk signal match only
 *     DOCUMENTED  — KB article match only
 *     UNTRACKED   — neither (raw intel gap)
 *
 * Button: ◈ LKRPULSE  left:992200, bottom:8, zIndex:150
 * Badge:  amber = UNTRACKED count when > 0
 * Refresh: 5-min auto-poll (live intel changes)
 * Voice:  "lkrpulse / live intel ground truth / live event coverage /
 *          intel classification / world event status / ground truth pulse"
 * Event:  jarvis:lkrpulse-toggle
 *
 * Exported for JarvisBrain:
 *   isLkrpulseQuery(q) / buildLkrpulseScript()
 */
import { useEffect, useRef, useState } from "react";

const BTN_LEFT  = 992200;
const REFRESH_MS = 300_000; // 5 min
const Z         = 150;
const CY        = "#00e5ff";
const AM        = "#ffaa00";

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof window !== "undefined" && window.__JARVIS_API_BASE__) return window.__JARVIS_API_BASE__;
  if (typeof import.meta !== "undefined") {
    if (import.meta.env?.VITE_API_BASE) return import.meta.env.VITE_API_BASE;
    if (import.meta.env?.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
  }
  return "";
}

// ─── exported intent helpers ──────────────────────────────────────────────────
const LKRPULSE_RE =
  /\b(lkrpulse|live\s+intel\s+ground\s+truth|live\s+event\s+coverage|intel\s+classif(?:ication|y)|world\s+event\s+status|ground\s+truth\s+pulse|live\s+world\s+pulse|intel\s+pulse|intel\s+ground\s+truth|live\s+intel\s+pulse)\b/i;

export function isLkrpulseQuery(q) {
  return LKRPULSE_RE.test(q || "");
}

export async function buildLkrpulseScript() {
  try {
    const base = apiBase();
    const hdr = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
    const [intelRes, kbRes, rskRes] = await Promise.allSettled([
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/knowledge/`, { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }).then((r) => r.json()),
    ]);
    const events    = normaliseLiveIntel(intelRes.status  === "fulfilled" ? intelRes.value  : {});
    const articles  = normaliseKb(kbRes.status           === "fulfilled" ? kbRes.value     : []);
    const risks     = normaliseRisks(rskRes.status        === "fulfilled" ? rskRes.value    : []);
    const rows      = buildRows(events, articles, risks);
    const confirmed   = rows.filter((r) => r.cls === "CONFIRMED").length;
    const monitored   = rows.filter((r) => r.cls === "MONITORED").length;
    const documented  = rows.filter((r) => r.cls === "DOCUMENTED").length;
    const untracked   = rows.filter((r) => r.cls === "UNTRACKED").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: hdr,
      body: JSON.stringify({
        message:
          `JARVIS live intel ground truth analysis: ${events.length} live world events (earthquakes, crypto, FX) ` +
          `cross-referenced against ${articles.length} knowledge base articles and ${risks.length} active risk signals. ` +
          `Classification: CONFIRMED ${confirmed} (KB + risk), MONITORED ${monitored} (risk only), ` +
          `DOCUMENTED ${documented} (KB only), UNTRACKED ${untracked} (no coverage). ` +
          `Give a 2-sentence intelligence grounding summary — formal British butler tone.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Live intel ground truth pulse complete, sir.").trim();
  } catch (e) {
    return `Live intel ground truth pulse unavailable: ${e.message}`;
  }
}

// ─── normalise helpers ────────────────────────────────────────────────────────
function normaliseLiveIntel(raw) {
  const quakes = (Array.isArray(raw?.earthquakes) ? raw.earthquakes : []).map((q, i) => ({
    id: `q-${i}`,
    type: "QUAKE",
    title: q.place || q.location || q.title || `Quake ${i + 1}`,
    detail: `M${parseFloat(q.magnitude || q.mag || 0).toFixed(1)}`,
    text: `${q.place || q.location || ""} magnitude ${q.magnitude || q.mag || 0}`,
  }));
  const crypto = (Array.isArray(raw?.crypto) ? raw.crypto : []).map((c, i) => ({
    id: `c-${i}`,
    type: "CRYPTO",
    title: c.symbol || c.name || `Crypto ${i + 1}`,
    detail: `${c.change_pct != null ? (c.change_pct > 0 ? "+" : "") + parseFloat(c.change_pct).toFixed(2) + "%" : ""}`,
    text: `${c.symbol || c.name || ""} ${c.price || ""} ${c.change_pct || ""}`,
  }));
  const fx = (Array.isArray(raw?.fx) ? raw.fx : []).map((f, i) => ({
    id: `f-${i}`,
    type: "FX",
    title: f.pair || f.name || `FX ${i + 1}`,
    detail: `${f.change_pct != null ? (f.change_pct > 0 ? "+" : "") + parseFloat(f.change_pct).toFixed(2) + "%" : ""}`,
    text: `${f.pair || f.name || ""} ${f.rate || ""} ${f.change_pct || ""}`,
  }));
  return [...quakes, ...crypto, ...fx].slice(0, 150);
}

function normaliseKb(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.articles) ? raw.articles
    : Array.isArray(raw?.results) ? raw.results
    : [];
  return arr.map((a) => ({
    id: a.id || a.article_id || a._id || String(Math.random()),
    title: a.title || a.name || a.subject || "Untitled Article",
    content: `${a.title || ""} ${a.content || a.body || a.summary || a.description || ""} ${(Array.isArray(a.tags) ? a.tags : []).join(" ")}`.toLowerCase(),
  }));
}

function normaliseRisks(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.data) ? raw.data
    : Array.isArray(raw?.risk_signals) ? raw.risk_signals
    : Array.isArray(raw?.results) ? raw.results
    : [];
  return arr.map((s) => ({
    id: s.id || s.signal_id || s._id || String(Math.random()),
    title: s.title || s.name || s.label || "Untitled Signal",
    severity: (s.severity || s.level || "medium").toLowerCase(),
    content: `${s.title || ""} ${s.description || s.details || s.summary || ""} ${(Array.isArray(s.tags) ? s.tags : []).join(" ")}`.toLowerCase(),
  }));
}

function kw(txt) {
  return (txt || "").toLowerCase().match(/[a-z]{4,}/g) || [];
}

function matches(eventKw, itemContent) {
  const itemKw = new Set(kw(itemContent));
  return eventKw.filter((w) => w.length > 3 && itemKw.has(w)).length;
}

function buildRows(events, articles, risks) {
  return events.map((evt) => {
    const evKw = kw(evt.text);
    const matchedKb = articles
      .map((a) => ({ ...a, score: matches(evKw, a.content) }))
      .filter((a) => a.score > 0)
      .sort((a, b) => b.score - a.score);
    const matchedRisk = risks
      .map((r) => ({ ...r, score: matches(evKw, r.content) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);

    const hasKb   = matchedKb.length > 0;
    const hasRisk = matchedRisk.length > 0;
    const cls = hasKb && hasRisk ? "CONFIRMED"
      : hasRisk                  ? "MONITORED"
      : hasKb                    ? "DOCUMENTED"
      :                            "UNTRACKED";

    return { evt, matchedKb, matchedRisk, cls };
  });
}

// ─── classification metadata ──────────────────────────────────────────────────
const CLASS_META = {
  CONFIRMED:  { label: "CONFIRMED",   color: "#00ff88", desc: "KB article + risk signal" },
  MONITORED:  { label: "MONITORED",   color: "#ff6b6b", desc: "risk signal match only" },
  DOCUMENTED: { label: "DOCUMENTED",  color: "#00bfff", desc: "KB article match only" },
  UNTRACKED:  { label: "UNTRACKED",   color: AM,        desc: "no coverage" },
};

const TYPE_COLOR = { QUAKE: "#ff6b6b", CRYPTO: "#a78bfa", FX: "#22d3ee" };
const SEV_COLOR  = { critical: "#ff3333", high: "#ff6b6b", medium: AM, low: "#88bbcc" };
const TABS       = ["ALL", "CONFIRMED", "MONITORED", "DOCUMENTED", "UNTRACKED"];

const panelStyle = {
  position: "fixed", right: 24, bottom: 60, zIndex: Z,
  width: 440, maxHeight: "74vh", overflowY: "auto",
  background: "rgba(4,8,18,0.97)", border: `1px solid ${CY}33`,
  borderRadius: 12, padding: "14px 14px 10px",
  boxShadow: `0 0 32px ${CY}22`,
  fontFamily: "'JetBrains Mono',monospace",
  color: "#DCEBF5",
};

function tileStyle(color) {
  return {
    flex: "1 1 70px", background: `${color}11`, border: `1px solid ${color}33`,
    borderRadius: 6, padding: "5px 6px", textAlign: "center", minWidth: 55,
  };
}

// ─── component ────────────────────────────────────────────────────────────────
export default function LiveIntelGroundTruthPulse() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [events, setEvents]     = useState([]);
  const [articles, setArticles] = useState([]);
  const [risks, setRisks]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState("");
  const timerRef = useRef(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const base = apiBase();
      const hdr = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const [intelRes, kbRes, rskRes] = await Promise.allSettled([
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/knowledge/`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }).then((r) => r.json()),
      ]);
      const evts = normaliseLiveIntel(intelRes.status === "fulfilled" ? intelRes.value : {});
      const arts = normaliseKb(kbRes.status           === "fulfilled" ? kbRes.value   : []);
      const rsks = normaliseRisks(rskRes.status       === "fulfilled" ? rskRes.value  : []);
      setEvents(evts); setArticles(arts); setRisks(rsks);
      setRows(buildRows(evts, arts, rsks));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:lkrpulse-toggle", onToggle);
    return () => window.removeEventListener("jarvis:lkrpulse-toggle", onToggle);
  }, []);

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const script = await buildLkrpulseScript();
      setBrief(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch (e) {
      setBrief(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }

  const counts = {
    CONFIRMED:  rows.filter((r) => r.cls === "CONFIRMED").length,
    MONITORED:  rows.filter((r) => r.cls === "MONITORED").length,
    DOCUMENTED: rows.filter((r) => r.cls === "DOCUMENTED").length,
    UNTRACKED:  rows.filter((r) => r.cls === "UNTRACKED").length,
  };

  const coverage = rows.length
    ? Math.round(((rows.length - counts.UNTRACKED) / rows.length) * 100)
    : 0;

  const q = search.toLowerCase();
  const visible = rows.filter((r) => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (q && !r.evt.title.toLowerCase().includes(q) && !r.evt.text.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Live Intel × Knowledge × Risk Signal Ground Truth Pulse (LKRPULSE)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z,
          background: open ? CY : "rgba(4,8,14,0.85)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}`, borderRadius: 6,
          padding: "3px 9px", fontSize: 11, letterSpacing: 2,
          cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          boxShadow: `0 0 14px ${CY}${open ? "" : "44"}`,
        }}
      >
        ◈ LKRPULSE{counts.UNTRACKED > 0 && (
          <span style={{
            marginLeft: 6, background: AM, color: "#04060A",
            borderRadius: 4, padding: "0 5px", fontSize: 10, fontWeight: 700,
          }}>{counts.UNTRACKED}</span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ color: CY, letterSpacing: 3, fontSize: 12, fontWeight: 700 }}>◈ LKRPULSE</span>
            <span style={{ fontSize: 10, color: "#6E8AA0" }}>Live Intel × KB × Risk — Ground Truth Pulse</span>
            <button onClick={() => setOpen(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16 }}>×</button>
          </div>

          {/* Source stat tiles */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <div style={tileStyle("#ff6b6b")}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#ff6b6b" }}>{events.length}</div>
              <div style={{ fontSize: 9, color: "#6E8AA0" }}>LIVE EVENTS</div>
            </div>
            <div style={tileStyle("#00bfff")}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#00bfff" }}>{articles.length}</div>
              <div style={{ fontSize: 9, color: "#6E8AA0" }}>KB ARTICLES</div>
            </div>
            <div style={tileStyle("#ff6b6b")}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#ff6b6b" }}>{risks.length}</div>
              <div style={{ fontSize: 9, color: "#6E8AA0" }}>RISK SIGNALS</div>
            </div>
          </div>

          {/* Classification stat tiles */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {Object.entries(CLASS_META).map(([k, m]) => (
              <div key={k} style={tileStyle(m.color)}>
                <div style={{ fontSize: 16, fontWeight: 700, color: m.color }}>{counts[k]}</div>
                <div style={{ fontSize: 9, color: "#6E8AA0" }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#6E8AA0", marginBottom: 3 }}>
              <span>COVERAGE</span>
              <span style={{ color: coverage > 60 ? "#00ff88" : AM }}>{coverage}%</span>
            </div>
            <div style={{ background: "#111827", borderRadius: 4, height: 5 }}>
              <div style={{ width: `${coverage}%`, height: "100%", background: coverage > 60 ? "#00ff88" : AM, borderRadius: 4, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "3px 8px", fontSize: 10, borderRadius: 4, cursor: "pointer",
                background: tab === t ? CY : "transparent",
                color: tab === t ? "#04060A" : CY,
                border: `1px solid ${CY}44`, letterSpacing: 1,
              }}>{t === "ALL" ? "ALL" : CLASS_META[t]?.label || t}</button>
            ))}
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search live events…"
            style={{
              width: "100%", padding: "5px 8px", marginBottom: 8,
              background: "#0a1020", border: `1px solid ${CY}33`, borderRadius: 5,
              color: "#DCEBF5", fontSize: 12, fontFamily: "'JetBrains Mono',monospace",
              boxSizing: "border-box",
            }}
          />

          {/* Assess */}
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              width: "100%", padding: "6px 0", marginBottom: 10, fontSize: 11,
              background: assessing ? "#111827" : `${CY}22`,
              border: `1px solid ${CY}55`, borderRadius: 6,
              color: CY, cursor: assessing ? "not-allowed" : "pointer",
              letterSpacing: 2, fontFamily: "'JetBrains Mono',monospace",
            }}
          >
            {assessing ? "◍ assessing…" : "▶ ASSESS GROUND TRUTH"}
          </button>

          {brief && (
            <div style={{ fontSize: 11, color: "#88ccaa", background: "#0a1820", border: `1px solid ${CY}22`, borderRadius: 6, padding: "8px 10px", marginBottom: 10, lineHeight: 1.5 }}>
              {brief}
            </div>
          )}

          {loading && <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: 20 }}>loading…</div>}
          {error && <div style={{ color: "#ff6b6b", fontSize: 11, marginBottom: 8 }}>⚠ {error}</div>}

          {/* Event list */}
          {!loading && visible.map((row) => {
            const meta  = CLASS_META[row.cls];
            const isExp = expanded === row.evt.id;
            const typeColor = TYPE_COLOR[row.evt.type] || CY;
            return (
              <div key={row.evt.id} style={{ marginBottom: 6, border: `1px solid ${meta.color}33`, borderRadius: 8, overflow: "hidden" }}>
                <div
                  onClick={() => setExpanded(isExp ? null : row.evt.id)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer", background: `${meta.color}08` }}
                >
                  <span style={{ fontSize: 10, background: `${typeColor}22`, color: typeColor, border: `1px solid ${typeColor}55`, borderRadius: 4, padding: "1px 5px" }}>{row.evt.type}</span>
                  <span style={{ fontSize: 11, flex: 1, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.evt.title}</span>
                  <span style={{ fontSize: 10, color: "#6E8AA0" }}>{row.evt.detail}</span>
                  <span style={{ fontSize: 10, background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}44`, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>{meta.label}</span>
                  <span style={{ fontSize: 11, color: "#6E8AA0" }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "8px 12px", background: "#040c18" }}>
                    {/* KB article matches */}
                    {row.matchedKb.length > 0 ? (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: "#00bfff", letterSpacing: 2, marginBottom: 5 }}>KB ARTICLES ({row.matchedKb.length})</div>
                        {row.matchedKb.slice(0, 4).map((a) => (
                          <div key={a.id} style={{ marginBottom: 4 }}>
                            <div style={{ fontSize: 11, color: "#DCEBF5", marginBottom: 3 }}>{a.title}</div>
                            <div style={{ background: "#111827", borderRadius: 3, height: 4 }}>
                              <div style={{ width: `${Math.min(100, a.score * 12)}%`, height: "100%", background: "#00bfff", borderRadius: 3 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: "#6E8AA0", marginBottom: 8 }}>No KB article matches.</div>
                    )}

                    {/* Risk signal matches */}
                    {row.matchedRisk.length > 0 ? (
                      <div>
                        <div style={{ fontSize: 10, color: "#ff6b6b", letterSpacing: 2, marginBottom: 5 }}>RISK SIGNALS ({row.matchedRisk.length})</div>
                        {row.matchedRisk.slice(0, 4).map((s) => (
                          <div key={s.id} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                              <span style={{ fontSize: 9, background: `${SEV_COLOR[s.severity] || AM}22`, color: SEV_COLOR[s.severity] || AM, border: `1px solid ${SEV_COLOR[s.severity] || AM}55`, borderRadius: 3, padding: "1px 4px" }}>{s.severity.toUpperCase()}</span>
                              <span style={{ fontSize: 11, color: "#DCEBF5" }}>{s.title}</span>
                            </div>
                            <div style={{ background: "#111827", borderRadius: 3, height: 4 }}>
                              <div style={{ width: `${Math.min(100, s.score * 12)}%`, height: "100%", background: SEV_COLOR[s.severity] || AM, borderRadius: 3 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: "#6E8AA0" }}>No risk signal matches.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!loading && visible.length === 0 && !error && (
            <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: "20px 0" }}>No events match current filter.</div>
          )}

          <div style={{ textAlign: "right", fontSize: 9, color: "#4A5A65", marginTop: 6 }}>
            auto-refresh 5 min · {rows.length} events classified
          </div>
        </div>
      )}
    </>
  );
}
