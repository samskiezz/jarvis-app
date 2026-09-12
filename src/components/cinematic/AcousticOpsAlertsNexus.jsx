/**
 * AcousticOpsAlertsNexus — F676
 * "JARVIS, acal / acoustic alerts / alert acoustic / ops alerts acoustic /
 *  sound alerts / sensor alerts / acoustic ops alerts / acoustic alert nexus"
 * Cross-references /v1/acoustic/contacts against /v1/ops/alerts.
 * ALERTED contacts (≥1 ops-alert keyword-match) vs CLEAR (no alert signal).
 * Alert severity tile; ALL/ALERTED/CLEAR filter tabs + search; click-to-expand matched alerts.
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
const BTN_LEFT = 132_040;
const Z_INDEX  = 212;

const ACAL_RE =
  /\bacal\b|\bacoustic.?alerts?\b|\balert.?acoustic\b|\bops.?alerts?.?acoustic\b|\bsound.?alerts?\b|\bsensor.?alerts?\b|\bacoustic.?ops.?alerts?\b|\bacoustic.?alert.?nexus\b/i;

export function isAcalQuery(text) {
  return ACAL_RE.test(text || "");
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

function normaliseOpsAlerts(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.alerts)
    ? data.alerts
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((a, i) => ({
    id:       a.id       || `al-${i}`,
    title:    a.title    || a.name    || a.message || a.description || `Alert ${i + 1}`,
    severity: (a.severity || a.level  || a.priority || "INFO").toString().toUpperCase(),
    source:   a.source   || a.service || a.origin  || "",
    body:     a.body     || a.description || a.details || "",
  }));
}

function crossRef(contacts, alerts) {
  return contacts.map((contact) => {
    const haystack = `${contact.label} ${contact.classification} ${contact.source}`;
    const matches = alerts
      .map((al) => {
        const needle = `${al.title} ${al.body} ${al.source}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...al, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...contact, alerted: matches.length > 0, alerts: matches };
  });
}

export async function buildAcalScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [acRes, alRes] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts?limit=200`, { headers: hdr }),
      fetch(`${base}/v1/ops/alerts`,                  { headers: hdr }),
    ]);
    const [acData, alData] = await Promise.all([acRes.json(), alRes.json()]);
    const contacts = normaliseContacts(acData);
    const alerts   = normaliseOpsAlerts(alData);
    const rows     = crossRef(contacts, alerts);
    const alerted  = rows.filter((r) => r.alerted).length;
    const clear    = rows.length - alerted;
    const pct = rows.length ? Math.round((alerted / rows.length) * 100) : 0;
    if (!rows.length) return "No acoustic contacts found in the system, sir.";
    const topAlerted = rows
      .filter((r) => r.alerted)
      .slice(0, 2)
      .map((r) => `${r.label} → ${r.alerts[0]?.title || "?"}`)
      .join("; ");
    const brief = `Acoustic × Ops Alerts cross-reference: ${alerted} of ${rows.length} contacts correlated to operational alerts (${pct}%) — ${topAlerted || "none"}.`;
    const aiRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Acoustic contacts cross-referenced against ${alerts.length} ops alerts: ${alerted} alerted / ${clear} clear. Top correlations: ${topAlerted || "none"}. Provide a 2-sentence sensor-alert assessment.`,
      }),
    });
    const aiData = await aiRes.json();
    return aiData?.response || aiData?.message || brief;
  } catch (e) {
    return `Acoustic ops alerts cross-reference error: ${e.message}`;
  }
}

function severityColor(sev) {
  if (!sev) return DIM;
  const s = sev.toUpperCase();
  if (s === "CRITICAL") return RED;
  if (s === "HIGH")     return "#FF6600";
  if (s === "WARNING")  return AMB;
  if (s === "INFO")     return CY;
  return GRN;
}

export default function AcousticOpsAlertsNexus() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief]       = useState("");
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [acRes, alRes] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts?limit=200`, { headers: hdr }),
        fetch(`${base}/v1/ops/alerts`,                  { headers: hdr }),
      ]);
      const [acData, alData] = await Promise.all([acRes.json(), alRes.json()]);
      const contacts = normaliseContacts(acData);
      const alerts   = normaliseOpsAlerts(alData);
      setRows(crossRef(contacts, alerts));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:acal-toggle", handler);
    return () => window.removeEventListener("jarvis:acal-toggle", handler);
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
      const txt = await buildAcalScript();
      setBrief(txt);
      const ttsRes = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: txt }),
      });
      if (ttsRes.ok) {
        const blob  = await ttsRes.blob();
        const url   = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
      }
    } catch (e) {
      setBrief(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  };

  const alerted = rows.filter((r) => r.alerted).length;
  const clear   = rows.length - alerted;
  const pct     = rows.length ? Math.round((alerted / rows.length) * 100) : 0;

  const visible = rows.filter((r) => {
    if (tab === "ALERTED" && !r.alerted) return false;
    if (tab === "CLEAR"   &&  r.alerted) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.label.toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q) ||
        r.alerts.some((a) => a.title.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const btnStyle = {
    position: "fixed",
    bottom: 8,
    left: BTN_LEFT,
    zIndex: Z_INDEX,
    background: alerted > 0 ? `${AMB}22` : "#0A1628CC",
    border: `1px solid ${alerted > 0 ? AMB : CY}66`,
    borderRadius: 6,
    color: alerted > 0 ? AMB : CY,
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
        ◈ ACAL
        {alerted > 0 && (
          <span style={{ marginLeft: 4, background: AMB, color: "#000", borderRadius: 3, padding: "0 4px" }}>
            {alerted}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 1 }}>◈ ACOUSTIC × OPS ALERTS NEXUS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 13 }}>✕</button>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[
              { label: "CONTACTS",  val: rows.length, color: CY  },
              { label: "ALERTED",   val: alerted,     color: AMB },
              { label: "CLEAR",     val: clear,       color: GRN },
              { label: "COVERAGE",  val: `${pct}%`,   color: CY  },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ flex: 1, background: `${color}11`, border: `1px solid ${color}33`, borderRadius: 5, padding: "4px 6px", textAlign: "center" }}>
                <div style={{ color, fontSize: 13, fontWeight: 700 }}>{val}</div>
                <div style={{ color: DIM, fontSize: 8 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
            {["ALL", "ALERTED", "CLEAR"].map((t) => (
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

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search contacts or ops alerts…"
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

          <div style={{ flex: 1, overflowY: "auto" }}>
            {visible.map((row) => (
              <div
                key={row.id}
                style={{
                  marginBottom: 4,
                  background: row.alerted ? `${AMB}0A` : "#0A162855",
                  border: `1px solid ${row.alerted ? AMB : DIM}33`,
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
                    background: `${row.alerted ? AMB : GRN}22`,
                    border: `1px solid ${row.alerted ? AMB : GRN}55`,
                    color: row.alerted ? AMB : GRN,
                    borderRadius: 3,
                    padding: "1px 4px",
                    minWidth: 60,
                    textAlign: "center",
                  }}>
                    {row.alerted ? "ALERTED" : "CLEAR"}
                  </span>
                  <span style={{ color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</span>
                  {row.source && <span style={{ color: DIM, fontSize: 8 }}>{row.source}</span>}
                  {row.alerted && (
                    <span style={{ color: AMB, fontSize: 8 }}>{row.alerts.length} alert{row.alerts.length !== 1 ? "s" : ""}</span>
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
                    {row.alerts.length > 0 ? (
                      row.alerts.slice(0, 5).map((al) => (
                        <div
                          key={al.id}
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
                            background: `${severityColor(al.severity)}22`,
                            border: `1px solid ${severityColor(al.severity)}55`,
                            color: severityColor(al.severity),
                            borderRadius: 3,
                            padding: "1px 4px",
                          }}>
                            {al.severity}
                          </span>
                          <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{al.title}</span>
                          <span style={{ color: DIM, fontSize: 9 }}>hits: {al.hits}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No ops alert correlation — contact is clear.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!loading && visible.length === 0 && (
              <div style={{ color: DIM, textAlign: "center", padding: 16 }}>No contacts match current filter.</div>
            )}
          </div>

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
