import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const CY = "#00E5FF"; const GN = "#4CAF50";
const OR = "#FF9800"; const RD = "#FF3D3D";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const REFRESH_MS = 90_000;
const BTN_LEFT   = 1098960;
const Z_IDX      = 678;

/* ── normalizers ─────────────────────────────────────────────────────────── */
function normSkills(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.skills ?? raw.data ?? raw.items ?? []);
  return arr.map((s, i) => ({
    id:   String(s.id   ?? s.skill_id  ?? s.name ?? i),
    name: String(s.name ?? s.skill     ?? s.title ?? s.id ?? `Skill-${i}`),
    tags: Array.isArray(s.tags)     ? s.tags.map(String)     : [],
    desc: String(s.description ?? s.desc ?? s.summary ?? ""),
  }));
}

function normCommunities(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.communities ?? raw.nodes ?? raw.data ?? raw.items ?? []);
  return arr.map((c, i) => ({
    id:      String(c.id      ?? c.community_id ?? i),
    name:    String(c.name    ?? c.label        ?? c.title ?? `Community-${i}`),
    members: Number(c.members ?? c.member_count ?? c.size  ?? 0),
    tags:    Array.isArray(c.tags) ? c.tags.map(String) : [],
    desc:    String(c.description ?? c.desc ?? ""),
  }));
}

function normDatasets(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.datasets ?? raw.data ?? raw.items ?? []);
  return arr.map((d, i) => ({
    id:     String(d.id     ?? d.dataset_id ?? d.name  ?? i),
    name:   String(d.name   ?? d.title      ?? d.label ?? `Dataset-${i}`),
    type:   String(d.type   ?? d.category   ?? d.kind  ?? ""),
    tags:   Array.isArray(d.tags) ? d.tags.map(String) : [],
    desc:   String(d.description ?? d.desc ?? d.summary ?? ""),
  }));
}

/* ── keyword overlap ─────────────────────────────────────────────────────── */
function tokens(text) {
  return (text || "").toLowerCase().replace(/[^a-z0-9 _-]/g, " ").split(/\s+/).filter(Boolean);
}

function overlap(skillTokens, other) {
  const ot = tokens((other.name ?? "") + " " + (other.desc ?? "") + " " + (other.tags ?? []).join(" "));
  const hits = skillTokens.filter(t => ot.includes(t));
  return hits.length;
}

function classify(skill, communities, datasets) {
  const st = tokens(skill.name + " " + skill.desc + " " + skill.tags.join(" "));
  const hasCom = communities.some(c => overlap(st, c) >= 1);
  const hasDs  = datasets.some(d   => overlap(st, d) >= 1);
  if (hasCom && hasDs)  return "FULLY_SATURATED";
  if (hasCom)           return "COMMUNITY_LINKED";
  if (hasDs)            return "DATASET_BACKED";
  return "UNSATURATED";
}

function matchCommunities(skill, communities) {
  const st = tokens(skill.name + " " + skill.desc + " " + skill.tags.join(" "));
  return communities.filter(c => overlap(st, c) >= 1).slice(0, 4);
}

function matchDatasets(skill, datasets) {
  const st = tokens(skill.name + " " + skill.desc + " " + skill.tags.join(" "));
  return datasets.filter(d => overlap(st, d) >= 1).slice(0, 4);
}

/* ── voice query ─────────────────────────────────────────────────────────── */
const AGDSIX_RE = /\b(agdsix|skill saturation|skill community dataset|saturated skill|unsaturated skill|aip skill.*graph|graph.*dataset.*skill|dataset.*skill.*saturation|skill.*intelligence.*saturation)\b/i;
export function isAgdsixQuery(t) { return AGDSIX_RE.test(t || ""); }

export async function buildAgdsixScript() {
  const base = apiBase();
  const hdr  = { "Content-Type": "application/json", "x-api-key": API_KEY };
  try {
    const [sr, cr, dr] = await Promise.allSettled([
      fetch(`${base}/v1/aip/skill`,          { headers: hdr }).then(r => r.ok ? r.json() : null),
      fetch(`${base}/v1/graph/communities`,  { headers: hdr }).then(r => r.ok ? r.json() : null),
      fetch(`${base}/v1/datasets`,           { headers: hdr }).then(r => r.ok ? r.json() : null),
    ]);
    const skills      = normSkills(sr.value);
    const communities = normCommunities(cr.value);
    const datasets    = normDatasets(dr.value);
    const counts      = { FULLY_SATURATED: 0, COMMUNITY_LINKED: 0, DATASET_BACKED: 0, UNSATURATED: 0 };
    skills.forEach(s => counts[classify(s, communities, datasets)]++);
    const satPct = skills.length ? Math.round((counts.FULLY_SATURATED / skills.length) * 100) : 0;
    return `AIP Skill Graph Dataset Saturation Index. ${skills.length} skills analysed against ${communities.length} graph communities and ${datasets.length} datasets. Saturation breakdown: ${counts.FULLY_SATURATED} fully saturated, ${counts.COMMUNITY_LINKED} community-linked only, ${counts.DATASET_BACKED} dataset-backed only, ${counts.UNSATURATED} unsaturated. Overall saturation rate: ${satPct} percent.`;
  } catch {
    return "AGDSIX data currently unavailable.";
  }
}

/* ── component ───────────────────────────────────────────────────────────── */
export default function AipSkillGraphDatasetSaturation() {
  const [open,    setOpen]    = useState(false);
  const [skills,      setSkills]      = useState([]);
  const [communities, setCommunities] = useState([]);
  const [datasets,    setDatasets]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(null);
  const [filter,  setFilter]  = useState("ALL");
  const [expand,  setExpand]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const base = apiBase();
    const hdr  = { "Content-Type": "application/json", "x-api-key": API_KEY };
    try {
      const [sr, cr, dr] = await Promise.allSettled([
        fetch(`${base}/v1/aip/skill`,         { headers: hdr }).then(r => r.ok ? r.json() : null),
        fetch(`${base}/v1/graph/communities`, { headers: hdr }).then(r => r.ok ? r.json() : null),
        fetch(`${base}/v1/datasets`,          { headers: hdr }).then(r => r.ok ? r.json() : null),
      ]);
      setSkills(normSkills(sr.value));
      setCommunities(normCommunities(cr.value));
      setDatasets(normDatasets(dr.value));
    } catch (e) {
      setErr(e.message);
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
    const handler = () => setOpen(p => !p);
    window.addEventListener("jarvis:agdsix-toggle", handler);
    return () => window.removeEventListener("jarvis:agdsix-toggle", handler);
  }, []);

  const classified = skills.map(s => ({
    ...s,
    status:      classify(s, communities, datasets),
    matchedComs: matchCommunities(s, communities),
    matchedDs:   matchDatasets(s, datasets),
  }));

  const filtered = filter === "ALL" ? classified : classified.filter(s => s.status === filter);

  const counts = { FULLY_SATURATED: 0, COMMUNITY_LINKED: 0, DATASET_BACKED: 0, UNSATURATED: 0 };
  classified.forEach(s => counts[s.status]++);
  const satPct = classified.length ? Math.round((counts.FULLY_SATURATED / classified.length) * 100) : 0;

  const assess = async () => {
    setAssessing(true);
    try {
      const prompt = await buildAgdsixScript();
      const base   = apiBase();
      const hdr    = { "Content-Type": "application/json", "x-api-key": API_KEY };
      const resp   = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({ message: prompt }),
      });
      const data = resp.ok ? await resp.json() : null;
      const text = data?.response ?? data?.message ?? data?.content ?? prompt;
      const tts  = await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({ text, voice: getActiveVoice() }),
      });
      if (tts.ok) {
        const blob = await tts.blob();
        const url  = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.play();
      }
    } catch (_) { /* silent */ }
    finally { setAssessing(false); }
  };

  const STAT_COLOR = { FULLY_SATURATED: GN, COMMUNITY_LINKED: CY, DATASET_BACKED: AM, UNSATURATED: RD };
  const STAT_LABEL = { FULLY_SATURATED: "FULLY SATURATED", COMMUNITY_LINKED: "COMMUNITY LINKED", DATASET_BACKED: "DATASET BACKED", UNSATURATED: "UNSATURATED" };

  const panelLeft = Math.min(BTN_LEFT, (typeof window !== "undefined" ? window.innerWidth : 1920) - 480);

  return (
    <>
      <style>{`
        @keyframes agdsixPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(0,229,255,.55); }
          50%      { box-shadow: 0 0 0 6px rgba(0,229,255,0); }
        }
      `}</style>

      {/* launcher button */}
      <button
        onClick={() => setOpen(p => !p)}
        title="AIP Skill × Graph Community × Dataset Intelligence Saturation Index"
        style={{
          position: "fixed", bottom: 18, left: BTN_LEFT, zIndex: Z_IDX,
          background: open ? CY : "rgba(0,229,255,0.12)",
          border: `1px solid ${CY}`, borderRadius: 6, padding: "4px 10px",
          color: open ? "#000" : CY, fontFamily: MN, fontSize: 10, fontWeight: 700,
          cursor: "pointer", letterSpacing: ".06em",
          animation: open ? "none" : "agdsixPulse 2.4s infinite",
          transition: "background .2s, color .2s",
          whiteSpace: "nowrap",
        }}
      >
        AGDSIX
      </button>

      {/* floating panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 52, left: panelLeft, zIndex: Z_IDX,
          width: 470, maxHeight: "78vh",
          background: BG, border: `1px solid ${CY}`,
          borderRadius: 10, overflow: "hidden",
          display: "flex", flexDirection: "column",
          fontFamily: MN, fontSize: 11, color: "#e8eaf6",
          boxShadow: `0 0 28px rgba(0,229,255,.18)`,
        }}>
          {/* header */}
          <div style={{
            padding: "10px 14px 8px", borderBottom: `1px solid rgba(0,229,255,.18)`,
            background: "rgba(0,229,255,.06)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: ".07em" }}>
                ◈ AGDSIX
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {loading && <span style={{ color: AM, fontSize: 9 }}>LOADING…</span>}
                <button onClick={load}
                  style={{ background: "none", border: `1px solid ${CY}`, borderRadius: 4,
                    color: CY, fontSize: 9, padding: "2px 7px", cursor: "pointer" }}>
                  ↺
                </button>
                <button onClick={() => setOpen(false)}
                  style={{ background: "none", border: "none", color: "#aaa",
                    fontSize: 14, cursor: "pointer", lineHeight: 1 }}>
                  ✕
                </button>
              </div>
            </div>
            <div style={{ color: "rgba(255,255,255,.5)", fontSize: 9, marginTop: 2 }}>
              AIP Skill × Graph Community × Dataset Intelligence Saturation
            </div>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${DIM}` }}>
            {[
              { label: "SKILLS",       val: classified.length,         col: CY },
              { label: "COMMUNITIES",  val: communities.length,        col: AM },
              { label: "DATASETS",     val: datasets.length,           col: GN },
              { label: "SAT%",         val: `${satPct}%`,              col: satPct >= 60 ? GN : satPct >= 30 ? AM : RD },
            ].map(t => (
              <div key={t.label} style={{
                flex: 1, background: DIM, borderRadius: 6, padding: "6px 4px",
                textAlign: "center", border: `1px solid rgba(255,255,255,.06)`,
              }}>
                <div style={{ color: t.col, fontWeight: 700, fontSize: 14 }}>{t.val}</div>
                <div style={{ color: "rgba(255,255,255,.45)", fontSize: 8, marginTop: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* status bar */}
          <div style={{ display: "flex", gap: 4, padding: "6px 14px", borderBottom: `1px solid ${DIM}`, flexWrap: "wrap" }}>
            {["ALL", "FULLY_SATURATED", "COMMUNITY_LINKED", "DATASET_BACKED", "UNSATURATED"].map(k => {
              const cnt = k === "ALL" ? classified.length : counts[k];
              const col = k === "ALL" ? CY : STAT_COLOR[k];
              const lbl = k === "ALL" ? `ALL (${cnt})` : `${STAT_LABEL[k]} (${cnt})`;
              return (
                <button key={k} onClick={() => { setFilter(k); setExpand(null); }}
                  style={{
                    background: filter === k ? col : "transparent",
                    border: `1px solid ${col}`,
                    borderRadius: 4, color: filter === k ? "#000" : col,
                    fontSize: 8, padding: "2px 6px", cursor: "pointer",
                    fontWeight: 700, letterSpacing: ".04em",
                  }}>
                  {lbl}
                </button>
              );
            })}
          </div>

          {/* skill list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
            {err && (
              <div style={{ color: RD, padding: "8px 14px", fontSize: 10 }}>
                Error: {err}
              </div>
            )}
            {!err && filtered.length === 0 && !loading && (
              <div style={{ color: "rgba(255,255,255,.35)", padding: "10px 14px", textAlign: "center" }}>
                No skills match this filter.
              </div>
            )}
            {filtered.map(s => {
              const col = STAT_COLOR[s.status];
              const isExp = expand === s.id;
              return (
                <div key={s.id}
                  onClick={() => setExpand(isExp ? null : s.id)}
                  style={{
                    margin: "3px 10px", borderRadius: 7,
                    background: isExp ? "rgba(0,229,255,.07)" : DIM,
                    border: `1px solid ${isExp ? CY : "rgba(255,255,255,.07)"}`,
                    padding: "7px 10px", cursor: "pointer",
                    transition: "background .15s, border .15s",
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "#e8eaf6", fontWeight: 600, fontSize: 11, flex: 1 }}>
                      {s.name}
                    </span>
                    <span style={{
                      color: col, fontSize: 8, fontWeight: 700,
                      background: `${col}20`, borderRadius: 4,
                      padding: "2px 5px", letterSpacing: ".04em", marginLeft: 6,
                      border: `1px solid ${col}44`,
                    }}>
                      {STAT_LABEL[s.status]}
                    </span>
                  </div>
                  {s.desc && (
                    <div style={{ color: "rgba(255,255,255,.45)", fontSize: 9, marginTop: 3 }}>
                      {s.desc.slice(0, 100)}{s.desc.length > 100 ? "…" : ""}
                    </div>
                  )}
                  {isExp && (
                    <div style={{ marginTop: 8 }}>
                      {s.matchedComs.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: AM, fontSize: 9, fontWeight: 700, marginBottom: 3 }}>
                            GRAPH COMMUNITIES ({s.matchedComs.length})
                          </div>
                          {s.matchedComs.map(c => (
                            <div key={c.id} style={{
                              background: `${AM}10`, borderRadius: 5,
                              padding: "4px 7px", marginBottom: 3,
                              border: `1px solid ${AM}33`,
                            }}>
                              <span style={{ color: AM, fontWeight: 700 }}>{c.name}</span>
                              {c.members > 0 && (
                                <span style={{ color: "rgba(255,255,255,.4)", fontSize: 9, marginLeft: 6 }}>
                                  {c.members} members
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {s.matchedDs.length > 0 && (
                        <div>
                          <div style={{ color: GN, fontSize: 9, fontWeight: 700, marginBottom: 3 }}>
                            DATASETS ({s.matchedDs.length})
                          </div>
                          {s.matchedDs.map(d => (
                            <div key={d.id} style={{
                              background: `${GN}10`, borderRadius: 5,
                              padding: "4px 7px", marginBottom: 3,
                              border: `1px solid ${GN}33`,
                            }}>
                              <span style={{ color: GN, fontWeight: 700 }}>{d.name}</span>
                              {d.type && (
                                <span style={{ color: "rgba(255,255,255,.4)", fontSize: 9, marginLeft: 6 }}>
                                  {d.type}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {s.matchedComs.length === 0 && s.matchedDs.length === 0 && (
                        <div style={{ color: RD, fontSize: 9 }}>No community or dataset matches found.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* footer */}
          <div style={{
            padding: "8px 14px", borderTop: `1px solid ${DIM}`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ color: "rgba(255,255,255,.3)", fontSize: 8 }}>
              AUTO-REFRESH 90s · {classified.length} SKILLS
            </span>
            <button onClick={assess} disabled={assessing}
              style={{
                background: assessing ? "rgba(0,229,255,.1)" : `${CY}22`,
                border: `1px solid ${CY}`, borderRadius: 5,
                color: CY, fontSize: 9, fontWeight: 700, padding: "4px 12px",
                cursor: assessing ? "not-allowed" : "pointer", letterSpacing: ".06em",
              }}>
              {assessing ? "ASSESSING…" : "▶ ASSESS"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
