/**
 * OpsAlertsInvestmentNexus — F655
 * "JARVIS, oalinv / ops alert investment / alert investment /
 *  which alerts involve investments / investment-backed alerts /
 *  investment alert coverage / exposed investments / alert investment match"
 * Cross-references /v1/ops/alerts against /entities/Investment by keyword.
 * EXPOSED alerts (≥1 investment keyword-matches) vs CLEAR (no investment signal).
 * Coverage % tile; ALL/EXPOSED/CLEAR filter tabs + search; click-to-expand matched investments.
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
const BTN_LEFT = 115_700;
const Z_INDEX  = 193;

const OALFIN_RE =
  /\boalfin\b|\bops.?alert.?invest\b|\balert.?invest\b|\bwhich.?alerts?.involve.?invest\b|\binvest.?backed.?alerts?\b|\binvest.?alert.?coverage\b|\bexposed.?invest\b|\balert.?invest.?match\b|\bfinancial.?alerts?\b|\balert.?financial\b|\bops.?financial.?alert\b/i;

export function isOalfinQuery(text) {
  return OALFIN_RE.test(text || "");
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
    id:       a.id       || a.alert_id || String(i),
    title:    a.title    || a.name     || a.summary    || `Alert ${i + 1}`,
    severity: (a.severity || a.level   || "INFO").toString().toUpperCase(),
    source:   a.source   || a.service  || a.origin || "",
    message:  a.message  || a.description || a.body || "",
  }));
}

function normaliseInvestments(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.investments)
    ? data.investments
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((inv, i) => ({
    id:     inv.id     || `inv-${i}`,
    name:   inv.name   || inv.title || inv.label || `Investment ${i + 1}`,
    kind:   inv.kind   || inv.type  || inv.category || inv.asset_class || "investment",
    status: inv.status || inv.state || inv.stage || "active",
    value:  inv.value  || inv.amount || inv.size || "",
    tags:   Array.isArray(inv.tags) ? inv.tags.join(" ") : (inv.tags || ""),
  }));
}

function crossRef(alerts, investments) {
  return alerts.map((alert) => {
    const haystack = `${alert.title} ${alert.source} ${alert.message}`;
    const matches = investments
      .map((inv) => {
        const needle = `${inv.name} ${inv.kind} ${inv.status} ${inv.tags}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...inv, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...alert, exposed: matches.length > 0, investments: matches };
  });
}

export async function buildOalfinScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [alertRes, invRes] = await Promise.all([
      fetch(`${base}/v1/ops/alerts`,       { headers: hdr }),
      fetch(`${base}/entities/Investment`, { headers: hdr }),
    ]);
    const [alertData, invData] = await Promise.all([alertRes.json(), invRes.json()]);
    const alerts      = normaliseAlerts(alertData);
    const investments = normaliseInvestments(invData);
    const rows        = crossRef(alerts, investments);
    const exposed     = rows.filter((r) => r.exposed).length;
    const clear       = rows.length - exposed;
    const pct         = rows.length ? Math.round((exposed / rows.length) * 100) : 0;
    if (!rows.length) return "No ops alerts found in the system, sir.";
    const topExposed = rows
      .filter((r) => r.exposed)
      .slice(0, 2)
      .map((r) => r.title)
      .join("; ");
    return (
      `${exposed} of ${rows.length} ops alerts have associated investment exposure (${pct}% financial coverage). ` +
      (exposed > 0
        ? `Investment-linked alerts include: ${topExposed || "unidentified signals"}. ${clear} alert${clear !== 1 ? "s" : ""} show no investment connection.`
        : "No ops alerts are linked to known investments — no financial exposure detected.")
    );
  } catch {
    return "Unable to reach ops alerts or investments endpoints, sir.";
  }
}

const SEV_COLOR = {
  CRITICAL: RED,
  HIGH:     "#FF6B35",
  MEDIUM:   AMB,
  WARNING:  AMB,
  INFO:     CY,
  LOW:      GRN,
};

const KIND_COLOR = {
  equity:     CY,
  bond:       GRN,
  crypto:     AMB,
  fund:       "#9B59B6",
  real_estate: "#E67E22",
  commodity:  "#F39C12",
  investment: DIM,
};

export default function OpsAlertsInvestmentNexus() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [alertRes, invRes] = await Promise.all([
        fetch(`${base}/v1/ops/alerts`,       { headers: hdr }),
        fetch(`${base}/entities/Investment`, { headers: hdr }),
      ]);
      const [alertData, invData] = await Promise.all([alertRes.json(), invRes.json()]);
      const alerts      = normaliseAlerts(alertData);
      const investments = normaliseInvestments(invData);
      setRows(crossRef(alerts, investments));
    } catch {
      /* silently ignore fetch errors */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen((p) => !p); if (!rows.length) load(); };
    window.addEventListener("jarvis:oalfin-toggle", handler);
    return () => window.removeEventListener("jarvis:oalfin-toggle", handler);
  }, [load, rows.length]);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const exposed = rows.filter((r) => r.exposed).length;
  const clear   = rows.length - exposed;
  const pct     = rows.length ? Math.round((exposed / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => {
      if (filter === "EXPOSED") return r.exposed;
      if (filter === "CLEAR")   return !r.exposed;
      return true;
    })
    .filter((r) =>
      !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.severity.toLowerCase().includes(search.toLowerCase()) ||
      r.source.toLowerCase().includes(search.toLowerCase())
    );

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const summary = await buildOalfinScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `JARVIS ops-alert investment exposure brief: ${summary}` }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || summary;
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setBrief("Assessment unavailable — check backend connectivity, sir.");
    } finally {
      setAssessing(false);
    }
  };

  return (
    <>
      {/* HUD button */}
      <button
        onClick={() => { setOpen((p) => !p); if (!rows.length) load(); }}
        style={{
          position: "fixed",
          left:     BTN_LEFT,
          bottom:   8,
          zIndex:   Z_INDEX,
          background: exposed > 0 ? `${AMB}22` : "rgba(0,0,0,0.55)",
          border:   `1px solid ${exposed > 0 ? AMB : CY}55`,
          borderRadius: 5,
          color:    exposed > 0 ? AMB : CY,
          padding:  "3px 8px",
          fontSize: 9,
          letterSpacing: 1,
          cursor:   "pointer",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ OALFIN
        {exposed > 0 && (
          <span style={{ marginLeft: 5, background: AMB, color: "#000", borderRadius: 9, padding: "0 5px", fontSize: 8, fontWeight: 700 }}>
            {exposed}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: Math.min(BTN_LEFT, window.innerWidth - 360),
            bottom: 36,
            zIndex: Z_INDEX + 1,
            width: 340,
            maxHeight: 480,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            background: "rgba(6,12,22,0.97)",
            border: `1px solid ${CY}33`,
            borderRadius: 8,
            padding: 14,
            fontFamily: "monospace",
            backdropFilter: "blur(12px)",
          }}
        >
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>OPS ALERTS × INVESTMENTS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 12 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[
              { label: "ALERTS",   value: rows.length, col: CY },
              { label: "EXPOSED",  value: exposed,     col: RED },
              { label: "CLEAR",    value: clear,       col: GRN },
              { label: "EXPOSURE", value: `${pct}%`,   col: pct >= 50 ? RED : pct >= 25 ? AMB : GRN },
            ].map((t) => (
              <div key={t.label} style={{ flex: 1, background: `${t.col}11`, border: `1px solid ${t.col}33`, borderRadius: 5, padding: "5px 4px", textAlign: "center" }}>
                <div style={{ color: t.col, fontSize: 12, fontWeight: 700 }}>{t.value}</div>
                <div style={{ color: DIM, fontSize: 7, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search alerts…"
            style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${CY}33`, borderRadius: 4, color: "#DCEBF5", padding: "4px 8px", fontSize: 10, marginBottom: 6, outline: "none" }}
          />

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["ALL", "EXPOSED", "CLEAR"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  flex: 1,
                  background: filter === f ? `${CY}22` : "transparent",
                  border: `1px solid ${filter === f ? CY : CY + "33"}`,
                  borderRadius: 4,
                  color: filter === f ? CY : DIM,
                  padding: "3px 0",
                  fontSize: 8,
                  cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* list */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {loading && <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 16 }}>Loading…</div>}
            {!loading && visible.length === 0 && (
              <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 16 }}>No alerts match filter.</div>
            )}
            {visible.map((alert) => (
              <div
                key={alert.id}
                onClick={() => setExpanded(expanded === alert.id ? null : alert.id)}
                style={{
                  background: alert.exposed ? `${RED}06` : `${GRN}06`,
                  border: `1px solid ${alert.exposed ? RED + "22" : GRN + "22"}`,
                  borderRadius: 5,
                  padding: "6px 8px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    fontSize: 8,
                    border: `1px solid ${(SEV_COLOR[alert.severity] || CY)}44`,
                    borderRadius: 3,
                    padding: "1px 4px",
                    color: SEV_COLOR[alert.severity] || CY,
                    letterSpacing: 1,
                  }}>
                    {alert.severity}
                  </span>
                  <span style={{
                    fontSize: 8,
                    border: `1px solid ${alert.exposed ? RED + "44" : GRN + "44"}`,
                    borderRadius: 3,
                    padding: "1px 4px",
                    color: alert.exposed ? RED : GRN,
                    letterSpacing: 1,
                  }}>
                    {alert.exposed ? "EXPOSED" : "CLEAR"}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alert.title}</span>
                  {alert.exposed && (
                    <span style={{ color: DIM, fontSize: 9 }}>{alert.investments.length} inv{alert.investments.length !== 1 ? "s" : ""}</span>
                  )}
                </div>
                {alert.source && (
                  <div style={{ color: DIM, fontSize: 9, marginLeft: 16 }}>{alert.source.slice(0, 30)}</div>
                )}

                {expanded === alert.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${RED}22`, paddingTop: 6 }}>
                    {alert.exposed ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {alert.investments.slice(0, 4).map((inv) => (
                          <div key={inv.id} style={{ background: `${RED}08`, border: `1px solid ${RED}22`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{inv.name}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {inv.hits}</span>
                            </div>
                            <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                              {inv.kind && (
                                <span style={{ color: KIND_COLOR[inv.kind.toLowerCase()] || CY, fontSize: 8, border: `1px solid ${KIND_COLOR[inv.kind.toLowerCase()] || CY}33`, borderRadius: 3, padding: "1px 4px" }}>{inv.kind}</span>
                              )}
                              {inv.status && (
                                <span style={{ color: DIM, fontSize: 9 }}>{inv.status}</span>
                              )}
                              {inv.value && (
                                <span style={{ color: AMB, fontSize: 9 }}>{String(inv.value).slice(0, 12)}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No investments matched this alert — no financial exposure signal detected for this operational event.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
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
