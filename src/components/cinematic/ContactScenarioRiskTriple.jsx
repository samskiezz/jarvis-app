import { useState, useEffect, useRef } from "react";

const API = (typeof window !== "undefined" && window.__JARVIS_API__) || "";

const CSRKTRI_RE =
  /\b(csrktri|contact\s+scenario\s+risk|contact\s+scenario|scenario\s+risk\s+contact|contact\s+risk\s+scenario|cntrsk|scenario\s+contact\s+risk|contact\s+nexus\s+risk|risk\s+scenario\s+contact|contact\s+risk\s+coverage|scenario\s+covered\s+contact|dark\s+contact\s+scenario|unlinked\s+contact\s+scenario)\b/i;

export function isCsrktriQuery(t) {
  return CSRKTRI_RE.test(t || "");
}

function tok(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function normaliseContacts(raw) {
  const arr = Array.isArray(raw) ? raw : raw?.items || raw?.data || raw?.results || [];
  return arr.map((c) => ({
    id: String(c.id || c._id || c.contact_id || Math.random()),
    name: String(c.name || c.full_name || c.display_name || c.email || "Unknown"),
    role: String(c.role || c.title || c.organisation || ""),
    tags: Array.isArray(c.tags) ? c.tags.join(" ") : String(c.tags || ""),
    toks: tok(
      [c.name, c.full_name, c.role, c.title, c.organisation, c.email, c.tags].join(" ")
    ),
  }));
}

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw) ? raw : raw?.items || raw?.data || raw?.results || raw?.scenarios || [];
  return arr.map((s) => ({
    id: String(s.id || s._id || s.scenario_id || Math.random()),
    title: String(s.title || s.name || s.label || "Untitled"),
    type: String(s.type || s.category || s.kind || ""),
    status: String(s.status || s.state || ""),
    toks: tok([s.title, s.name, s.label, s.type, s.category, s.description].join(" ")),
  }));
}

function normaliseRiskSignals(raw) {
  const arr = Array.isArray(raw) ? raw : raw?.items || raw?.data || raw?.results || [];
  return arr.map((r) => ({
    id: String(r.id || r._id || r.signal_id || Math.random()),
    title: String(r.title || r.name || r.label || "Unnamed"),
    severity: String(r.severity || r.level || r.risk_level || ""),
    category: String(r.category || r.type || ""),
    toks: tok([r.title, r.name, r.label, r.severity, r.category, r.description].join(" ")),
  }));
}

function matchScore(contactToks, fieldText) {
  const ft = tok(fieldText);
  if (!ft.length || !contactToks.length) return 0;
  let hits = 0;
  for (const ct of contactToks) {
    for (const ft2 of ft) {
      if (ft2.includes(ct) || ct.includes(ft2)) hits++;
    }
  }
  return hits / Math.max(contactToks.length, ft.length);
}

const THRESHOLD = 0.08;

function correlate(contacts, scenarios, riskSignals) {
  return contacts.map((contact) => {
    const matchedScenarios = scenarios
      .map((s) => ({
        ...s,
        hits: matchScore(contact.toks, [s.title, s.type, s.status].join(" ")),
      }))
      .filter((s) => s.hits >= THRESHOLD)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5);

    const matchedRisks = riskSignals
      .map((r) => ({
        ...r,
        hits: matchScore(contact.toks, [r.title, r.severity, r.category].join(" ")),
      }))
      .filter((r) => r.hits >= THRESHOLD)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5);

    const hasScenario = matchedScenarios.length > 0;
    const hasRisk = matchedRisks.length > 0;

    let classification;
    if (hasScenario && hasRisk) classification = "FULLY_COVERED";
    else if (hasScenario) classification = "SCENARIO_ONLY";
    else if (hasRisk) classification = "RISK_ONLY";
    else classification = "DARK";

    return { ...contact, matchedScenarios, matchedRisks, classification };
  });
}

export async function buildCsrktriScript() {
  const key =
    (typeof localStorage !== "undefined" && localStorage.getItem("jarvis_api_key")) ||
    "dev-key";
  const h = { Authorization: `Bearer ${key}` };
  const base = (typeof window !== "undefined" && window.__JARVIS_API__) || "";
  const [r1, r2, r3] = await Promise.allSettled([
    fetch(`${base}/entities/Contact`, { headers: h }).then((r) => r.json()),
    fetch(`${base}/v1/scenario/list`, { headers: h }).then((r) => r.json()),
    fetch(`${base}/entities/RiskSignal`, { headers: h }).then((r) => r.json()),
  ]);
  const contacts = normaliseContacts(r1.status === "fulfilled" ? r1.value : []);
  const scenarios = normaliseScenarios(r2.status === "fulfilled" ? r2.value : []);
  const riskSignals = normaliseRiskSignals(r3.status === "fulfilled" ? r3.value : []);
  const rows = correlate(contacts, scenarios, riskSignals);
  const fully = rows.filter((r) => r.classification === "FULLY_COVERED").length;
  const dark = rows.filter((r) => r.classification === "DARK").length;
  const pct = rows.length ? Math.round((fully / rows.length) * 100) : 0;
  return (
    `Contact × Scenario × Risk Signal nexus: ${rows.length} contacts assessed — ` +
    `${fully} fully covered (${pct}%), ${dark} dark (no scenario or risk linkage). ` +
    `Recommend prioritising ${dark} unlinked contacts for immediate scenario assignment and risk signal review.`
  );
}

const CL = {
  FULLY_COVERED: { label: "FULLY COVERED", color: "#29E7FF", bg: "rgba(41,231,255,0.12)" },
  SCENARIO_ONLY: { label: "SCENARIO ONLY", color: "#A3E635", bg: "rgba(163,230,53,0.12)" },
  RISK_ONLY: { label: "RISK ONLY", color: "#FACC15", bg: "rgba(250,204,21,0.12)" },
  DARK: { label: "DARK", color: "#F87171", bg: "rgba(248,113,113,0.12)" },
};

const FILTERS = ["ALL", "FULLY_COVERED", "SCENARIO_ONLY", "RISK_ONLY", "DARK"];

export default function ContactScenarioRiskTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const key =
        (typeof localStorage !== "undefined" && localStorage.getItem("jarvis_api_key")) ||
        "dev-key";
      const h = { Authorization: `Bearer ${key}` };
      const [r1, r2, r3] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`, { headers: h }).then((r) => r.json()),
        fetch(`${API}/v1/scenario/list`, { headers: h }).then((r) => r.json()),
        fetch(`${API}/entities/RiskSignal`, { headers: h }).then((r) => r.json()),
      ]);
      const contacts = normaliseContacts(r1.status === "fulfilled" ? r1.value : []);
      const scenarios = normaliseScenarios(r2.status === "fulfilled" ? r2.value : []);
      const riskSignals = normaliseRiskSignals(r3.status === "fulfilled" ? r3.value : []);
      setRows(correlate(contacts, scenarios, riskSignals));
      setLastRefresh(new Date());
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function onToggle() {
      setOpen((o) => !o);
    }
    window.addEventListener("jarvis:csrktri-toggle", onToggle);
    return () => window.removeEventListener("jarvis:csrktri-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (open) {
      load();
      timerRef.current = setInterval(load, 90000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [open]);

  async function assess() {
    try {
      const key =
        (typeof localStorage !== "undefined" && localStorage.getItem("jarvis_api_key")) ||
        "dev-key";
      const fully = rows.filter((r) => r.classification === "FULLY_COVERED").length;
      const dark = rows.filter((r) => r.classification === "DARK").length;
      const prompt = `Contact × Scenario × Risk Signal nexus: ${rows.length} contacts, ${fully} fully covered, ${dark} dark. Provide a 2-sentence operational risk assessment for unlinked contacts and recommended prioritisation.`;
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const text = data?.response || data?.message || data?.content || JSON.stringify(data);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (e) {
      console.error("CSRKTRI assess error:", e);
    }
  }

  const filtered = rows.filter((r) => {
    if (filter !== "ALL" && r.classification !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.role.toLowerCase().includes(q);
    }
    return true;
  });

  const counts = {
    FULLY_COVERED: rows.filter((r) => r.classification === "FULLY_COVERED").length,
    SCENARIO_ONLY: rows.filter((r) => r.classification === "SCENARIO_ONLY").length,
    RISK_ONLY: rows.filter((r) => r.classification === "RISK_ONLY").length,
    DARK: rows.filter((r) => r.classification === "DARK").length,
  };
  const pct = rows.length ? Math.round((counts.FULLY_COVERED / rows.length) * 100) : 0;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          left: 913380,
          bottom: 8,
          zIndex: 605,
          background: "rgba(41,231,255,0.08)",
          border: "1px solid rgba(41,231,255,0.35)",
          borderRadius: 6,
          color: "#29E7FF",
          fontSize: 10,
          fontFamily: "monospace",
          padding: "3px 7px",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
        title="Contact × Scenario × Risk Signal Triple Nexus"
      >
        ◈ CSRKTRI
        {counts.DARK > 0 && (
          <span
            style={{
              marginLeft: 4,
              background: "#F87171",
              color: "#000",
              borderRadius: 4,
              padding: "0 4px",
              fontSize: 9,
            }}
          >
            {counts.DARK}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        top: 16,
        width: 480,
        maxHeight: "92vh",
        overflowY: "auto",
        background: "rgba(10,14,24,0.97)",
        border: "1px solid rgba(41,231,255,0.3)",
        borderRadius: 10,
        zIndex: 9605,
        fontFamily: "monospace",
        color: "#C8F0FF",
        fontSize: 12,
        boxShadow: "0 0 40px rgba(41,231,255,0.08)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px 8px",
          borderBottom: "1px solid rgba(41,231,255,0.15)",
        }}
      >
        <span style={{ color: "#29E7FF", fontWeight: 700, fontSize: 13 }}>
          ◈ CONTACT × SCENARIO × RISK (CSRKTRI)
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none",
            border: "none",
            color: "#29E7FF",
            cursor: "pointer",
            fontSize: 16,
          }}
        >
          ×
        </button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "10px 14px 6px", flexWrap: "wrap" }}>
        {[
          { label: "CONTACTS", value: rows.length, color: "#29E7FF" },
          { label: "FULLY CVR", value: counts.FULLY_COVERED, color: "#29E7FF" },
          { label: "SCN ONLY", value: counts.SCENARIO_ONLY, color: "#A3E635" },
          { label: "RSK ONLY", value: counts.RISK_ONLY, color: "#FACC15" },
          { label: "DARK", value: counts.DARK, color: "#F87171" },
          { label: "COVERAGE", value: `${pct}%`, color: pct >= 70 ? "#A3E635" : pct >= 40 ? "#FACC15" : "#F87171" },
        ].map((t) => (
          <div
            key={t.label}
            style={{
              flex: "1 1 60px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6,
              padding: "5px 8px",
              textAlign: "center",
            }}
          >
            <div style={{ color: t.color, fontSize: 16, fontWeight: 700 }}>{t.value}</div>
            <div style={{ color: "#6B8EA8", fontSize: 9 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "4px 14px 6px", flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? "rgba(41,231,255,0.15)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${filter === f ? "#29E7FF" : "rgba(255,255,255,0.1)"}`,
              borderRadius: 4,
              color: filter === f ? "#29E7FF" : "#6B8EA8",
              fontSize: 10,
              padding: "2px 8px",
              cursor: "pointer",
            }}
          >
            {f === "ALL" ? `ALL (${rows.length})` : `${CL[f]?.label} (${counts[f] ?? 0})`}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "0 14px 8px" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts…"
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(41,231,255,0.2)",
            borderRadius: 5,
            color: "#C8F0FF",
            fontSize: 11,
            padding: "4px 8px",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Error / loading */}
      {err && (
        <div style={{ color: "#F87171", padding: "4px 14px", fontSize: 11 }}>⚠ {err}</div>
      )}
      {loading && (
        <div style={{ color: "#6B8EA8", padding: "4px 14px", fontSize: 11 }}>Loading…</div>
      )}

      {/* List */}
      <div style={{ padding: "0 14px 8px" }}>
        {filtered.map((row) => {
          const cl = CL[row.classification];
          const isExp = expanded === row.id;
          return (
            <div
              key={row.id}
              onClick={() => setExpanded(isExp ? null : row.id)}
              style={{
                background: cl.bg,
                border: `1px solid ${cl.color}40`,
                borderRadius: 6,
                padding: "6px 10px",
                marginBottom: 5,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, color: "#E2F4FF" }}>{row.name}</span>
                <span
                  style={{
                    fontSize: 9,
                    background: cl.color + "22",
                    border: `1px solid ${cl.color}`,
                    borderRadius: 3,
                    padding: "1px 5px",
                    color: cl.color,
                  }}
                >
                  {cl.label}
                </span>
              </div>
              {row.role && (
                <div style={{ color: "#6B8EA8", fontSize: 10, marginTop: 2 }}>{row.role}</div>
              )}
              {isExp && (
                <div style={{ marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 8 }}>
                  {row.matchedScenarios.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: "#A3E635", fontSize: 10, marginBottom: 4 }}>
                        SCENARIOS ({row.matchedScenarios.length})
                      </div>
                      {row.matchedScenarios.map((s) => (
                        <div
                          key={s.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 10,
                            padding: "2px 0",
                            color: "#C8F0FF",
                          }}
                        >
                          <span>{s.title}</span>
                          <span
                            style={{
                              fontSize: 9,
                              background: "rgba(163,230,53,0.15)",
                              border: "1px solid #A3E635",
                              borderRadius: 3,
                              padding: "0 4px",
                              color: "#A3E635",
                            }}
                          >
                            {s.status || s.type || "scn"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {row.matchedRisks.length > 0 && (
                    <div>
                      <div style={{ color: "#FACC15", fontSize: 10, marginBottom: 4 }}>
                        RISK SIGNALS ({row.matchedRisks.length})
                      </div>
                      {row.matchedRisks.map((r) => (
                        <div
                          key={r.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 10,
                            padding: "2px 0",
                            color: "#C8F0FF",
                          }}
                        >
                          <span>{r.title}</span>
                          <span
                            style={{
                              fontSize: 9,
                              background: "rgba(250,204,21,0.15)",
                              border: "1px solid #FACC15",
                              borderRadius: 3,
                              padding: "0 4px",
                              color: "#FACC15",
                            }}
                          >
                            {r.severity || r.category || "rsk"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {row.matchedScenarios.length === 0 && row.matchedRisks.length === 0 && (
                    <div style={{ color: "#F87171", fontSize: 10 }}>No scenario or risk signal linkage detected.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && !loading && (
          <div style={{ color: "#6B8EA8", fontSize: 11, textAlign: "center", padding: "10px 0" }}>
            No contacts match current filter.
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: "1px solid rgba(41,231,255,0.15)",
          padding: "8px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ color: "#6B8EA8", fontSize: 10 }}>
          {lastRefresh ? `Refreshed ${lastRefresh.toLocaleTimeString()}` : "Not loaded"}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={load}
            style={{
              background: "rgba(41,231,255,0.08)",
              border: "1px solid rgba(41,231,255,0.3)",
              borderRadius: 5,
              color: "#29E7FF",
              fontSize: 10,
              padding: "3px 10px",
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
          <button
            onClick={assess}
            style={{
              background: "rgba(41,231,255,0.15)",
              border: "1px solid #29E7FF",
              borderRadius: 5,
              color: "#29E7FF",
              fontSize: 10,
              padding: "3px 10px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            ▶ ASSESS
          </button>
        </div>
      </div>
    </div>
  );
}
