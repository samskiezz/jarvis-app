/**
 * F187 — Dataset × Contact Intelligence Bridge (DSCONT)
 *
 * Parallel-fetches /v1/datasets and /entities/Contact, then keyword-correlates
 * each dataset (name, description, tags, owner) against contact records (name,
 * org, role, email, tags) to surface:
 *
 *   REFERENCED  — at least one contact keyword-matches this dataset
 *   UNREFERENCED — no contact record aligns with this dataset
 *
 * Stat tiles: datasets / contacts / referenced / unreferenced
 * Filter tabs: ALL | REFERENCED | UNREFERENCED + text search
 * Expand dataset → matched contacts with role badge + relevance score.
 * Teal badge on referenced count.
 * ▶ ASSESS: 2-sentence data-ownership brief via /v1/jarvis/agent/chat +
 *   jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ DSCONT  at bottom:8 left:66280, zIndex:128.
 * Event:   jarvis:dscont-toggle
 * Voice:   "dataset contact / dscont / contact dataset / data owner /
 *           which contacts are in datasets / dataset ownership"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 66280;
const POLL_MS  = 90_000;
const TEAL     = "#2DD4BF";
const SLATE    = "#6E8AA0";
const VIOLET   = "#A78BFA";
const AMBER    = "#F59E0B";
const GREEN    = "#34D399";
const CYAN     = "#29E7FF";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const DSCONT_RE =
  /\b(dataset\s+contact[s]?|contact\s+dataset[s]?|dscont|data\s+owner[s]?|dataset\s+owner[s]?|which\s+contact[s]?\s+(are\s+)?(in|linked\s+to|associated\s+with)\s+dataset[s]?|dataset\s+ownership|data\s+steward[s]?)\b/i;

export function isDscontQuery(q) { return DSCONT_RE.test(q); }

export async function buildDscontScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [dsRes, cRes] = await Promise.all([
      fetch(`${base}/v1/datasets`,         { headers: hdr }),
      fetch(`${base}/entities/Contact`,    { headers: hdr }),
    ]);
    const datasets  = normaliseDatasets(await dsRes.json());
    const contacts  = normaliseContacts(await cRes.json());

    const referenced = datasets.filter(
      (ds) => contacts.some((c) => relevance(ds, c) > 0)
    ).length;
    const unreferenced = datasets.length - referenced;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS dataset contact intelligence analysis: ${datasets.length} datasets cross-referenced ` +
          `against ${contacts.length} contact records. ${referenced} datasets have at least one ` +
          `contact match (potential data owner or stakeholder); ${unreferenced} datasets show no ` +
          `contact alignment (ownership gap). ` +
          `Provide a 2-sentence data-ownership brief — formal British butler tone, first person, ` +
          `highlight the coverage gap if significant.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Dataset contact intelligence analysis complete, sir.").trim();
  } catch {
    return "Dataset contact assessment unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseDatasets(raw) {
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.datasets)           ? raw.datasets
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((ds, i) => ({
    id:          ds.id           || ds.dataset_id    || String(i),
    name:        ds.name         || ds.title         || ds.label        || `Dataset ${i + 1}`,
    description: (ds.description || ds.summary       || ds.notes        || "").toString().slice(0, 300),
    owner:       ds.owner        || ds.owned_by      || ds.author       || "",
    tags:        Array.isArray(ds.tags) ? ds.tags.join(" ") : (ds.tags || ""),
    rows:        ds.rows         || ds.row_count      || ds.count        || null,
    status:      ds.status       || ds.state          || "active",
    category:    ds.category     || ds.type           || ds.domain       || "",
  }));
}

function normaliseContacts(raw) {
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.contacts)           ? raw.contacts
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((c, i) => ({
    id:    c.id           || c.contact_id    || String(i),
    name:  c.name         || c.full_name     || c.display_name  || `Contact ${i + 1}`,
    org:   c.org          || c.organisation  || c.organization   || c.company        || "",
    role:  c.role         || c.title         || c.position       || c.job_title      || "",
    email: c.email        || c.email_address || "",
    tags:  Array.isArray(c.tags) ? c.tags.join(" ") : (c.tags  || ""),
    notes: (c.notes       || c.bio           || c.summary        || "").toString().slice(0, 200),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"'%]+/)
    .filter((w) => w.length >= 3);
}

function relevance(dataset, contact) {
  const dw = keywords(
    `${dataset.name} ${dataset.description} ${dataset.owner} ${dataset.tags} ${dataset.category}`
  );
  const cw = keywords(
    `${contact.name} ${contact.org} ${contact.role} ${contact.email} ${contact.tags} ${contact.notes}`
  );
  return dw.filter((w) => cw.some((p) => p.includes(w) || w.includes(p))).length;
}

function buildLinked(datasets, contacts) {
  return datasets.map((ds) => {
    const matched = contacts
      .map((c) => ({ ...c, score: relevance(ds, c) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...ds, contacts: matched, referenced: matched.length > 0 };
  });
}

function fmtRows(rows) {
  if (rows == null) return null;
  const n = Number(rows);
  if (isNaN(n)) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M rows`;
  if (n >= 1_000)    return `${(n / 1_000).toFixed(1)}K rows`;
  return `${n} rows`;
}

function statusColor(status) {
  const lc = String(status || "").toLowerCase();
  if (lc.includes("active") || lc.includes("live"))   return GREEN;
  if (lc.includes("archive") || lc.includes("old"))   return SLATE;
  if (lc.includes("draft")  || lc.includes("staged")) return AMBER;
  return CYAN;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "REFERENCED", "UNREFERENCED"];

export default function DatasetContactBridge() {
  const [open,       setOpen]       = useState(false);
  const [datasets,   setDatasets]   = useState([]);
  const [contacts,   setContacts]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [filter,     setFilter]     = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [lastFetch,  setLastFetch]  = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [dsRes, cRes] = await Promise.all([
        fetch(`${base}/v1/datasets`,      { headers: hdr }),
        fetch(`${base}/entities/Contact`, { headers: hdr }),
      ]);
      setDatasets(normaliseDatasets(await dsRes.json()));
      setContacts(normaliseContacts(await cRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:dscont-toggle", onToggle);
    return () => window.removeEventListener("jarvis:dscont-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildDscontScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked       = buildLinked(datasets, contacts);
  const referenced   = linked.filter((ds) => ds.referenced).length;
  const unreferenced = linked.length - referenced;

  const displayed = linked.filter((ds) => {
    if (filter === "REFERENCED"   && !ds.referenced) return false;
    if (filter === "UNREFERENCED" &&  ds.referenced) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      ds.name.toLowerCase().includes(q) ||
      ds.description.toLowerCase().includes(q) ||
      ds.category.toLowerCase().includes(q) ||
      ds.owner.toLowerCase().includes(q)
    );
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Dataset × Contact Intelligence Bridge (DSCONT)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 128,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${TEAL}55`,
          color: TEAL, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {referenced > 0
          ? <><span style={{ background: TEAL, color: "#000", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{referenced}</span>◈ DSCONT</>
          : "◈ DSCONT"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 128,
      width: 500, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${TEAL}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${TEAL}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${TEAL}33` }}>
        <span style={{ color: TEAL, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ DSCONT</span>
        <span style={{ color: SLATE, fontSize: 9, flex: 1 }}>DATASET × CONTACT INTELLIGENCE BRIDGE</span>
        {lastFetch && <span style={{ color: SLATE, fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: TEAL, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${TEAL}22` }}>
        {[
          { label: "DATASETS",     value: linked.length, col: SLATE  },
          { label: "CONTACTS",     value: contacts.length, col: VIOLET },
          { label: "REFERENCED",   value: referenced,    col: TEAL   },
          { label: "UNREFERENCED", value: unreferenced,  col: AMBER  },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: SLATE, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${TEAL}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${TEAL}22` : "none",
            border: `1px solid ${filter === t ? TEAL : SLATE}`,
            color: filter === t ? TEAL : SLATE,
            borderRadius: 5, padding: "2px 8px", fontSize: 9,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search datasets…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${TEAL}`,
          color: TEAL, borderRadius: 5, padding: "2px 8px",
          fontSize: 9, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* dataset list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: SLATE, fontSize: 10, textAlign: "center", padding: 20 }}>
            No datasets match the current filter.
          </div>
        )}
        {displayed.map((ds) => {
          const isExp  = expanded === ds.id;
          const col    = ds.referenced ? TEAL : AMBER;
          const badge  = ds.referenced ? "REFERENCED" : "UNREFERENCED";
          const rowStr = fmtRows(ds.rows);
          return (
            <div key={ds.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : ds.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${TEAL}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${ds.referenced ? `${TEAL}44` : "#6E8AA022"}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col,
                  flexShrink: 0,
                }}>
                  {badge}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{ds.name}</span>
                {ds.category && (
                  <span style={{
                    fontSize: 8, padding: "1px 5px", borderRadius: 4,
                    background: `${VIOLET}22`, color: VIOLET, letterSpacing: 1,
                  }}>
                    {ds.category.slice(0, 10).toUpperCase()}
                  </span>
                )}
                {rowStr && (
                  <span style={{ fontSize: 8, color: CYAN }}>{rowStr}</span>
                )}
                <span style={{
                  fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                  background: `${statusColor(ds.status)}22`, color: statusColor(ds.status),
                  letterSpacing: 1,
                }}>
                  {String(ds.status || "ACTIVE").toUpperCase().slice(0, 8)}
                </span>
                {ds.referenced && (
                  <span style={{ fontSize: 8, color: TEAL }}>{ds.contacts.length} contact{ds.contacts.length !== 1 ? "s" : ""}</span>
                )}
                <span style={{ color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${TEAL}22` }}>
                  {ds.description && (
                    <div style={{ fontSize: 9, color: SLATE, marginBottom: 6 }}>
                      {ds.description.slice(0, 120)}
                    </div>
                  )}
                  {ds.owner && (
                    <div style={{ fontSize: 9, color: CYAN, marginBottom: 6 }}>
                      Owner field: {ds.owner}
                    </div>
                  )}
                  {ds.contacts.length === 0 ? (
                    <div style={{ fontSize: 9, color: AMBER }}>
                      No contact records keyword-correlate with this dataset — ownership gap.
                    </div>
                  ) : (
                    ds.contacts.map((c) => (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5" }}>{c.name}</span>
                        {c.org && (
                          <span style={{ fontSize: 8, color: VIOLET }}>{c.org.slice(0, 14)}</span>
                        )}
                        {c.role && (
                          <span style={{
                            fontSize: 8, padding: "1px 5px", borderRadius: 4,
                            background: `${TEAL}22`, color: TEAL, letterSpacing: 1,
                          }}>
                            {c.role.slice(0, 12).toUpperCase()}
                          </span>
                        )}
                        <span style={{ fontSize: 8, color: TEAL }}>rel:{c.score}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
