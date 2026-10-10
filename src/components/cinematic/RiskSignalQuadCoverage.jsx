import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AM = "#FFB300";
const GN = "#4ADE80";
const RD = "#FF4444";
const PU = "#A78BFA";
const LM = "#84CC16";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_KEY) ||
  "dev-key";

const RCDTRI_RE =
  /\b(rcdtri|risk[._-]?quad|quad[._-]?risk|fully[._-]?mitigated|unmitigated[._-]?risk|risk[._-]?resource[._-]?coverage|risk[._-]?coverage[._-]?quad|risk[._-]?four[._-]?way|risk[._-]?contact[._-]?dataset|risk[._-]?contact[._-]?scenario|risk[._-]?mitigation[._-]?matrix|risk[._-]?response[._-]?coverage)\b/i;

export function isRcdtriQuery(t) {
  return RCDTRI_RE.test(t || "");
}

function tok(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function overlap(a, b) {
  const sa = new Set(tok(a));
  const sb = tok(b);
  if (!sa.size || !sb.length) return 0;
  let hits = 0;
  for (const w of sb) if (sa.has(w)) hits++;
  return hits / Math.max(sa.size, sb.length);
}

function signalHaystack(rs) {
  return [
    rs.title, rs.name, rs.signal, rs.description, rs.category,
    rs.sector, rs.source, rs.type,
    ...(Array.isArray(rs.tags) ? rs.tags : []),
  ].join(" ");
}

function contactNeedle(c) {
  return [c.name, c.email, c.company, c.title, c.description, c.role,
    ...(Array.isArray(c.tags) ? c.tags : [])].join(" ");
}

function datasetNeedle(d) {
  return [d.name, d.description, d.kind, d.type,
    ...(Array.isArray(d.tags) ? d.tags : [])].join(" ");
}

function scenarioNeedle(s) {
  return [s.title, s.name, s.description, s.summary, s.category, s.type,
    ...(Array.isArray(s.tags) ? s.tags : [])].join(" ");
}

function normaliseRiskSignals(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.signals) ? raw.signals
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data) ? raw.data : [];
  return arr.map((rs, i) => ({
    id:          rs.id       || String(i),
    title:       rs.title    || rs.name    || rs.signal || `Risk ${i + 1}`,
    description: (rs.description || rs.body || rs.details || "").toString().slice(0, 300),
    severity:    rs.severity || rs.level   || rs.priority || "",
    category:    rs.category || rs.type    || "",
    sector:      rs.sector   || rs.domain  || "",
    source:      rs.source   || "",
    tags:        Array.isArray(rs.tags) ? rs.tags.join(" ") : (rs.tags || ""),
  }));
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.contacts) ? raw.contacts
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data) ? raw.data : [];
  return arr.map((c, i) => ({
    id:      c.id    || String(i),
    name:    c.name  || c.full_name || `Contact ${i + 1}`,
    company: c.company || c.organization || c.org || "",
    title:   c.title || c.role || c.position || "",
    email:   c.email || "",
    description: (c.description || c.bio || c.notes || "").toString().slice(0, 200),
    tags:    Array.isArray(c.tags) ? c.tags.join(" ") : (c.tags || ""),
  }));
}

function normaliseDatasets(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.datasets) ? raw.datasets
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.data) ? raw.data : [];
  return arr.map((d, i) => ({
    id:          d.id    || String(i),
    name:        d.name  || d.title || `Dataset ${i + 1}`,
    description: (d.description || d.summary || "").toString().slice(0, 200),
    kind:        d.kind  || d.type || d.category || "",
    rows:        d.row_count || d.rows || d.count || null,
    tags:        Array.isArray(d.tags) ? d.tags.join(" ") : (d.tags || ""),
  }));
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["scenarios", "items", "results", "data", "records"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function classify(rs, contacts, datasets, scenarios) {
  const hay = signalHaystack(rs);
  const hasCon = contacts .some((c) => overlap(hay, contactNeedle(c))  > 0.10);
  const hasDs  = datasets .some((d) => overlap(hay, datasetNeedle(d))  > 0.10);
  const hasSc  = scenarios.some((s) => overlap(hay, scenarioNeedle(s)) > 0.10);
  const count  = [hasCon, hasDs, hasSc].filter(Boolean).length;
  if (count === 3) return "FULLY MITIGATED";
  if (count === 2) return "RESOURCED";
  if (count === 1) return "MINIMAL";
  return "UNMITIGATED";
}

function matchedContacts(rs, contacts) {
  const hay = signalHaystack(rs);
  return contacts
    .map((c) => ({ c, sc: overlap(hay, contactNeedle(c)) }))
    .filter((x) => x.sc > 0.05)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 5);
}

function matchedDatasets(rs, datasets) {
  const hay = signalHaystack(rs);
  return datasets
    .map((d) => ({ d, sc: overlap(hay, datasetNeedle(d)) }))
    .filter((x) => x.sc > 0.05)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 5);
}

function matchedScenarios(rs, scenarios) {
  const hay = signalHaystack(rs);
  return scenarios
    .map((s) => ({ s, sc: overlap(hay, scenarioNeedle(s)) }))
    .filter((x) => x.sc > 0.05)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 5);
}

export async function buildRcdtriScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [rsR, conR, dsR, scR] = await Promise.allSettled([
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/entities/Contact`,    { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/v1/datasets`,          { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/v1/scenario/list`,     { headers: hdr }).then((r) => r.json()),
    ]);
    const signals   = normaliseRiskSignals(rsR.status === "fulfilled" ? rsR.value : []).slice(0, 200);
    const contacts  = normaliseContacts(conR.status === "fulfilled" ? conR.value : []).slice(0, 200);
    const datasets  = normaliseDatasets(dsR.status === "fulfilled" ? dsR.value : []).slice(0, 200);
    const scenarios = normaliseScenarios(scR.status === "fulfilled" ? scR.value : []).slice(0, 200);
    const classified = signals.map((rs) => ({ ...rs, _class: classify(rs, contacts, datasets, scenarios) }));
    const fullyMit  = classified.filter((s) => s._class === "FULLY MITIGATED").length;
    const resourced = classified.filter((s) => s._class === "RESOURCED").length;
    const minimal   = classified.filter((s) => s._class === "MINIMAL").length;
    const unmitig   = classified.filter((s) => s._class === "UNMITIGATED").length;
    const topUnmitig = classified
      .filter((s) => s._class === "UNMITIGATED")
      .slice(0, 4)
      .map((s) => s.title)
      .join(", ") || "none";
    return (
      `Risk Signal × Contact × Dataset × Scenario Quad Coverage: ${signals.length} risk signals, ` +
      `${contacts.length} contacts, ${datasets.length} datasets, ${scenarios.length} scenarios. ` +
      `${fullyMit} FULLY MITIGATED (contact + dataset + scenario); ` +
      `${resourced} RESOURCED (2 of 3); ${minimal} MINIMAL (1 of 3); ${unmitig} UNMITIGATED (no coverage). ` +
      `Top unmitigated risks: ${topUnmitig}. ` +
      `Recommend assigning contacts, sourcing datasets, or creating response scenarios for unmitigated signals.`
    );
  } catch (e) {
    return `Risk quad coverage assessment failed: ${String(e)}`;
  }
}

const TABS = ["ALL", "FULLY MITIGATED", "RESOURCED", "MINIMAL", "UNMITIGATED"];

const chip = (label, color = CY) => (
  <span
    style={{
      display: "inline-block", padding: "1px 6px", borderRadius: 3,
      border: `1px solid ${color}44`, background: `${color}14`,
      color, fontSize: 9, letterSpacing: 1, marginRight: 3,
    }}
  >{label}</span>
);

const ScoreBar = ({ sc, color }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 3, verticalAlign: "middle" }}>
    <div style={{ width: 52, height: 3, background: "#1a2535", borderRadius: 2, overflow: "hidden" }}>
      <div style={{ width: `${Math.round(sc * 100)}%`, height: "100%", background: color, borderRadius: 2 }} />
    </div>
    <span style={{ color: "#6E8AA0", fontSize: 9 }}>{Math.round(sc * 100)}%</span>
  </div>
);

const classColor = (cl) => {
  if (cl === "FULLY MITIGATED") return GN;
  if (cl === "RESOURCED")       return LM;
  if (cl === "MINIMAL")         return AM;
  return RD;
};

const severityColor = (sv) => {
  const s = (sv || "").toLowerCase();
  if (s === "critical" || s === "high") return RD;
  if (s === "warning"  || s === "medium") return AM;
  if (s === "info"     || s === "low") return CY;
  return "#6E8AA0";
};

const mono = { fontFamily: "'JetBrains Mono',monospace" };

export default function RiskSignalQuadCoverage() {
  const [open, setOpen]         = useState(false);
  const [signals, setSignals]   = useState([]);
  const [contacts, setContacts] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const [err, setErr]           = useState("");
  const timerRef                = useRef(null);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [rsR, conR, dsR, scR] = await Promise.allSettled([
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/entities/Contact`,    { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/v1/datasets`,          { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/v1/scenario/list`,     { headers: hdr }).then((r) => r.json()),
      ]);
      setSignals(normaliseRiskSignals(rsR.status === "fulfilled" ? rsR.value : []).slice(0, 200));
      setContacts(normaliseContacts(conR.status === "fulfilled" ? conR.value : []).slice(0, 200));
      setDatasets(normaliseDatasets(dsR.status === "fulfilled" ? dsR.value : []).slice(0, 200));
      setScenarios(normaliseScenarios(scR.status === "fulfilled" ? scR.value : []).slice(0, 200));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function onToggle() {
      setOpen((o) => {
        if (!o) load();
        return !o;
      });
    }
    window.addEventListener("jarvis:rcdtri-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rcdtri-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const enriched = signals.map((rs) => ({
    ...rs,
    _class: classify(rs, contacts, datasets, scenarios),
    _con:   matchedContacts(rs, contacts),
    _ds:    matchedDatasets(rs, datasets),
    _sc:    matchedScenarios(rs, scenarios),
  }));

  const fullyMitCount = enriched.filter((s) => s._class === "FULLY MITIGATED").length;
  const resourcedCount = enriched.filter((s) => s._class === "RESOURCED").length;
  const minimalCount  = enriched.filter((s) => s._class === "MINIMAL").length;
  const unmitigCount  = enriched.filter((s) => s._class === "UNMITIGATED").length;

  const filtered = enriched.filter((rs) => {
    if (tab !== "ALL" && rs._class !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        rs.title.toLowerCase().includes(q) ||
        rs.description.toLowerCase().includes(q) ||
        (rs.category || "").toLowerCase().includes(q) ||
        (rs.severity  || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    setAssessText("");
    try {
      const script = await buildRcdtriScript();
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const answer = (d.answer || script).replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessText(answer);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {
      setAssessText(await buildRcdtriScript());
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="RiskSignal × Contact × Dataset × Scenario Quad Coverage (RCDTRI)"
        style={{
          position: "fixed",
          left: 730560,
          bottom: 8,
          zIndex: 333,
          background: unmitigCount > 0 ? `${RD}22` : "#0a0a0a",
          border: `1px solid ${unmitigCount > 0 ? RD : "#333"}`,
          color: unmitigCount > 0 ? RD : "#888",
          ...mono,
          fontSize: 9,
          padding: "3px 7px",
          borderRadius: 3,
          cursor: "pointer",
          letterSpacing: 1,
        }}
      >
        ◈ RCDTRI{unmitigCount > 0 ? ` ▲${unmitigCount}` : ""}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 40,
        left: "50%",
        transform: "translateX(-50%)",
        width: 860,
        maxHeight: "85vh",
        overflowY: "auto",
        background: "#060810",
        border: "1px solid #1a2a3a",
        borderRadius: 6,
        zIndex: 9503,
        ...mono,
        fontSize: 11,
        color: "#ccc",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #1a2a3a", gap: 8 }}>
        <span style={{ color: RD, fontSize: 13, fontWeight: 700, flex: 1 }}>
          ◈ RISK SIGNAL × CONTACT × DATASET × SCENARIO — QUAD COVERAGE
        </span>
        {loading && <span style={{ color: "#555", fontSize: 9 }}>LOADING…</span>}
        <button
          onClick={assess}
          disabled={assessing}
          style={{ background: "#111", border: `1px solid ${CY}`, color: CY, fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer" }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "#555", fontSize: 14, cursor: "pointer" }}
        >✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 5, padding: "10px 14px", borderBottom: "1px solid #111", flexWrap: "wrap" }}>
        {[
          ["RISK SIGNALS", signals.length,   "#888"],
          ["CONTACTS",     contacts.length,  "#888"],
          ["DATASETS",     datasets.length,  "#888"],
          ["SCENARIOS",    scenarios.length, "#888"],
          ["FULLY MITIGATED", fullyMitCount, GN],
          ["RESOURCED",    resourcedCount,   LM],
          ["MINIMAL",      minimalCount,     AM],
          ["UNMITIGATED",  unmitigCount,     RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{ flex: "1 1 80px", background: "#0c0c0c", border: "1px solid #1a1a1a", borderRadius: 3, padding: "6px 4px", textAlign: "center" }}>
            <div style={{ color, fontSize: 15, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#555", fontSize: 7, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      {signals.length > 0 && (
        <div style={{ padding: "6px 14px", borderBottom: "1px solid #111" }}>
          <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden" }}>
            {[
              [fullyMitCount,  GN],
              [resourcedCount, LM],
              [minimalCount,   AM],
              [unmitigCount,   RD],
            ].map(([count, color], i) => (
              <div
                key={i}
                style={{ width: `${(count / signals.length) * 100}%`, background: color }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 4, fontSize: 8, color: "#555" }}>
            {[["FULLY MITIGATED", GN], ["RESOURCED", LM], ["MINIMAL", AM], ["UNMITIGATED", RD]].map(([label, color]) => (
              <span key={label} style={{ color }}>{label}</span>
            ))}
          </div>
        </div>
      )}

      {/* assess text */}
      {assessText && (
        <div style={{ padding: "8px 14px", borderBottom: "1px solid #111", color: "#aaa", fontSize: 10, lineHeight: 1.6, background: "#080808" }}>
          {assessText}
        </div>
      )}

      {/* search + tabs */}
      <div style={{ padding: "8px 14px", borderBottom: "1px solid #111", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search risk signals…"
          style={{
            background: "#0c0c0c", border: "1px solid #222", color: "#ccc",
            padding: "3px 8px", borderRadius: 3, fontSize: 10, flex: 1, minWidth: 120, outline: "none",
          }}
        />
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${RD}22` : "none",
              border: `1px solid ${tab === t ? RD : "#222"}`,
              color: tab === t ? RD : "#555",
              fontSize: 8, padding: "2px 6px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
            }}
          >{t}</button>
        ))}
      </div>

      {err && <div style={{ padding: "6px 14px", color: RD, fontSize: 9 }}>ERROR: {err}</div>}

      {/* rows */}
      <div style={{ padding: "6px 0" }}>
        {filtered.length === 0 && (
          <div style={{ padding: "16px 14px", color: "#444", textAlign: "center", fontSize: 10 }}>
            {loading ? "Loading…" : "No risk signals match the current filter."}
          </div>
        )}
        {filtered.map((rs) => {
          const isExp = expanded === rs.id;
          const cc = classColor(rs._class);
          return (
            <div key={rs.id} style={{ borderBottom: "1px solid #0d0d0d" }}>
              <div
                onClick={() => setExpanded(isExp ? null : rs.id)}
                style={{ display: "flex", alignItems: "center", padding: "7px 14px", gap: 8, cursor: "pointer" }}
              >
                <span style={{ color: cc, fontSize: 9, minWidth: 130, letterSpacing: 1 }}>
                  {rs._class}
                </span>
                <span style={{ flex: 1, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {rs.title}
                </span>
                {rs.severity && chip(rs.severity.toUpperCase(), severityColor(rs.severity))}
                {rs.category && chip(rs.category, "#555")}
                {rs.sector   && chip(rs.sector, "#444")}
                <span style={{ color: "#333", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "0 14px 10px", display: "flex", gap: 10 }}>
                  {/* Contacts pane */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: CY, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
                      CONTACTS ({rs._con.length})
                    </div>
                    {rs._con.length === 0 ? (
                      <div style={{ color: "#333", fontSize: 9 }}>No contact alignment for this risk.</div>
                    ) : rs._con.map(({ c, sc }, i) => (
                      <div key={i} style={{ marginBottom: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ color: "#bbb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                            {c.name}
                          </span>
                          <span style={{ color: CY, fontSize: 9 }}>{Math.round(sc * 100)}%</span>
                        </div>
                        {c.title   && chip(c.title, "#444")}
                        {c.company && chip(c.company, "#333")}
                        <ScoreBar sc={sc} color={CY} />
                      </div>
                    ))}
                  </div>

                  {/* Datasets pane */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: AM, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
                      DATASETS ({rs._ds.length})
                    </div>
                    {rs._ds.length === 0 ? (
                      <div style={{ color: "#333", fontSize: 9 }}>No dataset evidence for this risk.</div>
                    ) : rs._ds.map(({ d, sc }, i) => (
                      <div key={i} style={{ marginBottom: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ color: "#bbb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                            {d.name}
                          </span>
                          <span style={{ color: AM, fontSize: 9 }}>{Math.round(sc * 100)}%</span>
                        </div>
                        {d.kind && chip(d.kind, "#444")}
                        {d.rows != null && chip(`${d.rows.toLocaleString()} rows`, "#333")}
                        <ScoreBar sc={sc} color={AM} />
                      </div>
                    ))}
                  </div>

                  {/* Scenarios pane */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: PU, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
                      SCENARIOS ({rs._sc.length})
                    </div>
                    {rs._sc.length === 0 ? (
                      <div style={{ color: "#333", fontSize: 9 }}>No response scenario for this risk.</div>
                    ) : rs._sc.map(({ s, sc }, i) => (
                      <div key={i} style={{ marginBottom: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ color: "#bbb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                            {s.title || s.name || "Scenario"}
                          </span>
                          <span style={{ color: PU, fontSize: 9 }}>{Math.round(sc * 100)}%</span>
                        </div>
                        {s.status   && chip(s.status, "#555")}
                        {s.category && chip(s.category, "#444")}
                        <ScoreBar sc={sc} color={PU} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
