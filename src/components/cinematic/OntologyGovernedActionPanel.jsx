/**
 * OntologyGovernedActionPanel — F311.
 *
 * EVAL-RUNNER + CRUD-PANEL for governed ontology object actions.
 *
 * Flow:
 *   1. GET /v1/ontology/objects → object search + select
 *   2. GET /v1/ontology/objects/{id}/actions → available action types
 *   3. Apply Action form: action_type select + payload JSON editor
 *   4. Execute → POST /v1/ontology/objects/{id}/actions → result panel
 *   5. GET /v1/audit (last 20 entries) → action history log
 *   6. Rollback Proposal → POST /v1/jarvis/agent/chat (annotation only, no auto-rollback)
 *   7. ASSESS → POST /v1/jarvis/agent/chat + TTS
 *
 * Button: ◈ ONTGOV (left:221960, zIndex:407). Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const RED   = "#FF3B6B";
const GREEN = "#00c878";
const GREY  = "#8899aa";

const BTN_LEFT = 221960;
const Z_IDX    = 407;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── intent helpers ────────────────────────────────────────────────────────────

const ONTGOV_RE = /ontolog.{0,20}(?:action|govern|exec)|ontgov\b/i;

export function isOntgovQuery(q) {
  return ONTGOV_RE.test(q || "");
}

// ── api helpers ───────────────────────────────────────────────────────────────

const H = () => ({ Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" });

async function fetchObjects(query = "") {
  const url = query
    ? `${apiBase()}/v1/ontology/objects?q=${encodeURIComponent(query)}&limit=40`
    : `${apiBase()}/v1/ontology/objects?limit=40`;
  const r = await fetch(url, { headers: H() });
  if (!r.ok) throw new Error(`objects ${r.status}`);
  const d = await r.json();
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.objects)) return d.objects;
  if (Array.isArray(d.items)) return d.items;
  return [];
}

async function fetchActions(objectId) {
  const r = await fetch(`${apiBase()}/v1/ontology/objects/${objectId}/actions`, { headers: H() });
  if (!r.ok) throw new Error(`actions ${r.status}`);
  const d = await r.json();
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.actions)) return d.actions;
  if (Array.isArray(d.items)) return d.items;
  return [];
}

async function executeAction(objectId, action_type, payload) {
  const r = await fetch(`${apiBase()}/v1/ontology/objects/${objectId}/actions`, {
    method: "POST",
    headers: H(),
    body: JSON.stringify({ action_type, payload }),
  });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: d };
}

async function fetchAudit() {
  const r = await fetch(`${apiBase()}/v1/audit?limit=20`, { headers: H() });
  if (!r.ok) throw new Error(`audit ${r.status}`);
  const d = await r.json();
  if (Array.isArray(d)) return d;
  if (Array.isArray(d.entries)) return d.entries;
  if (Array.isArray(d.items)) return d.items;
  if (Array.isArray(d.logs)) return d.logs;
  return [];
}

async function askJarvis(prompt) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST", headers: H(), body: JSON.stringify({ message: prompt }),
  });
  const d = await r.json().catch(() => ({}));
  return d.response || d.message || d.answer || d.text || JSON.stringify(d);
}

async function speak(text) {
  try {
    const r = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST", headers: H(), body: JSON.stringify({ text }),
    });
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.play();
    a.onended = () => URL.revokeObjectURL(url);
  } catch {}
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function objLabel(o) {
  return o.label || o.name || o.title || o.id || "unknown";
}

function objId(o) {
  return o.id || o.object_id || "";
}

function actionType(a) {
  return typeof a === "string" ? a : a.action_type || a.type || a.name || JSON.stringify(a);
}

function auditText(e) {
  return e.action || e.event || e.operation || e.message || e.type || JSON.stringify(e);
}

function auditTs(e) {
  const t = e.timestamp || e.created_at || e.ts || e.time || "";
  if (!t) return "";
  try { return new Date(t).toLocaleTimeString(); } catch { return String(t).slice(0, 16); }
}

// ── styles ────────────────────────────────────────────────────────────────────

const panelStyle = {
  position: "fixed",
  left: BTN_LEFT,
  top: 60,
  width: 540,
  maxHeight: "84vh",
  overflowY: "auto",
  background: "rgba(0,8,20,0.97)",
  border: `1px solid ${CY}44`,
  borderRadius: 10,
  padding: "14px 16px",
  zIndex: Z_IDX,
  fontFamily: "monospace",
  color: CY,
  fontSize: 12,
};

const btnBase = {
  background: "none", border: `1px solid ${CY}66`, borderRadius: 4,
  color: CY, fontFamily: "monospace", fontSize: 11, padding: "3px 10px",
  cursor: "pointer",
};

const inputStyle = {
  background: "rgba(0,20,40,0.8)", border: `1px solid ${CY}44`, borderRadius: 4,
  color: CY, fontFamily: "monospace", fontSize: 11, padding: "4px 8px", width: "100%",
  boxSizing: "border-box",
};

const textareaStyle = {
  ...inputStyle, resize: "vertical", minHeight: 60,
};

const selectStyle = { ...inputStyle };

const sectionHead = {
  color: AMBER, fontSize: 11, fontWeight: "bold", marginBottom: 6, letterSpacing: 1,
};

const badge = (color) => ({
  display: "inline-block", background: `${color}22`, border: `1px solid ${color}66`,
  borderRadius: 3, padding: "0 5px", fontSize: 10, color,
});

// ── component ─────────────────────────────────────────────────────────────────

export default function OntologyGovernedActionPanel() {
  const [open, setOpen] = useState(false);

  /* object search */
  const [query, setQuery]       = useState("");
  const [objects, setObjects]   = useState([]);
  const [objLoading, setObjLd]  = useState(false);
  const [objErr, setObjErr]     = useState("");

  /* selected object */
  const [selObj, setSelObj]     = useState(null);

  /* actions */
  const [actions, setActions]   = useState([]);
  const [actLoading, setActLd]  = useState(false);
  const [actErr, setActErr]     = useState("");

  /* apply action form */
  const [selAction, setSelAction] = useState("");
  const [payloadJson, setPayload] = useState("{}");
  const [execLoading, setExecLd]  = useState(false);
  const [execResult, setExecRes]  = useState(null);

  /* audit */
  const [auditLog, setAuditLog]   = useState([]);
  const [auditLd, setAuditLd]     = useState(false);

  /* rollback */
  const [rbLoading, setRbLd]      = useState(false);
  const [rbResult, setRbResult]   = useState("");

  /* assess */
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");

  const debounceRef = useRef(null);

  /* toggle */
  useEffect(() => {
    const h = () => setOpen((v) => !v);
    window.addEventListener("jarvis:ontgov-toggle", h);
    return () => window.removeEventListener("jarvis:ontgov-toggle", h);
  }, []);

  /* load audit whenever panel opens */
  useEffect(() => {
    if (!open) return;
    setAuditLd(true);
    fetchAudit()
      .then(setAuditLog)
      .catch(() => setAuditLog([]))
      .finally(() => setAuditLd(false));
  }, [open]);

  /* debounce object search */
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!open) return;
      setObjLd(true);
      setObjErr("");
      fetchObjects(query)
        .then(setObjects)
        .catch((e) => setObjErr(e.message))
        .finally(() => setObjLd(false));
    }, 350);
  }, [query, open]);

  /* when object selected, fetch its actions */
  const selectObject = useCallback((obj) => {
    setSelObj(obj);
    setActions([]);
    setActErr("");
    setSelAction("");
    setPayload("{}");
    setExecRes(null);
    setActLd(true);
    fetchActions(objId(obj))
      .then((acts) => {
        setActions(acts);
        if (acts.length > 0) setSelAction(actionType(acts[0]));
      })
      .catch((e) => setActErr(e.message))
      .finally(() => setActLd(false));
  }, []);

  /* execute action */
  const handleExecute = useCallback(async () => {
    if (!selObj || !selAction) return;
    let payload = {};
    try { payload = JSON.parse(payloadJson); } catch { payload = { raw: payloadJson }; }
    setExecLd(true);
    setExecRes(null);
    const res = await executeAction(objId(selObj), selAction, payload);
    setExecRes(res);
    setExecLd(false);
    /* refresh audit */
    fetchAudit().then(setAuditLog).catch(() => {});
  }, [selObj, selAction, payloadJson]);

  /* rollback proposal */
  const handleRollback = useCallback(async () => {
    if (!selObj || !execResult) return;
    setRbLd(true);
    setRbResult("");
    const prompt = `Propose a safe rollback for the most recent governed action on ontology object "${objLabel(selObj)}" (id: ${objId(selObj)}). Action type: "${selAction}". Result status: ${execResult.status}. Provide a step-by-step rollback plan. Do not auto-execute.`;
    const reply = await askJarvis(prompt);
    setRbResult(reply);
    setRbLd(false);
  }, [selObj, selAction, execResult]);

  /* assess */
  const handleAssess = useCallback(async () => {
    setAssessing(true);
    setAssessText("");
    const ctxObj = selObj ? `Object: "${objLabel(selObj)}" (${objId(selObj)})` : "No object selected";
    const ctxAct = execResult
      ? `Last action: ${selAction} → status ${execResult.status}`
      : "No action executed yet";
    const prompt = `Jarvis governed-action assessment. ${ctxObj}. ${ctxAct}. Available actions: ${actions.map(actionType).join(", ") || "none"}. Recent audit log has ${auditLog.length} entries. Summarise the governance posture and recommend the safest next action in 2 sentences.`;
    const reply = await askJarvis(prompt);
    setAssessText(reply);
    speak(reply);
    setAssessing(false);
  }, [selObj, selAction, execResult, actions, auditLog]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, top: 28, zIndex: Z_IDX,
          ...btnBase, fontSize: 10, padding: "2px 8px",
        }}
      >
        ◈ ONTGOV
      </button>
    );
  }

  return (
    <div style={panelStyle}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ color: CY, fontWeight: "bold", fontSize: 13 }}>◈ ONTOLOGY GOVERNED ACTIONS</span>
        <button onClick={() => setOpen(false)} style={{ ...btnBase, padding: "1px 7px" }}>✕</button>
      </div>

      {/* object search */}
      <div style={{ marginBottom: 10 }}>
        <div style={sectionHead}>SELECT OBJECT</div>
        <input
          style={inputStyle}
          placeholder="Search objects by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {objLoading && <div style={{ color: GREY, fontSize: 10, marginTop: 4 }}>searching…</div>}
        {objErr && <div style={{ color: RED, fontSize: 10, marginTop: 4 }}>{objErr}</div>}
        <div style={{ maxHeight: 120, overflowY: "auto", marginTop: 6 }}>
          {objects.map((o) => {
            const id = objId(o);
            const isSel = selObj && objId(selObj) === id;
            return (
              <div
                key={id || objLabel(o)}
                onClick={() => selectObject(o)}
                style={{
                  padding: "3px 8px", cursor: "pointer", borderRadius: 3, marginBottom: 2,
                  background: isSel ? `${CY}22` : "transparent",
                  border: isSel ? `1px solid ${CY}66` : "1px solid transparent",
                  display: "flex", justifyContent: "space-between",
                }}
              >
                <span>{objLabel(o)}</span>
                <span style={{ color: GREY, fontSize: 10 }}>{o.type || o.object_type || ""}</span>
              </div>
            );
          })}
          {!objLoading && objects.length === 0 && (
            <div style={{ color: GREY, fontSize: 10 }}>no objects</div>
          )}
        </div>
      </div>

      {/* selected object summary */}
      {selObj && (
        <div style={{ marginBottom: 10, padding: "6px 10px", background: `${CY}11`, borderRadius: 5, border: `1px solid ${CY}33` }}>
          <span style={{ color: CY, fontWeight: "bold" }}>{objLabel(selObj)}</span>
          <span style={{ color: GREY, marginLeft: 8, fontSize: 10 }}>{objId(selObj)}</span>
          {selObj.type && <span style={{ ...badge(AMBER), marginLeft: 8 }}>{selObj.type}</span>}
        </div>
      )}

      {/* actions */}
      {selObj && (
        <div style={{ marginBottom: 10 }}>
          <div style={sectionHead}>AVAILABLE ACTIONS</div>
          {actLoading && <div style={{ color: GREY, fontSize: 10 }}>loading actions…</div>}
          {actErr && <div style={{ color: RED, fontSize: 10 }}>{actErr}</div>}
          {!actLoading && actions.length === 0 && !actErr && (
            <div style={{ color: GREY, fontSize: 10 }}>no actions available</div>
          )}
          {actions.length > 0 && (
            <>
              <select
                style={selectStyle}
                value={selAction}
                onChange={(e) => setSelAction(e.target.value)}
              >
                {actions.map((a) => {
                  const t = actionType(a);
                  return <option key={t} value={t}>{t}</option>;
                })}
              </select>
              <div style={{ marginTop: 8 }}>
                <div style={{ color: GREY, fontSize: 10, marginBottom: 3 }}>Payload JSON</div>
                <textarea
                  style={textareaStyle}
                  value={payloadJson}
                  onChange={(e) => setPayload(e.target.value)}
                  spellCheck={false}
                />
              </div>
              <button
                style={{ ...btnBase, marginTop: 6, background: `${CY}22`, borderColor: CY }}
                onClick={handleExecute}
                disabled={execLoading}
              >
                {execLoading ? "Executing…" : "⚡ Execute Action"}
              </button>
            </>
          )}
        </div>
      )}

      {/* execution result */}
      {execResult && (
        <div style={{ marginBottom: 10, padding: "8px 10px", background: execResult.ok ? `${GREEN}11` : `${RED}11`, border: `1px solid ${execResult.ok ? GREEN : RED}44`, borderRadius: 5 }}>
          <div style={{ color: execResult.ok ? GREEN : RED, fontWeight: "bold", marginBottom: 4, fontSize: 11 }}>
            {execResult.ok ? "✓ Action Applied" : `✗ Error ${execResult.status}`}
          </div>
          <pre style={{ color: GREY, fontSize: 10, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 120, overflowY: "auto" }}>
            {JSON.stringify(execResult.data, null, 2)}
          </pre>
          <button
            style={{ ...btnBase, marginTop: 6, borderColor: AMBER, color: AMBER, fontSize: 10 }}
            onClick={handleRollback}
            disabled={rbLoading}
          >
            {rbLoading ? "Proposing…" : "↩ Rollback Proposal"}
          </button>
          {rbResult && (
            <div style={{ marginTop: 6, padding: "6px 8px", background: `${AMBER}11`, border: `1px solid ${AMBER}44`, borderRadius: 4, color: AMBER, fontSize: 10, whiteSpace: "pre-wrap" }}>
              {rbResult}
            </div>
          )}
        </div>
      )}

      {/* audit log */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ ...sectionHead, display: "flex", justifyContent: "space-between" }}>
          <span>RECENT AUDIT LOG (LAST 20)</span>
          {auditLd && <span style={{ color: GREY, fontSize: 9 }}>refreshing…</span>}
        </div>
        <div style={{ maxHeight: 130, overflowY: "auto" }}>
          {auditLog.length === 0 && !auditLd && (
            <div style={{ color: GREY, fontSize: 10 }}>no audit entries</div>
          )}
          {auditLog.map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 8, padding: "2px 4px", borderBottom: `1px solid ${CY}11`, fontSize: 10 }}>
              <span style={{ color: GREY, flexShrink: 0 }}>{auditTs(e)}</span>
              <span style={{ color: CY, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{auditText(e)}</span>
              {(e.actor || e.user || e.user_id) && (
                <span style={{ ...badge(AMBER), flexShrink: 0 }}>{e.actor || e.user || e.user_id}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* assess */}
      <div style={{ borderTop: `1px solid ${CY}22`, paddingTop: 8 }}>
        <button
          style={{ ...btnBase, background: `${AMBER}22`, borderColor: AMBER, color: AMBER }}
          onClick={handleAssess}
          disabled={assessing}
        >
          {assessing ? "Assessing…" : "▶ ASSESS"}
        </button>
        {assessText && (
          <div style={{ marginTop: 8, padding: "8px 10px", background: `${AMBER}11`, border: `1px solid ${AMBER}44`, borderRadius: 5, color: AMBER, fontSize: 11, lineHeight: 1.4 }}>
            {assessText}
          </div>
        )}
      </div>
    </div>
  );
}
