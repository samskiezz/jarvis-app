/**
 * F209: Scene × Graph Community × Knowledge Triple Coverage (SGKTRI)
 *
 * Parallel-fetches /v1/cinematic/scene/{id} (10 scenes) × /v1/graph/communities
 * × /knowledge/, then keyword-correlates each scene's anchor text against
 * graph network communities AND KB articles.
 *
 * Coverage states:
 *   FULLY ILLUMINATED — community-backed + KB-documented
 *   COMMUNITY-ONLY    — community match, no KB article
 *   KB-ONLY           — KB found, no community match
 *   DARK              — neither community nor knowledge coverage
 *
 * Voice trigger: "sgktri" / "scene graph knowledge" / "illuminated scene" / "dark scene"
 */

import { useState, useEffect, useRef } from "react";

const API     = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const API_KEY = import.meta.env.VITE_API_KEY ?? "dev-key";
const hdr     = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };

const SCENE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const CY = "#00CFFF";
const LM = "#A3E635";
const AM = "#F59E0B";
const RD = "#EF4444";

const SGKTRI_RE =
  /\b(sgktri|scene[._-]?graph[._-]?knowledge|graph[._-]?scene[._-]?know(ledge)?|illumin(ated)?\s+scene|dark\s+scene|scene\s+coverage\s+tri(ple)?)\b/i;

export function isSgktriQuery(t) { return SGKTRI_RE.test(t || ""); }

// ── normalizers ───────────────────────────────────────────────────────────────

function normaliseScenes(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(s => ({
    id:    s.id ?? s.scene_id ?? "?",
    label: String(s.title ?? s.label ?? s.name ?? s.id ?? "Scene"),
  }));
}

function normaliseCommunities(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.communities ?? raw?.data ?? []);
  return arr.map(c => ({
    id:    c.id ?? c.community_id ?? "?",
    label: String(c.label ?? c.name ?? c.id ?? "Community"),
  }));
}

function normaliseArticles(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.articles ?? raw?.items ?? raw?.data ?? []);
  return arr.map(a => ({
    id:    a.id ?? a.article_id ?? "?",
    label: String(a.title ?? a.name ?? a.summary ?? a.id ?? "Article"),
  }));
}

// ── token helpers ─────────────────────────────────────────────────────────────

function tokens(str) {
  return (str || "").toLowerCase().split(/[^a-z]+/).filter(t => t.length > 2);
}

function matchScore(aToks, bToks) {
  if (!aToks.length || !bToks.length) return 0;
  const sa = new Set(aToks);
  const sb = new Set(bToks);
  let inter = 0;
  sa.forEach(t => { if (sb.has(t)) inter++; });
  return inter / Math.max(sa.size, sb.size);
}

// ── correlator ────────────────────────────────────────────────────────────────

function coverageState(communityMatch, kbMatch) {
  if (communityMatch && kbMatch)  return "FULLY ILLUMINATED";
  if (communityMatch)             return "COMMUNITY-ONLY";
  if (kbMatch)                    return "KB-ONLY";
  return "DARK";
}

function correlate(scenes, communities, articles) {
  return scenes.map(scene => {
    const scToks = tokens(scene.label);
    const communityMatch = communities.some(c => matchScore(scToks, tokens(c.label)) > 0.15);
    const kbMatch        = articles.some(a  => matchScore(scToks, tokens(a.label))  > 0.15);
    return { ...scene, state: coverageState(communityMatch, kbMatch), communityMatch, kbMatch };
  });
}

// ── data fetcher ──────────────────────────────────────────────────────────────

async function fetchAll() {
  const sceneResults = await Promise.all(
    SCENE_IDS.map(id =>
      fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdr })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    )
  );
  const scenes = normaliseScenes(sceneResults.filter(Boolean));

  const [commRaw, kbRaw] = await Promise.all([
    fetch(`${API}/v1/graph/communities`, { headers: hdr }).then(r => r.json()).catch(() => []),
    fetch(`${API}/knowledge/`,            { headers: hdr }).then(r => r.json()).catch(() => []),
  ]);
  return correlate(scenes, normaliseCommunities(commRaw), normaliseArticles(kbRaw));
}

// ── spoken script builder ─────────────────────────────────────────────────────

export async function buildSgktriScript() {
  try {
    const rows = await fetchAll();
    if (!rows.length) return "Scene × Graph × Knowledge triple coverage unavailable — check endpoints.";
    const counts = { "FULLY ILLUMINATED": 0, "COMMUNITY-ONLY": 0, "KB-ONLY": 0, "DARK": 0 };
    rows.forEach(r => { counts[r.state] = (counts[r.state] || 0) + 1; });
    const dark  = counts["DARK"];
    const total = rows.length;
    return (
      `SGKTRI coverage across ${total} scene${total !== 1 ? "s" : ""}: ` +
      `${counts["FULLY ILLUMINATED"]} fully illuminated, ` +
      `${counts["COMMUNITY-ONLY"]} community-only, ` +
      `${counts["KB-ONLY"]} KB-only, ` +
      `${dark} dark. ` +
      (dark > 0
        ? `${dark} scene${dark !== 1 ? "s" : ""} lack both graph community and knowledge coverage — ` +
          `recommend enrichment or corpus review.`
        : `All scenes carry at least partial coverage. Network and knowledge assets are aligned.`)
    );
  } catch {
    return "Scene × Graph × Knowledge triple coverage unavailable — check endpoints.";
  }
}

// ── badge colours ─────────────────────────────────────────────────────────────

const STATE_COLOR = {
  "FULLY ILLUMINATED": LM,
  "COMMUNITY-ONLY":    CY,
  "KB-ONLY":           AM,
  "DARK":              RD,
};

const STATE_ORDER = ["FULLY ILLUMINATED", "COMMUNITY-ONLY", "KB-ONLY", "DARK"];

// ── component ─────────────────────────────────────────────────────────────────

export default function SceneGraphKnowledgeTriple() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      setRows(await fetchAll());
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const onToggle = () => setOpen(o => { if (!o) load(); return !o; });
    window.addEventListener("jarvis:sgktri-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sgktri-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open]);

  async function assess() {
    setAssessing(true);
    const script = await buildSgktriScript();
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    setAssessing(false);
  }

  const counts = {};
  rows.forEach(r => { counts[r.state] = (counts[r.state] || 0) + 1; });
  const dark = counts["DARK"] ?? 0;

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Scene × Graph Community × Knowledge Triple Coverage (SGKTRI)"
        style={{
          position: "fixed", left: 744000, bottom: 8, zIndex: 357,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${dark > 0 ? RD : CY}55`,
          borderRadius: 7, padding: "3px 10px", cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          color: dark > 0 ? RD : CY, letterSpacing: 1,
          boxShadow: dark > 0 ? `0 0 12px ${RD}44` : `0 0 8px ${CY}33`,
        }}>
        SGKTRI{dark > 0 ? ` ▲${dark}` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", right: 16, top: 16, width: 700, maxHeight: 620,
      background: "rgba(6,10,18,0.96)", border: `1px solid ${CY}33`,
      borderRadius: 12, zIndex: 6002, overflow: "hidden",
      fontFamily: "'JetBrains Mono',monospace",
      boxShadow: `0 0 60px ${CY}18`,
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        borderBottom: `1px solid ${CY}22`, background: "rgba(0,207,255,0.04)",
      }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>
          SCENE × GRAPH COMMUNITY × KNOWLEDGE — TRIPLE COVERAGE
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: "none", border: `1px solid ${CY}44`, borderRadius: 5,
              color: CY, fontSize: 9, padding: "2px 8px", cursor: "pointer", letterSpacing: 1,
            }}>
            {assessing ? "…" : "ASSESS"}
          </button>
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: "none", border: `1px solid ${CY}44`, borderRadius: 5,
              color: CY, fontSize: 9, padding: "2px 8px", cursor: "pointer", letterSpacing: 1,
            }}>↺</button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none", border: "none", color: "#6E8AA0",
              fontSize: 13, cursor: "pointer", padding: "0 4px",
            }}>✕</button>
        </span>
      </div>

      {/* summary bar */}
      <div style={{
        display: "flex", gap: 20, padding: "6px 14px",
        borderBottom: `1px solid ${CY}11`, fontSize: 10,
      }}>
        {STATE_ORDER.map(s => (
          <span key={s} style={{ color: STATE_COLOR[s] }}>
            {counts[s] ?? 0} {s}
          </span>
        ))}
        {loading && (
          <span style={{ marginLeft: "auto", color: CY, letterSpacing: 1 }}>↻ loading…</span>
        )}
      </div>

      {/* row list */}
      <div style={{ overflowY: "auto", maxHeight: 490, padding: "4px 0" }}>
        {err && (
          <div style={{ padding: "8px 14px", color: RD, fontSize: 10 }}>⚠ {err}</div>
        )}
        {!loading && !err && rows.length === 0 && (
          <div style={{
            padding: "16px 14px", color: "#6E8AA0", fontSize: 10, textAlign: "center",
          }}>
            No scene data — check /v1/cinematic/scene/&#123;id&#125; endpoint.
          </div>
        )}
        {rows.map(row => (
          <div
            key={row.id}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "5px 14px", borderBottom: `1px solid ${CY}0A`,
            }}>
            <span style={{
              width: 118, fontSize: 9, fontWeight: 700, letterSpacing: 1,
              color: STATE_COLOR[row.state], flexShrink: 0,
            }}>
              {row.state}
            </span>
            <span style={{
              flex: 1, fontSize: 10, color: "#DCEBF5",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {row.label}
            </span>
            <span style={{ display: "flex", gap: 6, fontSize: 9, flexShrink: 0 }}>
              <span style={{ color: row.communityMatch ? LM : "#3A4A58" }}>◉ GC</span>
              <span style={{ color: row.kbMatch        ? AM : "#3A4A58" }}>◉ KB</span>
            </span>
          </div>
        ))}
      </div>

      {/* legend */}
      <div style={{
        display: "flex", gap: 16, padding: "5px 14px",
        borderTop: `1px solid ${CY}11`, fontSize: 9, color: "#3A4A58",
      }}>
        <span style={{ color: LM }}>◉ GC — graph community match</span>
        <span style={{ color: AM }}>◉ KB — knowledge article match</span>
        <span style={{ marginLeft: "auto" }}>auto-refresh 90 s</span>
      </div>
    </div>
  );
}
