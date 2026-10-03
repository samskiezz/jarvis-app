/**
 * ReportContactTaskOwnership — F86.
 *
 * Triple-nexus: /v1/reports × /entities/Contact × /entities/Task
 *
 * Keyword-correlates each report against:
 *   - contacts (who could own or action it)
 *   - tasks    (what follow-up work already exists)
 *
 * Classification per report:
 *   FULLY_ACTIONED — matched ≥1 contact AND ≥1 task
 *   CONTACT_ONLY   — matched contact but no task
 *   TASK_ONLY      — matched task but no contact
 *   UNACTIONED     — no contact or task match (accountability gap)
 *
 * Stat tiles: REPORTS / CONTACTS / TASKS / FULLY ACTIONED / UNACTIONED
 * Filter tabs: ALL / FULLY_ACTIONED / CONTACT_ONLY / TASK_ONLY / UNACTIONED
 * List: reports sorted by classification (UNACTIONED first), each expandable.
 * Click ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence ownership brief + TTS.
 * 120s auto-refresh.
 *
 * Intent: "rctownx" / "report ownership" / "unactioned report" /
 *         "report contact" / "report task" / "accountability gap" /
 *         "report action" / "report accountability"
 *   → jarvis:rctownx-toggle + TTS via buildRctownxScript()
 *
 * Toggle: ◈ RCTOWNX at left:966500, bottom:8, zIndex:110.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const RED    = "#FF3D5A";
const PURPLE = "#A78BFA";
const BTN_LEFT   = 966500;
const REFRESH_MS = 120_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function normaliseReports(raw) {
  return normaliseArray(raw).map((r) => ({
    id: r.id || r.report_id || String(Math.random()),
    title: r.title || r.name || r.subject || "Untitled Report",
    category: r.category || r.type || r.kind || "",
    summary: r.summary || r.description || r.body || "",
  }));
}

function normaliseContacts(raw) {
  return normaliseArray(raw).map((c) => ({
    id: c.id || c.contact_id || String(Math.random()),
    name: c.name || c.full_name || "Unknown",
    role: c.role || c.title || c.position || "",
    org: c.org || c.organisation || c.organization || c.company || "",
  }));
}

function normaliseTasks(raw) {
  return normaliseArray(raw).map((t) => ({
    id: t.id || t.task_id || String(Math.random()),
    name: t.name || t.title || t.description || "Untitled Task",
    status: t.status || "unknown",
    priority: t.priority || "medium",
  }));
}

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
}

function overlap(aStr, bStr) {
  const ak = new Set(keywords(aStr));
  const bk = keywords(bStr);
  return bk.filter((w) => ak.has(w)).length;
}

function classify(contacts, tasks) {
  const hasC = contacts.length > 0;
  const hasT = tasks.length > 0;
  if (hasC && hasT) return "FULLY_ACTIONED";
  if (hasC) return "CONTACT_ONLY";
  if (hasT) return "TASK_ONLY";
  return "UNACTIONED";
}

const CLASS_ORDER = {
  UNACTIONED: 0,
  CONTACT_ONLY: 1,
  TASK_ONLY: 2,
  FULLY_ACTIONED: 3,
};

const CLASS_COLOR = {
  FULLY_ACTIONED: GREEN,
  CONTACT_ONLY:   CY,
  TASK_ONLY:      PURPLE,
  UNACTIONED:     RED,
};

// ─── exported intent helpers ──────────────────────────────────────────────────

const RCTOWNX_RE =
  /\brctownx\b|report.{0,10}ownership|unactioned.{0,10}report|report.{0,10}contact|report.{0,10}task|accountability.{0,10}gap|report.{0,10}action|report.{0,10}accountability/i;

export function isRctownxQuery(q) {
  return RCTOWNX_RE.test(q);
}

export async function buildRctownxScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [rRaw, cRaw, tRaw] = await Promise.all([
      fetch(`${base}/v1/reports`, { headers: hdr }).then((r) => r.json()).catch(() => []),
      fetch(`${base}/entities/Contact`, { headers: hdr }).then((r) => r.json()).catch(() => []),
      fetch(`${base}/entities/Task`, { headers: hdr }).then((r) => r.json()).catch(() => []),
    ]);
    const reports  = normaliseReports(rRaw);
    const contacts = normaliseContacts(cRaw);
    const tasks    = normaliseTasks(tRaw);
    const unactioned = reports.filter((rep) => {
      const haystack = `${rep.title} ${rep.category} ${rep.summary}`;
      const mc = contacts.filter((c) => overlap(haystack, `${c.name} ${c.role} ${c.org}`) > 0);
      const mt = tasks.filter((t) => overlap(haystack, `${t.name} ${t.status}`) > 0);
      return mc.length === 0 && mt.length === 0;
    });
    return (
      `Report Contact Task Ownership Nexus: ${reports.length} reports checked against ` +
      `${contacts.length} contacts and ${tasks.length} tasks. ` +
      `${unactioned.length} report${unactioned.length !== 1 ? "s" : ""} UNACTIONED — ` +
      `no contact owner or follow-up task found.` +
      (unactioned.length > 0
        ? ` Top gap: "${unactioned[0].title}".`
        : " All reports have coverage.")
    );
  } catch {
    return "RCTOWNX data unavailable.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ReportContactTaskOwnership() {
  const [visible, setVisible]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [rows, setRows]         = useState([]);
  const [contacts, setContacts] = useState([]);
  const [tasks, setTasks]       = useState([]);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [rRaw, cRaw, tRaw] = await Promise.all([
        fetch(`${base}/v1/reports`, { headers: hdr }).then((r) => r.json()).catch(() => []),
        fetch(`${base}/entities/Contact`, { headers: hdr }).then((r) => r.json()).catch(() => []),
        fetch(`${base}/entities/Task`, { headers: hdr }).then((r) => r.json()).catch(() => []),
      ]);
      const reps = normaliseReports(rRaw);
      const cons = normaliseContacts(cRaw);
      const tsks = normaliseTasks(tRaw);

      const enriched = reps.map((rep) => {
        const haystack = `${rep.title} ${rep.category} ${rep.summary}`;
        const mc = cons
          .map((c) => ({ ...c, score: overlap(haystack, `${c.name} ${c.role} ${c.org}`) }))
          .filter((c) => c.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        const mt = tsks
          .map((t) => ({ ...t, score: overlap(haystack, `${t.name} ${t.status}`) }))
          .filter((t) => t.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        return { ...rep, matchedContacts: mc, matchedTasks: mt, cls: classify(mc, mt) };
      });

      enriched.sort((a, b) => CLASS_ORDER[a.cls] - CLASS_ORDER[b.cls]);
      setRows(enriched);
      setContacts(cons);
      setTasks(tsks);
    } catch {
      // silently ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [visible, load]);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:rctownx-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rctownx-toggle", onToggle);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const script = await buildRctownxScript();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hdr },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = (d.answer || script).replace(/<<ACTION:[^>]*>>/g, "").trim();
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hdr },
        body: JSON.stringify({ text, voice: "ash" }),
      }).catch(() => {});
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      // ignore
    } finally {
      setAssessing(false);
    }
  }, []);

  const counts = {
    total:          rows.length,
    contacts:       contacts.length,
    tasks:          tasks.length,
    fullyActioned:  rows.filter((r) => r.cls === "FULLY_ACTIONED").length,
    unactioned:     rows.filter((r) => r.cls === "UNACTIONED").length,
  };

  const TABS = ["ALL", "FULLY_ACTIONED", "CONTACT_ONLY", "TASK_ONLY", "UNACTIONED"];

  const displayed = rows.filter((r) => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.title.toLowerCase().includes(q) && !r.category.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        title="Report × Contact × Task Ownership Nexus"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 110,
          background: "rgba(0,0,0,0.7)",
          border: `1px solid ${CY}`,
          color: CY,
          padding: "3px 8px",
          fontSize: 10,
          fontFamily: "monospace",
          cursor: "pointer",
          borderRadius: 3,
        }}
      >
        ◈ RCTOWNX
      </button>
    );
  }

  const TILE_STYLE = (col) => ({
    flex: "1 1 100px",
    background: "rgba(0,0,0,0.5)",
    border: `1px solid ${col}`,
    borderRadius: 4,
    padding: "6px 10px",
    textAlign: "center",
    minWidth: 90,
  });

  const BAR = (score, max, col) => (
    <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 2, height: 6, margin: "3px 0" }}>
      <div style={{ width: `${Math.min(100, (score / Math.max(max, 1)) * 100)}%`, background: col, height: "100%", borderRadius: 2 }} />
    </div>
  );

  return (
    <div
      style={{
        position: "fixed",
        top: 60,
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(860px, 96vw)",
        maxHeight: "82vh",
        background: "rgba(0,6,20,0.97)",
        border: `1px solid ${CY}`,
        borderRadius: 8,
        zIndex: 1110,
        display: "flex",
        flexDirection: "column",
        fontFamily: "monospace",
        color: "#c8d8f0",
        fontSize: 12,
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: `1px solid rgba(41,231,255,0.2)` }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 13 }}>◈ REPORT × CONTACT × TASK OWNERSHIP NEXUS</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={assess} disabled={assessing} style={{ background: assessing ? "rgba(0,200,120,0.15)" : "rgba(0,200,120,0.1)", border: `1px solid ${GREEN}`, color: GREEN, padding: "3px 10px", fontSize: 11, cursor: "pointer", borderRadius: 3 }}>
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button onClick={() => setVisible(false)} style={{ background: "none", border: "none", color: "#668", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", flexWrap: "wrap" }}>
        <div style={TILE_STYLE(CY)}>
          <div style={{ fontSize: 18, fontWeight: 700, color: CY }}>{counts.total}</div>
          <div style={{ fontSize: 9, color: "#8af" }}>REPORTS</div>
        </div>
        <div style={TILE_STYLE("#8af")}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#8af" }}>{counts.contacts}</div>
          <div style={{ fontSize: 9, color: "#8af" }}>CONTACTS</div>
        </div>
        <div style={TILE_STYLE(PURPLE)}>
          <div style={{ fontSize: 18, fontWeight: 700, color: PURPLE }}>{counts.tasks}</div>
          <div style={{ fontSize: 9, color: "#8af" }}>TASKS</div>
        </div>
        <div style={TILE_STYLE(GREEN)}>
          <div style={{ fontSize: 18, fontWeight: 700, color: GREEN }}>{counts.fullyActioned}</div>
          <div style={{ fontSize: 9, color: "#8af" }}>FULLY ACTIONED</div>
        </div>
        <div style={{
          ...TILE_STYLE(RED),
          animation: counts.unactioned > 0 ? "rctownx-pulse 2s ease-in-out infinite" : "none",
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: RED }}>{counts.unactioned}</div>
          <div style={{ fontSize: 9, color: "#8af" }}>UNACTIONED</div>
        </div>
      </div>

      {/* filter tabs + search */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 14px", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{ background: filter === t ? "rgba(41,231,255,0.15)" : "none", border: `1px solid ${filter === t ? CY : "#334"}`, color: filter === t ? CY : "#889", padding: "2px 8px", fontSize: 10, cursor: "pointer", borderRadius: 3 }}>
            {t.replace(/_/g, " ")}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title/category…"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid #334", color: "#cde", padding: "2px 8px", fontSize: 11, borderRadius: 3, marginLeft: "auto", width: 200 }}
        />
      </div>

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "6px 14px" }}>
        {loading && <div style={{ color: "#556", textAlign: "center", padding: 20 }}>Loading…</div>}
        {!loading && displayed.length === 0 && <div style={{ color: "#556", textAlign: "center", padding: 20 }}>No reports match.</div>}
        {displayed.map((rep) => {
          const isOpen = expanded === rep.id;
          const clsCol = CLASS_COLOR[rep.cls];
          const maxScore = Math.max(
            ...rep.matchedContacts.map((c) => c.score),
            ...rep.matchedTasks.map((t) => t.score),
            1,
          );
          return (
            <div key={rep.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", marginBottom: 4 }}>
              <div
                onClick={() => setExpanded(isOpen ? null : rep.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", cursor: "pointer" }}
              >
                <span style={{ color: clsCol, fontSize: 9, minWidth: 100, fontWeight: 700 }}>{rep.cls.replace(/_/g, " ")}</span>
                <span style={{ flex: 1, color: "#cde", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rep.title}</span>
                {rep.category && <span style={{ color: "#556", fontSize: 10, whiteSpace: "nowrap" }}>{rep.category}</span>}
                <span style={{ color: "#445", fontSize: 10 }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {isOpen && (
                <div style={{ padding: "4px 0 8px 16px" }}>
                  {rep.matchedContacts.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: CY, fontSize: 10, marginBottom: 3 }}>Matched contacts</div>
                      {rep.matchedContacts.map((c) => (
                        <div key={c.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#cde" }}>{c.name}</span>
                            <span style={{ color: "#556", fontSize: 10 }}>{c.role || c.org || ""}</span>
                          </div>
                          {BAR(c.score, maxScore, CY)}
                        </div>
                      ))}
                    </div>
                  )}
                  {rep.matchedTasks.length > 0 && (
                    <div>
                      <div style={{ color: PURPLE, fontSize: 10, marginBottom: 3 }}>Matched tasks</div>
                      {rep.matchedTasks.map((t) => (
                        <div key={t.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#cde" }}>{t.name}</span>
                            <span style={{ color: "#556", fontSize: 10 }}>{t.status}</span>
                          </div>
                          {BAR(t.score, maxScore, PURPLE)}
                        </div>
                      ))}
                    </div>
                  )}
                  {rep.matchedContacts.length === 0 && rep.matchedTasks.length === 0 && (
                    <div style={{ color: RED, fontSize: 10 }}>No contact or task match — accountability gap.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes rctownx-pulse {
          0%,100% { box-shadow: 0 0 4px ${RED}55; }
          50%      { box-shadow: 0 0 12px ${RED}cc; }
        }
      `}</style>
    </div>
  );
}
