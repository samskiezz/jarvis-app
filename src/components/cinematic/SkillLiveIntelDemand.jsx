/**
 * F36 — Skill × Live Intel World Demand Gauge (SKILD)
 *
 * Parallel-fetches /v1/aip/skill (JARVIS skill catalog) and
 * /functions/getLiveIntel (earthquakes + crypto + FX), then
 * keyword-correlates each skill's domain against live world events to surface:
 *
 *   ACTIVATED — at least one live world event calls for this skill right now
 *   IDLE      — no current world demand for this skill
 *
 * Stat tiles: skills / live events / activated / idle
 * Filter tabs: ALL | ACTIVATED | IDLE + text search
 * Expand any skill → matched live events with type badge (SEISMIC/CRYPTO/FX)
 *   + relevance score bar.
 * Amber badge on activated count (skills JARVIS needs right now).
 * ▶ ASSESS: 2-sentence skill-world-demand brief via /v1/jarvis/agent/chat +
 *   jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SKILD  at bottom:8 left:56200, zIndex:109.
 * Event:   jarvis:skild-toggle
 * Voice:   "skill demand / world skill / which skills / active skills /
 *           skill intel / skill world demand / skild / skills needed now"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 56200;
const POLL_MS  = 90_000;
const AMBER    = "#F59E0B";
const CYAN     = "#29E7FF";
const GREEN    = "#34D399";
const RED      = "#FF4444";
const VIOLET   = "#A78BFA";
const SLATE    = "#6E8AA0";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const SKILD_RE =
  /\b(skill\s+demand|world\s+skill[s]?|which\s+skills|active\s+skill[s]?|skill\s+intel|skill[\s-]world[\s-]demand|skild|skills?\s+needed\s+now|current\s+skill[s]?\s+demand|live\s+skill[s]?|skill\s+activation[s]?|what\s+skills\s+(are\s+)?(needed|active|triggered))\b/i;

export function isSkildQuery(q) { return SKILD_RE.test(q); }

export async function buildSkildScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [skillRes, intelRes] = await Promise.all([
      fetch(`${base}/v1/aip/skill`,          { headers: hdr }),
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
    ]);
    const skills = normaliseSkills(await skillRes.json());
    const events = normaliseEvents(await intelRes.json());

    const activated = skills.filter(
      (s) => events.some((e) => relevance(s, e) > 0)
    ).length;
    const idle = skills.length - activated;

    const seismic = events.filter((e) => e.type === "SEISMIC").length;
    const crypto  = events.filter((e) => e.type === "CRYPTO").length;
    const fx      = events.filter((e) => e.type === "FX").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS skill world-demand analysis: ${skills.length} skills cross-referenced ` +
          `against ${events.length} live world events ` +
          `(${seismic} seismic, ${crypto} crypto, ${fx} FX). ` +
          `${activated} skills show active world demand; ${idle} skills are idle. ` +
          `Provide a 2-sentence skill-demand brief — formal British butler tone, ` +
          `first person, highlight which skill domains the world currently demands.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Skill world-demand analysis complete, sir.").trim();
  } catch {
    return "Skill world-demand assessment unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseSkills(raw) {
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.skills)             ? raw.skills
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.map((s, i) => ({
    id:       s.id          || s.skill_id    || String(i),
    name:     s.name        || s.title       || s.label       || `Skill ${i + 1}`,
    category: s.category    || s.type        || s.domain      || "general",
    level:    s.level       || s.score       || s.proficiency || null,
    tags:     Array.isArray(s.tags) ? s.tags.join(" ") : (s.tags || ""),
    desc:     (s.description || s.summary || s.notes || "").toString().slice(0, 300),
  }));
}

function normaliseEvents(raw) {
  const quakes = Array.isArray(raw?.earthquakes) ? raw.earthquakes : [];
  const crypto = Array.isArray(raw?.crypto)      ? raw.crypto      : [];
  const fx     = Array.isArray(raw?.fx)          ? raw.fx          :
                 Array.isArray(raw?.forex)        ? raw.forex       : [];
  const out = [];

  quakes.forEach((q, i) => {
    const mag   = q.magnitude ?? q.mag ?? q.properties?.mag ?? "";
    const place = q.place ?? q.location ?? q.properties?.place ?? "";
    const title = q.title ?? q.properties?.title ?? `M${mag} ${place}`;
    out.push({
      id:    `quake-${i}`,
      type:  "SEISMIC",
      title: String(title).slice(0, 120),
      body:  `magnitude:${mag} region:${place} earthquake seismic disaster emergency crisis geophysics geology relief response monitoring geospatial`.slice(0, 300),
      col:   RED,
    });
  });

  crypto.forEach((c, i) => {
    const sym    = c.symbol ?? c.name ?? `CRYPTO${i}`;
    const change = c.change_24h ?? c.change ?? c.pct_change ?? "";
    out.push({
      id:    `crypto-${i}`,
      type:  "CRYPTO",
      title: `${sym}${change ? " " + (Number(change) >= 0 ? "+" : "") + Number(change).toFixed(2) + "%" : ""}`.trim(),
      body:  `asset:${sym} cryptocurrency blockchain digital-asset defi token trading investment market finance portfolio risk`.slice(0, 300),
      col:   CYAN,
    });
  });

  fx.forEach((f, i) => {
    const pair = f.pair ?? f.symbol ?? f.name ?? `FX${i}`;
    const rate = f.rate ?? f.price ?? f.value ?? "";
    out.push({
      id:    `fx-${i}`,
      type:  "FX",
      title: `${pair}${rate ? " @ " + Number(rate).toFixed(4) : ""}`,
      body:  `currency:${pair} forex exchange-rate international trade monetary policy macroeconomics finance economics`.slice(0, 300),
      col:   VIOLET,
    });
  });

  return out;
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"'%+]+/)
    .filter((w) => w.length >= 3);
}

function relevance(skill, event) {
  const sw = keywords(`${skill.name} ${skill.category} ${skill.tags} ${skill.desc}`);
  const ew = keywords(`${event.title} ${event.body}`);
  return sw.filter((w) => ew.some((p) => p.includes(w) || w.includes(p))).length;
}

function buildLinked(skills, events) {
  return skills.map((s) => {
    const matched = events
      .map((e) => ({ ...e, score: relevance(s, e) }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...s, events: matched, activated: matched.length > 0 };
  });
}

function levelColor(lvl) {
  if (!lvl) return SLATE;
  const n = typeof lvl === "number" ? lvl : parseFloat(lvl);
  if (n >= 90) return GREEN;
  if (n >= 70) return CYAN;
  if (n >= 50) return AMBER;
  return SLATE;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "ACTIVATED", "IDLE"];

export default function SkillLiveIntelDemand() {
  const [open,      setOpen]      = useState(false);
  const [skills,    setSkills]    = useState([]);
  const [events,    setEvents]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [skillRes, intelRes] = await Promise.all([
        fetch(`${base}/v1/aip/skill`,          { headers: hdr }),
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      ]);
      if (skillRes.ok) setSkills(normaliseSkills(await skillRes.json()));
      if (intelRes.ok) setEvents(normaliseEvents(await intelRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:skild-toggle", handler);
    return () => window.removeEventListener("jarvis:skild-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const linked    = buildLinked(skills, events);
  const activated = linked.filter((s) => s.activated);
  const idle      = linked.filter((s) => !s.activated);

  const visible = linked
    .filter((s) => {
      if (filter === "ACTIVATED") return s.activated;
      if (filter === "IDLE")      return !s.activated;
      return true;
    })
    .filter((s) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        s.name.toLowerCase().includes(q)     ||
        s.category.toLowerCase().includes(q) ||
        s.desc.toLowerCase().includes(q)     ||
        s.tags.toLowerCase().includes(q)
      );
    });

  const assess = async () => {
    setAssessing(true);
    try {
      const script = await buildSkildScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 109,
          background: activated.length > 0
            ? "rgba(245,158,11,0.18)"
            : "rgba(41,231,255,0.10)",
          border: `1px solid ${activated.length > 0 ? AMBER : CYAN}`,
          color: activated.length > 0 ? AMBER : CYAN,
          fontSize: 10,
          padding: "3px 8px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: "0.06em",
          fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}
        title="Skill × Live Intel World Demand"
      >
        ◈ SKILD
        {activated.length > 0 && (
          <span
            style={{
              marginLeft: 5,
              background: AMBER,
              color: "#000",
              borderRadius: 9,
              padding: "0 5px",
              fontSize: 9,
              fontWeight: 700,
            }}
          >
            {activated.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 36,
        left: Math.min(BTN_LEFT, window.innerWidth - 560),
        width: 530,
        maxHeight: "78vh",
        overflowY: "auto",
        background: "rgba(8,14,24,0.97)",
        border: `1px solid ${activated.length > 0 ? AMBER : CYAN}`,
        borderRadius: 10,
        zIndex: 9000,
        padding: "14px 16px",
        fontFamily: "monospace",
        color: CYAN,
        boxShadow: "0 0 32px rgba(245,158,11,0.12)",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em" }}>
          ◈ SKILL × LIVE INTEL WORLD DEMAND
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={assess}
            disabled={assessing || skills.length === 0}
            style={{
              background: "rgba(245,158,11,0.12)",
              border: `1px solid ${AMBER}`,
              color: AMBER,
              fontSize: 10,
              padding: "3px 9px",
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            {assessing ? "ASSESSING…" : "▶ ASSESS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "transparent",
              border: "none",
              color: SLATE,
              fontSize: 14,
              cursor: "pointer",
              padding: "0 4px",
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* stat tiles */}
      {(() => {
        const tiles = [
          { label: "SKILLS",      value: linked.length,     col: CYAN  },
          { label: "LIVE EVENTS", value: events.length,     col: SLATE },
          { label: "ACTIVATED",   value: activated.length,  col: activated.length > 0 ? AMBER : GREEN },
          { label: "IDLE",        value: idle.length,       col: SLATE },
        ];
        return (
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {tiles.map((t) => (
              <div
                key={t.label}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 6,
                  padding: "6px 8px",
                  textAlign: "center",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 700, color: t.col }}>{t.value}</div>
                <div style={{ fontSize: 9, color: SLATE, marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* last fetch */}
      {lastFetch && (
        <div style={{ fontSize: 9, color: SLATE, marginBottom: 8 }}>
          Last updated: {lastFetch.toLocaleTimeString()} · auto-refresh 90 s
        </div>
      )}

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? "rgba(245,158,11,0.15)" : "transparent",
              border: `1px solid ${filter === t ? AMBER : "rgba(255,255,255,0.1)"}`,
              color: filter === t ? AMBER : SLATE,
              fontSize: 10,
              padding: "3px 9px",
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search skills…"
          style={{
            marginLeft: "auto",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: CYAN,
            fontSize: 10,
            padding: "3px 8px",
            borderRadius: 4,
            fontFamily: "monospace",
            outline: "none",
            width: 130,
          }}
        />
      </div>

      {/* event type legend */}
      <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
        {[["SEISMIC", RED], ["CRYPTO", CYAN], ["FX", VIOLET]].map(([label, col]) => (
          <span key={label} style={{ fontSize: 9, color: col }}>
            ■ {label} ({events.filter((e) => e.type === label).length})
          </span>
        ))}
      </div>

      {/* loading */}
      {loading && <div style={{ fontSize: 11, color: SLATE, marginBottom: 8 }}>Loading…</div>}

      {/* empty state */}
      {!loading && visible.length === 0 && (
        <div style={{ fontSize: 11, color: SLATE }}>No skills match the current filter.</div>
      )}

      {/* skill list */}
      {visible.map((skill) => (
        <div
          key={skill.id}
          style={{
            marginBottom: 6,
            background: skill.activated
              ? "rgba(245,158,11,0.07)"
              : "rgba(255,255,255,0.03)",
            border: `1px solid ${skill.activated ? "rgba(245,158,11,0.3)" : "rgba(255,255,255,0.07)"}`,
            borderRadius: 6,
            padding: "7px 10px",
          }}
        >
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer" }}
            onClick={() => setExpanded(expanded === skill.id ? null : skill.id)}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 11, color: skill.activated ? AMBER : CYAN, wordBreak: "break-word" }}>
                {skill.name}
              </span>
              {skill.category && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 9,
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: "rgba(110,138,160,0.15)",
                    color: SLATE,
                    border: "1px solid rgba(110,138,160,0.3)",
                    verticalAlign: "middle",
                  }}
                >
                  {skill.category.toUpperCase()}
                </span>
              )}
              {skill.level != null && (
                <span
                  style={{
                    marginLeft: 5,
                    fontSize: 9,
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: `${levelColor(skill.level)}22`,
                    color: levelColor(skill.level),
                    border: `1px solid ${levelColor(skill.level)}44`,
                    verticalAlign: "middle",
                  }}
                >
                  {typeof skill.level === "number" ? `${Math.round(skill.level)}%` : skill.level}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 8 }}>
              <span
                style={{
                  fontSize: 9,
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: skill.activated ? `${AMBER}22` : `${SLATE}22`,
                  color: skill.activated ? AMBER : SLATE,
                  border: `1px solid ${skill.activated ? `${AMBER}44` : `${SLATE}44`}`,
                  fontWeight: 700,
                }}
              >
                {skill.activated ? `ACTIVATED (${skill.events.length})` : "IDLE"}
              </span>
              <span style={{ fontSize: 10, color: SLATE }}>{expanded === skill.id ? "▲" : "▼"}</span>
            </div>
          </div>

          {expanded === skill.id && (
            <div style={{ marginTop: 8 }}>
              {skill.desc && (
                <div style={{ fontSize: 10, color: SLATE, marginBottom: 6, lineHeight: 1.4 }}>
                  {skill.desc.slice(0, 200)}
                </div>
              )}
              {skill.activated ? (
                skill.events.map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 6px",
                      marginBottom: 3,
                      background: "rgba(255,255,255,0.03)",
                      borderRadius: 4,
                      border: `1px solid ${ev.col}22`,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 8,
                        padding: "1px 4px",
                        borderRadius: 2,
                        background: `${ev.col}22`,
                        color: ev.col,
                        border: `1px solid ${ev.col}44`,
                        flexShrink: 0,
                      }}
                    >
                      {ev.type}
                    </span>
                    <span style={{ fontSize: 10, color: "#c0d4e4", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ev.title}
                    </span>
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 3 }}>
                      <div
                        style={{
                          width: Math.min(ev.score * 14, 60),
                          height: 4,
                          background: AMBER,
                          borderRadius: 2,
                          opacity: 0.7,
                        }}
                      />
                      <span style={{ fontSize: 9, color: SLATE }}>{ev.score}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 10, color: SLATE }}>
                  No live world events currently demand this skill.
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
