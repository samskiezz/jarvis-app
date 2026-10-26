/**
 * SceneKnowledgeOpsSkillPosture — F199
 * Fetches all 10 /v1/cinematic/scene/{1..10} + /knowledge/ + /v1/ops/alerts +
 * /v1/aip/skill and cross-references each scene against all 3 other sources.
 * Classifies:
 *   FORTIFIED  — scene has matches across all 3 sources
 *   SUPPORTED  — scene has 2 source matches
 *   PARTIAL    — scene has 1 source match
 *   BLIND      — scene has 0 matches (no knowledge, no alert, no skill)
 * Amber pulse on BLIND count (fully ungrounded scenes).
 * ASSESS → /v1/jarvis/agent/chat advisory for blind scenes + TTS.
 * Voice triggers: "scene posture"/"skops"/"blind scene"/"scene knowledge ops"/
 *   "scene skill"/"scene operational posture"/"scene coverage posture"
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const RED = "#FF4D6D";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const PRP = "#B485FF";
const ORG = "#FF9A3C";
const POLL = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SKOPS_RE =
  /\b(scene.posture|skops|blind.scene|scene.knowledge.ops|scene.skill|scene.operational.posture|scene.coverage.posture|scene.ops.posture|scene.posture.monitor|skops.toggle)\b/i;

export function isSkopsQuery(t) { return SKOPS_RE.test(t || ""); }

export function buildSkopsScript(rows) {
  const blind = rows.filter(r => r.cls === "BLIND");
  if (!blind.length) return "All cinematic scenes have at least one operational support source. No fully blind scenes detected.";
  return `You are JARVIS. ${blind.length} cinematic scene(s) are BLIND — they have no matched knowledge article, no ops alert coverage, and no skill backing. List each blind scene by title and anchor. Then provide a 2-sentence operational posture advisory: what knowledge articles, ops alerts, or skills should be linked to each blind scene to bring it under operational coverage. Be direct and specific.`;
}

const hdrs = { Authorization: `Bearer ${API_KEY}` };

async function fetchScenes() {
  const ids = [1,2,3,4,5,6,7,8,9,10];
  const results = await Promise.allSettled(
    ids.map(id =>
      fetch(`${apiBase()}/v1/cinematic/scene/${id}`, { headers: hdrs })
        .then(r => r.ok ? r.json() : null)
    )
  );
  return results
    .map((r, i) => {
      if (r.status !== "fulfilled" || !r.value) return null;
      const d = r.value;
      return {
        id: `scene_${ids[i]}`,
        name: (d.title || d.name || d.scene_title || `Scene ${ids[i]}`).toString(),
        anchor: (d.anchor || d.subtitle || d.description || "").toString(),
        sceneId: ids[i],
      };
    })
    .filter(Boolean);
}

async function fetchKnowledge() {
  const r = await fetch(`${apiBase()}/knowledge/`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.articles) ? d.articles :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(k => ({
    id: k.id || k._id || String(Math.random()),
    name: (k.title || k.name || k.subject || "").toString(),
    category: k.category || k.type || k.domain || "",
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
           typeof s.rating === "number" ? s.rating :
           typeof s.value === "number" ? s.value : null,
  }));
}

function kw(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(w => w.length > 2);
}

function matchPool(item, pool) {
  const ik = kw(item.name + " " + (item.anchor || ""));
  return pool.filter(p => {
    const pk = kw(p.name);
    return ik.some(w => pk.includes(w)) || pk.some(w => ik.includes(w));
  });
}

function classify(scene, knowledge, alerts, skills) {
  const mk = matchPool(scene, knowledge);
  const ma = matchPool(scene, alerts);
  const ms = matchPool(scene, skills);
  const score = [mk.length > 0, ma.length > 0, ms.length > 0].filter(Boolean).length;
  const cls =
    score === 3 ? "FORTIFIED" :
    score === 2 ? "SUPPORTED" :
    score === 1 ? "PARTIAL" : "BLIND";
  return { ...scene, cls, matchedKnowledge: mk, matchedAlerts: ma, matchedSkills: ms };
}

const clsColor = { FORTIFIED: GRN, SUPPORTED: CY, PARTIAL: AMB, BLIND: AMB };
const clsOrder = { FORTIFIED: 0, SUPPORTED: 1, PARTIAL: 2, BLIND: 3 };

const ScoreBadge = ({ v }) =>
  v != null ? <span style={{ fontSize: 10, border: `1px solid ${CY}`, color: CY, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{typeof v === "number" ? v.toFixed(0) : v}</span> : null;

const SevBadge = ({ s }) =>
  s ? <span style={{ fontSize: 10, border: `1px solid ${RED}`, color: RED, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{s}</span> : null;

const CatBadge = ({ c }) =>
  c ? <span style={{ fontSize: 10, border: `1px solid ${PRP}`, color: PRP, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{c}</span> : null;

export default function SceneKnowledgeOpsSkillPosture() {
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
      const [scenes, knowledge, alerts, skills] = await Promise.all([
        fetchScenes(), fetchKnowledge(), fetchOpsAlerts(), fetchSkills(),
      ]);
      const classified = scenes
        .map(scene => classify(scene, knowledge, alerts, skills))
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
    window.addEventListener("jarvis:skops-toggle", toggle);
    return () => window.removeEventListener("jarvis:skops-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAss(true); setAdvice("");
    const script = buildSkopsScript(rows);
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

  const blindCount = rows.filter(r => r.cls === "BLIND").length;
  const visible    = filter === "ALL" ? rows : rows.filter(r => r.cls === filter);

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Scene × Knowledge × Ops Alert × Skill Operational Knowledge Posture"
        style={{
          position: "fixed", bottom: 8, left: 159240, zIndex: 295,
          background: "rgba(0,0,0,0.7)", border: `1px solid ${blindCount > 0 ? AMB : ORG}`,
          color: blindCount > 0 ? AMB : ORG, fontSize: 10, padding: "3px 7px",
          borderRadius: 4, cursor: "pointer", fontFamily: "monospace",
          boxShadow: blindCount > 0 ? `0 0 8px ${AMB}88` : "none",
          animation: blindCount > 0 ? "pulse-amber 2s infinite" : "none",
        }}
      >
        ◈ SKOPS{blindCount > 0 ? ` ⚠${blindCount}` : ""}
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
          ◈ SKOPS — SCENE × KNOWLEDGE × OPS ALERT × SKILL
        </span>
        {blindCount > 0 && (
          <span style={{ color: AMB, fontWeight: "bold", marginRight: 10,
            animation: "pulse-amber 2s infinite" }}>
            ⚠ {blindCount} BLIND
          </span>
        )}
        <button onClick={load} disabled={loading} style={{ background: "none", border: `1px solid ${CY}55`, color: CY, borderRadius: 3, padding: "2px 7px", cursor: "pointer", fontSize: 10, marginRight: 6 }}>
          {loading ? "…" : "↺"}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, padding: "6px 12px", borderBottom: `1px solid ${CY}22` }}>
        {["ALL", "FORTIFIED", "SUPPORTED", "PARTIAL", "BLIND"].map(f => (
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
          <div style={{ opacity: 0.5, padding: 8 }}>No scenes to display.</div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ borderBottom: `1px solid ${CY}18`, padding: "5px 0" }}>
            <div
              onClick={() => setExp(e => ({ ...e, [row.id]: !e[row.id] }))}
              style={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 6 }}
            >
              <span style={{ color: clsColor[row.cls], fontWeight: "bold", minWidth: 80 }}>{row.cls}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name || "(no name)"}</span>
              {row.anchor && (
                <span style={{ opacity: 0.45, fontSize: 10, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.anchor}</span>
              )}
              <span style={{ opacity: 0.4, fontSize: 10 }}>{expanded[row.id] ? "▲" : "▼"}</span>
            </div>
            {expanded[row.id] && (
              <div style={{ paddingLeft: 16, paddingTop: 4, opacity: 0.85 }}>
                {row.matchedKnowledge.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: PRP }}>knowledge: </span>
                    {row.matchedKnowledge.slice(0, 3).map(k => (
                      <span key={k.id}>{k.name}<CatBadge c={k.category} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.matchedAlerts.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: RED }}>ops alerts: </span>
                    {row.matchedAlerts.slice(0, 3).map(a => (
                      <span key={a.id}>{a.name}<SevBadge s={a.severity} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.matchedSkills.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: GRN }}>skills: </span>
                    {row.matchedSkills.slice(0, 3).map(s => (
                      <span key={s.id}>{s.name}<ScoreBadge v={s.score} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.cls === "BLIND" && (
                  <div style={{ color: AMB, fontSize: 10, opacity: 0.8 }}>
                    ⚠ No knowledge article, ops alert, or skill match — fully ungrounded scene.
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
            background: `${AMB}22`, border: `1px solid ${AMB}88`,
            color: AMB, borderRadius: 4, padding: "4px 14px",
            cursor: assessing ? "wait" : "pointer", fontSize: 11,
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS BLIND SCENES"}
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
