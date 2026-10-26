/**
 * OpsAlertContactDatasetTaskSkillMatrix — F201
 * Fetches /v1/ops/alerts + /entities/Contact + /v1/datasets + /entities/Task + /v1/aip/skill
 * Cross-references each ops alert against all 4 other sources.
 * Classifies:
 *   COVERED   — alert matched a contact owner, a dataset, a task, AND a skill
 *   MANAGED   — alert matched 2-3 of the 4 sources
 *   PARTIAL   — alert matched exactly 1 source
 *   BLIND     — alert has 0 matches (no owner, no data, no task, no capability)
 * Red pulse on BLIND count (fully undefended incidents).
 * ASSESS → /v1/jarvis/agent/chat advisory for blind alerts + TTS.
 * Voice triggers: "incident matrix"/"ocdtsa"/"blind alerts"/"ops coverage"/"alert response authority"
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const RED = "#FF4D6D";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const PRP = "#B485FF";
const POLL = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const OCDTSA_RE =
  /\b(incident\.matrix|ocdtsa|blind\.alerts|ops\.coverage|alert\.response\.authority|ops\.alert\.contact|alert\.authority|incident\.response\.matrix|alert\.skill|ocdtsa\.toggle)\b/i;

export function isOcdtsaQuery(t) { return OCDTSA_RE.test(t || ""); }

export function buildOcdtsaScript(rows) {
  const blind = rows.filter(r => r.cls === "BLIND");
  if (!blind.length) return "All ops alerts have at least one response capability grounded. No fully blind incidents detected.";
  return `You are JARVIS. ${blind.length} ops alert(s) are BLIND — they have no matched contact owner, no supporting dataset, no assigned task, and no matching skill. List each blind alert by title and severity. Then provide a 2-sentence incident response authority advisory: what contacts, datasets, tasks, or skills should be linked to each blind alert to establish minimum response coverage. Be direct and specific.`;
}

const hdrs = { Authorization: `Bearer ${API_KEY}` };

async function fetchOpsAlerts() {
  const r = await fetch(`${apiBase()}/v1/ops/alerts`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.alerts) ? d.alerts :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data :
    Array.isArray(d?.results) ? d.results : [];
  return items.map(a => ({
    id: a.id || a._id || String(Math.random()),
    name: (a.title || a.name || a.message || a.description || "").toString(),
    severity: a.severity || a.level || a.priority || "",
  }));
}

async function fetchContacts() {
  const r = await fetch(`${apiBase()}/entities/Contact`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data :
    Array.isArray(d?.results) ? d.results : [];
  return items.map(c => ({
    id: c.id || c._id || String(Math.random()),
    name: (c.name || c.full_name || c.display_name || "").toString(),
    role: c.role || c.title || c.position || "",
    org: c.org || c.organization || c.company || "",
  }));
}

async function fetchDatasets() {
  const r = await fetch(`${apiBase()}/v1/datasets`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.datasets) ? d.datasets :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(ds => ({
    id: ds.id || ds._id || String(Math.random()),
    name: (ds.name || ds.title || ds.dataset_name || "").toString(),
    rows: ds.row_count || ds.rows || ds.count || null,
  }));
}

async function fetchTasks() {
  const r = await fetch(`${apiBase()}/entities/Task`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data :
    Array.isArray(d?.results) ? d.results : [];
  return items.map(t => ({
    id: t.id || t._id || String(Math.random()),
    name: (t.title || t.name || t.task_name || t.description || "").toString(),
    status: t.status || t.state || "",
  }));
}

async function fetchSkills() {
  const r = await fetch(`${apiBase()}/v1/aip/skill`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.skills) ? d.skills :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(s => ({
    id: s.id || s._id || String(Math.random()),
    name: (s.name || s.title || s.skill_name || "").toString(),
    score: typeof s.score === "number" ? s.score :
           typeof s.proficiency === "number" ? s.proficiency : null,
  }));
}

function keywords(str) {
  return str.toLowerCase().split(/[\s\-_/.,;:()[\]]+/).filter(w => w.length > 2);
}

function overlap(a, b) {
  const ka = keywords(a);
  const kb = keywords(b);
  return ka.some(w => kb.includes(w));
}

function classify(alert, contacts, datasets, tasks, skills) {
  const matchedContacts = contacts.filter(c => overlap(alert.name, c.name) || overlap(alert.name, c.role));
  const matchedDatasets = datasets.filter(d => overlap(alert.name, d.name));
  const matchedTasks    = tasks.filter(t => overlap(alert.name, t.name));
  const matchedSkills   = skills.filter(s => overlap(alert.name, s.name));
  const hitCount =
    (matchedContacts.length > 0 ? 1 : 0) +
    (matchedDatasets.length > 0 ? 1 : 0) +
    (matchedTasks.length    > 0 ? 1 : 0) +
    (matchedSkills.length   > 0 ? 1 : 0);
  let cls;
  if (hitCount === 4)      cls = "COVERED";
  else if (hitCount >= 2)  cls = "MANAGED";
  else if (hitCount === 1) cls = "PARTIAL";
  else                     cls = "BLIND";
  return { ...alert, cls, matchedContacts, matchedDatasets, matchedTasks, matchedSkills };
}

const SEVERITY_COLOR = s => {
  const sl = (s || "").toLowerCase();
  if (sl === "critical") return RED;
  if (sl === "high")     return RED;
  if (sl === "medium")   return AMB;
  return CY;
};

const STATUS_COLOR = s => {
  const sl = (s || "").toLowerCase();
  if (sl === "completed" || sl === "done") return GRN;
  if (sl === "in_progress" || sl === "active") return CY;
  if (sl === "blocked") return RED;
  return AMB;
};

const CLS_COLOR = {
  COVERED: GRN,
  MANAGED: CY,
  PARTIAL: AMB,
  BLIND:   RED,
};

export default function OpsAlertContactDatasetTaskSkillMatrix() {
  const [open, setOpen]   = useState(false);
  const [rows, setRows]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [filter, setFilter] = useState("ALL");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [alerts, contacts, datasets, tasks, skills] = await Promise.all([
        fetchOpsAlerts(),
        fetchContacts(),
        fetchDatasets(),
        fetchTasks(),
        fetchSkills(),
      ]);
      setRows(alerts.map(a => classify(a, contacts, datasets, tasks, skills)));
    } catch (e) {
      setError(e.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:ocdtsa-toggle", h);
    return () => window.removeEventListener("jarvis:ocdtsa-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    const script = buildOcdtsaScript(rows);
    const base = apiBase();
    try {
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdrs, "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || d.text || "";
      if (text) {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { ...hdrs, "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: "onyx" }),
        });
      }
    } catch (_) { /* TTS best-effort */ }
  }, [rows]);

  if (!open) {
    const blindCount = rows.filter(r => r.cls === "BLIND").length;
    return (
      <div style={{ position: "fixed", left: 160360, bottom: 8, zIndex: 297,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        {blindCount > 0 && (
          <div style={{ background: RED, color: "#000", fontSize: 9, fontWeight: 700,
            borderRadius: 6, padding: "1px 5px", animation: "pulse 1.5s infinite",
            boxShadow: `0 0 6px ${RED}` }}>
            {blindCount}
          </div>
        )}
        <button onClick={() => setOpen(true)} style={{
          background: "transparent", border: `1px solid ${CY}`, color: CY,
          fontSize: 10, fontFamily: "monospace", padding: "3px 7px",
          cursor: "pointer", borderRadius: 4, letterSpacing: 1,
          boxShadow: `0 0 6px ${CY}44`, whiteSpace: "nowrap",
        }}>◈ OCDTSA</button>
      </div>
    );
  }

  const displayed = filter === "ALL" ? rows : rows.filter(r => r.cls === filter);
  const counts = { COVERED: 0, MANAGED: 0, PARTIAL: 0, BLIND: 0 };
  rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + 1; });

  return (
    <div style={{ position: "fixed", left: 160360, bottom: 8, zIndex: 297,
      width: 420, background: "#0A0F1A", border: `1px solid ${CY}55`,
      borderRadius: 8, fontFamily: "monospace", fontSize: 11, color: CY,
      boxShadow: `0 0 18px ${CY}22`, maxHeight: 540, display: "flex",
      flexDirection: "column" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 10px", borderBottom: `1px solid ${CY}33`, flexShrink: 0 }}>
        <span style={{ fontWeight: 700, letterSpacing: 1 }}>◈ OCDTSA</span>
        <span style={{ fontSize: 9, color: "#ffffff66" }}>Alert × Contact × Dataset × Task × Skill</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={assess} style={{ background: `${CY}22`, border: `1px solid ${CY}`,
            color: CY, fontSize: 9, padding: "2px 7px", cursor: "pointer",
            borderRadius: 3, letterSpacing: 1 }}>▶ ASSESS</button>
          <button onClick={() => setOpen(false)} style={{ background: "transparent",
            border: `1px solid ${CY}44`, color: CY, fontSize: 10,
            padding: "1px 6px", cursor: "pointer", borderRadius: 3 }}>✕</button>
        </div>
      </div>

      {/* Stat row */}
      <div style={{ display: "flex", gap: 6, padding: "6px 10px",
        borderBottom: `1px solid ${CY}22`, flexShrink: 0, flexWrap: "wrap" }}>
        {Object.entries(counts).map(([cls, n]) => (
          <button key={cls} onClick={() => setFilter(filter === cls ? "ALL" : cls)}
            style={{ background: filter === cls ? `${CLS_COLOR[cls]}22` : "transparent",
              border: `1px solid ${CLS_COLOR[cls]}`,
              color: CLS_COLOR[cls], fontSize: 9, padding: "2px 7px",
              cursor: "pointer", borderRadius: 3, letterSpacing: 1,
              boxShadow: cls === "BLIND" && n > 0 ? `0 0 8px ${RED}` : "none" }}>
            {cls} {n}
          </button>
        ))}
        <button onClick={load} disabled={loading}
          style={{ marginLeft: "auto", background: "transparent",
            border: `1px solid ${CY}44`, color: CY, fontSize: 9,
            padding: "2px 6px", cursor: "pointer", borderRadius: 3 }}>
          {loading ? "…" : "↻"}
        </button>
      </div>

      {/* Body */}
      <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
        {error && (
          <div style={{ color: RED, padding: "6px 10px", fontSize: 10 }}>
            {error}
          </div>
        )}
        {!error && displayed.length === 0 && !loading && (
          <div style={{ color: "#ffffff44", padding: "10px", textAlign: "center" }}>
            No data
          </div>
        )}
        {displayed.map(row => (
          <div key={row.id}>
            <div onClick={() => setExpanded(e => ({ ...e, [row.id]: !e[row.id] }))}
              style={{ display: "flex", alignItems: "center", gap: 6,
                padding: "5px 10px", cursor: "pointer",
                background: expanded[row.id] ? `${CLS_COLOR[row.cls]}11` : "transparent",
                borderBottom: `1px solid ${CY}11` }}>
              <span style={{ color: CLS_COLOR[row.cls], fontSize: 9, minWidth: 52,
                border: `1px solid ${CLS_COLOR[row.cls]}66`, padding: "1px 4px",
                borderRadius: 3, letterSpacing: 0.5, textAlign: "center" }}>
                {row.cls}
              </span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap" }}>{row.name || row.id}</span>
              {row.severity && (
                <span style={{ fontSize: 9, color: SEVERITY_COLOR(row.severity),
                  border: `1px solid ${SEVERITY_COLOR(row.severity)}44`,
                  padding: "1px 4px", borderRadius: 3 }}>{row.severity}</span>
              )}
              <span style={{ color: `${CY}66`, fontSize: 9 }}>
                {expanded[row.id] ? "▲" : "▼"}
              </span>
            </div>
            {expanded[row.id] && (
              <div style={{ padding: "4px 14px 8px 20px",
                background: `${CLS_COLOR[row.cls]}08`,
                borderBottom: `1px solid ${CY}11` }}>
                {/* Contacts */}
                {row.matchedContacts.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ color: "#ffffff55", fontSize: 9, marginBottom: 2 }}>
                      Contacts ({row.matchedContacts.length})
                    </div>
                    {row.matchedContacts.slice(0, 3).map(c => (
                      <div key={c.id} style={{ display: "flex", gap: 4,
                        alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontSize: 9, color: GRN,
                          border: `1px solid ${GRN}55`, padding: "1px 4px",
                          borderRadius: 3, maxWidth: 70, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.role || c.org || "?"}
                        </span>
                        <span style={{ color: CY, fontSize: 9, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.name || c.id}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Datasets */}
                {row.matchedDatasets.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ color: "#ffffff55", fontSize: 9, marginBottom: 2 }}>
                      Datasets ({row.matchedDatasets.length})
                    </div>
                    {row.matchedDatasets.slice(0, 3).map(ds => (
                      <div key={ds.id} style={{ display: "flex", gap: 4,
                        alignItems: "center", marginBottom: 2 }}>
                        {ds.rows != null && (
                          <span style={{ fontSize: 9, color: AMB,
                            border: `1px solid ${AMB}55`, padding: "1px 4px",
                            borderRadius: 3, minWidth: 36, textAlign: "center" }}>
                            {ds.rows}r
                          </span>
                        )}
                        <span style={{ color: CY, fontSize: 9, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {ds.name || ds.id}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Tasks */}
                {row.matchedTasks.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ color: "#ffffff55", fontSize: 9, marginBottom: 2 }}>
                      Tasks ({row.matchedTasks.length})
                    </div>
                    {row.matchedTasks.slice(0, 3).map(t => (
                      <div key={t.id} style={{ display: "flex", gap: 4,
                        alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontSize: 9, color: STATUS_COLOR(t.status),
                          border: `1px solid ${STATUS_COLOR(t.status)}55`,
                          padding: "1px 4px", borderRadius: 3, minWidth: 60,
                          textAlign: "center", overflow: "hidden",
                          textOverflow: "ellipsis", maxWidth: 76 }}>
                          {t.status || "?"}
                        </span>
                        <span style={{ color: CY, fontSize: 9, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.name || t.id}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Skills */}
                {row.matchedSkills.length > 0 && (
                  <div>
                    <div style={{ color: "#ffffff55", fontSize: 9, marginBottom: 2 }}>
                      Skills ({row.matchedSkills.length})
                    </div>
                    {row.matchedSkills.slice(0, 3).map(s => (
                      <div key={s.id} style={{ display: "flex", gap: 4,
                        alignItems: "center", marginBottom: 2 }}>
                        {s.score != null && (
                          <span style={{ fontSize: 9, color: PRP,
                            border: `1px solid ${PRP}55`, padding: "1px 4px",
                            borderRadius: 3, minWidth: 30, textAlign: "center" }}>
                            {s.score}
                          </span>
                        )}
                        <span style={{ color: CY, fontSize: 9, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.name || s.id}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {row.matchedContacts.length === 0 && row.matchedDatasets.length === 0 &&
                 row.matchedTasks.length === 0 && row.matchedSkills.length === 0 && (
                  <div style={{ color: RED, fontSize: 9 }}>
                    No matching response authority found for this alert.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: "4px 10px", borderTop: `1px solid ${CY}22`,
        fontSize: 9, color: "#ffffff44", flexShrink: 0, display: "flex",
        justifyContent: "space-between" }}>
        <span>OpsAlert × Contact × Dataset × Task × Skill</span>
        <span>90s auto-refresh</span>
      </div>
    </div>
  );
}
