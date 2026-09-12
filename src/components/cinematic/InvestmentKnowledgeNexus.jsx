/**
 * InvestmentKnowledgeNexus — F710
 *
 * Polls GET /entities/Investment + GET /knowledge/ every 90 s.
 * Cross-references: which investments are DOCUMENTED by ≥1 knowledge article
 * (keyword overlap in ticker/name/description) vs UNDOCUMENTED (no article backing).
 *
 * Voice intents: "invkno" | "investment knowledge" | "portfolio knowledge"
 *                | "knowledge backed investment" | "documented investments"
 *                | "undocumented portfolio" | "knowledge portfolio"
 *                | "investment article coverage"
 * Strip button: ◈ INVKNO   left:886620  bottom:8  zIndex:245
 * Custom event: jarvis:invkno-toggle
 *
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFB347";
const DIM = "#566878";
const POLL = 90_000;
const BTN_LEFT = 886620;
const ZIDX = 245;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const INVKNO_RE =
  /\b(invkno|investment[.\s-]*knowledge|portfolio[.\s-]*knowledge|knowledge[.\s-]*backed[.\s-]*invest|documented[.\s-]*invest|undocumented[.\s-]*portfolio|knowledge[.\s-]*portfolio|investment[.\s-]*article[.\s-]*coverage)\b/i;

export function isInvknoQuery(q) {
  return INVKNO_RE.test(q || "");
}

export async function buildInvknoScript() {
  try {
    const [ir, kr] = await Promise.all([
      fetch(`${apiBase()}/entities/Investment`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/knowledge/`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const investments = ir.ok ? ((await ir.json())?.results ?? []) : [];
    const articles    = kr.ok ? ((await kr.json())?.results ?? []) : [];

    if (!investments.length && !articles.length)
      return "Investment and knowledge data are unavailable at present, sir.";

    const artTokens = articles.flatMap(a =>
      `${a.title||""} ${a.summary||""} ${a.content||""}`
        .toLowerCase().split(/\W+/).filter(t => t.length > 3)
    );
    const artSet = new Set(artTokens);

    const documented = investments.filter(inv => {
      const words = `${inv.name||""} ${inv.ticker||""} ${inv.description||""}`
        .toLowerCase().split(/\W+/).filter(t => t.length > 3);
      return words.some(w => artSet.has(w));
    });

    const pct = investments.length ? Math.round((documented.length / investments.length) * 100) : 0;

    const brief = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: `Investment × Knowledge nexus: ${investments.length} holdings, ${articles.length} knowledge articles, ${documented.length} investments backed by articles (${pct}%). Provide a 2-sentence portfolio-knowledge coverage brief.` }),
    }).then(r => r.ok ? r.json() : null).then(d => d?.response || d?.reply || "").catch(() => "");

    return (
      `Investment × Knowledge Nexus, sir. ${investments.length} holdings, ${articles.length} articles. ` +
      `${documented.length} investments (${pct}%) are backed by knowledge articles; ${investments.length - documented.length} have no article coverage. ` +
      (brief || "")
    ).trim();
  } catch {
    return "I was unable to retrieve the investment knowledge nexus at this time, sir.";
  }
}

const PANEL = {
  position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
  zIndex: ZIDX + 10, width: "min(560px,95vw)",
  background: "rgba(4,8,14,0.94)", border: `1px solid ${CY}44`, borderRadius: 12,
  backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
  boxShadow: `0 0 48px ${CY}18`, fontFamily: "'JetBrains Mono',monospace",
  color: "#DCEBF5", overflow: "hidden",
};
const HDR = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
  background: "rgba(41,231,255,0.05)",
};

function keywords(str) {
  return str.toLowerCase().split(/\W+/).filter(t => t.length > 3);
}

function scoreInvestment(inv, artTokenSet) {
  const words = keywords(`${inv.name||""} ${inv.ticker||""} ${inv.description||""}`);
  return words.filter(w => artTokenSet.has(w)).length;
}

function kindBadgeColor(kind) {
  if (!kind) return DIM;
  const k = kind.toLowerCase();
  if (k.includes("equity") || k.includes("stock")) return CY;
  if (k.includes("crypto")) return AMB;
  if (k.includes("bond") || k.includes("fixed")) return GRN;
  if (k.includes("etf")) return "#a78bfa";
  return DIM;
}

export default function InvestmentKnowledgeNexus() {
  const [open, setOpen]         = useState(false);
  const [investments, setInvs]  = useState([]);
  const [articles, setArts]     = useState([]);
  const [loading, setLoad]      = useState(false);
  const [err, setErr]           = useState(null);
  const [tab, setTab]           = useState("ALL");
  const [q, setQ]               = useState("");
  const [expanded, setExp]      = useState(null);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoad(true); setErr(null);
    try {
      const [ir, kr] = await Promise.all([
        fetch(`${apiBase()}/entities/Investment`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/knowledge/`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const id = ir.ok ? await ir.json() : {};
      setInvs(Array.isArray(id) ? id : (id?.results ?? []));
      setArts(kr.ok ? ((await kr.json())?.results ?? []) : []);
    } catch (e) { setErr(e.message); }
    finally { setLoad(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:invkno-toggle", h);
    return () => window.removeEventListener("jarvis:invkno-toggle", h);
  }, []);

  const artTokenSet = new Set(articles.flatMap(a =>
    keywords(`${a.title||""} ${a.summary||""} ${a.content||""}`)));

  const enriched = investments.map(inv => {
    const hits = scoreInvestment(inv, artTokenSet);
    const matched = hits > 0
      ? articles.filter(a => {
          const aw = keywords(`${a.title||""} ${a.summary||""} ${a.content||""}`);
          const iw = new Set(keywords(`${inv.name||""} ${inv.ticker||""} ${inv.description||""}`));
          return aw.some(w => iw.has(w));
        })
      : [];
    return { ...inv, hits, matched };
  });

  const documented   = enriched.filter(i => i.hits > 0);
  const undocumented = enriched.filter(i => i.hits === 0);
  const pct = investments.length ? Math.round((documented.length / investments.length) * 100) : 0;

  const visible = enriched
    .filter(i => tab === "ALL" || (tab === "DOCUMENTED" ? i.hits > 0 : i.hits === 0))
    .filter(i => !q || (i.name||i.ticker||"").toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Investment × Knowledge coverage nexus"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: ZIDX,
          padding: "4px 10px", background: open ? CY : "rgba(5,8,13,0.75)",
          color: open ? "#04060A" : CY, border: `1px solid ${CY}`,
          borderRadius: 6, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
      >
        ◈ INVKNO
        {undocumented.length > 0 && (
          <span style={{
            marginLeft: 5, background: AMB, color: "#04060A",
            borderRadius: 3, fontSize: 7, padding: "1px 4px", fontWeight: 700,
          }}>{undocumented.length}</span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={HDR}>
            <span style={{ color: CY, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>
              ◈ Investment × Knowledge Nexus
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {["ALL","DOCUMENTED","UNDOCUMENTED"].map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  fontSize: 8, padding: "2px 7px", borderRadius: 4,
                  border: `1px solid ${tab===t ? CY : "#2a3a4a"}`,
                  background: tab===t ? `${CY}22` : "transparent",
                  color: tab===t ? CY : DIM, cursor: "pointer",
                  fontFamily: "inherit", textTransform: "uppercase", letterSpacing: 1,
                }}>{t}</button>
              ))}
              <button onClick={() => setOpen(false)} style={{
                background:"none", border:"none", color: DIM,
                cursor:"pointer", fontSize:14, marginLeft:4, lineHeight:1,
              }}>×</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
            {[
              ["INVESTMENTS",  investments.length,   CY],
              ["ARTICLES",     articles.length,      AMB],
              ["DOCUMENTED",   documented.length,    GRN],
              ["UNDOCUMENTED", undocumented.length,  "#e8203c"],
              ["COVERAGE",     `${pct}%`,            pct >= 60 ? GRN : pct >= 30 ? AMB : "#e8203c"],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                flex: "1 1 80px", background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}18`, borderRadius: 8, padding: "6px 10px", textAlign:"center",
              }}>
                <div style={{ fontSize: 16, color: col, fontVariantNumeric: "tabular-nums" }}>{val}</div>
                <div style={{ fontSize: 8, color: DIM, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 14px 8px" }}>
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Filter investments…"
              style={{
                width: "100%", boxSizing: "border-box", background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}22`, borderRadius: 6, color: "#DCEBF5",
                fontFamily: "inherit", fontSize: 10, padding: "5px 9px", outline: "none",
              }}
            />
          </div>

          {/* List */}
          <div style={{ padding: "0 14px 10px", maxHeight: 300, overflowY: "auto" }}>
            {loading && !investments.length && (
              <div style={{ color: DIM, fontSize: 10 }}>◌ Loading…</div>
            )}
            {err && <div style={{ color: "#e8203c", fontSize: 10 }}>⚠ {err}</div>}
            {visible.map((inv, i) => (
              <div key={inv.id || i}>
                <div
                  onClick={() => setExp(exp => exp === i ? null : i)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "5px 0",
                    borderBottom: "1px solid rgba(41,231,255,0.06)", cursor: "pointer",
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: inv.hits > 0 ? GRN : "#e8203c",
                  }} />
                  {inv.kind && (
                    <span style={{
                      fontSize: 7, padding: "1px 4px", borderRadius: 3,
                      border: `1px solid ${kindBadgeColor(inv.kind)}55`,
                      color: kindBadgeColor(inv.kind), textTransform: "uppercase",
                      letterSpacing: 1, flexShrink: 0,
                    }}>{inv.kind}</span>
                  )}
                  <span style={{ flex: 1, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {inv.ticker ? `${inv.ticker} — ` : ""}{inv.name || inv.id || "Unnamed"}
                  </span>
                  {inv.hits > 0 && (
                    <span style={{ fontSize: 8, color: GRN, minWidth: 44, textAlign: "right" }}>
                      {inv.hits} hit{inv.hits !== 1 ? "s" : ""}
                    </span>
                  )}
                  {inv.hits === 0 && (
                    <span style={{ fontSize: 8, color: DIM, minWidth: 44, textAlign: "right" }}>—</span>
                  )}
                </div>
                {expanded === i && (
                  <div style={{ padding: "6px 10px 6px 18px", background: "rgba(41,231,255,0.03)", borderRadius: 6, marginBottom: 4 }}>
                    {inv.description && (
                      <div style={{ fontSize: 10, color: "#DCEBF5", marginBottom: 6 }}>{inv.description}</div>
                    )}
                    {inv.matched.length > 0 ? (
                      <>
                        <div style={{ fontSize: 8, color: GRN, marginBottom: 4 }}>
                          ✓ Backed by {inv.matched.length} article{inv.matched.length !== 1 ? "s" : ""}:
                        </div>
                        {inv.matched.slice(0, 4).map((a, j) => (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            {a.kind && (
                              <span style={{
                                fontSize: 7, padding: "1px 5px", borderRadius: 3,
                                border: `1px solid ${AMB}55`, color: AMB,
                                textTransform: "uppercase", letterSpacing: 1,
                              }}>{a.kind}</span>
                            )}
                            <span style={{ fontSize: 9, color: "#DCEBF5" }}>
                              {a.title || a.id || "Untitled"}
                            </span>
                          </div>
                        ))}
                        {inv.matched.length > 4 && (
                          <div style={{ fontSize: 8, color: DIM }}>+{inv.matched.length - 4} more</div>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: 9, color: DIM }}>Not backed by any knowledge article</div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!loading && !err && visible.length === 0 && (
              <div style={{ color: DIM, fontSize: 10 }}>No investments match.</div>
            )}
          </div>

          <div style={{ padding: "6px 14px", borderTop: `1px solid rgba(41,231,255,0.06)`, fontSize: 8, color: DIM, display: "flex", justifyContent: "space-between" }}>
            <span>Source: /entities/Investment × /knowledge/</span>
            <span style={{ color: loading ? AMB : GRN }}>
              {loading ? "◌ updating" : `${visible.length} shown · ${tab}`}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
