/**
 * ContactTaskKnowledgeTriple — F712
 *
 * Polls GET /entities/Contact + /entities/Task + /knowledge/ every 90 s.
 * 3-way keyword cross-reference:
 *   FULLY_GROUNDED — contact keywords appear in both a Task AND a Knowledge article
 *   TASK_ONLY      — contact keywords match Tasks but no Knowledge article
 *   KNOWLEDGE_ONLY — contact keywords match Knowledge but no Task
 *   DARK           — no Task or Knowledge match
 *
 * Voice intents: "ctkntri" | "contact task knowledge" | "task knowledge triple"
 *                | "grounded contacts" | "contact knowledge task" | "triple nexus contacts"
 * Strip button: ◈ CTKNTRI   left:888340  bottom:8  zIndex:247
 * Custom event: jarvis:ctkntri-toggle
 *
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const PRP = "#A855F7";
const AMB = "#FFB347";
const RED = "#e8203c";
const DIM = "#566878";
const POLL = 90_000;
const BTN_LEFT = 888340;
const ZIDX = 247;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CTKNTRI_RE =
  /\b(ctkntri|contact[.\s-]*task[.\s-]*knowledge|task[.\s-]*knowledge[.\s-]*triple|grounded[.\s-]*contacts?|contact[.\s-]*knowledge[.\s-]*task|triple[.\s-]*nexus[.\s-]*contacts?|contact[.\s-]*task[.\s-]*triple|knowledge[.\s-]*task[.\s-]*contacts?)\b/i;

export function isCtkntriQuery(q) {
  return CTKNTRI_RE.test(q || "");
}

export async function buildCtkntriScript() {
  try {
    const [cr, tr, kr] = await Promise.all([
      fetch(`${apiBase()}/entities/Contact`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/entities/Task`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/knowledge/`,        { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const contacts  = cr.ok ? ((await cr.json())?.results ?? []) : [];
    const tasks     = tr.ok ? ((await tr.json())?.results ?? []) : [];
    const articles  = kr.ok ? ((await kr.json())?.results ?? []) : [];

    if (!contacts.length) return "Contact data is unavailable at present, sir.";

    function kw(str) { return str.toLowerCase().split(/\W+/).filter(t => t.length > 3); }
    const taskSet = new Set(tasks.flatMap(t => kw(`${t.title||""} ${t.description||""} ${t.status||""}`)));
    const knoSet  = new Set(articles.flatMap(a => kw(`${a.title||""} ${a.summary||""} ${a.category||""}`)));

    let grounded = 0, taskOnly = 0, knoOnly = 0, dark = 0;
    for (const c of contacts) {
      const cw = kw(`${c.name||""} ${c.role||""} ${c.organisation||c.org||""} ${c.email||""}`);
      const hasTask = cw.some(w => taskSet.has(w));
      const hasKno  = cw.some(w => knoSet.has(w));
      if (hasTask && hasKno) grounded++;
      else if (hasTask)      taskOnly++;
      else if (hasKno)       knoOnly++;
      else                   dark++;
    }
    const pct = contacts.length ? Math.round((grounded / contacts.length) * 100) : 0;

    const brief = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Contact × Task × Knowledge triple nexus: ${contacts.length} contacts, ${tasks.length} tasks, ${articles.length} knowledge articles. FULLY_GROUNDED: ${grounded}, TASK_ONLY: ${taskOnly}, KNOWLEDGE_ONLY: ${knoOnly}, DARK: ${dark} (${pct}% coverage). Provide a 2-sentence operational brief.`,
      }),
    }).then(r => r.ok ? r.json() : null).then(d => d?.response || d?.reply || "").catch(() => "");

    return (
      `Contact × Task × Knowledge Triple Nexus, sir. ${contacts.length} contacts assessed against ${tasks.length} tasks and ${articles.length} knowledge articles. ` +
      `${grounded} fully grounded (${pct}%), ${taskOnly} task-only, ${knoOnly} knowledge-only, ${dark} dark. ` +
      (brief || "")
    ).trim();
  } catch {
    return "I was unable to retrieve the contact task knowledge triple at this time, sir.";
  }
}

const PANEL = {
  position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
  zIndex: ZIDX + 10, width: "min(600px,96vw)",
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

const TABS = ["ALL", "FULLY_GROUNDED", "TASK_ONLY", "KNOWLEDGE_ONLY", "DARK"];

function kw(str) { return str.toLowerCase().split(/\W+/).filter(t => t.length > 3); }

function statusColor(status) {
  if (!status) return DIM;
  const s = status.toLowerCase();
  if (s === "done" || s === "complete") return GRN;
  if (s === "in_progress" || s === "active") return CY;
  if (s === "blocked" || s === "failed")  return RED;
  return AMB;
}

function knoKindColor(kind) {
  if (!kind) return DIM;
  const k = kind.toLowerCase();
  if (k.includes("threat") || k.includes("risk"))   return RED;
  if (k.includes("intel") || k.includes("report"))  return PRP;
  if (k.includes("ops") || k.includes("procedure")) return CY;
  return GRN;
}

function classifyLabel(c) {
  if (c.hasTask && c.hasKno) return "FULLY_GROUNDED";
  if (c.hasTask)             return "TASK_ONLY";
  if (c.hasKno)              return "KNOWLEDGE_ONLY";
  return "DARK";
}

function classifyColor(label) {
  if (label === "FULLY_GROUNDED")  return GRN;
  if (label === "TASK_ONLY")       return CY;
  if (label === "KNOWLEDGE_ONLY")  return PRP;
  return DIM;
}

export default function ContactTaskKnowledgeTriple() {
  const [open, setOpen]    = useState(false);
  const [contacts, setCnts]= useState([]);
  const [tasks, setTasks]  = useState([]);
  const [articles, setArts]= useState([]);
  const [loading, setLoad] = useState(false);
  const [err, setErr]      = useState(null);
  const [tab, setTab]      = useState("ALL");
  const [q, setQ]          = useState("");
  const [expanded, setExp] = useState(null);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoad(true); setErr(null);
    try {
      const [cr, tr, kr] = await Promise.all([
        fetch(`${apiBase()}/entities/Contact`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/entities/Task`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/knowledge/`,        { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const cd = cr.ok ? await cr.json() : {};
      const td = tr.ok ? await tr.json() : {};
      const kd = kr.ok ? await kr.json() : {};
      setCnts(Array.isArray(cd) ? cd : (cd?.results ?? []));
      setTasks(Array.isArray(td) ? td : (td?.results ?? []));
      setArts(Array.isArray(kd) ? kd : (kd?.results ?? []));
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
    window.addEventListener("jarvis:ctkntri-toggle", h);
    return () => window.removeEventListener("jarvis:ctkntri-toggle", h);
  }, []);

  const taskTokenSet = new Set(tasks.flatMap(t =>
    kw(`${t.title||""} ${t.description||""} ${t.status||""}`)));
  const knoTokenSet  = new Set(articles.flatMap(a =>
    kw(`${a.title||""} ${a.summary||""} ${a.category||""}`)));

  const enriched = contacts.map(c => {
    const cWords = kw(`${c.name||""} ${c.role||""} ${c.organisation||c.org||""} ${c.email||""}`);
    const cSet   = new Set(cWords);
    const hasTask = cWords.some(w => taskTokenSet.has(w));
    const hasKno  = cWords.some(w => knoTokenSet.has(w));
    const label   = classifyLabel({ hasTask, hasKno });
    const matchedTasks = hasTask
      ? tasks.filter(t => kw(`${t.title||""} ${t.description||""} ${t.status||""}`).some(w => cSet.has(w)))
      : [];
    const matchedArts  = hasKno
      ? articles.filter(a => kw(`${a.title||""} ${a.summary||""} ${a.category||""}`).some(w => cSet.has(w)))
      : [];
    return { ...c, hasTask, hasKno, label, matchedTasks, matchedArts };
  });

  const grounded = enriched.filter(c => c.label === "FULLY_GROUNDED");
  const taskOnly = enriched.filter(c => c.label === "TASK_ONLY");
  const knoOnly  = enriched.filter(c => c.label === "KNOWLEDGE_ONLY");
  const dark     = enriched.filter(c => c.label === "DARK");
  const pct = contacts.length ? Math.round((grounded.length / contacts.length) * 100) : 0;

  const visible = enriched
    .filter(c => tab === "ALL" || c.label === tab)
    .filter(c => !q || (c.name||c.email||"").toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Contact × Task × Knowledge Triple Nexus"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: ZIDX,
          padding: "4px 10px", background: open ? CY : "rgba(5,8,13,0.75)",
          color: open ? "#04060A" : CY, border: `1px solid ${CY}`,
          borderRadius: 6, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
      >
        ◈ CTKNTRI
        {dark.length > 0 && (
          <span style={{
            marginLeft: 5, background: DIM, color: "#DCEBF5",
            borderRadius: 3, fontSize: 7, padding: "1px 4px", fontWeight: 700,
          }}>{dark.length}</span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={HDR}>
            <span style={{ color: CY, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>
              ◈ Contact × Task × Knowledge Triple
            </span>
            <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  fontSize: 7, padding: "2px 6px", borderRadius: 4,
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
              ["TASKS",           tasks.length,      AMB],
              ["ARTICLES",        articles.length,   PRP],
              ["FULLY_GROUNDED",  grounded.length,   GRN],
              ["COVERAGE",        `${pct}%`,         pct >= 60 ? GRN : pct >= 30 ? AMB : RED],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                flex: "1 1 80px", background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}18`, borderRadius: 8, padding: "6px 10px", textAlign: "center",
              }}>
                <div style={{ fontSize: 16, color: col, fontVariantNumeric: "tabular-nums" }}>{val}</div>
                <div style={{ fontSize: 7, color: DIM, letterSpacing: 1, marginTop: 2 }}>{label}</div>
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
          <div style={{ padding: "0 14px 10px", maxHeight: 320, overflowY: "auto" }}>
            {loading && !contacts.length && (
              <div style={{ color: DIM, fontSize: 10 }}>◌ Loading…</div>
            )}
            {err && <div style={{ color: RED, fontSize: 10 }}>⚠ {err}</div>}
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
                    background: classifyColor(c.label),
                  }} />
                  <span style={{
                    fontSize: 7, padding: "1px 5px", borderRadius: 3,
                    border: `1px solid ${classifyColor(c.label)}55`,
                    color: classifyColor(c.label), textTransform: "uppercase",
                    letterSpacing: 1, flexShrink: 0, minWidth: 70, textAlign: "center",
                  }}>{c.label.replace("_", " ")}</span>
                  <span style={{ flex: 1, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name || c.email || c.id || "Unknown"}
                  </span>
                  <span style={{ fontSize: 8, color: DIM, minWidth: 60, textAlign: "right" }}>
                    {c.matchedTasks.length}T · {c.matchedArts.length}K
                  </span>
                </div>

                {expanded === i && (
                  <div style={{ padding: "6px 10px 6px 18px", background: "rgba(41,231,255,0.03)", borderRadius: 6, marginBottom: 4 }}>
                    {(c.organisation || c.org) && (
                      <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>
                        Org: {c.organisation || c.org}
                      </div>
                    )}

                    {c.matchedTasks.length > 0 && (
                      <>
                        <div style={{ fontSize: 8, color: CY, marginBottom: 3 }}>
                          ✓ {c.matchedTasks.length} matched task{c.matchedTasks.length !== 1 ? "s" : ""}:
                        </div>
                        {c.matchedTasks.slice(0, 3).map((t, j) => (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            {t.status && (
                              <span style={{
                                fontSize: 7, padding: "1px 4px", borderRadius: 3,
                                border: `1px solid ${statusColor(t.status)}55`, color: statusColor(t.status),
                                textTransform: "uppercase", letterSpacing: 1,
                              }}>{t.status}</span>
                            )}
                            <span style={{ fontSize: 9, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {t.title || t.id || "Unnamed task"}
                            </span>
                          </div>
                        ))}
                        {c.matchedTasks.length > 3 && (
                          <div style={{ fontSize: 8, color: DIM }}>+{c.matchedTasks.length - 3} more tasks</div>
                        )}
                      </>
                    )}

                    {c.matchedArts.length > 0 && (
                      <>
                        <div style={{ fontSize: 8, color: PRP, marginTop: c.matchedTasks.length > 0 ? 6 : 0, marginBottom: 3 }}>
                          ✓ {c.matchedArts.length} matched article{c.matchedArts.length !== 1 ? "s" : ""}:
                        </div>
                        {c.matchedArts.slice(0, 3).map((a, j) => (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            {(a.kind || a.category) && (
                              <span style={{
                                fontSize: 7, padding: "1px 4px", borderRadius: 3,
                                border: `1px solid ${knoKindColor(a.kind||a.category)}55`,
                                color: knoKindColor(a.kind||a.category),
                                textTransform: "uppercase", letterSpacing: 1,
                              }}>{(a.kind||a.category).slice(0,10)}</span>
                            )}
                            <span style={{ fontSize: 9, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {a.title || a.id || "Unnamed article"}
                            </span>
                          </div>
                        ))}
                        {c.matchedArts.length > 3 && (
                          <div style={{ fontSize: 8, color: DIM }}>+{c.matchedArts.length - 3} more articles</div>
                        )}
                      </>
                    )}

                    {c.label === "DARK" && (
                      <div style={{ fontSize: 9, color: DIM }}>No Task or Knowledge article match.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!loading && !err && visible.length === 0 && (
              <div style={{ color: DIM, fontSize: 10 }}>No contacts match.</div>
            )}
          </div>

          <div style={{
            padding: "6px 14px", borderTop: `1px solid rgba(41,231,255,0.06)`,
            fontSize: 8, color: DIM, display: "flex", justifyContent: "space-between",
          }}>
            <span>Source: /entities/Contact × /entities/Task × /knowledge/</span>
            <span style={{ color: loading ? AMB : GRN }}>
              {loading ? "◌ updating" : `${visible.length} shown · ${tab}`}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
