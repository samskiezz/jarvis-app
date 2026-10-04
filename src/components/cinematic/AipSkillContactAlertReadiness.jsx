import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const GN = "#4CAF50"; const RD = "#FF3D3D";
const CY = "#00E5FF"; const OR = "#FF9800"; const PU = "#CE93D8";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) || "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT = 1109040;
const Z_IDX = 696;

function normSkills(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.skills || raw?.items || raw?.data || []);
  return arr.map((s, i) => ({
    id: s.id || s._id || `sk${i}`,
    name: s.name || s.skill_name || s.title || `Skill ${i + 1}`,
    type: s.type || s.category || s.skill_type || "",
    tags: Array.isArray(s.tags) ? s.tags : [],
    desc: s.description || s.summary || s.objective || "",
  }));
}

function normContacts(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.contacts || raw?.items || raw?.data || []);
  return arr.map((c, i) => ({
    id: c.id || c._id || `ct${i}`,
    name: c.name || c.full_name || c.contact_name || `Contact ${i + 1}`,
    role: c.role || c.title || c.position || "",
    org: c.org || c.organisation || c.company || "",
    tags: Array.isArray(c.tags) ? c.tags : [],
    desc: c.description || c.notes || c.summary || "",
  }));
}

function normAlerts(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.alerts || raw?.items || raw?.data || []);
  return arr.map((a, i) => ({
    id: a.id || a._id || `al${i}`,
    name: a.name || a.title || a.alert_name || a.message || `Alert ${i + 1}`,
    severity: a.severity || a.priority || a.level || "",
    type: a.type || a.category || a.alert_type || "",
    tags: Array.isArray(a.tags) ? a.tags : [],
    desc: a.description || a.summary || a.message || "",
  }));
}

function kw(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function overlap(aWords, bText) {
  const bWords = kw(bText);
  return aWords.filter(w => bWords.includes(w)).length;
}

function matchScore(skill, targets) {
  const sWords = kw(`${skill.name} ${skill.type} ${skill.tags.join(" ")} ${skill.desc}`);
  if (!sWords.length) return 0;
  const best = targets.reduce((mx, t) => {
    const tText = `${t.name || ""} ${t.role || ""} ${t.org || ""} ${t.severity || ""} ${t.type || ""} ${(t.tags || []).join(" ")} ${t.desc || ""}`;
    const score = overlap(sWords, tText);
    return Math.max(mx, score);
  }, 0);
  return Math.min(100, Math.round((best / Math.max(sWords.length, 1)) * 200));
}

function classify(skill, contacts, alerts) {
  const ctScore = matchScore(skill, contacts);
  const alScore = matchScore(skill, alerts);
  const hasCt = ctScore > 10;
  const hasAl = alScore > 10;
  return {
    bucket: hasCt && hasAl ? "FULLY_ARMED" : hasCt ? "CONTACT_LINKED" : hasAl ? "ALERT_DRIVEN" : "DORMANT",
    ctScore,
    alScore,
    matchedContacts: contacts.filter(c => matchScore(skill, [c]) > 10).slice(0, 3),
    matchedAlerts: alerts.filter(a => matchScore(skill, [a]) > 10).slice(0, 3),
  };
}

const BUCKETS = ["FULLY_ARMED", "CONTACT_LINKED", "ALERT_DRIVEN", "DORMANT"];
const BUCKET_COLORS = { FULLY_ARMED: GN, CONTACT_LINKED: CY, ALERT_DRIVEN: OR, DORMANT: "rgba(255,255,255,0.25)" };

function StatTile({ label, value, color }) {
  return (
    <div style={{ background: DIM, border: `1px solid ${color}33`, borderRadius: 8, padding: "6px 10px", textAlign: "center", minWidth: 70 }}>
      <div style={{ color, fontFamily: MN, fontSize: 18, fontWeight: 700 }}>{value}</div>
      <div style={{ color: "rgba(255,255,255,0.45)", fontFamily: MN, fontSize: 9, letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

function ScrarxPanel({ skills, contacts, alerts }) {
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);

  const rows = skills.map(s => ({ ...s, ...classify(s, contacts, alerts) }));
  const counts = Object.fromEntries(BUCKETS.map(b => [b, rows.filter(r => r.bucket === b).length]));
  const covPct = rows.length ? Math.round(((counts.FULLY_ARMED + counts.CONTACT_LINKED * 0.5 + counts.ALERT_DRIVEN * 0.5) / rows.length) * 100) : 0;

  const visible = rows
    .filter(r => filter === "ALL" || r.bucket === filter)
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
    const prompt = `SCRARX: ${rows.length} AIP skills assessed. FULLY_ARMED: ${counts.FULLY_ARMED}, CONTACT_LINKED: ${counts.CONTACT_LINKED}, ALERT_DRIVEN: ${counts.ALERT_DRIVEN}, DORMANT: ${counts.DORMANT}. Coverage: ${covPct}%. Provide a 2-sentence response readiness assessment.`;
    try {
      const res = await fetch(`${apiBase}/v1/jarvis/agent/chat`, { method: "POST", headers: hdrs, body: JSON.stringify({ message: prompt }) });
      const data = await res.json();
      const text = data.response || data.message || data.content || "SCRARX assessment complete.";
      try {
        const voice = getActiveVoice ? getActiveVoice() : "ash";
        const tv = await fetch(`${apiBase}/v1/voice/tts`, { method: "POST", headers: hdrs, body: JSON.stringify({ text, voice }) });
        const blob = await tv.blob();
        new Audio(URL.createObjectURL(blob)).play();
      } catch {}
    } catch {}
  }

  return (
    <div style={{ padding: "10px 16px 14px" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <StatTile label="SKILLS" value={rows.length} color={CY} />
        <StatTile label="CONTACTS" value={contacts.length} color={OR} />
        <StatTile label="OPS ALERTS" value={alerts.length} color={AM} />
        <StatTile label="FULLY ARMED" value={counts.FULLY_ARMED} color={GN} />
        <StatTile label="DORMANT" value={counts.DORMANT} color={RD} />
        <StatTile label="COV%" value={`${covPct}%`} color={covPct >= 70 ? GN : covPct >= 40 ? AM : RD} />
      </div>

      <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 6, height: 6, marginBottom: 10, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${covPct}%`, background: covPct >= 70 ? GN : covPct >= 40 ? AM : RD, transition: "width 0.6s ease" }} />
      </div>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
        {["ALL", ...BUCKETS].map(b => (
          <button key={b} onClick={() => setFilter(b)} style={{
            background: filter === b ? (BUCKET_COLORS[b] || CY) + "33" : DIM,
            border: `1px solid ${filter === b ? (BUCKET_COLORS[b] || CY) : "rgba(255,255,255,0.1)"}`,
            borderRadius: 5, color: filter === b ? (BUCKET_COLORS[b] || CY) : "rgba(255,255,255,0.5)",
            fontFamily: MN, fontSize: 9, padding: "3px 8px", cursor: "pointer", letterSpacing: 1,
          }}>{b === "ALL" ? `ALL (${rows.length})` : `${b} (${counts[b]})`}</button>
        ))}
      </div>

      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search skills…"
        style={{
          width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 5, color: "rgba(255,255,255,0.8)", fontFamily: MN, fontSize: 10,
          padding: "5px 10px", marginBottom: 10, boxSizing: "border-box",
        }}
      />

      <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {visible.map(r => (
          <div key={r.id} style={{
            background: r.bucket === "DORMANT" ? "rgba(255,61,61,0.06)" : DIM,
            border: `1px solid ${(BUCKET_COLORS[r.bucket] || CY)}33`,
            borderRadius: 7, padding: "7px 10px",
            animation: r.bucket === "DORMANT" ? "pulse 2s infinite" : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
              onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{
                  background: (BUCKET_COLORS[r.bucket] || CY) + "22", border: `1px solid ${(BUCKET_COLORS[r.bucket] || CY)}55`,
                  borderRadius: 4, color: BUCKET_COLORS[r.bucket] || CY, fontFamily: MN, fontSize: 8,
                  padding: "1px 5px", letterSpacing: 1,
                }}>{r.bucket}</span>
                <span style={{ color: "rgba(255,255,255,0.85)", fontFamily: MN, fontSize: 10 }}>{r.name}</span>
                {r.type && <span style={{ color: "rgba(255,255,255,0.35)", fontFamily: MN, fontSize: 9 }}>· {r.type}</span>}
              </div>
              <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>{expanded === r.id ? "▲" : "▼"}</span>
            </div>

            {expanded === r.id && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                {r.matchedContacts.length > 0 && (
                  <div>
                    <div style={{ color: OR, fontFamily: MN, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>CONTACTS ({r.matchedContacts.length})</div>
                    {r.matchedContacts.map(c => (
                      <div key={c.id} style={{ background: OR + "11", border: `1px solid ${OR}33`, borderRadius: 5, padding: "4px 8px", marginBottom: 3 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: "rgba(255,255,255,0.75)", fontFamily: MN, fontSize: 10 }}>{c.name}</span>
                          {c.role && <span style={{ background: OR + "22", border: `1px solid ${OR}44`, borderRadius: 3, color: OR, fontFamily: MN, fontSize: 8, padding: "1px 5px" }}>{c.role}</span>}
                        </div>
                        <div style={{ height: 3, background: "rgba(0,0,0,0.3)", borderRadius: 3, marginTop: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${matchScore(r, [c])}%`, background: OR }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {r.matchedAlerts.length > 0 && (
                  <div>
                    <div style={{ color: AM, fontFamily: MN, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>OPS ALERTS ({r.matchedAlerts.length})</div>
                    {r.matchedAlerts.map(a => (
                      <div key={a.id} style={{ background: AM + "11", border: `1px solid ${AM}33`, borderRadius: 5, padding: "4px 8px", marginBottom: 3 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: "rgba(255,255,255,0.75)", fontFamily: MN, fontSize: 10 }}>{a.name}</span>
                          {a.severity && <span style={{ background: RD + "22", border: `1px solid ${RD}44`, borderRadius: 3, color: RD, fontFamily: MN, fontSize: 8, padding: "1px 5px" }}>{a.severity.toUpperCase()}</span>}
                        </div>
                        <div style={{ height: 3, background: "rgba(0,0,0,0.3)", borderRadius: 3, marginTop: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${matchScore(r, [a])}%`, background: AM }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {r.matchedContacts.length === 0 && r.matchedAlerts.length === 0 && (
                  <div style={{ color: "rgba(255,255,255,0.3)", fontFamily: MN, fontSize: 10 }}>No matched contacts or alerts.</div>
                )}
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && <div style={{ color: "rgba(255,255,255,0.3)", fontFamily: MN, fontSize: 10, padding: "10px 0" }}>No skills match current filter.</div>}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.55} }`}</style>

      <button onClick={assess} style={{
        marginTop: 10, background: GN + "22", border: `1px solid ${GN}55`, borderRadius: 6,
        color: GN, fontFamily: MN, fontSize: 10, padding: "5px 14px", cursor: "pointer", letterSpacing: 1,
      }}>▶ ASSESS READINESS</button>
    </div>
  );
}

export default function AipSkillContactAlertReadiness() {
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const [sRes, cRes, aRes] = await Promise.all([
        fetch(`${apiBase}/v1/aip/skill`, { headers: hdrs }),
        fetch(`${apiBase}/entities/Contact`, { headers: hdrs }),
        fetch(`${apiBase}/v1/ops/alerts`, { headers: hdrs }),
      ]);
      const [sRaw, cRaw, aRaw] = await Promise.all([sRes.json(), cRes.json(), aRes.json()]);
      setSkills(normSkills(sRaw));
      setContacts(normContacts(cRaw));
      setAlerts(normAlerts(aRaw));
    } catch (e) {
      setError(`Load failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen(o => {
        if (!o) load();
        return !o;
      });
    };
    window.addEventListener("jarvis:scrarx-toggle", toggle);
    return () => window.removeEventListener("jarvis:scrarx-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  if (!open) {
    return (
      <button onClick={() => { setOpen(true); load(); }} title="AIP Skill × Contact × Ops Alert Response Readiness Index" style={{
        position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_IDX,
        background: "rgba(6,10,18,0.82)", border: `1px solid ${CY}55`, borderRadius: 7,
        color: CY, fontFamily: MN, fontSize: 10, letterSpacing: 1,
        padding: "5px 9px", cursor: "pointer", whiteSpace: "nowrap",
        boxShadow: `0 0 14px ${CY}22`,
      }}>◈ SCRARX</button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 560, bottom: 48, zIndex: Z_IDX,
      background: BG, border: `1px solid ${CY}55`, borderRadius: 14,
      boxShadow: `0 0 50px ${CY}18`, backdropFilter: "blur(14px)",
      minWidth: 540, maxWidth: 680,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px 0" }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: 2 }}>◈ SCRARX — Skill × Contact × Alert Response Readiness</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>
      {loading && <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, padding: "14px 18px" }}>Loading response readiness index…</div>}
      {error && <div style={{ color: RD, fontSize: 11, padding: "10px 18px" }}>{error}</div>}
      {!loading && !error && skills.length > 0 && <ScrarxPanel skills={skills} contacts={contacts} alerts={alerts} />}
      {!loading && !error && skills.length === 0 && <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "14px 18px" }}>No AIP skill data available.</div>}
    </div>
  );
}

export function isScrarxQuery(text) {
  const t = text.toLowerCase();
  return ["scrarx", "skill contact alert", "response readiness index",
    "contact alert skill", "alert skill contact", "skill response readiness",
    "aip contact alert", "dormant skill alert", "skill alert readiness",
    "contact skill alert readiness", "scrarx coverage"].some(k => t.includes(k));
}

export async function buildScrarxScript() {
  const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  try {
    const [sRes, cRes, aRes] = await Promise.all([
      fetch(`${apiBase}/v1/aip/skill`, { headers: hdrs }),
      fetch(`${apiBase}/entities/Contact`, { headers: hdrs }),
      fetch(`${apiBase}/v1/ops/alerts`, { headers: hdrs }),
    ]);
    const [sRaw, cRaw, aRaw] = await Promise.all([sRes.json(), cRes.json(), aRes.json()]);
    const skills = normSkills(sRaw);
    const contacts = normContacts(cRaw);
    const alerts = normAlerts(aRaw);
    const rows = skills.map(s => ({ ...s, ...classify(s, contacts, alerts) }));
    const armed = rows.filter(r => r.bucket === "FULLY_ARMED").length;
    const dormant = rows.filter(r => r.bucket === "DORMANT").length;
    const cov = rows.length ? Math.round(((armed + rows.filter(r => r.bucket !== "DORMANT").length * 0.5) / rows.length) * 100) : 0;
    return `SCRARX online, sir. ${rows.length} AIP skills assessed against ${contacts.length} contacts and ${alerts.length} ops alerts. ${armed} fully armed, ${dormant} dormant. Response readiness coverage at ${cov} percent.`;
  } catch {
    return "SCRARX online, sir. AIP skill contact alert response readiness index analysis ready.";
  }
}
