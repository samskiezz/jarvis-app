/**
 * DatasetContactSkillNexus — F87.
 *
 * Triple-nexus: /v1/datasets × /entities/Contact × /v1/aip/skill
 *
 * Keyword-correlates each dataset against:
 *   - contacts (who works with / owns it)
 *   - skills   (what capabilities it enables)
 *
 * Classification per dataset:
 *   FULLY_MAPPED  — matched ≥1 contact AND ≥1 skill
 *   CONTACT_ONLY  — matched contact but no skill
 *   SKILL_ONLY    — matched skill but no contact
 *   UNMAPPED      — no contact or skill match (data literacy gap)
 *
 * Stat tiles: DATASETS / CONTACTS / SKILLS / FULLY MAPPED / UNMAPPED
 * Filter tabs: ALL / FULLY_MAPPED / CONTACT_ONLY / SKILL_ONLY / UNMAPPED
 * List: datasets sorted by classification (UNMAPPED first), each expandable.
 * Click ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence data-literacy brief + TTS.
 * 120s auto-refresh.
 *
 * Intent: "dcslnex" / "dataset contact" / "dataset skill" / "data literacy" /
 *         "unmapped dataset" / "dataset user" / "skill dataset" / "dataset coverage"
 *   → jarvis:dcslnex-toggle + TTS via buildDcslnexScript()
 *
 * Toggle: ⬡ DCSLNEX at left:967360, bottom:8, zIndex:111.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const RED    = "#FF3D5A";
const BTN_LEFT   = 967360;
const REFRESH_MS = 120_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function normaliseDatasets(raw) {
  return normaliseArray(raw).map((d) => ({
    id: d.id || d.dataset_id || String(Math.random()),
    name: d.name || d.title || d.label || "Untitled Dataset",
    type: d.type || d.kind || d.category || "",
    description: d.description || d.summary || "",
    rows: d.rows || d.row_count || d.count || 0,
  }));
}

function normaliseContacts(raw) {
  return normaliseArray(raw).map((c) => ({
    id: c.id || c.contact_id || String(Math.random()),
    name: c.name || c.full_name || "Unknown",
    role: c.role || c.title || c.position || "",
    org: c.org || c.organisation || c.organization || c.company || "",
  }));
}

function normaliseSkills(raw) {
  return normaliseArray(raw).map((s) => ({
    id: s.id || s.skill_id || String(Math.random()),
    name: s.name || s.title || s.skill_name || "Unnamed Skill",
    category: s.category || s.domain || s.type || "",
    score: s.score || s.proficiency || s.rating || 0,
  }));
}

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);
}

function overlap(aStr, bStr) {
  const ak = new Set(keywords(aStr));
  const bk = keywords(bStr);
  return bk.filter((w) => ak.has(w)).length;
}

function classify(contacts, skills) {
  const hasC = contacts.length > 0;
  const hasS = skills.length > 0;
  if (hasC && hasS) return "FULLY_MAPPED";
  if (hasC) return "CONTACT_ONLY";
  if (hasS) return "SKILL_ONLY";
  return "UNMAPPED";
}

const CLASS_ORDER = {
  UNMAPPED:      0,
  CONTACT_ONLY:  1,
  SKILL_ONLY:    2,
  FULLY_MAPPED:  3,
};

const CLASS_COLOR = {
  FULLY_MAPPED:  GREEN,
  CONTACT_ONLY:  CY,
  SKILL_ONLY:    AMBER,
  UNMAPPED:      RED,
};

// ─── exported intent helpers ──────────────────────────────────────────────────

const DCSLNEX_RE =
  /\bdcslnex\b|dataset.{0,10}contact|dataset.{0,10}skill|data.{0,10}literacy|unmapped.{0,10}dataset|dataset.{0,10}user|skill.{0,10}dataset|dataset.{0,10}coverage/i;

export function isDcslnexQuery(q) {
  return DCSLNEX_RE.test(q);
}

export async function buildDcslnexScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [dRaw, cRaw, sRaw] = await Promise.all([
      fetch(`${base}/v1/datasets`, { headers: hdr }).then((r) => r.json()).catch(() => []),
      fetch(`${base}/entities/Contact`, { headers: hdr }).then((r) => r.json()).catch(() => []),
      fetch(`${base}/v1/aip/skill`, { headers: hdr }).then((r) => r.json()).catch(() => []),
    ]);
    const datasets  = normaliseDatasets(dRaw);
    const contacts  = normaliseContacts(cRaw);
    const skills    = normaliseSkills(sRaw);
    const unmapped = datasets.filter((ds) => {
      const haystack = `${ds.name} ${ds.type} ${ds.description}`;
      const mc = contacts.filter((c) => overlap(haystack, `${c.name} ${c.role} ${c.org}`) > 0);
      const ms = skills.filter((s) => overlap(haystack, `${s.name} ${s.category}`) > 0);
      return mc.length === 0 && ms.length === 0;
    });
    return (
      `Dataset Contact Skill Nexus: ${datasets.length} datasets cross-referenced against ` +
      `${contacts.length} contacts and ${skills.length} skills. ` +
      `${unmapped.length} dataset${unmapped.length !== 1 ? "s" : ""} UNMAPPED — ` +
      `no identifiable contact owner or skill application.` +
      (unmapped.length > 0
        ? ` Top gap: "${unmapped[0].name}".`
        : " All datasets have coverage.")
    );
  } catch {
    return "DCSLNEX data unavailable.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function DatasetContactSkillNexus() {
  const [visible, setVisible]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [rows, setRows]         = useState([]);
  const [contacts, setContacts] = useState([]);
  const [skills, setSkills]     = useState([]);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [dRaw, cRaw, sRaw] = await Promise.all([
        fetch(`${base}/v1/datasets`, { headers: hdr }).then((r) => r.json()).catch(() => []),
        fetch(`${base}/entities/Contact`, { headers: hdr }).then((r) => r.json()).catch(() => []),
        fetch(`${base}/v1/aip/skill`, { headers: hdr }).then((r) => r.json()).catch(() => []),
      ]);
      const dss  = normaliseDatasets(dRaw);
      const cons = normaliseContacts(cRaw);
      const skls = normaliseSkills(sRaw);

      const enriched = dss.map((ds) => {
        const haystack = `${ds.name} ${ds.type} ${ds.description}`;
        const mc = cons
          .map((c) => ({ ...c, score: overlap(haystack, `${c.name} ${c.role} ${c.org}`) }))
          .filter((c) => c.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        const ms = skls
          .map((s) => ({ ...s, score: overlap(haystack, `${s.name} ${s.category}`) }))
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        return { ...ds, matchedContacts: mc, matchedSkills: ms, cls: classify(mc, ms) };
      });

      enriched.sort((a, b) => CLASS_ORDER[a.cls] - CLASS_ORDER[b.cls]);
      setRows(enriched);
      setContacts(cons);
      setSkills(skls);
    } catch {
      // silently ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [visible, load]);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:dcslnex-toggle", onToggle);
    return () => window.removeEventListener("jarvis:dcslnex-toggle", onToggle);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const script = await buildDcslnexScript();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hdr },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = (d.answer || script).replace(/<<ACTION:[^>]*>>/g, "").trim();
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hdr },
        body: JSON.stringify({ text, voice: "ash" }),
      }).catch(() => {});
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      // ignore
    } finally {
      setAssessing(false);
    }
  }, []);

  const counts = {
    total:        rows.length,
    contacts:     contacts.length,
    skills:       skills.length,
    fullyMapped:  rows.filter((r) => r.cls === "FULLY_MAPPED").length,
    unmapped:     rows.filter((r) => r.cls === "UNMAPPED").length,
  };

  const TABS = ["ALL", "FULLY_MAPPED", "CONTACT_ONLY", "SKILL_ONLY", "UNMAPPED"];

  const displayed = rows.filter((r) => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !r.type.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        title="Dataset × Contact × Skill Data Literacy Nexus"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 111,
          background: "rgba(0,0,0,0.7)",
          border: `1px solid ${CY}`,
          color: CY,
          padding: "3px 8px",
          fontSize: 10,
          fontFamily: "monospace",
          cursor: "pointer",
          borderRadius: 3,
        }}
      >
        ⬡ DCSLNEX
      </button>
    );
  }

  const TILE_STYLE = (col) => ({
    flex: "1 1 100px",
    background: "rgba(0,0,0,0.5)",
    border: `1px solid ${col}`,
    borderRadius: 4,
    padding: "6px 10px",
    textAlign: "center",
    minWidth: 90,
  });

  const BAR = (score, max, col) => (
    <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 2, height: 6, margin: "3px 0" }}>
      <div style={{ width: `${Math.min(100, (score / Math.max(max, 1)) * 100)}%`, background: col, height: "100%", borderRadius: 2 }} />
    </div>
  );

  return (
    <div
      style={{
        position: "fixed",
        top: 60,
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(860px, 96vw)",
        maxHeight: "82vh",
        background: "rgba(0,6,20,0.97)",
        border: `1px solid ${CY}`,
        borderRadius: 8,
        zIndex: 1111,
        display: "flex",
        flexDirection: "column",
        fontFamily: "monospace",
        color: "#c8d8f0",
        fontSize: 12,
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: `1px solid rgba(41,231,255,0.2)` }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 13 }}>⬡ DATASET × CONTACT × SKILL LITERACY NEXUS</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={assess} disabled={assessing} style={{ background: assessing ? "rgba(0,200,120,0.15)" : "rgba(0,200,120,0.1)", border: `1px solid ${GREEN}`, color: GREEN, padding: "3px 10px", fontSize: 11, cursor: "pointer", borderRadius: 3 }}>
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button onClick={() => setVisible(false)} style={{ background: "none", border: "none", color: "#668", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", flexWrap: "wrap" }}>
        <div style={TILE_STYLE(CY)}>
          <div style={{ fontSize: 18, fontWeight: 700, color: CY }}>{counts.total}</div>
          <div style={{ fontSize: 9, color: "#8af" }}>DATASETS</div>
        </div>
        <div style={TILE_STYLE("#8af")}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#8af" }}>{counts.contacts}</div>
          <div style={{ fontSize: 9, color: "#8af" }}>CONTACTS</div>
        </div>
        <div style={TILE_STYLE(AMBER)}>
          <div style={{ fontSize: 18, fontWeight: 700, color: AMBER }}>{counts.skills}</div>
          <div style={{ fontSize: 9, color: "#8af" }}>SKILLS</div>
        </div>
        <div style={TILE_STYLE(GREEN)}>
          <div style={{ fontSize: 18, fontWeight: 700, color: GREEN }}>{counts.fullyMapped}</div>
          <div style={{ fontSize: 9, color: "#8af" }}>FULLY MAPPED</div>
        </div>
        <div style={{
          ...TILE_STYLE(RED),
          animation: counts.unmapped > 0 ? "dcslnex-pulse 2s ease-in-out infinite" : "none",
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: RED }}>{counts.unmapped}</div>
          <div style={{ fontSize: 9, color: "#8af" }}>UNMAPPED</div>
        </div>
      </div>

      {/* filter tabs + search */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 14px", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{ background: filter === t ? "rgba(41,231,255,0.15)" : "none", border: `1px solid ${filter === t ? CY : "#334"}`, color: filter === t ? CY : "#889", padding: "2px 8px", fontSize: 10, cursor: "pointer", borderRadius: 3 }}>
            {t.replace(/_/g, " ")}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name/type…"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid #334", color: "#cde", padding: "2px 8px", fontSize: 11, borderRadius: 3, marginLeft: "auto", width: 200 }}
        />
      </div>

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "6px 14px" }}>
        {loading && <div style={{ color: "#556", textAlign: "center", padding: 20 }}>Loading…</div>}
        {!loading && displayed.length === 0 && <div style={{ color: "#556", textAlign: "center", padding: 20 }}>No datasets match.</div>}
        {displayed.map((ds) => {
          const isOpen = expanded === ds.id;
          const clsCol = CLASS_COLOR[ds.cls];
          const maxScore = Math.max(
            ...ds.matchedContacts.map((c) => c.score),
            ...ds.matchedSkills.map((s) => s.score),
            1,
          );
          return (
            <div key={ds.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", marginBottom: 4 }}>
              <div
                onClick={() => setExpanded(isOpen ? null : ds.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", cursor: "pointer" }}
              >
                <span style={{ color: clsCol, fontSize: 9, minWidth: 100, fontWeight: 700 }}>{ds.cls.replace(/_/g, " ")}</span>
                <span style={{ flex: 1, color: "#cde", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ds.name}</span>
                {ds.type && <span style={{ color: "#556", fontSize: 10, whiteSpace: "nowrap" }}>{ds.type}</span>}
                {ds.rows > 0 && <span style={{ color: "#445", fontSize: 10, whiteSpace: "nowrap" }}>{ds.rows.toLocaleString()} rows</span>}
                <span style={{ color: "#445", fontSize: 10 }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {isOpen && (
                <div style={{ padding: "4px 0 8px 16px" }}>
                  {ds.matchedContacts.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: CY, fontSize: 10, marginBottom: 3 }}>Matched contacts</div>
                      {ds.matchedContacts.map((c) => (
                        <div key={c.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#cde" }}>{c.name}</span>
                            <span style={{ color: "#556", fontSize: 10 }}>{c.role || c.org || ""}</span>
                          </div>
                          {BAR(c.score, maxScore, CY)}
                        </div>
                      ))}
                    </div>
                  )}
                  {ds.matchedSkills.length > 0 && (
                    <div>
                      <div style={{ color: AMBER, fontSize: 10, marginBottom: 3 }}>Matched skills</div>
                      {ds.matchedSkills.map((s) => (
                        <div key={s.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#cde" }}>{s.name}</span>
                            <span style={{ color: "#556", fontSize: 10 }}>{s.category}</span>
                          </div>
                          {BAR(s.score, maxScore, AMBER)}
                        </div>
                      ))}
                    </div>
                  )}
                  {ds.matchedContacts.length === 0 && ds.matchedSkills.length === 0 && (
                    <div style={{ color: RED, fontSize: 10 }}>No contact owner or skill application found — data literacy gap.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes dcslnex-pulse {
          0%,100% { box-shadow: 0 0 4px ${RED}55; }
          50%      { box-shadow: 0 0 12px ${RED}cc; }
        }
      `}</style>
    </div>
  );
}
