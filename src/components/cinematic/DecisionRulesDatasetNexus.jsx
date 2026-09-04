/**
 * DecisionRulesDatasetNexus — F540 (RULDSET)
 * "JARVIS, rules dataset / dataset rules / ruldset / which rules have data / rule data coverage"
 * Cross-references /v1/rules + /v1/datasets.
 * Finds BACKED rules (≥1 dataset keyword-matches) vs UNGROUNDED (no data backing).
 * Coverage % tile; ALL/BACKED/UNGROUNDED filter tabs + search; click-to-expand matched datasets.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence data-readiness brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 120_000;
const BTN_LEFT = 45_320;
const Z_INDEX  = 111;

const RULDSET_RE =
  /\bruldset\b|\brule[s]?.?dataset[s]?\b|\bdataset[s]?.?rule[s]?\b|\bwhich.?rule[s]?.?have.?data\b|\bdata.?backed.?rule[s]?\b|\bungrounded.?rule[s]?.?data\b|\brule.?data.?coverage\b|\brule.?data.?backing\b|\bdata.?grounded.?rule[s]?\b|\bwatchtower.?data\b/i;

export function isRuldsetQuery(text) {
  return RULDSET_RE.test(text || "");
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

function normaliseDatasets(data) {
  if (!data) return [];
  const raw =
    data.datasets || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((d, i) => ({
    id:   d.id || `ds-${i}`,
    name: d.name || d.title || `Dataset ${i + 1}`,
    kind: (d.kind || d.type || d.format || "TABLE").toUpperCase(),
    rows: typeof d.rows === "number" ? d.rows : (typeof d.row_count === "number" ? d.row_count : null),
    tags: Array.isArray(d.tags) ? d.tags.join(" ") : String(d.tags || ""),
  }));
}

function crossRef(rules, datasets) {
  return rules.map((rule) => {
    const haystack = `${rule.name} ${rule.target} ${rule.condition} ${rule.tags}`;
    const matches = datasets
      .map((ds) => ({
        ds,
        hits: overlap(haystack, `${ds.name} ${ds.kind} ${ds.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...rule,
      backed: matches.length > 0,
      matches: matches.map(({ ds, hits }) => ({ ...ds, hits })),
    };
  });
}

// ─── buildRuldsetScript (for JarvisBrain) ────────────────────────────────────

export async function buildRuldsetScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [rulesRes, datasetsRes] = await Promise.all([
      fetch(`${base}/v1/rules`,    { headers: hdr }).then((r) => r.ok ? r.json() : {}),
      fetch(`${base}/v1/datasets`, { headers: hdr }).then((r) => r.ok ? r.json() : {}),
    ]);

    const rules    = normaliseRules(rulesRes);
    const datasets = normaliseDatasets(datasetsRes);
    const crossed  = crossRef(rules, datasets);

    const total      = crossed.length;
    const backed     = crossed.filter((r) => r.backed).length;
    const ungrounded = total - backed;
    const coverage   = total > 0 ? Math.round((backed / total) * 100) : 0;
    const topUngrounded = crossed
      .filter((r) => !r.backed)
      .slice(0, 2)
      .map((r) => r.name)
      .join(", ");

    const prompt = `JARVIS decision-rules dataset nexus: ${total} active rules cross-referenced against ${datasets.length} datasets. ${backed} rules are backed by dataset data (${coverage}% coverage). ${ungrounded} rules have no dataset grounding — they may be triggering on assumptions rather than verified data. Top ungrounded rules: ${topUngrounded || "none"}. Provide a 2-sentence data-readiness brief for the rule engine.`;
    const chatRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt }),
    });
    const chatData = chatRes.ok ? await chatRes.json() : {};
    const brief =
      chatData.response || chatData.message || chatData.content ||
      `${backed} of ${total} decision rules are backed by dataset data (${coverage}% coverage). ${ungrounded} rules lack any dataset grounding — consider linking data sources to strengthen watchtower reliability.`;

    window.dispatchEvent(
      new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } })
    );
    return brief;
  } catch (err) {
    return `Rules-dataset nexus error: ${err.message}`;
  }
}

// ─── severity colour ──────────────────────────────────────────────────────────

function severityColor(sev) {
  if (sev === "CRITICAL") return "#FF3B3B";
  if (sev === "HIGH")     return AMB;
  if (sev === "MEDIUM")   return CY;
  return DIM;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function DecisionRulesDatasetNexus() {
  const [open, setOpen]           = useState(false);
  const [crossed, setCrossed]     = useState([]);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]         = useState("");
  const [loading, setLoading]     = useState(false);
  const timerRef = useRef(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [rulesRes, datasetsRes] = await Promise.all([
        fetch(`${base}/v1/rules`,    { headers: hdr }).then((r) => r.ok ? r.json() : {}),
        fetch(`${base}/v1/datasets`, { headers: hdr }).then((r) => r.ok ? r.json() : {}),
      ]);
      const rules    = normaliseRules(rulesRes);
      const datasets = normaliseDatasets(datasetsRes);
      setCrossed(crossRef(rules, datasets));
    } catch (_) {
      /* network unavailable */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:ruldset-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ruldset-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetch_();
    timerRef.current = setInterval(fetch_, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetch_]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const result = await buildRuldsetScript();
      setBrief(result);
    } finally {
      setAssessing(false);
    }
  }, []);

  const backed     = crossed.filter((r) => r.backed);
  const ungrounded = crossed.filter((r) => !r.backed);
  const coverage   = crossed.length > 0
    ? Math.round((backed.length / crossed.length) * 100)
    : 0;

  const visible = crossed
    .filter((r) => {
      if (tab === "BACKED")     return r.backed;
      if (tab === "UNGROUNDED") return !r.backed;
      return true;
    })
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.target.toLowerCase().includes(q)
      );
    });

  const btnStyle = {
    position: "fixed",
    bottom: 8,
    left: BTN_LEFT,
    zIndex: Z_INDEX,
    background: "rgba(0,20,40,0.85)",
    border: `1px solid ${!open ? DIM : CY}`,
    color: !open ? DIM : CY,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "3px 7px",
    cursor: "pointer",
    borderRadius: 3,
    whiteSpace: "nowrap",
  };

  if (!open) {
    return (
      <button
        style={btnStyle}
        onClick={() => setOpen(true)}
        title="Decision Rules × Dataset Nexus (RULDSET)"
      >
        ◈ RULDSET{ungrounded.length > 0 && (
          <span style={{ color: AMB, marginLeft: 4 }}>{ungrounded.length}</span>
        )}
      </button>
    );
  }

  const panel = {
    position: "fixed",
    bottom: 36,
    left: Math.min(BTN_LEFT, window.innerWidth - 480),
    width: 460,
    maxHeight: "75vh",
    overflowY: "auto",
    zIndex: Z_INDEX + 1,
    background: "rgba(0,10,25,0.97)",
    border: `1px solid ${CY}`,
    borderRadius: 6,
    fontFamily: "monospace",
    fontSize: 11,
    color: CY,
    padding: 14,
    boxShadow: `0 0 24px ${CY}44`,
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(false)}>
        ◈ RULDSET ✕
      </button>

      <div style={panel}>
        <div style={{ fontSize: 13, fontWeight: "bold", marginBottom: 10 }}>
          ◈ DECISION RULES × DATASET NEXUS
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[
            ["RULES",      crossed.length,    CY],
            ["BACKED",     backed.length,     GRN],
            ["UNGROUNDED", ungrounded.length, AMB],
            ["COVERAGE",   `${coverage}%`,    coverage > 40 ? GRN : AMB],
          ].map(([label, val, col]) => (
            <div
              key={label}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${col}55`,
                borderRadius: 4,
                padding: "4px 6px",
                textAlign: "center",
              }}
            >
              <div style={{ color: col, fontSize: 14, fontWeight: "bold" }}>{val}</div>
              <div style={{ color: DIM, fontSize: 9 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {["ALL", "BACKED", "UNGROUNDED"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? CY : "transparent",
                color: tab === t ? "#000" : DIM,
                border: `1px solid ${tab === t ? CY : DIM}`,
                borderRadius: 3,
                padding: "2px 8px",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search rules…"
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${DIM}`,
            borderRadius: 3,
            color: CY,
            padding: "3px 6px",
            fontSize: 10,
            marginBottom: 8,
            boxSizing: "border-box",
          }}
        />

        {/* list */}
        {loading && !crossed.length ? (
          <div style={{ color: DIM, textAlign: "center", padding: 20 }}>FETCHING…</div>
        ) : visible.length === 0 ? (
          <div style={{ color: DIM, padding: 12 }}>No rules match.</div>
        ) : (
          visible.map((rule) => (
            <div
              key={rule.id}
              style={{
                borderBottom: "1px solid rgba(41,231,255,0.1)",
                paddingBottom: 8,
                marginBottom: 8,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                onClick={() => setExpanded(expanded === rule.id ? null : rule.id)}
              >
                <span
                  style={{
                    fontSize: 9,
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: rule.backed ? `${GRN}22` : `${AMB}22`,
                    color: rule.backed ? GRN : AMB,
                    border: `1px solid ${rule.backed ? GRN : AMB}55`,
                    flexShrink: 0,
                  }}
                >
                  {rule.backed ? "BACKED" : "UNGROUNDED"}
                </span>
                <span style={{ color: rule.backed ? CY : DIM, flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {rule.name}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    padding: "1px 4px",
                    borderRadius: 2,
                    background: `${severityColor(rule.severity)}22`,
                    color: severityColor(rule.severity),
                    border: `1px solid ${severityColor(rule.severity)}55`,
                    flexShrink: 0,
                  }}
                >
                  {rule.severity}
                </span>
                <span style={{ color: DIM }}>{expanded === rule.id ? "▲" : "▼"}</span>
              </div>

              {expanded === rule.id && (
                <div style={{ marginTop: 6, paddingLeft: 8 }}>
                  {rule.target && (
                    <div style={{ color: DIM, fontSize: 10, marginBottom: 4 }}>
                      Target: <span style={{ color: CY }}>{rule.target}</span>
                      {!rule.enabled && <span style={{ color: "#FF3B3B", marginLeft: 6 }}>[DISABLED]</span>}
                    </div>
                  )}
                  {rule.matches.length === 0 ? (
                    <div style={{ color: AMB, fontSize: 10 }}>No datasets correlated.</div>
                  ) : (
                    rule.matches.slice(0, 5).map((ds) => (
                      <div
                        key={ds.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 6,
                          marginBottom: 4,
                          paddingLeft: 4,
                          borderLeft: `2px solid ${GRN}55`,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 8,
                            padding: "1px 4px",
                            borderRadius: 2,
                            background: `${CY}22`,
                            color: CY,
                            border: `1px solid ${CY}44`,
                            flexShrink: 0,
                            marginTop: 1,
                          }}
                        >
                          {ds.kind}
                        </span>
                        <div style={{ flexGrow: 1 }}>
                          <div style={{ color: CY, fontSize: 10 }}>{ds.name}</div>
                          {ds.rows !== null && (
                            <div style={{ color: DIM, fontSize: 9 }}>{ds.rows.toLocaleString()} rows</div>
                          )}
                        </div>
                        <span style={{ color: DIM, fontSize: 9, flexShrink: 0 }}>{ds.hits}↑</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {/* assess */}
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            marginTop: 8,
            width: "100%",
            background: assessing ? "transparent" : `${GRN}22`,
            border: `1px solid ${GRN}`,
            color: GRN,
            borderRadius: 3,
            padding: "4px 0",
            cursor: assessing ? "not-allowed" : "pointer",
            fontSize: 10,
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>

        {brief && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              background: "rgba(0,229,160,0.06)",
              border: `1px solid ${GRN}44`,
              borderRadius: 4,
              color: GRN,
              fontSize: 10,
              lineHeight: 1.5,
            }}
          >
            {brief}
          </div>
        )}
      </div>
    </>
  );
}
