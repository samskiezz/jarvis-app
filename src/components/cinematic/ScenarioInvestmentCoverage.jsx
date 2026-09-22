/**
 * ScenarioInvestmentCoverage — F542 (SCNINV)
 * "JARVIS, scenario investment / investment scenario / scninv / which investments have scenarios
 *  / investment planning / portfolio scenario coverage / investment simulation"
 * Cross-references /v1/scenario/list + /entities/Investment.
 * Finds MAPPED investments (≥1 scenario keyword-matches) vs UNMODELED (no scenario backing).
 * Coverage % tile; ALL/MAPPED/UNMODELED filter tabs + search; click-to-expand matched scenarios.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence investment-scenario readiness brief + TTS.
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

const POLL_MS  = 90_000;
const BTN_LEFT = 46_180;
const Z_INDEX  = 112;

const SCNINV_RE =
  /\bscninv\b|\bscenario.?investment[s]?\b|\binvestment.?scenario[s]?\b|\bportfolio.?scenario.?coverage\b|\bwhich.?investment[s]?.?have.?scenario[s]?\b|\binvestment.?planning.?scenario\b|\binvestment.?simulation\b|\bportfolio.?sim\b|\bscenario.?portfolio\b|\bportfolio.?planning\b/i;

export function isScninvQuery(text) {
  return SCNINV_RE.test(text || "");
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

function normaliseInvestments(data) {
  if (!data) return [];
  const raw =
    data.investments || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((inv, i) => ({
    id:     inv.id || `inv-${i}`,
    name:   inv.name || inv.title || inv.ticker || `Investment ${i + 1}`,
    sector: (inv.sector || inv.category || inv.asset_class || "").toUpperCase(),
    value:  typeof inv.value === "number" ? inv.value : (typeof inv.total_value === "number" ? inv.total_value : null),
    tags:   Array.isArray(inv.tags) ? inv.tags.join(" ") : String(inv.tags || ""),
    notes:  inv.notes || inv.description || "",
  }));
}

function normaliseScenarios(data) {
  if (!data) return [];
  const raw =
    data.scenarios || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:   s.id || `scn-${i}`,
    name: s.name || s.title || `Scenario ${i + 1}`,
    kind: (s.kind || s.type || s.category || "SCENARIO").toUpperCase(),
    tags: Array.isArray(s.tags) ? s.tags.join(" ") : String(s.tags || ""),
    description: s.description || s.summary || s.prompt || "",
  }));
}

function crossRef(investments, scenarios) {
  return investments.map((inv) => {
    const haystack = `${inv.name} ${inv.sector} ${inv.tags} ${inv.notes}`;
    const matches = scenarios
      .map((s) => ({
        ...s,
        hits: overlap(haystack, `${s.name} ${s.kind} ${s.tags} ${s.description}`),
      }))
      .filter((s) => s.hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return { ...inv, mapped: matches.length > 0, matches };
  });
}

const kindColor = (kind) => {
  const map = { RISK: "#FF3B3B", FINANCIAL: GRN, MARKET: AMB, GEOPOLITICAL: "#A855F7", DEFAULT: CY };
  for (const [k, v] of Object.entries(map)) if (kind.includes(k)) return v;
  return map.DEFAULT;
};

// ─── exported script (JarvisBrain voice call) ────────────────────────────────

export async function buildScninvScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [invRes, scnRes] = await Promise.all([
      fetch(`${base}/entities/Investment`, { headers }),
      fetch(`${base}/v1/scenario/list`, { headers }),
    ]);
    const [invData, scnData] = await Promise.all([invRes.json(), scnRes.json()]);
    const investments = normaliseInvestments(invData);
    const scenarios   = normaliseScenarios(scnData);
    const crossed     = crossRef(investments, scenarios);
    const mapped      = crossed.filter((i) => i.mapped);
    const unmodeled   = crossed.filter((i) => !i.mapped);
    const coverage    = investments.length > 0
      ? Math.round((mapped.length / investments.length) * 100)
      : 0;
    return `Scenario-investment coverage: ${mapped.length} of ${investments.length} portfolio holdings have at least one scenario model (${coverage}% coverage). ${unmodeled.length} investment${unmodeled.length !== 1 ? "s" : ""} remain unmodeled${unmodeled.length > 0 ? `, including ${unmodeled.slice(0, 2).map((i) => i.name).join(" and ")}` : ""}.`;
  } catch (err) {
    return `Scenario-investment coverage fetch failed: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function ScenarioInvestmentCoverage() {
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [crossed,  setCrossed]  = useState([]);
  const [tab,      setTab]      = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing,setAssessing]= useState(false);
  const [brief,    setBrief]    = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base    = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [invRes, scnRes] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers }),
        fetch(`${base}/v1/scenario/list`,   { headers }),
      ]);
      const [invData, scnData] = await Promise.all([invRes.json(), scnRes.json()]);
      const investments = normaliseInvestments(invData);
      const scenarios   = normaliseScenarios(scnData);
      setCrossed(crossRef(investments, scenarios));
    } catch {
      // silent — stale data stays visible
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [load]);

  useEffect(() => {
    const handler = () => { setOpen((p) => !p); load(); };
    window.addEventListener("jarvis:scninv-toggle", handler);
    return () => window.removeEventListener("jarvis:scninv-toggle", handler);
  }, [load]);

  const mapped    = crossed.filter((i) => i.mapped);
  const unmodeled = crossed.filter((i) => !i.mapped);
  const coverage  = crossed.length > 0 ? Math.round((mapped.length / crossed.length) * 100) : 0;

  const visible = crossed
    .filter((i) => tab === "ALL" || (tab === "MAPPED" ? i.mapped : !i.mapped))
    .filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.sector.toLowerCase().includes(search.toLowerCase()));

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    setBrief("");
    try {
      const base   = apiBase();
      const prompt = `Investment scenario coverage: ${mapped.length}/${crossed.length} holdings mapped (${coverage}%). Unmodeled: ${unmodeled.slice(0, 3).map((i) => i.name).join(", ")}. Provide a 2-sentence investment-scenario readiness assessment.`;
      const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const text = data.response || data.message || data.content || "";
      setBrief(text);
      if (text) {
        await fetch(`${base}/v1/voice/tts`, {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body:    JSON.stringify({ text }),
        });
      }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [assessing, mapped, unmodeled, crossed.length, coverage]);

  const btnStyle = {
    position:   "fixed",
    bottom:     8,
    left:       BTN_LEFT,
    zIndex:     Z_INDEX,
    background: "rgba(0,10,25,0.85)",
    border:     `1px solid ${unmodeled.length > 0 ? AMB : CY}`,
    color:      unmodeled.length > 0 ? AMB : CY,
    borderRadius: 3,
    padding:    "2px 7px",
    fontSize:   9,
    fontFamily: "monospace",
    cursor:     "pointer",
    whiteSpace: "nowrap",
  };

  if (!open) {
    return (
      <button
        style={btnStyle}
        onClick={() => setOpen(true)}
        title="Scenario × Investment Coverage (SCNINV)"
      >
        ◈ SCNINV{unmodeled.length > 0 && (
          <span style={{ color: AMB, marginLeft: 4 }}>{unmodeled.length}</span>
        )}
      </button>
    );
  }

  const panel = {
    position:   "fixed",
    bottom:     36,
    left:       Math.min(BTN_LEFT, window.innerWidth - 480),
    width:      460,
    maxHeight:  "75vh",
    overflowY:  "auto",
    zIndex:     Z_INDEX + 1,
    background: "rgba(0,10,25,0.97)",
    border:     `1px solid ${CY}`,
    borderRadius: 6,
    fontFamily: "monospace",
    fontSize:   11,
    color:      CY,
    padding:    14,
    boxShadow:  `0 0 24px ${CY}44`,
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(false)}>
        ◈ SCNINV ✕
      </button>

      <div style={panel}>
        <div style={{ fontSize: 13, fontWeight: "bold", marginBottom: 10 }}>
          ◈ SCENARIO × INVESTMENT COVERAGE
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[
            ["HOLDINGS",  crossed.length,    CY],
            ["MAPPED",    mapped.length,     GRN],
            ["UNMODELED", unmodeled.length,  AMB],
            ["COVERAGE",  `${coverage}%`,    coverage > 50 ? GRN : AMB],
          ].map(([label, val, col]) => (
            <div
              key={label}
              style={{
                flex:       1,
                background: "rgba(255,255,255,0.04)",
                border:     `1px solid ${col}55`,
                borderRadius: 4,
                padding:    "4px 6px",
                textAlign:  "center",
              }}
            >
              <div style={{ color: col, fontSize: 14, fontWeight: "bold" }}>{val}</div>
              <div style={{ color: DIM, fontSize: 9 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {["ALL", "MAPPED", "UNMODELED"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? CY : "transparent",
                color:      tab === t ? "#000" : DIM,
                border:     `1px solid ${tab === t ? CY : DIM}`,
                borderRadius: 3,
                padding:    "2px 8px",
                fontSize:   10,
                cursor:     "pointer",
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
          placeholder="search investments…"
          style={{
            width:      "100%",
            background: "rgba(255,255,255,0.05)",
            border:     `1px solid ${DIM}`,
            borderRadius: 3,
            color:      CY,
            padding:    "3px 6px",
            fontSize:   10,
            marginBottom: 8,
            boxSizing:  "border-box",
          }}
        />

        {/* list */}
        {loading && !crossed.length ? (
          <div style={{ color: DIM, textAlign: "center", padding: 20 }}>FETCHING…</div>
        ) : visible.length === 0 ? (
          <div style={{ color: DIM, padding: 12 }}>No investments match.</div>
        ) : (
          visible.map((inv) => (
            <div
              key={inv.id}
              style={{
                borderBottom: "1px solid rgba(41,231,255,0.1)",
                paddingBottom: 8,
                marginBottom:  8,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
              >
                <span
                  style={{
                    fontSize:   9,
                    padding:    "1px 5px",
                    borderRadius: 3,
                    background: inv.mapped ? `${GRN}22` : `${AMB}22`,
                    color:      inv.mapped ? GRN : AMB,
                    border:     `1px solid ${inv.mapped ? GRN : AMB}55`,
                    flexShrink: 0,
                  }}
                >
                  {inv.mapped ? "MAPPED" : "UNMODELED"}
                </span>
                <span style={{ color: inv.mapped ? CY : DIM, flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {inv.name}
                </span>
                {inv.sector && (
                  <span style={{ color: DIM, fontSize: 9, flexShrink: 0 }}>{inv.sector}</span>
                )}
                <span style={{ color: DIM }}>{expanded === inv.id ? "▲" : "▼"}</span>
              </div>

              {expanded === inv.id && (
                <div style={{ marginTop: 6, paddingLeft: 8 }}>
                  {inv.value !== null && (
                    <div style={{ color: DIM, fontSize: 10, marginBottom: 4 }}>
                      Value: <span style={{ color: CY }}>${Number(inv.value).toLocaleString()}</span>
                    </div>
                  )}
                  {inv.matches.length === 0 ? (
                    <div style={{ color: AMB, fontSize: 10 }}>No scenarios correlated.</div>
                  ) : (
                    inv.matches.slice(0, 5).map((s) => (
                      <div
                        key={s.id}
                        style={{
                          display:     "flex",
                          alignItems:  "flex-start",
                          gap:         6,
                          marginBottom: 4,
                          paddingLeft:  4,
                          borderLeft:  `2px solid ${GRN}55`,
                        }}
                      >
                        <span
                          style={{
                            fontSize:   8,
                            padding:    "1px 4px",
                            borderRadius: 2,
                            background: `${kindColor(s.kind)}22`,
                            color:      kindColor(s.kind),
                            border:     `1px solid ${kindColor(s.kind)}44`,
                            flexShrink: 0,
                            marginTop:  1,
                          }}
                        >
                          {s.kind}
                        </span>
                        <div style={{ flexGrow: 1 }}>
                          <div style={{ color: CY, fontSize: 10 }}>{s.name}</div>
                        </div>
                        <span style={{ color: DIM, fontSize: 9, flexShrink: 0 }}>{s.hits}↑</span>
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
            marginTop:  8,
            width:      "100%",
            background: assessing ? "transparent" : `${GRN}22`,
            border:     `1px solid ${GRN}`,
            color:      GRN,
            borderRadius: 3,
            padding:    "4px 0",
            cursor:     assessing ? "not-allowed" : "pointer",
            fontSize:   10,
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>

        {brief && (
          <div
            style={{
              marginTop:  8,
              padding:    8,
              background: "rgba(0,229,160,0.06)",
              border:     `1px solid ${GRN}44`,
              borderRadius: 4,
              color:      GRN,
              fontSize:   10,
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
