/**
 * AcousticScenarioNexus — F673
 * "JARVIS, acscn / acoustic scenario / scenario acoustic / sound scenario /
 *  sensor scenario / acoustic scenario coverage / acoustic playbook"
 * Cross-references /v1/acoustic/contacts against /v1/scenario/list.
 * SCENARIO-BACKED contacts (≥1 scenario keyword-match) vs UNSCRIPTED (no scenario backing).
 * Coverage % tile; ALL/SCENARIO-BACKED/UNSCRIPTED filter tabs + search; click-to-expand matched scenarios.
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
const BTN_LEFT = 129_460;
const Z_INDEX  = 209;

const ACSCN_RE =
  /\bacscn\b|\bacoustic.?scenario\b|\bscenario.?acoustic\b|\bsound.?scenario\b|\bsensor.?scenario\b|\bacoustic.?scenario.?coverage\b|\bacoustic.?playbook\b/i;

export function isAcscnQuery(text) {
  return ACSCN_RE.test(text || "");
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

function normaliseScenarios(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.scenarios)
    ? data.scenarios
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((s, i) => ({
    id:          s.id          || `sc-${i}`,
    name:        s.name        || s.title       || s.scenario_name || `Scenario ${i + 1}`,
    kind:        (s.kind       || s.type        || s.category      || "SIM").toString().toUpperCase(),
    description: s.description || s.summary     || s.notes         || "",
  }));
}

function crossRef(contacts, scenarios) {
  return contacts.map((contact) => {
    const haystack = `${contact.label} ${contact.classification} ${contact.source}`;
    const matches = scenarios
      .map((sc) => {
        const needle = `${sc.name} ${sc.description}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...sc, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...contact, backed: matches.length > 0, scenarios: matches };
  });
}

export async function buildAcscnScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [acRes, scRes] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts?limit=200`, { headers: hdr }),
      fetch(`${base}/v1/scenario/list`,               { headers: hdr }),
    ]);
    const [acData, scData] = await Promise.all([acRes.json(), scRes.json()]);
    const contacts  = normaliseContacts(acData);
    const scenarios = normaliseScenarios(scData);
    const rows      = crossRef(contacts, scenarios);
    const backed    = rows.filter((r) => r.backed).length;
    const unscripted = rows.length - backed;
    const pct = rows.length ? Math.round((backed / rows.length) * 100) : 0;
    if (!rows.length) return "No acoustic contacts found in the system, sir.";
    const topBacked = rows
      .filter((r) => r.backed)
      .slice(0, 2)
      .map((r) => `${r.label} → ${r.scenarios[0]?.name || "?"}`)
      .join("; ");
    const brief = `Acoustic × Scenario cross-reference: ${backed} of ${rows.length} contacts scenario-backed (${pct}%) — ${topBacked || "none"}.`;
    const aiRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Acoustic contacts cross-referenced against ${scenarios.length} scenarios: ${backed} scenario-backed / ${unscripted} unscripted. Top matches: ${topBacked || "none"}. Provide a 2-sentence sensor-scenario playbook coverage assessment.`,
      }),
    });
    const aiData = await aiRes.json();
    return aiData?.response || aiData?.message || brief;
  } catch (e) {
    return `Acoustic scenario cross-reference error: ${e.message}`;
  }
}

function kindColor(kind) {
  if (!kind) return DIM;
  const k = kind.toUpperCase();
  if (k.includes("THREAT") || k.includes("CRISIS")) return RED;
  if (k.includes("INTEL")  || k.includes("SIGNAL")) return CY;
  if (k.includes("OPS")    || k.includes("OPERATION")) return AMB;
  return GRN;
}

export default function AcousticScenarioNexus() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
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
      const [acRes, scRes] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts?limit=200`, { headers: hdr }),
        fetch(`${base}/v1/scenario/list`,               { headers: hdr }),
      ]);
      const [acData, scData] = await Promise.all([acRes.json(), scRes.json()]);
      const contacts  = normaliseContacts(acData);
      const scenarios = normaliseScenarios(scData);
      setRows(crossRef(contacts, scenarios));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:acscn-toggle", handler);
    return () => window.removeEventListener("jarvis:acscn-toggle", handler);
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
      const txt = await buildAcscnScript();
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

  const backed     = rows.filter((r) => r.backed).length;
  const unscripted = rows.length - backed;
  const pct        = rows.length ? Math.round((backed / rows.length) * 100) : 0;

  const visible = rows.filter((r) => {
    if (tab === "SCENARIO-BACKED" && !r.backed) return false;
    if (tab === "UNSCRIPTED"      &&  r.backed) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.label.toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q) ||
        r.scenarios.some((s) => s.name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const btnStyle = {
    position: "fixed",
    bottom: 8,
    left: BTN_LEFT,
    zIndex: Z_INDEX,
    background: backed > 0 ? `${AMB}22` : "#0A1628CC",
    border: `1px solid ${backed > 0 ? AMB : CY}66`,
    borderRadius: 6,
    color: backed > 0 ? AMB : CY,
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
        ◈ ACSCN
        {backed > 0 && (
          <span style={{ marginLeft: 4, background: AMB, color: "#000", borderRadius: 3, padding: "0 4px" }}>
            {backed}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 1 }}>◈ ACOUSTIC × SCENARIO NEXUS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 13 }}>✕</button>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[
              { label: "CONTACTS",       val: rows.length, color: CY  },
              { label: "SCENARIO-BACKED", val: backed,      color: AMB },
              { label: "UNSCRIPTED",     val: unscripted,  color: GRN },
              { label: "COVERAGE",       val: `${pct}%`,   color: CY  },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ flex: 1, background: `${color}11`, border: `1px solid ${color}33`, borderRadius: 5, padding: "4px 6px", textAlign: "center" }}>
                <div style={{ color, fontSize: 13, fontWeight: 700 }}>{val}</div>
                <div style={{ color: DIM, fontSize: 8 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
            {["ALL", "SCENARIO-BACKED", "UNSCRIPTED"].map((t) => (
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
            placeholder="search contacts or scenarios…"
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
                  background: row.backed ? `${AMB}0A` : "#0A162855",
                  border: `1px solid ${row.backed ? AMB : DIM}33`,
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
                    background: `${row.backed ? AMB : GRN}22`,
                    border: `1px solid ${row.backed ? AMB : GRN}55`,
                    color: row.backed ? AMB : GRN,
                    borderRadius: 3,
                    padding: "1px 4px",
                    minWidth: 72,
                    textAlign: "center",
                  }}>
                    {row.backed ? "BACKED" : "UNSCRIPTED"}
                  </span>
                  <span style={{ color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</span>
                  {row.source && <span style={{ color: DIM, fontSize: 8 }}>{row.source}</span>}
                  {row.backed && (
                    <span style={{ color: AMB, fontSize: 8 }}>{row.scenarios.length} scn</span>
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
                    {row.scenarios.length > 0 ? (
                      row.scenarios.slice(0, 5).map((sc) => (
                        <div
                          key={sc.id}
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
                            background: `${kindColor(sc.kind)}22`,
                            border: `1px solid ${kindColor(sc.kind)}55`,
                            color: kindColor(sc.kind),
                            borderRadius: 3,
                            padding: "1px 4px",
                          }}>
                            {sc.kind}
                          </span>
                          <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{sc.name}</span>
                          <span style={{ color: DIM, fontSize: 9 }}>hits:{sc.hits}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No scenario correlation — contact is unscripted.</div>
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
