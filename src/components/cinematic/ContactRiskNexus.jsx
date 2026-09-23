/**
 * ContactRiskNexus — F486
 * "JARVIS, contact risk / risk contacts / who is risky / contact exposure / crisk"
 * Cross-references /entities/Contact + /entities/RiskSignal.
 * Matches contacts to active risk signals by name/tag overlap.
 * Severity-sorted; click to expand risk detail; ▶ ASSESS → /v1/jarvis/agent/chat + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const RED = "#FF4444";
const ORG = "#FF8C42";
const YLW = "#FFD700";
const GRN = "#00E5A0";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 90_000;

const CRISK_RE =
  /\bcontact.?risk\b|\brisk.?contact\b|\bwho.is.risky\b|\bcontact.exposure\b|\bcrisk\b|\brisky.contact\b|\bcontact.threat\b|\bcontact.danger\b|\bperson.?risk\b|\bpeople.?risk\b/i;

export function isContactRiskQuery(text) {
  return CRISK_RE.test(text || "");
}

function severityOrder(sev) {
  const s = (sev || "").toUpperCase();
  if (s === "CRITICAL") return 0;
  if (s === "HIGH")     return 1;
  if (s === "MEDIUM")   return 2;
  return 3;
}

function severityColor(sev) {
  const s = (sev || "").toUpperCase();
  if (s === "CRITICAL") return RED;
  if (s === "HIGH")     return ORG;
  if (s === "MEDIUM")   return YLW;
  return GRN;
}

function normaliseContacts(data) {
  if (!data) return [];
  const raw = data.contacts || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((c, i) => ({
    id:   c.id || `c-${i}`,
    name: (c.name || c.full_name || c.display_name || `Contact ${i + 1}`).trim(),
    tags: [
      ...(c.tags || []),
      ...(c.labels || []),
      c.organization, c.org, c.company, c.role, c.title,
    ].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function normaliseSignals(data) {
  if (!data) return [];
  const raw = data.signals || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:          s.id || `rs-${i}`,
    name:        s.name || s.title || s.signal_name || `Signal ${i + 1}`,
    severity:    (s.severity || s.level || s.risk_level || "LOW").toUpperCase(),
    description: s.description || s.summary || s.detail || null,
    source:      s.source || s.origin || null,
    tags: [
      ...(s.tags || []),
      ...(s.labels || []),
      s.target, s.entity, s.related_entity,
    ].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function buildNexus(contacts, signals) {
  return contacts
    .map(contact => {
      const matched = signals.filter(sig => {
        const cName = contact.name.toLowerCase();
        const sName = sig.name.toLowerCase();
        const sDesc = (sig.description || "").toLowerCase();
        const nameHit = sName.includes(cName) || sDesc.includes(cName) || cName.includes(sName);
        const tagHit  = contact.tags.some(ct => sig.tags.some(st => st && ct && (st.includes(ct) || ct.includes(st))));
        return nameHit || tagHit;
      });
      return { contact, signals: matched };
    })
    .filter(row => row.signals.length > 0)
    .sort((a, b) => {
      const aMax = Math.min(...a.signals.map(s => severityOrder(s.severity)));
      const bMax = Math.min(...b.signals.map(s => severityOrder(s.severity)));
      return aMax - bMax;
    });
}

export async function buildContactRiskScript() {
  let contactData = null, riskData = null;
  try {
    const [cr, rr] = await Promise.all([
      fetch(`${apiBase()}/entities/Contact`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    if (cr.ok)  contactData = await cr.json();
    if (rr.ok)  riskData    = await rr.json();
  } catch (_) {}

  if (!contactData && !riskData)
    return "Unable to retrieve contact-risk nexus data at this time, sir.";

  const contacts = normaliseContacts(contactData);
  const signals  = normaliseSignals(riskData);
  const nexus    = buildNexus(contacts, signals);

  if (!nexus.length) {
    return `Contact-Risk Nexus: ${contacts.length} contacts and ${signals.length} risk signals scanned. No direct name or tag overlaps detected, sir.`;
  }

  const critical = nexus.filter(r => r.signals.some(s => s.severity === "CRITICAL")).length;
  const high     = nexus.filter(r => r.signals.some(s => s.severity === "HIGH")).length;
  const top      = nexus.slice(0, 2).map(r =>
    `${r.contact.name} (${r.signals.map(s => s.severity).join(", ")})`
  ).join("; ");

  return [
    `Contact-Risk Nexus: ${nexus.length} of ${contacts.length} contacts are associated with active risk signals.`,
    critical ? `${critical} linked to CRITICAL-severity signals.` : null,
    high      ? `${high} linked to HIGH-severity signals.` : null,
    top       ? `Top matches: ${top}.` : null,
  ].filter(Boolean).join(" ");
}

export default function ContactRiskNexus() {
  const [open,     setOpen]     = useState(false);
  const [nexus,    setNexus]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [lastTs,   setLastTs]   = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cr, rr] = await Promise.all([
        fetch(`${apiBase()}/entities/Contact`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const contactData = cr.ok  ? await cr.json() : null;
      const riskData    = rr.ok  ? await rr.json() : null;
      const contacts = normaliseContacts(contactData);
      const signals  = normaliseSignals(riskData);
      setNexus(buildNexus(contacts, signals));
      setLastTs(Date.now());
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen(o => {
        if (!o) load();
        return !o;
      });
    };
    window.addEventListener("jarvis:crisk-toggle", toggle);
    return () => window.removeEventListener("jarvis:crisk-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async (row) => {
    const key = row.contact.id;
    setAssessing(key);
    try {
      const prompt = `Briefly assess the risk posed by contact "${row.contact.name}" given the following active signals: ${row.signals.map(s => `${s.severity} - ${s.name}${s.description ? ": " + s.description : ""}`).join("; ")}. Two sentences max.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      if (r.ok) {
        const d = await r.json();
        const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
        if (txt) {
          await fetch(`${apiBase()}/v1/voice/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
            body: JSON.stringify({ text: txt, voice: "onyx" }),
          });
        }
      }
    } catch (_) {}
    finally { setAssessing(null); }
  }, []);

  const critCount = nexus.filter(r => r.signals.some(s => s.severity === "CRITICAL")).length;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => { setOpen(o => { if (!o) load(); return !o; }); }}
        style={{
          position: "fixed", left: 15220, bottom: 8, zIndex: 76,
          background: open ? CY : "rgba(0,20,40,0.92)",
          color: open ? "#000" : CY,
          border: `1px solid ${CY}`,
          borderRadius: 4, padding: "3px 8px",
          fontSize: 10, fontFamily: "monospace", letterSpacing: 1,
          cursor: "pointer", whiteSpace: "nowrap",
        }}
        title="Contact-Risk Nexus (CRISK)"
      >
        ◈ CRISK{critCount > 0 && (
          <span style={{
            marginLeft: 4, background: RED, color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{critCount}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 76,
          width: 480, maxHeight: "70vh",
          background: "rgba(0,12,28,0.97)",
          border: `1px solid ${CY}`,
          borderRadius: 8, overflow: "hidden",
          display: "flex", flexDirection: "column",
          boxShadow: `0 0 24px ${CY}44`,
          fontFamily: "monospace",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${CY}33`,
            background: "rgba(41,231,255,0.06)",
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
              ◈ CONTACT-RISK NEXUS
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {loading && (
                <span style={{ color: DIM, fontSize: 9 }}>SCANNING…</span>
              )}
              {lastTs && !loading && (
                <span style={{ color: DIM, fontSize: 9 }}>
                  {new Date(lastTs).toLocaleTimeString()}
                </span>
              )}
              <button
                onClick={load}
                style={{ background: "none", border: `1px solid ${CY}44`, color: CY,
                         borderRadius: 3, padding: "1px 6px", fontSize: 9, cursor: "pointer" }}
              >↺</button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM,
                         fontSize: 13, cursor: "pointer", lineHeight: 1 }}
              >✕</button>
            </div>
          </div>

          {/* Stats bar */}
          <div style={{
            display: "flex", gap: 16, padding: "6px 12px",
            borderBottom: `1px solid ${CY}22`,
          }}>
            {[
              ["MATCHED", nexus.length, CY],
              ["CRITICAL", nexus.filter(r => r.signals.some(s => s.severity === "CRITICAL")).length, RED],
              ["HIGH",     nexus.filter(r => r.signals.some(s => s.severity === "HIGH")).length, ORG],
              ["SIGNALS",  nexus.reduce((s, r) => s + r.signals.length, 0), YLW],
            ].map(([label, val, col]) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ color: col, fontSize: 14, fontWeight: "bold" }}>{val}</div>
                <div style={{ color: DIM, fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {nexus.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, padding: 16, textAlign: "center" }}>
                No contact-risk overlaps detected.
              </div>
            )}
            {nexus.map(row => {
              const maxSev = row.signals.reduce(
                (best, s) => severityOrder(s.severity) < severityOrder(best) ? s.severity : best,
                "LOW"
              );
              const col = severityColor(maxSev);
              const isExp = expanded === row.contact.id;
              return (
                <div
                  key={row.contact.id}
                  style={{
                    borderBottom: `1px solid ${CY}18`,
                    padding: "8px 12px",
                    cursor: "pointer",
                  }}
                  onClick={() => setExpanded(isExp ? null : row.contact.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        background: col + "22", color: col, border: `1px solid ${col}55`,
                        borderRadius: 3, padding: "1px 5px", fontSize: 8, letterSpacing: 1,
                      }}>{maxSev}</span>
                      <span style={{ color: "#e0f0ff", fontSize: 11 }}>{row.contact.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: DIM, fontSize: 9 }}>
                        {row.signals.length} signal{row.signals.length !== 1 ? "s" : ""}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); assess(row); }}
                        disabled={assessing === row.contact.id}
                        style={{
                          background: "none", border: `1px solid ${CY}55`, color: CY,
                          borderRadius: 3, padding: "1px 5px", fontSize: 8, cursor: "pointer",
                          opacity: assessing === row.contact.id ? 0.5 : 1,
                        }}
                      >
                        {assessing === row.contact.id ? "…" : "▶ ASSESS"}
                      </button>
                      <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 6, paddingLeft: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {row.signals.map(sig => (
                        <div key={sig.id} style={{
                          background: "rgba(41,231,255,0.04)",
                          border: `1px solid ${severityColor(sig.severity)}33`,
                          borderRadius: 4, padding: "5px 8px",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{
                              background: severityColor(sig.severity) + "22",
                              color: severityColor(sig.severity),
                              border: `1px solid ${severityColor(sig.severity)}55`,
                              borderRadius: 3, padding: "0 4px", fontSize: 7, letterSpacing: 1,
                            }}>{sig.severity}</span>
                            <span style={{ color: "#c0d8f0", fontSize: 10 }}>{sig.name}</span>
                          </div>
                          {sig.description && (
                            <div style={{ color: DIM, fontSize: 9, marginTop: 3, lineHeight: 1.4 }}>
                              {sig.description.slice(0, 160)}
                              {sig.description.length > 160 ? "…" : ""}
                            </div>
                          )}
                          {sig.source && (
                            <div style={{ color: DIM, fontSize: 8, marginTop: 2 }}>
                              Source: {sig.source}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "5px 12px", borderTop: `1px solid ${CY}22`,
            color: DIM, fontSize: 8, letterSpacing: 1,
          }}>
            AUTO-REFRESH {POLL_MS / 1000}s · /entities/Contact + /entities/RiskSignal
          </div>
        </div>
      )}
    </>
  );
}
