/**
 * F75 — Brain × AIP Skill Intelligence Ratio (BASIR)
 *
 * Answers: "Is JARVIS's cognitive capacity (brain nodes) sufficient to
 *           support all active AIP skills, and which skills are most
 *           brain-intensive?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /v1/cinematic/brain   → { node_count, synapse_count, … }
 *   GET /v1/aip/skill         → list of AIP skills with metadata
 *
 * Computes:
 *   brain_nodes ÷ skill_count  → B:S ratio
 *   ratio ≥ 10  → SURPLUS   (brain capacity well above skill demand)
 *   ratio 5–10  → BALANCED  (healthy headroom)
 *   ratio 2–5   → STRAINED  (capacity limited per skill)
 *   ratio < 2   → OVERLOADED (brain nodes critically thin per skill)
 *
 * Stat tiles: nodes / synapses / skills / B:S ratio
 * Each skill row shows: name, category, enabled flag, node allocation bar.
 * ▶ ASSESS: 2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ BASIR  at left:1980 bottom:18, zIndex:68.
 * Event:   jarvis:basir-toggle
 * Voice:   "brain skill / skill brain / basir / brain capacity / skill ratio /
 *           brain per skill / neural skill / aip brain / how many skills /
 *           cognitive skill ratio / intelligence ratio skill"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1980;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && Array.isArray(raw.skills))  return raw.skills;
  return [];
}

function classifyRatio(ratio) {
  if (ratio >= 10) return "SURPLUS";
  if (ratio >= 5)  return "BALANCED";
  if (ratio >= 2)  return "STRAINED";
  return "OVERLOADED";
}

function ratioColor(state) {
  if (state === "SURPLUS")    return GREEN;
  if (state === "BALANCED")   return CY;
  if (state === "STRAINED")   return AMBER;
  return RED;
}

// ─── exported brain helpers ───────────────────────────────────────────────────

export function isBasirQuery(q) {
  const t = q.toLowerCase();
  return (
    t.includes("basir") ||
    t.includes("brain skill") ||
    t.includes("skill brain") ||
    t.includes("brain capacity") ||
    t.includes("skill ratio") ||
    t.includes("brain per skill") ||
    t.includes("neural skill") ||
    t.includes("aip brain") ||
    t.includes("cognitive skill ratio") ||
    t.includes("intelligence ratio skill")
  );
}

export async function buildBasirScript() {
  try {
    const base    = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}` };
    const [br, sr] = await Promise.all([
      fetch(`${base}/v1/cinematic/brain`, { headers }).then(r => r.json()).catch(() => ({})),
      fetch(`${base}/v1/aip/skill`,       { headers }).then(r => r.json()).catch(() => []),
    ]);
    const nodes      = br.node_count   || br.nodes      || 0;
    const synapses   = br.synapse_count || br.synapses  || 0;
    const skills     = normArr(sr);
    const skillCount = skills.length || 1;
    const ratio      = nodes > 0 ? (nodes / skillCount).toFixed(1) : "0.0";
    const state      = classifyRatio(parseFloat(ratio));

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `JARVIS brain-skill intelligence ratio: ${nodes} brain nodes, ${synapses} synapses, ${skillCount} AIP skills registered. Brain-to-skill ratio is ${ratio} nodes/skill — state: ${state}. Give a 2-sentence cognitive capacity assessment, formal British butler tone.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
      `Brain-to-skill ratio: ${ratio} nodes per skill — ${state}. ${nodes} brain nodes distributed across ${skillCount} active AIP skills with ${synapses} synaptic connections.`;
  } catch {
    return "Brain-skill ratio analysis unavailable at this time, sir.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function BrainAipSkillRatio() {
  const [open,      setOpen]      = useState(false);
  const [brain,     setBrain]     = useState(null);
  const [skills,    setSkills]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base    = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [br, sr] = await Promise.all([
        fetch(`${base}/v1/cinematic/brain`, { headers }).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/v1/aip/skill`,       { headers }).then(r => r.json()).catch(() => []),
      ]);
      setBrain(br);
      setSkills(normArr(sr));
    } catch (e) {
      setError(String(e.message || e));
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
    window.addEventListener("jarvis:basir-toggle", onToggle);
    return () => window.removeEventListener("jarvis:basir-toggle", onToggle);
  }, []);

  const nodes    = brain?.node_count   || brain?.nodes    || 0;
  const synapses = brain?.synapse_count || brain?.synapses || 0;
  const total    = skills.length;
  const ratio    = total > 0 && nodes > 0 ? nodes / total : 0;
  const state    = classifyRatio(ratio);
  const stateCol = ratioColor(state);

  // Each skill gets an "allocated nodes" share (proportional display)
  const nodesPerSkill = total > 0 ? nodes / total : 0;

  const visible = skills.filter(sk => {
    const q = search.toLowerCase();
    if (q && !String(sk.name || sk.id || "").toLowerCase().includes(q) &&
             !String(sk.description || "").toLowerCase().includes(q) &&
             !String(sk.category || sk.type || "").toLowerCase().includes(q)) return false;
    if (filter === "ENABLED"  && !sk.enabled) return false;
    if (filter === "DISABLED" && sk.enabled)  return false;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const script = await buildBasirScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  }

  const panelW = "min(500px,94vw)";

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Brain × AIP Skill Intelligence Ratio (BASIR)"
        style={{
          position: "fixed",
          left:   BTN_LEFT,
          bottom: 18,
          zIndex: 68,
          fontFamily: MONO,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1,
          padding: "4px 8px",
          borderRadius: 4,
          border: `1px solid ${CY}`,
          background: open ? CY : "rgba(4,7,14,0.85)",
          color: open ? "#000" : CY,
          cursor: "pointer",
          backdropFilter: "blur(6px)",
          whiteSpace: "nowrap",
        }}
      >
        ◈ BASIR
        {state !== "SURPLUS" && state !== "BALANCED" && ratio > 0 && (
          <span style={{
            marginLeft: 5,
            background: stateCol,
            color: "#000",
            borderRadius: 3,
            padding: "0 4px",
            fontSize: 8,
          }}>
            {state === "OVERLOADED" ? "⚠" : "!"}
          </span>
        )}
      </button>

      {/* panel */}
      {open && (
        <div style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 46,
          zIndex: 68,
          width: panelW,
          background: BG,
          border: `1px solid ${CY}55`,
          borderRadius: 10,
          fontFamily: MONO,
          fontSize: 11,
          color: "#DCEBF5",
          display: "flex",
          flexDirection: "column",
          maxHeight: "72vh",
          boxShadow: `0 0 40px ${CY}22`,
        }}>
          {/* header */}
          <div style={{
            padding: "10px 14px 8px",
            borderBottom: `1px solid ${CY}33`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}>
            <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>
              BRAIN × AIP SKILL RATIO
            </span>
            <span style={{
              marginLeft: 4,
              background: stateCol + "22",
              border: `1px solid ${stateCol}44`,
              color: stateCol,
              borderRadius: 4,
              padding: "1px 6px",
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: 1,
            }}>
              {state}
            </span>
            <span style={{ marginLeft: "auto", color: MUTED, fontSize: 9 }}>
              {loading ? "refreshing…" : `${total} skills`}
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 13 }}
            >✕</button>
          </div>

          {/* stat tiles */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 6,
            padding: "8px 14px",
            flexShrink: 0,
          }}>
            {[
              { label: "NODES",    val: nodes,    col: CY },
              { label: "SYNAPSES", val: synapses, col: CY },
              { label: "SKILLS",   val: total,    col: AMBER },
              { label: "B:S RATIO",val: ratio > 0 ? ratio.toFixed(1) : "—", col: stateCol },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                background: `${col}11`,
                border: `1px solid ${col}33`,
                borderRadius: 6,
                padding: "5px 8px",
                textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 15, fontWeight: 700 }}>{val}</div>
                <div style={{ color: MUTED, fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* capacity gauge */}
          <div style={{ padding: "0 14px 8px", flexShrink: 0 }}>
            <div style={{ color: MUTED, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>
              COGNITIVE CAPACITY GAUGE
            </div>
            <div style={{ position: "relative", height: 8, background: `${CY}11`, borderRadius: 4 }}>
              {/* threshold markers */}
              {[2, 5, 10].map(t => {
                const maxRatio = 15;
                const pct = Math.min((t / maxRatio) * 100, 100);
                return (
                  <div key={t} style={{
                    position: "absolute",
                    left: `${pct}%`,
                    top: 0,
                    bottom: 0,
                    width: 1,
                    background: MUTED + "66",
                  }} />
                );
              })}
              <div style={{
                height: 8,
                width: `${Math.min((ratio / 15) * 100, 100)}%`,
                background: stateCol,
                borderRadius: 4,
                transition: "width 0.4s ease",
              }} />
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between",
              color: MUTED, fontSize: 7, marginTop: 2,
            }}>
              <span>OVERLOADED</span>
              <span>STRAINED</span>
              <span>BALANCED</span>
              <span>SURPLUS</span>
            </div>
          </div>

          {/* filter tabs + search */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0 14px 8px",
            flexShrink: 0,
          }}>
            {["ALL", "ENABLED", "DISABLED"].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? CY : "transparent",
                  border: `1px solid ${filter === f ? CY : MUTED + "55"}`,
                  color: filter === f ? "#000" : MUTED,
                  borderRadius: 3,
                  padding: "2px 7px",
                  fontSize: 8,
                  cursor: "pointer",
                  fontFamily: MONO,
                  fontWeight: filter === f ? 700 : 400,
                }}
              >
                {f}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search skills…"
              style={{
                marginLeft: "auto",
                background: "rgba(255,255,255,0.05)",
                border: `1px solid ${MUTED}33`,
                borderRadius: 4,
                color: "#DCEBF5",
                padding: "3px 8px",
                fontSize: 9,
                fontFamily: MONO,
                width: 130,
                outline: "none",
              }}
            />
          </div>

          {/* skill list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {error && (
              <div style={{ color: RED, padding: 12, fontSize: 10 }}>Error: {error}</div>
            )}
            {!error && !loading && visible.length === 0 && (
              <div style={{ color: MUTED, padding: 12, fontSize: 10 }}>No skills match filter.</div>
            )}
            {visible.map((sk, i) => {
              const isEx  = expanded === i;
              const cat   = sk.category || sk.type || sk.skill_type || "";
              const name  = sk.name || sk.skill_name || sk.id || `Skill ${i + 1}`;
              const enab  = sk.enabled !== false;
              const enCol = enab ? GREEN : MUTED;

              return (
                <div key={i} style={{
                  borderBottom: `1px solid ${CY}0D`,
                  cursor: "pointer",
                }} onClick={() => setExpanded(isEx ? null : i)}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 12px",
                  }}>
                    <span style={{
                      background: enCol + "22", color: enCol,
                      borderRadius: 3, padding: "1px 5px",
                      fontSize: 8, flexShrink: 0,
                    }}>
                      {enab ? "ON" : "OFF"}
                    </span>
                    {cat && (
                      <span style={{
                        background: CY + "11", color: CY,
                        borderRadius: 3, padding: "1px 5px",
                        fontSize: 8, flexShrink: 0,
                        maxWidth: 80, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {String(cat).toUpperCase().slice(0, 10)}
                      </span>
                    )}
                    <span style={{ color: "#DCEBF5", flex: 1, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </span>
                    <span style={{ color: MUTED, fontSize: 8 }}>
                      ~{nodesPerSkill.toFixed(0)} nodes
                    </span>
                    <span style={{ color: MUTED, fontSize: 9 }}>{isEx ? "▲" : "▼"}</span>
                  </div>

                  {/* node allocation bar */}
                  <div style={{ padding: "0 12px 6px 12px" }}>
                    <div style={{ height: 2, background: `${CY}11`, borderRadius: 1 }}>
                      <div style={{
                        height: 2,
                        width: `${Math.min((nodesPerSkill / Math.max(nodes, 1)) * total * 100, 100)}%`,
                        background: stateCol,
                        borderRadius: 1,
                      }} />
                    </div>
                  </div>

                  {isEx && (
                    <div style={{
                      padding: "0 12px 8px 12px",
                      background: "rgba(255,255,255,0.02)",
                    }}>
                      {sk.description && (
                        <div style={{ color: MUTED, fontSize: 9, lineHeight: 1.4, marginBottom: 4 }}>
                          {sk.description}
                        </div>
                      )}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {sk.version && (
                          <span style={{ color: MUTED, fontSize: 8 }}>v{sk.version}</span>
                        )}
                        {sk.model && (
                          <span style={{ color: CY, fontSize: 8 }}>{sk.model}</span>
                        )}
                        {sk.skill_type && (
                          <span style={{ color: AMBER, fontSize: 8 }}>{sk.skill_type}</span>
                        )}
                        <span style={{ color: stateCol, fontSize: 8 }}>
                          ~{nodesPerSkill.toFixed(1)} nodes allocated
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* footer */}
          <div style={{
            borderTop: `1px solid ${CY}22`, padding: "5px 12px",
            color: MUTED, fontSize: 9, letterSpacing: 1, flexShrink: 0,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span>BRAIN × SKILLS — {visible.length}/{total} skills · ratio {ratio > 0 ? ratio.toFixed(1) : "—"}</span>
            <button
              onClick={e => { e.stopPropagation(); assess(); }}
              disabled={assessing}
              style={{
                background: assessing ? "transparent" : `${CY}22`,
                border: `1px solid ${CY}44`,
                color: CY, borderRadius: 4, padding: "2px 8px",
                fontSize: 8, cursor: "pointer", fontFamily: MONO,
                opacity: assessing ? 0.5 : 1,
              }}
            >
              {assessing ? "assessing…" : "▶ ASSESS"}
            </button>
            <span>auto-refresh 60s</span>
          </div>
        </div>
      )}
    </>
  );
}
