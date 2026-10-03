import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM  = "#FFB300"; const CY = "#00E5FF"; const GN = "#4CAF50";
const OR  = "#FF9800"; const RD = "#FF3D3D";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const REFRESH_MS = 90_000;
const BTN_LEFT   = 1095600;
const Z_IDX      = 672;

const KOATRAC_RE =
  /\b(koatrac|knowledge[._\-\s]automation|ops[._\-\s]alert[._\-\s]skill|threat[._\-\s]automation|automated[._\-\s]response|alert[._\-\s]skill[._\-\s]coverage|knowledge[._\-\s]alert[._\-\s]skill)\b/i;

export function isKoatracQuery(t) { return KOATRAC_RE.test(t || ""); }

function tokens(s) {
  return String(s || "")
    .toLowerCase()
    .split(/[\s,;:|\/\-_]+/)
    .filter(w => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(tokens(a));
  let n = 0;
  for (const w of tokens(b)) if (sa.has(w)) n++;
  return n;
}

function normKnowledge(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw?.data)
    ? raw.data
    : [];
  return arr.map(k => ({
    id:    k.id || k._id || k.knowledge_id || String(Math.random()),
    title: k.title || k.name || k.label || k.topic || "Knowledge Item",
    body:  k.body || k.content || k.summary || k.description || "",
    tags:  Array.isArray(k.tags) ? k.tags.join(" ") : (k.tags || ""),
  }));
}

function normAlerts(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.alerts)
    ? raw.alerts
    : Array.isArray(raw?.data)
    ? raw.data
    : [];
  return arr.map(a => ({
    id:      a.id || a.alert_id || String(Math.random()),
    title:   a.title || a.name || a.message || a.description || "Alert",
    severity: a.severity || a.level || "medium",
    text:    [a.title, a.description, a.message, a.tags].filter(Boolean).join(" "),
  }));
}

function normSkills(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.skills)
    ? raw.skills
    : Array.isArray(raw?.data)
    ? raw.data
    : [];
  return arr.map(s => ({
    id:     s.id || s.skill_id || String(Math.random()),
    name:   s.name || s.title || s.label || "Skill",
    domain: s.domain || s.category || s.type || "",
    text:   [s.name, s.description, s.domain, s.tags].filter(Boolean).join(" "),
  }));
}

function classify(knowledge, alerts, skills) {
  return knowledge.map(k => {
    const kText = `${k.title} ${k.body} ${k.tags}`;
    const matchAlert = alerts.find(a => overlap(kText, a.text) >= 1);
    const matchSkill = skills.find(s => overlap(kText, s.text) >= 1);
    let coverage;
    if (matchAlert && matchSkill) coverage = "FULLY_AUTOMATED";
    else if (matchAlert)          coverage = "ALERT_TRIGGERED";
    else if (matchSkill)          coverage = "SKILL_BACKED";
    else                          coverage = "PASSIVE";
    return {
      ...k,
      coverage,
      alertTitle: matchAlert?.title  || null,
      skillName:  matchSkill?.name   || null,
      alertSev:   matchAlert?.severity || null,
    };
  });
}

const COV_COLOR = {
  FULLY_AUTOMATED: GN,
  ALERT_TRIGGERED: CY,
  SKILL_BACKED:    AM,
  PASSIVE:         RD,
};

const COV_LABEL = {
  FULLY_AUTOMATED: "FULLY AUTOMATED",
  ALERT_TRIGGERED: "ALERT TRIGGERED",
  SKILL_BACKED:    "SKILL BACKED",
  PASSIVE:         "PASSIVE",
};

export async function buildKoatracScript() {
  const h = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  const base = apiBase();
  const [kRaw, aRaw, sRaw] = await Promise.all([
    fetch(`${base}/knowledge/`, { headers: h }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/ops/alerts`, { headers: h }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/aip/skill`, { headers: h }).then(r => r.ok ? r.json() : []),
  ]);
  const knowledge = normKnowledge(kRaw);
  const alerts    = normAlerts(aRaw);
  const skills    = normSkills(sRaw);
  const rows      = classify(knowledge, alerts, skills);
  const total     = rows.length;
  const fa        = rows.filter(r => r.coverage === "FULLY_AUTOMATED").length;
  const at        = rows.filter(r => r.coverage === "ALERT_TRIGGERED").length;
  const sb        = rows.filter(r => r.coverage === "SKILL_BACKED").length;
  const passive   = rows.filter(r => r.coverage === "PASSIVE").length;
  const pct       = total > 0 ? Math.round(((fa + at + sb) / total) * 100) : 0;
  return (
    `KOATRAC online, sir. Knowledge-to-Ops-Alert and AIP Skill automation coverage is at ${pct} percent ` +
    `across ${total} knowledge items. ` +
    `${fa} are fully automated with both alert and skill linkage. ` +
    `${at} are alert-triggered only. ` +
    `${sb} are skill-backed only. ` +
    `${passive} remain passive with no automation coverage and may require manual triage. ` +
    (passive > 0
      ? `Recommend reviewing passive items for skill assignment or alert rule creation.`
      : `All knowledge items have active automation coverage.`)
  );
}

export default function KnowledgeOpsAlertSkillCoverage() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [kCount,    setKCount]    = useState(0);
  const [aCount,    setACount]    = useState(0);
  const [sCount,    setSCount]    = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const h = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const base = apiBase();
      const [kRaw, aRaw, sRaw] = await Promise.all([
        fetch(`${base}/knowledge/`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/ops/alerts`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/aip/skill`, { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const knowledge = normKnowledge(kRaw);
      const alerts    = normAlerts(aRaw);
      const skills    = normSkills(sRaw);
      setKCount(knowledge.length);
      setACount(alerts.length);
      setSCount(skills.length);
      setRows(classify(knowledge, alerts, skills));
    } catch (e) {
      setErr(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:koatrac-toggle", onToggle);
    return () => window.removeEventListener("jarvis:koatrac-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (open) {
      load();
      timerRef.current = setInterval(load, REFRESH_MS);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildKoatracScript();
      const r = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: script, voice: getActiveVoice() }),
      });
      if (r.ok) {
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.play();
      }
    } catch { /* silent */ } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const filtered = rows.filter(r => {
    const matchFilter = filter === "ALL" || r.coverage === filter;
    const q = search.trim().toLowerCase();
    const matchSearch = !q || r.title.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  const total   = rows.length;
  const fa      = rows.filter(r => r.coverage === "FULLY_AUTOMATED").length;
  const at      = rows.filter(r => r.coverage === "ALERT_TRIGGERED").length;
  const sb      = rows.filter(r => r.coverage === "SKILL_BACKED").length;
  const passive = rows.filter(r => r.coverage === "PASSIVE").length;
  const pct     = total > 0 ? Math.round(((fa + at + sb) / total) * 100) : 0;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="KOATRAC — Knowledge × Ops Alert × AIP Skill Automation Coverage"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
          background: "rgba(0,229,255,0.07)", border: `1px solid ${CY}`,
          color: CY, fontFamily: MN, fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer", borderRadius: 3,
          whiteSpace: "nowrap",
        }}
      >
        KOATRAC
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
      width: 540, maxHeight: "86vh", background: BG,
      border: `1px solid ${CY}`, borderRadius: 6, fontFamily: MN,
      fontSize: 11, color: "#e0e8f0", display: "flex", flexDirection: "column",
      overflow: "hidden", boxShadow: `0 0 24px rgba(0,229,255,0.12)`,
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: `1px solid rgba(0,229,255,0.15)`,
        background: "rgba(0,229,255,0.06)",
      }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>
          ◈ KOATRAC
        </span>
        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 9 }}>
          KNOWLEDGE × OPS ALERTS × AIP SKILLS
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: RD, cursor: "pointer", fontSize: 14 }}
        >×</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderBottom: `1px solid ${DIM}` }}>
        {[
          { label: "KNOWLEDGE", val: kCount,  color: CY },
          { label: "ALERTS",    val: aCount,  color: OR },
          { label: "SKILLS",    val: sCount,  color: AM },
          { label: "PASSIVE",   val: passive, color: passive > 0 ? RD : GN },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            flex: 1, background: DIM, border: `1px solid rgba(255,255,255,0.06)`,
            borderRadius: 4, padding: "5px 8px", textAlign: "center",
          }}>
            <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      {total > 0 && (
        <div style={{ padding: "6px 12px", borderBottom: `1px solid ${DIM}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
            <span>AUTOMATION COVERAGE</span>
            <span style={{ color: pct >= 70 ? GN : pct >= 40 ? AM : RD }}>{pct}%</span>
          </div>
          <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "rgba(255,255,255,0.06)" }}>
            {fa > 0      && <div style={{ width: `${(fa      / total) * 100}%`, background: GN }} />}
            {at > 0      && <div style={{ width: `${(at      / total) * 100}%`, background: CY }} />}
            {sb > 0      && <div style={{ width: `${(sb      / total) * 100}%`, background: AM }} />}
            {passive > 0 && <div style={{ width: `${(passive / total) * 100}%`, background: RD }} />}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 3, fontSize: 8, color: "rgba(255,255,255,0.35)" }}>
            <span><span style={{ color: GN }}>■</span> FULLY AUTO {fa}</span>
            <span><span style={{ color: CY }}>■</span> ALERT {at}</span>
            <span><span style={{ color: AM }}>■</span> SKILL {sb}</span>
            <span><span style={{ color: RD }}>■</span> PASSIVE {passive}</span>
          </div>
        </div>
      )}

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "6px 12px", borderBottom: `1px solid ${DIM}` }}>
        {["ALL", "FULLY_AUTOMATED", "ALERT_TRIGGERED", "SKILL_BACKED", "PASSIVE"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? "rgba(0,229,255,0.12)" : "none",
              border: `1px solid ${filter === f ? CY : "rgba(255,255,255,0.08)"}`,
              color: filter === f ? CY : "rgba(255,255,255,0.4)",
              fontFamily: MN, fontSize: 8, padding: "2px 6px", cursor: "pointer",
              borderRadius: 3, letterSpacing: 0.5,
            }}
          >{f === "ALL" ? "ALL" : COV_LABEL[f]}</button>
        ))}
      </div>

      {/* search */}
      <div style={{ padding: "5px 12px", borderBottom: `1px solid ${DIM}` }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search knowledge items…"
          style={{
            width: "100%", background: DIM, border: `1px solid rgba(255,255,255,0.08)`,
            color: "#e0e8f0", fontFamily: MN, fontSize: 10, padding: "3px 8px",
            borderRadius: 3, outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
        {loading && (
          <div style={{ padding: "12px 16px", color: "rgba(255,255,255,0.3)", fontSize: 10 }}>
            ◌ Loading knowledge automation coverage…
          </div>
        )}
        {err && !loading && (
          <div style={{ padding: "12px 16px", color: RD, fontSize: 10 }}>{err}</div>
        )}
        {!loading && !err && filtered.length === 0 && (
          <div style={{ padding: "12px 16px", color: "rgba(255,255,255,0.3)", fontSize: 10 }}>
            No items matched.
          </div>
        )}
        {!loading && filtered.map(row => {
          const isExp = expanded === row.id;
          const cc    = COV_COLOR[row.coverage];
          return (
            <div
              key={row.id}
              onClick={() => setExpanded(isExp ? null : row.id)}
              style={{
                padding: "6px 12px", cursor: "pointer",
                borderBottom: `1px solid ${DIM}`,
                background: isExp ? "rgba(0,229,255,0.04)" : "transparent",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  color: cc, fontSize: 8, letterSpacing: 1, fontWeight: 700,
                  minWidth: 110,
                }}>{COV_LABEL[row.coverage]}</span>
                <span style={{ flex: 1, color: "#c8d8e8", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.title}
                </span>
              </div>
              {isExp && (
                <div style={{ marginTop: 6, fontSize: 9, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
                  {row.body && <div style={{ marginBottom: 4 }}>{row.body.slice(0, 200)}{row.body.length > 200 ? "…" : ""}</div>}
                  {row.alertTitle && (
                    <div>
                      <span style={{ color: OR }}>ALERT: </span>{row.alertTitle}
                      {row.alertSev && <span style={{ marginLeft: 6, color: "rgba(255,255,255,0.3)" }}>[{row.alertSev}]</span>}
                    </div>
                  )}
                  {row.skillName && (
                    <div><span style={{ color: AM }}>SKILL: </span>{row.skillName}</div>
                  )}
                  {!row.alertTitle && !row.skillName && (
                    <div style={{ color: RD }}>No alert or skill linkage found — manual triage required.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess button */}
      <div style={{ padding: "6px 12px", borderTop: `1px solid ${DIM}` }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            width: "100%", background: assessing ? "rgba(0,229,255,0.04)" : "rgba(0,229,255,0.08)",
            border: `1px solid ${CY}`, color: CY, fontFamily: MN,
            fontSize: 9, letterSpacing: 1, padding: "5px 0", cursor: assessing ? "default" : "pointer",
            borderRadius: 3,
          }}
        >
          {assessing ? "◌ ASSESSING…" : "◈ ASSESS AUTOMATION COVERAGE"}
        </button>
      </div>
    </div>
  );
}
