/**
 * ContactSkillNexus — F630
 * "JARVIS, cntsk / contact skill / skill contact / skilled contacts /
 *  which contacts have skills / contact skill coverage / contact capability / expert contacts"
 * Cross-references /entities/Contact against /v1/aip/skill.
 * SKILLED contacts (≥1 skill keyword-matches) vs UNSKILLED (no skill backing).
 * Coverage % tile; ALL/SKILLED/UNSKILLED filter tabs + search; click-to-expand matched skills.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence contact-capability brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";
const PRP = "#B06EFF";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 101_080;
const Z_INDEX  = 176;

const CNTSK_RE =
  /\bcntsk\b|\bcontact.?skill\b|\bskill.?contact\b|\bskilled.?contact\b|\bwhich.?contact.?ha(s|ve).?skill\b|\bcontact.?skill.?coverage\b|\bcontact.?capabilit\b|\bexpert.?contact\b|\bcontact.?expert\b/i;

export function isCntskQuery(text) {
  return CNTSK_RE.test(text || "");
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
  const raw =
    data.contacts || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((c, i) => ({
    id:   c.id || `cnt-${i}`,
    name: c.name || c.full_name || c.title || `Contact ${i + 1}`,
    role: c.role || c.job_title || c.position || "",
    org:  c.org || c.organization || c.company || "",
    tags: c.tags || [],
  }));
}

function normaliseSkills(data) {
  if (!data) return [];
  const raw =
    data.skills || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:     s.id || `skl-${i}`,
    name:   s.name || s.title || s.skill_name || `Skill ${i + 1}`,
    domain: s.domain || s.category || "",
    score:  s.score ?? s.proficiency ?? null,
    tags:   s.tags || [],
  }));
}

function crossRef(contacts, skills) {
  return contacts.map((cnt) => {
    const haystack = `${cnt.name} ${cnt.role} ${cnt.org} ${(cnt.tags || []).join(" ")}`;
    const matches = skills
      .map((s) => {
        const needle = `${s.name} ${s.domain} ${(s.tags || []).join(" ")}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...s, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...cnt, skilled: matches.length > 0, skills: matches };
  });
}

export async function buildCntskScript() {
  try {
    const base = apiBase();
    const [cntRes, sklRes] = await Promise.all([
      fetch(`${base}/entities/Contact`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/aip/skill`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const [cntData, sklData] = await Promise.all([cntRes.json(), sklRes.json()]);
    const contacts = normaliseContacts(cntData);
    const skills   = normaliseSkills(sklData);
    const rows     = crossRef(contacts, skills);
    const skilled   = rows.filter((r) => r.skilled).length;
    const unskilled = rows.length - skilled;
    const pct = rows.length ? Math.round((skilled / rows.length) * 100) : 0;
    if (!rows.length) return "No contacts found in the system, sir.";
    const topUnskilled = rows
      .filter((r) => !r.skilled)
      .slice(0, 2)
      .map((r) => r.name)
      .join("; ");
    return (
      `${skilled} of ${rows.length} contacts have matching AIP skill coverage (${pct}% coverage). ` +
      (unskilled > 0
        ? `${unskilled} contact${unskilled !== 1 ? "s" : ""} have no skill alignment — these may represent capability blind spots: ${topUnskilled || "unknown"}.`
        : "All contacts align with at least one active skill domain — full capability mapping achieved.")
    );
  } catch {
    return "Unable to reach contacts or AIP skill endpoints, sir.";
  }
}

export default function ContactSkillNexus() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [brief,     setBrief]     = useState("");
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [cntRes, sklRes] = await Promise.all([
        fetch(`${base}/entities/Contact`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/aip/skill`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [cntData, sklData] = await Promise.all([cntRes.json(), sklRes.json()]);
      setRows(crossRef(normaliseContacts(cntData), normaliseSkills(sklData)));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen((v) => !v); };
    window.addEventListener("jarvis:cntsk-toggle", handler);
    return () => window.removeEventListener("jarvis:cntsk-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const skilled   = rows.filter((r) => r.skilled).length;
  const unskilled = rows.length - skilled;
  const pct = rows.length ? Math.round((skilled / rows.length) * 100) : 0;

  const visible = rows.filter((r) => {
    const matchTab =
      tab === "ALL"      ? true :
      tab === "SKILLED"  ? r.skilled :
      !r.skilled;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      r.name.toLowerCase().includes(q) ||
      r.role.toLowerCase().includes(q) ||
      r.org.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  async function assess() {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const script = await buildCntskScript();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Contact-skill capability coverage assessment: ${script}. Provide a concise 2-sentence operational brief.` }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      setBrief("Unable to reach reasoning core, sir.");
    } finally {
      setAssessing(false);
    }
  }

  const tabStyle = (t) => ({
    background: tab === t ? `${PRP}22` : "transparent",
    border: `1px solid ${tab === t ? PRP : DIM}44`,
    borderRadius: 4,
    color: tab === t ? PRP : DIM,
    cursor: "pointer",
    fontSize: 9,
    letterSpacing: 1,
    padding: "3px 7px",
  });

  const badge = unskilled > 0 ? unskilled : null;

  return (
    <>
      {/* floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Contact × AIP Skill Nexus (CNTSK)"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z_INDEX,
          background: open ? `${PRP}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${PRP}${open ? "99" : "44"}`,
          borderRadius: 5,
          color: PRP,
          cursor: "pointer",
          fontSize: 9,
          letterSpacing: 1,
          padding: "4px 8px",
          backdropFilter: "blur(6px)",
          whiteSpace: "nowrap",
        }}
      >
        ◈ CNTSK{badge ? <span style={{ marginLeft: 4, background: AMB, color: "#000", borderRadius: 3, padding: "0 4px", fontSize: 9 }}>{badge}</span> : null}
      </button>

      {/* panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: BTN_LEFT,
            bottom: 36,
            zIndex: Z_INDEX + 1,
            width: 340,
            maxHeight: "70vh",
            overflowY: "auto",
            background: "rgba(4,7,12,0.96)",
            border: `1px solid ${PRP}44`,
            borderRadius: 8,
            padding: "12px 14px",
            backdropFilter: "blur(14px)",
            boxShadow: `0 0 28px ${PRP}22`,
            fontFamily: "monospace",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ color: PRP, fontSize: 11, letterSpacing: 2, fontWeight: "bold" }}>CONTACT × AIP SKILL NEXUS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
            {[
              { label: "CONTACTS",  value: rows.length, color: CY },
              { label: "SKILLED",   value: skilled,     color: GRN },
              { label: "UNSKILLED", value: unskilled,   color: unskilled > 0 ? AMB : GRN },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${color}33`, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}
              >
                <div style={{ color, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : value}</div>
                <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>SKILL COVERAGE</span>
              <span style={{ color: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, fontSize: 10, fontWeight: "bold" }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            {["ALL", "SKILLED", "UNSKILLED"].map((t) => (
              <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search contacts…"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: `1px solid ${PRP}33`, borderRadius: 5, color: "#DCEBF5", padding: "5px 8px", fontSize: 11, marginBottom: 8, outline: "none" }}
          />

          {/* list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 12 }}>No contacts match.</div>
            )}
            {visible.map((cnt) => (
              <div
                key={cnt.id}
                style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${cnt.skilled ? PRP : AMB}33`, borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === cnt.id ? null : cnt.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: cnt.skilled ? GRN : AMB, fontSize: 10 }}>{cnt.skilled ? "●" : "○"}</span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{cnt.name}</span>
                  {cnt.role && <span style={{ color: DIM, fontSize: 9 }}>{cnt.role.slice(0, 20)}</span>}
                  <span style={{ color: cnt.skilled ? GRN : DIM, fontSize: 9 }}>
                    {cnt.skilled ? `${cnt.skills.length} skill${cnt.skills.length !== 1 ? "s" : ""}` : "UNSKILLED"}
                  </span>
                </div>
                {cnt.org && (
                  <div style={{ color: DIM, fontSize: 9, marginLeft: 16 }}>{cnt.org.slice(0, 40)}</div>
                )}

                {expanded === cnt.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${PRP}22`, paddingTop: 6 }}>
                    {cnt.skilled ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {cnt.skills.map((s) => (
                          <div key={s.id} style={{ background: "rgba(176,110,255,0.04)", border: `1px solid ${PRP}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              {s.domain && (
                                <span style={{ color: CY, fontSize: 9, border: `1px solid ${CY}44`, borderRadius: 3, padding: "1px 4px" }}>{s.domain.slice(0, 14)}</span>
                              )}
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{s.name}</span>
                              {s.score != null && (
                                <span style={{ color: DIM, fontSize: 9 }}>{s.score}</span>
                              )}
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {s.hits}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No AIP skills matched this contact — capability gap identified.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${PRP}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{ background: `${PRP}18`, border: `1px solid ${PRP}55`, borderRadius: 5, color: PRP, padding: "5px 12px", cursor: "pointer", fontSize: 10, letterSpacing: 1, width: "100%", opacity: assessing ? 0.6 : 1 }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${PRP}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
