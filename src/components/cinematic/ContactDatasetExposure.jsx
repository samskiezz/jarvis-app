/**
 * ContactDatasetExposure — F200
 *
 * Parallel-fetches /entities/Contact + /v1/datasets then keyword-
 * correlates contact name/role/org/tags against dataset catalog
 * metadata to surface:
 *   DOCUMENTED (≥1 dataset match) — contact has a data trail
 *   INVISIBLE  (0 matches)        — contact absent from all datasets
 *
 * Stat tiles: contacts / datasets / documented / invisible
 * Filter tabs: ALL / DOCUMENTED / INVISIBLE
 * Text search.
 * Expand contact → matched dataset cards with row count + relevance bar.
 * ▶ ASSESS DATA TRAILS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90 s auto-refresh.
 *
 * Intent: "contact dataset" / "ctdset" / "contact data trail" /
 *         "data trail" / "which contacts are in datasets" /
 *         "contact dataset exposure" / "invisible contacts"
 *   → jarvis:ctdset-toggle + TTS brief via buildCtdsetScript()
 *
 * Toggle: ◈ CTDSET at left:34040, bottom:8, zIndex:100.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF4444";
const DIM   = "#4A6070";
const BG    = "rgba(3,5,9,0.97)";
const BTN_LEFT   = 34040;
const REFRESH_MS = 90_000;
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── intent exports ────────────────────────────────────────────────────────────

const CTDSET_RE =
  /\b(ctdset|contact.datas?e?t|datas?e?t.contact|contact.data.trail|data.trail|which.contacts.are.in|invisible.contact|contact.data.expos|contact.catalog)\b/i;

export function isCtdsetQuery(t) { return CTDSET_RE.test(t || ""); }

export async function buildCtdsetScript() {
  const [cRaw, dRaw] = await Promise.allSettled([
    fetch(`${apiBase()}/entities/Contact`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
    fetch(`${apiBase()}/v1/datasets`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
  ]);
  const contacts  = normaliseContacts(cRaw.status === "fulfilled" ? cRaw.value : []);
  const datasets  = normaliseDatasets(dRaw.status === "fulfilled" ? dRaw.value : []);
  const pairs     = correlate(contacts, datasets);
  const documented = pairs.filter((p) => p.matches.length >= 1).length;
  const invisible  = pairs.filter((p) => p.matches.length === 0).length;
  const topInvisible = pairs
    .filter((p) => p.matches.length === 0)
    .slice(0, 3)
    .map((p) => p.contact.name)
    .join(", ") || "none";
  return (
    `Assess JARVIS contact dataset exposure in 2 sentences. ` +
    `${contacts.length} contacts vs ${datasets.length} datasets: ` +
    `${documented} DOCUMENTED (appear in ≥1 dataset), ` +
    `${invisible} INVISIBLE (no data trail in any dataset — coverage gap). ` +
    `Top invisible contacts: ${topInvisible}.`
  );
}

// ─── normalise helpers ─────────────────────────────────────────────────────────

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (raw && Array.isArray(raw[k])) return raw[k];
  }
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseContacts(raw) {
  return normaliseArray(raw, ["contacts", "people", "persons"]).map((c) => ({
    id:   c.id || c.contact_id || String(Math.random()),
    name: c.name || c.full_name ||
      [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown",
    role: c.role || c.title || c.position || "",
    org:  c.organisation || c.organization || c.company || c.employer || "",
    tags: [...(c.tags || []), ...(c.labels || [])].map(String),
  }));
}

function normaliseDatasets(raw) {
  return normaliseArray(raw, ["datasets", "catalog", "items"]).map((d) => ({
    id:   d.id || d.dataset_id || String(Math.random()),
    name: d.name || d.title || d.dataset_name || "Unnamed Dataset",
    desc: d.description || d.summary || d.schema || "",
    rows: d.row_count || d.rows || d.count || d.records || 0,
    tags: [...(d.tags || []), ...(d.labels || []), ...(d.categories || [])].map(String),
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(contact, dataset) {
  const ctWords = tokens(
    `${contact.name} ${contact.role} ${contact.org} ${contact.tags.join(" ")}`
  );
  const dsText  = `${dataset.name} ${dataset.desc} ${dataset.tags.join(" ")}`.toLowerCase();
  const hits = ctWords.filter((w) => dsText.includes(w));
  return hits.length / Math.max(ctWords.length, 1);
}

function correlate(contacts, datasets) {
  return contacts.map((contact) => {
    const scored = datasets
      .map((d) => ({ d, score: matchScore(contact, d) }))
      .filter((x) => x.score > 0.08)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { contact, matches: scored };
  });
}

// ─── sub-components ────────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: "1 1 0", minWidth: 60, background: "rgba(0,0,0,0.3)",
      border: `1px solid ${color}33`, borderRadius: 6,
      padding: "6px 8px", textAlign: "center",
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: MONO }}>{value}</div>
      <div style={{ fontSize: 9, color: DIM, letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ScoreBar({ score }) {
  const color = score > 0.5 ? GREEN : score > 0.25 ? AMBER : CY;
  return (
    <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, flex: 1 }}>
      <div style={{
        width: `${Math.round(score * 100)}%`, height: "100%",
        background: color, borderRadius: 2, transition: "width 0.4s ease",
      }} />
    </div>
  );
}

// ─── main component ────────────────────────────────────────────────────────────

export default function ContactDatasetExposure() {
  const [open, setOpen]           = useState(false);
  const [pairs, setPairs]         = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [cRes, dRes] = await Promise.allSettled([
        fetch(`${apiBase()}/entities/Contact`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
        fetch(`${apiBase()}/v1/datasets`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      ]);
      const contacts = normaliseContacts(cRes.status === "fulfilled" ? cRes.value : []);
      const datasets = normaliseDatasets(dRes.status === "fulfilled" ? dRes.value : []);
      setPairs(correlate(contacts, datasets));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:ctdset-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ctdset-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const documented = pairs.filter((p) => p.matches.length >= 1);
  const invisible  = pairs.filter((p) => p.matches.length === 0);

  const visible = pairs
    .filter((p) => {
      if (tab === "DOCUMENTED") return p.matches.length >= 1;
      if (tab === "INVISIBLE")  return p.matches.length === 0;
      return true;
    })
    .filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.contact.name.toLowerCase().includes(q) ||
        p.contact.role.toLowerCase().includes(q) ||
        p.contact.org.toLowerCase().includes(q) ||
        p.matches.some((m) => m.d.name.toLowerCase().includes(q))
      );
    });

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildCtdsetScript();
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: script }),
      });
      const json = await res.json();
      const text =
        json.response || json.reply || json.message || json.content ||
        JSON.stringify(json).slice(0, 200);
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text } })
      );
    } catch (_) {
      // silently ignore assessment errors
    } finally {
      setAssessing(false);
    }
  }

  const toggleRow = (id) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Contact × Dataset Exposure (CTDSET)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 100,
          background: "rgba(3,5,9,0.85)", border: `1px solid ${AMBER}55`,
          borderRadius: 4, color: AMBER, fontFamily: MONO, fontSize: 9,
          letterSpacing: 1, padding: "3px 7px", cursor: "pointer",
        }}
      >
        ◈ CTDSET
        {invisible.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 8, fontWeight: 700,
          }}>
            {invisible.length}
          </span>
        )}
      </button>
    );
  }

  const TABS = ["ALL", "DOCUMENTED", "INVISIBLE"];
  const tabColor = (t) => {
    if (t === "INVISIBLE")   return AMBER;
    if (t === "DOCUMENTED")  return GREEN;
    return CY;
  };

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 200, bottom: 48, zIndex: 100,
      width: 520, maxHeight: "75vh",
      background: BG, border: `1px solid ${AMBER}66`,
      borderRadius: 8, fontFamily: MONO, fontSize: 10,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: `1px solid ${AMBER}33`,
        background: "rgba(0,0,0,0.4)",
      }}>
        <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2 }}>
          ◈ CONTACT × DATASET EXPOSURE
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: "none", border: `1px solid ${CY}66`,
              borderRadius: 4, color: CY, fontFamily: MONO, fontSize: 9,
              letterSpacing: 1, padding: "2px 8px", cursor: "pointer",
            }}
          >
            {assessing ? "…" : "▶ ASSESS DATA TRAILS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none", border: "none", color: DIM,
              fontSize: 14, cursor: "pointer", lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="CONTACTS"    value={pairs.length}       color={CY}   />
        <Tile label="DATASETS"    value={
          pairs.length > 0
            ? [...new Set(pairs.flatMap((p) => p.matches.map((m) => m.d.id)))].length
            : 0
        } color={CY} />
        <Tile label="DOCUMENTED"  value={documented.length}  color={GREEN} />
        <Tile label="INVISIBLE"   value={invisible.length}   color={AMBER} />
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 12px 6px" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${tabColor(t)}22` : "none",
              border: `1px solid ${tab === t ? tabColor(t) : DIM}`,
              borderRadius: 3, color: tab === t ? tabColor(t) : DIM,
              fontFamily: MONO, fontSize: 8, letterSpacing: 1,
              padding: "2px 6px", cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: "auto", background: "rgba(0,0,0,0.4)",
            border: `1px solid ${DIM}`, borderRadius: 3,
            color: CY, fontFamily: MONO, fontSize: 9,
            padding: "2px 6px", width: 120, outline: "none",
          }}
        />
      </div>

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 12px" }}>
        {loading && (
          <div style={{ color: DIM, padding: "8px 0" }}>◌ loading…</div>
        )}
        {error && (
          <div style={{ color: RED, padding: "4px 0" }}>⚠ {error}</div>
        )}
        {!loading && visible.length === 0 && !error && (
          <div style={{ color: DIM, padding: "8px 0" }}>no results</div>
        )}
        {visible.map((p) => {
          const status = p.matches.length >= 1 ? "DOCUMENTED" : "INVISIBLE";
          const statusColor = status === "DOCUMENTED" ? GREEN : AMBER;
          const isExp = expanded[p.contact.id];
          return (
            <div
              key={p.contact.id}
              style={{
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                paddingBottom: 6, marginBottom: 6,
              }}
            >
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  cursor: "pointer", padding: "4px 0",
                }}
                onClick={() => toggleRow(p.contact.id)}
              >
                <span style={{
                  fontSize: 8, border: `1px solid ${statusColor}`,
                  borderRadius: 3, color: statusColor,
                  padding: "1px 4px", letterSpacing: 1, flexShrink: 0,
                }}>
                  {status}
                </span>
                <span style={{ color: CY, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.contact.name}
                </span>
                {p.contact.role && (
                  <span style={{ color: DIM, fontSize: 8, flexShrink: 0 }}>
                    {p.contact.role}
                  </span>
                )}
                <span style={{ color: DIM, fontSize: 8, flexShrink: 0 }}>
                  {p.matches.length} ds
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>
                  {isExp ? "▲" : "▼"}
                </span>
              </div>

              {isExp && (
                <div style={{ paddingLeft: 12, paddingBottom: 4 }}>
                  {p.contact.org && (
                    <div style={{ color: DIM, fontSize: 8, marginBottom: 4 }}>
                      org: {p.contact.org}
                    </div>
                  )}
                  {p.matches.length === 0 ? (
                    <div style={{ color: AMBER, fontSize: 9 }}>
                      ⚠ not referenced in any dataset — INVISIBLE contact
                    </div>
                  ) : (
                    p.matches.map(({ d, score }) => (
                      <div key={d.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        marginBottom: 3,
                      }}>
                        <span style={{
                          color: GREEN, fontSize: 9, flex: 1,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {d.name}
                        </span>
                        {d.rows > 0 && (
                          <span style={{ color: DIM, fontSize: 8, flexShrink: 0 }}>
                            {d.rows.toLocaleString()} rows
                          </span>
                        )}
                        <ScoreBar score={score} />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: "4px 12px", borderTop: `1px solid ${AMBER}22`,
        color: DIM, fontSize: 8, letterSpacing: 1,
        display: "flex", justifyContent: "space-between",
      }}>
        <span>CTDSET · /entities/Contact × /v1/datasets</span>
        <span
          onClick={load}
          style={{ cursor: "pointer", color: CY }}
          title="refresh now"
        >
          ↺ {REFRESH_MS / 1000}s
        </span>
      </div>
    </div>
  );
}
