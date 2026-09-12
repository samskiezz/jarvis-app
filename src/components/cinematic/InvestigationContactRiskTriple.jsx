/**
 * F764 — Investigation × Contact × RiskSignal Triple Nexus (ICRSTRI)
 * Endpoints: /v1/investigations × /entities/Contact × /entities/RiskSignal
 * Classification: FULLY_COVERED | CONTACT_ONLY | RISK_ONLY | DARK
 */
import { useEffect, useState, useRef } from "react";

const BTN_LEFT = 926_380;
const POLL_MS = 90_000;

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

const ICRSTRI_RE =
  /\b(icrstri|investigation\s*contact\s*risk|investigation\s*coverage|covered\s*investigations?|dark\s*investigations?|investigation\s*risk\s*signal|contact\s*risk\s*investigation|risk\s*investigation\s*coverage)\b/i;

export function isIcrstriQuery(t) {
  return ICRSTRI_RE.test(t || "");
}


// ── Normalisers ───────────────────────────────────────────────────────────────

function normaliseInvestigation(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.investigation_id || raw._id || String(Math.random()),
    title: raw.title || raw.name || raw.subject || raw.summary || "Untitled Investigation",
    status: raw.status || raw.state || "open",
    priority: raw.priority || raw.severity || "normal",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
}

function normaliseContact(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.contact_id || raw._id || String(Math.random()),
    title: raw.name || raw.title || raw.full_name || raw.display_name || "Unnamed Contact",
    role: raw.role || raw.type || raw.category || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
}

function normaliseRisk(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.risk_id || raw._id || String(Math.random()),
    title: raw.title || raw.name || raw.signal || "Untitled Risk",
    severity: raw.severity || raw.level || "medium",
    category: raw.category || raw.type || raw.class || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
}

// ── Keyword extraction ────────────────────────────────────────────────────────

function keywords(obj) {
  const txt = JSON.stringify(obj || "").toLowerCase();
  return txt.match(/[a-z]{4,}/g) || [];
}

function scoreMatch(aKw, bKw) {
  const setB = new Set(bKw);
  return aKw.filter((w) => w.length > 3 && setB.has(w)).length;
}

// ── Nexus builder ─────────────────────────────────────────────────────────────

const CLASS_META = {
  FULLY_COVERED: {
    label: "FULLY COVERED",
    color: "#00ff88",
    desc: "Investigation matched to both a Contact and a RiskSignal",
  },
  CONTACT_ONLY: {
    label: "CONTACT ONLY",
    color: "#00cfff",
    desc: "Investigation matched to a Contact but no RiskSignal",
  },
  RISK_ONLY: {
    label: "RISK ONLY",
    color: "#ffaa00",
    desc: "Investigation matched to a RiskSignal but no Contact",
  },
  DARK: {
    label: "DARK",
    color: "#666",
    desc: "Investigation with no matching Contact or RiskSignal",
  },
};

function buildNexus(investigations, contacts, risks) {
  return investigations.map((inv) => {
    const iKw = keywords(inv);
    let bestContact = null;
    let bestContactScore = 0;
    for (const c of contacts) {
      const s = scoreMatch(iKw, keywords(c));
      if (s > bestContactScore) {
        bestContactScore = s;
        bestContact = c;
      }
    }
    let bestRisk = null;
    let bestRiskScore = 0;
    for (const r of risks) {
      const s = scoreMatch(iKw, keywords(r));
      if (s > bestRiskScore) {
        bestRiskScore = s;
        bestRisk = r;
      }
    }
    const hasContact = bestContact && bestContactScore > 0;
    const hasRisk = bestRisk && bestRiskScore > 0;
    const cls =
      hasContact && hasRisk
        ? "FULLY_COVERED"
        : hasContact
        ? "CONTACT_ONLY"
        : hasRisk
        ? "RISK_ONLY"
        : "DARK";
    return {
      inv,
      contact: hasContact ? bestContact : null,
      contactScore: bestContactScore,
      risk: hasRisk ? bestRisk : null,
      riskScore: bestRiskScore,
      cls,
    };
  });
}

// ── Fetch all three endpoints ─────────────────────────────────────────────────

async function fetchAll() {
  const base = apiBase();
  const hdr = { Authorization: `Bearer ${API_KEY}` };

  const [iRaw, cRaw, rRaw] = await Promise.all([
    fetch(`${base}/v1/investigations`, { headers: hdr }).then((r) =>
      r.ok ? r.json() : []
    ),
    fetch(`${base}/entities/Contact`, { headers: hdr }).then((r) =>
      r.ok ? r.json() : []
    ),
    fetch(`${base}/entities/RiskSignal`, { headers: hdr }).then((r) =>
      r.ok ? r.json() : []
    ),
  ]);

  const investigations = (
    Array.isArray(iRaw) ? iRaw : iRaw?.data ?? iRaw?.investigations ?? []
  )
    .map(normaliseInvestigation)
    .filter(Boolean);
  const contacts = (
    Array.isArray(cRaw) ? cRaw : cRaw?.data ?? cRaw?.contacts ?? []
  )
    .map(normaliseContact)
    .filter(Boolean);
  const risks = (
    Array.isArray(rRaw) ? rRaw : rRaw?.data ?? rRaw?.risks ?? []
  )
    .map(normaliseRisk)
    .filter(Boolean);

  return { investigations, contacts, risks };
}

export async function buildIcrstriScript() {
  try {
    const { investigations, contacts, risks } = await fetchAll();
    const rows = buildNexus(investigations, contacts, risks);
    const counts = {
      FULLY_COVERED: rows.filter((r) => r.cls === "FULLY_COVERED").length,
      CONTACT_ONLY: rows.filter((r) => r.cls === "CONTACT_ONLY").length,
      RISK_ONLY: rows.filter((r) => r.cls === "RISK_ONLY").length,
      DARK: rows.filter((r) => r.cls === "DARK").length,
    };
    return (
      `Investigation Contact Risk Nexus: ${investigations.length} investigations cross-referenced against ` +
      `${contacts.length} contacts and ${risks.length} risk signals. ` +
      `Fully covered: ${counts.FULLY_COVERED}. ` +
      `Contact only: ${counts.CONTACT_ONLY}. ` +
      `Risk only: ${counts.RISK_ONLY}. ` +
      `Dark (unmatched): ${counts.DARK}.`
    );
  } catch (e) {
    return `Investigation Contact Risk Nexus unavailable: ${e.message}`;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InvestigationContactRiskTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({
    FULLY_COVERED: 0,
    CONTACT_ONLY: 0,
    RISK_ONLY: 0,
    DARK: 0,
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const intervalRef = useRef(null);

  useEffect(() => {
    function handler(e) {
      setOpen((v) => (e.detail?.force !== undefined ? e.detail.force : !v));
    }
    window.addEventListener("jarvis:icrstri-toggle", handler);
    return () => window.removeEventListener("jarvis:icrstri-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) {
      clearInterval(intervalRef.current);
      return;
    }
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const { investigations, contacts, risks } = await fetchAll();
        const nexus = buildNexus(investigations, contacts, risks);
        setRows(nexus);
        setCounts({
          FULLY_COVERED: nexus.filter((r) => r.cls === "FULLY_COVERED").length,
          CONTACT_ONLY: nexus.filter((r) => r.cls === "CONTACT_ONLY").length,
          RISK_ONLY: nexus.filter((r) => r.cls === "RISK_ONLY").length,
          DARK: nexus.filter((r) => r.cls === "DARK").length,
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
        (r.contact?.title || "").toLowerCase().includes(q) ||
        (r.risk?.title || "").toLowerCase().includes(q) ||
        r.inv.status.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const darkBadge = counts.DARK;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 621,
          fontFamily: "monospace",
          fontSize: 10,
          padding: "2px 7px",
          background: open ? "#0a0015" : "#0a0a0a",
          color: open ? "#cc88ff" : "#555",
          border: `1px solid ${open ? "#cc88ff" : "#333"}`,
          borderRadius: 3,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
        title="Investigation × Contact × RiskSignal Nexus"
      >
        ICRSTRI{darkBadge > 0 ? ` [${darkBadge}]` : ""}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 36,
            left: BTN_LEFT - 200,
            width: 860,
            maxHeight: 560,
            zIndex: 621,
            background: "#08000f",
            border: "1px solid #cc88ff",
            borderRadius: 6,
            fontFamily: "monospace",
            fontSize: 11,
            color: "#ccc",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 0 24px #cc88ff44",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "6px 12px",
              borderBottom: "1px solid #cc88ff44",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span style={{ color: "#cc88ff", fontWeight: "bold", fontSize: 12 }}>
              ICRSTRI
            </span>
            <span style={{ color: "#555", fontSize: 10 }}>
              Investigation × Contact × RiskSignal
            </span>
            {loading && (
              <span style={{ color: "#cc88ff", marginLeft: "auto", fontSize: 10 }}>
                LOADING…
              </span>
            )}
            {err && (
              <span style={{ color: "#f55", marginLeft: "auto", fontSize: 10 }}>
                ERR: {err}
              </span>
            )}
            <button
              onClick={() => setOpen(false)}
              style={{
                marginLeft: "auto",
                background: "none",
                border: "none",
                color: "#666",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "6px 12px",
              flexShrink: 0,
              borderBottom: "1px solid #cc88ff22",
            }}
          >
            {Object.entries(CLASS_META).map(([k, meta]) => (
              <div
                key={k}
                onClick={() => setFilter(filter === k ? "ALL" : k)}
                style={{
                  flex: 1,
                  background: filter === k ? "#110020" : "#111",
                  border: `1px solid ${filter === k ? meta.color : "#333"}`,
                  borderRadius: 4,
                  padding: "4px 6px",
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                <div style={{ color: meta.color, fontSize: 16, fontWeight: "bold" }}>
                  {counts[k]}
                </div>
                <div style={{ color: "#666", fontSize: 9 }}>{meta.label}</div>
              </div>
            ))}
          </div>

          {/* Search + filter */}
          <div
            style={{
              padding: "4px 12px",
              flexShrink: 0,
              display: "flex",
              gap: 8,
              alignItems: "center",
              borderBottom: "1px solid #cc88ff22",
            }}
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search investigations / contacts / risks…"
              style={{
                flex: 1,
                background: "#111",
                border: "1px solid #333",
                borderRadius: 3,
                color: "#ccc",
                fontFamily: "monospace",
                fontSize: 10,
                padding: "2px 6px",
              }}
            />
            <span style={{ color: "#555", fontSize: 10 }}>
              {visible.length}/{rows.length}
            </span>
          </div>

          {/* Rows */}
          <div style={{ overflow: "auto", flex: 1 }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: 16, color: "#444", textAlign: "center" }}>
                {err ? "Error loading data." : "No investigations match."}
              </div>
            )}
            {visible.map((row, i) => {
              const meta = CLASS_META[row.cls];
              return (
                <div
                  key={row.inv.id + i}
                  style={{
                    padding: "5px 12px",
                    borderBottom: "1px solid #110020",
                    display: "grid",
                    gridTemplateColumns: "90px 1fr 1fr 1fr",
                    gap: 6,
                    alignItems: "start",
                  }}
                >
                  <div>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "1px 4px",
                        borderRadius: 2,
                        background: "#110020",
                        border: `1px solid ${meta.color}`,
                        color: meta.color,
                        fontSize: 9,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {meta.label}
                    </span>
                    <div style={{ color: "#555", fontSize: 9, marginTop: 2 }}>
                      {row.inv.status}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "#cc88ff", fontSize: 10, fontWeight: "bold" }}>
                      {row.inv.title}
                    </div>
                    <div style={{ color: "#555", fontSize: 9 }}>
                      {row.inv.priority}
                    </div>
                  </div>
                  <div>
                    {row.contact ? (
                      <>
                        <div style={{ color: "#00cfff", fontSize: 10 }}>
                          {row.contact.title}
                        </div>
                        <div style={{ color: "#555", fontSize: 9 }}>
                          contact · score {row.contactScore}
                        </div>
                      </>
                    ) : (
                      <div style={{ color: "#333", fontSize: 10 }}>—</div>
                    )}
                  </div>
                  <div>
                    {row.risk ? (
                      <>
                        <div style={{ color: "#ffaa00", fontSize: 10 }}>
                          {row.risk.title}
                        </div>
                        <div style={{ color: "#555", fontSize: 9 }}>
                          risk · score {row.riskScore}
                        </div>
                      </>
                    ) : (
                      <div style={{ color: "#333", fontSize: 10 }}>—</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "3px 12px",
              borderTop: "1px solid #cc88ff22",
              color: "#444",
              fontSize: 9,
              flexShrink: 0,
            }}
          >
            /v1/investigations × /entities/Contact × /entities/RiskSignal · poll {POLL_MS / 1000}s
          </div>
        </div>
      )}
    </>
  );
}
