/**
 * OntologyUpsertPanel — F291
 * ◈ ONTUPSERT button: left 210760, bottom 8, zIndex 387
 * Toggle: window.dispatchEvent(new Event("jarvis:ontupsert-toggle"))
 * Voice triggers: "ontology upsert", "ontupsert", "upsert object", "create object",
 *                 "edit object", "link objects", "ontology create"
 * Data: GET /v1/ontology/objects | GET /v1/ontology/types
 *       POST /v1/ontology/objects | POST /v1/ontology/links
 * ASSESS: speaks about recent ontology updates + TTS via /v1/voice/tts
 */
import { useState, useEffect, useCallback } from "react";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const PU   = "#A78BFA";
const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";

const BTN_LEFT = 210760;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  return (
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
    "http://localhost:8000"
  );
}

const ONTUPSERT_RE =
  /\b(ontology\s+upsert|ontupsert\b|upsert\s+object|create\s+object|edit\s+object|link\s+objects?|ontology\s+create|ontology\s+edit|object\s+upsert|new\s+ontology\s+object)\b/i;

export function isOntupsertQuery(q) {
  return ONTUPSERT_RE.test(q || "");
}

const MARK_OPTIONS = ["PUBLIC", "INTERNAL", "SECRET", "RESTRICTED"];

const MARK_COLORS = {
  PUBLIC:     GN,
  INTERNAL:   CY,
  SECRET:     RD,
  RESTRICTED: AM,
};

function markColor(m) {
  return MARK_COLORS[(m || "").toUpperCase()] || CY;
}

async function speak(text) {
  try {
    const res = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play().catch(() => {});
  } catch {}
}

function genId() {
  return "obj-" + Math.random().toString(36).slice(2, 10);
}

const EMPTY_FORM = { id: "", type: "", label: "", mark: "PUBLIC", props: "{}" };
const EMPTY_LINK = { src: "", dst: "", relation: "", strength: "0.8" };

export default function OntologyUpsertPanel() {
  const [open, setOpen]         = useState(false);
  const [tab, setTab]           = useState("upsert"); // "upsert" | "link"

  /* object list */
  const [objects, setObjects]   = useState([]);
  const [types, setTypes]       = useState([]);
  const [search, setSearch]     = useState("");
  const [loadingList, setLL]    = useState(false);

  /* form */
  const [form, setForm]         = useState({ ...EMPTY_FORM });
  const [propsErr, setPropsErr] = useState("");
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState(null); // { ok, msg }

  /* link form */
  const [link, setLink]         = useState({ ...EMPTY_LINK });
  const [linking, setLinking]   = useState(false);

  /* assess */
  const [assessing, setAssessing] = useState(false);

  const showToast = useCallback((ok, msg) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchObjects = useCallback(async () => {
    setLL(true);
    try {
      const res = await fetch(`${apiBase()}/v1/ontology/objects`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      const arr  = Array.isArray(data)
        ? data
        : Array.isArray(data.objects)
          ? data.objects
          : [];
      setObjects(arr);
    } catch {
      setObjects([]);
    } finally {
      setLL(false);
    }
  }, []);

  const fetchTypes = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase()}/v1/ontology/types`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const arr  = Array.isArray(data)
        ? data
        : Array.isArray(data.types)
          ? data.types
          : [];
      setTypes(arr.map((t) => (typeof t === "string" ? t : t.name || String(t))));
    } catch {}
  }, []);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:ontupsert-toggle", handler);
    return () => window.removeEventListener("jarvis:ontupsert-toggle", handler);
  }, []);

  useEffect(() => {
    if (open) {
      fetchObjects();
      fetchTypes();
    }
  }, [open, fetchObjects, fetchTypes]);

  /* prefill form from selected object */
  function selectObject(obj) {
    let propsStr = "{}";
    try {
      propsStr = JSON.stringify(obj.props ?? {}, null, 2);
    } catch {}
    setForm({
      id:    obj.id || obj.object_id || "",
      type:  obj.type || obj.object_type || "",
      label: obj.label || obj.name || "",
      mark:  (obj.mark || "PUBLIC").toUpperCase(),
      props: propsStr,
    });
    setPropsErr("");
    setTab("upsert");
  }

  function clearForm() {
    setForm({ ...EMPTY_FORM, id: genId() });
    setPropsErr("");
  }

  async function handleSave() {
    let parsedProps = {};
    try {
      parsedProps = JSON.parse(form.props || "{}");
    } catch {
      setPropsErr("Invalid JSON in props");
      return;
    }
    setPropsErr("");
    setSaving(true);
    try {
      const body = {
        id:    form.id || genId(),
        type:  form.type,
        label: form.label,
        mark:  form.mark,
        props: parsedProps,
      };
      const res = await fetch(`${apiBase()}/v1/ontology/objects`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${API_KEY}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`${res.status}: ${txt.slice(0, 120)}`);
      }
      showToast(true, `Object "${form.label || form.id}" saved.`);
      await fetchObjects();
    } catch (e) {
      showToast(false, String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleLink() {
    if (!link.src || !link.dst || !link.relation) {
      showToast(false, "Source, target, and relation are required.");
      return;
    }
    setLinking(true);
    try {
      const body = {
        source_id:   link.src,
        target_id:   link.dst,
        relation:    link.relation,
        strength:    parseFloat(link.strength) || 0.8,
      };
      const res = await fetch(`${apiBase()}/v1/ontology/links`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${API_KEY}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`${res.status}: ${txt.slice(0, 120)}`);
      }
      showToast(true, `Link "${link.src} → ${link.dst}" created.`);
      setLink({ ...EMPTY_LINK });
    } catch (e) {
      showToast(false, String(e));
    } finally {
      setLinking(false);
    }
  }

  async function handleAssess() {
    setAssessing(true);
    try {
      const recent = objects.slice(0, 5).map((o) => o.label || o.id).join(", ");
      const prompt = `Summarize ontology state: ${objects.length} objects loaded. Recent: ${recent || "none"}. Describe coverage and suggest next update in 2 sentences.`;
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      const msg  = data.response || data.message || data.content || "Assessment complete.";
      speak(msg);
    } catch {
      speak("Ontology assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  const filtered = objects.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (o.label || o.name || "").toLowerCase().includes(q) ||
      (o.type  || o.object_type || "").toLowerCase().includes(q) ||
      (o.id    || o.object_id   || "").toLowerCase().includes(q)
    );
  });

  const objIds = objects.map((o) => o.id || o.object_id || "").filter(Boolean);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position:    "fixed",
          left:        BTN_LEFT,
          bottom:      8,
          zIndex:      387,
          background:  "rgba(10,18,28,0.82)",
          border:      `1px solid ${BORD}`,
          borderRadius: 6,
          color:       CY,
          fontSize:    11,
          padding:     "4px 10px",
          cursor:      "pointer",
          whiteSpace:  "nowrap",
          fontFamily:  "monospace",
          letterSpacing: "0.04em",
        }}
      >
        ◈ ONTUPSERT
      </button>
    );
  }

  return (
    <div
      style={{
        position:    "fixed",
        left:        BTN_LEFT,
        bottom:      44,
        zIndex:      387,
        width:       640,
        maxHeight:   520,
        background:  SURF,
        border:      `1px solid ${BORD}`,
        borderRadius: 10,
        display:     "flex",
        flexDirection: "column",
        fontFamily:  "monospace",
        fontSize:    12,
        color:       "#C8D8F0",
        boxShadow:   "0 4px 32px rgba(0,0,0,0.7)",
        overflow:    "hidden",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${BORD}` }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 13 }}>◈ ONTOLOGY UPSERT</span>
        <span style={{ color: "#6B7E99", fontSize: 11 }}>{objects.length} objects</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button
            onClick={handleAssess}
            disabled={assessing}
            style={{
              background: assessing ? "rgba(41,231,255,0.08)" : "rgba(41,231,255,0.15)",
              border: `1px solid ${CY}40`,
              borderRadius: 5,
              color: CY,
              fontSize: 11,
              padding: "2px 8px",
              cursor: "pointer",
            }}
          >
            {assessing ? "..." : "▶ ASSESS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: "#6B7E99", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* toast */}
      {toast && (
        <div style={{
          padding:     "6px 12px",
          background:  toast.ok ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
          color:       toast.ok ? GN : RD,
          fontSize:    11,
          borderBottom: `1px solid ${BORD}`,
        }}>
          {toast.ok ? "✓" : "✗"} {toast.msg}
        </div>
      )}

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* left: object list */}
        <div style={{ width: 200, borderRight: `1px solid ${BORD}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "6px 8px", borderBottom: `1px solid ${BORD}` }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search objects…"
              style={{
                width:       "100%",
                background:  "rgba(41,231,255,0.06)",
                border:      `1px solid ${BORD}`,
                borderRadius: 4,
                color:       "#C8D8F0",
                fontSize:    11,
                padding:     "3px 6px",
                outline:     "none",
                boxSizing:   "border-box",
              }}
            />
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
            {loadingList ? (
              <div style={{ padding: 8, color: "#6B7E99" }}>Loading…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 8, color: "#6B7E99" }}>No objects</div>
            ) : filtered.map((o, i) => {
              const id  = o.id || o.object_id || "";
              const lbl = o.label || o.name || id;
              const typ = o.type || o.object_type || "";
              const mrk = (o.mark || "").toUpperCase();
              return (
                <div
                  key={id || i}
                  onClick={() => selectObject(o)}
                  style={{
                    padding:    "5px 10px",
                    cursor:     "pointer",
                    borderBottom: `1px solid rgba(41,231,255,0.06)`,
                    background: form.id === id ? "rgba(41,231,255,0.08)" : "transparent",
                  }}
                >
                  <div style={{ color: CY, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lbl}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                    {typ && <span style={{ background: "rgba(41,231,255,0.1)", borderRadius: 3, padding: "0 4px", fontSize: 10, color: CY }}>{typ}</span>}
                    {mrk && <span style={{ background: `${markColor(mrk)}18`, borderRadius: 3, padding: "0 4px", fontSize: 10, color: markColor(mrk) }}>{mrk}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* right: form area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* tab bar */}
          <div style={{ display: "flex", borderBottom: `1px solid ${BORD}` }}>
            {["upsert", "link"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex:      1,
                  background: tab === t ? "rgba(41,231,255,0.1)" : "transparent",
                  border:    "none",
                  borderBottom: tab === t ? `2px solid ${CY}` : "2px solid transparent",
                  color:     tab === t ? CY : "#6B7E99",
                  fontSize:  11,
                  padding:   "6px 0",
                  cursor:    "pointer",
                  fontFamily: "monospace",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {t === "upsert" ? "✎ Object" : "⊕ Link Objects"}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
            {tab === "upsert" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#6B7E99", fontSize: 10, marginBottom: 2 }}>ID</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <input
                        value={form.id}
                        onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                        style={inputStyle}
                      />
                      <button
                        onClick={() => setForm((f) => ({ ...f, id: genId() }))}
                        style={{ ...btnSmall, color: AM }}
                      >
                        ⟳
                      </button>
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#6B7E99", fontSize: 10, marginBottom: 2 }}>TYPE</div>
                    {types.length > 0 ? (
                      <select
                        value={form.type}
                        onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                        style={inputStyle}
                      >
                        <option value="">— select type —</option>
                        {types.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    ) : (
                      <input
                        value={form.type}
                        onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                        placeholder="e.g. Contact"
                        style={inputStyle}
                      />
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 2 }}>
                    <div style={{ color: "#6B7E99", fontSize: 10, marginBottom: 2 }}>LABEL</div>
                    <input
                      value={form.label}
                      onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                      placeholder="Human-readable label"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#6B7E99", fontSize: 10, marginBottom: 2 }}>MARK</div>
                    <select
                      value={form.mark}
                      onChange={(e) => setForm((f) => ({ ...f, mark: e.target.value }))}
                      style={{ ...inputStyle, color: markColor(form.mark) }}
                    >
                      {MARK_OPTIONS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <div style={{ color: "#6B7E99", fontSize: 10, marginBottom: 2 }}>PROPS (JSON)</div>
                  <textarea
                    value={form.props}
                    onChange={(e) => setForm((f) => ({ ...f, props: e.target.value }))}
                    rows={5}
                    style={{
                      ...inputStyle,
                      display:    "block",
                      width:      "100%",
                      resize:     "vertical",
                      fontFamily: "monospace",
                      boxSizing:  "border-box",
                    }}
                  />
                  {propsErr && <div style={{ color: RD, fontSize: 10, marginTop: 2 }}>{propsErr}</div>}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      ...btnSmall,
                      flex: 1,
                      background: "rgba(74,222,128,0.15)",
                      border: `1px solid ${GN}50`,
                      color: GN,
                      padding: "5px 0",
                      fontSize: 12,
                    }}
                  >
                    {saving ? "Saving…" : "💾 Save Object"}
                  </button>
                  <button
                    onClick={clearForm}
                    style={{
                      ...btnSmall,
                      background: "rgba(248,113,113,0.1)",
                      border: `1px solid ${RD}40`,
                      color: RD,
                      padding: "5px 12px",
                      fontSize: 12,
                    }}
                  >
                    ✕ New
                  </button>
                </div>
              </div>
            ) : (
              /* Link tab */
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <div style={{ color: "#6B7E99", fontSize: 10, marginBottom: 2 }}>SOURCE OBJECT ID</div>
                  <select
                    value={link.src}
                    onChange={(e) => setLink((l) => ({ ...l, src: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">— select source —</option>
                    {objIds.map((id) => <option key={id} value={id}>{id}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ color: "#6B7E99", fontSize: 10, marginBottom: 2 }}>TARGET OBJECT ID</div>
                  <select
                    value={link.dst}
                    onChange={(e) => setLink((l) => ({ ...l, dst: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">— select target —</option>
                    {objIds.map((id) => <option key={id} value={id}>{id}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 2 }}>
                    <div style={{ color: "#6B7E99", fontSize: 10, marginBottom: 2 }}>RELATION</div>
                    <input
                      value={link.relation}
                      onChange={(e) => setLink((l) => ({ ...l, relation: e.target.value }))}
                      placeholder="e.g. OWNS, LINKED_TO"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#6B7E99", fontSize: 10, marginBottom: 2 }}>STRENGTH (0–1)</div>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={link.strength}
                      onChange={(e) => setLink((l) => ({ ...l, strength: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                </div>
                <button
                  onClick={handleLink}
                  disabled={linking}
                  style={{
                    ...btnSmall,
                    background: "rgba(167,139,250,0.15)",
                    border: `1px solid ${PU}50`,
                    color: PU,
                    padding: "6px 0",
                    fontSize: 12,
                    width: "100%",
                    marginTop: 4,
                  }}
                >
                  {linking ? "Linking…" : "⊕ Create Link"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* footer button */}
      <button
        onClick={() => setOpen(false)}
        style={{
          position:    "absolute",
          left:        0,
          bottom:      -36,
          width:       "auto",
          background:  "rgba(10,18,28,0.82)",
          border:      `1px solid ${BORD}`,
          borderRadius: 6,
          color:       CY,
          fontSize:    11,
          padding:     "4px 10px",
          cursor:      "pointer",
          fontFamily:  "monospace",
          letterSpacing: "0.04em",
        }}
      >
        ◈ ONTUPSERT
      </button>
    </div>
  );
}

const inputStyle = {
  width:       "100%",
  background:  "rgba(41,231,255,0.06)",
  border:      "1px solid rgba(41,231,255,0.18)",
  borderRadius: 4,
  color:       "#C8D8F0",
  fontSize:    11,
  padding:     "4px 6px",
  outline:     "none",
  boxSizing:   "border-box",
  fontFamily:  "monospace",
};

const btnSmall = {
  background:  "rgba(41,231,255,0.08)",
  border:      "1px solid rgba(41,231,255,0.2)",
  borderRadius: 4,
  color:       "#C8D8F0",
  fontSize:    11,
  padding:     "2px 8px",
  cursor:      "pointer",
  fontFamily:  "monospace",
};
