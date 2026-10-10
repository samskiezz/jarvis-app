/**
 * F38 — Investment × RiskSignal × IntelProfile Coverage (IRRIC)
 * Endpoints: /entities/Investment × /entities/RiskSignal × /entities/IntelProfile
 * Classification: FULLY_COVERED | RISK_ONLY | INTEL_ONLY | EXPOSED
 * Identifies investments that lack both risk-signal monitoring and intelligence backing.
 */
import { useEffect, useState, useRef } from "react";

const BTN_LEFT = 930_680;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  import.meta.env?.VITE_API_KEY ||
  "";

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

const IRRIC_RE =
  /\b(irric|investment\s*risk\s*intel|investment\s*coverage|investment\s*exposure|investment\s*blind\s*spot|portfolio\s*risk\s*intel|investment\s*intelligence|covered\s*investment|uncovered\s*investment|investment\s*risk\s*signal|investment\s*intel\s*profile|portfolio\s*coverage|portfolio\s*intelligence|portfolio\s*monitoring)\b/i;

export function isIrricQuery(t) {
  return IRRIC_RE.test(t || "");
}

// ── Normalisers ───────────────────────────────────────────────────────────────

function normaliseInvestment(raw) {
  if (!raw) return null;
  return {
    id:     raw.id || raw.investment_id || raw._id || String(Math.random()),
    title:  raw.name || raw.title || raw.label || raw.asset || raw.ticker || "Unnamed Investment",
    type:   raw.type || raw.category || raw.asset_class || raw.class || "",
    value:  raw.value || raw.amount || raw.nav || "",
    tags:   Array.isArray(raw.tags) ? raw.tags : [],
    extra:  raw,
  };
}

function normaliseRiskSignal(raw) {
  if (!raw) return null;
  return {
    id:       raw.id || raw.signal_id || raw._id || String(Math.random()),
    title:    raw.name || raw.title || raw.label || raw.description || "Unnamed Signal",
    severity: raw.severity || raw.level || raw.priority || "",
    type:     raw.type || raw.category || raw.signal_type || "",
    tags:     Array.isArray(raw.tags) ? raw.tags : [],
    extra:    raw,
  };
}

function normaliseIntelProfile(raw) {
  if (!raw) return null;
  return {
    id:         raw.id || raw.profile_id || raw._id || String(Math.random()),
    title:      raw.name || raw.title || raw.subject || raw.label || "Unnamed Profile",
    role:       raw.role || raw.type || raw.category || "",
    confidence: raw.confidence || raw.score || "",
    tags:       Array.isArray(raw.tags) ? raw.tags : [],
    extra:      raw,
  };
}

// ── Keyword scoring ───────────────────────────────────────────────────────────

function keywords(obj) {
  const txt = JSON.stringify(obj || "").toLowerCase();
  return txt.match(/[a-z]{4,}/g) || [];
}

function scoreMatch(aKw, bKw) {
  const setB = new Set(bKw);
  return aKw.filter((w) => w.length > 3 && setB.has(w)).length;
}

// ── Classification ─────────────────────────────────────────────────────────────

const CLASS_META = {
  FULLY_COVERED: {
    label: "FULLY COVERED",
    color: "#00ff88",
    desc:  "Investment matched to both RiskSignal AND IntelProfile",
  },
  RISK_ONLY: {
    label: "RISK ONLY",
    color: "#ff6600",
    desc:  "Investment matched to RiskSignal but no IntelProfile",
  },
  INTEL_ONLY: {
    label: "INTEL ONLY",
    color: "#ffaa00",
    desc:  "Investment matched to IntelProfile but no RiskSignal",
  },
  EXPOSED: {
    label: "EXPOSED",
    color: "#ff3333",
    desc:  "Investment with no RiskSignal or IntelProfile — flying blind",
  },
};

function buildMatrix(investments, risks, profiles) {
  return investments.map((inv) => {
    const iKw = keywords(inv);

    let bestRisk      = null;
    let bestRiskScore = 0;
    for (const r of risks) {
      const s = scoreMatch(iKw, keywords(r));
      if (s > bestRiskScore) { bestRiskScore = s; bestRisk = r; }
    }

    let bestProfile      = null;
    let bestProfileScore = 0;
    for (const p of profiles) {
      const s = scoreMatch(iKw, keywords(p));
      if (s > bestProfileScore) { bestProfileScore = s; bestProfile = p; }
    }

    const hasRisk    = bestRisk    && bestRiskScore    > 0;
    const hasProfile = bestProfile && bestProfileScore > 0;

    const cls =
      hasRisk && hasProfile ? "FULLY_COVERED"
      : hasRisk             ? "RISK_ONLY"
      : hasProfile          ? "INTEL_ONLY"
                            : "EXPOSED";

    return { inv, risk: hasRisk ? bestRisk : null, riskScore: bestRiskScore,
             profile: hasProfile ? bestProfile : null, profileScore: bestProfileScore, cls };
  });
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const base = apiBase();
  const hdr  = { Authorization: `Bearer ${API_KEY}` };

  const [iRaw, rRaw, pRaw] = await Promise.all([
    fetch(`${base}/entities/Investment`,   { headers: hdr }).then((r) => r.ok ? r.json() : []),
    fetch(`${base}/entities/RiskSignal`,   { headers: hdr }).then((r) => r.ok ? r.json() : []),
    fetch(`${base}/entities/IntelProfile`, { headers: hdr }).then((r) => r.ok ? r.json() : []),
  ]);

  const investments = (Array.isArray(iRaw) ? iRaw : iRaw?.data ?? iRaw?.investments ?? [])
    .map(normaliseInvestment).filter(Boolean);
  const risks = (Array.isArray(rRaw) ? rRaw : rRaw?.data ?? rRaw?.signals ?? rRaw?.risks ?? [])
    .map(normaliseRiskSignal).filter(Boolean);
  const profiles = (Array.isArray(pRaw) ? pRaw : pRaw?.data ?? pRaw?.profiles ?? [])
    .map(normaliseIntelProfile).filter(Boolean);

  return { investments, risks, profiles };
}

export async function buildIrricScript() {
  try {
    const { investments, risks, profiles } = await fetchAll();
    const rows   = buildMatrix(investments, risks, profiles);
    const counts = {
      FULLY_COVERED: rows.filter((r) => r.cls === "FULLY_COVERED").length,
      RISK_ONLY:     rows.filter((r) => r.cls === "RISK_ONLY").length,
      INTEL_ONLY:    rows.filter((r) => r.cls === "INTEL_ONLY").length,
      EXPOSED:       rows.filter((r) => r.cls === "EXPOSED").length,
    };
    return (
      `Investment Risk-Intel Coverage: ${investments.length} investments cross-referenced against ` +
      `${risks.length} risk signals and ${profiles.length} intel profiles. ` +
      `Fully covered (risk + intel): ${counts.FULLY_COVERED}. ` +
      `Risk signal only: ${counts.RISK_ONLY}. ` +
      `Intel profile only: ${counts.INTEL_ONLY}. ` +
      `Exposed (no coverage): ${counts.EXPOSED} — portfolio blind spots requiring immediate attention.`
    );
  } catch (e) {
    return `Investment Risk-Intel Coverage unavailable: ${e.message}`;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InvestmentRiskIntelCoverage() {
  const [open,     setOpen]     = useState(false);
  const [rows,     setRows]     = useState([]);
  const [counts,   setCounts]   = useState({ FULLY_COVERED: 0, RISK_ONLY: 0, INTEL_ONLY: 0, EXPOSED: 0 });
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState(null);
  const [filter,   setFilter]   = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    function handler(e) {
      setOpen((v) => (e.detail?.force !== undefined ? e.detail.force : !v));
    }
    window.addEventListener("jarvis:irric-toggle", handler);
    return () => window.removeEventListener("jarvis:irric-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(intervalRef.current); return; }
    async function load() {
      setLoading(true); setErr(null);
      try {
        const { investments, risks, profiles } = await fetchAll();
        const matrix = buildMatrix(investments, risks, profiles);
        setRows(matrix);
        setCounts({
          FULLY_COVERED: matrix.filter((r) => r.cls === "FULLY_COVERED").length,
          RISK_ONLY:     matrix.filter((r) => r.cls === "RISK_ONLY").length,
          INTEL_ONLY:    matrix.filter((r) => r.cls === "INTEL_ONLY").length,
          EXPOSED:       matrix.filter((r) => r.cls === "EXPOSED").length,
        });
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
    intervalRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(intervalRef.current);
  }, [open]);

  const visible = rows.filter((r) => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.inv.title.toLowerCase().includes(q) ||
        r.inv.type.toLowerCase().includes(q) ||
        (r.risk?.title    || "").toLowerCase().includes(q) ||
        (r.profile?.title || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const exposedBadge = counts.EXPOSED;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position:   "fixed",
          bottom:     8,
          left:       BTN_LEFT,
          zIndex:     626,
          fontFamily: "monospace",
          fontSize:   10,
          padding:    "2px 7px",
          background: open ? "#0f0808" : "#0a0a0a",
          color:      open ? "#ff6600" : "#555",
          border:     `1px solid ${open ? "#ff6600" : "#333"}`,
          borderRadius: 3,
          cursor:     "pointer",
          whiteSpace: "nowrap",
          animation:  exposedBadge > 0 ? "jarvisPulse 2s infinite" : "none",
        }}
        title="Investment × RiskSignal × IntelProfile Coverage"
      >
        IRRIC{exposedBadge > 0 ? ` [${exposedBadge}]` : ""}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position:    "fixed",
            bottom:      36,
            left:        BTN_LEFT - 200,
            width:       920,
            maxHeight:   580,
            zIndex:      626,
            background:  "#0f0808",
            border:      "1px solid #ff6600",
            borderRadius: 6,
            fontFamily:  "monospace",
            fontSize:    11,
            color:       "#ccc",
            display:     "flex",
            flexDirection: "column",
            overflow:    "hidden",
            boxShadow:   "0 0 24px #ff660044",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding:      "6px 12px",
              borderBottom: "1px solid #ff660044",
              display:      "flex",
              alignItems:   "center",
              gap:          8,
              flexShrink:   0,
            }}
          >
            <span style={{ color: "#ff6600", fontWeight: "bold", fontSize: 12 }}>IRRIC</span>
            <span style={{ color: "#555", fontSize: 10 }}>
              Investment × RiskSignal × IntelProfile Coverage
            </span>
            {loading && (
              <span style={{ color: "#ff6600", marginLeft: "auto", fontSize: 10 }}>LOADING…</span>
            )}
            {err && (
              <span style={{ color: "#f55", marginLeft: "auto", fontSize: 10 }}>ERR: {err}</span>
            )}
            <button
              onClick={() => setOpen(false)}
              style={{ marginLeft: "auto", background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display:      "flex",
              gap:          6,
              padding:      "6px 12px",
              flexShrink:   0,
              borderBottom: "1px solid #ff660022",
            }}
          >
            {Object.entries(CLASS_META).map(([k, meta]) => (
              <div
                key={k}
                onClick={() => setFilter(filter === k ? "ALL" : k)}
                style={{
                  flex:         1,
                  background:   filter === k ? "#1a0d08" : "#111",
                  border:       `1px solid ${filter === k ? meta.color : "#333"}`,
                  borderRadius: 4,
                  padding:      "4px 6px",
                  cursor:       "pointer",
                  textAlign:    "center",
                }}
              >
                <div style={{ color: meta.color, fontSize: 16, fontWeight: "bold" }}>{counts[k]}</div>
                <div style={{ color: "#666", fontSize: 9 }}>{meta.label}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div
            style={{
              padding:      "4px 12px",
              flexShrink:   0,
              display:      "flex",
              gap:          8,
              alignItems:   "center",
              borderBottom: "1px solid #ff660022",
            }}
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search investments / risk signals / intel profiles…"
              style={{
                flex:       1,
                background: "#111",
                border:     "1px solid #333",
                borderRadius: 3,
                color:      "#ccc",
                fontFamily: "monospace",
                fontSize:   10,
                padding:    "2px 6px",
              }}
            />
            <span style={{ color: "#555", fontSize: 10 }}>{visible.length}/{rows.length}</span>
          </div>

          {/* Rows */}
          <div style={{ overflow: "auto", flex: 1 }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: 16, color: "#444", textAlign: "center" }}>
                {err ? "Error loading data." : "No investments match."}
              </div>
            )}
            {visible.map((row, i) => {
              const meta       = CLASS_META[row.cls];
              const isExpanded = expanded === (row.inv.id + i);
              return (
                <div key={row.inv.id + i} style={{ borderBottom: "1px solid #1a0d08" }}>
                  {/* Row summary */}
                  <div
                    onClick={() => setExpanded(isExpanded ? null : row.inv.id + i)}
                    style={{
                      padding:             "5px 12px",
                      display:             "grid",
                      gridTemplateColumns: "120px 1fr 1fr 1fr",
                      gap:                 6,
                      alignItems:          "start",
                      cursor:              "pointer",
                    }}
                  >
                    {/* Badge */}
                    <div>
                      <span
                        style={{
                          display:      "inline-block",
                          padding:      "1px 4px",
                          borderRadius: 2,
                          background:   "#0f0808",
                          border:       `1px solid ${meta.color}`,
                          color:        meta.color,
                          fontSize:     9,
                          whiteSpace:   "nowrap",
                        }}
                      >
                        {meta.label}
                      </span>
                      {row.inv.type && (
                        <div style={{ color: "#555", fontSize: 9, marginTop: 2 }}>{row.inv.type}</div>
                      )}
                    </div>

                    {/* Investment */}
                    <div>
                      <div style={{ color: "#ff9933", fontSize: 10, fontWeight: "bold" }}>
                        {row.inv.title}
                      </div>
                      {row.inv.value && (
                        <div style={{ color: "#555", fontSize: 9 }}>{row.inv.value}</div>
                      )}
                    </div>

                    {/* Risk signal */}
                    <div>
                      {row.risk ? (
                        <>
                          <div style={{ color: "#ff3333", fontSize: 10 }}>{row.risk.title}</div>
                          <div style={{ color: "#555", fontSize: 9 }}>
                            risk · sev {row.risk.severity || "?"} · score {row.riskScore}
                          </div>
                        </>
                      ) : (
                        <div style={{ color: "#333", fontSize: 10 }}>— no risk signal</div>
                      )}
                    </div>

                    {/* Intel profile */}
                    <div>
                      {row.profile ? (
                        <>
                          <div style={{ color: "#ffaa00", fontSize: 10 }}>{row.profile.title}</div>
                          <div style={{ color: "#555", fontSize: 9 }}>
                            intel · score {row.profileScore}
                          </div>
                        </>
                      ) : (
                        <div style={{ color: "#333", fontSize: 10 }}>— no intel profile</div>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div
                      style={{
                        padding:    "6px 12px 8px",
                        background: "#150c08",
                        display:    "flex",
                        gap:        12,
                      }}
                    >
                      {/* Risk bar */}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#ff3333", fontSize: 9, marginBottom: 3 }}>RISK SIGNAL</div>
                        {row.risk ? (
                          <>
                            <div style={{ height: 6, borderRadius: 2, background: "#1a0808", overflow: "hidden", marginBottom: 3 }}>
                              <div style={{ width: `${Math.min(100, row.riskScore * 10)}%`, height: "100%", background: "#ff3333" }} />
                            </div>
                            <div style={{ color: "#777", fontSize: 9 }}>
                              {row.risk.title}
                              {row.risk.severity ? ` · sev ${row.risk.severity}` : ""}
                              {row.risk.type     ? ` · ${row.risk.type}` : ""}
                            </div>
                          </>
                        ) : (
                          <div style={{ color: "#333", fontSize: 9 }}>no matching risk signal</div>
                        )}
                      </div>

                      {/* Intel profile bar */}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#ffaa00", fontSize: 9, marginBottom: 3 }}>INTEL PROFILE</div>
                        {row.profile ? (
                          <>
                            <div style={{ height: 6, borderRadius: 2, background: "#1a1200", overflow: "hidden", marginBottom: 3 }}>
                              <div style={{ width: `${Math.min(100, row.profileScore * 10)}%`, height: "100%", background: "#ffaa00" }} />
                            </div>
                            <div style={{ color: "#777", fontSize: 9 }}>
                              {row.profile.title}
                              {row.profile.role       ? ` · ${row.profile.role}` : ""}
                              {row.profile.confidence ? ` · conf ${row.profile.confidence}` : ""}
                            </div>
                          </>
                        ) : (
                          <div style={{ color: "#333", fontSize: 9 }}>no matching intel profile</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer / ASSESS */}
          <div
            style={{
              padding:        "4px 12px",
              borderTop:      "1px solid #ff660022",
              color:          "#444",
              fontSize:       9,
              flexShrink:     0,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
            }}
          >
            <span>/entities/Investment × /entities/RiskSignal × /entities/IntelProfile · poll {POLL_MS / 1000}s</span>
            <button
              onClick={async () => {
                try {
                  const script = await buildIrricScript();
                  const base   = apiBase();
                  const resp   = await fetch(`${base}/v1/jarvis/agent/chat`, {
                    method:  "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
                    body:    JSON.stringify({ message: script }),
                  });
                  if (resp.ok) {
                    const data = await resp.json();
                    const text =
                      data.response || data.message || data.content ||
                      (typeof data === "string" ? data : JSON.stringify(data));
                    window.dispatchEvent(new CustomEvent("jarvis:speak", { detail: { text } }));
                  }
                } catch (_) {}
              }}
              style={{
                background:   "#1a0d08",
                border:       "1px solid #ff6600",
                color:        "#ff6600",
                fontFamily:   "monospace",
                fontSize:     9,
                padding:      "2px 8px",
                borderRadius: 2,
                cursor:       "pointer",
              }}
            >
              ▶ ASSESS
            </button>
          </div>
        </div>
      )}
    </>
  );
}
