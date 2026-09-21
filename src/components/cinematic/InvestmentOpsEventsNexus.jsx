/**
 * InvestmentOpsEventsNexus — F713
 *
 * Polls GET /entities/Investment + GET /v1/ops/events every 90 s.
 * Cross-references: which investments are SIGNALED by ≥1 ops event
 * (keyword overlap in investment name/ticker/description vs event title/body/source)
 * vs QUIET (no operational event match).
 *
 * Voice intents: "invops" | "investment ops" | "ops investment"
 *                | "portfolio ops events" | "signaled investments"
 *                | "quiet investments" | "investment events"
 *                | "portfolio event coverage"
 * Strip button: ◈ INVOPS   left:889200  bottom:8  zIndex:248
 * Custom event: jarvis:invops-toggle
 *
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFB347";
const RED = "#e8203c";
const DIM = "#566878";
const POLL = 90_000;
const BTN_LEFT = 889200;
const ZIDX = 248;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const INVOPS_RE =
  /\b(invops|investment[.\s-]*ops|ops[.\s-]*investment|portfolio[.\s-]*ops[.\s-]*events?|signaled[.\s-]*invest|quiet[.\s-]*invest|investment[.\s-]*events?|portfolio[.\s-]*event[.\s-]*coverage)\b/i;

export function isInvopsQuery(q) {
  return INVOPS_RE.test(q || "");
}

export async function buildInvopsScript() {
  try {
    const [ir, er] = await Promise.all([
      fetch(`${apiBase()}/entities/Investment`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/ops/events`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const investments = ir.ok ? ((await ir.json())?.results ?? []) : [];
    const events      = er.ok ? ((await er.json())?.results ?? (await er.json()) ?? []) : [];
    const evtArr      = Array.isArray(events) ? events : (events?.results ?? []);

    if (!investments.length && !evtArr.length)
      return "Investment and operational events data are unavailable at present, sir.";

    const evtTokenSet = new Set(
      evtArr.flatMap(e =>
        `${e.title||""} ${e.body||""} ${e.description||""} ${e.source||""}`
          .toLowerCase().split(/\W+/).filter(t => t.length > 3)
      )
    );

    const signaled = investments.filter(inv => {
      const words = `${inv.name||""} ${inv.ticker||""} ${inv.description||""}`
        .toLowerCase().split(/\W+/).filter(t => t.length > 3);
      return words.some(w => evtTokenSet.has(w));
    });

    const pct = investments.length ? Math.round((signaled.length / investments.length) * 100) : 0;

    const brief = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Investment × Ops Events nexus: ${investments.length} holdings, ${evtArr.length} operational events, ${signaled.length} investments (${pct}%) correlated with active ops events. Provide a 2-sentence portfolio-operations coverage brief.`,
      }),
    }).then(r => r.ok ? r.json() : null).then(d => d?.response || d?.reply || "").catch(() => "");

    return (
      `Investment × Ops Events Nexus, sir. ${investments.length} holdings, ${evtArr.length} operational events. ` +
      `${signaled.length} investments (${pct}%) are correlated with active ops events; ${investments.length - signaled.length} are quiet. ` +
      (brief || "")
    ).trim();
  } catch {
    return "I was unable to retrieve the investment ops events nexus at this time, sir.";
  }
}

const PANEL = {
  position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
  zIndex: ZIDX + 10, width: "min(580px,95vw)",
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

function kw(str) {
  return str.toLowerCase().split(/\W+/).filter(t => t.length > 3);
}

function severityColor(sev) {
  if (!sev) return DIM;
  const s = sev.toUpperCase();
  if (s === "CRITICAL") return RED;
  if (s === "HIGH" || s === "WARNING") return AMB;
  if (s === "LOW" || s === "INFO") return GRN;
  return DIM;
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

export default function InvestmentOpsEventsNexus() {
  const [open, setOpen]       = useState(false);
  const [investments, setInvs] = useState([]);
  const [events, setEvts]     = useState([]);
  const [loading, setLoad]    = useState(false);
  const [err, setErr]         = useState(null);
  const [tab, setTab]         = useState("ALL");
  const [q, setQ]             = useState("");
  const [expanded, setExp]    = useState(null);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoad(true); setErr(null);
    try {
      const [ir, er] = await Promise.all([
        fetch(`${apiBase()}/entities/Investment`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/v1/ops/events`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const id = ir.ok ? await ir.json() : {};
      setInvs(Array.isArray(id) ? id : (id?.results ?? []));
      const ed = er.ok ? await er.json() : {};
      setEvts(Array.isArray(ed) ? ed : (ed?.results ?? []));
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
    window.addEventListener("jarvis:invops-toggle", h);
    return () => window.removeEventListener("jarvis:invops-toggle", h);
  }, []);

  const evtTokenSet = new Set(
    events.flatMap(e =>
      kw(`${e.title||""} ${e.body||""} ${e.description||""} ${e.source||""}`)
    )
  );

  const enriched = investments.map(inv => {
    const invWords = kw(`${inv.name||""} ${inv.ticker||""} ${inv.description||""}`);
    const hits = invWords.filter(w => evtTokenSet.has(w)).length;
    const matched = hits > 0
      ? events.filter(e => {
          const ew = new Set(kw(`${e.title||""} ${e.body||""} ${e.description||""} ${e.source||""}`));
          return invWords.some(w => ew.has(w));
        })
      : [];
    return { ...inv, hits, matched };
  });

  const signaled = enriched.filter(i => i.hits > 0);
  const quiet    = enriched.filter(i => i.hits === 0);
  const pct = investments.length ? Math.round((signaled.length / investments.length) * 100) : 0;

  const visible = enriched
    .filter(i => tab === "ALL" || (tab === "SIGNALED" ? i.hits > 0 : i.hits === 0))
    .filter(i => !q || (i.name||i.ticker||"").toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Investment × Ops Events coverage nexus"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: ZIDX,
          padding: "4px 10px", background: open ? CY : "rgba(5,8,13,0.75)",
          color: open ? "#04060A" : CY, border: `1px solid ${CY}`,
          borderRadius: 6, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
      >
        ◈ INVOPS
        {signaled.length > 0 && (
          <span style={{
            marginLeft: 5, background: AMB, color: "#04060A",
            borderRadius: 3, fontSize: 7, padding: "1px 4px", fontWeight: 700,
          }}>{signaled.length}</span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={HDR}>
            <span style={{ color: CY, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>
              ◈ Investment × Ops Events Nexus
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {["ALL","SIGNALED","QUIET"].map(t => (
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
              ["INVESTMENTS", investments.length, CY],
              ["OPS EVENTS",  events.length,      AMB],
              ["SIGNALED",    signaled.length,     GRN],
              ["QUIET",       quiet.length,        DIM],
              ["COVERAGE",    `${pct}%`,           pct >= 60 ? GRN : pct >= 30 ? AMB : RED],
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
            {err && <div style={{ color: RED, fontSize: 10 }}>⚠ {err}</div>}
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
                    background: inv.hits > 0 ? AMB : DIM,
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
                  {inv.hits > 0 ? (
                    <span style={{ fontSize: 8, color: AMB, minWidth: 44, textAlign: "right" }}>
                      {inv.hits} hit{inv.hits !== 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span style={{ fontSize: 8, color: DIM, minWidth: 44, textAlign: "right" }}>quiet</span>
                  )}
                </div>
                {expanded === i && (
                  <div style={{ padding: "6px 10px 6px 18px", background: "rgba(41,231,255,0.03)", borderRadius: 6, marginBottom: 4 }}>
                    {inv.description && (
                      <div style={{ fontSize: 10, color: "#DCEBF5", marginBottom: 6 }}>{inv.description}</div>
                    )}
                    {inv.matched.length > 0 ? (
                      <>
                        <div style={{ fontSize: 8, color: AMB, marginBottom: 4 }}>
                          ⚡ Correlated with {inv.matched.length} ops event{inv.matched.length !== 1 ? "s" : ""}:
                        </div>
                        {inv.matched.slice(0, 4).map((e, j) => (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            {e.severity && (
                              <span style={{
                                fontSize: 7, padding: "1px 5px", borderRadius: 3,
                                border: `1px solid ${severityColor(e.severity)}55`,
                                color: severityColor(e.severity),
                                textTransform: "uppercase", letterSpacing: 1,
                              }}>{e.severity}</span>
                            )}
                            <span style={{ fontSize: 9, color: "#DCEBF5" }}>
                              {e.title || e.id || "Unnamed Event"}
                            </span>
                          </div>
                        ))}
                        {inv.matched.length > 4 && (
                          <div style={{ fontSize: 8, color: DIM }}>+{inv.matched.length - 4} more</div>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: 9, color: DIM }}>No matching operational events</div>
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
            <span>Source: /entities/Investment × /v1/ops/events</span>
            <span style={{ color: loading ? AMB : GRN }}>
              {loading ? "◌ updating" : `${visible.length} shown · ${tab}`}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
