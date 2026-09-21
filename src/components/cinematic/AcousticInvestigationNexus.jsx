/**
 * AcousticInvestigationNexus — F667
 * "JARVIS, acinv / acoustic investigation / acoustic case / sound case /
 *  acoustic contacts investigation / which acoustic contacts have cases /
 *  audio investigation / sensor case"
 * Cross-references /v1/acoustic/contacts against /v1/investigations.
 * LINKED contacts (≥1 investigation keyword-match) vs SILENT (no case backing).
 * Coverage % tile; ALL/LINKED/SILENT filter tabs + search; click-to-expand matched cases.
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
const BTN_LEFT = 124_300;
const Z_INDEX  = 203;

const ACINV_RE =
  /\bacinv\b|\bacoustic.?invest\w*\b|\bacoustic.?case\b|\bsound.?case\b|\bacoustic.?contacts?.?invest\w*\b|\baudio.?invest\w*\b|\bsensor.?case\b|\bacoustic.?monitor.?invest\w*\b/i;

export function isAcinvQuery(text) {
  return ACINV_RE.test(text || "");
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

function normaliseInvestigations(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.investigations)
    ? data.investigations
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((inv, i) => ({
    id:      inv.id      || `inv-${i}`,
    title:   inv.title   || inv.name    || inv.subject || `Investigation ${i + 1}`,
    status:  (inv.status || "OPEN").toString().toUpperCase(),
    lead:    inv.lead    || inv.assigned_to || inv.analyst || "",
    summary: inv.summary || inv.description || inv.notes  || "",
  }));
}

function crossRef(contacts, investigations) {
  return contacts.map((contact) => {
    const haystack = `${contact.label} ${contact.classification} ${contact.source}`;
    const matches = investigations
      .map((inv) => {
        const needle = `${inv.title} ${inv.summary} ${inv.lead}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...inv, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...contact, linked: matches.length > 0, cases: matches };
  });
}

export async function buildAcinvScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [acRes, invRes] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts?limit=200`, { headers: hdr }),
      fetch(`${base}/v1/investigations`,              { headers: hdr }),
    ]);
    const [acData, invData] = await Promise.all([acRes.json(), invRes.json()]);
    const contacts      = normaliseContacts(acData);
    const investigations = normaliseInvestigations(invData);
    const rows          = crossRef(contacts, investigations);
    const linked        = rows.filter((r) => r.linked).length;
    const silent        = rows.length - linked;
    const pct = rows.length ? Math.round((linked / rows.length) * 100) : 0;
    if (!rows.length) return "No acoustic contacts found in the system, sir.";
    const topLinked = rows
      .filter((r) => r.linked)
      .slice(0, 2)
      .map((r) => `${r.label} (${r.cases[0]?.status || "?"})`).join(", ");
    const brief = `Acoustic sensor cross-reference: ${linked} of ${rows.length} contacts linked to active investigations (${pct}%) — ${topLinked || "none"}.`;
    const aiRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ message: `Acoustic contacts cross-referenced against ${investigations.length} investigations: ${linked} linked / ${silent} silent (${pct}% coverage). Top linked contacts: ${topLinked || "none"}. Provide a 2-sentence sensor-case correlation assessment.` }),
    });
    const aiData = await aiRes.json();
    return aiData?.response || aiData?.message || brief;
  } catch (e) {
    return `Acoustic investigation cross-reference error: ${e.message}`;
  }
}

function statusColor(status) {
  const s = (status || "").toUpperCase();
  if (s === "ESCALATED") return RED;
  if (s === "ACTIVE")    return AMB;
  if (s === "OPEN")      return CY;
  if (s === "CLOSED")    return DIM;
  return GRN;
}

export default function AcousticInvestigationNexus() {
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
      const [acRes, invRes] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts?limit=200`, { headers: hdr }),
        fetch(`${base}/v1/investigations`,              { headers: hdr }),
      ]);
      const [acData, invData] = await Promise.all([acRes.json(), invRes.json()]);
      const contacts       = normaliseContacts(acData);
      const investigations = normaliseInvestigations(invData);
      setRows(crossRef(contacts, investigations));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:acinv-toggle", handler);
    return () => window.removeEventListener("jarvis:acinv-toggle", handler);
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
      const txt = await buildAcinvScript();
      setBrief(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } finally {
      setAssessing(false);
    }
  };

  const linked  = rows.filter((r) => r.linked).length;
  const silent  = rows.length - linked;
  const pct     = rows.length ? Math.round((linked / rows.length) * 100) : 0;

  const visible = rows.filter((r) => {
    if (tab === "LINKED"  && !r.linked) return false;
    if (tab === "SILENT"  &&  r.linked) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.label + r.classification + r.source).toLowerCase().includes(q);
    }
    return true;
  });

  const TABS = ["ALL", "LINKED", "SILENT"];

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => { setOpen((o) => !o); window.dispatchEvent(new CustomEvent("jarvis:acinv-toggle")); setOpen((o) => !o); }}
        title="Acoustic × Investigation Nexus (ACINV)"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z_INDEX,
          background: open ? `${AMB}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${linked > 0 ? AMB : CY}55`,
          borderRadius: 5,
          color: linked > 0 ? AMB : CY,
          padding: "3px 7px",
          fontSize: 9,
          letterSpacing: 1,
          cursor: "pointer",
          backdropFilter: "blur(4px)",
          whiteSpace: "nowrap",
        }}
      >
        ◈ ACINV{linked > 0 && <span style={{ marginLeft: 4, background: AMB, color: "#000", borderRadius: 3, padding: "0 3px", fontSize: 8 }}>{linked}</span>}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            left: BTN_LEFT,
            bottom: 36,
            zIndex: Z_INDEX + 1,
            width: 340,
            maxHeight: "72vh",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            background: "rgba(5,8,13,0.92)",
            border: `1px solid ${AMB}44`,
            borderRadius: 10,
            fontFamily: "'JetBrains Mono',monospace",
            boxShadow: `0 0 40px ${AMB}22`,
            backdropFilter: "blur(10px)",
          }}
        >
          {/* Header */}
          <div style={{ padding: "10px 12px 6px", borderBottom: `1px solid ${AMB}22` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: AMB, fontSize: 10, letterSpacing: 2, fontWeight: 700 }}>◈ ACINV</span>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
            </div>
            <div style={{ color: DIM, fontSize: 8, marginTop: 2 }}>Acoustic × Investigation Nexus</div>
            {/* Stat tiles */}
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {[
                { label: "CONTACTS", value: rows.length, color: CY },
                { label: "LINKED",   value: linked,      color: AMB },
                { label: "SILENT",   value: silent,      color: DIM },
                { label: "COVERAGE", value: `${pct}%`,   color: pct >= 50 ? GRN : AMB },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ flex: 1, background: `${color}11`, border: `1px solid ${color}33`, borderRadius: 5, padding: "4px 6px", textAlign: "center" }}>
                  <div style={{ color, fontSize: 13, fontWeight: 700 }}>{value}</div>
                  <div style={{ color: DIM, fontSize: 7, letterSpacing: 1 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs + search */}
          <div style={{ padding: "6px 12px", borderBottom: `1px solid ${AMB}22`, display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${AMB}22` : "transparent",
                border: `1px solid ${tab === t ? AMB : DIM}44`,
                borderRadius: 4, color: tab === t ? AMB : DIM,
                padding: "2px 7px", fontSize: 8, cursor: "pointer", letterSpacing: 1,
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.04)",
                border: `1px solid ${DIM}44`, borderRadius: 4,
                color: "#DCEBF5", fontSize: 9, padding: "2px 6px", width: 80,
              }}
            />
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading && <div style={{ color: DIM, textAlign: "center", padding: 16, fontSize: 10 }}>Loading…</div>}
            {err    && <div style={{ color: RED, textAlign: "center", padding: 16, fontSize: 9 }}>Error: {err}</div>}
            {!loading && visible.map((row) => (
              <div key={row.id} style={{ borderBottom: `1px solid ${DIM}18` }}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", cursor: "pointer" }}
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                >
                  <span style={{
                    fontSize: 8,
                    background: `${row.linked ? AMB : GRN}22`,
                    border: `1px solid ${row.linked ? AMB : GRN}55`,
                    color: row.linked ? AMB : GRN,
                    borderRadius: 3,
                    padding: "1px 4px",
                    minWidth: 46,
                    textAlign: "center",
                  }}>
                    {row.linked ? "LINKED" : "SILENT"}
                  </span>
                  <span style={{ color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</span>
                  {row.source && <span style={{ color: DIM, fontSize: 8 }}>{row.source}</span>}
                  {row.linked && (
                    <span style={{ color: AMB, fontSize: 8 }}>{row.cases.length} case{row.cases.length !== 1 ? "s" : ""}</span>
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
                    {row.cases.length > 0 ? (
                      row.cases.slice(0, 5).map((inv) => (
                        <div
                          key={inv.id}
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
                            background: `${statusColor(inv.status)}22`,
                            border: `1px solid ${statusColor(inv.status)}55`,
                            color: statusColor(inv.status),
                            borderRadius: 3,
                            padding: "1px 4px",
                          }}>
                            {inv.status}
                          </span>
                          <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{inv.title}</span>
                          <span style={{ color: DIM, fontSize: 9 }}>hits: {inv.hits}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No investigation correlation — contact is silent.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!loading && visible.length === 0 && (
              <div style={{ color: DIM, textAlign: "center", padding: 16 }}>No contacts match current filter.</div>
            )}
          </div>

          {/* Assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${AMB}22`, paddingTop: 8, padding: "8px 12px" }}>
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
