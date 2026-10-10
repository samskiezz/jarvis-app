/**
 * F159 — Scenario × Task × Contact × Knowledge Operational Readiness Grid (STCKORG)
 *
 * Answers: "Which operational scenarios are fully resourced — matched to an
 *           active task, an assigned contact, AND backing knowledge — and
 *           which are flying blind with no support?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /v1/scenario/list   → operational playbooks (name/description/type/status)
 *   GET /entities/Task      → active missions    (name/description/status/priority)
 *   GET /entities/Contact   → personnel          (name/role/org/email/tags)
 *   GET /knowledge/         → KB articles        (title/content/tags/category)
 *
 * Classification per scenario (keyword correlation):
 *   FULLY_RESOURCED  — task + contact + knowledge (all three matched)
 *   DUAL_RESOURCED   — any two matched
 *   SINGLE_LINKED    — exactly one matched
 *   UNRESOURCED      — none matched (readiness gap)
 *
 * Stat tiles: SCENARIOS / TASKS / CONTACTS / KB ARTICLES + four class counts + READINESS%
 * Amber badge on UNRESOURCED count.
 * Coverage bar showing FULLY_RESOURCED + DUAL_RESOURCED share.
 * ▶ ASSESS READINESS: 2-sentence AI brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ STCKORG  at left:1031400, bottom:8, zIndex:220.
 * Event:   jarvis:stckorg-toggle
 * Voice:   "stckorg / scenario readiness / operational readiness grid /
 *           unresourced scenario / scenario staffing knowledge / scenario task contact"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const RED   = "#FF3B6B";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const TEAL  = "#00CFB4";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1031400;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of [
      "items","results","data","records","scenarios","tasks","contacts",
      "articles","knowledge","skills","entries","list",
    ]) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    const vals = Object.values(raw);
    if (vals.length === 1 && Array.isArray(vals[0])) return vals[0];
  }
  return [];
}

function words(item) {
  const s = [
    item.name, item.title, item.description, item.type, item.status,
    item.role, item.org, item.email, item.tags, item.category,
    item.content, item.summary, item.priority, item.label,
  ].filter(Boolean).join(" ").toLowerCase();
  return s.split(/\W+/).filter(w => w.length > 2);
}

function overlap(a, b) {
  const setA = new Set(words(a));
  let hits = 0;
  for (const w of words(b)) if (setA.has(w)) hits++;
  return hits;
}

function pct(hits, maxHits) {
  return maxHits ? Math.min(100, Math.round((hits / maxHits) * 100)) : 0;
}

// ─── exported helpers wired by JarvisBrain ───────────────────────────────────

const STCKORG_RE = /\b(stckorg|scenario\s+readiness|operational\s+readiness\s+grid|unresourced\s+scenario|scenario\s+staffing\s+knowledge|scenario\s+task\s+contact)\b/i;

export function isStckorgQuery(q) {
  return STCKORG_RE.test(q);
}

export async function buildStckorgScript() {
  const base = apiBase();
  const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
  const [scRaw, taskRaw, ctRaw, kbRaw] = await Promise.all([
    fetch(`${base}/v1/scenario/list`, { headers: h }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/Task`,    { headers: h }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/Contact`, { headers: h }).then(r => r.json()).catch(() => []),
    fetch(`${base}/knowledge/`,       { headers: h }).then(r => r.json()).catch(() => []),
  ]);
  const scenarios = normArr(scRaw);
  const tasks     = normArr(taskRaw);
  const contacts  = normArr(ctRaw);
  const articles  = normArr(kbRaw);

  let fullCount = 0;
  let unresCount = 0;
  for (const sc of scenarios) {
    const hasTask    = tasks.some(t => overlap(sc, t) > 0);
    const hasContact = contacts.some(c => overlap(sc, c) > 0);
    const hasKb      = articles.some(a => overlap(sc, a) > 0);
    const linked     = [hasTask, hasContact, hasKb].filter(Boolean).length;
    if (linked === 3) fullCount++;
    if (linked === 0) unresCount++;
  }
  const readPct = scenarios.length
    ? Math.round(((scenarios.length - unresCount) / scenarios.length) * 100) : 0;
  return `STCKORG Operational Readiness Grid online, sir. `
    + `Across ${scenarios.length} scenarios, ${fullCount} are FULLY_RESOURCED with matching tasks, contacts, and knowledge — `
    + `${unresCount} are completely UNRESOURCED, representing a ${100 - readPct}% readiness gap that requires immediate resource assignment.`;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function ScenarioTaskContactKnowledgeGrid() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [stats, setStats]       = useState({
    scenarios: 0, tasks: 0, contacts: 0, articles: 0,
    full: 0, dual: 0, single: 0, unres: 0,
  });
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [brief, setBrief]       = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const base = apiBase();
      const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const [scRaw, taskRaw, ctRaw, kbRaw] = await Promise.all([
        fetch(`${base}/v1/scenario/list`, { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/Task`,    { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/Contact`, { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/knowledge/`,       { headers: h }).then(r => r.json()).catch(() => []),
      ]);
      const scenarios = normArr(scRaw);
      const tasks     = normArr(taskRaw);
      const contacts  = normArr(ctRaw);
      const articles  = normArr(kbRaw);

      const built = scenarios.map(sc => {
        const taskMatches = tasks
          .map(t => ({ item: t, hits: overlap(sc, t) }))
          .filter(x => x.hits > 0)
          .sort((a, b) => b.hits - a.hits)
          .slice(0, 5);
        const contactMatches = contacts
          .map(c => ({ item: c, hits: overlap(sc, c) }))
          .filter(x => x.hits > 0)
          .sort((a, b) => b.hits - a.hits)
          .slice(0, 5);
        const kbMatches = articles
          .map(a => ({ item: a, hits: overlap(sc, a) }))
          .filter(x => x.hits > 0)
          .sort((a, b) => b.hits - a.hits)
          .slice(0, 5);
        const linked = [taskMatches.length > 0, contactMatches.length > 0, kbMatches.length > 0]
          .filter(Boolean).length;
        const cls = linked === 3 ? "FULLY_RESOURCED"
                  : linked === 2 ? "DUAL_RESOURCED"
                  : linked === 1 ? "SINGLE_LINKED"
                  :                "UNRESOURCED";
        return { sc, taskMatches, contactMatches, kbMatches, cls };
      });

      const full   = built.filter(r => r.cls === "FULLY_RESOURCED").length;
      const dual   = built.filter(r => r.cls === "DUAL_RESOURCED").length;
      const single = built.filter(r => r.cls === "SINGLE_LINKED").length;
      const unres  = built.filter(r => r.cls === "UNRESOURCED").length;

      setRows(built);
      setStats({ scenarios: scenarios.length, tasks: tasks.length,
                 contacts: contacts.length, articles: articles.length,
                 full, dual, single, unres });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:stckorg-toggle", h);
    return () => window.removeEventListener("jarvis:stckorg-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const readPct = stats.scenarios
        ? Math.round(((stats.scenarios - stats.unres) / stats.scenarios) * 100) : 0;
      const ctx = `Scenarios:${stats.scenarios} Tasks:${stats.tasks} Contacts:${stats.contacts} KB:${stats.articles} `
                + `FULLY_RESOURCED:${stats.full} DUAL_RESOURCED:${stats.dual} SINGLE_LINKED:${stats.single} UNRESOURCED:${stats.unres} READINESS:${readPct}%`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `STCKORG Operational Readiness Grid snapshot — ${ctx}. Provide a 2-sentence operational readiness assessment. Which unresourced scenarios represent the highest-priority resource gap and what corrective action should the operator take?` }),
      });
      const d = await r.json();
      const txt = d?.response || d?.message || d?.content || "Operational readiness assessment complete, sir.";
      setBrief(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setBrief("Operational readiness assessment complete, sir.");
    } finally {
      setAssessing(false);
    }
  }, [stats]);

  if (!open) {
    const unresCount = stats.unres;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Scenario × Task × Contact × Knowledge Operational Readiness Grid (STCKORG)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 220,
          background: "rgba(4,7,14,0.85)",
          border: `1px solid ${unresCount > 0 ? AMBER : CY}55`,
          color: unresCount > 0 ? AMBER : CY,
          cursor: "pointer", borderRadius: 4,
          padding: "3px 8px", fontSize: 9, fontFamily: MONO, letterSpacing: 1,
          backdropFilter: "blur(4px)", whiteSpace: "nowrap",
        }}
      >
        ◈ STCKORG
        {unresCount > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000", borderRadius: 3,
            padding: "0 4px", fontSize: 8,
          }}>{unresCount}</span>
        )}
      </button>
    );
  }

  const TABS = ["ALL", "FULLY_RESOURCED", "DUAL_RESOURCED", "SINGLE_LINKED", "UNRESOURCED"];
  const clsColor = {
    FULLY_RESOURCED: GREEN,
    DUAL_RESOURCED:  TEAL,
    SINGLE_LINKED:   AMBER,
    UNRESOURCED:     RED,
  };

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const hay = [r.sc.name, r.sc.description, r.sc.title, r.sc.type, r.sc.status]
        .filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const readinessPct = stats.scenarios
    ? Math.round(((stats.full + stats.dual) / stats.scenarios) * 100) : 0;

  return (
    <div style={{
      position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
      zIndex: 9000, width: "min(780px,95vw)", maxHeight: "85vh",
      background: BG, border: `1px solid ${CY}44`, borderRadius: 12,
      boxShadow: `0 0 60px ${CY}18`, fontFamily: MONO,
      display: "flex", flexDirection: "column",
    }}>
      {/* header */}
      <div style={{
        padding: "12px 18px 8px", borderBottom: `1px solid ${CY}22`,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ color: GREEN, fontSize: 16 }}>◎</span>
        <b style={{ color: CY, letterSpacing: 2, fontSize: 12 }}>STCKORG</b>
        <span style={{ color: MUTED, fontSize: 10 }}>
          Scenario × Task × Contact × Knowledge Operational Readiness Grid
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{ marginLeft: "auto", background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 16 }}
        >✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 18px", flexWrap: "wrap" }}>
        {[
          ["SCENARIOS",      stats.scenarios, CY],
          ["TASKS",          stats.tasks,     TEAL],
          ["CONTACTS",       stats.contacts,  AMBER],
          ["KB ARTICLES",    stats.articles,  GREEN],
          ["FULLY RES.",     stats.full,      GREEN],
          ["DUAL RES.",      stats.dual,      TEAL],
          ["SINGLE LINKED",  stats.single,    AMBER],
          ["UNRESOURCED",    stats.unres,     RED],
          ["READINESS",      `${readinessPct}%`, GREEN],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: `${col}11`, border: `1px solid ${col}33`,
            borderRadius: 6, padding: "4px 10px", textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: MUTED, fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* readiness coverage bar */}
      <div style={{ padding: "0 18px 8px" }}>
        <div style={{ height: 4, background: `${GREEN}15`, borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            width: `${readinessPct}%`, height: "100%",
            background: `linear-gradient(90deg,${RED},${AMBER},${GREEN})`,
            transition: "width 0.5s",
          }} />
        </div>
        <div style={{ fontSize: 9, color: MUTED, marginTop: 3 }}>
          {readinessPct}% of scenarios have ≥2 resources assigned
          (fully or dually resourced)
        </div>
      </div>

      {/* filter tabs + search */}
      <div style={{
        display: "flex", gap: 4, padding: "0 18px 8px",
        flexWrap: "wrap", alignItems: "center",
      }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${CY}22` : "none",
            border: `1px solid ${filter === t ? CY : CY + "33"}`,
            color: filter === t ? CY : MUTED, cursor: "pointer",
            borderRadius: 4, padding: "2px 8px", fontSize: 9,
            fontFamily: MONO, letterSpacing: 0.5,
          }}>{t}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search scenarios…"
          style={{
            marginLeft: "auto", background: "rgba(255,255,255,0.04)",
            border: `1px solid ${CY}33`, color: "#DCEBF5",
            borderRadius: 4, padding: "2px 8px", fontSize: 9,
            fontFamily: MONO, outline: "none", width: 160,
          }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 8px" }}>
        {loading && <div style={{ color: MUTED, fontSize: 10, padding: 8 }}>Loading operational readiness grid…</div>}
        {error   && <div style={{ color: RED,  fontSize: 10, padding: 8 }}>Error: {error}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color: MUTED, fontSize: 10, padding: 8 }}>
            No scenarios match the current filter.
          </div>
        )}

        {visible.map((row, i) => {
          const isExp = expanded === i;
          const cc    = clsColor[row.cls] || CY;
          const isPulsed = row.cls === "UNRESOURCED";
          return (
            <div
              key={i}
              style={{ borderBottom: `1px solid ${CY}11`, padding: "8px 0", cursor: "pointer" }}
              onClick={() => setExpanded(isExp ? null : i)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", background: cc, flexShrink: 0,
                  boxShadow: isPulsed ? `0 0 8px ${RED}` : "none",
                  animation: isPulsed ? "stckorgPulse 1.4s ease-in-out infinite" : "none",
                }} />
                <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>
                  {row.sc.name || row.sc.title || "(unnamed scenario)"}
                </span>
                <span style={{ fontSize: 8, color: MUTED, marginRight: 4 }}>
                  {row.sc.type || row.sc.status || ""}
                </span>
                <span style={{
                  fontSize: 8, letterSpacing: 1, color: cc,
                  background: `${cc}18`, border: `1px solid ${cc}44`,
                  borderRadius: 3, padding: "1px 6px",
                }}>{row.cls}</span>
                <span style={{ color: MUTED, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ marginTop: 8, paddingLeft: 16 }}>
                  {/* task matches */}
                  {row.taskMatches.length > 0 && (
                    <MatchSection
                      label="MATCHED TASKS"
                      color={TEAL}
                      matches={row.taskMatches}
                      nameKey={m => m.name || m.title || "(task)"}
                      badgeKey={m => m.status || m.priority || ""}
                    />
                  )}
                  {/* contact matches */}
                  {row.contactMatches.length > 0 && (
                    <MatchSection
                      label="MATCHED CONTACTS"
                      color={AMBER}
                      matches={row.contactMatches}
                      nameKey={m => m.name || m.email || "(contact)"}
                      badgeKey={m => m.role || m.org || ""}
                    />
                  )}
                  {/* kb matches */}
                  {row.kbMatches.length > 0 && (
                    <MatchSection
                      label="MATCHED KB ARTICLES"
                      color={GREEN}
                      matches={row.kbMatches}
                      nameKey={m => m.title || m.name || "(article)"}
                      badgeKey={m => m.category || m.tags || ""}
                    />
                  )}
                  {row.taskMatches.length === 0 &&
                   row.contactMatches.length === 0 &&
                   row.kbMatches.length === 0 && (
                    <div style={{ fontSize: 10, color: RED, paddingLeft: 4 }}>
                      No tasks, contacts, or knowledge articles linked — scenario is UNRESOURCED.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess + brief */}
      <div style={{
        borderTop: `1px solid ${CY}22`, padding: "10px 18px",
        display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap",
      }}>
        <button
          onClick={assess}
          disabled={assessing || rows.length === 0}
          style={{
            background: assessing ? "none" : `${GREEN}22`,
            border: `1px solid ${GREEN}55`,
            color: GREEN, cursor: assessing ? "default" : "pointer",
            borderRadius: 4, padding: "4px 14px", fontSize: 10,
            fontFamily: MONO, letterSpacing: 1,
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS READINESS"}
        </button>
        {brief && (
          <div style={{
            flex: 1, fontSize: 11, color: "#DCEBF5", lineHeight: 1.5, minWidth: 200,
          }}>{brief}</div>
        )}
      </div>

      <style>{`
        @keyframes stckorgPulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.8); opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

// ─── small sub-component for match sections ──────────────────────────────────

function MatchSection({ label, color, matches, nameKey, badgeKey }) {
  const maxHits = matches[0]?.hits || 1;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 9, color, letterSpacing: 1, marginBottom: 4 }}>
        {label} ({matches.length})
      </div>
      {matches.map((m, j) => {
        const p  = pct(m.hits, maxHits);
        const badge = badgeKey(m.item);
        return (
          <div key={j} style={{
            marginBottom: 4, padding: "4px 8px",
            background: `${color}08`, borderRadius: 4, border: `1px solid ${color}22`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {badge && (
                <span style={{
                  fontSize: 8, color, background: `${color}22`,
                  border: `1px solid ${color}55`, borderRadius: 3,
                  padding: "0 4px", letterSpacing: 1,
                }}>
                  {String(badge).slice(0, 20).toUpperCase()}
                </span>
              )}
              <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1 }}>
                {nameKey(m.item)}
              </span>
            </div>
            <div style={{ marginTop: 3, height: 3, background: `${color}22`, borderRadius: 2 }}>
              <div style={{
                width: `${p}%`, height: "100%", background: color,
                borderRadius: 2, transition: "width 0.4s",
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
