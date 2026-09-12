/**
 * RulesInvestigationNexus — F503
 * "JARVIS, rules investigations / investigation rules / rulsinv / which rules have investigations / enforced rules"
 * Cross-references /v1/rules + /v1/investigations.
 * Finds ENFORCED rules (≥1 investigation keyword-matches the rule name/condition)
 * vs UNENFORCED rules (no investigation links found).
 * Coverage % tile; ALL/ENFORCED/UNENFORCED filter tabs + search; click-to-expand matched investigations.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 120_000;

const RULSINV_RE =
  /\brulsinv\b|\brules?.invest\w*\b|\binvest\w*?.rules?\b|\bwhich.?rules?.?(have|with).?invest\w*\b|\benforced.?rules?\b|\bunenforced.?rules?\b|\binvestigation.?rules?\b|\brules?.?investig\w*\b|\bcases?.?rules?\b|\brules?.?cases?\b|\bwatchtower.?investig\w*\b/i;

export function isRulsinvQuery(text) {
  return RULSINV_RE.test(text || "");
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

function normaliseRules(data) {
  if (!data) return [];
  const raw =
    data.rules || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:        r.id || `rule-${i}`,
    name:      r.name || r.title || r.rule_name || `Rule ${i + 1}`,
    target:    r.target || r.entity || r.applies_to || null,
    condition: r.condition || r.expression || r.logic || null,
    severity:  (r.severity || r.level || "MEDIUM").toUpperCase(),
    enabled:   r.enabled !== false,
  }));
}

function normaliseInvestigations(data) {
  if (!data) return [];
  const raw =
    data.investigations || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((inv, i) => ({
    id:      inv.id || `inv-${i}`,
    title:   inv.title || inv.name || inv.case_name || `Case ${i + 1}`,
    status:  (inv.status || "OPEN").toUpperCase(),
    lead:    inv.lead || inv.assigned_to || null,
    summary: inv.summary || inv.description || null,
  }));
}

function crossRef(rules, investigations) {
  return rules.map((rule) => {
    const haystack = `${rule.name} ${rule.target || ""} ${rule.condition || ""}`;
    const matches = investigations
      .map((inv) => ({ inv, hits: overlap(haystack, `${inv.title} ${inv.summary || ""}`) }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return { ...rule, enforced: matches.length > 0, matches: matches.map(({ inv, hits }) => ({ ...inv, hits })) };
  });
}

export async function buildRulsinvScript() {
  try {
    const base = apiBase();
    const [rRes, iRes] = await Promise.all([
      fetch(`${base}/v1/rules`,          { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/investigations`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const [rData, iData] = await Promise.all([rRes.json(), iRes.json()]);
    const rules   = normaliseRules(rData);
    const invs    = normaliseInvestigations(iData);
    const rows    = crossRef(rules, invs);
    const enforced   = rows.filter((r) => r.enforced).length;
    const unenforced = rows.length - enforced;
    const pct = rows.length ? Math.round((enforced / rows.length) * 100) : 0;
    if (!rows.length) return "No decision rules found in the system, sir.";
    return (
      `${enforced} of ${rules.length} decision rules are backed by active investigations ` +
      `(${pct}% enforcement coverage). ` +
      (unenforced > 0
        ? `${unenforced} rule${unenforced !== 1 ? "s" : ""} have no matching investigation — potential governance gap.`
        : "All rules have at least one linked investigation — good enforcement coverage.")
    );
  } catch {
    return "Unable to reach rules or investigations endpoints, sir.";
  }
}

export default function RulesInvestigationNexus() {
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
      const [rRes, iRes] = await Promise.all([
        fetch(`${base}/v1/rules`,          { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/investigations`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [rData, iData] = await Promise.all([rRes.json(), iRes.json()]);
      setRows(crossRef(normaliseRules(rData), normaliseInvestigations(iData)));
    } catch {
      /* network errors are non-fatal */
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
    window.addEventListener("jarvis:rulsinv-toggle", toggle);
    return () => window.removeEventListener("jarvis:rulsinv-toggle", toggle);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const enforced   = rows.filter((r) => r.enforced);
      const unenforced = rows.filter((r) => !r.enforced);
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Assess decision rules enforcement via investigations: ${rows.length} rules total, ` +
            `${enforced.length} enforced (backed by active investigations), ` +
            `${unenforced.length} unenforced (no linked cases). ` +
            `Unenforced critical rules: ${unenforced.filter((r) => r.severity === "CRITICAL").map((r) => r.name).slice(0, 3).join(", ") || "none"}. ` +
            "Give a 2-sentence enforcement brief and recommended action.",
        }),
      });
      const d = await r.json();
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

  const enforced   = rows.filter((r) => r.enforced).length;
  const unenforced = rows.length - enforced;
  const pct        = rows.length ? Math.round((enforced / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => {
      if (tab === "ENFORCED")   return r.enforced;
      if (tab === "UNENFORCED") return !r.enforced;
      return true;
    })
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        (r.target || "").toLowerCase().includes(q) ||
        (r.severity || "").toLowerCase().includes(q)
      );
    });

  const SEV_COLOR = { CRITICAL: "#FF4444", HIGH: AMB, MEDIUM: CY, LOW: GRN };

  const BTN_LEFT = 27_260;
  const BTN_STYLE = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: 90,
    padding: "4px 10px",
    background: "rgba(5,8,13,0.82)",
    border: `1px solid ${unenforced > 0 ? AMB : GRN}55`,
    borderRadius: 6,
    cursor: "pointer",
    color: CY,
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10,
    letterSpacing: 1,
    display: "flex",
    alignItems: "center",
    gap: 5,
    backdropFilter: "blur(6px)",
  };

  const PANEL = {
    position: "fixed",
    left: BTN_LEFT - 320,
    bottom: 38,
    zIndex: 90,
    width: 390,
    maxHeight: "70vh",
    overflowY: "auto",
    background: "rgba(6,10,16,0.94)",
    border: `1px solid ${CY}44`,
    borderRadius: 10,
    padding: 14,
    fontFamily: "'JetBrains Mono',monospace",
    color: "#DCEBF5",
    backdropFilter: "blur(10px)",
    boxShadow: `0 0 40px ${CY}18`,
  };

  const tabStyle = (t) => ({
    padding: "3px 8px",
    border: `1px solid ${tab === t ? CY : CY + "33"}`,
    borderRadius: 4,
    cursor: "pointer",
    background: tab === t ? CY + "22" : "transparent",
    color: tab === t ? CY : DIM,
    fontSize: 10,
    letterSpacing: 1,
  });

  const STATUS_COLOR = { OPEN: AMB, ACTIVE: CY, CLOSED: GRN, ESCALATED: "#FF4444" };

  return (
    <>
      <button style={BTN_STYLE} onClick={() => setOpen((o) => !o)} title="Decision Rules × Investigation Nexus">
        ◈ RULSINV
        {unenforced > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>
            {unenforced}
          </span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>RULES × INVESTIGATION NEXUS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "RULES",      value: rows.length, color: CY },
              { label: "ENFORCED",   value: enforced,    color: enforced > 0 ? GRN : DIM },
              { label: "UNENFORCED", value: unenforced,  color: unenforced > 0 ? AMB : GRN },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${color}33`, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                <div style={{ color, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : value}</div>
                <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>ENFORCEMENT COVERAGE</span>
              <span style={{ color: pct >= 75 ? GRN : pct >= 40 ? AMB : "#FF4444", fontSize: 10, fontWeight: "bold" }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 75 ? GRN : pct >= 40 ? AMB : "#FF4444", borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            {["ALL", "ENFORCED", "UNENFORCED"].map((t) => (
              <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search rules…"
            style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: `1px solid ${CY}33`, borderRadius: 4, color: "#DCEBF5", padding: "4px 8px", fontSize: 10, marginBottom: 8, boxSizing: "border-box" }}
          />

          {/* rows */}
          {loading && <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 12 }}>loading…</div>}
          {!loading && visible.length === 0 && (
            <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 12 }}>no rules match</div>
          )}
          {!loading && visible.map((row) => (
            <div key={row.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                style={{ padding: "6px 8px", background: "rgba(0,0,0,0.3)", border: `1px solid ${row.enforced ? GRN : AMB}33`, borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#DCEBF5", fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</div>
                  {row.target && (
                    <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>target: {row.target}</div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <span style={{ background: (SEV_COLOR[row.severity] || CY) + "22", color: SEV_COLOR[row.severity] || CY, border: `1px solid ${SEV_COLOR[row.severity] || CY}44`, borderRadius: 3, padding: "1px 5px", fontSize: 9 }}>
                    {row.severity}
                  </span>
                  <span style={{ background: row.enforced ? GRN + "22" : AMB + "22", color: row.enforced ? GRN : AMB, border: `1px solid ${row.enforced ? GRN : AMB}44`, borderRadius: 3, padding: "1px 5px", fontSize: 9 }}>
                    {row.enforced ? "ENFORCED" : "UNENFORCED"}
                  </span>
                </div>
              </div>

              {/* expanded investigation matches */}
              {expanded === row.id && (
                <div style={{ marginTop: 4, paddingLeft: 8 }}>
                  {row.matches.length === 0 ? (
                    <div style={{ color: DIM, fontSize: 9, padding: "4px 0" }}>no matching investigations</div>
                  ) : (
                    row.matches.slice(0, 5).map((inv) => (
                      <div key={inv.id} style={{ marginBottom: 4, padding: "5px 8px", background: "rgba(0,0,0,0.25)", border: `1px solid ${CY}22`, borderRadius: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: "#DCEBF5", fontSize: 10 }}>{inv.title}</span>
                          <div style={{ display: "flex", gap: 4 }}>
                            <span style={{ color: STATUS_COLOR[inv.status] || DIM, fontSize: 9 }}>{inv.status}</span>
                            <span style={{ color: DIM, fontSize: 9 }}>{inv.hits} hit{inv.hits !== 1 ? "s" : ""}</span>
                          </div>
                        </div>
                        {inv.lead && (
                          <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>lead: {inv.lead}</div>
                        )}
                        {inv.summary && (
                          <div style={{ color: DIM, fontSize: 9, marginTop: 2, fontStyle: "italic" }}>{inv.summary.slice(0, 100)}{inv.summary.length > 100 ? "…" : ""}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${CY}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{ background: `${CY}18`, border: `1px solid ${CY}55`, borderRadius: 5, color: CY, padding: "5px 12px", cursor: "pointer", fontSize: 10, letterSpacing: 1, width: "100%", opacity: assessing ? 0.6 : 1 }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${CY}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
