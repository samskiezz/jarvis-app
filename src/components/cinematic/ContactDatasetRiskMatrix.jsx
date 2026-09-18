/**
 * F767 — Contact × Dataset × RiskSignal Personnel Data Risk Matrix (CDRMAT)
 * Endpoints: /entities/Contact × /v1/datasets × /entities/RiskSignal
 * Classification: FULLY_EXPOSED | DATA_EXPOSED | RISK_EXPOSED | CLEAR
 * Identifies personnel who have both a data footprint AND a risk signal alignment.
 */
import { useEffect, useState, useRef } from "react";

const BTN_LEFT = 928_960;
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

const CDRMAT_RE =
  /\b(cdrmat|contact\s*data(?:set)?\s*risk|personnel\s*risk\s*matrix|personnel\s*exposure|contact\s*risk\s*data|data\s*risk\s*contact|contact\s*dataset\s*risk|personal\s*exposure|contact\s*risk\s*matrix|exposed\s*contact|contact\s*data\s*footprint)\b/i;

export function isCdrmatQuery(t) {
  return CDRMAT_RE.test(t || "");
}

// ── Normalisers ───────────────────────────────────────────────────────────────

function normaliseContact(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.contact_id || raw._id || String(Math.random()),
    title: raw.name || raw.title || raw.full_name || raw.display_name || "Unnamed Contact",
    role: raw.role || raw.type || raw.category || "",
    company: raw.company || raw.organisation || raw.organization || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
}

function normaliseDataset(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.dataset_id || raw._id || String(Math.random()),
    title: raw.name || raw.title || raw.label || "Untitled Dataset",
    type: raw.type || raw.category || raw.source || "",
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

// ── Keyword scoring ───────────────────────────────────────────────────────────

function keywords(obj) {
  const txt = JSON.stringify(obj || "").toLowerCase();
  return txt.match(/[a-z]{4,}/g) || [];
}

function scoreMatch(aKw, bKw) {
  const setB = new Set(bKw);
  return aKw.filter((w) => w.length > 3 && setB.has(w)).length;
}

// ── Matrix builder ────────────────────────────────────────────────────────────

const CLASS_META = {
  FULLY_EXPOSED: {
    label: "FULLY EXPOSED",
    color: "#FF6B35",
    desc: "Contact matched to both a Dataset and a RiskSignal",
  },
  DATA_EXPOSED: {
    label: "DATA EXPOSED",
    color: "#00cfff",
    desc: "Contact matched to a Dataset but no RiskSignal",
  },
  RISK_EXPOSED: {
    label: "RISK EXPOSED",
    color: "#ffaa00",
    desc: "Contact matched to a RiskSignal but no Dataset",
  },
  CLEAR: {
    label: "CLEAR",
    color: "#444",
    desc: "Contact with no matching Dataset or RiskSignal",
  },
};

function buildMatrix(contacts, datasets, risks) {
  return contacts.map((contact) => {
    const cKw = keywords(contact);

    let bestDataset = null;
    let bestDatasetScore = 0;
    for (const d of datasets) {
      const s = scoreMatch(cKw, keywords(d));
      if (s > bestDatasetScore) {
        bestDatasetScore = s;
        bestDataset = d;
      }
    }

    let bestRisk = null;
    let bestRiskScore = 0;
    for (const r of risks) {
      const s = scoreMatch(cKw, keywords(r));
      if (s > bestRiskScore) {
        bestRiskScore = s;
        bestRisk = r;
      }
    }

    const hasDataset = bestDataset && bestDatasetScore > 0;
    const hasRisk    = bestRisk    && bestRiskScore    > 0;
    const cls =
      hasDataset && hasRisk
        ? "FULLY_EXPOSED"
        : hasDataset
        ? "DATA_EXPOSED"
        : hasRisk
        ? "RISK_EXPOSED"
        : "CLEAR";

    return {
      contact,
      dataset:       hasDataset ? bestDataset : null,
      datasetScore:  bestDatasetScore,
      risk:          hasRisk ? bestRisk : null,
      riskScore:     bestRiskScore,
      cls,
    };
  });
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const base = apiBase();
  const hdr  = { Authorization: `Bearer ${API_KEY}` };

  const [cRaw, dRaw, rRaw] = await Promise.all([
    fetch(`${base}/entities/Contact`,    { headers: hdr }).then((r) => r.ok ? r.json() : []),
    fetch(`${base}/v1/datasets`,         { headers: hdr }).then((r) => r.ok ? r.json() : []),
    fetch(`${base}/entities/RiskSignal`, { headers: hdr }).then((r) => r.ok ? r.json() : []),
  ]);

  const contacts = (Array.isArray(cRaw) ? cRaw : cRaw?.data ?? cRaw?.contacts ?? [])
    .map(normaliseContact).filter(Boolean);
  const datasets = (Array.isArray(dRaw) ? dRaw : dRaw?.data ?? dRaw?.datasets ?? [])
    .map(normaliseDataset).filter(Boolean);
  const risks    = (Array.isArray(rRaw) ? rRaw : rRaw?.data ?? rRaw?.risks ?? [])
    .map(normaliseRisk).filter(Boolean);

  return { contacts, datasets, risks };
}

export async function buildCdrmatScript() {
  try {
    const { contacts, datasets, risks } = await fetchAll();
    const rows   = buildMatrix(contacts, datasets, risks);
    const counts = {
      FULLY_EXPOSED: rows.filter((r) => r.cls === "FULLY_EXPOSED").length,
      DATA_EXPOSED:  rows.filter((r) => r.cls === "DATA_EXPOSED").length,
      RISK_EXPOSED:  rows.filter((r) => r.cls === "RISK_EXPOSED").length,
      CLEAR:         rows.filter((r) => r.cls === "CLEAR").length,
    };
    return (
      `Contact Data Risk Matrix: ${contacts.length} contacts cross-referenced against ` +
      `${datasets.length} datasets and ${risks.length} risk signals. ` +
      `Fully exposed (data + risk): ${counts.FULLY_EXPOSED}. ` +
      `Data exposed only: ${counts.DATA_EXPOSED}. ` +
      `Risk exposed only: ${counts.RISK_EXPOSED}. ` +
      `Clear: ${counts.CLEAR}.`
    );
  } catch (e) {
    return `Contact Data Risk Matrix unavailable: ${e.message}`;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ContactDatasetRiskMatrix() {
  const [open,    setOpen]    = useState(false);
  const [rows,    setRows]    = useState([]);
  const [counts,  setCounts]  = useState({ FULLY_EXPOSED: 0, DATA_EXPOSED: 0, RISK_EXPOSED: 0, CLEAR: 0 });
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(null);
  const [filter,  setFilter]  = useState("ALL");
  const [search,  setSearch]  = useState("");
  const intervalRef = useRef(null);

  useEffect(() => {
    function handler(e) {
      setOpen((v) => (e.detail?.force !== undefined ? e.detail.force : !v));
    }
    window.addEventListener("jarvis:cdrmat-toggle", handler);
    return () => window.removeEventListener("jarvis:cdrmat-toggle", handler);
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
        const { contacts, datasets, risks } = await fetchAll();
        const matrix = buildMatrix(contacts, datasets, risks);
        setRows(matrix);
        setCounts({
          FULLY_EXPOSED: matrix.filter((r) => r.cls === "FULLY_EXPOSED").length,
          DATA_EXPOSED:  matrix.filter((r) => r.cls === "DATA_EXPOSED").length,
          RISK_EXPOSED:  matrix.filter((r) => r.cls === "RISK_EXPOSED").length,
          CLEAR:         matrix.filter((r) => r.cls === "CLEAR").length,
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
        r.contact.title.toLowerCase().includes(q) ||
        r.contact.company.toLowerCase().includes(q) ||
        (r.dataset?.title || "").toLowerCase().includes(q) ||
        (r.risk?.title || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const exposedBadge = counts.FULLY_EXPOSED;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position:   "fixed",
          bottom:     8,
          left:       BTN_LEFT,
          zIndex:     624,
          fontFamily: "monospace",
          fontSize:   10,
          padding:    "2px 7px",
          background: open ? "#150800" : "#0a0a0a",
          color:      open ? "#FF6B35" : "#555",
          border:     `1px solid ${open ? "#FF6B35" : "#333"}`,
          borderRadius: 3,
          cursor:     "pointer",
          whiteSpace: "nowrap",
        }}
        title="Contact × Dataset × RiskSignal Personnel Data Risk Matrix"
      >
        CDRMAT{exposedBadge > 0 ? ` [${exposedBadge}]` : ""}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position:    "fixed",
            bottom:      36,
            left:        BTN_LEFT - 200,
            width:       880,
            maxHeight:   560,
            zIndex:      624,
            background:  "#0f0800",
            border:      "1px solid #FF6B35",
            borderRadius: 6,
            fontFamily:  "monospace",
            fontSize:    11,
            color:       "#ccc",
            display:     "flex",
            flexDirection: "column",
            overflow:    "hidden",
            boxShadow:   "0 0 24px #FF6B3544",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding:        "6px 12px",
              borderBottom:   "1px solid #FF6B3544",
              display:        "flex",
              alignItems:     "center",
              gap:            8,
              flexShrink:     0,
            }}
          >
            <span style={{ color: "#FF6B35", fontWeight: "bold", fontSize: 12 }}>
              CDRMAT
            </span>
            <span style={{ color: "#555", fontSize: 10 }}>
              Contact × Dataset × RiskSignal Personnel Data Risk Matrix
            </span>
            {loading && (
              <span style={{ color: "#FF6B35", marginLeft: "auto", fontSize: 10 }}>
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
                marginLeft:  "auto",
                background:  "none",
                border:      "none",
                color:       "#666",
                cursor:      "pointer",
                fontSize:    14,
                lineHeight:  1,
              }}
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
              borderBottom: "1px solid #FF6B3522",
            }}
          >
            {Object.entries(CLASS_META).map(([k, meta]) => (
              <div
                key={k}
                onClick={() => setFilter(filter === k ? "ALL" : k)}
                style={{
                  flex:         1,
                  background:   filter === k ? "#1a0800" : "#111",
                  border:       `1px solid ${filter === k ? meta.color : "#333"}`,
                  borderRadius: 4,
                  padding:      "4px 6px",
                  cursor:       "pointer",
                  textAlign:    "center",
                }}
              >
                <div style={{ color: meta.color, fontSize: 16, fontWeight: "bold" }}>
                  {counts[k]}
                </div>
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
              borderBottom: "1px solid #FF6B3522",
            }}
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search contacts / datasets / risks…"
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
            <span style={{ color: "#555", fontSize: 10 }}>
              {visible.length}/{rows.length}
            </span>
          </div>

          {/* Rows */}
          <div style={{ overflow: "auto", flex: 1 }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: 16, color: "#444", textAlign: "center" }}>
                {err ? "Error loading data." : "No contacts match."}
              </div>
            )}
            {visible.map((row, i) => {
              const meta = CLASS_META[row.cls];
              return (
                <div
                  key={row.contact.id + i}
                  style={{
                    padding:             "5px 12px",
                    borderBottom:        "1px solid #1a0800",
                    display:             "grid",
                    gridTemplateColumns: "100px 1fr 1fr 1fr",
                    gap:                 6,
                    alignItems:          "start",
                  }}
                >
                  {/* Classification badge */}
                  <div>
                    <span
                      style={{
                        display:     "inline-block",
                        padding:     "1px 4px",
                        borderRadius: 2,
                        background:  "#1a0800",
                        border:      `1px solid ${meta.color}`,
                        color:       meta.color,
                        fontSize:    9,
                        whiteSpace:  "nowrap",
                      }}
                    >
                      {meta.label}
                    </span>
                    {row.contact.role && (
                      <div style={{ color: "#555", fontSize: 9, marginTop: 2 }}>
                        {row.contact.role}
                      </div>
                    )}
                  </div>

                  {/* Contact */}
                  <div>
                    <div style={{ color: "#FF6B35", fontSize: 10, fontWeight: "bold" }}>
                      {row.contact.title}
                    </div>
                    {row.contact.company && (
                      <div style={{ color: "#555", fontSize: 9 }}>{row.contact.company}</div>
                    )}
                  </div>

                  {/* Dataset match */}
                  <div>
                    {row.dataset ? (
                      <>
                        <div style={{ color: "#00cfff", fontSize: 10 }}>
                          {row.dataset.title}
                        </div>
                        <div style={{ color: "#555", fontSize: 9 }}>
                          dataset · score {row.datasetScore}
                        </div>
                      </>
                    ) : (
                      <div style={{ color: "#333", fontSize: 10 }}>—</div>
                    )}
                  </div>

                  {/* Risk match */}
                  <div>
                    {row.risk ? (
                      <>
                        <div style={{ color: "#ffaa00", fontSize: 10 }}>
                          {row.risk.title}
                        </div>
                        <div style={{ color: "#555", fontSize: 9 }}>
                          {row.risk.severity} · score {row.riskScore}
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
              padding:    "3px 12px",
              borderTop:  "1px solid #FF6B3522",
              color:      "#444",
              fontSize:   9,
              flexShrink: 0,
            }}
          >
            /entities/Contact × /v1/datasets × /entities/RiskSignal · poll {POLL_MS / 1000}s
          </div>
        </div>
      )}
    </>
  );
}
