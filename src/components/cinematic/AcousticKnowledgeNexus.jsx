/**
 * AcousticKnowledgeNexus — F670
 * "JARVIS, ackno / acoustic knowledge / acoustic articles / sound knowledge /
 *  acoustic intel knowledge / sensor knowledge / acoustic knowledge nexus"
 * Cross-references /v1/acoustic/contacts against /knowledge/ (articles).
 * DOCUMENTED contacts (≥1 article keyword-match) vs UNDOCUMENTED (knowledge blind spots).
 * Coverage % tile; ALL/DOCUMENTED/UNDOCUMENTED filter tabs + search; click-to-expand matched articles.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 126_880;
const Z_INDEX  = 206;

const ACKNO_RE =
  /\backnow?\b|\bacoustic.?knowl\w*\b|\bacoustic.?article\w*\b|\bsound.?knowl\w*\b|\bacoustic.?intel.?knowl\w*\b|\bsensor.?knowl\w*\b|\bacoustic.?knowl\w*.?nexus\b/i;

export function isAcknoQuery(text) {
  return ACKNO_RE.test(text || "");
}

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

function normaliseContacts(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.contacts)
    ? data.contacts
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((c, i) => ({
    id:             c.id             || `ac-${i}`,
    label:          c.label          || c.classification || c.class || `Contact ${i + 1}`,
    source:         c.source         || c.sensor         || "",
    classification: c.classification || c.label          || "",
    confidence:     c.confidence     != null ? c.confidence : null,
  }));
}

function normaliseArticles(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.articles)
    ? data.articles
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((a, i) => ({
    id:      a.id      || `art-${i}`,
    title:   a.title   || a.name    || a.subject || `Article ${i + 1}`,
    kind:    (a.kind   || a.type    || a.category || "article").toString().toUpperCase(),
    summary: a.summary || a.content || a.body    || a.description || "",
  }));
}

function crossRef(contacts, articles) {
  return contacts.map((contact) => {
    const haystack = `${contact.label} ${contact.classification} ${contact.source}`;
    const matches = articles
      .map((art) => {
        const needle = `${art.title} ${art.summary}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...art, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...contact, documented: matches.length > 0, articles: matches };
  });
}

export async function buildAcknoScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [acRes, artRes] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts?limit=200`, { headers: hdr }),
      fetch(`${base}/knowledge/articles`,              { headers: hdr }),
    ]);
    const [acData, artData] = await Promise.all([acRes.json(), artRes.json()]);
    const contacts = normaliseContacts(acData);
    const articles = normaliseArticles(artData);
    const rows     = crossRef(contacts, articles);
    const documented   = rows.filter((r) => r.documented).length;
    const undocumented = rows.length - documented;
    const pct = rows.length ? Math.round((documented / rows.length) * 100) : 0;
    if (!rows.length) return "No acoustic contacts found in the system, sir.";
    const topDark = rows
      .filter((r) => !r.documented)
      .slice(0, 2)
      .map((r) => r.label).join(", ");
    const brief = `Acoustic knowledge cross-reference: ${documented} of ${rows.length} contacts have knowledge backing (${pct}%) — ${undocumented} contacts remain undocumented${topDark ? `: ${topDark}` : ""}.`;
    const aiRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ message: `Acoustic contacts cross-referenced against ${articles.length} knowledge articles: ${documented} documented / ${undocumented} undocumented (${pct}% coverage). Top undocumented contacts: ${topDark || "none"}. Provide a 2-sentence acoustic knowledge-gap assessment.` }),
    });
    const aiData = await aiRes.json();
    return aiData?.response || aiData?.message || brief;
  } catch (e) {
    return `Acoustic knowledge cross-reference error: ${e.message}`;
  }
}

function kindColor(kind) {
  const k = (kind || "").toUpperCase();
  if (k === "THREAT")    return RED;
  if (k === "INTEL")     return AMB;
  if (k === "TECHNICAL") return CY;
  if (k === "REPORT")    return GRN;
  return DIM;
}

export default function AcousticKnowledgeNexus() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [brief, setBrief]         = useState("");
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [acRes, artRes] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts?limit=200`, { headers: hdr }),
        fetch(`${base}/knowledge/articles`,              { headers: hdr }),
      ]);
      const [acData, artData] = await Promise.all([acRes.json(), artRes.json()]);
      const contacts = normaliseContacts(acData);
      const articles = normaliseArticles(artData);
      setRows(crossRef(contacts, articles));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:ackno-toggle", handler);
    return () => window.removeEventListener("jarvis:ackno-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const txt = await buildAcknoScript();
      setBrief(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } finally {
      setAssessing(false);
    }
  };

  const documented   = rows.filter((r) => r.documented).length;
  const undocumented = rows.length - documented;
  const pct          = rows.length ? Math.round((documented / rows.length) * 100) : 0;

  const visible = rows.filter((r) => {
    if (tab === "DOCUMENTED"   && !r.documented) return false;
    if (tab === "UNDOCUMENTED" &&  r.documented) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.label + r.classification + r.source).toLowerCase().includes(q);
    }
    return true;
  });

  const TABS = ["ALL", "DOCUMENTED", "UNDOCUMENTED"];

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Acoustic × Knowledge Nexus (ACKNO)"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z_INDEX,
          background: open ? `${AMB}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${undocumented > 0 ? AMB : CY}55`,
          borderRadius: 5,
          color: undocumented > 0 ? AMB : CY,
          padding: "3px 7px",
          fontSize: 9,
          letterSpacing: 1,
          cursor: "pointer",
          backdropFilter: "blur(4px)",
          whiteSpace: "nowrap",
        }}
      >
        ◈ ACKNO{undocumented > 0 && (
          <span style={{ marginLeft: 4, background: AMB, color: "#000", borderRadius: 3, padding: "0 3px", fontSize: 8 }}>
            {undocumented}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            left: BTN_LEFT,
            bottom: 36,
            zIndex: Z_INDEX + 1,
            width: 340,
            maxHeight: "72vh",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            background: "rgba(5,8,13,0.92)",
            border: `1px solid ${AMB}44`,
            borderRadius: 10,
            fontFamily: "'JetBrains Mono',monospace",
            boxShadow: `0 0 40px ${AMB}22`,
            backdropFilter: "blur(10px)",
          }}
        >
          {/* Header */}
          <div style={{ padding: "10px 12px 6px", borderBottom: `1px solid ${AMB}22` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: AMB, fontSize: 10, letterSpacing: 2, fontWeight: 700 }}>◈ ACKNO</span>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
              >
                ✕
              </button>
            </div>
            <div style={{ color: DIM, fontSize: 8, marginTop: 2 }}>Acoustic × Knowledge Nexus</div>
            {/* Stat tiles */}
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {[
                { label: "CONTACTS",     value: rows.length,  color: CY  },
                { label: "DOCUMENTED",   value: documented,   color: GRN },
                { label: "UNDOCUMENTED", value: undocumented, color: AMB },
                { label: "COVERAGE",     value: `${pct}%`,    color: pct >= 50 ? GRN : AMB },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  style={{
                    flex: 1,
                    background: `${color}11`,
                    border: `1px solid ${color}33`,
                    borderRadius: 5,
                    padding: "4px 6px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ color, fontSize: 13, fontWeight: 700 }}>{value}</div>
                  <div style={{ color: DIM, fontSize: 7, letterSpacing: 1 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs + search */}
          <div
            style={{
              padding: "6px 12px",
              borderBottom: `1px solid ${AMB}22`,
              display: "flex",
              gap: 4,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${AMB}22` : "transparent",
                  border: `1px solid ${tab === t ? AMB : DIM}44`,
                  borderRadius: 4,
                  color: tab === t ? AMB : DIM,
                  padding: "2px 7px",
                  fontSize: 8,
                  cursor: "pointer",
                  letterSpacing: 1,
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
                marginLeft: "auto",
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${DIM}44`,
                borderRadius: 4,
                color: "#DCEBF5",
                fontSize: 9,
                padding: "2px 6px",
                width: 80,
              }}
            />
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading && (
              <div style={{ color: DIM, textAlign: "center", padding: 16, fontSize: 10 }}>Loading…</div>
            )}
            {err && (
              <div style={{ color: RED, textAlign: "center", padding: 16, fontSize: 9 }}>Error: {err}</div>
            )}
            {!loading &&
              visible.map((row) => (
                <div key={row.id} style={{ borderBottom: `1px solid ${DIM}18` }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 8px",
                      cursor: "pointer",
                    }}
                    onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  >
                    <span
                      style={{
                        fontSize: 8,
                        background: `${row.documented ? GRN : AMB}22`,
                        border: `1px solid ${row.documented ? GRN : AMB}55`,
                        color: row.documented ? GRN : AMB,
                        borderRadius: 3,
                        padding: "1px 4px",
                        minWidth: 68,
                        textAlign: "center",
                      }}
                    >
                      {row.documented ? "DOCUMENTED" : "UNDOCUMENTED"}
                    </span>
                    <span
                      style={{
                        color: "#DCEBF5",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.label}
                    </span>
                    {row.source && (
                      <span style={{ color: DIM, fontSize: 8 }}>{row.source}</span>
                    )}
                    {row.documented && (
                      <span style={{ color: GRN, fontSize: 8 }}>
                        {row.articles.length} art{row.articles.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  {expanded === row.id && (
                    <div style={{ padding: "0 8px 8px 8px" }}>
                      {row.confidence != null && (
                        <div style={{ color: DIM, fontSize: 9, marginBottom: 4 }}>
                          confidence: {(row.confidence * 100).toFixed(0)}%
                        </div>
                      )}
                      {row.articles.length > 0 ? (
                        row.articles.slice(0, 5).map((art) => (
                          <div
                            key={art.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 5,
                              padding: "3px 0",
                              borderBottom: `1px solid ${DIM}22`,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 8,
                                background: `${kindColor(art.kind)}22`,
                                border: `1px solid ${kindColor(art.kind)}55`,
                                color: kindColor(art.kind),
                                borderRadius: 3,
                                padding: "1px 4px",
                              }}
                            >
                              {art.kind}
                            </span>
                            <span
                              style={{
                                color: "#DCEBF5",
                                fontSize: 10,
                                flex: 1,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {art.title}
                            </span>
                            <span style={{ color: DIM, fontSize: 9 }}>hits: {art.hits}</span>
                          </div>
                        ))
                      ) : (
                        <div style={{ color: DIM, fontSize: 10 }}>
                          No knowledge articles — contact is undocumented.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            {!loading && visible.length === 0 && (
              <div style={{ color: DIM, textAlign: "center", padding: 16 }}>
                No contacts match current filter.
              </div>
            )}
          </div>

          {/* Assess */}
          <div
            style={{
              borderTop: `1px solid ${AMB}22`,
              padding: "8px 12px",
            }}
          >
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: `${AMB}18`,
                border: `1px solid ${AMB}55`,
                borderRadius: 5,
                color: AMB,
                padding: "5px 12px",
                cursor: "pointer",
                fontSize: 10,
                letterSpacing: 1,
                width: "100%",
                opacity: assessing ? 0.6 : 1,
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div
                style={{
                  marginTop: 8,
                  color: "#DCEBF5",
                  fontSize: 10,
                  lineHeight: 1.5,
                  borderLeft: `2px solid ${AMB}`,
                  paddingLeft: 8,
                }}
              >
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
