/**
 * F80 — Report × Knowledge × Ops Event Intelligence Gap Triad (RKOGAP)
 * Endpoints: /v1/reports × /knowledge/ × /v1/ops/events
 * Classification: FULLY_GROUNDED (KB article + ops event match) |
 *                 KB_ONLY        (KB article match, no ops event) |
 *                 OPS_ONLY       (ops event match, no KB article) |
 *                 UNANCHORED     (no match in either source)
 */
import { useEffect, useState, useRef } from "react";

const BTN_LEFT = 988_280;
const POLL_MS  = 90_000;
const Z_INDEX  = 143;

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  import.meta.env?.VITE_API_KEY ||
  "";

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

const RKOGAP_RE =
  /\b(rkogap|report\s*(knowledge|ops|event)\s*(gap|grounding|coverage)|intel\s*grounding|unanchored\s*reports?|report\s*ops\s*gap|knowledge\s*gap\s*report|intelligence\s*gap\s*report)\b/i;

export function isRkogapQuery(t) {
  return RKOGAP_RE.test(t || "");
}

function normaliseReport(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.report_id || raw._id || String(Math.random()),
    name: raw.name || raw.title || raw.subject || "Untitled Report",
    description: raw.description || raw.summary || raw.content || "",
    type: raw.type || raw.report_type || raw.category || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };
}

function normaliseKbArticle(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.article_id || raw._id || String(Math.random()),
    name: raw.name || raw.title || raw.subject || "Untitled Article",
    description: raw.description || raw.summary || raw.content || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };
}

function normaliseOpsEvent(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.event_id || raw._id || String(Math.random()),
    name: raw.name || raw.title || raw.event_type || raw.type || "Untitled Event",
    description: raw.description || raw.details || raw.summary || "",
    severity: raw.severity || raw.level || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };
}

function tokenize(s) {
  if (!s) return [];
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function scoreMatch(repTokens, item) {
  const itemTokens = tokenize(
    `${item.name} ${item.description || ""} ${(item.tags || []).join(" ")}`
  );
  if (!repTokens.length || !itemTokens.length) return 0;
  const set = new Set(itemTokens);
  return repTokens.filter((t) => set.has(t)).length;
}

const CY = "#00e5ff";
const RD = "#ff4444";
const AM = "#ffc107";
const GR = "#4ade80";
const PU = "#a855f7";

const CLASS_META = {
  FULLY_GROUNDED: { label: "FULLY GROUNDED", color: GR,   desc: "Backed by both KB articles and ops events" },
  KB_ONLY:        { label: "KB ONLY",         color: CY,   desc: "Matched to KB article, no ops event evidence" },
  OPS_ONLY:       { label: "OPS ONLY",        color: AM,   desc: "Matched to ops event, no KB article" },
  UNANCHORED:     { label: "UNANCHORED",      color: "#555", desc: "No supporting KB or ops event evidence" },
};

const TABS = ["ALL", "FULLY_GROUNDED", "KB_ONLY", "OPS_ONLY", "UNANCHORED"];

export async function buildRkogapScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [repRes, kbRes, opsRes] = await Promise.allSettled([
    fetch(`${base}/v1/reports`,   { headers }).then((r) => r.json()),
    fetch(`${base}/knowledge/`,   { headers }).then((r) => r.json()),
    fetch(`${base}/v1/ops/events`, { headers }).then((r) => r.json()),
  ]);

  const reports   = repRes.status === "fulfilled" ? repRes.value   : [];
  const kb        = kbRes.status  === "fulfilled" ? kbRes.value    : [];
  const opsEvents = opsRes.status === "fulfilled" ? opsRes.value   : [];

  const repArr = (Array.isArray(reports)   ? reports   : reports?.items   || reports?.data   || []).map(normaliseReport).filter(Boolean);
  const kbArr  = (Array.isArray(kb)        ? kb        : kb?.items        || kb?.data        || []).map(normaliseKbArticle).filter(Boolean);
  const opsArr = (Array.isArray(opsEvents) ? opsEvents : opsEvents?.items || opsEvents?.data || []).map(normaliseOpsEvent).filter(Boolean);

  const counts = { FULLY_GROUNDED: 0, KB_ONLY: 0, OPS_ONLY: 0, UNANCHORED: 0 };
  for (const rep of repArr) {
    const tok   = tokenize(`${rep.name} ${rep.description} ${rep.tags.join(" ")}`);
    const hasKb  = kbArr.some((a) => scoreMatch(tok, a) > 0);
    const hasOps = opsArr.some((e) => scoreMatch(tok, e) > 0);
    if (hasKb && hasOps)   counts.FULLY_GROUNDED++;
    else if (hasKb)        counts.KB_ONLY++;
    else if (hasOps)       counts.OPS_ONLY++;
    else                   counts.UNANCHORED++;
  }

  const coverPct = repArr.length
    ? Math.round(((counts.FULLY_GROUNDED + counts.KB_ONLY + counts.OPS_ONLY) / repArr.length) * 100)
    : 0;

  return `Report Knowledge-Ops Gap Triad online, sir. ${repArr.length} intelligence reports cross-referenced against ${kbArr.length} knowledge articles and ${opsArr.length} ops events — ${counts.FULLY_GROUNDED} reports are fully grounded with both KB and ops evidence, ${counts.KB_ONLY} are KB-only, ${counts.OPS_ONLY} are ops-only, and ${counts.UNANCHORED} reports are completely unanchored with no supporting intelligence. Overall grounding coverage is ${coverPct}%.`.trim();
}

export default function ReportKnowledgeOpsGap() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [brief, setBrief]         = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [repRes, kbRes, opsRes] = await Promise.allSettled([
        fetch(`${base}/v1/reports`,    { headers }).then((r) => r.json()),
        fetch(`${base}/knowledge/`,    { headers }).then((r) => r.json()),
        fetch(`${base}/v1/ops/events`, { headers }).then((r) => r.json()),
      ]);

      const reports   = repRes.status === "fulfilled" ? repRes.value   : [];
      const kb        = kbRes.status  === "fulfilled" ? kbRes.value    : [];
      const opsEvents = opsRes.status === "fulfilled" ? opsRes.value   : [];

      const repArr = (Array.isArray(reports)   ? reports   : reports?.items   || reports?.data   || []).map(normaliseReport).filter(Boolean);
      const kbArr  = (Array.isArray(kb)        ? kb        : kb?.items        || kb?.data        || []).map(normaliseKbArticle).filter(Boolean);
      const opsArr = (Array.isArray(opsEvents) ? opsEvents : opsEvents?.items || opsEvents?.data || []).map(normaliseOpsEvent).filter(Boolean);

      const mapped = repArr.map((rep) => {
        const tok = tokenize(`${rep.name} ${rep.description} ${rep.tags.join(" ")}`);
        const matchedKb = kbArr
          .map((a) => ({ ...a, score: scoreMatch(tok, a) }))
          .filter((a) => a.score > 0)
          .sort((a, b) => b.score - a.score);
        const matchedOps = opsArr
          .map((e) => ({ ...e, score: scoreMatch(tok, e) }))
          .filter((e) => e.score > 0)
          .sort((a, b) => b.score - a.score);
        const hasKb  = matchedKb.length  > 0;
        const hasOps = matchedOps.length > 0;
        const cls =
          hasKb && hasOps ? "FULLY_GROUNDED" :
          hasKb           ? "KB_ONLY"        :
          hasOps          ? "OPS_ONLY"       :
                            "UNANCHORED";
        return { rep, matchedKb, matchedOps, cls };
      });

      setRows(mapped);
    } catch (e) {
      setError(e?.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  useEffect(() => {
    const h = () => setOpen((v) => !v);
    window.addEventListener("jarvis:rkogap-toggle", h);
    return () => window.removeEventListener("jarvis:rkogap-toggle", h);
  }, []);

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const counts = { FULLY_GROUNDED: 0, KB_ONLY: 0, OPS_ONLY: 0, UNANCHORED: 0 };
      rows.forEach((r) => counts[r.cls]++);
      const coverPct = rows.length
        ? Math.round(((counts.FULLY_GROUNDED + counts.KB_ONLY + counts.OPS_ONLY) / rows.length) * 100)
        : 0;
      const prompt = `JARVIS intelligence gap analysis: ${rows.length} reports cross-referenced against KB articles and ops events. ${counts.FULLY_GROUNDED} fully grounded, ${counts.KB_ONLY} KB-only, ${counts.OPS_ONLY} ops-only, ${counts.UNANCHORED} unanchored with no supporting evidence. Coverage ${coverPct}%. Provide a 2-sentence intelligence grounding gap brief and prioritisation.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      setBrief(d.answer || "Assessment unavailable.");
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  const counts = { FULLY_GROUNDED: 0, KB_ONLY: 0, OPS_ONLY: 0, UNANCHORED: 0 };
  rows.forEach((r) => counts[r.cls]++);
  const unanchoredCount = counts.UNANCHORED;

  const filtered = rows.filter((r) => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.rep.name.toLowerCase().includes(s) || r.rep.description.toLowerCase().includes(s);
    }
    return true;
  });

  const PANEL_STYLE = {
    position: "fixed",
    bottom: 60,
    left: BTN_LEFT,
    zIndex: Z_INDEX,
    width: 520,
    maxHeight: "82vh",
    overflowY: "auto",
    background: "rgba(6,10,18,0.94)",
    border: `1px solid ${CY}44`,
    borderRadius: 12,
    fontFamily: "'JetBrains Mono',monospace",
    color: "#DCEBF5",
    fontSize: 11,
    boxShadow: `0 0 40px ${CY}18`,
    backdropFilter: "blur(10px)",
    padding: "14px 16px",
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Report × Knowledge × Ops Event Intelligence Gap Triad (F80)"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: Z_INDEX,
          background: open ? CY : "rgba(6,10,18,0.82)",
          color: open ? "#040810" : CY,
          border: `1px solid ${CY}66`,
          borderRadius: 6,
          padding: "4px 9px",
          fontSize: 10,
          fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: 1,
          cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
      >
        {unanchoredCount > 0 && !open && (
          <span style={{
            marginRight: 4,
            background: AM,
            color: "#040810",
            borderRadius: 8,
            padding: "1px 5px",
            fontSize: 9,
          }}>
            {unanchoredCount}
          </span>
        )}
        ◈ RKOGAP
      </button>

      {open && (
        <div style={PANEL_STYLE}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, letterSpacing: 2, fontSize: 12 }}>◈ RKOGAP</span>
            <span style={{ color: "#6E8AA0", fontSize: 10, flexGrow: 1 }}>
              Report × KB × Ops Intelligence Gap
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14,
            }}>×</button>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {Object.entries(counts).map(([cls, n]) => (
              <div key={cls} style={{
                background: `${CLASS_META[cls].color}18`,
                border: `1px solid ${CLASS_META[cls].color}44`,
                borderRadius: 6,
                padding: "4px 8px",
                textAlign: "center",
              }}>
                <div style={{ color: CLASS_META[cls].color, fontSize: 14, fontWeight: "bold" }}>{n}</div>
                <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 0.5 }}>{CLASS_META[cls].label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? CY : "rgba(41,231,255,0.06)",
                color: tab === t ? "#040810" : CY,
                border: `1px solid ${CY}44`,
                borderRadius: 4,
                padding: "2px 7px",
                fontSize: 9,
                cursor: "pointer",
                letterSpacing: 0.5,
              }}>
                {t === "ALL"            ? `ALL (${rows.length})` :
                 t === "FULLY_GROUNDED" ? `FULLY GROUNDED (${counts.FULLY_GROUNDED})` :
                 t === "KB_ONLY"        ? `KB ONLY (${counts.KB_ONLY})` :
                 t === "OPS_ONLY"       ? `OPS ONLY (${counts.OPS_ONLY})` :
                 `UNANCHORED (${counts.UNANCHORED})`}
              </button>
            ))}
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search reports…"
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "rgba(41,231,255,0.05)",
              border: `1px solid ${CY}33`,
              borderRadius: 5,
              padding: "4px 8px",
              color: "#DCEBF5",
              fontSize: 10,
              marginBottom: 8,
              outline: "none",
              fontFamily: "inherit",
            }}
          />

          {loading && <div style={{ color: "#6E8AA0", fontSize: 10, marginBottom: 6 }}>◌ loading…</div>}
          {error   && <div style={{ color: RD,        fontSize: 10, marginBottom: 6 }}>✗ {error}</div>}

          <div style={{ maxHeight: "48vh", overflowY: "auto" }}>
            {filtered.map((row) => {
              const { rep, matchedKb, matchedOps, cls } = row;
              const meta  = CLASS_META[cls];
              const isExp = expanded === rep.id;
              return (
                <div key={rep.id} style={{
                  borderBottom: `1px solid ${CY}18`,
                  paddingBottom: 8,
                  marginBottom: 8,
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : rep.id)}
                    style={{ cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 8 }}
                  >
                    <div style={{
                      minWidth: 90,
                      padding: "2px 5px",
                      background: `${meta.color}18`,
                      border: `1px solid ${meta.color}55`,
                      borderRadius: 4,
                      color: meta.color,
                      fontSize: 8,
                      letterSpacing: 0.5,
                      textAlign: "center",
                    }}>
                      {meta.label}
                    </div>
                    <div style={{ flexGrow: 1, minWidth: 0 }}>
                      <div style={{ color: "#DCEBF5", fontSize: 11, fontWeight: "bold", wordBreak: "break-word" }}>
                        {rep.name}
                      </div>
                      {rep.type && (
                        <span style={{ color: "#6E8AA0", fontSize: 9 }}>{rep.type}</span>
                      )}
                      <div style={{ color: "#4a6a80", fontSize: 9, marginTop: 2, display: "flex", gap: 8 }}>
                        <span>kb: {matchedKb.length}</span>
                        <span>ops: {matchedOps.length}</span>
                      </div>
                    </div>
                    <span style={{ color: CY, fontSize: 10, marginLeft: "auto", flexShrink: 0 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 8, paddingLeft: 10 }}>
                      {matchedKb.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: GR, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            KB ARTICLES ({matchedKb.length})
                          </div>
                          {matchedKb.slice(0, 4).map((a) => (
                            <div key={a.id} style={{
                              background: `${GR}10`,
                              border: `1px solid ${GR}33`,
                              borderRadius: 5,
                              padding: "4px 7px",
                              marginBottom: 3,
                            }}>
                              <div style={{ color: "#DCEBF5", fontSize: 10 }}>{a.name}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                                <div style={{
                                  flexGrow: 1, height: 3, background: "#1a2a3a",
                                  borderRadius: 2, overflow: "hidden",
                                }}>
                                  <div style={{
                                    width: `${Math.min(100, a.score * 20)}%`,
                                    height: "100%", background: GR, borderRadius: 2,
                                  }} />
                                </div>
                                <span style={{ color: GR, fontSize: 8 }}>relevance {a.score}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {matchedOps.length > 0 && (
                        <div>
                          <div style={{ color: AM, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            OPS EVENTS ({matchedOps.length})
                          </div>
                          {matchedOps.slice(0, 4).map((e) => (
                            <div key={e.id} style={{
                              background: `${AM}10`,
                              border: `1px solid ${AM}33`,
                              borderRadius: 5,
                              padding: "4px 7px",
                              marginBottom: 3,
                            }}>
                              <div style={{ color: "#DCEBF5", fontSize: 10 }}>{e.name}</div>
                              {e.severity && (
                                <div style={{ color: AM, fontSize: 8, marginTop: 1 }}>{e.severity}</div>
                              )}
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                                <div style={{
                                  flexGrow: 1, height: 3, background: "#1a2a3a",
                                  borderRadius: 2, overflow: "hidden",
                                }}>
                                  <div style={{
                                    width: `${Math.min(100, e.score * 20)}%`,
                                    height: "100%", background: AM, borderRadius: 2,
                                  }} />
                                </div>
                                <span style={{ color: AM, fontSize: 8 }}>relevance {e.score}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {matchedKb.length === 0 && matchedOps.length === 0 && (
                        <div style={{ color: "#4a6a80", fontSize: 10 }}>
                          No KB articles or ops events match this report.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && !loading && (
              <div style={{ color: "#4a6a80", fontSize: 10 }}>No reports match the current filter.</div>
            )}
          </div>

          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={assess} disabled={assessing || rows.length === 0} style={{
              background: assessing ? "#1a2a3a" : `${CY}18`,
              border: `1px solid ${CY}55`,
              borderRadius: 5,
              color: CY,
              padding: "4px 10px",
              fontSize: 10,
              cursor: rows.length === 0 ? "default" : "pointer",
              fontFamily: "inherit",
              letterSpacing: 0.5,
            }}>
              {assessing ? "◌ assessing…" : "▶ ASSESS INTEL GAPS"}
            </button>
            <button onClick={load} style={{
              background: "none",
              border: `1px solid ${CY}33`,
              borderRadius: 5,
              color: "#6E8AA0",
              padding: "4px 8px",
              fontSize: 9,
              cursor: "pointer",
              fontFamily: "inherit",
            }}>
              ↻
            </button>
          </div>

          {brief && (
            <div style={{
              marginTop: 8,
              background: `${CY}0a`,
              border: `1px solid ${CY}33`,
              borderRadius: 6,
              padding: "7px 9px",
              color: "#DCEBF5",
              fontSize: 10,
              lineHeight: 1.5,
            }}>
              {brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
