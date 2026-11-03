import { useState, useEffect, useCallback } from "react";

const CY = "#29E7FF";
const AM = "#F5A623";
const GN = "#4ADE80";
const RD = "#F87171";
const PU = "#A78BFA";
const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";

const API_BASE = import.meta.env?.VITE_API_BASE || "http://localhost:8000";
const API_KEY  = import.meta.env?.VITE_API_KEY  || "dev-key";

function genId() { return "obj-" + Math.random().toString(36).slice(2, 10); }

const MARK_OPTIONS = ["PUBLIC", "INTERNAL", "SECRET", "RESTRICTED"];

async function speak(text) {
  try {
    const r = await fetch(`${API_BASE}/v1/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.onended = () => URL.revokeObjectURL(url);
    a.play();
  } catch (_) {}
}

export function isOntcreateQuery(q) {
  if (!q) return false;
  const s = q.toLowerCase();
  return (
    s.includes("ontcreate") ||
    s.includes("create ontology") ||
    s.includes("new ontology") ||
    s.includes("create object") ||
    s.includes("new object") ||
    s.includes("ontology creator") ||
    s.includes("add ontology") ||
    s.includes("ontology object creator")
  );
}

export default function OntologyObjectCreator() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("create");

  // types
  const [types, setTypes] = useState([]);

  // create form
  const [objId, setObjId] = useState(genId());
  const [objType, setObjType] = useState("");
  const [objLabel, setObjLabel] = useState("");
  const [objMark, setObjMark] = useState("INTERNAL");
  const [props, setProps] = useState([{ k: "", v: "" }]);
  const [showPreview, setShowPreview] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");
  const [recentCreations, setRecentCreations] = useState([]);

  // link form
  const [linkSrcId, setLinkSrcId] = useState("");
  const [linkDstId, setLinkDstId] = useState("");
  const [linkRel, setLinkRel] = useState("relates_to");
  const [linkStrength, setLinkStrength] = useState(0.8);
  const [linking, setLinking] = useState(false);
  const [linkMsg, setLinkMsg] = useState("");

  // assess
  const [assessing, setAssessing] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:ontcreate-toggle", handler);
    return () => window.removeEventListener("jarvis:ontcreate-toggle", handler);
  }, []);

  const loadTypes = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/v1/ontology/types`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) return;
      const d = await r.json();
      const arr = Array.isArray(d) ? d : (d.types || d.data || []);
      setTypes(arr.map(t => (typeof t === "string" ? t : t.name || t.id || String(t))));
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (open) loadTypes();
  }, [open, loadTypes]);

  function addPropRow() { setProps(p => [...p, { k: "", v: "" }]); }
  function removePropRow(i) { setProps(p => p.filter((_, idx) => idx !== i)); }
  function updateProp(i, field, val) {
    setProps(p => p.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  }

  function buildPropsObj() {
    const obj = {};
    for (const { k, v } of props) { if (k.trim()) obj[k.trim()] = v; }
    return obj;
  }

  async function handleCreate() {
    if (!objId.trim() || !objLabel.trim()) { setCreateErr("ID and Label are required."); return; }
    setCreating(true);
    setCreateErr("");
    const payload = {
      id: objId.trim(),
      type: objType || undefined,
      label: objLabel.trim(),
      mark: objMark,
      props: buildPropsObj(),
    };
    try {
      const r = await fetch(`${API_BASE}/v1/ontology/objects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setCreateErr(d.detail || d.error || `Error ${r.status}`); return; }
      const created = { ...payload, created_at: new Date().toISOString() };
      setRecentCreations(rc => [created, ...rc].slice(0, 20));
      setObjId(genId());
      setObjLabel("");
      setObjType("");
      setProps([{ k: "", v: "" }]);
      setShowPreview(false);
      speak(`Object ${created.label} created in ontology.`);
    } catch (e) {
      setCreateErr(String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleLink() {
    if (!linkSrcId.trim() || !linkDstId.trim() || !linkRel.trim()) {
      setLinkMsg("Source ID, Target ID and Relation are required.");
      return;
    }
    setLinking(true);
    setLinkMsg("");
    try {
      const r = await fetch(`${API_BASE}/v1/ontology/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          source_id: linkSrcId.trim(),
          target_id: linkDstId.trim(),
          relation: linkRel.trim(),
          strength: parseFloat(linkStrength) || 0.8,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setLinkMsg(d.detail || d.error || `Error ${r.status}`); return; }
      setLinkMsg(`Link created: ${linkSrcId} → ${linkDstId} (${linkRel})`);
      speak(`Link from ${linkSrcId} to ${linkDstId} created.`);
    } catch (e) {
      setLinkMsg(String(e));
    } finally {
      setLinking(false);
    }
  }

  async function handleAssess() {
    setAssessing(true);
    const summary = recentCreations.length
      ? `Recently created: ${recentCreations.slice(0, 3).map(o => o.label).join(", ")}.`
      : "No objects created yet in this session.";
    try {
      const r = await fetch(`${API_BASE}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Assess the ontology objects created this session: ${summary} What are the implications for the knowledge graph?` }),
      });
      const d = await r.json().catch(() => ({}));
      const reply = d.response || d.message || d.content || "Assessment unavailable.";
      await speak(reply.slice(0, 300));
    } catch (_) {
      await speak("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  const markColor = { PUBLIC: GN, INTERNAL: CY, SECRET: RD, RESTRICTED: AM };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: 219160, zIndex: 402,
          background: "rgba(10,18,28,0.92)", border: `1px solid ${BORD}`,
          color: CY, fontFamily: "monospace", fontSize: 10, fontWeight: 700,
          padding: "3px 7px", borderRadius: 4, cursor: "pointer", letterSpacing: 1,
        }}
      >◈ ONTCREATE</button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(false)}
        style={{
          position: "fixed", bottom: 8, left: 219160, zIndex: 402,
          background: `rgba(41,231,255,0.15)`, border: `1px solid ${CY}`,
          color: CY, fontFamily: "monospace", fontSize: 10, fontWeight: 700,
          padding: "3px 7px", borderRadius: 4, cursor: "pointer", letterSpacing: 1,
        }}
      >◈ ONTCREATE</button>

      <div style={{
        position: "fixed", bottom: 44, left: 219160, zIndex: 402,
        width: 560, maxHeight: 580, background: SURF,
        border: `1px solid ${BORD}`, borderRadius: 8, display: "flex",
        flexDirection: "column", fontFamily: "monospace", fontSize: 12,
        boxShadow: `0 0 24px rgba(41,231,255,0.12)`, overflow: "hidden",
      }}>
        {/* header */}
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${BORD}`, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: CY, fontWeight: 700, fontSize: 13 }}>◈ ONTOLOGY OBJECT CREATOR</span>
          <button
            onClick={handleAssess}
            disabled={assessing}
            style={{ marginLeft: "auto", ...btnSmall, color: PU, borderColor: PU }}
          >{assessing ? "…" : "ASSESS"}</button>
          <button onClick={() => setOpen(false)} style={{ ...btnSmall, color: RD, borderColor: RD }}>✕</button>
        </div>

        {/* tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${BORD}` }}>
          {["create", "link"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "6px 0", background: tab === t ? "rgba(41,231,255,0.08)" : "transparent",
              border: "none", borderBottom: tab === t ? `2px solid ${CY}` : "2px solid transparent",
              color: tab === t ? CY : "rgba(41,231,255,0.5)", cursor: "pointer",
              fontFamily: "monospace", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
            }}>{t}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {tab === "create" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* ID row */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <label style={{ color: "rgba(41,231,255,0.6)", width: 60, flexShrink: 0 }}>ID</label>
                <input value={objId} onChange={e => setObjId(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => setObjId(genId())} style={{ ...btnSmall, color: AM, borderColor: AM }}>GEN</button>
              </div>

              {/* Type */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <label style={{ color: "rgba(41,231,255,0.6)", width: 60, flexShrink: 0 }}>Type</label>
                <select value={objType} onChange={e => setObjType(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                  <option value="">— select type —</option>
                  {types.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Label */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <label style={{ color: "rgba(41,231,255,0.6)", width: 60, flexShrink: 0 }}>Label</label>
                <input value={objLabel} onChange={e => setObjLabel(e.target.value)}
                  placeholder="human-readable name" style={{ ...inputStyle, flex: 1 }} />
              </div>

              {/* Mark */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <label style={{ color: "rgba(41,231,255,0.6)", width: 60, flexShrink: 0 }}>Mark</label>
                <div style={{ display: "flex", gap: 4 }}>
                  {MARK_OPTIONS.map(m => (
                    <button key={m} onClick={() => setObjMark(m)} style={{
                      padding: "2px 8px", borderRadius: 3, cursor: "pointer", fontFamily: "monospace",
                      fontSize: 10, fontWeight: 700, border: `1px solid ${markColor[m]}`,
                      background: objMark === m ? markColor[m] + "33" : "transparent",
                      color: markColor[m],
                    }}>{m}</button>
                  ))}
                </div>
              </div>

              {/* Props editor */}
              <div>
                <div style={{ color: "rgba(41,231,255,0.6)", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  Props
                  <button onClick={addPropRow} style={{ ...btnSmall, color: GN, borderColor: GN, padding: "1px 6px" }}>+ row</button>
                </div>
                {props.map((row, i) => (
                  <div key={i} style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                    <input value={row.k} onChange={e => updateProp(i, "k", e.target.value)}
                      placeholder="key" style={{ ...inputStyle, flex: 1 }} />
                    <input value={row.v} onChange={e => updateProp(i, "v", e.target.value)}
                      placeholder="value" style={{ ...inputStyle, flex: 2 }} />
                    <button onClick={() => removePropRow(i)} style={{ ...btnSmall, color: RD, borderColor: RD, padding: "1px 6px" }}>−</button>
                  </div>
                ))}
              </div>

              {/* Preview toggle */}
              <button onClick={() => setShowPreview(v => !v)} style={{ ...btnSmall, color: CY, borderColor: CY, alignSelf: "flex-start" }}>
                {showPreview ? "Hide Preview" : "Preview"}
              </button>

              {showPreview && (
                <div style={{ background: "rgba(41,231,255,0.05)", border: `1px solid ${BORD}`, borderRadius: 6, padding: 10 }}>
                  <div style={{ color: CY, fontWeight: 700, marginBottom: 4 }}>{objLabel || "(no label)"}</div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                    {objType && <span style={{ color: AM, fontSize: 10 }}>{objType}</span>}
                    <span style={{ color: markColor[objMark], fontSize: 10, fontWeight: 700 }}>{objMark}</span>
                    <span style={{ color: "rgba(41,231,255,0.5)", fontSize: 10 }}>{objId}</span>
                  </div>
                  {Object.keys(buildPropsObj()).length > 0 && (
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>
                      {Object.entries(buildPropsObj()).map(([k, v]) => (
                        <div key={k}><span style={{ color: CY }}>{k}</span>: {String(v)}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {createErr && <div style={{ color: RD, fontSize: 11 }}>{createErr}</div>}

              <button onClick={handleCreate} disabled={creating} style={{
                padding: "6px 16px", background: `rgba(41,231,255,0.12)`,
                border: `1px solid ${CY}`, color: CY, borderRadius: 4, cursor: "pointer",
                fontFamily: "monospace", fontSize: 12, fontWeight: 700, alignSelf: "flex-start",
              }}>{creating ? "Creating…" : "Create Object"}</button>

              {/* Recent creations */}
              {recentCreations.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ color: "rgba(41,231,255,0.6)", fontSize: 10, marginBottom: 4 }}>RECENT CREATIONS ({recentCreations.length})</div>
                  <div style={{ maxHeight: 120, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                    {recentCreations.map((rc, i) => (
                      <div key={i} style={{
                        background: "rgba(41,231,255,0.04)", border: `1px solid ${BORD}`,
                        borderRadius: 4, padding: "4px 8px", display: "flex", gap: 8, alignItems: "center",
                      }}>
                        <span style={{ color: GN, fontSize: 9 }}>✓</span>
                        <span style={{ color: CY, fontWeight: 700, fontSize: 11 }}>{rc.label}</span>
                        {rc.type && <span style={{ color: AM, fontSize: 9 }}>{rc.type}</span>}
                        <span style={{ color: markColor[rc.mark] || "gray", fontSize: 9 }}>{rc.mark}</span>
                        <span style={{ color: "rgba(41,231,255,0.4)", fontSize: 9, marginLeft: "auto" }}>{rc.id}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "link" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <label style={{ color: "rgba(41,231,255,0.6)", width: 80, flexShrink: 0 }}>Source ID</label>
                <input value={linkSrcId} onChange={e => setLinkSrcId(e.target.value)}
                  placeholder="obj-xxxxxxxx" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <label style={{ color: "rgba(41,231,255,0.6)", width: 80, flexShrink: 0 }}>Target ID</label>
                <input value={linkDstId} onChange={e => setLinkDstId(e.target.value)}
                  placeholder="obj-xxxxxxxx" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <label style={{ color: "rgba(41,231,255,0.6)", width: 80, flexShrink: 0 }}>Relation</label>
                <input value={linkRel} onChange={e => setLinkRel(e.target.value)}
                  placeholder="relates_to" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <label style={{ color: "rgba(41,231,255,0.6)", width: 80, flexShrink: 0 }}>Strength</label>
                <input type="range" min={0} max={1} step={0.05} value={linkStrength}
                  onChange={e => setLinkStrength(e.target.value)} style={{ flex: 1 }} />
                <span style={{ color: CY, width: 32, textAlign: "right" }}>{parseFloat(linkStrength).toFixed(2)}</span>
              </div>
              {linkMsg && (
                <div style={{ color: linkMsg.startsWith("Link created") ? GN : RD, fontSize: 11 }}>{linkMsg}</div>
              )}
              <button onClick={handleLink} disabled={linking} style={{
                padding: "6px 16px", background: "rgba(41,231,255,0.12)",
                border: `1px solid ${CY}`, color: CY, borderRadius: 4, cursor: "pointer",
                fontFamily: "monospace", fontSize: 12, fontWeight: 700, alignSelf: "flex-start",
              }}>{linking ? "Linking…" : "Create Link"}</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const inputStyle = {
  background: "rgba(41,231,255,0.06)", border: `1px solid ${BORD}`,
  color: "#e0f7ff", borderRadius: 4, padding: "4px 8px",
  fontFamily: "monospace", fontSize: 11, outline: "none",
};

const btnSmall = {
  background: "transparent", border: `1px solid ${BORD}`,
  color: CY, borderRadius: 3, padding: "2px 8px",
  fontFamily: "monospace", fontSize: 10, fontWeight: 700,
  cursor: "pointer",
};
