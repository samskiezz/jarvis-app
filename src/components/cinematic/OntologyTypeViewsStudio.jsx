/**
 * OntologyTypeViewsStudio — F360
 * Browse and edit per-type view layouts (summary / detail / related columns).
 *
 * Endpoints:
 *   GET  /v1/ontology/types                    — type catalog (120 s poll)
 *   GET  /v1/ontology-ext/views/{type_id}      — current view layout (lazy, on type select)
 *   POST /v1/ontology-ext/views/{type_id}      — save edited layout (bearer)
 *   POST /v1/jarvis/agent/chat                 — AI ontology-view brief + TTS
 *
 * Toggle: ◈ TOVS  left:648240  bottom:8  zIndex:236
 * Event:  jarvis:tovs-toggle
 * Voice:  "type views" | "object view" | "tovs" | "type layout" | "view definition"
 *         "summary fields" | "detail fields" | "view config" | "ontology view" | "field layout"
 *
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const VIO = "#A78BFA";
const GN  = "#00E5A0";
const AM  = "#F59E0B";
const DIM = "#4A6070";

const POLL_MS = 120_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const TOVS_RE =
  /\btype\s+views?\b|\bobject\s+view\b|\btovs\b|\btype\s+layout\b|\bview\s+defin|\bsummary\s+fields?\b|\bdetail\s+fields?\b|\bview\s+config\b|\bontology\s+view\b|\bfield\s+layout\b/i;

export function isTovsQuery(text) {
  return TOVS_RE.test(text || "");
}

export async function buildTovsScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/ontology/types`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) throw new Error("no data");
    const d = await r.json();
    const types = Array.isArray(d) ? d : (d.types || d.items || []);
    const count = types.length;
    if (!count) return "The ontology type views studio is online but no object types are defined yet, sir.";
    const sample = types.slice(0, 4).map((t) => (typeof t === "string" ? t : (t.id || t.type_id || t.name || "?"))).join(", ");
    return (
      `Ontology Type Views Studio: ${count} object type${count !== 1 ? "s" : ""} registered. ` +
      `Includes ${sample}${count > 4 ? " and more" : ""}. ` +
      `Opening view layout studio to inspect and edit per-type field configurations, sir.`
    );
  } catch {
    return "Ontology Type Views Studio is online. No type data currently available, sir.";
  }
}

function normTypes(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.types || raw.items || Object.keys(raw));
  return arr.map((t) => (typeof t === "string" ? t : (t.id || t.type_id || t.name || JSON.stringify(t))));
}

export default function OntologyTypeViewsStudio() {
  const [open, setOpen]           = useState(false);
  const [types, setTypes]         = useState([]);
  const [selected, setSelected]   = useState(null);
  const [view, setView]           = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [tab, setTab]             = useState("VIEW");      // VIEW | EDIT
  const [editSummary, setEditSummary] = useState("");
  const [editDetail, setEditDetail]   = useState("");
  const [editRelated, setEditRelated] = useState("");
  const [saving, setSaving]       = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [search, setSearch]       = useState("");
  const [loading, setLoading]     = useState(false);
  const [assessing, setAssessing] = useState(false);
  const pollRef = useRef(null);

  const fetchTypes = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase()}/v1/ontology/types`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) return;
      const d = await r.json();
      setTypes(normTypes(d));
    } catch (_) {}
  }, []);

  const fetchView = useCallback(async (typeId) => {
    if (!typeId) return;
    setViewLoading(true);
    setView(null);
    setSaveResult(null);
    try {
      const r = await fetch(`${apiBase()}/v1/ontology-ext/views/${encodeURIComponent(typeId)}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const d = await r.json();
      setView(d);
      setEditSummary((d.summary || []).join(", "));
      setEditDetail((d.detail || []).join(", "));
      setEditRelated((d.related || []).join(", "));
    } catch (_) {
      setView(null);
    } finally {
      setViewLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:tovs-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tovs-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchTypes().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchTypes, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, fetchTypes]);

  function handleSelect(typeId) {
    setSelected(typeId);
    setTab("VIEW");
    setSaveResult(null);
    fetchView(typeId);
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setSaveResult(null);
    const payload = {
      summary: editSummary.split(",").map((s) => s.trim()).filter(Boolean),
      detail:  editDetail.split(",").map((s) => s.trim()).filter(Boolean),
      related: editRelated.split(",").map((s) => s.trim()).filter(Boolean),
    };
    try {
      const r = await fetch(`${apiBase()}/v1/ontology-ext/views/${encodeURIComponent(selected)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const d = await r.json();
      if (d.ok === false) throw new Error(d.error || "failed");
      setSaveResult({ ok: true });
      setView(d.view || { ...payload, type_id: selected, generated: false });
      setTab("VIEW");
    } catch (e) {
      setSaveResult({ ok: false, err: String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function handleAssess() {
    if (assessing) return;
    setAssessing(true);
    try {
      const ctx = selected
        ? `Ontology type views studio: ${types.length} types. Currently viewing "${selected}" layout: summary=[${(view?.summary || []).join(", ")}], detail=[${(view?.detail || []).join(", ")}], related=[${(view?.related || []).join(", ")}].`
        : `Ontology type views studio: ${types.length} types registered, no type selected.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Assess the ontology type view configurations and their data model quality. Context: ${ctx}`,
        }),
      });
      const d = await r.json();
      const answer = (d.answer || "Ontology view assessment complete, sir.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer, voice: getActiveVoice() } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: "Ontology type view assessment unavailable, sir.", voice: getActiveVoice() } }));
    } finally {
      setAssessing(false);
    }
  }

  const filtered = types.filter((t) =>
    !search || t.toLowerCase().includes(search.toLowerCase())
  );

  const badge = types.length > 0
    ? { color: VIO, text: String(types.length) }
    : { color: DIM, text: "0" };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ontology Type Views Studio (TOVS)"
        style={{
          position: "fixed", left: 648240, bottom: 8, zIndex: 236,
          background: "rgba(5,10,18,0.82)",
          border: `1px solid ${badge.color}44`,
          borderRadius: 6, padding: "3px 8px",
          color: badge.color, fontSize: 10, fontFamily: "monospace",
          cursor: "pointer", letterSpacing: 1, whiteSpace: "nowrap",
        }}
      >
        ◈ TOVS{types.length > 0 ? ` ${types.length}` : ""}
      </button>
    );
  }

  const summaryFields = view?.summary || [];
  const detailFields  = view?.detail  || [];
  const relatedFields = view?.related || [];

  return (
    <div
      style={{
        position: "fixed", top: 60, right: 16, width: 440, maxHeight: "84vh",
        zIndex: 9210,
        background: "rgba(5,10,18,0.97)",
        border: `1px solid ${VIO}44`,
        borderRadius: 12,
        boxShadow: `0 0 60px ${VIO}18, 0 24px 48px rgba(0,0,0,0.8)`,
        fontFamily: "'JetBrains Mono', monospace",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${VIO}22`, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: VIO, fontSize: 11, letterSpacing: 2 }}>◈ ONTOLOGY TYPE VIEWS</span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                background: assessing ? `${VIO}11` : `${VIO}22`,
                border: `1px solid ${VIO}44`, borderRadius: 4,
                color: VIO, fontSize: 9, padding: "2px 7px", cursor: "pointer", letterSpacing: 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, fontSize: 14, cursor: "pointer", padding: 0 }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {[
            { label: "TYPES",   val: types.length,        color: VIO },
            { label: "SELECTED", val: selected ? 1 : 0,    color: CY },
            { label: "SUMMARY", val: summaryFields.length, color: GN },
            { label: "DETAIL",  val: detailFields.length,  color: AM },
          ].map(({ label, val, color }) => (
            <div
              key={label}
              style={{
                flex: 1, background: "rgba(167,139,250,0.04)",
                border: `1px solid ${color}22`, borderRadius: 5,
                padding: "4px 6px", textAlign: "center",
              }}
            >
              <div style={{ color, fontSize: 14, fontWeight: 700 }}>{val}</div>
              <div style={{ color: DIM, fontSize: 8, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Type search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search types…"
          style={{
            marginTop: 8, width: "100%", boxSizing: "border-box",
            background: "rgba(167,139,250,0.05)",
            border: `1px solid ${VIO}33`, borderRadius: 5,
            color: "#DCEBF5", fontSize: 10, padding: "4px 8px",
            fontFamily: "inherit", outline: "none",
          }}
        />
      </div>

      {/* Body — two-column layout: type list left, view detail right */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Type list */}
        <div
          style={{
            width: 140, flexShrink: 0,
            borderRight: `1px solid ${VIO}22`,
            overflowY: "auto", padding: "8px 6px",
          }}
        >
          {loading && (
            <div style={{ color: DIM, fontSize: 9, textAlign: "center", padding: 8 }}>Loading…</div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ color: DIM, fontSize: 9, textAlign: "center", padding: 8 }}>No types</div>
          )}
          {filtered.map((t) => (
            <button
              key={t}
              onClick={() => handleSelect(t)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                background: selected === t ? `${VIO}22` : "transparent",
                border: `1px solid ${selected === t ? VIO : "transparent"}`,
                borderRadius: 4, color: selected === t ? VIO : "#7A9BAB",
                fontSize: 9, padding: "4px 6px", marginBottom: 2,
                cursor: "pointer", letterSpacing: 0.5,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* View detail panel */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px 14px" }}>
          {!selected && (
            <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 24 }}>
              Select a type to view its layout.
            </div>
          )}

          {selected && viewLoading && (
            <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 24 }}>Loading view…</div>
          )}

          {selected && !viewLoading && (
            <>
              {/* Selected type header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ color: VIO, fontSize: 11, letterSpacing: 1 }}>{selected}</span>
                {view?.generated && (
                  <span style={{
                    background: `${AM}22`, border: `1px solid ${AM}44`,
                    borderRadius: 4, color: AM, fontSize: 8, padding: "1px 5px", letterSpacing: 1,
                  }}>AUTO-GENERATED</span>
                )}
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {["VIEW", "EDIT"].map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTab(t); setSaveResult(null); }}
                    style={{
                      background: tab === t ? `${VIO}22` : "transparent",
                      border: `1px solid ${tab === t ? VIO : DIM}44`,
                      borderRadius: 4, color: tab === t ? VIO : DIM,
                      fontSize: 9, padding: "2px 10px", cursor: "pointer", letterSpacing: 1,
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {tab === "VIEW" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { label: "SUMMARY FIELDS", fields: summaryFields, color: GN },
                    { label: "DETAIL FIELDS",  fields: detailFields,  color: CY },
                    { label: "RELATED LINKS",  fields: relatedFields, color: AM },
                  ].map(({ label, fields, color }) => (
                    <div key={label}>
                      <div style={{ color: DIM, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>{label}</div>
                      {fields.length === 0 ? (
                        <div style={{ color: DIM, fontSize: 9, fontStyle: "italic" }}>none</div>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {fields.map((f) => (
                            <span
                              key={f}
                              style={{
                                background: `${color}18`, border: `1px solid ${color}44`,
                                borderRadius: 4, color, fontSize: 9, padding: "2px 6px", letterSpacing: 0.5,
                              }}
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {!view && (
                    <div style={{ color: DIM, fontSize: 9, textAlign: "center", padding: 10 }}>
                      No view data returned — type may have no objects yet.
                    </div>
                  )}
                </div>
              )}

              {tab === "EDIT" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ color: DIM, fontSize: 8, letterSpacing: 1 }}>
                    COMMA-SEPARATED FIELD NAMES
                  </div>

                  {[
                    { label: "SUMMARY FIELDS", value: editSummary, onChange: setEditSummary, color: GN },
                    { label: "DETAIL FIELDS",  value: editDetail,  onChange: setEditDetail,  color: CY },
                    { label: "RELATED LINKS",  value: editRelated, onChange: setEditRelated, color: AM },
                  ].map(({ label, value, onChange, color }) => (
                    <div key={label}>
                      <div style={{ color, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>{label}</div>
                      <input
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={`e.g. name, status, type`}
                        style={{
                          width: "100%", boxSizing: "border-box",
                          background: `${color}08`,
                          border: `1px solid ${color}33`, borderRadius: 5,
                          color: "#DCEBF5", fontSize: 10, padding: "5px 8px",
                          fontFamily: "inherit", outline: "none",
                        }}
                      />
                    </div>
                  ))}

                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      background: saving ? `${VIO}11` : `${VIO}22`,
                      border: `1px solid ${VIO}44`, borderRadius: 6,
                      color: VIO, fontSize: 11, padding: "7px 0",
                      cursor: saving ? "wait" : "pointer",
                      letterSpacing: 1, fontFamily: "inherit",
                    }}
                  >
                    {saving ? "SAVING…" : "◈ SAVE LAYOUT"}
                  </button>

                  {saveResult && (
                    <div style={{
                      color: saveResult.ok ? GN : "#FF4444",
                      fontSize: 9, letterSpacing: 1, textAlign: "center",
                    }}>
                      {saveResult.ok ? "✓ Layout saved" : `✗ ${saveResult.err}`}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: ${VIO}33; border-radius: 2px; }
      `}</style>
    </div>
  );
}
