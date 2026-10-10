/**
 * InvestmentRulesNexus — F625
 * "JARVIS, invruls / investment rules / rules investment / portfolio rules /
 *  which investments have watchtower rules / holdings under rules / rule-covered investments"
 * Cross-references /entities/Investment against /v1/rules.
 * RULE-COVERED investments (≥1 rule keyword-matches) vs UNMONITORED (no rule backing).
 * Coverage % tile; ALL/RULE-COVERED/UNMONITORED filter tabs + search; click-to-expand matched rules.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const YLW = "#FFE566";
const DIM = "#8899AA";
const GLD = "#FFD700";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 97_640;
const Z_INDEX  = 172;

const INVRULS_RE =
  /\binvruls\b|\binvestment.?rules?\b|\brules?.?invest\b|\bportfolio.?rules?\b|\bholdings?.under.?rules?\b|\brule.?covered.?invest\b|\bwhich.?investments?.?have.?rules?\b|\bwatchtower.?invest\b|\bportfolio.?watchtower\b/i;

export function isInvrulesQuery(text) {
  return INVRULS_RE.test(text || "");
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

function normaliseInvestments(data) {
  if (!data) return [];
  const raw =
    data.investments || data.holdings || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((inv, i) => ({
    id:     inv.id || `inv-${i}`,
    name:   inv.name || inv.title || inv.ticker || inv.symbol || `Holding ${i + 1}`,
    type:   (inv.type || inv.asset_class || inv.category || "equity").toUpperCase(),
    value:  inv.value || inv.amount || inv.market_value || 0,
    ticker: inv.ticker || inv.symbol || "",
    tags:   inv.tags || [],
  }));
}

function normaliseRules(data) {
  if (!data) return [];
  const raw =
    data.rules || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:       r.id || `rule-${i}`,
    name:     r.name || `Rule ${i + 1}`,
    severity: typeof r.severity === "number" ? r.severity : 50,
    target:   r.target || "",
    enabled:  r.enabled !== false,
  })).sort((a, b) => b.severity - a.severity);
}

function crossRef(investments, rules) {
  return investments.map((inv) => {
    const haystack = `${inv.name} ${inv.ticker} ${inv.type} ${(inv.tags || []).join(" ")}`;
    const matches = rules
      .map((rule) => {
        const needle = `${rule.name} ${rule.target}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...rule, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 4);
    return { ...inv, rules: matches, covered: matches.length > 0 };
  });
}

function sevColor(sev) {
  if (sev >= 80) return RED;
  if (sev >= 60) return YLW;
  if (sev >= 40) return CY;
  return GRN;
}

function sevLabel(sev) {
  if (sev >= 80) return "CRITICAL";
  if (sev >= 60) return "HIGH";
  if (sev >= 40) return "MEDIUM";
  return "LOW";
}

const TYPE_COLOR = {
  EQUITY:    GLD,
  BOND:      CY,
  CRYPTO:    AMB,
  CASH:      GRN,
  ETF:       "#B06EFF",
  REIT:      "#FB923C",
  COMMODITY: RED,
};

export async function buildInvrulesScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [invRes, rulesRes] = await Promise.all([
      fetch(`${base}/entities/Investment`, { headers: hdr }),
      fetch(`${base}/v1/rules`,            { headers: hdr }),
    ]);
    const [invData, rulesData] = await Promise.all([invRes.json(), rulesRes.json()]);
    const investments = normaliseInvestments(invData);
    const rules       = normaliseRules(rulesData);
    const rows        = crossRef(investments, rules);
    const covered     = rows.filter((r) => r.covered).length;
    const unmonitored = rows.length - covered;
    const pct         = rows.length ? Math.round((covered / rows.length) * 100) : 0;
    if (!rows.length) return "No investment holdings found in the system, sir.";
    const topUnmonitored = rows
      .filter((r) => !r.covered)
      .slice(0, 2)
      .map((r) => r.name.slice(0, 40))
      .join("; ");
    return (
      `${covered} of ${rows.length} holdings are covered by WATCHTOWER rules (${pct}% monitoring coverage). ` +
      (unmonitored > 0
        ? `${unmonitored} holding${unmonitored !== 1 ? "s are" : " is"} UNMONITORED with no matching decision rule — potential blind spots: ${topUnmonitored || "unknown"}.`
        : "All investment holdings have associated WATCHTOWER rule coverage.")
    );
  } catch {
    return "Unable to reach investment or rules endpoints, sir.";
  }
}

export default function InvestmentRulesNexus() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [invRes, rulesRes] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers: hdr }),
        fetch(`${base}/v1/rules`,            { headers: hdr }),
      ]);
      const [invData, rulesData] = await Promise.all([invRes.json(), rulesRes.json()]);
      setRows(crossRef(normaliseInvestments(invData), normaliseRules(rulesData)));
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:invruls-toggle", toggle);
    return () => window.removeEventListener("jarvis:invruls-toggle", toggle);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base        = apiBase();
      const covered     = rows.filter((r) => r.covered);
      const unmonitored = rows.filter((r) => !r.covered);
      const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Assess portfolio WATCHTOWER rule coverage: ${rows.length} holdings total, ` +
            `${covered.length} are covered by decision rules, ` +
            `${unmonitored.length} are unmonitored with no matching rule. ` +
            `Top unmonitored holdings: ${unmonitored.slice(0, 3).map((r) => r.name.slice(0, 40)).join("; ") || "none"}. ` +
            "Give a 2-sentence portfolio monitoring risk assessment and recommended remediation.",
        }),
      });
      const d    = await resp.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [rows]);

  const covered     = rows.filter((r) => r.covered).length;
  const unmonitored = rows.length - covered;
  const pct         = rows.length ? Math.round((covered / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => {
      if (tab === "RULE-COVERED")  return r.covered;
      if (tab === "UNMONITORED")   return !r.covered;
      return true;
    })
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.ticker.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q)
      );
    });

  const BTN_STYLE = {
    position:       "fixed",
    left:           BTN_LEFT,
    bottom:         8,
    zIndex:         Z_INDEX,
    padding:        "4px 10px",
    background:     "rgba(5,8,13,0.82)",
    border:         `1px solid ${unmonitored > 0 ? AMB : GLD}55`,
    borderRadius:   6,
    cursor:         "pointer",
    color:          GLD,
    fontFamily:     "'JetBrains Mono',monospace",
    fontSize:       10,
    letterSpacing:  1,
    display:        "flex",
    alignItems:     "center",
    gap:            5,
    backdropFilter: "blur(6px)",
  };

  const PANEL = {
    position:       "fixed",
    left:           BTN_LEFT - 350,
    bottom:         38,
    zIndex:         Z_INDEX,
    width:          420,
    maxHeight:      "70vh",
    overflowY:      "auto",
    background:     "rgba(6,10,16,0.94)",
    border:         `1px solid ${GLD}44`,
    borderRadius:   10,
    padding:        14,
    fontFamily:     "'JetBrains Mono',monospace",
    color:          "#DCEBF5",
    backdropFilter: "blur(10px)",
    boxShadow:      `0 0 40px ${GLD}18`,
  };

  const tabStyle = (t) => ({
    padding:      "3px 8px",
    border:       `1px solid ${tab === t ? GLD : GLD + "33"}`,
    borderRadius: 4,
    cursor:       "pointer",
    background:   tab === t ? GLD + "22" : "transparent",
    color:        tab === t ? GLD : DIM,
    fontSize:     10,
    letterSpacing: 1,
  });

  return (
    <>
      <button
        style={BTN_STYLE}
        onClick={() => setOpen((o) => !o)}
        title="Investment × Rules Nexus (INVRULS)"
      >
        ◈ INVRULS
        {unmonitored > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>
            {unmonitored}
          </span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: GLD, fontSize: 11, letterSpacing: 2 }}>INVESTMENT × RULES NEXUS</span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "HOLDINGS",     value: rows.length,  color: GLD },
              { label: "RULE-COVERED", value: covered,      color: covered > 0 ? GRN : DIM },
              { label: "UNMONITORED",  value: unmonitored,  color: unmonitored > 0 ? AMB : GRN },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${color}33`, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}
              >
                <div style={{ color, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : value}</div>
                <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>WATCHTOWER MONITORING COVERAGE</span>
              <span style={{ color: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, fontSize: 10, fontWeight: "bold" }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 5, marginBottom: 8, flexWrap: "wrap" }}>
            {["ALL", "RULE-COVERED", "UNMONITORED"].map((t) => (
              <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search holdings…"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: `1px solid ${GLD}33`, borderRadius: 5, color: "#DCEBF5", padding: "5px 8px", fontSize: 11, marginBottom: 8, outline: "none" }}
          />

          {/* list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 12 }}>No holdings match.</div>
            )}
            {visible.map((inv) => (
              <div
                key={inv.id}
                style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${inv.covered ? GLD : AMB}33`, borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: inv.covered ? GLD : AMB, fontSize: 10 }}>{inv.covered ? "●" : "○"}</span>
                  <span style={{ color: TYPE_COLOR[inv.type] || GLD, fontSize: 9, border: `1px solid ${(TYPE_COLOR[inv.type] || GLD)}44`, borderRadius: 3, padding: "1px 4px" }}>{inv.type}</span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{inv.name.slice(0, 50)}{inv.name.length > 50 ? "…" : ""}</span>
                  {inv.ticker && <span style={{ color: DIM, fontSize: 9 }}>{inv.ticker}</span>}
                  <span style={{ color: inv.covered ? GRN : DIM, fontSize: 9 }}>
                    {inv.covered ? `${inv.rules.length} rule${inv.rules.length !== 1 ? "s" : ""}` : "UNMONITORED"}
                  </span>
                </div>

                {expanded === inv.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${GLD}22`, paddingTop: 6 }}>
                    {inv.covered ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {inv.rules.map((rule) => (
                          <div key={rule.id} style={{ background: "rgba(255,215,0,0.04)", border: `1px solid ${sevColor(rule.severity)}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ color: sevColor(rule.severity), fontSize: 9, border: `1px solid ${sevColor(rule.severity)}44`, borderRadius: 3, padding: "1px 4px" }}>{sevLabel(rule.severity)}</span>
                              <span style={{ color: rule.enabled ? GRN : DIM, fontSize: 9 }}>{rule.enabled ? "ON" : "OFF"}</span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{rule.name.slice(0, 44)}{rule.name.length > 44 ? "…" : ""}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {rule.hits}</span>
                            </div>
                            {rule.target && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>target: {rule.target.slice(0, 50)}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No WATCHTOWER rules matched this holding — unmonitored portfolio position.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${GLD}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{ background: `${GLD}18`, border: `1px solid ${GLD}55`, borderRadius: 5, color: GLD, padding: "5px 12px", cursor: "pointer", fontSize: 10, letterSpacing: 1, width: "100%", opacity: assessing ? 0.6 : 1 }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${GLD}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
