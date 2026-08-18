/**
 * WorldTaxonomyExplorer — F306.
 *
 * Explores the Jarvis world taxonomy: 30 topics × 10 niches = 300 ontology
 * cells, 20 data-acquisition families, and the ingestion frontier.
 *
 * Data sources (all real — endpoints at /v1/jarvis/taxonomy):
 *   GET  /v1/jarvis/taxonomy/summary   (poll 120 s)
 *        → {topics, niches, cells, families, object_types}
 *   GET  /v1/jarvis/taxonomy/cells?topic=&limit=500
 *        → [{topic, niche}, ...]
 *   GET  /v1/jarvis/taxonomy/families
 *        → {families: [...], count: N}
 *   GET  /v1/jarvis/taxonomy/frontier?limit=30
 *        → {frontier: [...]}
 *   POST /v1/jarvis/taxonomy/load      (seed / re-seed taxonomy DB)
 *        → {topics, niches, cells, families, object_types}
 *
 * Displays:
 *   - Stat tiles: topics / niches / cells / families
 *   - SUMMARY tab: topic × niche count overview + object type count
 *   - CELLS tab: all 300 cells, filterable by topic + text search
 *   - FAMILIES tab: 20 data-acquisition families with colour chips
 *   - FRONTIER tab: 30 ingestion-frontier topic strings
 *   - ◈ SEED DATABASE button → POST /v1/jarvis/taxonomy/load
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence world-model brief + TTS
 *
 * Toggle: ⊕ WTXN at left:411120, bottom:8, zIndex:183.
 * Badge: green=cells>0, amber=cells==0.
 * Auto-refresh: summary every 120 s; cells/families/frontier lazy on tab open.
 *
 * Exported helpers for JarvisBrain:
 *   isWtxnQuery(q) / buildWtxnScript()
 *
 * Voice triggers: "world taxonomy / taxonomy explorer / ontology cells /
 *   acquisition families / world topics / taxonomy map / wtxn / knowledge map /
 *   world model / world ontology / topic cells / taxonomy browser"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const PU   = "#A78BFA";
const GR   = "#34D399";
const OR   = "#FB923C";
const DIM  = "#3A4A55";
const GRAY = "#4E6070";

const BTN_LEFT  = 411120;
const POLL_MS   = 120_000;
const API_KEY   =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// 20 family colour palette — cycles through 5 accents
const FAM_COLORS = [CY, GN, AM, PU, OR, CY, GR, AM, PU, GN,
                    OR, CY, GN, PU, AM, GR, OR, CY, GN, PU];

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const WTXN_RE =
  /\b(wtxn\b|world\s+taxonomy|taxonomy\s+explorer|ontology\s+cells?|acquisition\s+famil|world\s+topics?|taxonomy\s+map|knowledge\s+map|world\s+model|world\s+ontology|topic\s+cells?|taxonomy\s+browser)\b/i;

export function isWtxnQuery(q) {
  return WTXN_RE.test(q || "");
}

export async function buildWtxnScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/jarvis/taxonomy/summary`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    window.dispatchEvent(new CustomEvent("jarvis:wtxn-toggle"));
    const cells    = d?.cells    ?? 0;
    const topics   = d?.topics   ?? 0;
    const niches   = d?.niches   ?? 0;
    const families = d?.families ?? 0;
    const objtypes = d?.object_types ?? 0;
    return (
      `World taxonomy: ${cells} ontology cells across ${topics} topics × ${niches} niches, ` +
      `${families} data-acquisition families, ${objtypes} registered object types. ` +
      `Use CELLS tab to browse by topic, FRONTIER tab for the next ingestion targets.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:wtxn-toggle"));
    return "World Taxonomy Explorer open, sir.";
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function hdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        background: "rgba(41,231,255,0.04)",
        border: "1px solid rgba(41,231,255,0.10)",
        borderRadius: 6,
        padding: "8px 10px",
        minWidth: 60,
      }}
    >
      <div style={{ color, fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div
        style={{
          color: GRAY,
          fontSize: 9,
          marginTop: 3,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Chip({ label, color }) {
  return (
    <span
      style={{
        background: `${color}22`,
        border: `1px solid ${color}55`,
        borderRadius: 3,
        color,
        fontSize: 9,
        fontFamily: "monospace",
        padding: "1px 5px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function TabBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `${CY}18` : "transparent",
        border: `1px solid ${active ? CY : GRAY}44`,
        borderRadius: 4,
        color: active ? CY : GRAY,
        cursor: "pointer",
        fontFamily: "monospace",
        fontSize: 9,
        padding: "3px 9px",
        letterSpacing: "0.05em",
      }}
    >
      {label}
    </button>
  );
}

// ─── SummaryTab ───────────────────────────────────────────────────────────────

function SummaryTab({ summary }) {
  const topics   = summary?.topics   ?? 0;
  const niches   = summary?.niches   ?? 0;
  const cells    = summary?.cells    ?? 0;
  const families = summary?.families ?? 0;
  const objt     = summary?.object_types ?? 0;

  return (
    <div style={{ padding: "10px 0" }}>
      {/* coverage bar */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ color: GRAY, fontSize: 9, marginBottom: 4, letterSpacing: "0.06em" }}>
          TAXONOMY CELL COVERAGE — {cells} of {topics * niches} POSSIBLE
        </div>
        <div
          style={{
            background: "rgba(41,231,255,0.08)",
            borderRadius: 3,
            height: 6,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              background: cells > 0 ? GN : DIM,
              borderRadius: 3,
              height: "100%",
              transition: "width 0.6s ease",
              width: topics * niches > 0 ? `${Math.min(100, (cells / (topics * niches)) * 100)}%` : "0%",
            }}
          />
        </div>
      </div>

      {/* dimension summary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
          marginBottom: 10,
        }}
      >
        {[
          { label: "TOPICS", value: topics, color: CY },
          { label: "NICHES PER TOPIC", value: niches, color: GN },
          { label: "TOTAL CELLS", value: cells, color: AM },
          { label: "ACQUISITION FAMILIES", value: families, color: PU },
          { label: "OBJECT TYPES", value: objt, color: OR },
          { label: "MAX POSSIBLE", value: topics * niches, color: GRAY },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              background: "rgba(41,231,255,0.03)",
              border: "1px solid rgba(41,231,255,0.08)",
              borderRadius: 5,
              padding: "6px 10px",
            }}
          >
            <div style={{ color, fontSize: 14, fontWeight: 700 }}>{value}</div>
            <div style={{ color: GRAY, fontSize: 8, marginTop: 2, letterSpacing: "0.05em" }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {cells === 0 && (
        <div
          style={{
            background: `${AM}11`,
            border: `1px solid ${AM}33`,
            borderRadius: 5,
            color: AM,
            fontSize: 10,
            padding: "8px 10px",
          }}
        >
          ⚠ Taxonomy DB not seeded. Click ◈ SEED DATABASE to load the 300 cells + 20 families.
        </div>
      )}
    </div>
  );
}

// ─── CellsTab ─────────────────────────────────────────────────────────────────

function CellsTab({ cells, loading, search }) {
  const filtered = (cells || []).filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.topic || "").toLowerCase().includes(s) ||
           (c.niche || "").toLowerCase().includes(s);
  });

  const byTopic = {};
  for (const c of filtered) {
    if (!byTopic[c.topic]) byTopic[c.topic] = [];
    byTopic[c.topic].push(c.niche);
  }

  if (loading) {
    return (
      <div style={{ color: GRAY, fontSize: 10, padding: "14px" }}>
        Loading cells…
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div style={{ color: GRAY, fontSize: 10, padding: "14px" }}>
        {cells.length === 0 ? "No cells loaded. Seed the taxonomy first." : "No cells match search."}
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          color: GRAY,
          fontSize: 9,
          padding: "4px 0 8px",
          letterSpacing: "0.06em",
        }}
      >
        {filtered.length} CELLS ACROSS {Object.keys(byTopic).length} TOPICS
      </div>
      {Object.entries(byTopic).map(([topic, niches]) => (
        <div
          key={topic}
          style={{
            borderBottom: "1px solid rgba(41,231,255,0.06)",
            marginBottom: 4,
            paddingBottom: 6,
          }}
        >
          <div
            style={{
              color: CY,
              fontFamily: "monospace",
              fontSize: 10,
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            {topic}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {niches.map((n) => (
              <Chip key={n} label={n} color={GN} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── FamiliesTab ──────────────────────────────────────────────────────────────

function FamiliesTab({ families, loading, search }) {
  if (loading) {
    return (
      <div style={{ color: GRAY, fontSize: 10, padding: "14px" }}>
        Loading families…
      </div>
    );
  }

  const list = (families || []).filter((f) =>
    !search || f.toLowerCase().includes(search.toLowerCase()),
  );

  if (list.length === 0) {
    return (
      <div style={{ color: GRAY, fontSize: 10, padding: "14px" }}>
        {(families || []).length === 0
          ? "No families loaded. Seed the taxonomy first."
          : "No families match search."}
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          color: GRAY,
          fontSize: 9,
          padding: "4px 0 8px",
          letterSpacing: "0.06em",
        }}
      >
        {list.length} DATA-ACQUISITION FAMILIES
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 6,
        }}
      >
        {list.map((f, i) => {
          const col = FAM_COLORS[i % FAM_COLORS.length];
          return (
            <div
              key={f}
              style={{
                background: `${col}11`,
                border: `1px solid ${col}33`,
                borderRadius: 5,
                color: col,
                fontFamily: "monospace",
                fontSize: 9,
                padding: "5px 8px",
              }}
            >
              <span style={{ opacity: 0.55, marginRight: 4 }}>{String(i + 1).padStart(2, "0")}</span>
              {f}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── FrontierTab ──────────────────────────────────────────────────────────────

function FrontierTab({ frontier, loading, search }) {
  if (loading) {
    return (
      <div style={{ color: GRAY, fontSize: 10, padding: "14px" }}>
        Loading frontier…
      </div>
    );
  }

  const list = (frontier || []).filter((f) =>
    !search || f.toLowerCase().includes(search.toLowerCase()),
  );

  if (list.length === 0) {
    return (
      <div style={{ color: GRAY, fontSize: 10, padding: "14px" }}>
        {(frontier || []).length === 0
          ? "No frontier loaded. Seed the taxonomy first."
          : "No frontier entries match search."}
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          color: GRAY,
          fontSize: 9,
          padding: "4px 0 8px",
          letterSpacing: "0.06em",
        }}
      >
        {list.length} INGESTION FRONTIER TOPICS
      </div>
      {list.map((f, i) => (
        <div
          key={f}
          style={{
            alignItems: "center",
            borderBottom: "1px solid rgba(41,231,255,0.06)",
            display: "flex",
            gap: 8,
            padding: "5px 0",
          }}
        >
          <span
            style={{
              color: GRAY,
              fontFamily: "monospace",
              fontSize: 9,
              minWidth: 22,
              textAlign: "right",
            }}
          >
            {i + 1}
          </span>
          <span
            style={{
              color: CY,
              fontFamily: "monospace",
              fontSize: 10,
              flex: 1,
            }}
          >
            {f}
          </span>
          <Chip label="FRONTIER" color={OR} />
        </div>
      ))}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function WorldTaxonomyExplorer() {
  const [open, setOpen]           = useState(false);
  const [tab, setTab]             = useState("SUMMARY");
  const [search, setSearch]       = useState("");
  const [summary, setSummary]     = useState(null);
  const [cells, setCells]         = useState([]);
  const [families, setFamilies]   = useState([]);
  const [frontier, setFrontier]   = useState([]);
  const [cellsLoaded, setCellsLoaded]       = useState(false);
  const [familiesLoaded, setFamiliesLoaded] = useState(false);
  const [frontierLoaded, setFrontierLoaded] = useState(false);
  const [cellsLoading, setCellsLoading]       = useState(false);
  const [familiesLoading, setFamiliesLoading] = useState(false);
  const [frontierLoading, setFrontierLoading] = useState(false);
  const [seeding, setSeeding]     = useState(false);
  const [seedMsg, setSeedMsg]     = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessMsg, setAssessMsg] = useState(null);
  const [error, setError]         = useState(null);
  const pollRef = useRef(null);

  const loadSummary = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/taxonomy/summary`, { headers: hdr() });
      const d = await r.json();
      setSummary(d);
      setError(null);
    } catch (e) {
      setError(e?.message || "fetch error");
    }
  }, []);

  useEffect(() => {
    loadSummary();
    pollRef.current = setInterval(loadSummary, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [loadSummary]);

  useEffect(() => {
    function onToggle() { setOpen((v) => !v); }
    window.addEventListener("jarvis:wtxn-toggle", onToggle);
    return () => window.removeEventListener("jarvis:wtxn-toggle", onToggle);
  }, []);

  // lazy-load cells/families/frontier on tab switch
  useEffect(() => {
    if (!open) return;
    if (tab === "CELLS" && !cellsLoaded) {
      setCellsLoading(true);
      fetch(`${apiBase()}/v1/jarvis/taxonomy/cells?limit=500`, { headers: hdr() })
        .then((r) => r.json())
        .then((d) => {
          setCells(d?.cells ?? (Array.isArray(d) ? d : []));
          setCellsLoaded(true);
        })
        .catch(() => {})
        .finally(() => setCellsLoading(false));
    }
    if (tab === "FAMILIES" && !familiesLoaded) {
      setFamiliesLoading(true);
      fetch(`${apiBase()}/v1/jarvis/taxonomy/families`, { headers: hdr() })
        .then((r) => r.json())
        .then((d) => {
          setFamilies(d?.families ?? []);
          setFamiliesLoaded(true);
        })
        .catch(() => {})
        .finally(() => setFamiliesLoading(false));
    }
    if (tab === "FRONTIER" && !frontierLoaded) {
      setFrontierLoading(true);
      fetch(`${apiBase()}/v1/jarvis/taxonomy/frontier?limit=30`, { headers: hdr() })
        .then((r) => r.json())
        .then((d) => {
          setFrontier(d?.frontier ?? []);
          setFrontierLoaded(true);
        })
        .catch(() => {})
        .finally(() => setFrontierLoading(false));
    }
  }, [open, tab, cellsLoaded, familiesLoaded, frontierLoaded]);

  async function handleSeed() {
    setSeeding(true);
    setSeedMsg(null);
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/taxonomy/load`, {
        method: "POST",
        headers: hdr(),
      });
      const d = await r.json();
      setSeedMsg(
        `Seeded: ${d?.cells ?? 0} cells, ${d?.families ?? 0} families, ${d?.object_types ?? 0} object types.`,
      );
      // reset lazy flags so tabs reload fresh data
      setCellsLoaded(false);
      setFamiliesLoaded(false);
      setFrontierLoaded(false);
      await loadSummary();
    } catch (e) {
      setSeedMsg(`Seed failed: ${e?.message || "unknown error"}`);
    }
    setSeeding(false);
  }

  async function handleAssess() {
    setAssessing(true);
    setAssessMsg(null);
    try {
      const script = await buildWtxnScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdr(), "Content-Type": "application/json" },
        body: JSON.stringify({
          message:
            `World taxonomy state: ${script} Give a 2-sentence operational brief on the world model coverage and recommended ingestion targets.`,
        }),
      });
      const d = await r.json();
      const answer = d?.answer || script;
      setAssessMsg(answer);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {
      setAssessMsg("Assessment unavailable.");
    }
    setAssessing(false);
  }

  const cells_count    = summary?.cells    ?? 0;
  const topics_count   = summary?.topics   ?? 0;
  const niches_count   = summary?.niches   ?? 0;
  const families_count = summary?.families ?? 0;

  const badgeColor = cells_count > 0 ? GN : AM;

  function resetTabSearch() {
    setSearch("");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="World Taxonomy Explorer"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 183,
          background: "rgba(10,20,30,0.82)",
          border: `1px solid ${badgeColor}55`,
          borderRadius: 5,
          color: badgeColor,
          cursor: "pointer",
          fontFamily: "monospace",
          fontSize: 10,
          letterSpacing: "0.06em",
          padding: "4px 9px",
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        ⊕ WTXN
        <span
          style={{
            background: `${badgeColor}33`,
            border: `1px solid ${badgeColor}`,
            borderRadius: 3,
            color: badgeColor,
            fontSize: 9,
            padding: "0 4px",
          }}
        >
          {cells_count > 0 ? cells_count : "—"}
        </span>
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 9400,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div
        style={{
          background: "linear-gradient(160deg,#0a1520 0%,#0d1e2c 100%)",
          border: `1px solid ${CY}33`,
          borderRadius: 10,
          boxShadow: `0 0 40px ${CY}18`,
          display: "flex",
          flexDirection: "column",
          gap: 0,
          maxHeight: "88vh",
          overflow: "hidden",
          width: 520,
        }}
      >
        {/* header */}
        <div
          style={{
            alignItems: "center",
            borderBottom: `1px solid ${CY}22`,
            display: "flex",
            gap: 8,
            padding: "10px 14px",
          }}
        >
          <span style={{ color: CY, fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>
            ⊕ WORLD TAXONOMY EXPLORER
          </span>
          <Chip label={`${topics_count}T×${niches_count}N`} color={GN} />
          <div style={{ flex: 1 }} />
          <button
            onClick={handleSeed}
            disabled={seeding}
            title="Seed / re-seed taxonomy database"
            style={{
              background: `${PU}11`,
              border: `1px solid ${PU}44`,
              borderRadius: 4,
              color: seeding ? GRAY : PU,
              cursor: seeding ? "wait" : "pointer",
              fontFamily: "monospace",
              fontSize: 9,
              padding: "3px 8px",
            }}
          >
            {seeding ? "…" : "◈ SEED DB"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "transparent",
              border: "none",
              color: GRAY,
              cursor: "pointer",
              fontSize: 14,
              padding: "0 2px",
            }}
          >
            ✕
          </button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 6, padding: "10px 14px 0" }}>
          <StatTile label="topics"   value={topics_count}   color={CY} />
          <StatTile label="niches"   value={niches_count}   color={GN} />
          <StatTile label="cells"    value={cells_count}    color={cells_count > 0 ? AM : GRAY} />
          <StatTile label="families" value={families_count} color={PU} />
        </div>

        {/* tab row */}
        <div
          style={{
            borderBottom: `1px solid ${CY}18`,
            display: "flex",
            gap: 4,
            padding: "8px 14px",
          }}
        >
          {["SUMMARY", "CELLS", "FAMILIES", "FRONTIER"].map((t) => (
            <TabBtn
              key={t}
              label={t}
              active={tab === t}
              onClick={() => { setTab(t); resetTabSearch(); }}
            />
          ))}
          <div style={{ flex: 1 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search…"
            style={{
              background: "rgba(41,231,255,0.06)",
              border: `1px solid ${CY}33`,
              borderRadius: 4,
              color: CY,
              fontFamily: "monospace",
              fontSize: 9,
              outline: "none",
              padding: "3px 7px",
              width: 100,
            }}
          />
        </div>

        {/* tab body */}
        <div
          style={{
            flex: 1,
            margin: "0 14px 0",
            overflowY: "auto",
            paddingBottom: 4,
          }}
        >
          {error && (
            <div style={{ color: "#F87171", fontSize: 10, padding: "10px 0" }}>
              Error: {error}
            </div>
          )}
          {tab === "SUMMARY"  && <SummaryTab  summary={summary} />}
          {tab === "CELLS"    && (
            <CellsTab
              cells={cells}
              loading={cellsLoading}
              search={search}
            />
          )}
          {tab === "FAMILIES" && (
            <FamiliesTab
              families={families}
              loading={familiesLoading}
              search={search}
            />
          )}
          {tab === "FRONTIER" && (
            <FrontierTab
              frontier={frontier}
              loading={frontierLoading}
              search={search}
            />
          )}
        </div>

        {/* seed / assess messages */}
        {(seedMsg || assessMsg) && (
          <div
            style={{
              background: "rgba(41,231,255,0.05)",
              border: `1px solid ${CY}22`,
              borderRadius: 4,
              color: CY,
              fontSize: 10,
              margin: "4px 14px",
              padding: "6px 10px",
            }}
          >
            {seedMsg || assessMsg}
          </div>
        )}

        {/* footer */}
        <div
          style={{
            alignItems: "center",
            borderTop: `1px solid ${CY}18`,
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            margin: "4px 0 0",
            padding: "8px 14px",
          }}
        >
          <button
            onClick={handleAssess}
            disabled={assessing}
            style={{
              background: `${CY}11`,
              border: `1px solid ${CY}44`,
              borderRadius: 4,
              color: assessing ? GRAY : CY,
              cursor: assessing ? "wait" : "pointer",
              fontFamily: "monospace",
              fontSize: 9,
              padding: "3px 10px",
            }}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button
            onClick={loadSummary}
            style={{
              background: "transparent",
              border: `1px solid ${GRAY}55`,
              borderRadius: 4,
              color: GRAY,
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: 9,
              padding: "3px 8px",
            }}
          >
            ↺ REFRESH
          </button>
        </div>
      </div>
    </div>
  );
}
