/**
 * F163 — Investigation × Scenario × Contact × Dataset Full Intelligence Readiness Matrix (ISCDRIM)
 *
 * Answers: "Which investigations have scenario playbooks, assigned contacts, AND
 *           supporting datasets — and which are bare with none of those resources?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /v1/investigations   → open cases (title/description/status/priority/tags)
 *   GET /v1/scenario/list    → scenario playbooks (name/description/type/tags)
 *   GET /entities/Contact    → personnel (name/role/org/email/tags)
 *   GET /v1/datasets         → data sources (name/description/type/tags)
 *
 * Classification per investigation (keyword correlation, threshold ≥1):
 *   FULLY_EQUIPPED — matched a scenario AND a contact AND a dataset
 *   DUAL_EQUIPPED  — matched any two of the three resource types
 *   SINGLE_LINKED  — matched exactly one resource type
 *   BARE           — matched none (intelligence readiness gap)
 *
 * Stat tiles: INVESTIGATIONS / SCENARIOS / CONTACTS / DATASETS + four class counts + EQUIPPED%
 * Amber badge on BARE count.
 * Coverage bar.
 * ▶ ASSESS READINESS: 2-sentence AI brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ ISCDRIM  at left:1033640, bottom:8, zIndex:224.
 * Event:   jarvis:iscdrim-toggle
 * Voice:   "iscdrim / investigation readiness / investigation equipped /
 *           bare investigations / investigation full coverage / investigation resources"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const TEAL   = "#00CFB4";
const ORANGE = "#F97316";
const PURPLE = "#A259FF";
const MUTED  = "#6E8AA0";
const BG     = "rgba(4,7,14,0.96)";
const MONO   = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1033640;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const ISCDRIM_RE =
  /\b(iscdrim|investigation readiness|investigation equipped|bare investigations|investigation full coverage|investigation resources)\b/i;

// ─── helpers ─────────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of [
      "items","results","data","records","investigations","scenarios","contacts",
      "datasets","entries","list","members","skills",
    ]) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    const vals = Object.values(raw);
    if (vals.length === 1 && Array.isArray(vals[0])) return vals[0];
  }
  return [];
}

function words(obj) {
  return Object.values(obj || {})
    .filter(v => typeof v === "string")
    .join(" ")
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 3);
}

function overlap(a, b) {
  const wa = new Set(words(a));
  const wb = words(b);
  return wb.filter(w => wa.has(w)).length;
}

function classifyInv(inv, scenarios, contacts, datasets) {
  const thr = 1;
  const matchedScen = scenarios
    .map(s => ({ item: s, score: overlap(inv, s) }))
    .filter(x => x.score >= thr)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const matchedCont = contacts
    .map(c => ({ item: c, score: overlap(inv, c) }))
    .filter(x => x.score >= thr)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const matchedData = datasets
    .map(d => ({ item: d, score: overlap(inv, d) }))
    .filter(x => x.score >= thr)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const hasScen = matchedScen.length > 0;
  const hasCont = matchedCont.length > 0;
  const hasData = matchedData.length > 0;
  const count   = [hasScen, hasCont, hasData].filter(Boolean).length;

  let cls;
  if (count === 3)      cls = "FULLY_EQUIPPED";
  else if (count === 2) cls = "DUAL_EQUIPPED";
  else if (count === 1) cls = "SINGLE_LINKED";
  else                  cls = "BARE";

  return { ...inv, cls, matchedScen, matchedCont, matchedData };
}

// ─── exported voice helpers ───────────────────────────────────────────────────

export function isIscdrimQuery(q) {
  return ISCDRIM_RE.test(q || "");
}

export async function buildIscdrimScript() {
  const base = apiBase();
  const hdr  = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
  const [invR, scR, coR, dsR] = await Promise.all([
    fetch(`${base}/v1/investigations`,  { headers: hdr }),
    fetch(`${base}/v1/scenario/list`,   { headers: hdr }),
    fetch(`${base}/entities/Contact`,   { headers: hdr }),
    fetch(`${base}/v1/datasets`,        { headers: hdr }),
  ]);
  const [invD, scD, coD, dsD] = await Promise.all([invR.json(), scR.json(), coR.json(), dsR.json()]);
  const investigations = normArr(invD);
  const scenarios      = normArr(scD);
  const contacts       = normArr(coD);
  const datasets       = normArr(dsD);
  const classified     = investigations.map(i => classifyInv(i, scenarios, contacts, datasets));
  const bare           = classified.filter(x => x.cls === "BARE").length;
  const fully          = classified.filter(x => x.cls === "FULLY_EQUIPPED").length;
  const pct            = investigations.length ? Math.round((fully / investigations.length) * 100) : 0;
  const prompt =
    `We have ${investigations.length} investigations, ${scenarios.length} scenario playbooks, ` +
    `${contacts.length} contacts, ${datasets.length} datasets. ` +
    `${fully} investigations are fully equipped (scenario + contact + dataset), ${bare} are bare with no resources. ` +
    `Readiness coverage: ${pct}%. In 2 sentences: which bare investigations pose the greatest operational risk and why.`;
  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST", headers: hdr,
    body: JSON.stringify({ message: prompt }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
    `ISCDRIM online. ${bare} investigations are bare — no scenario playbook, contact, or dataset assigned. Readiness coverage is ${pct}%.`;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function InvestigationReadinessMatrix() {
  const [open, setOpen]               = useState(false);
  const [loading, setLoading]         = useState(false);
  const [investigations, setInvs]     = useState([]);
  const [scCount, setScCount]         = useState(0);
  const [coCount, setCoCount]         = useState(0);
  const [dsCount, setDsCount]         = useState(0);
  const [tab, setTab]                 = useState("ALL");
  const [search, setSearch]           = useState("");
  const [expanded, setExpanded]       = useState(null);
  const [assessing, setAssessing]     = useState(false);
  const [brief, setBrief]             = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const [invR, scR, coR, dsR] = await Promise.all([
        fetch(`${base}/v1/investigations`,  { headers: hdr }),
        fetch(`${base}/v1/scenario/list`,   { headers: hdr }),
        fetch(`${base}/entities/Contact`,   { headers: hdr }),
        fetch(`${base}/v1/datasets`,        { headers: hdr }),
      ]);
      const [invD, scD, coD, dsD] = await Promise.all([invR.json(), scR.json(), coR.json(), dsR.json()]);
      const rawInvs  = normArr(invD);
      const rawScen  = normArr(scD);
      const rawCont  = normArr(coD);
      const rawData  = normArr(dsD);
      setScCount(rawScen.length);
      setCoCount(rawCont.length);
      setDsCount(rawData.length);
      setInvs(rawInvs.map(i => classifyInv(i, rawScen, rawCont, rawData)));
    } catch {
      // keep previous state on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:iscdrim-toggle", onToggle);
    return () => window.removeEventListener("jarvis:iscdrim-toggle", onToggle);
  }, []);

  const counts = {
    FULLY_EQUIPPED: investigations.filter(x => x.cls === "FULLY_EQUIPPED").length,
    DUAL_EQUIPPED:  investigations.filter(x => x.cls === "DUAL_EQUIPPED").length,
    SINGLE_LINKED:  investigations.filter(x => x.cls === "SINGLE_LINKED").length,
    BARE:           investigations.filter(x => x.cls === "BARE").length,
  };
  const pct = investigations.length
    ? Math.round((counts.FULLY_EQUIPPED / investigations.length) * 100)
    : 0;

  const visible = investigations.filter(inv => {
    if (tab !== "ALL" && inv.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return JSON.stringify(inv).toLowerCase().includes(s);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const script = await buildIscdrimScript();
      setBrief(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch {
      setBrief("Unable to assess investigation readiness at this time, sir.");
    } finally {
      setAssessing(false);
    }
  }

  const clsColor = {
    FULLY_EQUIPPED: GREEN,
    DUAL_EQUIPPED:  TEAL,
    SINGLE_LINKED:  CY,
    BARE:           AMBER,
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 224,
          fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "3px 8px", borderRadius: 4, cursor: "pointer",
          background: open ? CY : "rgba(4,7,14,0.82)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}55`,
          boxShadow: open ? `0 0 14px ${CY}88` : "none",
        }}
      >
        ◈ ISCDRIM
        {counts.BARE > 0 && (
          <span style={{
            marginLeft: 5, background: AMBER, color: "#04060A",
            borderRadius: 10, padding: "1px 5px", fontSize: 9,
          }}>
            {counts.BARE}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
          background: "rgba(0,0,0,0.55)", zIndex: 2000, display: "flex",
          alignItems: "center", justifyContent: "center",
        }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div style={{
            width: "min(820px,96vw)", maxHeight: "88vh", overflowY: "auto",
            background: BG, border: `1px solid ${CY}44`, borderRadius: 14,
            padding: "20px 22px", fontFamily: MONO,
            boxShadow: `0 0 60px ${CY}22`,
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <span style={{ color: CY, fontWeight: 700, letterSpacing: 3, fontSize: 13 }}>◈ ISCDRIM</span>
                <span style={{ color: MUTED, fontSize: 11, marginLeft: 10 }}>
                  Investigation × Scenario × Contact × Dataset Readiness Matrix
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 18 }}
              >×</button>
            </div>

            {/* Stat tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 14 }}>
              {[
                { label: "INVESTIGATIONS", val: investigations.length, col: CY },
                { label: "SCENARIOS",      val: scCount,               col: TEAL },
                { label: "CONTACTS",       val: coCount,               col: ORANGE },
                { label: "DATASETS",       val: dsCount,               col: PURPLE },
              ].map(({ label, val, col }) => (
                <div key={label} style={{
                  background: "rgba(255,255,255,0.03)", borderRadius: 8,
                  border: `1px solid ${col}33`, padding: "8px 10px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: col }}>{val}</div>
                  <div style={{ fontSize: 9, color: MUTED, letterSpacing: 1 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Class count tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 14 }}>
              {[
                { label: "FULLY EQUIPPED", val: counts.FULLY_EQUIPPED, col: GREEN },
                { label: "DUAL EQUIPPED",  val: counts.DUAL_EQUIPPED,  col: TEAL },
                { label: "SINGLE LINKED",  val: counts.SINGLE_LINKED,  col: CY },
                { label: "BARE",           val: counts.BARE,           col: AMBER },
              ].map(({ label, val, col }) => (
                <div key={label} style={{
                  background: "rgba(255,255,255,0.02)", borderRadius: 8,
                  border: `1px solid ${col}33`, padding: "8px 10px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: col }}>{val}</div>
                  <div style={{ fontSize: 9, color: MUTED, letterSpacing: 1 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Coverage bar */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: MUTED, marginBottom: 4 }}>
                <span>READINESS COVERAGE</span>
                <span style={{ color: CY }}>{pct}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.07)" }}>
                <div style={{
                  height: "100%", borderRadius: 3, width: `${pct}%`,
                  background: `linear-gradient(90deg,${CY},${GREEN})`,
                  transition: "width .4s",
                }} />
              </div>
            </div>

            {/* Filter tabs + search */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {["ALL","FULLY_EQUIPPED","DUAL_EQUIPPED","SINGLE_LINKED","BARE"].map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: "3px 9px",
                  borderRadius: 4, cursor: "pointer", border: `1px solid ${CY}44`,
                  background: tab === t ? CY : "transparent",
                  color: tab === t ? "#04060A" : CY,
                }}>
                  {t.replace(/_/g, " ")}
                </button>
              ))}
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="search…"
                style={{
                  marginLeft: "auto", fontFamily: MONO, fontSize: 10, padding: "3px 8px",
                  borderRadius: 4, border: `1px solid ${CY}33`,
                  background: "rgba(255,255,255,0.04)", color: "#DCEBF5", width: 140,
                }}
              />
            </div>

            {/* List */}
            {loading && <div style={{ color: MUTED, fontSize: 11, textAlign: "center", padding: 16 }}>Loading…</div>}
            {!loading && visible.length === 0 && (
              <div style={{ color: MUTED, fontSize: 11, textAlign: "center", padding: 16 }}>No investigations match.</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {visible.map((inv, i) => {
                const id = inv.id || inv._id || i;
                const isExp = expanded === id;
                const col   = clsColor[inv.cls] || MUTED;
                const title = inv.title || inv.name || inv.case_name || `Investigation ${i + 1}`;
                return (
                  <div key={id} style={{
                    borderRadius: 8, border: `1px solid ${col}33`,
                    background: "rgba(255,255,255,0.02)", overflow: "hidden",
                  }}>
                    <div
                      onClick={() => setExpanded(isExp ? null : id)}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer" }}
                    >
                      <span style={{ fontSize: 9, letterSpacing: 1, color: col, border: `1px solid ${col}44`, padding: "1px 6px", borderRadius: 4 }}>
                        {inv.cls.replace(/_/g," ")}
                      </span>
                      <span style={{ fontSize: 12, color: "#DCEBF5", flex: 1 }}>{title}</span>
                      {inv.priority && (
                        <span style={{ fontSize: 9, color: MUTED }}>{inv.priority}</span>
                      )}
                      <span style={{ fontSize: 10, color: MUTED }}>{isExp ? "▲" : "▼"}</span>
                    </div>
                    {isExp && (
                      <div style={{ padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
                        {/* Scenarios */}
                        {inv.matchedScen.length > 0 && (
                          <div>
                            <div style={{ fontSize: 9, color: TEAL, letterSpacing: 1, marginBottom: 4 }}>SCENARIO PLAYBOOKS</div>
                            {inv.matchedScen.map((m, j) => {
                              const lbl = m.item.name || m.item.title || `Scenario ${j+1}`;
                              const bar = Math.min(100, m.score * 20);
                              return (
                                <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                                  <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1 }}>{lbl}</span>
                                  <div style={{ width: 60, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.07)" }}>
                                    <div style={{ height: "100%", borderRadius: 2, width: `${bar}%`, background: TEAL }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {/* Contacts */}
                        {inv.matchedCont.length > 0 && (
                          <div>
                            <div style={{ fontSize: 9, color: ORANGE, letterSpacing: 1, marginBottom: 4 }}>CONTACTS</div>
                            {inv.matchedCont.map((m, j) => {
                              const lbl = m.item.name || m.item.full_name || `Contact ${j+1}`;
                              const role = m.item.role || m.item.title || "";
                              const bar = Math.min(100, m.score * 20);
                              return (
                                <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                                  <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1 }}>{lbl}</span>
                                  {role && <span style={{ fontSize: 9, color: MUTED }}>{role}</span>}
                                  <div style={{ width: 60, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.07)" }}>
                                    <div style={{ height: "100%", borderRadius: 2, width: `${bar}%`, background: ORANGE }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {/* Datasets */}
                        {inv.matchedData.length > 0 && (
                          <div>
                            <div style={{ fontSize: 9, color: PURPLE, letterSpacing: 1, marginBottom: 4 }}>DATASETS</div>
                            {inv.matchedData.map((m, j) => {
                              const lbl = m.item.name || m.item.title || `Dataset ${j+1}`;
                              const bar = Math.min(100, m.score * 20);
                              return (
                                <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                                  <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1 }}>{lbl}</span>
                                  <div style={{ width: 60, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.07)" }}>
                                    <div style={{ height: "100%", borderRadius: 2, width: `${bar}%`, background: PURPLE }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {inv.matchedScen.length === 0 && inv.matchedCont.length === 0 && inv.matchedData.length === 0 && (
                          <div style={{ fontSize: 10, color: AMBER }}>No resource matches found.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Assess button + brief */}
            <div style={{ marginTop: 14, borderTop: `1px solid ${CY}22`, paddingTop: 12 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  fontFamily: MONO, fontSize: 10, letterSpacing: 1,
                  padding: "5px 14px", borderRadius: 4, cursor: assessing ? "not-allowed" : "pointer",
                  background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.15)",
                  color: CY, border: `1px solid ${CY}55`,
                }}
              >
                {assessing ? "Assessing…" : "▶ ASSESS READINESS"}
              </button>
              {brief && (
                <div style={{
                  marginTop: 10, fontSize: 11, color: "#DCEBF5", lineHeight: 1.55,
                  background: "rgba(41,231,255,0.05)", borderRadius: 6,
                  padding: "8px 12px", border: `1px solid ${CY}22`,
                }}>
                  {brief}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
