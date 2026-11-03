/**
 * InvestigationShareManager — F302.
 *
 * Investigation access-control workbench: list investigations, view per-
 * investigation shares (principal + granted_at + permissions), add new
 * shares via a form.
 *
 *   List      — GET /v1/investigations  → select an investigation
 *   Detail    — GET /v1/investigations/{id}  → populate context header
 *   Shares    — GET /v1/investigations/{id}/shares
 *   Add share — POST /v1/investigations/{id}/share { principal, role }
 *   ASSESS    — POST /v1/jarvis/agent/chat + TTS
 *
 * Toggle: ◈ INVSHR  left:216920  bottom:8  zIndex:398
 * Event:  jarvis:invshr-toggle
 * Voice:  "investigation share / invshr / share investigation /
 *          access control / grant access / investigation access"
 *
 * Exported for JarvisBrain: isInvshrQuery
 * Mounted via src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

// ─── palette ──────────────────────────────────────────────────────────────────
const CY   = "#29E7FF";
const GN   = "#4ADE80";
const AM   = "#F5A623";
const RD   = "#F87171";
const GRAY = "#4E6070";
const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const BTN_LEFT = 216920;
const PANEL_W  = 800;
const PANEL_H  = 600;

// ─── JarvisBrain export ───────────────────────────────────────────────────────
const INVSHR_RE =
  /\b(investigation\s+share[rs]?\b|invshr\b|share\s+investigation\b|investigation\s+access\b|grant\s+access\b|access\s+control\b)\b/i;

export function isInvshrQuery(q) {
  return INVSHR_RE.test(q || "");
}

// ─── role colours ─────────────────────────────────────────────────────────────
const ROLE_COLOR = {
  owner:  CY,
  editor: AM,
  viewer: GN,
  read:   GN,
  write:  AM,
  admin:  RD,
};

function roleColor(role) {
  return ROLE_COLOR[(role || "").toLowerCase()] || GRAY;
}

// ─── fetch helpers ─────────────────────────────────────────────────────────────
async function fetchInvestigations() {
  const r = await fetch(`${apiBase()}/v1/investigations`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`/v1/investigations ${r.status}`);
  const d = await r.json();
  return Array.isArray(d) ? d : Array.isArray(d?.investigations) ? d.investigations : [];
}

async function fetchInvestigationDetail(id) {
  const r = await fetch(`${apiBase()}/v1/investigations/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`/v1/investigations/${id} ${r.status}`);
  return r.json();
}

async function fetchShares(id) {
  const r = await fetch(
    `${apiBase()}/v1/investigations/${encodeURIComponent(id)}/shares`,
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );
  if (!r.ok) throw new Error(`/v1/investigations/${id}/shares ${r.status}`);
  const d = await r.json();
  return Array.isArray(d) ? d : Array.isArray(d?.shares) ? d.shares : [];
}

async function postShare(id, principal, role) {
  const r = await fetch(
    `${apiBase()}/v1/investigations/${encodeURIComponent(id)}/share`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ principal, role }),
    }
  );
  if (!r.ok) throw new Error(`POST /v1/investigations/${id}/share ${r.status}`);
  return r.json();
}

async function fetchAssess(invId, title, shareCount, signal) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message:
        `Analyse the access-control posture for investigation "${title}" (id: ${invId}). ` +
        `It currently has ${shareCount} share grants. ` +
        "Summarise any potential risks: over-broad access, missing owners, " +
        "principals that may no longer be active, and recommended next steps.",
    }),
    signal,
  });
  if (!r.ok) throw new Error(`chat ${r.status}`);
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
}

// ─── TTS ───────────────────────────────────────────────────────────────────────
function speak(text) {
  if (!text) return;
  try {
    fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ text, voice: "onyx" }),
    })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = new Audio(url);
        a.onended = () => URL.revokeObjectURL(url);
        a.play().catch(() => {});
      })
      .catch(() => {});
  } catch {}
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmtDate(val) {
  if (!val) return "—";
  const d = new Date(val);
  return isNaN(d) ? String(val) : d.toLocaleString();
}

// ─── component ─────────────────────────────────────────────────────────────────
export default function InvestigationShareManager() {
  const [open, setOpen]             = useState(false);
  const [investigations, setInvestigations] = useState([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [selected, setSelected]     = useState(null); // investigation object
  const [detail, setDetail]         = useState(null);
  const [shares, setShares]         = useState([]);
  const [loadingShares, setLoadingShares] = useState(false);
  // form state
  const [principal, setPrincipal]   = useState("");
  const [role, setRole]             = useState("viewer");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg]   = useState("");
  // assess
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState("");
  const abortRef = useRef(null);

  // toggle listener
  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:invshr-toggle", handler);
    return () => window.removeEventListener("jarvis:invshr-toggle", handler);
  }, []);

  const loadInvestigations = useCallback(async () => {
    setLoadingInv(true);
    setSelected(null);
    setDetail(null);
    setShares([]);
    setAssessment("");
    setSubmitMsg("");
    try {
      const list = await fetchInvestigations();
      setInvestigations(list);
    } catch {
      setInvestigations([]);
    } finally {
      setLoadingInv(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadInvestigations();
  }, [open, loadInvestigations]);

  const selectInvestigation = useCallback(async (inv) => {
    setSelected(inv);
    setShares([]);
    setDetail(null);
    setAssessment("");
    setSubmitMsg("");
    setLoadingShares(true);
    try {
      const [det, sh] = await Promise.all([
        fetchInvestigationDetail(inv.id),
        fetchShares(inv.id),
      ]);
      setDetail(det);
      setShares(sh);
    } catch {
      // silently keep empty
    } finally {
      setLoadingShares(false);
    }
  }, []);

  const handleShare = useCallback(async () => {
    if (!selected || !principal.trim() || submitting) return;
    setSubmitting(true);
    setSubmitMsg("");
    try {
      await postShare(selected.id, principal.trim(), role);
      setSubmitMsg(`Shared with ${principal.trim()} as ${role}.`);
      setPrincipal("");
      // refresh shares
      const fresh = await fetchShares(selected.id);
      setShares(fresh);
    } catch (err) {
      setSubmitMsg(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }, [selected, principal, role, submitting]);

  const handleAssess = useCallback(async () => {
    if (!selected || assessing) return;
    setAssessing(true);
    setAssessment("");
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const title = selected.title || selected.name || selected.id;
      const text = await fetchAssess(selected.id, title, shares.length, ctrl.signal);
      setAssessment(text);
      speak(text);
    } catch {
      setAssessment("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [selected, shares.length, assessing]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investigation Share Manager"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 398,
          background: "rgba(10,18,28,0.82)",
          border: `1px solid ${BORD}`,
          color: CY,
          fontSize: 10,
          fontFamily: "monospace",
          padding: "3px 8px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: 1,
          whiteSpace: "nowrap",
        }}
      >
        ◈ INVSHR
      </button>
    );
  }

  const invTitle = selected ? (selected.title || selected.name || selected.id) : null;

  return (
    <>
      {/* backdrop */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          zIndex: 397,
        }}
      />

      {/* panel */}
      <div
        style={{
          position: "fixed",
          bottom: 40,
          left: Math.min(BTN_LEFT, (typeof window !== "undefined" ? window.innerWidth : 1400) - PANEL_W - 16),
          width: PANEL_W,
          height: PANEL_H,
          background: SURF,
          border: `1.5px solid ${BORD}`,
          borderRadius: 10,
          zIndex: 398,
          display: "flex",
          flexDirection: "column",
          fontFamily: "monospace",
          overflow: "hidden",
          boxShadow: "0 8px 48px rgba(0,0,0,0.7)",
        }}
      >
        {/* ── header ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px 8px",
          borderBottom: `1px solid ${BORD}`,
          flexShrink: 0,
        }}>
          <span style={{ color: CY, fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>
            ◈ INVESTIGATION SHARE MANAGER
          </span>
          {selected && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 1,
              color: CY, background: "rgba(41,231,255,0.12)",
              border: `1px solid ${BORD}`, padding: "1px 6px", borderRadius: 3,
            }}>
              {shares.length} share{shares.length !== 1 ? "s" : ""}
            </span>
          )}
          <span style={{ flex: 1 }} />
          {selected && (
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                background: assessing ? "rgba(41,231,255,0.08)" : "transparent",
                border: `1px solid ${BORD}`,
                color: CY, fontSize: 10, padding: "2px 8px", borderRadius: 3,
                cursor: assessing ? "default" : "pointer",
              }}
            >
              {assessing ? "ASSESSING…" : "ASSESS"}
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "transparent", border: "none",
              color: GRAY, fontSize: 14, cursor: "pointer", lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* assessment bar */}
        {assessment && (
          <div style={{
            padding: "6px 14px",
            borderBottom: `1px solid ${BORD}`,
            color: CY, fontSize: 10, lineHeight: 1.5,
            background: "rgba(41,231,255,0.04)",
            flexShrink: 0,
          }}>
            {assessment}
          </div>
        )}

        {/* ── body: left list + right panel ── */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* ── left: investigation list ── */}
          <div style={{
            width: 240,
            overflowY: "auto",
            borderRight: `1px solid ${BORD}`,
            flexShrink: 0,
          }}>
            <div style={{
              padding: "6px 12px",
              borderBottom: `1px solid ${BORD}`,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ color: GRAY, fontSize: 9, letterSpacing: 1 }}>INVESTIGATIONS</span>
              <span style={{ flex: 1 }} />
              <button
                onClick={loadInvestigations}
                style={{
                  background: "transparent", border: `1px solid ${BORD}`,
                  color: CY, fontSize: 9, padding: "1px 5px", borderRadius: 3,
                  cursor: "pointer",
                }}
              >
                ↺
              </button>
            </div>

            {loadingInv && (
              <div style={{ color: GRAY, fontSize: 10, padding: "10px 12px" }}>
                Loading…
              </div>
            )}
            {!loadingInv && investigations.length === 0 && (
              <div style={{ color: GRAY, fontSize: 10, padding: "10px 12px" }}>
                No investigations.
              </div>
            )}
            {investigations.map((inv) => {
              const isSel = selected?.id === inv.id;
              const title = inv.title || inv.name || inv.id;
              const status = inv.status || "";
              return (
                <div
                  key={inv.id}
                  onClick={() => selectInvestigation(inv)}
                  style={{
                    padding: "8px 12px",
                    borderBottom: `1px solid rgba(41,231,255,0.07)`,
                    cursor: "pointer",
                    background: isSel ? "rgba(41,231,255,0.08)" : "transparent",
                    borderLeft: isSel ? `2px solid ${CY}` : "2px solid transparent",
                  }}
                >
                  <div style={{ color: CY, fontSize: 10, fontWeight: isSel ? 700 : 400 }}>
                    {title}
                  </div>
                  {status && (
                    <div style={{ color: GRAY, fontSize: 9, marginTop: 2 }}>
                      {status}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── right: shares + form ── */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
            {!selected && (
              <div style={{ color: GRAY, fontSize: 10, padding: 18 }}>
                Select an investigation to view its shares.
              </div>
            )}

            {selected && (
              <>
                {/* investigation context header */}
                <div style={{
                  padding: "8px 14px",
                  borderBottom: `1px solid ${BORD}`,
                  background: "rgba(41,231,255,0.03)",
                  flexShrink: 0,
                }}>
                  <div style={{ color: CY, fontSize: 11, fontWeight: 700 }}>
                    {invTitle}
                  </div>
                  {detail && (
                    <div style={{ color: GRAY, fontSize: 9, marginTop: 3, lineHeight: 1.5 }}>
                      {detail.description
                        ? detail.description.slice(0, 160)
                        : `ID: ${selected.id}`}
                    </div>
                  )}
                </div>

                {/* shares list */}
                <div style={{ flex: 1, overflowY: "auto" }}>
                  <div style={{
                    padding: "6px 14px",
                    borderBottom: `1px solid ${BORD}`,
                    display: "flex", gap: 6, alignItems: "center",
                  }}>
                    <span style={{ color: GRAY, fontSize: 9, letterSpacing: 1 }}>
                      SHARES
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 700,
                      color: shares.length > 0 ? GN : GRAY,
                      background: shares.length > 0
                        ? "rgba(74,222,128,0.12)" : "rgba(78,96,112,0.12)",
                      border: `1px solid ${shares.length > 0 ? GN : GRAY}44`,
                      padding: "0px 5px", borderRadius: 3,
                    }}>
                      {shares.length}
                    </span>
                  </div>

                  {loadingShares && (
                    <div style={{ color: GRAY, fontSize: 10, padding: "10px 14px" }}>
                      Loading shares…
                    </div>
                  )}
                  {!loadingShares && shares.length === 0 && (
                    <div style={{ color: GRAY, fontSize: 10, padding: "10px 14px" }}>
                      No shares yet.
                    </div>
                  )}
                  {shares.map((sh, i) => (
                    <div
                      key={sh.id || `${sh.principal}-${i}`}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "7px 14px",
                        borderBottom: `1px solid rgba(41,231,255,0.07)`,
                      }}
                    >
                      {/* role badge */}
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: 1,
                        color: roleColor(sh.role || sh.permissions),
                        border: `1px solid ${roleColor(sh.role || sh.permissions)}44`,
                        background: `${roleColor(sh.role || sh.permissions)}14`,
                        padding: "1px 5px", borderRadius: 3,
                        minWidth: 46, textAlign: "center",
                      }}>
                        {(sh.role || sh.permissions || "—").toUpperCase()}
                      </span>

                      {/* principal */}
                      <span style={{ color: CY, fontSize: 10, flex: 1 }}>
                        {sh.principal || sh.user || sh.email || "unknown"}
                      </span>

                      {/* granted at */}
                      <span style={{ color: GRAY, fontSize: 9 }}>
                        {fmtDate(sh.granted_at || sh.created_at)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* ── share form ── */}
                <div style={{
                  padding: "10px 14px",
                  borderTop: `1px solid ${BORD}`,
                  background: "rgba(41,231,255,0.02)",
                  flexShrink: 0,
                }}>
                  <div style={{ color: GRAY, fontSize: 9, letterSpacing: 1, marginBottom: 8 }}>
                    ADD SHARE
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      value={principal}
                      onChange={(e) => setPrincipal(e.target.value)}
                      placeholder="principal (user / group)"
                      style={{
                        flex: 1,
                        background: "rgba(41,231,255,0.05)",
                        border: `1px solid ${BORD}`,
                        color: CY, fontSize: 10, fontFamily: "monospace",
                        padding: "5px 8px", borderRadius: 4, outline: "none",
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") handleShare(); }}
                    />
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      style={{
                        background: "rgba(10,18,28,0.95)",
                        border: `1px solid ${BORD}`,
                        color: CY, fontSize: 10, fontFamily: "monospace",
                        padding: "5px 6px", borderRadius: 4, outline: "none",
                      }}
                    >
                      <option value="viewer">viewer</option>
                      <option value="editor">editor</option>
                      <option value="owner">owner</option>
                    </select>
                    <button
                      onClick={handleShare}
                      disabled={submitting || !principal.trim()}
                      style={{
                        background: submitting || !principal.trim()
                          ? "rgba(41,231,255,0.05)"
                          : "rgba(41,231,255,0.12)",
                        border: `1px solid ${BORD}`,
                        color: CY, fontSize: 10, padding: "5px 12px",
                        borderRadius: 4, cursor: submitting || !principal.trim()
                          ? "default" : "pointer",
                        fontFamily: "monospace",
                      }}
                    >
                      {submitting ? "SHARING…" : "SHARE"}
                    </button>
                  </div>
                  {submitMsg && (
                    <div style={{
                      marginTop: 6, fontSize: 9,
                      color: submitMsg.startsWith("Error") ? RD : GN,
                    }}>
                      {submitMsg}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
