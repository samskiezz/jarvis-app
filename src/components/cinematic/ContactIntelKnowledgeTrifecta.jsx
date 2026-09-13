/**
 * ContactIntelKnowledgeTrifecta — F662
 * "JARVIS, ciktri / contact intel knowledge / contact trifecta / triple contact /
 *  contact knowledge intel / contact profile knowledge / three-way contact /
 *  which contacts are profiled and researched"
 *
 * 3-way cross-reference: /entities/Contact × /entities/IntelProfile × /knowledge/
 * TRIPLE     — contact keyword matches both an intel profile AND a knowledge article
 * PROFILED   — contact matches an intel profile only (threat signal, no research)
 * RESEARCHED — contact matches a knowledge article only (documented but not flagged)
 * DARK       — no match on either dimension (blind spot)
 *
 * Coverage % tile; ALL/TRIPLE/PROFILED/RESEARCHED/DARK filter tabs + search;
 * click-to-expand matched intel profiles and articles per contact;
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS;
 * red badge on TRIPLE count; 90-s auto-refresh.
 * ◈ CIKTRI button left:120860 bottom:8 zIndex:199.
 *
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const PRP = "#CC88FF";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 120_860;
const Z_INDEX  = 199;

const CIKTRI_RE =
  /\bciktri\b|\bcontact.?intel.?knowledge\b|\bcontact.?trifecta\b|\btriple.?contact\b|\bcontact.?knowledge.?intel\b|\bcontact.?profile.?knowledge\b|\bthree.?way.?contact\b|\bwhich.?contacts?.?are.?profiled.?and.?researched\b/i;

export function isCiktriQuery(text) {
  return CIKTRI_RE.test(text || "");
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

function contactText(c) {
  return [c.name, c.email, c.company, c.role, c.organisation, c.org,
          c.title, c.sector, c.nationality, c.description, c.tags]
    .filter(Boolean).join(" ");
}

function intelText(p) {
  return [p.name, p.subject, p.title, p.description, p.nationality,
          p.actor_type, p.tags, p.sector, p.aliases]
    .filter(Boolean).join(" ");
}

function articleText(a) {
  return [a.title, a.summary, a.kind, a.tags, a.content, a.category]
    .filter(Boolean).join(" ");
}

function normalise(raw, keys) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function trifectaClass(profileHits, articleHits) {
  if (profileHits > 0 && articleHits > 0) return "TRIPLE";
  if (profileHits > 0) return "PROFILED";
  if (articleHits > 0) return "RESEARCHED";
  return "DARK";
}

export async function buildCiktriScript() {
  const BASE = apiBase();
  const [cR, pR, kR] = await Promise.allSettled([
    fetch(`${BASE}/entities/Contact`).then((r) => r.json()),
    fetch(`${BASE}/entities/IntelProfile`).then((r) => r.json()),
    fetch(`${BASE}/knowledge/articles`).then((r) => r.json()),
  ]);
  const contacts = normalise(cR.status === "fulfilled" ? cR.value : [],
    ["items","results","data","contacts","records","entities"]);
  const profiles = normalise(pR.status === "fulfilled" ? pR.value : [],
    ["items","results","data","profiles","records","entities"]);
  const articles = normalise(kR.status === "fulfilled" ? kR.value : [],
    ["items","results","data","articles","records"]);

  const tripled    = contacts.filter((c) => {
    const ct = contactText(c);
    return profiles.some((p) => overlap(ct, intelText(p)) > 0) &&
           articles.some((a) => overlap(ct, articleText(a)) > 0);
  });
  const profiled   = contacts.filter((c) => {
    const ct = contactText(c);
    return profiles.some((p) => overlap(ct, intelText(p)) > 0) &&
           !articles.some((a) => overlap(ct, articleText(a)) > 0);
  });
  const researched = contacts.filter((c) => {
    const ct = contactText(c);
    return !profiles.some((p) => overlap(ct, intelText(p)) > 0) &&
           articles.some((a) => overlap(ct, articleText(a)) > 0);
  });
  const dark = contacts.length - tripled.length - profiled.length - researched.length;

  const topTriple = tripled.slice(0, 3).map((c) => c.name || c.email || "?").join(", ");
  return (
    `Contact Intel+Knowledge Trifecta: ${contacts.length} contacts assessed against ` +
    `${profiles.length} intel profiles and ${articles.length} knowledge articles. ` +
    `${tripled.length} contacts are TRIPLE-flagged (profiled AND researched), ` +
    `${profiled.length} PROFILED only, ${researched.length} RESEARCHED only, ${dark} DARK. ` +
    (topTriple ? `Top triple-flagged: ${topTriple}.` : "No triple-flagged contacts.")
  );
}

/* ─── component ─── */

export default function ContactIntelKnowledgeTrifecta() {
  const [open,     setOpen]     = useState(false);
  const [contacts, setContacts] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [articles, setArticles] = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [tab,      setTab]      = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const [lastFetch, setLastFetch] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const BASE = apiBase();
    try {
      const [cR, pR, kR] = await Promise.allSettled([
        fetch(`${BASE}/entities/Contact`).then((r) => r.json()),
        fetch(`${BASE}/entities/IntelProfile`).then((r) => r.json()),
        fetch(`${BASE}/knowledge/articles`).then((r) => r.json()),
      ]);
      const c = normalise(cR.status === "fulfilled" ? cR.value : [],
        ["items","results","data","contacts","records","entities"]);
      const p = normalise(pR.status === "fulfilled" ? pR.value : [],
        ["items","results","data","profiles","records","entities"]);
      const a = normalise(kR.status === "fulfilled" ? kR.value : [],
        ["items","results","data","articles","records"]);
      setContacts(c); setProfiles(p); setArticles(a);
      setLastFetch(new Date());
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:ciktri-toggle", handler);
    return () => window.removeEventListener("jarvis:ciktri-toggle", handler);
  }, []);

  useEffect(() => {
    if (!contacts.length) { setEnriched([]); return; }
    const e = contacts.map((c) => {
      const ct = contactText(c);
      const matchedProfiles = profiles.filter((p) => overlap(ct, intelText(p)) > 0);
      const matchedArticles = articles.filter((a) => overlap(ct, articleText(a)) > 0);
      const cls = trifectaClass(matchedProfiles.length, matchedArticles.length);
      return { ...c, _cls: cls, _profiles: matchedProfiles, _articles: matchedArticles };
    });
    e.sort((a, b) => {
      const order = { TRIPLE: 0, PROFILED: 1, RESEARCHED: 2, DARK: 3 };
      return (order[a._cls] ?? 9) - (order[b._cls] ?? 9);
    });
    setEnriched(e);
  }, [contacts, profiles, articles]);

  const counts = {
    TRIPLE:     enriched.filter((e) => e._cls === "TRIPLE").length,
    PROFILED:   enriched.filter((e) => e._cls === "PROFILED").length,
    RESEARCHED: enriched.filter((e) => e._cls === "RESEARCHED").length,
    DARK:       enriched.filter((e) => e._cls === "DARK").length,
  };
  const coverage = enriched.length
    ? Math.round(((counts.TRIPLE + counts.PROFILED + counts.RESEARCHED) / enriched.length) * 100)
    : 0;

  const visible = enriched.filter((e) => {
    if (tab !== "ALL" && e._cls !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.name || e.email || "").toLowerCase().includes(q);
  });

  const handleAssess = useCallback(async () => {
    setAssessing(true);
    setAssessment("");
    try {
      const script = await buildCiktriScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch { setAssessment("Assessment unavailable."); } finally { setAssessing(false); }
  }, []);

  const clsColor = { TRIPLE: RED, PROFILED: PRP, RESEARCHED: CY, DARK: DIM };
  const clsLabel = { TRIPLE: "TRIPLE", PROFILED: "PROFILED", RESEARCHED: "RESEARCHED", DARK: "DARK" };

  /* ─── badge ─── */
  const badge = counts.TRIPLE > 0 ? counts.TRIPLE : null;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: open ? "#1a1f2e" : "#0d111c",
          border: `1px solid ${open ? CY : "#2a3040"}`,
          borderRadius: 6, color: CY, fontFamily: "monospace",
          fontSize: 11, padding: "4px 10px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6,
        }}
        title="Contact × Intel × Knowledge Trifecta"
      >
        ◈ CIKTRI
        {badge != null && (
          <span style={{
            background: RED, color: "#fff",
            borderRadius: 10, fontSize: 9, padding: "1px 6px",
          }}>{badge}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 44, left: BTN_LEFT - 260, zIndex: Z_INDEX + 1,
          width: 580, maxHeight: "70vh", background: "#0d111c",
          border: `1px solid ${CY}33`, borderRadius: 10,
          display: "flex", flexDirection: "column", overflow: "hidden",
          fontFamily: "monospace", color: "#cdd",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ color: CY, fontWeight: 700, fontSize: 13 }}>
              Contact Intel+Knowledge Trifecta
            </span>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "flex", gap: 8, padding: "10px 14px",
            borderBottom: `1px solid ${CY}22`,
          }}>
            {[
              { label: "Coverage", value: `${coverage}%`, color: coverage > 70 ? GRN : coverage > 40 ? AMB : RED },
              { label: "Triple",     value: counts.TRIPLE,     color: counts.TRIPLE > 0 ? RED : DIM },
              { label: "Profiled",   value: counts.PROFILED,   color: PRP },
              { label: "Researched", value: counts.RESEARCHED, color: CY },
              { label: "Dark",       value: counts.DARK,       color: DIM },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                flex: 1, background: "#111827", borderRadius: 6,
                padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: 16, fontWeight: 700 }}>{value}</div>
                <div style={{ color: DIM, fontSize: 10 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Controls */}
          <div style={{
            display: "flex", gap: 6, padding: "8px 14px",
            borderBottom: `1px solid ${CY}22`, alignItems: "center", flexWrap: "wrap",
          }}>
            {["ALL","TRIPLE","PROFILED","RESEARCHED","DARK"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? CY : "#1a1f2e",
                color: tab === t ? "#000" : DIM,
                border: `1px solid ${tab === t ? CY : "#2a3040"}`,
                borderRadius: 4, fontSize: 10, padding: "3px 8px", cursor: "pointer",
              }}>{t}{t !== "ALL" ? ` (${counts[t] ?? 0})` : ""}</button>
            ))}
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts…"
              style={{
                marginLeft: "auto", background: "#111827", border: `1px solid ${CY}44`,
                borderRadius: 4, color: "#cdd", fontSize: 11, padding: "3px 8px",
              }}
            />
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading && (
              <div style={{ padding: 14, color: DIM, textAlign: "center" }}>Loading…</div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ padding: 14, color: DIM, textAlign: "center" }}>No contacts match.</div>
            )}
            {visible.map((c, i) => {
              const id = c.id || c._id || i;
              const isExpanded = expanded === id;
              const color = clsColor[c._cls] || DIM;
              return (
                <div key={id} style={{
                  borderBottom: `1px solid ${CY}11`,
                  padding: "8px 14px",
                }}>
                  <div
                    onClick={() => setExpanded(isExpanded ? null : id)}
                    style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                  >
                    <span style={{
                      background: `${color}22`, color, border: `1px solid ${color}44`,
                      borderRadius: 4, fontSize: 9, padding: "1px 6px", flexShrink: 0,
                    }}>{clsLabel[c._cls]}</span>
                    <span style={{ fontSize: 12, flex: 1 }}>
                      {c.name || c.email || c.id || "Unknown"}
                    </span>
                    {c.role && (
                      <span style={{ color: DIM, fontSize: 10 }}>{c.role}</span>
                    )}
                    <span style={{ color: DIM, fontSize: 10 }}>
                      {c._profiles.length}p · {c._articles.length}a
                    </span>
                    <span style={{ color: DIM, fontSize: 11 }}>{isExpanded ? "▲" : "▼"}</span>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 8, paddingLeft: 12 }}>
                      {c._profiles.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: PRP, fontSize: 10, marginBottom: 4 }}>INTEL PROFILES ({c._profiles.length})</div>
                          {c._profiles.slice(0, 5).map((p, j) => (
                            <div key={j} style={{
                              display: "flex", gap: 8, marginBottom: 3, fontSize: 11,
                            }}>
                              <span style={{ color: PRP }}>●</span>
                              <span>{p.name || p.subject || p.title || "?"}</span>
                              {p.threat_level && (
                                <span style={{ color: RED, fontSize: 9 }}>{p.threat_level}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {c._articles.length > 0 && (
                        <div>
                          <div style={{ color: CY, fontSize: 10, marginBottom: 4 }}>KNOWLEDGE ARTICLES ({c._articles.length})</div>
                          {c._articles.slice(0, 5).map((a, j) => (
                            <div key={j} style={{
                              display: "flex", gap: 8, marginBottom: 3, fontSize: 11,
                            }}>
                              <span style={{ color: CY }}>●</span>
                              <span style={{ flex: 1 }}>{a.title || a.id || "?"}</span>
                              {a.kind && (
                                <span style={{
                                  color: AMB, fontSize: 9, background: "#1a1f2e",
                                  padding: "1px 5px", borderRadius: 3,
                                }}>{a.kind}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {c._profiles.length === 0 && c._articles.length === 0 && (
                        <div style={{ color: DIM, fontSize: 11 }}>No matches on either dimension.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "8px 14px", borderTop: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ color: DIM, fontSize: 10, flex: 1 }}>
              {lastFetch ? `Updated ${lastFetch.toLocaleTimeString()}` : "…"}
              {" · "}{enriched.length} contacts
            </span>
            <button onClick={handleAssess} disabled={assessing} style={{
              background: assessing ? "#1a1f2e" : CY, color: assessing ? DIM : "#000",
              border: "none", borderRadius: 4, fontSize: 11,
              padding: "4px 12px", cursor: assessing ? "default" : "pointer",
            }}>
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {assessment && (
            <div style={{
              padding: "8px 14px", borderTop: `1px solid ${CY}22`,
              fontSize: 11, color: GRN, lineHeight: 1.5,
            }}>{assessment}</div>
          )}
        </div>
      )}
    </>
  );
}
