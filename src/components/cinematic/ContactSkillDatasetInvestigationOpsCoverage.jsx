/**
 * ContactSkillDatasetInvestigationOpsCoverage — F194
 * Fetches /entities/Contact + /v1/aip/skill + /v1/datasets +
 * /v1/investigations + /v1/ops/alerts and cross-references each contact
 * against all 4 other sources.
 * Classifies:
 *   READY   — contact has 4 cross-source matches (personnel fully backed)
 *   SKILLED — contact has 2–3 matches
 *   PARTIAL — contact has 1 match
 *   DARK    — contact has 0 matches (no skill, no dataset, no investigation, no alert)
 * Red pulse on DARK count.
 * ASSESS → /v1/jarvis/agent/chat advisory for dark contacts + TTS.
 * Voice triggers: "contact readiness"/"cidio"/"personnel readiness"/
 *   "personnel coverage"/"contact coverage"/"dark contacts"
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

const CIDIO_RE =
  /\b(contact.readiness|cidio|personnel.readiness|personnel.coverage|contact.coverage|dark.contacts?|contact.skill.dataset|personnel.intel|cidio.toggle)\b/i;

export function isCidioQuery(t) { return CIDIO_RE.test(t || ""); }

export function buildCidioScript(rows) {
  const dark = rows.filter(r => r.cls === "DARK");
  if (!dark.length) return "All contacts have at least one supporting intelligence resource. No personnel blind spots detected.";
  return `You are JARVIS. ${dark.length} contact(s) are DARK — they have no matched skill, no supporting dataset, no active investigation, and no ops alert coverage. List each dark contact by name and role. Then provide a 2-sentence personnel readiness advisory: what intelligence resources should be linked or assigned to activate each contact operationally. Be direct and specific.`;
}

const hdrs = { Authorization: `Bearer ${API_KEY}` };

async function fetchContacts() {
  const r = await fetch(`${apiBase()}/entities/Contact`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.contacts) ? d.contacts :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(c => ({
    id: c.id || c._id || String(Math.random()),
    name: (c.name || c.full_name || c.title || "").toString(),
    role: c.role || c.position || c.job_title || "",
    org: c.org || c.organisation || c.organization || c.company || "",
  }));
}

async function fetchSkills() {
  const r = await fetch(`${apiBase()}/v1/aip/skill`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.skills) ? d.skills :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(s => ({
    id: s.id || s._id || String(Math.random()),
    name: (s.name || s.title || s.skill || "").toString(),
    score: typeof s.score === "number" ? s.score :
           typeof s.level === "number" ? s.level : null,
  }));
}

async function fetchDatasets() {
  const r = await fetch(`${apiBase()}/v1/datasets`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.datasets) ? d.datasets :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(ds => ({
    id: ds.id || ds._id || String(Math.random()),
    name: (ds.name || ds.title || "").toString(),
    rows: typeof ds.rows === "number" ? ds.rows :
          typeof ds.row_count === "number" ? ds.row_count :
          typeof ds.count === "number" ? ds.count : null,
  }));
}

async function fetchInvestigations() {
  const r = await fetch(`${apiBase()}/v1/investigations`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.investigations) ? d.investigations :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(i => ({
    id: i.id || i._id || String(Math.random()),
    name: (i.title || i.name || i.subject || "").toString(),
    status: i.status || i.state || "",
  }));
}

async function fetchOpsAlerts() {
  const r = await fetch(`${apiBase()}/v1/ops/alerts`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.alerts) ? d.alerts :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(a => ({
    id: a.id || a._id || String(Math.random()),
    name: (a.title || a.name || a.message || a.alert || "").toString(),
    severity: a.severity || a.level || a.priority || "",
  }));
}

function kw(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(w => w.length > 2);
}

function matches(contact, pool) {
  const ck = kw(contact.name + " " + contact.role + " " + contact.org);
  return pool.filter(p => {
    const pk = kw(p.name);
    return ck.some(w => pk.includes(w)) || pk.some(w => ck.includes(w));
  });
}

function classify(contact, skills, datasets, investigations, opsAlerts) {
  const sk = matches(contact, skills);
  const ds = matches(contact, datasets);
  const iv = matches(contact, investigations);
  const oa = matches(contact, opsAlerts);
  const score = [sk.length > 0, ds.length > 0, iv.length > 0, oa.length > 0].filter(Boolean).length;
  const cls =
    score === 4 ? "READY" :
    score >= 2  ? "SKILLED" :
    score === 1 ? "PARTIAL" : "DARK";
  return { ...contact, cls, matchedSk: sk, matchedDs: ds, matchedIv: iv, matchedOa: oa };
}

const clsColor = { READY: GRN, SKILLED: CY, PARTIAL: AMB, DARK: RED };
const clsOrder = { READY: 0, SKILLED: 1, PARTIAL: 2, DARK: 3 };

const SevBadge = ({ s }) => {
  const c = /critical|high/i.test(s) ? RED : /med/i.test(s) ? AMB : CY;
  return s ? <span style={{ fontSize: 10, border: `1px solid ${c}`, color: c, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{s}</span> : null;
};

const StatusBadge = ({ s }) => {
  const c = /open|active/i.test(s) ? GRN : /closed|resolved/i.test(s) ? PRP : CY;
  return s ? <span style={{ fontSize: 10, border: `1px solid ${c}`, color: c, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{s}</span> : null;
};

const ScoreBadge = ({ v }) =>
  v != null ? <span style={{ fontSize: 10, border: `1px solid ${CY}`, color: CY, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{typeof v === "number" ? v.toFixed(2) : v}</span> : null;

const RowsBadge = ({ v }) =>
  v != null ? <span style={{ fontSize: 10, border: `1px solid ${PRP}`, color: PRP, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{v.toLocaleString()} rows</span> : null;

export default function ContactSkillDatasetInvestigationOpsCoverage() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);
  const [expanded, setExp]    = useState({});
  const [filter, setFilter]   = useState("ALL");
  const [assessing, setAss]   = useState(false);
  const [advice, setAdvice]   = useState("");
  const timerRef              = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [contacts, skills, datasets, investigations, opsAlerts] = await Promise.all([
        fetchContacts(), fetchSkills(), fetchDatasets(),
        fetchInvestigations(), fetchOpsAlerts(),
      ]);
      const classified = contacts
        .map(c => classify(c, skills, datasets, investigations, opsAlerts))
        .sort((a, b) => clsOrder[a.cls] - clsOrder[b.cls]);
      setRows(classified);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:cidio-toggle", toggle);
    return () => window.removeEventListener("jarvis:cidio-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAss(true); setAdvice("");
    const script = buildCidioScript(rows);
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdrs, "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || "";
      setAdvice(text);
      if (text) {
        try {
          await fetch(`${apiBase()}/v1/voice/tts`, {
            method: "POST",
            headers: { ...hdrs, "Content-Type": "application/json" },
            body: JSON.stringify({ text: text.slice(0, 400) }),
          });
        } catch { /* TTS optional */ }
      }
    } catch (e) {
      setAdvice("Advisory unavailable: " + e.message);
    } finally {
      setAss(false);
    }
  }, [rows]);

  const darkCount = rows.filter(r => r.cls === "DARK").length;
  const visible   = filter === "ALL" ? rows : rows.filter(r => r.cls === filter);

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Contact × Skill × Dataset × Investigation × Ops Alert Personnel Intelligence Readiness"
        style={{
          position: "fixed", bottom: 8, left: 156440, zIndex: 290,
          background: "rgba(0,0,0,0.7)", border: `1px solid ${darkCount > 0 ? RED : CY}`,
          color: darkCount > 0 ? RED : CY, fontSize: 10, padding: "3px 7px",
          borderRadius: 4, cursor: "pointer", fontFamily: "monospace",
          boxShadow: darkCount > 0 ? `0 0 8px ${RED}88` : "none",
          animation: darkCount > 0 ? "pulse-red 2s infinite" : "none",
        }}
      >
        ◈ CIDIO{darkCount > 0 ? ` ⚠${darkCount}` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 16, width: 560, maxHeight: "80vh",
      background: "rgba(5,10,18,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 8, zIndex: 9999, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CY, fontSize: 12,
      boxShadow: `0 0 24px ${CY}22`,
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: `1px solid ${CY}33` }}>
        <span style={{ flex: 1, fontWeight: "bold", fontSize: 11 }}>
          ◈ CIDIO — CONTACT × SKILL × DATASET × INVESTIGATION × OPS ALERT
        </span>
        {darkCount > 0 && (
          <span style={{ color: RED, fontWeight: "bold", marginRight: 10,
            animation: "pulse-red 2s infinite" }}>
            ⚠ {darkCount} DARK
          </span>
        )}
        <button onClick={load} disabled={loading} style={{ background: "none", border: `1px solid ${CY}55`, color: CY, borderRadius: 3, padding: "2px 7px", cursor: "pointer", fontSize: 10, marginRight: 6 }}>
          {loading ? "…" : "↺"}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, padding: "6px 12px", borderBottom: `1px solid ${CY}22` }}>
        {["ALL", "READY", "SKILLED", "PARTIAL", "DARK"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? `${clsColor[f] || CY}22` : "transparent",
            border: `1px solid ${clsColor[f] || CY}55`,
            color: clsColor[f] || CY, borderRadius: 3, padding: "2px 7px",
            cursor: "pointer", fontSize: 10,
          }}>
            {f}
            <span style={{ marginLeft: 4, opacity: 0.7 }}>
              {f === "ALL" ? rows.length : rows.filter(r => r.cls === f).length}
            </span>
          </button>
        ))}
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 12px" }}>
        {err && <div style={{ color: RED, padding: 8 }}>Error: {err}</div>}
        {!loading && !err && visible.length === 0 && (
          <div style={{ opacity: 0.5, padding: 8 }}>No contacts to display.</div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ borderBottom: `1px solid ${CY}18`, padding: "5px 0" }}>
            <div
              onClick={() => setExp(e => ({ ...e, [row.id]: !e[row.id] }))}
              style={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 6 }}
            >
              <span style={{ color: clsColor[row.cls], fontWeight: "bold", minWidth: 68 }}>{row.cls}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name || "(no name)"}</span>
              {row.role && <span style={{ fontSize: 10, color: AMB, opacity: 0.8 }}>{row.role}</span>}
              {row.org && <span style={{ fontSize: 10, color: PRP, opacity: 0.7 }}>{row.org}</span>}
              <span style={{ opacity: 0.4, fontSize: 10 }}>{expanded[row.id] ? "▲" : "▼"}</span>
            </div>
            {expanded[row.id] && (
              <div style={{ paddingLeft: 16, paddingTop: 4, opacity: 0.85 }}>
                {row.matchedSk.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: GRN }}>skills: </span>
                    {row.matchedSk.slice(0, 3).map(s => (
                      <span key={s.id}>{s.name}<ScoreBadge v={s.score} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.matchedDs.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: PRP }}>datasets: </span>
                    {row.matchedDs.slice(0, 3).map(d => (
                      <span key={d.id}>{d.name}<RowsBadge v={d.rows} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.matchedIv.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: CY }}>investigations: </span>
                    {row.matchedIv.slice(0, 3).map(i => (
                      <span key={i.id}>{i.name}<StatusBadge s={i.status} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.matchedOa.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: RED }}>ops alerts: </span>
                    {row.matchedOa.slice(0, 3).map(a => (
                      <span key={a.id}>{a.name}<SevBadge s={a.severity} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.cls === "DARK" && (
                  <div style={{ color: RED, fontSize: 10, opacity: 0.8 }}>
                    ⚠ No skill, dataset, investigation, or alert coverage — personnel blind spot.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* assess */}
      <div style={{ padding: "8px 12px", borderTop: `1px solid ${CY}33` }}>
        <button
          onClick={assess}
          disabled={assessing || rows.length === 0}
          style={{
            background: `${RED}22`, border: `1px solid ${RED}88`,
            color: RED, borderRadius: 4, padding: "4px 14px",
            cursor: assessing ? "wait" : "pointer", fontSize: 11,
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS DARK CONTACTS"}
        </button>
        {advice && (
          <div style={{ marginTop: 8, color: CY, fontSize: 11, opacity: 0.9,
            maxHeight: 120, overflowY: "auto", borderTop: `1px solid ${CY}22`, paddingTop: 6 }}>
            {advice}
          </div>
        )}
      </div>
    </div>
  );
}
