/**
 * AcousticRiskSignalNexus — F666
 * "JARVIS, acrsk / acoustic risk / acoustic threat / sound risk /
 *  acoustic signal risk / acoustic sensor risk / sensor risk / acoustic contacts risk"
 * Cross-references /v1/acoustic/contacts against /entities/RiskSignal.
 * FLAGGED contacts (≥1 risk signal keyword-match) vs PASSIVE (no risk link).
 * Coverage % tile; ALL/FLAGGED/PASSIVE filter tabs + search; click-to-expand matched signals.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 123_440;
const Z_INDEX  = 202;

const ACRSK_RE =
  /\bacrsk\b|\bacoustic.?risk\b|\bacoustic.?threat\b|\bsound.?risk\b|\bacoustic.?signal.?risk\b|\bacoustic.?sensor.?risk\b|\bsensor.?risk\b|\bacoustic.?contacts?.?risk\b/i;

export function isAcrskQuery(text) {
  return ACRSK_RE.test(text || "");
}

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseContacts(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.contacts)
    ? data.contacts
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((c, i) => ({
    id:             c.id             || `ac-${i}`,
    label:          c.label          || c.classification || c.class || `Contact ${i + 1}`,
    source:         c.source         || c.sensor         || "",
    classification: c.classification || c.label          || "",
    confidence:     c.confidence     != null ? c.confidence : null,
    lat:            c.lat            || c.latitude        || null,
    lon:            c.lon            || c.longitude       || null,
  }));
}

function normaliseSignals(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.signals)
    ? data.signals
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((s, i) => ({
    id:       s.id       || `sig-${i}`,
    title:    s.title    || s.name    || s.summary || `Signal ${i + 1}`,
    severity: (s.severity || s.level  || "MEDIUM").toString().toUpperCase(),
    source:   s.source   || s.origin  || "",
    summary:  s.summary  || s.description || s.body || "",
  }));
}

function crossRef(contacts, signals) {
  return contacts.map((contact) => {
    const haystack = `${contact.label} ${contact.classification} ${contact.source}`;
    const matches = signals
      .map((sig) => {
        const needle = `${sig.title} ${sig.summary} ${sig.source}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...sig, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...contact, flagged: matches.length > 0, signals: matches };
  });
}

export async function buildAcrskScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [acRes, sigRes] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts?limit=200`, { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,            { headers: hdr }),
    ]);
    const [acData, sigData] = await Promise.all([acRes.json(), sigRes.json()]);
    const contacts = normaliseContacts(acData);
    const signals  = normaliseSignals(sigData);
    const rows     = crossRef(contacts, signals);
    const flagged  = rows.filter((r) => r.flagged).length;
    const passive  = rows.length - flagged;
    const pct = rows.length ? Math.round((flagged / rows.length) * 100) : 0;
    if (!rows.length) return "No acoustic contacts found in the system, sir.";
    const topFlagged = rows
      .filter((r) => r.flagged)
      .slice(0, 2)
      .map((r) => `${r.label} (${r.signals[0]?.severity || "?"})`)
      .join(", ");
    const brief = `Acoustic sensor cross-reference: ${flagged} of ${rows.length} contacts flagged (${pct}%) against active risk signals — ${topFlagged || "none"}.`;
    const { default: resolve } = await import("@/api/cinematicDataAdapters").catch(() => ({ default: null }));
    const base2 = apiBase();
    const aiRes = await fetch(`${base2}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ message: `Acoustic contacts cross-referenced against ${signals.length} risk signals: ${flagged} flagged / ${passive} passive. Top flagged: ${topFlagged || "none"}. Provide a 2-sentence sensor risk assessment.` }),
    });
    const aiData = await aiRes.json();
    return aiData?.response || aiData?.message || brief;
  } catch (e) {
    return `Acoustic risk cross-reference error: ${e.message}`;
  }
}

function sevColor(sev) {
  if (!sev) return DIM;
  const s = sev.toUpperCase();
  if (s === "CRITICAL") return RED;
  if (s === "HIGH")     return "#FF6B35";
  if (s === "MEDIUM")   return AMB;
  return GRN;
}

export default function AcousticRiskSignalNexus() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief]     = useState("");
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [acRes, sigRes] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts?limit=200`, { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`,            { headers: hdr }),
      ]);
      const [acData, sigData] = await Promise.all([acRes.json(), sigRes.json()]);
      const contacts = normaliseContacts(acData);
      const sigs     = normaliseSignals(sigData);
      setSignals(sigs);
      setRows(crossRef(contacts, sigs));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:acrsk-toggle", handler);
    return () => window.removeEventListener("jarvis:acrsk-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const txt = await buildAcrskScript();
      setBrief(txt);
      const ttsRes = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: txt }),
      });
      if (ttsRes.ok) {
        const blob = await ttsRes.blob();
        const url  = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
      }
    } catch (e) {
      setBrief(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  };

  const flagged = rows.filter((r) => r.flagged).length;
  const passive = rows.length - flagged;
  const pct     = rows.length ? Math.round((flagged / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => {
      if (tab === "FLAGGED" && !r.flagged) return false;
      if (tab === "PASSIVE" && r.flagged)  return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          r.label.toLowerCase().includes(q) ||
          r.source.toLowerCase().includes(q) ||
          r.signals.some((s) => s.title.toLowerCase().includes(q))
        );
      }
      return true;
    });

  const btnStyle = {
    position: "fixed",
    bottom: 8,
    left: BTN_LEFT,
    zIndex: Z_INDEX,
    background: flagged > 0 ? `${AMB}22` : "#0A1628CC",
    border: `1px solid ${flagged > 0 ? AMB : CY}66`,
    borderRadius: 6,
    color: flagged > 0 ? AMB : CY,
    padding: "3px 7px",
    cursor: "pointer",
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: "'JetBrains Mono',ui-monospace,monospace",
    userSelect: "none",
  };

  const panelStyle = {
    position: "fixed",
    bottom: 36,
    left: Math.min(BTN_LEFT, window.innerWidth - 420),
    width: 410,
    maxHeight: "70vh",
    overflowY: "auto",
    background: "#050D1AEE",
    border: `1px solid ${AMB}44`,
    borderRadius: 8,
    zIndex: Z_INDEX + 1,
    display: "flex",
    flexDirection: "column",
    padding: 12,
    fontFamily: "'JetBrains Mono',ui-monospace,monospace",
    fontSize: 10,
    color: "#DCEBF5",
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen((o) => !o)}>
        ◈ ACRSK{flagged > 0 && <span style={{ marginLeft: 4, background: AMB, color: "#000", borderRadius: 3, padding: "0 4px" }}>{flagged}</span>}
      </button>

      {open && (
        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 1 }}>◈ ACOUSTIC × RISK SIGNAL NEXUS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 13 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[
              { label: "CONTACTS",  val: rows.length,  color: CY  },
              { label: "FLAGGED",   val: flagged,       color: AMB },
              { label: "PASSIVE",   val: passive,       color: GRN },
              { label: "COVERAGE",  val: `${pct}%`,     color: CY  },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ flex: 1, background: `${color}11`, border: `1px solid ${color}33`, borderRadius: 5, padding: "4px 6px", textAlign: "center" }}>
                <div style={{ color, fontSize: 13, fontWeight: 700 }}>{val}</div>
                <div style={{ color: DIM, fontSize: 8 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
            {["ALL", "FLAGGED", "PASSIVE"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  background: tab === t ? `${CY}22` : "transparent",
                  border: `1px solid ${tab === t ? CY : DIM}44`,
                  borderRadius: 4,
                  color: tab === t ? CY : DIM,
                  cursor: "pointer",
                  fontSize: 9,
                  padding: "3px 0",
                  letterSpacing: 0.5,
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search contacts or signals…"
            style={{
              background: "#0A1628",
              border: `1px solid ${CY}33`,
              borderRadius: 4,
              color: "#DCEBF5",
              fontSize: 9,
              padding: "4px 7px",
              marginBottom: 8,
              width: "100%",
              boxSizing: "border-box",
            }}
          />

          {loading && <div style={{ color: DIM, textAlign: "center", padding: 10 }}>loading…</div>}
          {err     && <div style={{ color: RED, marginBottom: 6 }}>⚠ {err}</div>}

          {/* rows */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {visible.map((row) => (
              <div
                key={row.id}
                style={{
                  marginBottom: 4,
                  background: row.flagged ? `${AMB}0A` : "#0A162855",
                  border: `1px solid ${row.flagged ? AMB : DIM}33`,
                  borderRadius: 5,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", cursor: "pointer" }}
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                >
                  <span style={{
                    fontSize: 8,
                    background: `${row.flagged ? AMB : GRN}22`,
                    border: `1px solid ${row.flagged ? AMB : GRN}55`,
                    color: row.flagged ? AMB : GRN,
                    borderRadius: 3,
                    padding: "1px 4px",
                    minWidth: 56,
                    textAlign: "center",
                  }}>
                    {row.flagged ? "FLAGGED" : "PASSIVE"}
                  </span>
                  <span style={{ color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</span>
                  {row.source && <span style={{ color: DIM, fontSize: 8 }}>{row.source}</span>}
                  {row.flagged && (
                    <span style={{ color: AMB, fontSize: 8 }}>{row.signals.length} sig{row.signals.length !== 1 ? "s" : ""}</span>
                  )}
                </div>
                {expanded === row.id && (
                  <div style={{ padding: "0 8px 8px 8px" }}>
                    {row.confidence != null && (
                      <div style={{ color: DIM, fontSize: 9, marginBottom: 4 }}>
                        confidence: {(row.confidence * 100).toFixed(0)}%
                        {row.lat != null && ` | lat:${Number(row.lat).toFixed(3)} lon:${Number(row.lon).toFixed(3)}`}
                      </div>
                    )}
                    {row.signals.length > 0 ? (
                      row.signals.slice(0, 5).map((sig) => (
                        <div
                          key={sig.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "3px 0",
                            borderBottom: `1px solid ${DIM}22`,
                          }}
                        >
                          <span style={{
                            fontSize: 8,
                            background: `${sevColor(sig.severity)}22`,
                            border: `1px solid ${sevColor(sig.severity)}55`,
                            color: sevColor(sig.severity),
                            borderRadius: 3,
                            padding: "1px 4px",
                          }}>
                            {sig.severity}
                          </span>
                          <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{sig.title}</span>
                          <span style={{ color: DIM, fontSize: 9 }}>hits: {sig.hits}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No risk signal correlation — contact is passive.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!loading && visible.length === 0 && (
              <div style={{ color: DIM, textAlign: "center", padding: 16 }}>No contacts match current filter.</div>
            )}
          </div>

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${AMB}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: `${AMB}18`,
                border: `1px solid ${AMB}55`,
                borderRadius: 5,
                color: AMB,
                padding: "5px 12px",
                cursor: "pointer",
                fontSize: 10,
                letterSpacing: 1,
                width: "100%",
                opacity: assessing ? 0.6 : 1,
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${AMB}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
