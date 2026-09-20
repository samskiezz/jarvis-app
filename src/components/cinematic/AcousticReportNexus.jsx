/**
 * AcousticReportNexus — F674
 * "JARVIS, acrpt / acoustic report / report acoustic / acoustic documentation /
 *  sensor report / acoustic report coverage / sound report"
 * Cross-references /v1/acoustic/contacts against /v1/reports.
 * DOCUMENTED contacts (≥1 report keyword-match) vs UNDOCUMENTED (intelligence gap).
 * Coverage % tile; ALL/DOCUMENTED/UNDOCUMENTED filter tabs + search; click-to-expand matched reports.
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
const BTN_LEFT = 130_320;
const Z_INDEX  = 210;

const ACRPT_RE =
  /\bacrpt\b|\bacoustic.?report\b|\breport.?acoustic\b|\bacoustic.?documentation\b|\bsensor.?report\b|\bacoustic.?report.?coverage\b|\bsound.?report\b/i;

export function isAcrptQuery(text) {
  return ACRPT_RE.test(text || "");
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

function normaliseReports(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.reports)
    ? data.reports
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((r, i) => ({
    id:      r.id      || `rpt-${i}`,
    title:   r.title   || r.name    || r.subject || `Report ${i + 1}`,
    type:    (r.type   || r.kind    || r.category || "OTHER").toString().toUpperCase(),
    author:  r.author  || r.created_by || "",
    summary: r.summary || r.description || r.content || "",
  }));
}

function crossRef(contacts, reports) {
  return contacts.map((contact) => {
    const haystack = `${contact.label} ${contact.classification} ${contact.source}`;
    const matches = reports
      .map((rpt) => {
        const needle = `${rpt.title} ${rpt.summary}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...rpt, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...contact, documented: matches.length > 0, reports: matches };
  });
}

export async function buildAcrptScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [acRes, rptRes] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts?limit=200`, { headers: hdr }),
      fetch(`${base}/v1/reports`,                     { headers: hdr }),
    ]);
    const [acData, rptData] = await Promise.all([acRes.json(), rptRes.json()]);
    const contacts = normaliseContacts(acData);
    const reports  = normaliseReports(rptData);
    const rows     = crossRef(contacts, reports);
    const documented   = rows.filter((r) => r.documented).length;
    const undocumented = rows.length - documented;
    const pct = rows.length ? Math.round((documented / rows.length) * 100) : 0;
    if (!rows.length) return "No acoustic contacts found in the system, sir.";
    const topDoc = rows
      .filter((r) => r.documented)
      .slice(0, 2)
      .map((r) => `${r.label} → ${r.reports[0]?.title || "?"}`)
      .join("; ");
    const brief = `Acoustic × Report cross-reference: ${documented} of ${rows.length} contacts report-documented (${pct}%) — ${topDoc || "none"}.`;
    const aiRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Acoustic contacts cross-referenced against ${reports.length} reports: ${documented} documented / ${undocumented} undocumented (intelligence gap). Top matches: ${topDoc || "none"}. Provide a 2-sentence acoustic intelligence documentation assessment.`,
      }),
    });
    const aiData = await aiRes.json();
    return aiData?.response || aiData?.message || brief;
  } catch (e) {
    return `Acoustic report cross-reference error: ${e.message}`;
  }
}

function typeColor(type) {
  if (!type) return DIM;
  const t = type.toUpperCase();
  if (t.includes("THREAT")) return RED;
  if (t.includes("INTEL"))  return CY;
  if (t.includes("OPS"))    return AMB;
  if (t.includes("KNOW"))   return GRN;
  return DIM;
}

export default function AcousticReportNexus() {
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
      const [acRes, rptRes] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts?limit=200`, { headers: hdr }),
        fetch(`${base}/v1/reports`,                     { headers: hdr }),
      ]);
      const [acData, rptData] = await Promise.all([acRes.json(), rptRes.json()]);
      const contacts = normaliseContacts(acData);
      const reports  = normaliseReports(rptData);
      setRows(crossRef(contacts, reports));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:acrpt-toggle", handler);
    return () => window.removeEventListener("jarvis:acrpt-toggle", handler);
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
      const txt = await buildAcrptScript();
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

  const documented   = rows.filter((r) => r.documented).length;
  const undocumented = rows.length - documented;
  const pct          = rows.length ? Math.round((documented / rows.length) * 100) : 0;

  const visible = rows.filter((r) => {
    if (tab === "DOCUMENTED"   && !r.documented) return false;
    if (tab === "UNDOCUMENTED" &&  r.documented) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.label.toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q) ||
        r.reports.some((rpt) => rpt.title.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const btnStyle = {
    position: "fixed",
    bottom: 8,
    left: BTN_LEFT,
    zIndex: Z_INDEX,
    background: undocumented > 0 ? `${AMB}22` : "#0A1628CC",
    border: `1px solid ${undocumented > 0 ? AMB : CY}66`,
    borderRadius: 6,
    color: undocumented > 0 ? AMB : CY,
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
        ◈ ACRPT
        {undocumented > 0 && (
          <span style={{ marginLeft: 4, background: AMB, color: "#000", borderRadius: 3, padding: "0 4px" }}>
            {undocumented}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 1 }}>◈ ACOUSTIC × REPORT NEXUS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 13 }}>✕</button>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[
              { label: "CONTACTS",     val: rows.length,  color: CY  },
              { label: "DOCUMENTED",   val: documented,   color: GRN },
              { label: "UNDOCUMENTED", val: undocumented, color: AMB },
              { label: "COVERAGE",     val: `${pct}%`,    color: CY  },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ flex: 1, background: `${color}11`, border: `1px solid ${color}33`, borderRadius: 5, padding: "4px 6px", textAlign: "center" }}>
                <div style={{ color, fontSize: 13, fontWeight: 700 }}>{val}</div>
                <div style={{ color: DIM, fontSize: 8 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
            {["ALL", "DOCUMENTED", "UNDOCUMENTED"].map((t) => (
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
            placeholder="search contacts or reports…"
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
                  background: row.documented ? `${GRN}0A` : `${AMB}0A`,
                  border: `1px solid ${row.documented ? GRN : AMB}33`,
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
                    background: `${row.documented ? GRN : AMB}22`,
                    border: `1px solid ${row.documented ? GRN : AMB}55`,
                    color: row.documented ? GRN : AMB,
                    borderRadius: 3,
                    padding: "1px 4px",
                    minWidth: 80,
                    textAlign: "center",
                  }}>
                    {row.documented ? "DOCUMENTED" : "UNDOCUMENTED"}
                  </span>
                  <span style={{ color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</span>
                  {row.source && <span style={{ color: DIM, fontSize: 8 }}>{row.source}</span>}
                  {row.documented && (
                    <span style={{ color: GRN, fontSize: 8 }}>{row.reports.length} rpt</span>
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
                    {row.reports.length > 0 ? (
                      row.reports.slice(0, 5).map((rpt) => (
                        <div
                          key={rpt.id}
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
                            background: `${typeColor(rpt.type)}22`,
                            border: `1px solid ${typeColor(rpt.type)}55`,
                            color: typeColor(rpt.type),
                            borderRadius: 3,
                            padding: "1px 4px",
                          }}>
                            {rpt.type}
                          </span>
                          <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rpt.title}</span>
                          <span style={{ color: DIM, fontSize: 9 }}>hits:{rpt.hits}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No report match — contact is undocumented.</div>
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
