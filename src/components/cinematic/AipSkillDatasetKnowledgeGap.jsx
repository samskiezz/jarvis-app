/**
 * AipSkillDatasetKnowledgeGap — F307
 * Fetches /v1/aip/skill + /v1/datasets + /knowledge/ and keyword-matches each
 * skill against available datasets and knowledge topics.
 * Skills that match at least one dataset or knowledge topic are COVERED;
 * skills with no matches are flagged as GAP.
 * Stat tiles: skills / covered / gap / datasets / knowledge topics.
 * Severity: gap count amber-pulses when ≥ 1.
 * Expandable rows show matched datasets + knowledge topics.
 * Filter tabs: ALL / COVERED / GAP.
 * Text search on skill name.
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS.
 * ◈ SKGAP toggle (left:62360, bottom:8, zIndex:120).
 * Voice: "skill gap"/"knowledge gap"/"skill coverage"/"aip coverage"/"skgap"/"dataset skill".
 * jarvis:skill-gap-toggle event.
 * 90-s auto-refresh.
 * Additive-only — no edits to CinematicShell/CinematicHome/JarvisLoader.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GR = "#00FF9F";
const AM = "#FFB800";
const RD = "#FF4444";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const POLL_MS = 90_000;

const SKGAP_RE =
  /\bskill.?gap\b|\bknowledge.?gap\b|\bskill.?coverage\b|\baip.?coverage\b|\bskgap\b|\bdataset.?skill\b|\bskill.?dataset\b|\bskill.?support\b|\bcoverage.?skill\b|\bgap.?analysis\b/i;

export function isSkillGapQuery(text) {
  return SKGAP_RE.test(text || "");
}

const TAG = {
  background: "rgba(0,0,0,0.75)",
  border: `1px solid ${CY}33`,
  borderRadius: 6,
  padding: "2px 7px",
  fontSize: 10,
  color: CY,
};
const STAT_BOX = {
  background: "rgba(0,0,0,0.55)",
  border: `1px solid ${CY}33`,
  borderRadius: 8,
  padding: "10px 16px",
  minWidth: 78,
  textAlign: "center",
};

function tokenize(str) {
  return (str || "")
    .toLowerCase()
    .split(/[\s\-_\/,.;:()[\]{}]+/)
    .filter((t) => t.length >= 3);
}

function matchScore(skillTokens, targetStr) {
  const targetTokens = tokenize(targetStr);
  return skillTokens.filter((t) => targetTokens.includes(t)).length;
}

async function fetchSkills(base, headers) {
  const res = await fetch(`${base}/v1/aip/skill`, { headers });
  if (!res.ok) return [];
  const d = await res.json();
  return Array.isArray(d)
    ? d
    : d.skills || d.items || d.data || Object.values(d) || [];
}

async function fetchDatasets(base, headers) {
  const res = await fetch(`${base}/v1/datasets`, { headers });
  if (!res.ok) return [];
  const d = await res.json();
  return Array.isArray(d) ? d : d.datasets || d.items || d.data || [];
}

async function fetchKnowledge(base, headers) {
  const res = await fetch(`${base}/knowledge/`, { headers });
  if (!res.ok) return [];
  const d = await res.json();
  return Array.isArray(d)
    ? d
    : Array.isArray(d?.knowledge)
    ? d.knowledge
    : Array.isArray(d?.items)
    ? d.items
    : Array.isArray(d?.data)
    ? d.data
    : [];
}

function buildMappings(skills, datasets, knowledge) {
  return skills.map((skill) => {
    const skillName = skill.name || skill.skill || skill.title || skill.id || "?";
    const skillDesc = skill.description || skill.notes || "";
    const skillTokens = tokenize(skillName + " " + skillDesc);

    const matchedDatasets = datasets
      .filter((ds) => {
        const dsStr =
          (ds.name || ds.title || "") +
          " " +
          (ds.description || ds.tags || "");
        return matchScore(skillTokens, dsStr) > 0;
      })
      .map((ds) => ({
        name: ds.name || ds.title || "Unnamed",
        type: ds.type || ds.category || "",
        rows: ds.row_count ?? ds.count ?? ds.size ?? null,
      }));

    const matchedKnowledge = knowledge
      .filter((k) => {
        const kStr =
          (k.title || k.name || k.topic || "") +
          " " +
          (k.content || k.description || k.tags || "");
        return matchScore(skillTokens, kStr) > 0;
      })
      .map((k) => ({
        title: k.title || k.name || k.topic || "Untitled",
        type: k.type || k.category || "",
      }));

    const covered = matchedDatasets.length > 0 || matchedKnowledge.length > 0;
    return { skill, skillName, matchedDatasets, matchedKnowledge, covered };
  });
}

export async function buildSkillGapScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [skills, datasets, knowledge] = await Promise.all([
    fetchSkills(base, headers).catch(() => []),
    fetchDatasets(base, headers).catch(() => []),
    fetchKnowledge(base, headers).catch(() => []),
  ]);
  if (!skills.length) return "No AIP skill data available, sir.";
  const mappings = buildMappings(skills, datasets, knowledge);
  const covered = mappings.filter((m) => m.covered).length;
  const gap = mappings.length - covered;
  const topGap = mappings
    .filter((m) => !m.covered)
    .slice(0, 3)
    .map((m) => m.skillName)
    .join(", ");
  if (gap === 0)
    return `AIP skill coverage is complete: all ${skills.length} skills have matching datasets or knowledge articles. ${datasets.length} datasets and ${knowledge.length} knowledge topics indexed.`;
  return (
    `AIP skill gap analysis: ${skills.length} skills total — ${covered} covered, ${gap} gap${gap !== 1 ? "s" : ""}. ` +
    `${datasets.length} datasets, ${knowledge.length} knowledge topics. ` +
    `Top gaps: ${topGap || "none identified"}.`
  );
}

export default function AipSkillDatasetKnowledgeGap() {
  const [open, setOpen] = useState(false);
  const [mappings, setMappings] = useState([]);
  const [dsCount, setDsCount] = useState(0);
  const [knCount, setKnCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [skills, datasets, knowledge] = await Promise.all([
        fetchSkills(base, headers).catch(() => []),
        fetchDatasets(base, headers).catch(() => []),
        fetchKnowledge(base, headers).catch(() => []),
      ]);
      setDsCount(datasets.length);
      setKnCount(knowledge.length);
      setMappings(buildMappings(skills, datasets, knowledge));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:skill-gap-toggle", handler);
    return () => window.removeEventListener("jarvis:skill-gap-toggle", handler);
  }, []);

  const covered = mappings.filter((m) => m.covered).length;
  const gap = mappings.length - covered;

  const filtered = mappings
    .filter((m) => {
      if (tab === "COVERED") return m.covered;
      if (tab === "GAP") return !m.covered;
      return true;
    })
    .filter((m) => {
      if (!search) return true;
      return m.skillName.toLowerCase().includes(search.toLowerCase());
    });

  async function handleAssess() {
    setAssessing(true);
    setAssessText("");
    try {
      const base = apiBase();
      const prompt =
        `AIP skill coverage: ${mappings.length} skills — ${covered} covered, ${gap} gaps. ` +
        `${dsCount} datasets, ${knCount} knowledge topics available. ` +
        `Summarize the skill gap situation and recommend the top action in 2 sentences.`;
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      if (res.ok) {
        const d = await res.json();
        const txt = d.response || d.message || d.content || "";
        setAssessText(txt);
        window.dispatchEvent(new CustomEvent("jarvis:speak", { detail: { text: txt } }));
      } else {
        setAssessText("Assessment unavailable at this time.");
      }
    } catch {
      setAssessText("Assessment failed.");
    } finally {
      setAssessing(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          bottom: 8,
          left: 62360,
          zIndex: 120,
          background: open ? `${CY}22` : "rgba(0,0,0,0.7)",
          border: `1px solid ${gap > 0 ? AM + "88" : CY + "55"}`,
          borderRadius: 6,
          color: gap > 0 ? AM : CY,
          fontSize: 10,
          padding: "3px 8px",
          cursor: "pointer",
          fontFamily: "monospace",
          letterSpacing: 1,
          whiteSpace: "nowrap",
          animation: gap > 0 ? "skgap-pulse 2.2s ease-in-out infinite" : "none",
        }}
        title="AIP Skill × Dataset × Knowledge Gap"
      >
        ◈ SKGAP{gap > 0 ? ` [${gap}]` : ""}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            top: 40,
            right: 16,
            width: 600,
            maxHeight: "82vh",
            background: "rgba(5,10,18,0.97)",
            border: `1px solid ${CY}55`,
            borderRadius: 12,
            zIndex: 9200,
            display: "flex",
            flexDirection: "column",
            fontFamily: "monospace",
            color: CY,
            boxShadow: `0 0 40px ${CY}22`,
            overflow: "hidden",
          }}
        >
          {/* header */}
          <div
            style={{
              padding: "12px 16px 8px",
              borderBottom: `1px solid ${CY}22`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 12, letterSpacing: 2 }}>
              ◈ AIP SKILL × DATASET × KNOWLEDGE GAP
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: CY,
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "10px 16px",
              borderBottom: `1px solid ${CY}11`,
              flexWrap: "wrap",
            }}
          >
            {[
              { label: "SKILLS", val: mappings.length, col: CY },
              { label: "COVERED", val: covered, col: GR },
              { label: "GAP", val: gap, col: gap > 0 ? AM : "#444" },
              { label: "DATASETS", val: dsCount, col: "#5599FF" },
              { label: "KNOWLEDGE", val: knCount, col: "#AA88FF" },
            ].map(({ label, val, col }) => (
              <div key={label} style={{ ...STAT_BOX, borderColor: col + "44" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
                <div style={{ fontSize: 9, color: col + "aa", letterSpacing: 1 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* filter + search */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "8px 16px",
              alignItems: "center",
              borderBottom: `1px solid ${CY}11`,
              flexWrap: "wrap",
            }}
          >
            {["ALL", "COVERED", "GAP"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "rgba(0,0,0,0.5)",
                  border: `1px solid ${tab === t ? CY : CY + "44"}`,
                  borderRadius: 4,
                  color: tab === t ? CY : CY + "88",
                  fontSize: 9,
                  padding: "2px 8px",
                  cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                {t}
                {t === "COVERED" && covered > 0 && (
                  <span style={{ marginLeft: 4, color: GR }}>{covered}</span>
                )}
                {t === "GAP" && gap > 0 && (
                  <span style={{ marginLeft: 4, color: AM }}>{gap}</span>
                )}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search skills…"
              style={{
                marginLeft: "auto",
                background: "rgba(0,0,0,0.4)",
                border: `1px solid ${CY}33`,
                borderRadius: 4,
                color: CY,
                fontSize: 10,
                padding: "3px 8px",
                outline: "none",
                fontFamily: "monospace",
                width: 160,
              }}
            />
          </div>

          {/* rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
            {loading && (
              <div style={{ padding: "16px", color: CY + "88", fontSize: 11, textAlign: "center" }}>
                loading…
              </div>
            )}
            {err && (
              <div style={{ padding: "10px 16px", color: RD, fontSize: 10 }}>{err}</div>
            )}
            {!loading && !err && filtered.length === 0 && (
              <div style={{ padding: "16px", color: CY + "55", fontSize: 11, textAlign: "center" }}>
                no skills match
              </div>
            )}
            {filtered.map((m, i) => {
              const key = m.skill?.id || m.skill?.name || m.skillName || i;
              const isExp = !!expanded[key];
              const covCol = m.covered ? GR : AM;
              const scoreLabel = m.skill?.score ?? m.skill?.level ?? m.skill?.value ?? null;
              return (
                <div key={key} style={{ borderBottom: `1px solid ${CY}11`, padding: "7px 16px" }}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                    onClick={() => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))}
                  >
                    <span
                      style={{
                        ...TAG,
                        borderColor: covCol + "55",
                        color: covCol,
                        fontSize: 9,
                        minWidth: 60,
                        textAlign: "center",
                        letterSpacing: 1,
                      }}
                    >
                      {m.covered ? "COVERED" : "GAP"}
                    </span>
                    <span style={{ fontSize: 11, flex: 1, color: "#DCEBF5" }}>
                      {m.skillName}
                    </span>
                    {scoreLabel !== null && (
                      <span style={{ ...TAG, fontSize: 9, color: CY + "99" }}>
                        {typeof scoreLabel === "number"
                          ? Math.round(scoreLabel * 100) / 100
                          : scoreLabel}
                      </span>
                    )}
                    <span style={{ fontSize: 9, color: CY + "55" }}>
                      {m.matchedDatasets.length}DS {m.matchedKnowledge.length}KN
                    </span>
                    <span style={{ fontSize: 10, color: CY + "55" }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>
                  {(m.skill?.description || m.skill?.notes) && (
                    <div style={{ fontSize: 9, color: CY + "66", marginTop: 3, paddingLeft: 68 }}>
                      {(m.skill.description || m.skill.notes || "").slice(0, 100)}
                      {(m.skill.description || m.skill.notes || "").length > 100 ? "…" : ""}
                    </div>
                  )}
                  {isExp && (
                    <div style={{ marginTop: 6, paddingLeft: 68, display: "flex", flexDirection: "column", gap: 6 }}>
                      {m.matchedDatasets.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: "#5599FF", letterSpacing: 1, marginBottom: 3 }}>
                            DATASETS ({m.matchedDatasets.length})
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {m.matchedDatasets.slice(0, 5).map((ds, di) => (
                              <div key={di} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#DCEBF5" }}>
                                <span style={{ ...TAG, fontSize: 8, color: "#5599FF", borderColor: "#5599FF44" }}>
                                  {ds.type || "dataset"}
                                </span>
                                <span>{ds.name}</span>
                                {ds.rows !== null && (
                                  <span style={{ fontSize: 8, color: CY + "66" }}>
                                    {ds.rows.toLocaleString()} rows
                                  </span>
                                )}
                              </div>
                            ))}
                            {m.matchedDatasets.length > 5 && (
                              <div style={{ fontSize: 9, color: CY + "55" }}>
                                +{m.matchedDatasets.length - 5} more…
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {m.matchedKnowledge.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: "#AA88FF", letterSpacing: 1, marginBottom: 3 }}>
                            KNOWLEDGE ({m.matchedKnowledge.length})
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {m.matchedKnowledge.slice(0, 5).map((k, ki) => (
                              <div key={ki} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#DCEBF5" }}>
                                <span style={{ ...TAG, fontSize: 8, color: "#AA88FF", borderColor: "#AA88FF44" }}>
                                  {k.type || "article"}
                                </span>
                                <span>{k.title}</span>
                              </div>
                            ))}
                            {m.matchedKnowledge.length > 5 && (
                              <div style={{ fontSize: 9, color: CY + "55" }}>
                                +{m.matchedKnowledge.length - 5} more…
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {!m.covered && (
                        <div style={{ fontSize: 9, color: AM + "aa", fontStyle: "italic" }}>
                          No matching datasets or knowledge articles found for this skill.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* footer */}
          <div
            style={{
              padding: "8px 16px",
              borderTop: `1px solid ${CY}22`,
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={handleAssess}
              disabled={assessing || !mappings.length}
              style={{
                background: assessing ? `${CY}11` : `${CY}22`,
                border: `1px solid ${CY}55`,
                borderRadius: 5,
                color: CY,
                fontSize: 10,
                padding: "4px 12px",
                cursor: assessing ? "default" : "pointer",
                letterSpacing: 1,
                opacity: !mappings.length ? 0.4 : 1,
              }}
            >
              {assessing ? "▶ assessing…" : "▶ ASSESS"}
            </button>
            <button
              onClick={load}
              disabled={loading}
              style={{
                background: "rgba(0,0,0,0.4)",
                border: `1px solid ${CY}33`,
                borderRadius: 5,
                color: CY + "88",
                fontSize: 10,
                padding: "4px 10px",
                cursor: "pointer",
                letterSpacing: 1,
              }}
            >
              ↺
            </button>
            {assessText && (
              <div style={{ fontSize: 10, color: GR, flex: 1, lineHeight: 1.4 }}>
                {assessText}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes skgap-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>
    </>
  );
}
