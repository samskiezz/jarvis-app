/**
 * F111 — Investment × Ops Event × Knowledge Financial Intelligence Pulse (IOEFIP)
 *
 * Parallel-fetches /entities/Investment + /v1/ops/events + /knowledge/.
 * Keyword-correlates each investment against ops events AND KB articles to classify:
 *   FULLY_MONITORED  (ops event + KB article match)
 *   OPS_TRACKED      (ops event match only)
 *   KB_RESEARCHED    (KB article match only)
 *   UNMONITORED      (neither — no operational or knowledge coverage)
 *
 * Amber badge on unmonitored count.
 * Stat tiles INVESTMENTS / OPS EVENTS / KB ARTICLES + all four class counts + COVERAGE%.
 * Filter tabs ALL/FULLY_MONITORED/OPS_TRACKED/KB_RESEARCHED/UNMONITORED + text search.
 * Expand investment → matched ops event cards (blue) + KB article cards (green)
 *   with relevance bars.
 * ▶ ASSESS INTELLIGENCE → /v1/jarvis/agent/chat 2-sentence financial intel brief + TTS.
 * Voice trigger: "ioefip/investment ops knowledge/financial intel pulse/unmonitored investments/
 *   investment knowledge ops pulse/financial intelligence".
 * Event: jarvis:ioefip-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_005_080;
const Z_INDEX  = 173;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const IOEFIP_RE = /\b(ioefip|investment[\s-]ops[\s-]knowledge|financial[\s-]intel[\s-]pulse|unmonitored[\s-]investments?|investment[\s-]knowledge[\s-]ops[\s-]pulse|financial[\s-]intelligence)\b/i;

const CY    = "#00CFFF";
const BL    = "#3B82F6";
const GR    = "#22C55E";
const AM    = "#F59E0B";
const RD    = "#EF4444";
const BG    = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT  = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_MONITORED: GR,
  OPS_TRACKED:     BL,
  KB_RESEARCHED:   CY,
  UNMONITORED:     AM,
};

const TABS = ["ALL","FULLY_MONITORED","OPS_TRACKED","KB_RESEARCHED","UNMONITORED"];

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isIoefipQuery(text) {
  return IOEFIP_RE.test(text || "");
}

// ── helpers ───────────────────────────────────────────────────────────────────

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function kwTokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function overlap(aStr, bStr) {
  const at = new Set(kwTokens(aStr));
  const bt = kwTokens(bStr);
  if (!at.size || !bt.length) return 0;
  return bt.filter(w => at.has(w)).length / Math.max(at.size, bt.length);
}

function investKey(inv) {
  return [inv.name, inv.title, inv.type, inv.sector, inv.description, inv.tags, inv.id]
    .filter(Boolean).join(" ");
}

function opsKey(ev) {
  return [ev.title, ev.description, ev.type, ev.category, ev.tags, ev.id]
    .filter(Boolean).join(" ");
}

function kbKey(art) {
  return [art.title, art.content, art.summary, art.tags, art.topic, art.id]
    .filter(Boolean).join(" ");
}

async function fetchAll() {
  const base = apiBase();
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [invRes, opsRes, kbRes] = await Promise.all([
    fetch(`${base}/entities/Investment`, { headers }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/ops/events`,       { headers }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/knowledge/`,          { headers }).then(r => r.ok ? r.json() : []),
  ]);
  const investments = norm(invRes, ["investments","data","items","results"]);
  const opsEvents   = norm(opsRes, ["events","data","items","results"]);
  const kbArticles  = norm(kbRes,  ["articles","items","results","data"]);
  return { investments, opsEvents, kbArticles };
}

function classify(investments, opsEvents, kbArticles) {
  return investments.map(inv => {
    const ik = investKey(inv);
    const matchedOps = opsEvents.filter(ev  => overlap(ik, opsKey(ev)) > 0.08);
    const matchedKb  = kbArticles.filter(art => overlap(ik, kbKey(art)) > 0.08);
    const hasOps = matchedOps.length > 0;
    const hasKb  = matchedKb.length  > 0;
    const cls =
      hasOps && hasKb ? "FULLY_MONITORED" :
      hasOps           ? "OPS_TRACKED"     :
      hasKb            ? "KB_RESEARCHED"   :
                         "UNMONITORED";
    return {
      ...inv,
      _class:   cls,
      _ops:     matchedOps.map(ev  => ({ ...ev,  _rel: overlap(ik, opsKey(ev))  })),
      _kb:      matchedKb.map(art  => ({ ...art, _rel: overlap(ik, kbKey(art))  })),
    };
  });
}

export async function buildIoefipScript() {
  const base    = apiBase();
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const { investments, opsEvents, kbArticles } = await fetchAll();
  const rows       = classify(investments, opsEvents, kbArticles);
  const total      = rows.length;
  const fully      = rows.filter(r => r._class === "FULLY_MONITORED").length;
  const opsOnly    = rows.filter(r => r._class === "OPS_TRACKED").length;
  const kbOnly     = rows.filter(r => r._class === "KB_RESEARCHED").length;
  const unmon      = rows.filter(r => r._class === "UNMONITORED").length;
  const covPct     = total ? Math.round(((fully + opsOnly + kbOnly) / total) * 100) : 0;
  const ctx =
    `Investments: ${total}. Ops events: ${opsEvents.length}. KB articles: ${kbArticles.length}. ` +
    `Fully monitored: ${fully}. Ops-tracked: ${opsOnly}. KB-researched: ${kbOnly}. ` +
    `Unmonitored: ${unmon}. Coverage: ${covPct}%.`;
  const chat = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Assess financial intelligence coverage for investment portfolio. Context: ${ctx}`,
    }),
  }).then(r => r.ok ? r.json() : null);
  return chat?.response || chat?.message || chat?.content || chat?.reply ||
    `Financial intelligence coverage is at ${covPct} percent, sir. ${unmon} investments remain unmonitored — no operational event or knowledge-base coverage — requiring immediate intelligence attention.`;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function InvestmentOpsKnowledgePulse() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [counts,    setCounts]    = useState({ total:0, ops:0, kb:0, fully:0, opsOnly:0, kbOnly:0, unmon:0 });
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState("");
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { investments, opsEvents, kbArticles } = await fetchAll();
      const classified = classify(investments, opsEvents, kbArticles);
      setRows(classified);
      setCounts({
        total:   classified.length,
        ops:     opsEvents.length,
        kb:      kbArticles.length,
        fully:   classified.filter(r => r._class === "FULLY_MONITORED").length,
        opsOnly: classified.filter(r => r._class === "OPS_TRACKED").length,
        kbOnly:  classified.filter(r => r._class === "KB_RESEARCHED").length,
        unmon:   classified.filter(r => r._class === "UNMONITORED").length,
      });
    } catch(e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:ioefip-toggle", handler);
    return () => window.removeEventListener("jarvis:ioefip-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief("");
    try {
      const script = await buildIoefipScript();
      setBrief(script);
      const base    = apiBase();
      const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ text: script }),
      }).then(async r => {
        if (!r.ok) return;
        const blob  = await r.blob();
        const url   = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
        audio.onended = () => URL.revokeObjectURL(url);
      }).catch(() => {});
    } catch(e) {
      setBrief(String(e?.message || e));
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    const unmonBadge = counts.unmon > 0;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investment × Ops × Knowledge Financial Intelligence Pulse (IOEFIP)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${unmonBadge ? AM : BORDER}`,
          color: unmonBadge ? AM : CY, fontFamily: FONT, fontSize: 10, padding: "3px 7px",
          borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ◈ IOEFIP{unmonBadge ? ` [${counts.unmon}]` : ""}
      </button>
    );
  }

  const covPct = counts.total
    ? Math.round(((counts.fully + counts.opsOnly + counts.kbOnly) / counts.total) * 100)
    : 0;

  const filtered = rows.filter(r => {
    if (tab !== "ALL" && r._class !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.name || r.title || r.description || r.id || "").toLowerCase().includes(q);
    }
    return true;
  });

  const tile = (label, value, color) => (
    <div style={{
      background: "rgba(255,255,255,0.04)", border: `1px solid ${color}33`,
      borderRadius: 6, padding: "6px 10px", textAlign: "center", minWidth: 80,
    }}>
      <div style={{ color, fontSize: 16, fontWeight: 700 }}>{value}</div>
      <div style={{ color: "#8892A4", fontSize: 9, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <div style={{
      position: "fixed", bottom: 44, left: BTN_LEFT - 200, zIndex: Z_INDEX,
      width: 640, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: BG, border: `1px solid ${BORDER}`, borderRadius: 10,
      fontFamily: FONT, fontSize: 11, color: "#C8D6E5", boxShadow: "0 8px 32px #000A",
      overflow: "hidden",
    }}>
      {/* header */}
      <div style={{ padding: "10px 14px 6px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: CY, fontWeight: 700, fontSize: 12 }}>
            ◈ IOEFIP — Financial Intelligence Pulse
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={load} disabled={loading}
              style={{ background: "none", border: `1px solid ${BORDER}`, color: CY,
                fontFamily: FONT, fontSize: 10, padding: "2px 7px", borderRadius: 4, cursor: "pointer" }}>
              {loading ? "…" : "↺"}
            </button>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: `1px solid ${BORDER}`, color: "#8892A4",
                fontFamily: FONT, fontSize: 10, padding: "2px 7px", borderRadius: 4, cursor: "pointer" }}>
              ✕
            </button>
          </div>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {tile("INVESTMENTS",      counts.total,   CY)}
          {tile("OPS EVENTS",       counts.ops,     BL)}
          {tile("KB ARTICLES",      counts.kb,      GR)}
          {tile("FULLY MONITORED",  counts.fully,   GR)}
          {tile("OPS TRACKED",      counts.opsOnly, BL)}
          {tile("KB RESEARCHED",    counts.kbOnly,  CY)}
          {tile("UNMONITORED",      counts.unmon,   AM)}
          {tile("COVERAGE%",        `${covPct}%`,   covPct >= 70 ? GR : covPct >= 40 ? AM : RD)}
        </div>

        {/* coverage bar */}
        <div style={{ marginTop: 8, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
          <div style={{ height: "100%", width: `${covPct}%`, background: covPct >= 70 ? GR : AM, borderRadius: 2, transition: "width 0.4s" }} />
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                background: tab === t ? "rgba(0,207,255,0.12)" : "none",
                border: `1px solid ${tab === t ? CY : BORDER}`,
                color: tab === t ? CY : "#8892A4", fontFamily: FONT, fontSize: 9,
                padding: "2px 6px", borderRadius: 3, cursor: "pointer",
              }}>
              {t.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        {/* search */}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search investments…"
          style={{
            marginTop: 7, width: "100%", boxSizing: "border-box",
            background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
            color: "#C8D6E5", fontFamily: FONT, fontSize: 10, padding: "4px 8px",
            borderRadius: 4, outline: "none",
          }}
        />
      </div>

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 10px" }}>
        {err && <div style={{ color: RD, padding: 8 }}>Error: {err}</div>}
        {!err && filtered.length === 0 && !loading && (
          <div style={{ color: "#8892A4", textAlign: "center", padding: 16 }}>No investments match.</div>
        )}
        {filtered.map((row, i) => {
          const isExp    = expanded === i;
          const clsColor = CLASS_COLOR[row._class] || AM;
          return (
            <div key={row.id || i} style={{
              marginBottom: 5, border: `1px solid ${clsColor}33`,
              borderRadius: 6, overflow: "hidden",
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : i)}
                style={{
                  padding: "6px 10px", cursor: "pointer", display: "flex",
                  justifyContent: "space-between", alignItems: "center",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: "#EDF2F7", fontWeight: 600 }}>
                    {row.name || row.title || row.id || "Unknown Investment"}
                  </span>
                  {(row.type || row.sector) && (
                    <span style={{ color: "#8892A4", fontSize: 9, marginLeft: 6 }}>
                      [{row.type || row.sector}]
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  <span style={{
                    background: `${clsColor}22`, border: `1px solid ${clsColor}55`,
                    color: clsColor, fontSize: 9, padding: "1px 5px", borderRadius: 3,
                  }}>
                    {row._class.replace(/_/g, " ")}
                  </span>
                  <span style={{ color: "#8892A4", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>

              {isExp && (
                <div style={{ padding: "8px 10px", background: "rgba(0,0,0,0.2)" }}>
                  {/* Ops Events */}
                  {row._ops.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: BL, fontSize: 9, marginBottom: 4 }}>
                        ◆ OPS EVENTS ({row._ops.length})
                      </div>
                      {row._ops.sort((a,b) => b._rel - a._rel).slice(0,5).map((ev,j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ color: "#C8D6E5", fontSize: 10 }}>
                              {ev.title || ev.description || ev.id}
                            </span>
                            <span style={{ color: BL, fontSize: 9 }}>
                              {Math.round(ev._rel * 100)}%
                            </span>
                          </div>
                          <div style={{ height: 2, background: "rgba(255,255,255,0.07)", borderRadius: 1 }}>
                            <div style={{ height: "100%", width: `${Math.round(ev._rel * 100)}%`, background: BL, borderRadius: 1 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* KB Articles */}
                  {row._kb.length > 0 && (
                    <div>
                      <div style={{ color: GR, fontSize: 9, marginBottom: 4 }}>
                        ◇ KB ARTICLES ({row._kb.length})
                      </div>
                      {row._kb.sort((a,b) => b._rel - a._rel).slice(0,5).map((art,j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ color: "#C8D6E5", fontSize: 10 }}>
                              {art.title || art.id}
                            </span>
                            <span style={{ color: GR, fontSize: 9 }}>
                              {Math.round(art._rel * 100)}%
                            </span>
                          </div>
                          <div style={{ height: 2, background: "rgba(255,255,255,0.07)", borderRadius: 1 }}>
                            <div style={{ height: "100%", width: `${Math.round(art._rel * 100)}%`, background: GR, borderRadius: 1 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {row._ops.length === 0 && row._kb.length === 0 && (
                    <div style={{ color: AM, fontSize: 10 }}>
                      No ops event or KB article match — investment is UNMONITORED.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{ padding: "8px 10px", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <button onClick={assess} disabled={assessing}
            style={{
              background: "rgba(0,207,255,0.08)", border: `1px solid ${CY}55`,
              color: CY, fontFamily: FONT, fontSize: 10, padding: "4px 12px",
              borderRadius: 4, cursor: assessing ? "not-allowed" : "pointer", flexShrink: 0,
            }}>
            {assessing ? "ASSESSING…" : "▶ ASSESS INTELLIGENCE"}
          </button>
          {brief && (
            <div style={{
              color: "#C8D6E5", fontSize: 10, lineHeight: 1.5,
              background: "rgba(0,207,255,0.05)", border: `1px solid ${CY}22`,
              borderRadius: 4, padding: "4px 8px", flex: 1,
            }}>
              {brief}
            </div>
          )}
        </div>
        <div style={{ color: "#4A5568", fontSize: 9, marginTop: 6 }}>
          Auto-refresh 90 s · /entities/Investment × /v1/ops/events × /knowledge/
        </div>
      </div>
    </div>
  );
}
