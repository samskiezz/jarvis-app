/**
 * VoiceCommandMonitor — F276.
 *
 * Data sources (all real — backed by server/routes/voice.py):
 *   GET  /v1/voice/status            (poll 60 s) → {tts_provider, tts_available, stt_available, stt_engine}
 *   GET  /v1/voice/history?limit=50  (poll 60 s) → {ok, items:[{id,ts,command,source}], count}
 *   GET  /v1/voice/commands          (fetch on open) → {ok, categories:[{name, commands:[{phrase,example,description}]}]}
 *   GET  /v1/voice/simplified-commands (fetch in MODE tab) → [{name, commands}]
 *   GET  /v1/voice/mode              (fetch in MODE tab) → {session_id, enabled}
 *   POST /v1/voice/mode              → toggle simplified mode {session_id, enabled}
 *   DELETE /v1/voice/history         → clear all history
 *
 * Displays:
 *   - Stat tiles: TTS provider / STT engine / history count / command categories
 *   - HISTORY | COMMANDS | MODE tab switcher + text search
 *   - HISTORY: recent commands with source chip (voice=cyan/text=purple) + age, + ✕ CLEAR ALL button
 *   - COMMANDS: per-category accordion with phrase + example chip + description
 *   - MODE: simplified mode toggle switch + simplified command list
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence voice-status brief + TTS
 *
 * Toggle: ⊞ VCMD at left:278880, bottom:8, zIndex:154.
 * Badge: green=tts_available+stt, amber=tts-only (no stt), dim=unavailable.
 * 60 s auto-refresh on status + history.
 *
 * Exported helpers for JarvisBrain:
 *   isVcmQuery(q) / buildVcmScript()
 *
 * Voice triggers: "voice commands / voice catalog / command reference / what can i say /
 *   voice history / vcmd / speech commands / voice log / command log / voice monitor /
 *   tts status / stt status / voice status"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const PU   = "#A78BFA";
const DIM  = "#3A4A55";
const GRAY = "#4E6070";

const BTN_LEFT = 278880;
const POLL_MS  = 60_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const VCM_RE =
  /\b(voice\s+commands?|voice\s+catalog|command\s+reference|what\s+can\s+i\s+say|voice\s+history|vcmd\b|speech\s+commands?|voice\s+log|command\s+log|voice\s+monitor|tts\s+status|stt\s+status|voice\s+status)\b/i;

export function isVcmQuery(q) {
  return VCM_RE.test(q || "");
}

export async function buildVcmScript() {
  try {
    const [statusR, histR] = await Promise.all([
      fetch(`${apiBase()}/v1/voice/status`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/voice/history?limit=50`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const status = await statusR.json();
    const hist   = await histR.json();
    window.dispatchEvent(new CustomEvent("jarvis:vcmd-toggle"));
    const provider = status?.tts_provider ?? "unknown";
    const stt      = status?.stt_engine ?? "unknown";
    const count    = hist?.count ?? 0;
    return (
      `Voice status: TTS provider is ${provider} (available: ${status?.tts_available ? "yes" : "no"}), ` +
      `STT engine is ${stt}. ` +
      `${count} voice command${count !== 1 ? "s" : ""} recorded in history.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:vcmd-toggle"));
    return "Voice Command Monitor open, sir.";
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function age(ts) {
  if (!ts) return "—";
  const raw = typeof ts === "number" ? ts : new Date(ts).getTime() / 1000;
  if (isNaN(raw)) return "—";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - raw));
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function srcColor(src) {
  if (!src) return CY;
  const s = src.toLowerCase();
  if (s === "text" || s === "typed") return PU;
  return CY;
}

function truncate(str, len = 80) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "…" : str;
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchStatus() {
  const r = await fetch(`${apiBase()}/v1/voice/status`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`voice/status ${r.status}`);
  return r.json();
}

async function fetchHistory(limit = 50) {
  const r = await fetch(`${apiBase()}/v1/voice/history?limit=${limit}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`voice/history ${r.status}`);
  return r.json();
}

async function fetchCommands() {
  const r = await fetch(`${apiBase()}/v1/voice/commands`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`voice/commands ${r.status}`);
  return r.json();
}

async function fetchSimplifiedCommands() {
  const r = await fetch(`${apiBase()}/v1/voice/simplified-commands`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`voice/simplified-commands ${r.status}`);
  return r.json();
}

async function fetchMode() {
  const r = await fetch(`${apiBase()}/v1/voice/mode`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) return null;
  return r.json();
}

async function postMode(enabled) {
  const r = await fetch(`${apiBase()}/v1/voice/mode`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: "default", enabled }),
  });
  if (!r.ok) throw new Error(`voice/mode POST ${r.status}`);
  return r.json();
}

async function clearHistory() {
  const r = await fetch(`${apiBase()}/v1/voice/history`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`voice/history DELETE ${r.status}`);
  return r.json();
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        background: "rgba(41,231,255,0.04)",
        border: "1px solid rgba(41,231,255,0.10)",
        borderRadius: 6,
        padding: "8px 10px",
        minWidth: 70,
      }}
    >
      <div style={{ color, fontSize: 16, fontWeight: 700, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ color: GRAY, fontSize: 10, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
    </div>
  );
}

function TabBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "rgba(41,231,255,0.12)" : "transparent",
        border: `1px solid ${active ? CY : "rgba(41,231,255,0.15)"}`,
        borderRadius: 4,
        color: active ? CY : GRAY,
        cursor: "pointer",
        fontSize: 10,
        fontFamily: "monospace",
        letterSpacing: "0.06em",
        padding: "3px 8px",
      }}
    >
      {label}
    </button>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function VoiceCommandMonitor() {
  const [open, setOpen]             = useState(false);
  const [status, setStatus]         = useState(null);
  const [hist, setHist]             = useState(null);
  const [commands, setCommands]     = useState(null);
  const [simplified, setSimplified] = useState(null);
  const [mode, setMode]             = useState(null);
  const [tab, setTab]               = useState("HISTORY");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState("");
  const [clearing, setClearing]     = useState(false);
  const [togglingMode, setTogglingMode] = useState(false);
  const timerRef = useRef(null);

  const loadPoll = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([fetchStatus(), fetchHistory()]);
      setStatus(s);
      setHist(h);
    } catch {
      // leave previous data intact on transient failure
    }
  }, []);

  const loadCommands = useCallback(async () => {
    if (commands) return;
    try {
      const c = await fetchCommands();
      setCommands(c);
    } catch {
      // silently ignore
    }
  }, [commands]);

  const loadModeTab = useCallback(async () => {
    try {
      const [m, sc] = await Promise.all([fetchMode(), fetchSimplifiedCommands()]);
      if (m !== null) setMode(m);
      setSimplified(sc);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    loadPoll();
    timerRef.current = setInterval(loadPoll, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [loadPoll]);

  useEffect(() => {
    if (open) loadCommands();
  }, [open, loadCommands]);

  useEffect(() => {
    if (open && tab === "MODE") loadModeTab();
  }, [open, tab, loadModeTab]);

  useEffect(() => {
    const onToggle = () => {
      setOpen((o) => !o);
    };
    window.addEventListener("jarvis:vcmd-toggle", onToggle);
    return () => window.removeEventListener("jarvis:vcmd-toggle", onToggle);
  }, []);

  // badge logic
  const ttsOk = status?.tts_available ?? false;
  const sttOk = status?.stt_available ?? false;
  const histCount = hist?.count ?? 0;
  const badgeColor = ttsOk && sttOk ? GN : ttsOk ? AM : DIM;
  const badgeVal   = ttsOk ? (sttOk ? "STT" : "TTS") : "—";

  const categories   = commands?.categories ?? [];
  const histItems    = hist?.items ?? [];

  const lc = search.toLowerCase();

  const filteredHist = histItems.filter(
    (h) => !lc || h.command.toLowerCase().includes(lc) || (h.source || "").toLowerCase().includes(lc)
  );

  const filteredCats = categories
    .map((cat) => ({
      ...cat,
      commands: cat.commands.filter(
        (c) =>
          !lc ||
          c.phrase.toLowerCase().includes(lc) ||
          c.description.toLowerCase().includes(lc) ||
          c.example.toLowerCase().includes(lc)
      ),
    }))
    .filter((cat) => cat.commands.length > 0);

  const simplifiedCategories = (simplified ?? []).filter(
    (cat) =>
      !lc ||
      cat.commands.some(
        (c) => c.phrase.toLowerCase().includes(lc) || c.description.toLowerCase().includes(lc)
      )
  );

  async function assess() {
    setAssessing(true); setAssessText("");
    try {
      const brief = await buildVcmScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message:
            `Voice system: TTS provider=${status?.tts_provider ?? "unknown"}, ` +
            `TTS available=${status?.tts_available}, STT available=${status?.stt_available}, ` +
            `STT engine=${status?.stt_engine ?? "unknown"}, ` +
            `${histCount} recent command${histCount !== 1 ? "s" : ""} in history. ` +
            "Give a 2-sentence operational brief on voice system status and readiness.",
        }),
      });
      const d = await r.json();
      const text = d?.response || d?.message || brief;
      setAssessText(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setAssessText("Voice assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  async function handleClear() {
    if (clearing) return;
    setClearing(true);
    try {
      await clearHistory();
      await loadPoll();
    } catch {
      // silently ignore
    } finally {
      setClearing(false);
    }
  }

  async function handleToggleMode() {
    if (togglingMode) return;
    const current = mode?.enabled ?? false;
    setTogglingMode(true);
    try {
      const r = await postMode(!current);
      setMode(r);
    } catch {
      // silently ignore
    } finally {
      setTogglingMode(false);
    }
  }

  function toggleExpand(key) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <>
      {/* ── dock button ─────────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Voice Command Monitor"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 154,
          background: open ? "rgba(41,231,255,0.15)" : "rgba(10,18,26,0.85)",
          border: `1px solid ${open ? CY : "rgba(41,231,255,0.25)"}`,
          borderRadius: 5,
          color: open ? CY : "#8BAFC4",
          cursor: "pointer",
          fontFamily: "monospace",
          fontSize: 10,
          letterSpacing: "0.06em",
          padding: "4px 8px",
          display: "flex",
          alignItems: "center",
          gap: 5,
          userSelect: "none",
          whiteSpace: "nowrap",
        }}
      >
        <span>🎤</span>
        <span>VCMD</span>
        <span
          style={{
            background: badgeColor,
            borderRadius: 3,
            color: "#0A121A",
            fontSize: 9,
            fontWeight: 700,
            minWidth: 24,
            padding: "0 3px",
            textAlign: "center",
          }}
        >
          {badgeVal}
        </span>
      </button>

      {/* ── panel ───────────────────────────────────────────────────────────── */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: BTN_LEFT - 380,
            bottom: 44,
            zIndex: 154,
            width: 440,
            maxHeight: 580,
            background: "rgba(8,16,24,0.97)",
            border: "1px solid rgba(41,231,255,0.22)",
            borderRadius: 8,
            boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
            display: "flex",
            flexDirection: "column",
            fontFamily: "monospace",
            overflow: "hidden",
          }}
        >
          {/* header */}
          <div
            style={{
              borderBottom: "1px solid rgba(41,231,255,0.12)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
            }}
          >
            <span style={{ color: CY, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", flex: 1 }}>
              🎤 VOICE COMMAND MONITOR
            </span>
            <span
              style={{
                background: ttsOk ? `${GN}22` : `${DIM}44`,
                border: `1px solid ${ttsOk ? GN : DIM}`,
                borderRadius: 3,
                color: ttsOk ? GN : GRAY,
                fontSize: 9,
                padding: "1px 5px",
              }}
            >
              {status?.tts_provider ?? "—"}
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: GRAY, cursor: "pointer", fontSize: 13 }}
            >
              ✕
            </button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 12px 4px" }}>
            <StatTile
              label="TTS"
              value={ttsOk ? "OK" : "—"}
              color={ttsOk ? GN : DIM}
            />
            <StatTile
              label="STT"
              value={sttOk ? status?.stt_engine ?? "OK" : "browser"}
              color={sttOk ? GN : AM}
            />
            <StatTile
              label="History"
              value={histCount}
              color={histCount > 0 ? CY : GRAY}
            />
            <StatTile
              label="Categories"
              value={categories.length || "—"}
              color={PU}
            />
          </div>

          {/* tab bar + search */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 12px" }}>
            {["HISTORY", "COMMANDS", "MODE"].map((t) => (
              <TabBtn key={t} label={t} active={tab === t} onClick={() => { setTab(t); setSearch(""); }} />
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                background: "rgba(41,231,255,0.05)",
                border: "1px solid rgba(41,231,255,0.12)",
                borderRadius: 4,
                color: CY,
                flex: 1,
                fontFamily: "monospace",
                fontSize: 10,
                marginLeft: 4,
                outline: "none",
                padding: "3px 6px",
              }}
            />
          </div>

          {/* body */}
          <div style={{ flex: 1, overflow: "auto", padding: "4px 12px 8px" }}>

            {/* HISTORY tab */}
            {tab === "HISTORY" && (
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                  <button
                    onClick={handleClear}
                    disabled={clearing || histCount === 0}
                    style={{
                      background: "rgba(248,113,113,0.08)",
                      border: "1px solid rgba(248,113,113,0.3)",
                      borderRadius: 3,
                      color: "#F87171",
                      cursor: clearing || histCount === 0 ? "not-allowed" : "pointer",
                      fontFamily: "monospace",
                      fontSize: 9,
                      opacity: histCount === 0 ? 0.4 : 1,
                      padding: "2px 7px",
                    }}
                  >
                    {clearing ? "Clearing…" : "✕ CLEAR ALL"}
                  </button>
                </div>
                {filteredHist.length === 0 && (
                  <div style={{ color: GRAY, fontSize: 11, padding: "12px 0", textAlign: "center" }}>
                    {histCount === 0 ? "No voice commands in history yet." : "No matches."}
                  </div>
                )}
                {filteredHist.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      borderBottom: "1px solid rgba(41,231,255,0.06)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 0",
                    }}
                  >
                    <span
                      style={{
                        background: `${srcColor(item.source)}22`,
                        border: `1px solid ${srcColor(item.source)}44`,
                        borderRadius: 3,
                        color: srcColor(item.source),
                        flexShrink: 0,
                        fontSize: 9,
                        padding: "1px 5px",
                      }}
                    >
                      {item.source || "voice"}
                    </span>
                    <span style={{ color: "#8BAFC4", flex: 1, fontSize: 11 }}>
                      {truncate(item.command)}
                    </span>
                    <span style={{ color: GRAY, flexShrink: 0, fontSize: 9 }}>
                      {age(item.ts)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* COMMANDS tab */}
            {tab === "COMMANDS" && (
              <div>
                {commands === null && (
                  <div style={{ color: GRAY, fontSize: 11, padding: "12px 0", textAlign: "center" }}>
                    Loading commands…
                  </div>
                )}
                {commands !== null && filteredCats.length === 0 && (
                  <div style={{ color: GRAY, fontSize: 11, padding: "12px 0", textAlign: "center" }}>
                    No commands match your search.
                  </div>
                )}
                {filteredCats.map((cat) => {
                  const key = `cat-${cat.name}`;
                  const isExp = expanded[key] !== false;
                  return (
                    <div key={key} style={{ marginBottom: 4 }}>
                      <div
                        onClick={() => toggleExpand(key)}
                        style={{
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "5px 0 3px",
                          borderBottom: "1px solid rgba(41,231,255,0.08)",
                        }}
                      >
                        <span style={{ color: PU, fontSize: 11, fontWeight: 700, flex: 1 }}>
                          {cat.name}
                        </span>
                        <span
                          style={{
                            background: `${PU}22`,
                            border: `1px solid ${PU}44`,
                            borderRadius: 3,
                            color: PU,
                            fontSize: 9,
                            padding: "0 5px",
                          }}
                        >
                          {cat.commands.length}
                        </span>
                        <span style={{ color: GRAY, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                      </div>
                      {isExp && (
                        <div style={{ paddingLeft: 8 }}>
                          {cat.commands.map((cmd) => (
                            <div
                              key={cmd.phrase}
                              style={{
                                borderBottom: "1px solid rgba(41,231,255,0.04)",
                                display: "flex",
                                flexDirection: "column",
                                gap: 2,
                                padding: "5px 0",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: CY, fontSize: 11, flex: 1, fontWeight: 600 }}>
                                  {cmd.phrase}
                                </span>
                                <span
                                  style={{
                                    background: "rgba(41,231,255,0.06)",
                                    border: "1px solid rgba(41,231,255,0.15)",
                                    borderRadius: 3,
                                    color: AM,
                                    fontSize: 9,
                                    padding: "0 5px",
                                  }}
                                >
                                  {cmd.example}
                                </span>
                              </div>
                              <div style={{ color: GRAY, fontSize: 10, lineHeight: 1.4 }}>
                                {cmd.description}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* MODE tab */}
            {tab === "MODE" && (
              <div>
                <div
                  style={{
                    background: "rgba(41,231,255,0.04)",
                    border: "1px solid rgba(41,231,255,0.10)",
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 10,
                    padding: "10px 12px",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ color: CY, fontSize: 11, fontWeight: 700 }}>Simplified Voice Mode</div>
                    <div style={{ color: GRAY, fontSize: 10, marginTop: 2 }}>
                      Reduces command set to essential nav + care commands for accessibility.
                    </div>
                  </div>
                  <button
                    onClick={handleToggleMode}
                    disabled={togglingMode}
                    style={{
                      background: (mode?.enabled ?? false) ? `${GN}22` : "rgba(41,231,255,0.06)",
                      border: `1px solid ${(mode?.enabled ?? false) ? GN : "rgba(41,231,255,0.2)"}`,
                      borderRadius: 4,
                      color: (mode?.enabled ?? false) ? GN : GRAY,
                      cursor: togglingMode ? "wait" : "pointer",
                      fontFamily: "monospace",
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "4px 12px",
                    }}
                  >
                    {togglingMode ? "…" : (mode?.enabled ?? false) ? "ON" : "OFF"}
                  </button>
                </div>

                {simplified === null && (
                  <div style={{ color: GRAY, fontSize: 11, padding: "8px 0", textAlign: "center" }}>
                    Loading simplified commands…
                  </div>
                )}

                {simplified !== null && (
                  <div>
                    <div style={{ color: GRAY, fontSize: 10, marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      Simplified Command Set
                    </div>
                    {simplifiedCategories.length === 0 && (
                      <div style={{ color: GRAY, fontSize: 11, textAlign: "center", padding: "8px 0" }}>
                        No matches.
                      </div>
                    )}
                    {simplifiedCategories.map((cat) => (
                      <div key={cat.name} style={{ marginBottom: 8 }}>
                        <div style={{ color: AM, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                          {cat.name}
                        </div>
                        {cat.commands
                          .filter(
                            (c) =>
                              !lc ||
                              c.phrase.toLowerCase().includes(lc) ||
                              c.description.toLowerCase().includes(lc)
                          )
                          .map((cmd) => (
                            <div
                              key={cmd.phrase}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "3px 0",
                                borderBottom: "1px solid rgba(41,231,255,0.04)",
                              }}
                            >
                              <span style={{ color: CY, fontSize: 11, fontWeight: 600, width: 90, flexShrink: 0 }}>
                                {cmd.phrase}
                              </span>
                              <span style={{ color: GRAY, fontSize: 10, flex: 1 }}>
                                {cmd.description}
                              </span>
                            </div>
                          ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* assess */}
          <div
            style={{
              borderTop: "1px solid rgba(41,231,255,0.10)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "6px 12px 8px",
            }}
          >
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                alignSelf: "flex-start",
                background: "rgba(41,231,255,0.08)",
                border: `1px solid ${CY}44`,
                borderRadius: 4,
                color: CY,
                cursor: assessing ? "wait" : "pointer",
                fontFamily: "monospace",
                fontSize: 10,
                padding: "3px 10px",
              }}
            >
              {assessing ? "Assessing…" : "▶ ASSESS"}
            </button>
            {assessText && (
              <div
                style={{
                  background: "rgba(41,231,255,0.04)",
                  border: "1px solid rgba(41,231,255,0.10)",
                  borderRadius: 4,
                  color: "#8BAFC4",
                  fontSize: 10,
                  lineHeight: 1.5,
                  padding: "5px 8px",
                }}
              >
                {assessText}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
