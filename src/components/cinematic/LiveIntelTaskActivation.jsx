/**
 * LiveIntelTaskActivation — F207
 *
 * Parallel-fetches /functions/getLiveIntel (quakes/crypto/FX) + /entities/Task
 * then keyword-correlates each active task (name/description/type/status) against
 * live world events to surface:
 *   TRIGGERED (≥1 live event matches task context)
 *   INACTIVE  (0 matches — task has no live world-event backing)
 *
 * Stat tiles: events / tasks / triggered / inactive
 * Filter tabs: ALL / TRIGGERED / INACTIVE
 * Text search.
 * Expand task → matched live event cards with type badge + relevance bar.
 * ▶ ASSESS ACTIVATION → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90 s auto-refresh.
 *
 * Intent: "litask" / "live intel task" / "task activation" /
 *         "triggered tasks" / "live task" / "world event task" /
 *         "active tasks triggered" / "live task activation"
 *   → jarvis:litask-toggle + TTS brief via buildLitaskScript()
 *
 * Toggle: ◈ LITASK at left:37960, bottom:8, zIndex:107.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const VIOLET = "#A78BFA";
const RED    = "#FF4444";
const DIM    = "#4A6070";
const BG     = "rgba(3,5,9,0.97)";
const BTN_LEFT   = 37960;
const REFRESH_MS = 90_000;
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── intent exports ────────────────────────────────────────────────────────────

const LITASK_RE =
  /\b(litask|live.intel.task|task.activation|triggered.tasks?|live.task|world.event.task|active.tasks?.triggered|live.task.activation|task.world.event|intel.task)\b/i;

export function isLitaskQuery(t) { return LITASK_RE.test(t || ""); }

export async function buildLitaskScript() {
  const [iRaw, tRaw] = await Promise.allSettled([
    fetch(`${apiBase()}/functions/getLiveIntel`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
    fetch(`${apiBase()}/entities/Task`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
  ]);
  const events = normaliseEvents(iRaw.status === "fulfilled" ? iRaw.value : {});
  const tasks  = normaliseTasks(tRaw.status === "fulfilled" ? tRaw.value : []);
  const pairs  = correlate(tasks, events);
  const triggered = pairs.filter((p) => p.matches.length >= 1).length;
  const inactive  = pairs.filter((p) => p.matches.length === 0).length;
  const topTriggered = pairs
    .filter((p) => p.matches.length >= 1)
    .slice(0, 3)
    .map((p) => p.task.title)
    .join(", ") || "none";
  return (
    `Assess JARVIS live intel task activation in 2 sentences. ` +
    `${events.length} live world events vs ${tasks.length} active tasks: ` +
    `${triggered} TRIGGERED (task context matches a live event), ` +
    `${inactive} INACTIVE (no live event match). ` +
    `Top triggered tasks: ${topTriggered}.`
  );
}

// ─── normalise helpers ─────────────────────────────────────────────────────────

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (raw && Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseEvents(raw) {
  const quakes = normaliseArray(raw.earthquakes || raw.quakes, ["earthquakes", "quakes", "data"]);
  const crypto = normaliseArray(raw.crypto, ["crypto", "cryptocurrencies", "data"]);
  const fx     = normaliseArray(raw.forex || raw.fx, ["forex", "fx", "data"]);
  const all = [];
  for (const q of quakes) {
    all.push({
      id:   `q:${q.id || q.place || q.location || Math.random()}`,
      type: "SEISMIC",
      name: q.place || q.location || q.title || "Earthquake",
      desc: `mag ${q.magnitude ?? q.mag ?? "?"} ${q.place || ""}`.trim(),
    });
  }
  for (const c of crypto) {
    all.push({
      id:   `c:${c.symbol || c.id || c.name}`,
      type: "CRYPTO",
      name: c.name || c.symbol || "Crypto",
      desc: `${c.symbol || c.name || ""} ${c.change_pct != null ? (c.change_pct > 0 ? "+" : "") + c.change_pct.toFixed(2) + "%" : ""}`.trim(),
    });
  }
  for (const f of fx) {
    all.push({
      id:   `f:${f.pair || f.symbol || f.id}`,
      type: "FX",
      name: f.pair || f.symbol || "FX",
      desc: `${f.pair || f.symbol || ""} ${f.change_pct != null ? (f.change_pct > 0 ? "+" : "") + f.change_pct.toFixed(2) + "%" : ""}`.trim(),
    });
  }
  return all;
}

function normaliseTasks(raw) {
  const arr = normaliseArray(raw, ["tasks", "items", "data", "results"]);
  return arr.map((t, i) => ({
    id:          t.id     || t._id    || String(i),
    title:       t.title  || t.name   || t.label || `Task ${i + 1}`,
    description: t.description || t.desc || t.details || "",
    type:        t.type   || t.category || "",
    status:      t.status || t.state  || "",
    keywords:    [
      t.title || t.name || "",
      t.description || t.desc || "",
      t.type || "",
      t.status || "",
      ...(t.tags || []),
    ].join(" ").toLowerCase(),
  }));
}

function tokenise(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function correlate(tasks, events) {
  return tasks.map((task) => {
    const taskTokens = new Set(tokenise(task.keywords));
    const matches = [];
    for (const e of events) {
      const evTokens = tokenise(`${e.name} ${e.desc} ${e.type}`);
      let hits = 0;
      for (const tok of evTokens) if (taskTokens.has(tok)) hits++;
      if (hits > 0) {
        const score = Math.min(100, Math.round((hits / Math.max(evTokens.length, 1)) * 100) + hits * 8);
        matches.push({ e, score });
      }
    }
    matches.sort((a, b) => b.score - a.score);
    return { task, matches };
  });
}

// ─── tiny sub-components ───────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: 1, background: "rgba(0,0,0,0.3)",
      border: `1px solid ${color}33`, borderRadius: 4,
      padding: "6px 8px", textAlign: "center",
    }}>
      <div style={{ color, fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div style={{ color: DIM, fontSize: 7, letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ScoreBar({ score }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
      <div style={{
        width: 40, height: 4, background: "rgba(255,255,255,0.08)",
        borderRadius: 2, overflow: "hidden",
      }}>
        <div style={{ width: `${score}%`, height: "100%", background: VIOLET, borderRadius: 2 }} />
      </div>
      <span style={{ color: VIOLET, fontSize: 8 }}>{score}%</span>
    </div>
  );
}

const TYPE_COLOR = { SEISMIC: "#FF8C42", CRYPTO: "#00c878", FX: "#A78BFA" };
const TYPE_ICON  = { SEISMIC: "◉", CRYPTO: "◈", FX: "◆" };

// ─── main component ────────────────────────────────────────────────────────────

export default function LiveIntelTaskActivation() {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [pairs, setPairs]     = useState([]);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [iRaw, tRaw] = await Promise.allSettled([
        fetch(`${apiBase()}/functions/getLiveIntel`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/entities/Task`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      const events = normaliseEvents(iRaw.status === "fulfilled" ? iRaw.value : {});
      const tasks  = normaliseTasks(tRaw.status === "fulfilled" ? tRaw.value : []);
      setPairs(correlate(tasks, events));
    } catch (e) {
      setError(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:litask-toggle", onToggle);
    return () => window.removeEventListener("jarvis:litask-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const triggered = pairs.filter((p) => p.matches.length >= 1);
  const inactive  = pairs.filter((p) => p.matches.length === 0);

  const visible = pairs
    .filter((p) => {
      if (tab === "TRIGGERED") return p.matches.length >= 1;
      if (tab === "INACTIVE")  return p.matches.length === 0;
      return true;
    })
    .filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.task.title.toLowerCase().includes(q) ||
        p.task.description.toLowerCase().includes(q) ||
        p.task.type.toLowerCase().includes(q) ||
        p.matches.some((m) => m.e.name.toLowerCase().includes(q))
      );
    });

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildLitaskScript();
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: script }),
      });
      const json = await res.json();
      const text =
        json.response || json.reply || json.message || json.content ||
        json.answer || JSON.stringify(json).slice(0, 200);
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text } })
      );
    } catch (_) {
      // silently ignore
    } finally {
      setAssessing(false);
    }
  }

  const toggleRow = (id) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Live Intel × Task Activation (LITASK)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 107,
          background: "rgba(3,5,9,0.85)", border: `1px solid ${VIOLET}55`,
          borderRadius: 4, color: VIOLET, fontFamily: MONO, fontSize: 9,
          letterSpacing: 1, padding: "3px 7px", cursor: "pointer",
        }}
      >
        ◈ LITASK
        {triggered.length > 0 && (
          <span style={{
            marginLeft: 4, background: VIOLET, color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 8, fontWeight: 700,
          }}>
            {triggered.length}
          </span>
        )}
      </button>
    );
  }

  const TABS = ["ALL", "TRIGGERED", "INACTIVE"];
  const tabColor = (t) => {
    if (t === "TRIGGERED") return VIOLET;
    if (t === "INACTIVE")  return DIM;
    return CY;
  };

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 200, bottom: 48, zIndex: 107,
      width: 520, maxHeight: "75vh",
      background: BG, border: `1px solid ${VIOLET}66`,
      borderRadius: 8, fontFamily: MONO, fontSize: 10,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: `1px solid ${VIOLET}33`,
        background: "rgba(0,0,0,0.4)",
      }}>
        <span style={{ color: VIOLET, fontSize: 11, letterSpacing: 2 }}>
          ◈ LIVE INTEL × TASK ACTIVATION
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: "none", border: `1px solid ${CY}66`,
              borderRadius: 4, color: CY, fontFamily: MONO, fontSize: 9,
              letterSpacing: 1, padding: "2px 8px", cursor: "pointer",
            }}
          >
            {assessing ? "…" : "▶ ASSESS ACTIVATION"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none", border: "none", color: DIM,
              fontSize: 14, cursor: "pointer", lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="EVENTS"    value={
          [...new Set(pairs.flatMap((p) => p.matches.map((m) => m.e.id)))].length
        } color={CY} />
        <Tile label="TASKS"     value={pairs.length}       color={CY}    />
        <Tile label="TRIGGERED" value={triggered.length}   color={VIOLET}/>
        <Tile label="INACTIVE"  value={inactive.length}    color={DIM}   />
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 12px 6px" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${tabColor(t)}22` : "none",
              border: `1px solid ${tab === t ? tabColor(t) : DIM}`,
              borderRadius: 3, color: tab === t ? tabColor(t) : DIM,
              fontFamily: MONO, fontSize: 8, letterSpacing: 1,
              padding: "2px 6px", cursor: "pointer",
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
            marginLeft: "auto", background: "rgba(0,0,0,0.4)",
            border: `1px solid ${DIM}`, borderRadius: 3,
            color: CY, fontFamily: MONO, fontSize: 9,
            padding: "2px 6px", width: 120, outline: "none",
          }}
        />
      </div>

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 12px" }}>
        {loading && (
          <div style={{ color: DIM, padding: "8px 0" }}>◌ loading…</div>
        )}
        {error && (
          <div style={{ color: RED, padding: "4px 0" }}>⚠ {error}</div>
        )}
        {!loading && visible.length === 0 && !error && (
          <div style={{ color: DIM, padding: "8px 0" }}>no results</div>
        )}
        {visible.map((p) => {
          const status      = p.matches.length >= 1 ? "TRIGGERED" : "INACTIVE";
          const statusColor = status === "TRIGGERED" ? VIOLET : DIM;
          const isExp       = expanded[p.task.id];
          return (
            <div
              key={p.task.id}
              style={{
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                paddingBottom: 6, marginBottom: 6,
              }}
            >
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  cursor: "pointer", padding: "4px 0",
                }}
                onClick={() => toggleRow(p.task.id)}
              >
                <span style={{ color: CY, fontSize: 10, flexShrink: 0 }}>◎</span>
                <span style={{
                  fontSize: 8, border: `1px solid ${statusColor}`,
                  borderRadius: 3, color: statusColor,
                  padding: "1px 4px", letterSpacing: 1, flexShrink: 0,
                }}>
                  {status}
                </span>
                <span style={{
                  color: CY, flex: 1, overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {p.task.title}
                </span>
                {p.task.status && (
                  <span style={{
                    color: DIM, fontSize: 8, flexShrink: 0,
                    overflow: "hidden", textOverflow: "ellipsis",
                    maxWidth: 80, whiteSpace: "nowrap",
                  }}>
                    {p.task.status}
                  </span>
                )}
                <span style={{ color: DIM, fontSize: 8, flexShrink: 0 }}>
                  {p.matches.length} evt
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>
                  {isExp ? "▲" : "▼"}
                </span>
              </div>

              {isExp && (
                <div style={{ paddingLeft: 16, paddingBottom: 4 }}>
                  {p.task.type && (
                    <div style={{ color: DIM, fontSize: 8, marginBottom: 4 }}>
                      type: {p.task.type}
                    </div>
                  )}
                  {p.task.description && (
                    <div style={{
                      color: DIM, fontSize: 8, marginBottom: 4,
                      maxHeight: 36, overflow: "hidden",
                    }}>
                      {p.task.description.slice(0, 160)}
                    </div>
                  )}
                  {p.matches.length === 0 ? (
                    <div style={{ color: DIM, fontSize: 9 }}>
                      ◎ no live world event matches this task — INACTIVE
                    </div>
                  ) : (
                    p.matches.map(({ e, score }) => {
                      const tc = TYPE_COLOR[e.type] || CY;
                      const ti = TYPE_ICON[e.type] || "◈";
                      return (
                        <div key={e.id} style={{
                          display: "flex", alignItems: "center", gap: 6,
                          marginBottom: 4,
                        }}>
                          <span style={{ color: tc, fontSize: 9, flexShrink: 0 }}>{ti}</span>
                          <span style={{
                            fontSize: 7, border: `1px solid ${tc}55`,
                            borderRadius: 3, color: tc,
                            padding: "0 3px", letterSpacing: 1, flexShrink: 0,
                          }}>
                            {e.type}
                          </span>
                          <span style={{
                            color: AMBER, fontSize: 9, flex: 1,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {e.name}
                          </span>
                          <ScoreBar score={score} />
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: "4px 12px", borderTop: `1px solid ${VIOLET}22`,
        color: DIM, fontSize: 8, letterSpacing: 1,
        display: "flex", justifyContent: "space-between",
      }}>
        <span>LITASK · /functions/getLiveIntel × /entities/Task</span>
        <span
          onClick={load}
          style={{ cursor: "pointer", color: CY }}
          title="refresh now"
        >
          ↺ {REFRESH_MS / 1000}s
        </span>
      </div>
    </div>
  );
}
