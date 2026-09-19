/**
 * WorldIntelPanel — F333.
 *
 * Browses the Jarvis World Intelligence Pack: 5 000 domain subjects across
 * 30 master topics, 50 000 candidate endpoints, and live research targets.
 *
 * Data sources (all real — endpoints at /v1/jarvis/world):
 *   GET  /v1/jarvis/world/summary            (poll 120 s)
 *        → {available, topics, niches, cells, families, subjects, endpoints}
 *   GET  /v1/jarvis/world/subjects?limit=100  (lazy on SUBJECTS tab)
 *        → [{subject_id, master_topic, domain_subject, neuron_type,
 *            refresh_cadence}]
 *   GET  /v1/jarvis/world/endpoints?limit=100 (lazy on ENDPOINTS tab)
 *        → [{source_name, official_url, access_method,
 *            recommended_ingestion_connector}]
 *   GET  /v1/jarvis/world/research-targets?limit=50 (lazy on TARGETS tab)
 *        → ["concept string", ...]
 *
 * Displays:
 *   - Stat tiles: topics / subjects / endpoints / cells
 *   - SUMMARY tab: pack availability chip + count grid
 *   - SUBJECTS tab: master_topic filter chips + domain_subject rows
 *   - ENDPOINTS tab: source + access_method chip + connector chip + URL link
 *   - TARGETS tab: ranked research target phrase list
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence world-pack brief + TTS
 *
 * Toggle: ◉ WINP at left:529680, bottom:8, zIndex:209.
 * Badge: green=subjects>0, amber=pack not loaded.
 * Auto-refresh: summary every 120 s; subjects/endpoints/targets lazy.
 *
 * Exported helpers for JarvisBrain:
 *   isWinpQuery(q) / buildWinpScript()
 *
 * Voice triggers: "world intel / world subjects / world pack / winp /
 *   world endpoints / intelligence pack / world topics / research targets /
 *   domain subjects / knowledge endpoints / world model subjects"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const PU   = "#A78BFA";
const OR   = "#FB923C";
const DIM  = "#3A4A55";
const GRAY = "#4E6070";
const RS   = "#F43F5E";

const BTN_LEFT = 529680;
const POLL_MS  = 120_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// topic colour palette — cycles through accents
const TOPIC_COLORS = [CY, GN, AM, PU, OR, CY, GN, AM, PU, OR,
                      CY, GN, AM, PU, OR, CY, GN, AM, PU, OR,
                      CY, GN, AM, PU, OR, CY, GN, AM, PU, OR];

// access-method colour map
const ACCESS_COLOR = {
  REST_JSON: CY, GraphQL: PU, SPARQL: AM, WebSocket: OR,
  RSS: GN, CSV: GN, Bulk_Download: OR, HTML_Scrape: RS,
};

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const WINP_RE =
  /\b(winp\b|world\s+intel(ligence)?\b|intelligence\s+pack\b|world\s+pack\b|world\s+subjects?\b|world\s+endpoints?\b|world\s+topics?\b|research\s+targets?\b|domain\s+subjects?\b|knowledge\s+endpoints?\b|world\s+model\s+subjects?\b)\b/i;

export function isWinpQuery(q) {
  return WINP_RE.test(q || "");
}

export async function buildWinpScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/jarvis/world/summary`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    window.dispatchEvent(new CustomEvent("jarvis:winp-toggle"));
    const subjects  = d?.subjects  ?? 0;
    const endpoints = d?.endpoints ?? 0;
    const topics    = d?.topics    ?? 0;
    const loaded    = d?.available ? "loaded" : "not yet seeded";
    return (
      `World Intelligence Pack is ${loaded}: ${topics} master topics, ` +
      `${subjects.toLocaleString()} domain subjects, ` +
      `${endpoints.toLocaleString()} ingestion endpoint candidates. ` +
      `Open SUBJECTS tab to browse by topic, ENDPOINTS for data sources, ` +
      `TARGETS for the live research queue.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:winp-toggle"));
    return "World Intelligence Pack open, sir.";
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function hdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function age(ms) {
  if (!ms) return "—";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div style={{
      flex: 1,
      background: "rgba(41,231,255,0.04)",
      border: "1px solid rgba(41,231,255,0.10)",
      borderRadius: 6,
      padding: "8px 10px",
      minWidth: 60,
    }}>
      <div style={{ color, fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div style={{ color: GRAY, fontSize: 9, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
    </div>
  );
}

function Chip({ label, color }) {
  return (
    <span style={{
      background: `${color}22`,
      border: `1px solid ${color}55`,
      borderRadius: 3,
      color,
      fontSize: 9,
      fontFamily: "monospace",
      padding: "1px 5px",
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

function TabBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: active ? `${CY}18` : "transparent",
      border: `1px solid ${active ? CY : GRAY}44`,
      borderRadius: 4,
      color: active ? CY : GRAY,
      cursor: "pointer",
      fontFamily: "monospace",
      fontSize: 9,
      padding: "3px 9px",
      letterSpacing: "0.05em",
    }}>
      {label}
    </button>
  );
}

// ─── SummaryTab ───────────────────────────────────────────────────────────────

function SummaryTab({ summary }) {
  const fields = [
    { label: "Master Topics",   val: summary?.topics    ?? 0 },
    { label: "Universal Niches", val: summary?.niches   ?? 0 },
    { label: "Ontology Cells",  val: summary?.cells     ?? 0 },
    { label: "Acq. Families",   val: summary?.families  ?? 0 },
    { label: "Domain Subjects", val: (summary?.subjects ?? 0).toLocaleString() },
    { label: "Endpoint Cands.", val: (summary?.endpoints ?? 0).toLocaleString() },
  ];
  const avail = summary?.available;
  return (
    <div style={{ padding: "10px 0" }}>
      <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <Chip label={avail ? "PACK LOADED" : "NOT SEEDED"} color={avail ? GN : AM} />
        {summary?.pack_dir && (
          <span style={{ color: GRAY, fontSize: 9, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {summary.pack_dir.replace(/^.*\/ontology\//, "ontology/")}
          </span>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {fields.map(({ label, val }) => (
          <div key={label} style={{
            background: "rgba(41,231,255,0.04)",
            border: "1px solid rgba(41,231,255,0.08)",
            borderRadius: 5,
            padding: "6px 10px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span style={{ color: GRAY, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
            <span style={{ color: CY, fontSize: 13, fontWeight: 700, fontFamily: "monospace" }}>{val}</span>
          </div>
        ))}
      </div>
      {!avail && (
        <div style={{ marginTop: 10, color: AM, fontSize: 10, fontFamily: "monospace", lineHeight: 1.5 }}>
          World pack not seeded. Load via POST /v1/jarvis/world/load
          or drop catalogues into ontology/world_pack/catalogues/.
        </div>
      )}
    </div>
  );
}

// ─── SubjectsTab ──────────────────────────────────────────────────────────────

function SubjectsTab({ subjects, loading }) {
  const [topicFilter, setTopicFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // derive unique topics
  const topics = ["ALL", ...Array.from(new Set(subjects.map(s => s.master_topic).filter(Boolean))).sort()];

  const filtered = subjects.filter(s => {
    const matchTopic = topicFilter === "ALL" || s.master_topic === topicFilter;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (s.domain_subject || "").toLowerCase().includes(q) ||
      (s.neuron_type || "").toLowerCase().includes(q);
    return matchTopic && matchSearch;
  });

  const topicColor = (t) => {
    const idx = topics.indexOf(t);
    return TOPIC_COLORS[(idx - 1 + TOPIC_COLORS.length) % TOPIC_COLORS.length] || CY;
  };

  if (loading) return <div style={{ color: GRAY, fontSize: 10, padding: 12, fontFamily: "monospace" }}>Loading subjects…</div>;

  return (
    <div>
      {/* topic chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
        {topics.slice(0, 12).map(t => (
          <button key={t} onClick={() => setTopicFilter(t)} style={{
            background: topicFilter === t ? `${topicColor(t)}22` : "transparent",
            border: `1px solid ${topicFilter === t ? topicColor(t) : GRAY}55`,
            borderRadius: 3,
            color: topicFilter === t ? topicColor(t) : GRAY,
            cursor: "pointer",
            fontFamily: "monospace",
            fontSize: 8,
            padding: "2px 6px",
            whiteSpace: "nowrap",
          }}>
            {t === "ALL" ? "ALL" : t.slice(0, 18)}
          </button>
        ))}
      </div>
      {/* search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search subjects…"
        style={{
          background: "rgba(41,231,255,0.06)",
          border: "1px solid rgba(41,231,255,0.18)",
          borderRadius: 4,
          color: CY,
          fontFamily: "monospace",
          fontSize: 10,
          outline: "none",
          padding: "4px 8px",
          width: "100%",
          boxSizing: "border-box",
          marginBottom: 6,
        }}
      />
      {/* rows */}
      <div style={{ maxHeight: 280, overflowY: "auto" }}>
        {filtered.length === 0 && (
          <div style={{ color: GRAY, fontSize: 10, fontFamily: "monospace", padding: "8px 0" }}>
            No subjects match.
          </div>
        )}
        {filtered.slice(0, 80).map((s, i) => {
          const parts = (s.domain_subject || "").split("/");
          const concept = parts.length >= 2 ? parts[1].trim() : s.domain_subject;
          const ctx     = parts.length >= 3 ? parts[2].trim() : "";
          const tc      = topicColor(s.master_topic);
          return (
            <div key={s.subject_id || i} style={{
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              padding: "5px 2px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                <Chip label={s.master_topic || "—"} color={tc} />
                {s.neuron_type && <Chip label={s.neuron_type} color={PU} />}
                {s.refresh_cadence && <Chip label={s.refresh_cadence} color={OR} />}
              </div>
              <div style={{ color: "#CBD5E1", fontSize: 10, marginTop: 3, fontFamily: "monospace" }}>
                {concept}
                {ctx && <span style={{ color: GRAY }}>{" · "}{ctx}</span>}
              </div>
            </div>
          );
        })}
        {filtered.length > 80 && (
          <div style={{ color: GRAY, fontSize: 9, padding: "6px 0", fontFamily: "monospace" }}>
            + {filtered.length - 80} more — refine filter to narrow.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── EndpointsTab ─────────────────────────────────────────────────────────────

function EndpointsTab({ endpoints, loading }) {
  const [search, setSearch] = useState("");

  const filtered = endpoints.filter(e => {
    const q = search.toLowerCase();
    return !q ||
      (e.source_name || "").toLowerCase().includes(q) ||
      (e.access_method || "").toLowerCase().includes(q) ||
      (e.recommended_ingestion_connector || "").toLowerCase().includes(q);
  });

  if (loading) return <div style={{ color: GRAY, fontSize: 10, padding: 12, fontFamily: "monospace" }}>Loading endpoints…</div>;

  return (
    <div>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search endpoints…"
        style={{
          background: "rgba(41,231,255,0.06)",
          border: "1px solid rgba(41,231,255,0.18)",
          borderRadius: 4,
          color: CY,
          fontFamily: "monospace",
          fontSize: 10,
          outline: "none",
          padding: "4px 8px",
          width: "100%",
          boxSizing: "border-box",
          marginBottom: 6,
        }}
      />
      <div style={{ maxHeight: 290, overflowY: "auto" }}>
        {filtered.length === 0 && (
          <div style={{ color: GRAY, fontSize: 10, fontFamily: "monospace", padding: "8px 0" }}>
            No endpoints match.
          </div>
        )}
        {filtered.slice(0, 80).map((e, i) => {
          const ac = e.access_method || "";
          const acColor = ACCESS_COLOR[ac.replace(/\s/g, "_")] || GRAY;
          const conn = e.recommended_ingestion_connector || "";
          return (
            <div key={i} style={{
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              padding: "5px 2px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 2 }}>
                <span style={{ color: "#CBD5E1", fontSize: 10, fontFamily: "monospace", fontWeight: 600 }}>
                  {e.source_name || "Unknown Source"}
                </span>
                {ac && <Chip label={ac} color={acColor} />}
                {conn && <Chip label={conn} color={GN} />}
              </div>
              {e.official_url && (
                <a
                  href={e.official_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: CY,
                    fontSize: 9,
                    fontFamily: "monospace",
                    textDecoration: "none",
                    wordBreak: "break-all",
                    opacity: 0.75,
                  }}
                >
                  {e.official_url.length > 70 ? e.official_url.slice(0, 67) + "…" : e.official_url}
                </a>
              )}
            </div>
          );
        })}
        {filtered.length > 80 && (
          <div style={{ color: GRAY, fontSize: 9, padding: "6px 0", fontFamily: "monospace" }}>
            + {filtered.length - 80} more — refine search.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TargetsTab ───────────────────────────────────────────────────────────────

function TargetsTab({ targets, loading }) {
  const [search, setSearch] = useState("");
  const filtered = targets.filter(t => !search || t.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div style={{ color: GRAY, fontSize: 10, padding: 12, fontFamily: "monospace" }}>Loading targets…</div>;

  return (
    <div>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Filter targets…"
        style={{
          background: "rgba(41,231,255,0.06)",
          border: "1px solid rgba(41,231,255,0.18)",
          borderRadius: 4,
          color: CY,
          fontFamily: "monospace",
          fontSize: 10,
          outline: "none",
          padding: "4px 8px",
          width: "100%",
          boxSizing: "border-box",
          marginBottom: 6,
        }}
      />
      <div style={{ maxHeight: 290, overflowY: "auto" }}>
        {filtered.length === 0 && (
          <div style={{ color: GRAY, fontSize: 10, fontFamily: "monospace", padding: "8px 0" }}>No targets match.</div>
        )}
        {filtered.map((t, i) => (
          <div key={i} style={{
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            padding: "4px 2px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <span style={{ color: GRAY, fontSize: 9, fontFamily: "monospace", minWidth: 22 }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span style={{ color: "#CBD5E1", fontSize: 10, fontFamily: "monospace" }}>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function WorldIntelPanel() {
  const [open, setOpen]           = useState(false);
  const [tab, setTab]             = useState("SUMMARY");
  const [summary, setSummary]     = useState(null);
  const [subjects, setSubjects]   = useState([]);
  const [endpoints, setEndpoints] = useState([]);
  const [targets, setTargets]     = useState([]);
  const [loadingS, setLoadingS]   = useState(false);
  const [loadingE, setLoadingE]   = useState(false);
  const [loadingT, setLoadingT]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);

  const subjFetched = useRef(false);
  const epFetched   = useRef(false);
  const tgtFetched  = useRef(false);
  const timerRef    = useRef(null);

  // poll summary
  const fetchSummary = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/world/summary`, { headers: hdr() });
      if (r.ok) { setSummary(await r.json()); setLastFetch(Date.now()); }
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    fetchSummary();
    timerRef.current = setInterval(fetchSummary, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [fetchSummary]);

  // toggle listener
  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:winp-toggle", onToggle);
    return () => window.removeEventListener("jarvis:winp-toggle", onToggle);
  }, []);

  // lazy tab loads
  useEffect(() => {
    if (!open) return;
    if (tab === "SUBJECTS" && !subjFetched.current) {
      subjFetched.current = true;
      setLoadingS(true);
      fetch(`${apiBase()}/v1/jarvis/world/subjects?limit=100`, { headers: hdr() })
        .then(r => r.ok ? r.json() : { subjects: [] })
        .then(d => setSubjects(d?.subjects ?? d ?? []))
        .catch(() => {})
        .finally(() => setLoadingS(false));
    }
    if (tab === "ENDPOINTS" && !epFetched.current) {
      epFetched.current = true;
      setLoadingE(true);
      fetch(`${apiBase()}/v1/jarvis/world/endpoints?limit=100`, { headers: hdr() })
        .then(r => r.ok ? r.json() : { endpoints: [] })
        .then(d => setEndpoints(d?.endpoints ?? d ?? []))
        .catch(() => {})
        .finally(() => setLoadingE(false));
    }
    if (tab === "TARGETS" && !tgtFetched.current) {
      tgtFetched.current = true;
      setLoadingT(true);
      fetch(`${apiBase()}/v1/jarvis/world/research-targets?limit=50`, { headers: hdr() })
        .then(r => r.ok ? r.json() : { targets: [] })
        .then(d => setTargets(d?.targets ?? d ?? []))
        .catch(() => {})
        .finally(() => setLoadingT(false));
    }
  }, [open, tab]);

  // assess
  const handleAssess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const sub = summary?.subjects ?? 0;
      const ep  = summary?.endpoints ?? 0;
      const tp  = summary?.topics ?? 0;
      const prompt =
        `Summarise the World Intelligence Pack status: ${tp} master topics, ` +
        `${sub} domain subjects, ${ep} endpoint candidates. ` +
        `Which topics have the most subjects and what are the highest-value ingestion targets?`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt = d?.response || d?.answer || d?.text || "Assessment complete.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch { /* noop */ }
    setAssessing(false);
  }, [assessing, summary]);

  // badge
  const subjectCount = summary?.subjects ?? 0;
  const isAvail      = summary?.available;
  const badgeColor   = subjectCount > 0 ? GN : (isAvail === false ? AM : DIM);
  const badgeLabel   = subjectCount > 0 ? subjectCount.toLocaleString() : (isAvail === false ? "!" : "—");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="World Intelligence Pack Panel"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 209,
          background: "rgba(10,20,30,0.85)",
          border: `1px solid ${CY}44`,
          borderRadius: 5,
          color: CY,
          cursor: "pointer",
          fontFamily: "monospace",
          fontSize: 9,
          letterSpacing: "0.06em",
          padding: "4px 8px",
          display: "flex",
          alignItems: "center",
          gap: 5,
          whiteSpace: "nowrap",
        }}
      >
        ◉ WINP
        {badgeLabel !== "—" && (
          <span style={{
            background: badgeColor,
            borderRadius: 8,
            color: "#000",
            fontSize: 8,
            fontWeight: 700,
            padding: "1px 5px",
            minWidth: 16,
            textAlign: "center",
          }}>
            {badgeLabel}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed",
      bottom: 44,
      left: BTN_LEFT,
      zIndex: 209,
      width: 480,
      maxHeight: "80vh",
      background: "rgba(5,14,22,0.97)",
      border: `1px solid ${CY}33`,
      borderRadius: 8,
      boxShadow: `0 0 32px rgba(41,231,255,0.08)`,
      display: "flex",
      flexDirection: "column",
      fontFamily: "monospace",
      overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        borderBottom: `1px solid ${CY}22`,
        background: "rgba(41,231,255,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: CY, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>
            ◉ WORLD INTELLIGENCE PACK
          </span>
          <Chip label={isAvail ? "LOADED" : "UNSEEDED"} color={isAvail ? GN : AM} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {lastFetch && (
            <span style={{ color: GRAY, fontSize: 8 }}>{age(lastFetch)}</span>
          )}
          <button
            onClick={handleAssess}
            disabled={assessing}
            style={{
              background: assessing ? `${GRAY}22` : `${GN}22`,
              border: `1px solid ${assessing ? GRAY : GN}55`,
              borderRadius: 3,
              color: assessing ? GRAY : GN,
              cursor: assessing ? "default" : "pointer",
              fontFamily: "monospace",
              fontSize: 8,
              padding: "2px 7px",
            }}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "transparent",
              border: "none",
              color: GRAY,
              cursor: "pointer",
              fontSize: 12,
              lineHeight: 1,
              padding: "0 2px",
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <StatTile label="Topics"    value={summary?.topics    ?? "—"} color={CY} />
        <StatTile label="Subjects"  value={(summary?.subjects  ?? 0).toLocaleString() || "—"} color={GN} />
        <StatTile label="Endpoints" value={(summary?.endpoints ?? 0).toLocaleString() || "—"} color={PU} />
        <StatTile label="Cells"     value={summary?.cells     ?? "—"} color={AM} />
      </div>

      {/* tab bar */}
      <div style={{ display: "flex", gap: 5, padding: "0 12px 8px" }}>
        {["SUMMARY", "SUBJECTS", "ENDPOINTS", "TARGETS"].map(t => (
          <TabBtn key={t} label={t} active={tab === t} onClick={() => setTab(t)} />
        ))}
      </div>

      {/* tab content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
        {tab === "SUMMARY"   && <SummaryTab   summary={summary} />}
        {tab === "SUBJECTS"  && <SubjectsTab  subjects={subjects}  loading={loadingS} />}
        {tab === "ENDPOINTS" && <EndpointsTab endpoints={endpoints} loading={loadingE} />}
        {tab === "TARGETS"   && <TargetsTab   targets={targets}    loading={loadingT} />}
      </div>
    </div>
  );
}
