/**
 * F766 — AipSkill × Investigation × Dataset Triple Nexus (ASIDTRI)
 * Endpoints: /v1/aip/skill × /v1/investigations × /v1/datasets
 * Classification: FULLY_EQUIPPED | INV_ONLY | DATASET_ONLY | DARK
 */
import { useEffect, useState, useRef } from "react";

const BTN_LEFT = 928_100;
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

const ASIDTRI_RE =
  /\b(asidtri|skill\s*investigation\s*dataset|investigation\s*dataset\s*skill|dataset\s*skill\s*investigation|skill\s*equipped|equipped\s*skills?|dark\s*skills?|dataset\s*skill\s*coverage|investigation\s*skill\s*coverage|skill\s*dataset\s*coverage|skill\s*triple\s*nexus|aip\s*skill\s*dataset|aip\s*skill\s*investigation)\b/i;

export function isAsidtriQuery(t) {
  return ASIDTRI_RE.test(t || "");
}

function normaliseSkill(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.skill_id || raw._id || String(Math.random()),
    name: raw.name || raw.title || raw.label || "Untitled Skill",
    type: raw.type || raw.category || raw.kind || "skill",
    level: raw.level || raw.proficiency || raw.score || 0,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
}

function normaliseInvestigation(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.investigation_id || raw._id || String(Math.random()),
    title: raw.title || raw.name || raw.subject || "Untitled Investigation",
    status: raw.status || raw.state || "open",
    priority: raw.priority || raw.severity || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
}

function normaliseDataset(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.dataset_id || raw._id || String(Math.random()),
    name: raw.name || raw.title || raw.label || "Untitled Dataset",
    kind: raw.kind || raw.type || raw.format || "dataset",
    rows: raw.rows || raw.row_count || raw.count || 0,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
}

function keywords(obj) {
  const txt = JSON.stringify(obj || "").toLowerCase();
  return txt.match(/[a-z]{4,}/g) || [];
}

function scoreMatch(aKw, bKw) {
  const setB = new Set(bKw);
  return aKw.filter((w) => w.length > 3 && setB.has(w)).length;
}

const CLASS_META = {
  FULLY_EQUIPPED: {
    label: "FULLY EQUIPPED",
    color: "#00ff88",
    desc: "Skill matched to both an Investigation and a Dataset",
  },
  INV_ONLY: {
    label: "INV ONLY",
    color: "#00cfff",
    desc: "Skill linked to an Investigation but no Dataset coverage",
  },
  DATASET_ONLY: {
    label: "DATASET ONLY",
    color: "#ffaa00",
    desc: "Skill backed by a Dataset but no Investigation linkage",
  },
  DARK: {
    label: "DARK",
    color: "#666",
    desc: "Skill with no Investigation or Dataset coverage",
  },
};

function buildNexus(skills, investigations, datasets) {
  return skills.map((sk) => {
    const skKw = keywords(sk);
    let bestInv = null;
    let bestInvScore = 0;
    for (const inv of investigations) {
      const s = scoreMatch(skKw, keywords(inv));
      if (s > bestInvScore) {
        bestInvScore = s;
        bestInv = inv;
      }
    }
    let bestDs = null;
    let bestDsScore = 0;
    for (const ds of datasets) {
      const s = scoreMatch(skKw, keywords(ds));
      if (s > bestDsScore) {
        bestDsScore = s;
        bestDs = ds;
      }
    }
    const hasInv = bestInv && bestInvScore > 0;
    const hasDs = bestDs && bestDsScore > 0;
    const cls =
      hasInv && hasDs
        ? "FULLY_EQUIPPED"
        : hasInv
        ? "INV_ONLY"
        : hasDs
        ? "DATASET_ONLY"
        : "DARK";
    return {
      skill: sk,
      investigation: hasInv ? bestInv : null,
      invScore: bestInvScore,
      dataset: hasDs ? bestDs : null,
      dsScore: bestDsScore,
      cls,
    };
  });
}

async function fetchAll() {
  const base = apiBase();
  const hdr = { Authorization: `Bearer ${API_KEY}` };

  const [skRaw, invRaw, dsRaw] = await Promise.all([
    fetch(`${base}/v1/aip/skill`, { headers: hdr }).then((r) =>
      r.ok ? r.json() : []
    ),
    fetch(`${base}/v1/investigations`, { headers: hdr }).then((r) =>
      r.ok ? r.json() : []
    ),
    fetch(`${base}/v1/datasets`, { headers: hdr }).then((r) =>
      r.ok ? r.json() : []
    ),
  ]);

  const skills = (
    Array.isArray(skRaw) ? skRaw : skRaw?.data ?? skRaw?.skills ?? []
  )
    .map(normaliseSkill)
    .filter(Boolean);
  const investigations = (
    Array.isArray(invRaw) ? invRaw : invRaw?.data ?? invRaw?.investigations ?? []
  )
    .map(normaliseInvestigation)
    .filter(Boolean);
  const datasets = (
    Array.isArray(dsRaw) ? dsRaw : dsRaw?.data ?? dsRaw?.datasets ?? []
  )
    .map(normaliseDataset)
    .filter(Boolean);

  return { skills, investigations, datasets };
}

export async function buildAsidtriScript() {
  try {
    const { skills, investigations, datasets } = await fetchAll();
    const rows = buildNexus(skills, investigations, datasets);
    const counts = {
      FULLY_EQUIPPED: rows.filter((r) => r.cls === "FULLY_EQUIPPED").length,
      INV_ONLY: rows.filter((r) => r.cls === "INV_ONLY").length,
      DATASET_ONLY: rows.filter((r) => r.cls === "DATASET_ONLY").length,
      DARK: rows.filter((r) => r.cls === "DARK").length,
    };
    const coverage = skills.length
      ? Math.round(((rows.length - counts.DARK) / rows.length) * 100)
      : 0;
    return (
      `AipSkill Investigation Dataset Triple Nexus: ${skills.length} skills cross-referenced against ` +
      `${investigations.length} investigations and ${datasets.length} datasets. ` +
      `Fully equipped: ${counts.FULLY_EQUIPPED}. ` +
      `Investigation only: ${counts.INV_ONLY}. ` +
      `Dataset only: ${counts.DATASET_ONLY}. ` +
      `Dark (no coverage): ${counts.DARK}. ` +
      `Overall skill coverage: ${coverage}%.`
    );
  } catch (e) {
    return `AipSkill Investigation Dataset Nexus unavailable: ${e.message}`;
  }
}

export default function AipSkillInvestigationDatasetTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({
    FULLY_EQUIPPED: 0,
    INV_ONLY: 0,
    DATASET_ONLY: 0,
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
    window.addEventListener("jarvis:asidtri-toggle", handler);
    return () => window.removeEventListener("jarvis:asidtri-toggle", handler);
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
        const { skills, investigations, datasets } = await fetchAll();
        const nexus = buildNexus(skills, investigations, datasets);
        setRows(nexus);
        setCounts({
          FULLY_EQUIPPED: nexus.filter((r) => r.cls === "FULLY_EQUIPPED").length,
          INV_ONLY: nexus.filter((r) => r.cls === "INV_ONLY").length,
          DATASET_ONLY: nexus.filter((r) => r.cls === "DATASET_ONLY").length,
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
        r.skill.name.toLowerCase().includes(q) ||
        (r.investigation?.title || "").toLowerCase().includes(q) ||
        (r.dataset?.name || "").toLowerCase().includes(q) ||
        r.skill.type.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const darkBadge = counts.DARK;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 623,
          fontFamily: "monospace",
          fontSize: 10,
          padding: "2px 7px",
          background: open ? "#001a08" : "#0a0a0a",
          color: open ? "#00ff88" : "#555",
          border: `1px solid ${open ? "#00ff88" : "#333"}`,
          borderRadius: 3,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
        title="AipSkill × Investigation × Dataset Triple Nexus"
      >
        ASIDTRI{darkBadge > 0 ? ` [${darkBadge}]` : ""}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 36,
            left: BTN_LEFT - 200,
            width: 880,
            maxHeight: 560,
            zIndex: 623,
            background: "#000d04",
            border: "1px solid #00ff88",
            borderRadius: 6,
            fontFamily: "monospace",
            fontSize: 11,
            color: "#ccc",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 0 24px #00ff8844",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "6px 12px",
              borderBottom: "1px solid #00ff8844",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span style={{ color: "#00ff88", fontWeight: "bold", fontSize: 12 }}>
              ASIDTRI
            </span>
            <span style={{ color: "#555", fontSize: 10 }}>
              AipSkill × Investigation × Dataset
            </span>
            {loading && (
              <span style={{ color: "#00ff88", marginLeft: "auto", fontSize: 10 }}>
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
              borderBottom: "1px solid #00ff8822",
            }}
          >
            {Object.entries(CLASS_META).map(([k, meta]) => (
              <div
                key={k}
                onClick={() => setFilter(filter === k ? "ALL" : k)}
                style={{
                  flex: 1,
                  background: filter === k ? "#001a08" : "#111",
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

          {/* Search + count */}
          <div
            style={{
              padding: "4px 12px",
              flexShrink: 0,
              display: "flex",
              gap: 8,
              alignItems: "center",
              borderBottom: "1px solid #00ff8822",
            }}
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search skills / investigations / datasets…"
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
                {err ? "Error loading data." : "No skills match."}
              </div>
            )}
            {visible.map((row, i) => {
              const meta = CLASS_META[row.cls];
              return (
                <div
                  key={row.skill.id + i}
                  style={{
                    padding: "5px 12px",
                    borderBottom: "1px solid #001a08",
                    display: "grid",
                    gridTemplateColumns: "100px 1fr 1fr 1fr",
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
                        background: "#001a08",
                        border: `1px solid ${meta.color}`,
                        color: meta.color,
                        fontSize: 9,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {meta.label}
                    </span>
                    <div style={{ color: "#555", fontSize: 9, marginTop: 2 }}>
                      {row.skill.type}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "#00ff88", fontSize: 10, fontWeight: "bold" }}>
                      {row.skill.name}
                    </div>
                    <div style={{ color: "#555", fontSize: 9 }}>
                      {row.skill.level > 0 ? `level ${row.skill.level}` : "skill"}
                    </div>
                  </div>
                  <div>
                    {row.investigation ? (
                      <>
                        <div style={{ color: "#00cfff", fontSize: 10 }}>
                          {row.investigation.title}
                        </div>
                        <div style={{ color: "#555", fontSize: 9 }}>
                          {row.investigation.status} · score {row.invScore}
                        </div>
                      </>
                    ) : (
                      <div style={{ color: "#333", fontSize: 10 }}>—</div>
                    )}
                  </div>
                  <div>
                    {row.dataset ? (
                      <>
                        <div style={{ color: "#ffaa00", fontSize: 10 }}>
                          {row.dataset.name}
                        </div>
                        <div style={{ color: "#555", fontSize: 9 }}>
                          {row.dataset.kind} · score {row.dsScore}
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
              borderTop: "1px solid #00ff8822",
              color: "#444",
              fontSize: 9,
              flexShrink: 0,
            }}
          >
            /v1/aip/skill × /v1/investigations × /v1/datasets · poll {POLL_MS / 1000}s
          </div>
        </div>
      )}
    </>
  );
}
