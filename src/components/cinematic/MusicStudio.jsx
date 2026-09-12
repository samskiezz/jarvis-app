/**
 * MusicStudio — F272.
 *
 * Data sources (all real — backed by server/routes/music.py):
 *   GET  /v1/music/status
 *       → {ok, backend, available, details, bank_count}
 *   GET  /v1/music/bank
 *       → {count, items:[{name, url, size_bytes}]}
 *   POST /v1/music/generate  {prompt, duration_s, tags}
 *       → {ok, backend, path, url, duration_s, prompt}
 *
 * Displays:
 *   - Stat tiles: status / bank-tracks / backend / generated count
 *   - BANK tab: pre-baked loops list with size + open-link
 *   - GENERATE tab: prompt input + duration selector + generate button → result block
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle: ♪ MGEN at left:260640, bottom:8, zIndex:150.
 * Badge: green=available, amber=no backend.
 * 60 s auto-refresh of status.
 *
 * Exported helpers for JarvisBrain:
 *   isMgenQuery(q) / buildMgenScript()
 *
 * Voice triggers: "music studio / generate music / ambient music / music bank /
 *   music generation / mgen / background music / music tracks / play music /
 *   create music / music gen / ambient drone"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const PU  = "#A78BFA";
const AM  = "#F5A623";
const GN  = "#4ADE80";
const CY  = "#29E7FF";
const RD  = "#F87171";
const DIM = "#3A4A55";

const BTN_LEFT   = 260640;
const STATUS_MS  = 60_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const MGEN_RE =
  /\b(music\s+studio|generate\s+music|ambient\s+music|music\s+bank|music\s+gen(?:eration)?|mgen\b|background\s+music|music\s+tracks?|play\s+music|create\s+music|ambient\s+drone|music\s+loop)\b/i;

export function isMgenQuery(t) {
  return MGEN_RE.test(t || "");
}

export async function buildMgenScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/music/status`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const rb = await fetch(`${apiBase()}/v1/music/bank`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const bank = await rb.json();
    const backend  = d?.backend || "unknown";
    const avail    = d?.available ? "available" : "unavailable";
    const bankCnt  = bank?.count ?? 0;
    return (
      `Music Generation Studio: backend is ${backend} (${avail}). ` +
      `${bankCnt} pre-baked loop${bankCnt !== 1 ? "s" : ""} in the bank. ` +
      `Use the GENERATE tab to create new ambient audio with a text prompt.`
    );
  } catch {
    return "Unable to retrieve music studio status at this time, sir.";
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(n) {
  if (!n) return "?";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

// ─── fetch helpers ─────────────────────────────────────────────────────────────

async function fetchStatus() {
  const r = await fetch(`${apiBase()}/v1/music/status`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchBank() {
  const r = await fetch(`${apiBase()}/v1/music/bank`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return Array.isArray(d) ? d : (d?.items || []);
}

async function generateMusic(prompt, duration_s, tags) {
  const r = await fetch(`${apiBase()}/v1/music/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ prompt, duration_s, tags: tags || undefined }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function agentAssess(status, bankCount, genCount) {
  const backend = status?.backend || "unknown";
  const avail   = status?.available ? "available" : "unavailable";
  const prompt =
    `Music Studio status: backend=${backend} (${avail}), ` +
    `${bankCount} bank tracks, ${genCount} generated this session. ` +
    `Give a 2-sentence summary: is music generation ready and what's the best use for ambient audio in Jarvis operations. Be direct.`;
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ message: prompt }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "Assessment unavailable.";
}

// ─── stat tile ─────────────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: "1 1 70px", padding: "8px 10px",
      background: `${color}0d`, border: `1px solid ${color}33`,
      borderRadius: 8, textAlign: "center",
    }}>
      <div style={{ fontSize: 7, color: DIM, letterSpacing: 1, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

// ─── bank track row ────────────────────────────────────────────────────────────

function BankRow({ item }) {
  return (
    <div style={{
      padding: "6px 10px", marginBottom: 4,
      background: "rgba(255,255,255,0.02)",
      border: "1px solid #ffffff0d",
      borderRadius: 7,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{ fontSize: 11, color: CY, flexShrink: 0 }}>♫</span>
      <span style={{
        fontSize: 10, color: "#cdd6e0", flex: 1, minWidth: 0,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {item.name}
      </span>
      <span style={{ fontSize: 9, color: DIM, flexShrink: 0 }}>
        {fmtBytes(item.size_bytes)}
      </span>
      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
            background: `${CY}22`, border: `1px solid ${CY}44`, color: CY,
            textDecoration: "none", flexShrink: 0,
          }}
        >
          ▶ OPEN
        </a>
      )}
    </div>
  );
}

// ─── generate tab ──────────────────────────────────────────────────────────────

function GenerateTab({ onGenerated }) {
  const [prompt,    setPrompt]    = useState("warm ambient drone, low strings");
  const [duration,  setDuration]  = useState(30);
  const [busy,      setBusy]      = useState(false);
  const [result,    setResult]    = useState(null);
  const [err,       setErr]       = useState(null);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setBusy(true); setResult(null); setErr(null);
    try {
      const d = await generateMusic(prompt.trim(), duration, null);
      setResult(d);
      if (onGenerated) onGenerated();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  }

  return (
    <div style={{ padding: "10px 14px" }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 8, color: DIM, letterSpacing: 1, marginBottom: 4 }}>
          PROMPT
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="e.g. warm ambient drone, low strings"
          style={{
            width: "100%", padding: "6px 8px", fontSize: 10,
            background: "rgba(255,255,255,0.04)", border: "1px solid #ffffff18",
            borderRadius: 6, color: "#cdd6e0", outline: "none",
            boxSizing: "border-box", resize: "vertical", lineHeight: 1.5,
            fontFamily: "'JetBrains Mono',monospace",
          }}
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 8, color: DIM, letterSpacing: 1 }}>DURATION</span>
          <span style={{ fontSize: 10, color: PU, fontWeight: 700 }}>{duration}s</span>
        </div>
        <input
          type="range"
          min={5}
          max={120}
          step={5}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          style={{ width: "100%", accentColor: PU }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: DIM }}>
          <span>5s</span>
          <span>120s</span>
        </div>
      </div>

      <button
        onClick={handleGenerate}
        disabled={busy || !prompt.trim()}
        style={{
          width: "100%", padding: "7px", borderRadius: 6,
          background: busy ? `${PU}22` : `${PU}33`,
          border: `1px solid ${PU}66`, color: busy ? DIM : PU,
          fontSize: 10, fontWeight: 700, cursor: busy ? "default" : "pointer",
          letterSpacing: 0.5, marginBottom: 8,
        }}
      >
        {busy ? "GENERATING…" : "▶ GENERATE MUSIC"}
      </button>

      {err && (
        <div style={{
          padding: "6px 8px", background: `${RD}11`,
          border: `1px solid ${RD}33`, borderRadius: 6,
          fontSize: 10, color: RD, marginBottom: 6,
        }}>
          ⚠ {err}
        </div>
      )}

      {result && (
        <div style={{
          padding: "8px 10px", background: `${GN}0a`,
          border: `1px solid ${GN}33`, borderRadius: 7,
        }}>
          <div style={{ fontSize: 9, color: GN, fontWeight: 700, marginBottom: 4 }}>
            ✓ GENERATED via {result.backend || "unknown"}
          </div>
          {result.prompt && (
            <div style={{ fontSize: 9, color: "#8ea8b8", marginBottom: 4 }}>
              "{result.prompt}"
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            {result.duration_s && (
              <span style={{
                fontSize: 8, padding: "2px 6px",
                background: `${CY}18`, border: `1px solid ${CY}33`,
                borderRadius: 10, color: CY,
              }}>
                {result.duration_s}s
              </span>
            )}
          </div>
          {result.url && (
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-block", fontSize: 9, fontWeight: 700,
                padding: "3px 8px", borderRadius: 5,
                background: `${GN}22`, border: `1px solid ${GN}44`, color: GN,
                textDecoration: "none",
              }}
            >
              ▶ OPEN AUDIO
            </a>
          )}
          {!result.url && result.path && (
            <div style={{ fontSize: 9, color: DIM, marginTop: 2 }}>
              saved: {result.path}
            </div>
          )}
          {!result.ok && result.error && (
            <div style={{ fontSize: 9, color: AM }}>
              ⚠ {result.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ────────────────────────────────────────────────────────────

export default function MusicStudio() {
  const [open,      setOpen]      = useState(false);
  const [status,    setStatus]    = useState(null);
  const [bankItems, setBankItems] = useState([]);
  const [err,       setErr]       = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("BANK");
  const [search,    setSearch]    = useState("");
  const [genCount,  setGenCount]  = useState(0);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState(null);

  const timerRef = useRef(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await fetchStatus();
      setStatus(s);
      setErr(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBank = useCallback(async () => {
    try {
      const items = await fetchBank();
      setBankItems(items);
    } catch {
      // bank may be empty — not fatal
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadStatus();
    loadBank();
    timerRef.current = setInterval(loadStatus, STATUS_MS);
    return () => clearInterval(timerRef.current);
  }, [loadStatus, loadBank]);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:mgen-toggle", toggle);
    return () => window.removeEventListener("jarvis:mgen-toggle", toggle);
  }, []);

  const available  = status?.available ?? false;
  const backend    = status?.backend || "—";
  const bankCount  = bankItems.length;
  const badgeColor = available ? GN : AM;
  const badgeLabel = available ? backend.slice(0, 8).toUpperCase() : "NO BACKEND";

  const visibleBank = bankItems.filter((it) =>
    !search || it.name?.toLowerCase().includes(search.toLowerCase())
  );

  async function handleAssess() {
    setAssessing(true); setBrief(null);
    try {
      const text = await agentAssess(status, bankCount, genCount);
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setBrief("Assessment failed — check agent connectivity.");
    }
    setAssessing(false);
  }

  return (
    <>
      {/* ─── dock button ──────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Music Generation Studio"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT,
          zIndex: 150, transform: "translateX(-50%)",
          background: open ? `${PU}22` : "rgba(10,18,26,0.85)",
          border: `1px solid ${open ? PU : "#ffffff22"}`,
          borderRadius: 7, padding: "4px 8px",
          color: open ? PU : "#8ea8b8", fontSize: 9, fontWeight: 700,
          cursor: "pointer", letterSpacing: 0.5, display: "flex",
          alignItems: "center", gap: 4, backdropFilter: "blur(6px)",
          transition: "all 0.2s",
        }}
      >
        ♪ MGEN
        <span style={{
          background: badgeColor, color: "#000", fontSize: 8,
          borderRadius: 8, padding: "1px 4px", fontWeight: 700,
        }}>
          {badgeLabel}
        </span>
      </button>

      {/* ─── panel ────────────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: BTN_LEFT,
          transform: "translateX(-50%)", zIndex: 151,
          width: 420, maxHeight: "72vh",
          background: "rgba(5,12,20,0.97)",
          border: `1px solid ${PU}44`,
          borderRadius: 12, overflow: "hidden", display: "flex",
          flexDirection: "column", backdropFilter: "blur(20px)",
          boxShadow: `0 0 30px ${PU}22`,
        }}>
          {/* header */}
          <div style={{
            padding: "10px 14px 8px", borderBottom: `1px solid #ffffff0d`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ color: PU, fontSize: 13, fontWeight: 700 }}>♪</span>
            <span style={{ color: PU, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
              MUSIC GENERATION STUDIO
            </span>
            <span style={{ flex: 1 }} />
            {loading && <span style={{ fontSize: 8, color: DIM }}>LOADING…</span>}
            <button
              onClick={() => { setLoading(true); loadStatus(); loadBank(); }}
              style={{ background: "none", border: "none", color: DIM, fontSize: 11, cursor: "pointer" }}
            >↺</button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, fontSize: 14, cursor: "pointer" }}
            >✕</button>
          </div>

          {err && (
            <div style={{ padding: "6px 14px", color: RD, fontSize: 10 }}>⚠ {err}</div>
          )}

          {/* stat tiles */}
          <div style={{ padding: "10px 14px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Tile label="STATUS"   value={available ? "ONLINE" : "OFFLINE"} color={available ? GN : RD} />
            <Tile label="BACKEND"  value={backend.slice(0, 12)} color={PU} />
            <Tile label="BANK"     value={bankCount}             color={bankCount ? CY : DIM} />
            <Tile label="GENERATED" value={genCount}             color={genCount ? AM : DIM} />
          </div>

          {/* tab switcher */}
          <div style={{ display: "flex", gap: 4, padding: "8px 14px 0" }}>
            {["BANK", "GENERATE"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: "3px 10px", borderRadius: 5, fontSize: 8,
                  fontWeight: 600, letterSpacing: 0.5, cursor: "pointer",
                  background: tab === t ? `${PU}33` : "transparent",
                  border: `1px solid ${tab === t ? PU : "#ffffff22"}`,
                  color: tab === t ? PU : "#8ea8b8",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* content */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {tab === "BANK" && (
              <div style={{ padding: "8px 14px" }}>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search bank tracks…"
                  style={{
                    width: "100%", padding: "5px 8px", fontSize: 10, marginBottom: 8,
                    background: "rgba(255,255,255,0.04)", border: "1px solid #ffffff18",
                    borderRadius: 6, color: "#cdd6e0", outline: "none", boxSizing: "border-box",
                  }}
                />
                {visibleBank.length === 0 ? (
                  <div style={{ color: DIM, fontSize: 10, textAlign: "center", paddingTop: 16 }}>
                    {bankItems.length === 0
                      ? "Bank is empty — generate tracks or add files to server/data/music_bank/."
                      : "No tracks match the search."}
                  </div>
                ) : (
                  visibleBank.map((it, i) => <BankRow key={i} item={it} />)
                )}
              </div>
            )}

            {tab === "GENERATE" && (
              <GenerateTab onGenerated={() => setGenCount((c) => c + 1)} />
            )}
          </div>

          {/* assess footer */}
          <div style={{ padding: "8px 14px", borderTop: `1px solid #ffffff0d` }}>
            {brief && (
              <div style={{
                marginBottom: 6, padding: "6px 8px", fontSize: 10,
                background: `${PU}0d`, border: `1px solid ${PU}33`,
                borderRadius: 6, color: "#cdd6e0", lineHeight: 1.5,
              }}>
                {brief}
              </div>
            )}
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                width: "100%", padding: "6px", borderRadius: 6,
                background: assessing ? `${PU}22` : `${PU}33`,
                border: `1px solid ${PU}66`, color: PU,
                fontSize: 10, fontWeight: 700, cursor: assessing ? "default" : "pointer",
                letterSpacing: 0.5,
              }}
            >
              {assessing ? "ASSESSING…" : "▶ ASSESS MUSIC STUDIO"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
