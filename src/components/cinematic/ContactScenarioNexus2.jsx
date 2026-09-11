/**
 * ContactScenarioNexus2 — F711
 *
 * Polls GET /entities/Contact + GET /v1/scenario/list every 90 s.
 * Cross-references: which contacts are SCENARIO-LINKED (≥1 scenario keyword
 * overlaps with contact name/role/org/email) vs UNLINKED (no scenario backing).
 *
 * Voice intents: "cntscn2" | "contact scenario nexus" | "scenario linked contacts"
 *                | "which contacts have scenarios" | "contact simulation2"
 *                | "contacts in scenarios" | "scenario contact map"
 * Strip button: ◈ CNTSCN2   left:887480  bottom:8  zIndex:246
 * Custom event: jarvis:cntscn2-toggle
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
const BTN_LEFT = 887480;
const ZIDX = 246;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CNTSCN2_RE =
  /\b(cntscn2|contact[.\s-]*scenario[.\s-]*nexus|scenario[.\s-]*linked[.\s-]*contact|which[.\s-]*contacts[.\s-]*have[.\s-]*scenarios|contact[.\s-]*simulation2|contacts[.\s-]*in[.\s-]*scenarios|scenario[.\s-]*contact[.\s-]*map)\b/i;

export function isCntscn2Query(q) {
  return CNTSCN2_RE.test(q || "");
}

export async function buildCntscn2Script() {
  try {
    const [cr, sr] = await Promise.all([
      fetch(`${apiBase()}/entities/Contact`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/scenario/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const contacts  = cr.ok ? ((await cr.json())?.results ?? []) : [];
    const scenarios = sr.ok ? ((await sr.json())?.results ?? []) : [];

    if (!contacts.length && !scenarios.length)
      return "Contact and scenario data are unavailable at present, sir.";

    const scnTokens = scenarios.flatMap(s =>
      `${s.name||""} ${s.description||""} ${s.kind||""}`
        .toLowerCase().split(/\W+/).filter(t => t.length > 3)
    );
    const scnSet = new Set(scnTokens);

    const linked = contacts.filter(c => {
      const words = `${c.name||""} ${c.role||""} ${c.organisation||c.org||""} ${c.email||""}`
        .toLowerCase().split(/\W+/).filter(t => t.length > 3);
      return words.some(w => scnSet.has(w));
    });

    const pct = contacts.length ? Math.round((linked.length / contacts.length) * 100) : 0;

    const brief = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: `Contact × Scenario nexus: ${contacts.length} contacts, ${scenarios.length} scenarios, ${linked.length} contacts scenario-linked (${pct}%). Provide a 2-sentence operational brief.` }),
    }).then(r => r.ok ? r.json() : null).then(d => d?.response || d?.reply || "").catch(() => "");

    return (
      `Contact × Scenario Nexus, sir. ${contacts.length} contacts, ${scenarios.length} scenarios. ` +
      `${linked.length} contacts (${pct}%) have scenario backing; ${contacts.length - linked.length} are unlinked. ` +
      (brief || "")
    ).trim();
  } catch {
    return "I was unable to retrieve the contact scenario nexus at this time, sir.";
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

function scoreContact(c, scnTokenSet) {
  const words = keywords(`${c.name||""} ${c.role||""} ${c.organisation||c.org||""} ${c.email||""}`);
  return words.filter(w => scnTokenSet.has(w)).length;
}

function kindColor(kind) {
  if (!kind) return DIM;
  const k = kind.toLowerCase();
  if (k.includes("threat") || k.includes("crisis")) return "#e8203c";
  if (k.includes("invest") || k.includes("financial")) return AMB;
  if (k.includes("ops") || k.includes("operation")) return CY;
  if (k.includes("intel") || k.includes("intelligence")) return "#a78bfa";
  return GRN;
}

export default function ContactScenarioNexus2() {
  const [open, setOpen]       = useState(false);
  const [contacts, setCnts]   = useState([]);
  const [scenarios, setScns]  = useState([]);
  const [loading, setLoad]    = useState(false);
  const [err, setErr]         = useState(null);
  const [tab, setTab]         = useState("ALL");
  const [q, setQ]             = useState("");
  const [expanded, setExp]    = useState(null);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoad(true); setErr(null);
    try {
      const [cr, sr] = await Promise.all([
        fetch(`${apiBase()}/entities/Contact`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/v1/scenario/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const cd = cr.ok ? await cr.json() : {};
      setCnts(Array.isArray(cd) ? cd : (cd?.results ?? []));
      setScns(sr.ok ? ((await sr.json())?.results ?? []) : []);
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
    window.addEventListener("jarvis:cntscn2-toggle", h);
    return () => window.removeEventListener("jarvis:cntscn2-toggle", h);
  }, []);

  const scnTokenSet = new Set(scenarios.flatMap(s =>
    keywords(`${s.name||""} ${s.description||""} ${s.kind||""}`)));

  const enriched = contacts.map(c => {
    const hits = scoreContact(c, scnTokenSet);
    const matched = hits > 0
      ? scenarios.filter(s => {
          const sw = keywords(`${s.name||""} ${s.description||""} ${s.kind||""}`);
          const cw = new Set(keywords(`${c.name||""} ${c.role||""} ${c.organisation||c.org||""} ${c.email||""}`));
          return sw.some(w => cw.has(w));
        })
      : [];
    return { ...c, hits, matched };
  });

  const linked   = enriched.filter(c => c.hits > 0);
  const unlinked = enriched.filter(c => c.hits === 0);
  const pct = contacts.length ? Math.round((linked.length / contacts.length) * 100) : 0;

  const visible = enriched
    .filter(c =>
      tab === "ALL" ||
      (tab === "SCENARIO-LINKED" ? c.hits > 0 : c.hits === 0)
    )
    .filter(c => !q || (c.name||c.email||"").toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Contact × Scenario Nexus"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: ZIDX,
          padding: "4px 10px", background: open ? CY : "rgba(5,8,13,0.75)",
          color: open ? "#04060A" : CY, border: `1px solid ${CY}`,
          borderRadius: 6, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
      >
        ◈ CNTSCN2
        {linked.length > 0 && (
          <span style={{
            marginLeft: 5, background: AMB, color: "#04060A",
            borderRadius: 3, fontSize: 7, padding: "1px 4px", fontWeight: 700,
          }}>{linked.length}</span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={HDR}>
            <span style={{ color: CY, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>
              ◈ Contact × Scenario Nexus
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {["ALL","SCENARIO-LINKED","UNLINKED"].map(t => (
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
              ["CONTACTS",        contacts.length,   CY],
              ["SCENARIOS",       scenarios.length,  AMB],
              ["SCENARIO-LINKED", linked.length,     GRN],
              ["UNLINKED",        unlinked.length,   "#e8203c"],
              ["COVERAGE",        `${pct}%`,         pct >= 60 ? GRN : pct >= 30 ? AMB : "#e8203c"],
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
              placeholder="Filter contacts…"
              style={{
                width: "100%", boxSizing: "border-box", background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}22`, borderRadius: 6, color: "#DCEBF5",
                fontFamily: "inherit", fontSize: 10, padding: "5px 9px", outline: "none",
              }}
            />
          </div>

          {/* List */}
          <div style={{ padding: "0 14px 10px", maxHeight: 300, overflowY: "auto" }}>
            {loading && !contacts.length && (
              <div style={{ color: DIM, fontSize: 10 }}>◌ Loading…</div>
            )}
            {err && <div style={{ color: "#e8203c", fontSize: 10 }}>⚠ {err}</div>}
            {visible.map((c, i) => (
              <div key={c.id || i}>
                <div
                  onClick={() => setExp(exp => exp === i ? null : i)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "5px 0",
                    borderBottom: "1px solid rgba(41,231,255,0.06)", cursor: "pointer",
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: c.hits > 0 ? GRN : "#e8203c",
                  }} />
                  {c.role && (
                    <span style={{
                      fontSize: 7, padding: "1px 4px", borderRadius: 3,
                      border: `1px solid ${CY}44`, color: CY,
                      textTransform: "uppercase", letterSpacing: 1, flexShrink: 0,
                    }}>{c.role.slice(0,12)}</span>
                  )}
                  <span style={{ flex: 1, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name || c.email || c.id || "Unknown"}
                  </span>
                  {c.hits > 0 && (
                    <span style={{ fontSize: 8, color: GRN, minWidth: 44, textAlign: "right" }}>
                      {c.hits} hit{c.hits !== 1 ? "s" : ""}
                    </span>
                  )}
                  {c.hits === 0 && (
                    <span style={{ fontSize: 8, color: DIM, minWidth: 44, textAlign: "right" }}>—</span>
                  )}
                </div>
                {expanded === i && (
                  <div style={{ padding: "6px 10px 6px 18px", background: "rgba(41,231,255,0.03)", borderRadius: 6, marginBottom: 4 }}>
                    {(c.organisation || c.org) && (
                      <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>
                        Org: {c.organisation || c.org}
                      </div>
                    )}
                    {c.matched.length > 0 ? (
                      <>
                        <div style={{ fontSize: 8, color: GRN, marginBottom: 4 }}>
                          ✓ Linked to {c.matched.length} scenario{c.matched.length !== 1 ? "s" : ""}:
                        </div>
                        {c.matched.slice(0, 4).map((s, j) => (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            {s.kind && (
                              <span style={{
                                fontSize: 7, padding: "1px 5px", borderRadius: 3,
                                border: `1px solid ${kindColor(s.kind)}55`, color: kindColor(s.kind),
                                textTransform: "uppercase", letterSpacing: 1,
                              }}>{s.kind}</span>
                            )}
                            <span style={{ fontSize: 9, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {s.name || s.id || "Unnamed scenario"}
                            </span>
                          </div>
                        ))}
                        {c.matched.length > 4 && (
                          <div style={{ fontSize: 8, color: DIM }}>+{c.matched.length - 4} more</div>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: 9, color: DIM }}>Not scenario-linked</div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!loading && !err && visible.length === 0 && (
              <div style={{ color: DIM, fontSize: 10 }}>No contacts match.</div>
            )}
          </div>

          <div style={{ padding: "6px 14px", borderTop: `1px solid rgba(41,231,255,0.06)`, fontSize: 8, color: DIM, display: "flex", justifyContent: "space-between" }}>
            <span>Source: /entities/Contact × /v1/scenario/list</span>
            <span style={{ color: loading ? AMB : GRN }}>
              {loading ? "◌ updating" : `${visible.length} shown · ${tab}`}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
