/**
 * F232 — IntelProfile × Task × Investigation Coverage Matrix (ITICMAP)
 *
 * Parallel-fetches /entities/IntelProfile + /entities/Task + /v1/investigations
 * and keyword-correlates each Intel Profile against tasks AND investigations:
 *
 *   FULLY_TRACKED    — matched task + investigation (full operational coverage)
 *   TASKED_ONLY      — matched task only (no backing investigation)
 *   INVESTIGATED_ONLY — matched investigation only (no associated task)
 *   UNTRACKED        — no matches (intelligence coverage gap)
 *
 * Stat tiles: INTEL PROFILES / TASKS / INVESTIGATIONS + four class counts + COVERAGE%.
 * Amber badge on UNTRACKED count.
 * Filter tabs ALL / FULLY_TRACKED / TASKED_ONLY / INVESTIGATED_ONLY / UNTRACKED + text search.
 * Expand profile → matched task cards (cyan) + matched investigation cards (teal).
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:iticmap-toggle event.
 *
 * Voice triggers:
 *   "iticmap / intel profile coverage / untracked profiles / intel coverage /
 *    profile investigation task / intel tracking"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_071_160;
const Z_INDEX  = 291;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const ITICMAP_RE = /\b(iticmap|intel[\s-]profile[\s-]coverage|untracked[\s-]profiles?|intel[\s-]coverage|profile[\s-]investigation[\s-]task|intel[\s-]tracking|intel[\s-]profile[\s-]task|profile[\s-]coverage[\s-]matrix)\b/i;

export function isIticmapQuery(q = "") { return ITICMAP_RE.test(q); }

export async function buildIticmapScript() {
  const base = apiBase();
  const [pR, tR, iR] = await Promise.allSettled([
    fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
    fetch(`${base}/entities/Task`).then(r => r.json()),
    fetch(`${base}/v1/investigations`).then(r => r.json()),
  ]);
  const profiles      = pR.status === "fulfilled" ? (pR.value?.items || pR.value?.profiles || pR.value || []) : [];
  const tasks         = tR.status === "fulfilled" ? (tR.value?.items || tR.value?.tasks || tR.value || []) : [];
  const investigations = iR.status === "fulfilled" ? (iR.value?.items || iR.value?.investigations || iR.value || []) : [];

  let fullyTracked = 0, untracked = 0;
  for (const p of profiles) {
    const kws  = keywords(profileText(p));
    const hasT = tasks.some(t => scoreText(taskText(t), kws) > 0);
    const hasI = investigations.some(inv => scoreText(investigationText(inv), kws) > 0);
    if (hasT && hasI) fullyTracked++;
    else if (!hasT && !hasI) untracked++;
  }
  const total      = profiles.length;
  const coveragePct = total ? Math.round((fullyTracked / total) * 100) : 0;
  return `ITICMAP Intel Profile Coverage Matrix online, sir. I have cross-referenced ${total} intel profiles against ${tasks.length} operational tasks and ${investigations.length} active investigations. ${fullyTracked} profiles have full operational coverage — both a task and a backing investigation — representing ${coveragePct}% comprehensive intelligence tracking. ${untracked} profiles are completely untracked with no associated tasks or investigations — these represent critical intelligence gaps requiring immediate operational assignment, sir.`;
}

const CY   = "#00CFFF";
const TE   = "#2DD4BF";
const AM   = "#F59E0B";
const PU   = "#A78BFA";
const GR   = "#22C55E";
const BG   = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_TRACKED:      GR,
  TASKED_ONLY:        CY,
  INVESTIGATED_ONLY:  TE,
  UNTRACKED:          AM,
};

const TABS = ["ALL", "FULLY_TRACKED", "TASKED_ONLY", "INVESTIGATED_ONLY", "UNTRACKED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0);
}

function profileText(p) {
  return [p.name, p.aliases, p.organisation, p.role, p.description, ...(p.tags || [])].filter(Boolean).join(" ");
}
function taskText(t) {
  return [t.name, t.title, t.description, t.type, t.status, ...(t.tags || [])].filter(Boolean).join(" ");
}
function investigationText(inv) {
  return [inv.title, inv.name, inv.description, inv.status, ...(inv.tags || [])].filter(Boolean).join(" ");
}

function classify(profile, tasks, investigations) {
  const kws = keywords(profileText(profile));
  const matchedTasks = tasks
    .map(t => ({ ...t, _score: scoreText(taskText(t), kws) }))
    .filter(t => t._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedInvs = investigations
    .map(inv => ({ ...inv, _score: scoreText(investigationText(inv), kws) }))
    .filter(inv => inv._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);

  const hasT = matchedTasks.length > 0;
  const hasI = matchedInvs.length > 0;
  let cls;
  if (hasT && hasI)       cls = "FULLY_TRACKED";
  else if (hasT && !hasI) cls = "TASKED_ONLY";
  else if (!hasT && hasI) cls = "INVESTIGATED_ONLY";
  else                    cls = "UNTRACKED";

  return { ...profile, _cls: cls, _t: matchedTasks, _i: matchedInvs };
}

function smallBtn(col) {
  return {
    fontFamily: FONT, fontSize: 9, background: "transparent",
    border: `1px solid ${col}66`, color: col, padding: "2px 6px",
    borderRadius: 3, cursor: "pointer",
  };
}

function RelevanceBar({ score, max, col }) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  return (
    <div style={{ height: 3, background: "#1A2840", borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 2, transition: "width 0.3s" }} />
    </div>
  );
}

export default function IntelProfileTaskInvestigationMatrix() {
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [profiles, setProfiles]   = useState([]);
  const [tasks, setTasks]         = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [classified, setClassified] = useState([]);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]         = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const base = apiBase();
      const [pR, tR, iR] = await Promise.allSettled([
        fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
        fetch(`${base}/entities/Task`).then(r => r.json()),
        fetch(`${base}/v1/investigations`).then(r => r.json()),
      ]);
      const p = pR.status === "fulfilled" ? (pR.value?.items || pR.value?.profiles || pR.value || []) : [];
      const t = tR.status === "fulfilled" ? (tR.value?.items || tR.value?.tasks || tR.value || []) : [];
      const i = iR.status === "fulfilled" ? (iR.value?.items || iR.value?.investigations || iR.value || []) : [];
      setProfiles(p);
      setTasks(t);
      setInvestigations(i);
      setClassified(p.map(prof => classify(prof, t, i)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:iticmap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:iticmap-toggle", onToggle);
  }, []);

  const fullyTracked     = classified.filter(c => c._cls === "FULLY_TRACKED").length;
  const taskedOnly       = classified.filter(c => c._cls === "TASKED_ONLY").length;
  const investigatedOnly = classified.filter(c => c._cls === "INVESTIGATED_ONLY").length;
  const untracked        = classified.filter(c => c._cls === "UNTRACKED").length;
  const total            = classified.length;
  const coveragePct      = total ? Math.round((fullyTracked / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || profileText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `ITICMAP: ${total} intel profiles — FULLY_TRACKED: ${fullyTracked}, TASKED_ONLY: ${taskedOnly}, INVESTIGATED_ONLY: ${investigatedOnly}, UNTRACKED: ${untracked} (${coveragePct}% full coverage). Tasks: ${tasks.length}. Investigations: ${investigations.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `ITICMAP intel profile coverage assessment. Context: ${ctx}. Provide a 2-sentence brief identifying which untracked intel profiles represent the highest-priority operational gaps with no task assignments or backing investigations, and what immediate actions should be taken. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = d?.response || d?.message || d?.content || d?.text || JSON.stringify(d);
      setBrief(txt);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: txt }),
      }).then(async res => {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
      }).catch(() => {});
    } catch (e) {
      setBrief("Assessment unavailable: " + e.message);
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 9, background: "rgba(0,207,255,0.07)",
          border: "1px solid #00CFFF44", color: CY, padding: "3px 8px",
          borderRadius: 3, cursor: "pointer", letterSpacing: 1,
        }}
        title="IntelProfile × Task × Investigation Coverage Matrix"
      >
        {untracked > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 2, padding: "0 4px", marginRight: 4, fontSize: 8 }}>
            {untracked}
          </span>
        )}
        ◈ ITICMAP
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 48, left: BTN_LEFT - 400, zIndex: Z_INDEX,
      width: 560, maxHeight: "78vh", display: "flex", flexDirection: "column",
      background: BG, border: "1px solid #00CFFF33", borderRadius: 6,
      fontFamily: FONT, color: CY, fontSize: 11,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #00CFFF22", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 10, letterSpacing: 1 }}>◈ ITICMAP — INTEL PROFILE × TASK × INVESTIGATION</span>
        <button onClick={load} style={smallBtn(CY)} disabled={loading}>{loading ? "…" : "↻"}</button>
        <button onClick={() => setOpen(false)} style={smallBtn("#EF4444")}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px", flexWrap: "wrap" }}>
        {[
          ["INTEL PROFILES", total, CY],
          ["TASKS", tasks.length, PU],
          ["INVESTIGATIONS", investigations.length, TE],
          ["FULLY TRACKED", fullyTracked, GR],
          ["TASKED ONLY", taskedOnly, CY],
          ["INVEST. ONLY", investigatedOnly, TE],
          ["UNTRACKED", untracked, AM],
          ["COVERAGE", coveragePct + "%", coveragePct > 60 ? GR : coveragePct > 30 ? AM : "#EF4444"],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: "#0A1628", border: `1px solid ${col}33`, borderRadius: 4, padding: "4px 8px", minWidth: 70, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: col, fontWeight: 700 }}>{val}</div>
            <div style={{ fontSize: 8, color: "#4A7A9B", marginTop: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 12px 6px", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...smallBtn(tab === t ? CLASS_COLOR[t] || CY : "#4A7A9B"),
              background: tab === t ? (CLASS_COLOR[t] || CY) + "22" : "transparent",
              fontSize: 9,
            }}
          >
            {t.replace(/_/g, " ")} {t !== "ALL" && classified.filter(c => c._cls === t).length > 0 ? `(${classified.filter(c => c._cls === t).length})` : ""}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "0 12px 6px" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search intel profiles…"
          style={{
            width: "100%", background: "#0A1628", border: "1px solid #00CFFF22",
            color: CY, fontFamily: FONT, fontSize: 10, padding: "4px 8px",
            borderRadius: 3, outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{ color: "#EF4444", fontSize: 9, padding: "0 12px 6px" }}>Error: {error}</div>
      )}

      {/* Rows */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 8px" }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: "#4A7A9B", fontSize: 10, textAlign: "center", padding: 16 }}>No intel profiles found.</div>
        )}
        {visible.map((p, idx) => {
          const col  = CLASS_COLOR[p._cls] || CY;
          const key  = p.id || p.name || idx;
          const isEx = expanded === key;
          return (
            <div
              key={key}
              style={{ borderBottom: "1px solid #0A1628", padding: "6px 0", cursor: "pointer" }}
              onClick={() => setExpanded(isEx ? null : key)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: col, fontSize: 9, minWidth: 130 }}>{p._cls.replace(/_/g, " ")}</span>
                <span style={{ flex: 1, color: "#E0F0FF", fontSize: 10 }}>{p.name || "(unnamed)"}</span>
                {p.role && <span style={{ color: "#4A7A9B", fontSize: 9 }}>{p.role}</span>}
                <span style={{ color: "#4A7A9B", fontSize: 9 }}>{isEx ? "▲" : "▼"}</span>
              </div>
              {p.organisation && (
                <div style={{ color: "#4A7A9B", fontSize: 9, marginTop: 1, paddingLeft: 136 }}>{p.organisation}</div>
              )}

              {isEx && (
                <div style={{ marginTop: 8, paddingLeft: 8 }}>
                  {/* Task matches */}
                  {p._t.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: PU, fontSize: 9, marginBottom: 4 }}>TASKS ({p._t.length})</div>
                      {p._t.map((t, j) => (
                        <div key={j} style={{ background: "#0A1628", border: `1px solid ${PU}33`, borderRadius: 3, padding: "4px 8px", marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: PU, fontSize: 9, flex: 1 }}>{t.name || t.title || "(task)"}</span>
                            {t.status && <span style={{ color: "#4A7A9B", fontSize: 8 }}>{t.status}</span>}
                          </div>
                          <RelevanceBar score={t._score} max={p._t[0]?._score || 1} col={PU} />
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Investigation matches */}
                  {p._i.length > 0 && (
                    <div>
                      <div style={{ color: TE, fontSize: 9, marginBottom: 4 }}>INVESTIGATIONS ({p._i.length})</div>
                      {p._i.map((inv, j) => (
                        <div key={j} style={{ background: "#0A1628", border: `1px solid ${TE}33`, borderRadius: 3, padding: "4px 8px", marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: TE, fontSize: 9, flex: 1 }}>{inv.title || inv.name || "(investigation)"}</span>
                            {inv.status && <span style={{ color: "#4A7A9B", fontSize: 8 }}>{inv.status}</span>}
                          </div>
                          <RelevanceBar score={inv._score} max={p._i[0]?._score || 1} col={TE} />
                        </div>
                      ))}
                    </div>
                  )}
                  {p._t.length === 0 && p._i.length === 0 && (
                    <div style={{ color: AM, fontSize: 9 }}>No task or investigation matches — intel profile is untracked.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess + brief */}
      <div style={{ padding: "8px 12px", borderTop: "1px solid #00CFFF22" }}>
        <button
          onClick={assess}
          disabled={assessing || total === 0}
          style={{
            ...smallBtn(CY),
            background: assessing ? "#0A1628" : "rgba(0,207,255,0.12)",
            fontSize: 10, width: "100%",
          }}
        >
          {assessing ? "▷ ASSESSING…" : "▶ ASSESS COVERAGE"}
        </button>
        {brief && (
          <div style={{ marginTop: 8, color: "#A0D0E8", fontSize: 9, lineHeight: 1.5, background: "#0A1628", borderRadius: 3, padding: "6px 8px" }}>
            {brief}
          </div>
        )}
      </div>
    </div>
  );
}
