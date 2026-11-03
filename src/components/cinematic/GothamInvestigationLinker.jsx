/**
 * GothamInvestigationLinker — F309
 *
 * ◈ GOTINVLNK button (left:220840, zIndex:405)
 * Toggle: jarvis:gotinvlnk-toggle
 * Voice: "gotham investigation", "gotinvlnk", "link case investigation",
 *         "case linker", "gotham linker"
 *
 * Endpoints:
 *   GET  /v1/gotham/cases
 *   GET  /v1/investigations
 *   POST /v1/investigations/{id}/annotations
 *   POST /v1/gotham/case
 *   POST /v1/jarvis/agent/chat  (ASSESS)
 *   POST /v1/voice/tts
 *
 * Exports: isGotinvlnkQuery, buildGotinvlnkScript
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const VI   = "#A78BFA";
const SURF = "rgba(6,11,18,0.97)";
const BORD = "rgba(41,231,255,0.18)";
const DIM  = "rgba(41,231,255,0.40)";

const BTN_LEFT  = 220840;
const PANEL_W   = 1100;
const PANEL_H   = 680;
const API_KEY   = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

/* ── JarvisBrain exports ─────────────────────────────────────────────────── */

const GOTINVLNK_RE = /\b(gotham\s*invest|gotinvlnk|link\s*case\s*invest|case\s*link|gotham\s*link|investigation\s*link)\b/i;
export function isGotinvlnkQuery(q) { return GOTINVLNK_RE.test(q || ""); }

export async function buildGotinvlnkScript() {
  try {
    const base = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}` };
    const [casesRes, invsRes] = await Promise.all([
      fetch(`${base}/v1/gotham/cases`, { headers }),
      fetch(`${base}/v1/investigations`, { headers }),
    ]);
    const cases = casesRes.ok ? await casesRes.json() : [];
    const invs  = invsRes.ok  ? await invsRes.json()  : [];
    const cArr  = Array.isArray(cases) ? cases : (cases.cases || cases.data || []);
    const iArr  = Array.isArray(invs)  ? invs  : (invs.investigations || invs.data || []);
    return `Gotham Investigation Linker status: ${cArr.length} Gotham cases loaded, ${iArr.length} investigations loaded. Select a case and an investigation to link them cross-domain.`;
  } catch {
    return "Gotham Investigation Linker is active. Load cases and investigations to link cross-domain intelligence.";
  }
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

async function fetchJSON(url) {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function speakTTS(text) {
  try {
    const base = apiBase();
    await postJSON(`${base}/v1/voice/tts`, { text });
  } catch { /* silent */ }
}

/* ── component ───────────────────────────────────────────────────────────── */

export default function GothamInvestigationLinker() {
  const [open, setOpen]             = useState(false);
  const [cases, setCases]           = useState([]);
  const [investigations, setInvs]   = useState([]);
  const [selCase, setSelCase]        = useState(null);
  const [selInv, setSelInv]          = useState(null);
  const [linked, setLinked]          = useState([]);
  const [loadingC, setLoadingC]      = useState(false);
  const [loadingI, setLoadingI]      = useState(false);
  const [linking, setLinking]        = useState(false);
  const [assessing, setAssessing]    = useState(false);
  const [errC, setErrC]              = useState("");
  const [errI, setErrI]              = useState("");
  const [errLink, setErrLink]        = useState("");
  const [pivotStatus, setPivotStatus] = useState("");
  const audioRef = useRef(null);

  /* toggle */
  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:gotinvlnk-toggle", handler);
    return () => window.removeEventListener("jarvis:gotinvlnk-toggle", handler);
  }, []);

  /* load data when opened */
  const loadCases = useCallback(async () => {
    setLoadingC(true); setErrC("");
    try {
      const base = apiBase();
      const data = await fetchJSON(`${base}/v1/gotham/cases`);
      const arr  = Array.isArray(data) ? data : (data.cases || data.data || []);
      setCases(arr);
    } catch (e) { setErrC(e.message); }
    finally { setLoadingC(false); }
  }, []);

  const loadInvs = useCallback(async () => {
    setLoadingI(true); setErrI("");
    try {
      const base = apiBase();
      const data = await fetchJSON(`${base}/v1/investigations`);
      const arr  = Array.isArray(data) ? data : (data.investigations || data.data || []);
      setInvs(arr);
    } catch (e) { setErrI(e.message); }
    finally { setLoadingI(false); }
  }, []);

  useEffect(() => {
    if (open) { loadCases(); loadInvs(); }
  }, [open, loadCases, loadInvs]);

  /* link action */
  const handleLink = async () => {
    if (!selCase || !selInv) return;
    setLinking(true); setErrLink("");
    try {
      const base = apiBase();
      await postJSON(`${base}/v1/investigations/${selInv.id}/annotations`, {
        note: `Linked to Gotham case: ${selCase.id || selCase.case_id || selCase.title}`,
        type: "gotham_link",
        case_id: selCase.id || selCase.case_id,
      });
      const pair = {
        caseId:      selCase.id || selCase.case_id,
        caseTitle:   selCase.title || selCase.name || String(selCase.id || selCase.case_id),
        invId:       selInv.id,
        invTitle:    selInv.title || selInv.name || String(selInv.id),
        linkedAt:    new Date().toISOString(),
      };
      setLinked(prev => [pair, ...prev]);
      setSelCase(null); setSelInv(null);
    } catch (e) { setErrLink(`Link failed: ${e.message}`); }
    finally { setLinking(false); }
  };

  /* cross-domain pivot */
  const handlePivot = async (inv) => {
    setPivotStatus("Creating Gotham case from investigation…");
    try {
      const base = apiBase();
      await postJSON(`${base}/v1/gotham/case`, {
        title:          `Investigation pivot: ${inv.title || inv.name || inv.id}`,
        investigation_id: inv.id,
        context:        inv.description || inv.summary || "",
        source:         "jarvis:gotinvlnk-pivot",
      });
      setPivotStatus(`Gotham case created from investigation ${inv.id}`);
    } catch (e) { setPivotStatus(`Pivot failed: ${e.message}`); }
  };

  /* ASSESS + TTS */
  const handleAssess = async () => {
    setAssessing(true);
    try {
      const base = apiBase();
      const prompt = `Assess the case-investigation coverage: ${cases.length} Gotham cases, ${investigations.length} investigations, ${linked.length} cross-domain links established. Identify gaps, unlinked cases, and recommended investigation pivots.`;
      const res = await postJSON(`${base}/v1/jarvis/agent/chat`, { message: prompt });
      const text = res.response || res.message || res.content || JSON.stringify(res);
      await speakTTS(text);
    } catch (e) { /* silent */ }
    finally { setAssessing(false); }
  };

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      style={{
        position: "fixed", bottom: 12,
        left: `${BTN_LEFT}px`,
        zIndex: 405,
        background: "rgba(6,11,18,0.88)",
        border: `1px solid ${DIM}`,
        color: CY, fontSize: 9, letterSpacing: "0.08em",
        padding: "3px 7px", cursor: "pointer", borderRadius: 3,
      }}
    >◈ GOTINVLNK</button>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 405,
      background: "rgba(0,0,0,0.72)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: PANEL_W, maxWidth: "97vw",
        height: PANEL_H, maxHeight: "94vh",
        background: SURF,
        border: `1px solid ${BORD}`,
        borderRadius: 10,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
      }}>
        {/* header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: `1px solid ${BORD}`,
          background: "rgba(41,231,255,0.04)",
        }}>
          <span style={{ color: CY, fontSize: 12, letterSpacing: "0.1em", fontWeight: 700 }}>
            ◈ GOTHAM × INVESTIGATION LINKER
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleAssess} disabled={assessing} style={btnStyle(VI)}>
              {assessing ? "…ASSESS" : "⚡ ASSESS"}
            </button>
            <button onClick={() => setOpen(false)} style={btnStyle(RD)}>✕ CLOSE</button>
          </div>
        </div>

        {/* two-panel body */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* LEFT — Gotham Cases */}
          <div style={panelStyle}>
            <div style={panelHeader(AM)}>
              GOTHAM CASES
              <button onClick={loadCases} disabled={loadingC} style={microBtn(AM)}>
                {loadingC ? "…" : "↻"}
              </button>
            </div>
            {errC && <div style={errStyle}>{errC}</div>}
            <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
              {cases.map((c, i) => {
                const id    = c.id || c.case_id || i;
                const title = c.title || c.name || String(id);
                const sel   = selCase && (selCase.id || selCase.case_id) === id;
                return (
                  <div
                    key={id}
                    onClick={() => setSelCase(sel ? null : c)}
                    style={rowStyle(sel, AM)}
                  >
                    <span style={{ color: AM, fontSize: 9 }}>#{String(id).slice(0,8)}</span>
                    <span style={{ color: "#ccc", fontSize: 10, marginLeft: 6 }}>{title}</span>
                    {c.status && (
                      <span style={{ color: DIM, fontSize: 8, marginLeft: "auto" }}>{c.status}</span>
                    )}
                  </div>
                );
              })}
              {!loadingC && cases.length === 0 && !errC && (
                <div style={{ color: DIM, fontSize: 10, padding: "12px 10px" }}>No cases loaded</div>
              )}
            </div>
          </div>

          {/* RIGHT — Investigations */}
          <div style={{ ...panelStyle, borderLeft: `1px solid ${BORD}` }}>
            <div style={panelHeader(CY)}>
              INVESTIGATIONS
              <button onClick={loadInvs} disabled={loadingI} style={microBtn(CY)}>
                {loadingI ? "…" : "↻"}
              </button>
            </div>
            {errI && <div style={errStyle}>{errI}</div>}
            <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
              {investigations.map((inv, i) => {
                const id    = inv.id || i;
                const title = inv.title || inv.name || String(id);
                const sel   = selInv && selInv.id === id;
                return (
                  <div
                    key={id}
                    style={{ ...rowStyle(sel, CY), position: "relative" }}
                  >
                    <span
                      onClick={() => setSelInv(sel ? null : inv)}
                      style={{ flex: 1, display: "flex", alignItems: "center", cursor: "pointer" }}
                    >
                      <span style={{ color: CY, fontSize: 9 }}>#{String(id).slice(0,8)}</span>
                      <span style={{ color: "#ccc", fontSize: 10, marginLeft: 6 }}>{title}</span>
                    </span>
                    <button
                      onClick={() => handlePivot(inv)}
                      title="Pivot: create Gotham case from this investigation"
                      style={{ ...microBtn(VI), marginLeft: 8 }}
                    >⇢</button>
                  </div>
                );
              })}
              {!loadingI && investigations.length === 0 && !errI && (
                <div style={{ color: DIM, fontSize: 10, padding: "12px 10px" }}>No investigations loaded</div>
              )}
            </div>
          </div>
        </div>

        {/* link bar */}
        <div style={{
          padding: "8px 14px",
          borderTop: `1px solid ${BORD}`,
          background: "rgba(41,231,255,0.03)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{ color: DIM, fontSize: 10, flex: 1 }}>
            {selCase
              ? <span style={{ color: AM }}>Case: {selCase.title || selCase.id}</span>
              : <span>Select a Gotham case ←</span>}
            {" "}
            {selInv
              ? <span style={{ color: CY, marginLeft: 8 }}>Inv: {selInv.title || selInv.id}</span>
              : <span style={{ marginLeft: 8 }}>Select an investigation →</span>}
          </div>
          {errLink && <span style={{ color: RD, fontSize: 9 }}>{errLink}</span>}
          {pivotStatus && <span style={{ color: VI, fontSize: 9 }}>{pivotStatus}</span>}
          <button
            onClick={handleLink}
            disabled={!selCase || !selInv || linking}
            style={btnStyle(GN, !selCase || !selInv || linking)}
          >
            {linking ? "LINKING…" : "⚡ LINK"}
          </button>
        </div>

        {/* linked pairs */}
        {linked.length > 0 && (
          <div style={{
            maxHeight: 130, overflowY: "auto",
            borderTop: `1px solid ${BORD}`,
            padding: "6px 14px",
          }}>
            <div style={{ color: GN, fontSize: 9, letterSpacing: "0.08em", marginBottom: 4 }}>
              LINKED PAIRS ({linked.length})
            </div>
            {linked.map((p, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 3, fontSize: 9 }}>
                <span style={{ color: AM }}>{p.caseTitle.slice(0,24)}</span>
                <span style={{ color: DIM }}>↔</span>
                <span style={{ color: CY }}>{p.invTitle.slice(0,24)}</span>
                <span style={{ color: DIM, marginLeft: "auto" }}>
                  {new Date(p.linkedAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <audio ref={audioRef} style={{ display: "none" }} />
    </div>
  );
}

/* ── inline style helpers ─────────────────────────────────────────────────── */

const panelStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

function panelHeader(color) {
  return {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "6px 10px",
    borderBottom: `1px solid ${BORD}`,
    color, fontSize: 9, letterSpacing: "0.1em", fontWeight: 700,
    background: "rgba(41,231,255,0.03)",
  };
}

function rowStyle(selected, color) {
  return {
    display: "flex", alignItems: "center",
    padding: "5px 10px",
    cursor: "pointer",
    background: selected ? `${color}18` : "transparent",
    borderLeft: selected ? `2px solid ${color}` : "2px solid transparent",
    transition: "background 0.12s",
  };
}

function btnStyle(color, disabled = false) {
  return {
    background: disabled ? "rgba(41,231,255,0.04)" : `${color}22`,
    border: `1px solid ${disabled ? BORD : color}`,
    color: disabled ? DIM : color,
    fontSize: 9, letterSpacing: "0.08em",
    padding: "4px 10px", cursor: disabled ? "not-allowed" : "pointer",
    borderRadius: 4, fontFamily: "inherit",
    opacity: disabled ? 0.5 : 1,
  };
}

function microBtn(color) {
  return {
    background: "transparent",
    border: `1px solid ${color}44`,
    color, fontSize: 10, cursor: "pointer",
    padding: "1px 5px", borderRadius: 3,
    fontFamily: "inherit",
  };
}

const errStyle = { color: RD, fontSize: 9, padding: "4px 10px" };
