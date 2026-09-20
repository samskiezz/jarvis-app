/**
 * DecisionRulesReportsNexus — F575 (RULRPT)
 * "JARVIS, rules reports / report rules / rulrpt / which rules have reports /
 *  documented rules / undocumented rules / rule documentation / watchtower report coverage"
 * Cross-references /v1/rules + /v1/reports.
 * Finds DOCUMENTED rules (≥1 report keyword-matches rule name/target/tags) vs UNCHARTED.
 * Coverage % tile; ALL/DOCUMENTED/UNCHARTED filter tabs + search; click-to-expand matched reports.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence rule-report coverage brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4466";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 120_000;
const BTN_LEFT = 65_960;
const Z_INDEX  = 135;

const RULRPT_RE =
  /\brulrpt\b|\brules?.?reports?\b|\breport.?rules?\b|\bwhich.?rules?.?have.?reports?\b|\bdocumented.?rules?\b|\bundocumented.?rules?\b|\brule.?documentation\b|\bwatchtower.?report.?coverage\b|\brule.?report.?coverage\b|\brule.?backed.?reports?\b|\breport.?backed.?rules?\b/i;

export function isRulrptQuery(text) {
  return RULRPT_RE.test(text || "");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

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
    name:      r.name || r.title || `Rule ${i + 1}`,
    target:    r.target || r.entity || r.scope || "",
    severity:  (r.severity || r.level || "MEDIUM").toUpperCase(),
    condition: typeof r.condition === "string"
      ? r.condition
      : JSON.stringify(r.condition || r.expression || r.expr || ""),
    enabled:   r.enabled !== false,
    tags:      Array.isArray(r.tags) ? r.tags.join(" ") : String(r.tags || ""),
  }));
}

function normaliseReports(data) {
  if (!data) return [];
  const raw =
    data.reports || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:      r.id || `rpt-${i}`,
    title:   r.title || r.name || `Report ${i + 1}`,
    type:    (r.type || r.category || r.kind || "OTHER").toUpperCase(),
    author:  r.author || r.created_by || r.owner || "",
    summary: r.summary || r.description || r.detail || r.content || "",
    status:  (r.status || "PUBLISHED").toUpperCase(),
    tags:    Array.isArray(r.tags) ? r.tags.join(" ") : String(r.tags || ""),
  }));
}

function crossRef(rules, reports) {
  return rules.map((r) => {
    const haystack = `${r.name} ${r.target} ${r.condition} ${r.tags}`;
    const matches = reports
      .map((rpt) => ({
        rpt,
        hits: overlap(haystack, `${rpt.title} ${rpt.type} ${rpt.summary} ${rpt.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...r,
      documented: matches.length > 0,
      matches:    matches.map(({ rpt, hits }) => ({ ...rpt, hits })),
    };
  });
}

// ─── buildRulrptScript (for JarvisBrain) ─────────────────────────────────────

export async function buildRulrptScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [rRes, ptRes] = await Promise.all([
      fetch(`${base}/v1/rules`,   { headers: hdr }),
      fetch(`${base}/v1/reports`, { headers: hdr }),
    ]);
    const rData  = rRes.ok  ? await rRes.json()  : {};
    const ptData = ptRes.ok ? await ptRes.json() : {};

    const rules   = normaliseRules(rData);
    const reports = normaliseReports(ptData);
    const crossed = crossRef(rules, reports);

    const total      = crossed.length;
    const documented = crossed.filter((r) => r.documented).length;
    const uncharted  = total - documented;
    const coverage   = total > 0 ? Math.round((documented / total) * 100) : 0;
    const topUncharted = crossed
      .filter((r) => !r.documented)
      .slice(0, 2)
      .map((r) => r.name)
      .join(", ");

    const chatRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Decision Rules × Reports Nexus (RULRPT): ${total} Watchtower rules total, ${documented} have at least one formal report covering them (${coverage}%), ${uncharted} are uncharted. Top uncharted rules: ${topUncharted || "none"}. In exactly 2 sentences, assess the rule documentation coverage posture.`,
      }),
    });
    const chatData = chatRes.ok ? await chatRes.json() : {};
    return chatData.response || chatData.message || chatData.answer ||
      `RULRPT: ${documented}/${total} rules have report coverage (${coverage}%). ${uncharted} Watchtower rules lack formal documentation.`;
  } catch {
    return "RULRPT: Unable to fetch rules or reports.";
  }
}

// ─── colour helpers ───────────────────────────────────────────────────────────

function sevColour(sev) {
  if (sev === "CRITICAL") return RED;
  if (sev === "HIGH")     return AMB;
  if (sev === "MEDIUM")   return CY;
  return DIM;
}

function typeColour(type) {
  if (type === "THREAT" || type === "RISK")       return RED;
  if (type === "INTEL"  || type === "ANALYSIS")   return AMB;
  if (type === "OPS"    || type === "OPERATIONS") return CY;
  if (type === "KNOWLEDGE" || type === "RESEARCH") return GRN;
  return DIM;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function DecisionRulesReportsNexus() {
  const [open,       setOpen]       = useState(false);
  const [rules,      setRules]      = useState([]);
  const [reports,    setReports]    = useState([]);
  const [crossed,    setCrossed]    = useState([]);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const [badge,      setBadge]      = useState(0);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [rRes, ptRes] = await Promise.all([
        fetch(`${base}/v1/rules`,   { headers: hdr }),
        fetch(`${base}/v1/reports`, { headers: hdr }),
      ]);
      const rData  = rRes.ok  ? await rRes.json()  : {};
      const ptData = ptRes.ok ? await ptRes.json() : {};
      const r  = normaliseRules(rData);
      const p  = normaliseReports(ptData);
      const cx = crossRef(r, p);
      setRules(r);
      setReports(p);
      setCrossed(cx);
      setBadge(cx.filter((x) => !x.documented).length);
    } catch {
      /* silently ignore network errors */
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:rulrpt-toggle", handler);
    return () => window.removeEventListener("jarvis:rulrpt-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment("");
    try {
      const brief = await buildRulrptScript();
      setAssessment(brief);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } }));
    } finally {
      setAssessing(false);
    }
  }, []);

  const total      = crossed.length;
  const documented = crossed.filter((r) => r.documented).length;
  const uncharted  = total - documented;
  const coverage   = total > 0 ? Math.round((documented / total) * 100) : 0;

  const visible = crossed.filter((r) => {
    if (tab === "DOCUMENTED" && !r.documented) return false;
    if (tab === "UNCHARTED"  &&  r.documented) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.target.toLowerCase().includes(q);
    }
    return true;
  });

  // ── floating button ──
  const btn = (
    <button
      onClick={() => setOpen((v) => !v)}
      style={{
        position: "fixed",
        left:     BTN_LEFT,
        bottom:   8,
        zIndex:   Z_INDEX,
        background: badge > 0 ? "rgba(255,165,0,0.18)" : "rgba(41,231,255,0.10)",
        border:   `1px solid ${badge > 0 ? AMB : CY}`,
        color:    badge > 0 ? AMB : CY,
        borderRadius: 6,
        padding:  "3px 9px",
        fontSize: 11,
        cursor:   "pointer",
        fontFamily: "monospace",
      }}
    >
      ◈ RULRPT{badge > 0 && <span style={{ marginLeft: 5, background: AMB, color: "#000", borderRadius: 9, padding: "0 5px", fontSize: 10 }}>{badge}</span>}
    </button>
  );

  if (!open) return btn;

  return (
    <>
      {btn}
      <div style={{
        position: "fixed", top: 60, right: 20, width: 560, maxHeight: "80vh",
        background: "rgba(5,15,30,0.97)", border: `1px solid ${CY}`,
        borderRadius: 10, zIndex: Z_INDEX + 1, display: "flex", flexDirection: "column",
        fontFamily: "monospace", color: CY, overflow: "hidden",
        boxShadow: `0 0 24px ${CY}44`,
      }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${CY}33` }}>
          <span style={{ fontWeight: 700, letterSpacing: 2 }}>◈ RULRPT — RULES × REPORTS</span>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${CY}22` }}>
          {[
            ["RULES",       total,       CY],
            ["DOCUMENTED",  documented,  GRN],
            ["UNCHARTED",   uncharted,   AMB],
            ["COVERAGE",    `${coverage}%`, coverage >= 70 ? GRN : coverage >= 40 ? AMB : RED],
            ["REPORTS",     reports.length, DIM],
          ].map(([label, val, col]) => (
            <div key={label} style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
              <div style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* assess */}
        <div style={{ padding: "6px 14px", borderBottom: `1px solid ${CY}22`, display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={assess} disabled={assessing} style={{ background: "rgba(41,231,255,0.12)", border: `1px solid ${CY}`, color: CY, borderRadius: 5, padding: "3px 12px", cursor: "pointer", fontSize: 11 }}>
            {assessing ? "▶ …" : "▶ ASSESS"}
          </button>
          {assessment && <span style={{ fontSize: 11, color: GRN, flex: 1, lineHeight: 1.4 }}>{assessment}</span>}
        </div>

        {/* filter tabs */}
        <div style={{ display: "flex", gap: 6, padding: "6px 14px", borderBottom: `1px solid ${CY}22` }}>
          {["ALL", "DOCUMENTED", "UNCHARTED"].map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ background: tab === t ? CY : "rgba(41,231,255,0.08)", border: `1px solid ${CY}44`, color: tab === t ? "#000" : CY, borderRadius: 4, padding: "2px 10px", cursor: "pointer", fontSize: 10 }}>{t}</button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search rules…"
            style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: `1px solid ${CY}44`, color: CY, borderRadius: 4, padding: "2px 8px", fontSize: 10, outline: "none" }}
          />
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
          {visible.length === 0 && <div style={{ color: DIM, fontSize: 12, padding: 12 }}>No rules match.</div>}
          {visible.map((r) => (
            <div key={r.id} style={{ marginBottom: 8 }}>
              <div
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                  padding: "5px 8px", borderRadius: 5,
                  background: r.documented ? "rgba(0,229,160,0.06)" : "rgba(255,165,0,0.06)",
                  border: `1px solid ${r.documented ? GRN + "44" : AMB + "44"}`,
                }}
              >
                <span style={{ width: 14, height: 14, borderRadius: "50%", background: r.documented ? GRN : AMB, display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: sevColour(r.severity), letterSpacing: 1, flexShrink: 0 }}>{r.severity}</span>
                <span style={{ flex: 1, fontSize: 12, color: r.documented ? GRN : AMB }}>{r.name}</span>
                {r.target && <span style={{ fontSize: 10, color: DIM }}>{r.target}</span>}
                <span style={{ fontSize: 10, color: r.documented ? GRN : AMB, marginLeft: "auto" }}>{r.documented ? `${r.matches.length} report${r.matches.length !== 1 ? "s" : ""}` : "UNCHARTED"}</span>
                <span style={{ fontSize: 10, color: DIM }}>{expanded === r.id ? "▲" : "▼"}</span>
              </div>

              {expanded === r.id && r.matches.length > 0 && (
                <div style={{ marginTop: 4, marginLeft: 22, display: "flex", flexDirection: "column", gap: 4 }}>
                  {r.matches.map((rpt) => (
                    <div key={rpt.id} style={{ background: "rgba(41,231,255,0.05)", border: `1px solid ${CY}22`, borderRadius: 4, padding: "4px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: typeColour(rpt.type), letterSpacing: 1 }}>{rpt.type}</span>
                        <span style={{ fontSize: 11, color: CY, flex: 1 }}>{rpt.title}</span>
                        {rpt.author && <span style={{ fontSize: 10, color: DIM }}>{rpt.author}</span>}
                        <span style={{ fontSize: 10, color: DIM }}>{rpt.hits} hit{rpt.hits !== 1 ? "s" : ""}</span>
                      </div>
                      {rpt.summary && (
                        <div style={{ fontSize: 10, color: DIM, marginTop: 2 }}>
                          {rpt.summary.slice(0, 120)}{rpt.summary.length > 120 ? "…" : ""}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {expanded === r.id && r.matches.length === 0 && (
                <div style={{ marginTop: 4, marginLeft: 22, fontSize: 10, color: DIM }}>No report matches found.</div>
              )}
            </div>
          ))}
        </div>

        <div style={{ padding: "5px 14px", borderTop: `1px solid ${CY}22`, fontSize: 9, color: DIM }}>
          Auto-refresh every {POLL_MS / 1000}s · /v1/rules + /v1/reports
        </div>
      </div>
    </>
  );
}
