/**
 * SwarmJobKnowledgeCoverage — F81.
 *
 * Parallel-fetches /entities/SwarmJob + /knowledge/ and keyword-correlates
 * each swarm job against the knowledge article catalogue to surface BACKED
 * jobs (at least one article supports them) vs DARK jobs (no documentation
 * found).
 *
 * Stat tiles: jobs / articles / backed / dark
 * Filter tabs: ALL / BACKED / DARK + text search
 * Expand any job → matched articles with relevance score
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence knowledge-gap brief + TTS
 *
 * Toggle: ◈ SWJKN at left:20560, zIndex 65.
 * Voice: "swarm knowledge" / "job knowledge" / "swarm job knowledge" / "swjkn"
 * Auto-refresh: 120 s.
 *
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GREEN = "#00c878";
const AMBER = "#F5A623";
const RED = "#FF3D5A";
const VIOLET = "#A78BFA";
const BTN_LEFT = 20560;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isSwjknQuery(q) {
  return /swarm.{0,20}(know|doc|article|knowledge)|job.{0,15}knowledge|(swarm|job)\s+knowledge\s+coverage|swjkn\b/i.test(
    q || ""
  );
}

export async function buildSwjknScript() {
  try {
    const [sr, kr] = await Promise.all([
      fetch(`${apiBase()}/entities/SwarmJob`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({}),
      }),
      fetch(`${apiBase()}/knowledge/`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const jobs = normaliseArray(sr.ok ? await sr.json() : []);
    const articles = normaliseArray(kr.ok ? await kr.json() : []);
    const links = buildLinks(jobs, articles);
    const backedIds = new Set(links.map((l) => l.jobId));
    const dark = jobs.length - backedIds.size;
    window.dispatchEvent(new CustomEvent("jarvis:swjkn-toggle"));
    if (!jobs.length)
      return "No swarm jobs found, sir. The swarm grid is idle.";
    return `Swarm job knowledge coverage active, sir. ${jobs.length} swarm job${jobs.length !== 1 ? "s" : ""} cross-referenced against ${articles.length} knowledge article${articles.length !== 1 ? "s" : ""}. ${backedIds.size} job${backedIds.size !== 1 ? "s" : ""} ${backedIds.size === 1 ? "has" : "have"} documented backing. ${dark} job${dark !== 1 ? "s" : ""} ${dark === 1 ? "is" : "are"} dark — no supporting documentation found. Select a job to review matched articles.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:swjkn-toggle"));
    return "Swarm job knowledge coverage panel open, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function SwarmJobKnowledgeCoverage() {
  const [visible, setVisible] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [articles, setArticles] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [aiMap, setAiMap] = useState({});
  const [aiLoading, setAiLoading] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [sr, kr] = await Promise.all([
        fetch(`${apiBase()}/entities/SwarmJob`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({}),
        }),
        fetch(`${apiBase()}/knowledge/`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      const rawJobs = normaliseArray(sr.ok ? await sr.json() : []);
      const rawArticles = normaliseArray(kr.ok ? await kr.json() : []);
      setJobs(rawJobs);
      setArticles(rawArticles);
      setLinks(buildLinks(rawJobs, rawArticles));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:swjkn-toggle", onToggle);
    return () => window.removeEventListener("jarvis:swjkn-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, 120_000);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessJob(job, article) {
    const key = `${job.id || job._id || job.name}::${article.id || article._id || article.title}`;
    if (aiMap[key] || aiLoading === key) return;
    setAiLoading(key);
    const jobName =
      job.name || job.title || job.objective || job.type || "Unknown Job";
    const artTitle =
      article.title || article.name || article.heading || "Unknown Article";
    const snippet = article.content || article.summary || article.body || artTitle;
    const prompt = `As JARVIS, provide a 2-sentence assessment of how the knowledge article "${artTitle}" supports or informs the swarm job "${jobName}". Content excerpt: "${String(snippet).slice(0, 300)}". Be direct and operational.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAiMap((prev) => ({ ...prev, [key]: answer }));
      if (answer)
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
        );
    } catch (_) {
      setAiMap((prev) => ({
        ...prev,
        [key]: "Unable to reach reasoning core.",
      }));
    } finally {
      setAiLoading(null);
    }
  }

  const backedIds = new Set(links.map((l) => l.jobId));
  const darkCount = jobs.length - backedIds.size;

  const filtered = jobs
    .filter((j) => {
      const jid = j.id || j._id || j.name;
      if (filter === "backed") return backedIds.has(jid);
      if (filter === "dark") return !backedIds.has(jid);
      return true;
    })
    .filter((j) => {
      if (!search.trim()) return true;
      const txt = [
        j.name || "",
        j.title || "",
        j.objective || "",
        j.type || "",
        j.status || "",
      ]
        .join(" ")
        .toLowerCase();
      return txt.includes(search.toLowerCase());
    });

  const selectedLinks = selected
    ? links.filter(
        (l) => l.jobId === (selected.id || selected._id || selected.name)
      )
    : [];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Swarm Job × Knowledge Coverage"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 65,
          height: 26,
          padding: "0 8px",
          background: visible ? `${CY}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? CY : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? CY : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {darkCount > 0 && !visible && (
          <span
            style={{
              display: "inline-block",
              marginRight: 5,
              background: AMBER,
              color: "#000",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 9,
              lineHeight: "14px",
              textAlign: "center",
            }}
          >
            {darkCount}
          </span>
        )}
        ◈ SWJKN
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 44,
            left: Math.min(BTN_LEFT, window.innerWidth - 660),
            zIndex: 65,
            width: 640,
            maxHeight: "75vh",
            display: "flex",
            flexDirection: "column",
            background: "rgba(4,10,18,0.96)",
            border: `1px solid ${CY}44`,
            borderTop: `2px solid ${CY}`,
            borderRadius: 12,
            boxShadow: `0 0 40px ${CY}14, 0 8px 32px rgba(0,0,0,0.75)`,
            fontFamily: "'JetBrains Mono', monospace",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderBottom: `1px solid ${CY}22`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: CY, fontSize: 13 }}>◈</span>
            <span
              style={{
                color: CY,
                fontSize: 11,
                letterSpacing: 2,
                fontWeight: 700,
              }}
            >
              SWARM JOB KNOWLEDGE COVERAGE
            </span>
            {loading && (
              <span style={{ marginLeft: "auto", color: "#6E8AA0", fontSize: 10 }}>
                loading…
              </span>
            )}
            <button
              onClick={() => setVisible(false)}
              style={{
                marginLeft: loading ? 0 : "auto",
                background: "transparent",
                border: "none",
                color: "#6E8AA0",
                cursor: "pointer",
                fontSize: 16,
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
              gap: 8,
              padding: "8px 14px",
              borderBottom: `1px solid #1A2A3A`,
              flexShrink: 0,
            }}
          >
            {[
              { label: "JOBS", val: jobs.length, col: CY },
              { label: "ARTICLES", val: articles.length, col: VIOLET },
              { label: "BACKED", val: backedIds.size, col: GREEN },
              { label: "DARK", val: darkCount, col: AMBER },
            ].map((t) => (
              <div
                key={t.label}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid #1A2A3A",
                  borderRadius: 6,
                  padding: "5px 8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 14, color: t.col, fontWeight: 700 }}>
                  {t.val}
                </div>
                <div
                  style={{
                    fontSize: 8,
                    color: "#4E6A7A",
                    letterSpacing: 1,
                    marginTop: 1,
                  }}
                >
                  {t.label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "7px 14px",
              borderBottom: `1px solid #1A2A3A`,
              flexShrink: 0,
              alignItems: "center",
            }}
          >
            {["all", "backed", "dark"].map((f) => (
              <button
                key={f}
                onClick={() => {
                  setFilter(f);
                  setSelected(null);
                }}
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  border: `1px solid ${filter === f ? CY : "#2A3A4A"}`,
                  background: filter === f ? `${CY}22` : "transparent",
                  color: filter === f ? CY : "#6E8AA0",
                  fontSize: 10,
                  letterSpacing: 1,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textTransform: "uppercase",
                }}
              >
                {f}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: `1px solid #2A3A4A`,
                borderRadius: 4,
                padding: "2px 8px",
                color: "#DCEBF5",
                fontSize: 10,
                fontFamily: "inherit",
                width: 120,
                outline: "none",
              }}
            />
          </div>

          {/* Split body */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            {/* Job list */}
            <div
              style={{
                width: 230,
                borderRight: `1px solid #1A2A3A`,
                overflowY: "auto",
                flexShrink: 0,
              }}
            >
              {!loading && filtered.length === 0 && (
                <div style={{ padding: 14, color: "#6E8AA0", fontSize: 10 }}>
                  No jobs in this filter.
                </div>
              )}
              {filtered.map((j) => {
                const jid = j.id || j._id || j.name;
                const isBacked = backedIds.has(jid);
                const isActive =
                  selected &&
                  (selected.id || selected._id || selected.name) === jid;
                const status = (j.status || "").toString().toUpperCase();
                const statusColor =
                  status === "RUNNING"
                    ? GREEN
                    : status === "FAILED"
                    ? RED
                    : status === "QUEUED" || status === "PENDING"
                    ? AMBER
                    : CY;
                return (
                  <div
                    key={jid}
                    onClick={() => setSelected(j)}
                    style={{
                      padding: "9px 12px",
                      borderBottom: `1px solid #0E1A26`,
                      cursor: "pointer",
                      background: isActive ? `${CY}12` : "transparent",
                      borderLeft: isActive
                        ? `3px solid ${CY}`
                        : "3px solid transparent",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        marginBottom: 3,
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: isBacked ? GREEN : "#2A3A4A",
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 10,
                          color: "#DCEBF5",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {j.name || j.title || j.objective || jid}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 5, paddingLeft: 12 }}>
                      {status && (
                        <span
                          style={{
                            fontSize: 8,
                            color: statusColor,
                            letterSpacing: 1,
                            padding: "1px 4px",
                            border: `1px solid ${statusColor}44`,
                            borderRadius: 3,
                          }}
                        >
                          {status}
                        </span>
                      )}
                      {isBacked ? (
                        <span
                          style={{ fontSize: 8, color: GREEN, letterSpacing: 1 }}
                        >
                          {links.filter((l) => l.jobId === jid).length} article
                          {links.filter((l) => l.jobId === jid).length !== 1
                            ? "s"
                            : ""}
                        </span>
                      ) : (
                        <span
                          style={{ fontSize: 8, color: AMBER, letterSpacing: 1 }}
                        >
                          DARK
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Article detail pane */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {!selected && (
                <div
                  style={{
                    padding: 20,
                    color: "#6E8AA0",
                    fontSize: 10,
                    lineHeight: 1.6,
                  }}
                >
                  Select a swarm job to see matched knowledge articles.
                </div>
              )}
              {selected && selectedLinks.length === 0 && (
                <div style={{ padding: 20, color: "#6E8AA0", fontSize: 10 }}>
                  No matching knowledge articles for this job. Job is DARK — no
                  documentation found.
                </div>
              )}
              {selected && selectedLinks.length > 0 && (
                <div>
                  <div
                    style={{
                      padding: "8px 14px",
                      borderBottom: `1px solid #1A2A3A`,
                      color: GREEN,
                      fontSize: 10,
                      letterSpacing: 1,
                      fontWeight: 700,
                    }}
                  >
                    {selectedLinks.length} ARTICLE
                    {selectedLinks.length !== 1 ? "S" : ""} FOR "
                    {(
                      selected.name ||
                      selected.title ||
                      selected.objective ||
                      "JOB"
                    ).toUpperCase()}
                    "
                  </div>
                  {selectedLinks.map((link, i) => {
                    const art = link.article;
                    const artId = art.id || art._id || art.title;
                    const aiKey = `${selected.id || selected._id || selected.name}::${artId}`;
                    const aiText = aiMap[aiKey];
                    const isLoadingThis = aiLoading === aiKey;
                    return (
                      <div
                        key={`${aiKey}-${i}`}
                        style={{
                          padding: "10px 14px",
                          borderBottom: `1px solid #0E1A26`,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 8,
                            marginBottom: 5,
                          }}
                        >
                          <span
                            style={{
                              color: VIOLET,
                              fontSize: 12,
                              marginTop: 1,
                              flexShrink: 0,
                            }}
                          >
                            ◉
                          </span>
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontSize: 11,
                                color: "#DCEBF5",
                                marginBottom: 2,
                              }}
                            >
                              {art.title || art.name || art.heading || artId}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 6,
                                flexWrap: "wrap",
                              }}
                            >
                              {art.type && (
                                <span
                                  style={{
                                    fontSize: 8,
                                    color: VIOLET,
                                    letterSpacing: 1,
                                    padding: "1px 4px",
                                    border: `1px solid ${VIOLET}44`,
                                    borderRadius: 3,
                                  }}
                                >
                                  {art.type}
                                </span>
                              )}
                              <span
                                style={{
                                  fontSize: 8,
                                  color: "#4E6A7A",
                                  letterSpacing: 1,
                                }}
                              >
                                [{link.matchScore} keyword match
                                {link.matchScore !== 1 ? "es" : ""}]
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => assessJob(selected, art)}
                            disabled={isLoadingThis || !!aiText}
                            style={{
                              flexShrink: 0,
                              padding: "2px 8px",
                              borderRadius: 4,
                              border: `1px solid ${
                                aiText
                                  ? GREEN + "66"
                                  : VIOLET + "66"
                              }`,
                              background: aiText
                                ? `${GREEN}12`
                                : isLoadingThis
                                ? `${VIOLET}22`
                                : "transparent",
                              color: aiText ? GREEN : VIOLET,
                              fontSize: 9,
                              letterSpacing: 1,
                              cursor:
                                isLoadingThis || aiText
                                  ? "default"
                                  : "pointer",
                              fontFamily: "inherit",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {aiText
                              ? "✓ ASSESSED"
                              : isLoadingThis
                              ? "consulting…"
                              : "▶ ASSESS"}
                          </button>
                        </div>
                        {(art.summary || art.content || art.body) && (
                          <div
                            style={{
                              marginLeft: 20,
                              marginBottom: 5,
                              fontSize: 10,
                              color: "#4E8A9A",
                              lineHeight: 1.5,
                              maxHeight: 48,
                              overflow: "hidden",
                            }}
                          >
                            {String(
                              art.summary || art.content || art.body
                            ).slice(0, 180)}
                            …
                          </div>
                        )}
                        {aiText && (
                          <div
                            style={{
                              marginLeft: 20,
                              marginTop: 5,
                              padding: "6px 10px",
                              background: `${GREEN}0A`,
                              border: `1px solid ${GREEN}22`,
                              borderRadius: 5,
                              fontSize: 10,
                              color: "#A0D8B0",
                              lineHeight: 1.5,
                            }}
                          >
                            <span
                              style={{
                                color: GREEN,
                                fontSize: 8,
                                letterSpacing: 1,
                                fontWeight: 700,
                                display: "block",
                                marginBottom: 3,
                              }}
                            >
                              JARVIS ASSESSMENT
                            </span>
                            {aiText}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "5px 14px",
              borderTop: `1px solid ${CY}18`,
              fontSize: 10,
              color: "#4E6A7A",
              letterSpacing: 1,
              flexShrink: 0,
            }}
          >
            /entities/SwarmJob + /knowledge/ · 120-s auto-refresh · click ▶ ASSESS for AI relevance
          </div>
        </div>
      )}
    </>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of [
      "items",
      "results",
      "data",
      "jobs",
      "articles",
      "records",
      "nodes",
    ]) {
      if (Array.isArray(data[k])) return data[k];
    }
  }
  return [];
}

function keywords(str) {
  if (!str) return [];
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function buildLinks(jobs, articles) {
  if (!jobs.length || !articles.length) return [];
  const results = [];
  for (const j of jobs) {
    const jid = j.id || j._id || j.name;
    const jText = [
      j.name || "",
      j.title || "",
      j.objective || "",
      j.type || "",
      j.description || "",
      ...(Array.isArray(j.tags) ? j.tags : []),
    ].join(" ");
    const jKws = keywords(jText);
    if (!jKws.length) continue;
    for (const art of articles) {
      const artText = [
        art.title || "",
        art.name || "",
        art.heading || "",
        art.summary || "",
        art.type || "",
        ...(Array.isArray(art.tags) ? art.tags : []),
      ].join(" ");
      const artKws = keywords(artText);
      const score = jKws.filter((w) => artKws.includes(w)).length;
      if (score >= 1) results.push({ jobId: jid, article: art, matchScore: score });
    }
  }
  results.sort((a, b) => b.matchScore - a.matchScore);
  return results;
}
