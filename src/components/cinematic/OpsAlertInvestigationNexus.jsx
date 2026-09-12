/**
 * OpsAlertInvestigationNexus — F694
 * "JARVIS, opsalinv / ops alert investigation / alert case / cased alerts /
 *  uncased alerts / alert coverage investigation / ops alerts cases"
 * Cross-references /v1/ops/alerts against /v1/investigations.
 * CASED alerts (≥1 investigation keyword-match) vs UNCASED (no case link).
 * Coverage % tile; ALL/CASED/UNCASED filter tabs + search; click-to-expand matched investigations.
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

const POLL_MS  = 120_000;
const BTN_LEFT = 147_520;
const Z_INDEX  = 230;

const OPSALINV_RE =
  /\bopsalinv\b|\bops.?alert.?invest\b|\balert.?case\b|\bcased.?alerts?\b|\buncased.?alerts?\b|\balert.?coverage.?invest\b|\bops.?alerts?.?cases?\b/i;

export function isOpsalinvQuery(text) {
  return OPSALINV_RE.test(text || "");
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

function normaliseAlerts(data) {
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
    title:    a.title    || a.name    || a.message || a.alert || `Alert ${i + 1}`,
    severity: (a.severity || a.level  || a.priority || "INFO").toString().toUpperCase(),
    source:   a.source   || a.service || a.origin   || "",
    body:     a.body     || a.description || a.summary || a.message || "",
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
    title:   inv.title   || inv.name    || `Case ${i + 1}`,
    status:  (inv.status || "OPEN").toString().toUpperCase(),
    lead:    inv.lead    || inv.assignee || inv.owner   || "",
    summary: inv.summary || inv.description || inv.notes || "",
  }));
}

function crossRef(alerts, investigations) {
  return alerts.map((alert) => {
    const haystack = `${alert.title} ${alert.body} ${alert.source}`;
    const matches = investigations
      .map((inv) => {
        const needle = `${inv.title} ${inv.summary}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...inv, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...alert, cased: matches.length > 0, investigations: matches };
  });
}

export async function buildOpsalinvScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [alRes, invRes] = await Promise.all([
      fetch(`${base}/v1/ops/alerts`,    { headers: hdr }),
      fetch(`${base}/v1/investigations`, { headers: hdr }),
    ]);
    const [alData, invData] = await Promise.all([alRes.json(), invRes.json()]);
    const alerts        = normaliseAlerts(alData);
    const investigations = normaliseInvestigations(invData);
    const rows          = crossRef(alerts, investigations);
    const cased         = rows.filter((r) => r.cased).length;
    const uncased       = rows.length - cased;
    const pct = rows.length ? Math.round((cased / rows.length) * 100) : 0;
    if (!rows.length) return "No ops alerts found in the system, sir.";
    const topUncased = rows
      .filter((r) => !r.cased)
      .slice(0, 2)
      .map((r) => r.title)
      .join("; ");
    const brief = `Ops Alert × Investigation cross-reference: ${cased} of ${rows.length} alerts have open case coverage (${pct}%) — ${uncased} alerts uncased${topUncased ? `: ${topUncased}` : ""}.`;
    const aiRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Ops alerts cross-referenced against ${investigations.length} investigations: ${cased} cased / ${uncased} uncased (${pct}% coverage). Top uncased: ${topUncased || "none"}. Provide a 2-sentence operational alert-investigation coverage assessment.`,
      }),
    });
    const aiData = await aiRes.json();
    return aiData?.response || aiData?.message || brief;
  } catch (e) {
    return `Ops alert investigation cross-reference error: ${e.message}`;
  }
}

function severityColor(sev) {
  if (!sev) return DIM;
  const s = sev.toUpperCase();
  if (s === "CRITICAL") return RED;
  if (s === "HIGH")     return AMB;
  if (s === "MEDIUM")   return "#FFD700";
  return GRN;
}

function statusColor(status) {
  if (!status) return DIM;
  const s = status.toUpperCase();
  if (s === "ESCALATED") return RED;
  if (s === "ACTIVE")    return AMB;
  if (s === "OPEN")      return CY;
  return DIM;
}

export default function OpsAlertInvestigationNexus() {
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
      const [alRes, invRes] = await Promise.all([
        fetch(`${base}/v1/ops/alerts`,    { headers: hdr }),
        fetch(`${base}/v1/investigations`, { headers: hdr }),
      ]);
      const [alData, invData] = await Promise.all([alRes.json(), invRes.json()]);
      const alerts        = normaliseAlerts(alData);
      const investigations = normaliseInvestigations(invData);
      setRows(crossRef(alerts, investigations));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:opsalinv-toggle", handler);
    return () => window.removeEventListener("jarvis:opsalinv-toggle", handler);
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
      const txt = await buildOpsalinvScript();
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

  const cased   = rows.filter((r) => r.cased).length;
  const uncased = rows.length - cased;
  const pct     = rows.length ? Math.round((cased / rows.length) * 100) : 0;

  const visible = rows.filter((r) => {
    if (tab === "CASED"   && !r.cased) return false;
    if (tab === "UNCASED" &&  r.cased) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q) ||
        r.investigations.some((inv) => inv.title.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const btnStyle = {
    position: "fixed",
    bottom: 8,
    left: BTN_LEFT,
    zIndex: Z_INDEX,
    background: uncased > 0 ? `${RED}22` : "#0A1628CC",
    border: `1px solid ${uncased > 0 ? RED : CY}66`,
    borderRadius: 6,
    color: uncased > 0 ? RED : CY,
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
    border: `1px solid ${RED}44`,
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
        ◈ OPSALINV
        {uncased > 0 && (
          <span style={{ marginLeft: 4, background: RED, color: "#FFF", borderRadius: 3, padding: "0 4px" }}>
            {uncased}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 1 }}>◈ OPS ALERT × INVESTIGATION NEXUS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 13 }}>✕</button>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[
              { label: "ALERTS",   val: rows.length, color: CY  },
              { label: "CASED",    val: cased,        color: GRN },
              { label: "UNCASED",  val: uncased,      color: RED },
              { label: "COVERAGE", val: `${pct}%`,    color: CY  },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ flex: 1, background: `${color}11`, border: `1px solid ${color}33`, borderRadius: 5, padding: "4px 6px", textAlign: "center" }}>
                <div style={{ color, fontSize: 13, fontWeight: 700 }}>{val}</div>
                <div style={{ color: DIM, fontSize: 8 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
            {["ALL", "CASED", "UNCASED"].map((t) => (
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
            placeholder="search alerts or investigations…"
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
                  background: row.cased ? `${GRN}0A` : `${RED}0A`,
                  border: `1px solid ${row.cased ? GRN : RED}33`,
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
                    background: `${severityColor(row.severity)}22`,
                    border: `1px solid ${severityColor(row.severity)}55`,
                    color: severityColor(row.severity),
                    borderRadius: 3,
                    padding: "1px 4px",
                    minWidth: 52,
                    textAlign: "center",
                  }}>
                    {row.severity}
                  </span>
                  <span style={{ color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</span>
                  {row.source && <span style={{ color: DIM, fontSize: 8 }}>{row.source}</span>}
                  <span style={{
                    fontSize: 8,
                    background: `${row.cased ? GRN : RED}22`,
                    border: `1px solid ${row.cased ? GRN : RED}55`,
                    color: row.cased ? GRN : RED,
                    borderRadius: 3,
                    padding: "1px 4px",
                  }}>
                    {row.cased ? "CASED" : "UNCASED"}
                  </span>
                </div>
                {expanded === row.id && (
                  <div style={{ padding: "0 8px 8px 8px" }}>
                    {row.body && (
                      <div style={{ color: DIM, fontSize: 9, marginBottom: 6, lineHeight: 1.4 }}>
                        {row.body.slice(0, 200)}
                      </div>
                    )}
                    {row.investigations.length > 0 ? (
                      row.investigations.slice(0, 4).map((inv) => (
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
                            minWidth: 52,
                            textAlign: "center",
                          }}>
                            {inv.status}
                          </span>
                          <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{inv.title}</span>
                          {inv.lead && <span style={{ color: DIM, fontSize: 9 }}>{inv.lead}</span>}
                          <span style={{ color: DIM, fontSize: 9 }}>hits:{inv.hits}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No investigation match — alert is uncased.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!loading && visible.length === 0 && (
              <div style={{ color: DIM, textAlign: "center", padding: 16 }}>No alerts match current filter.</div>
            )}
          </div>

          <div style={{ marginTop: 10, borderTop: `1px solid ${RED}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: `${RED}18`,
                border: `1px solid ${RED}55`,
                borderRadius: 5,
                color: RED,
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
              <div style={{ marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${RED}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
