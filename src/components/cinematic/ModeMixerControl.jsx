/**
 * ModeMixerControl — F269.
 *
 * Data sources:
 *   GET  /v1/mode/active    (poll 60 s) → {id, name, tone, detail, speed,
 *                                          strictness, autonomy, tool_use, ...}
 *   GET  /v1/mode/profiles  (on open)   → {presets:[...], custom:[...]}
 *   POST /v1/mode/apply/{id}            → activate a profile
 *
 * Displays:
 *   - Stat tiles: presets / custom / autonomy % / active mode name
 *   - PRESETS | CUSTOM tab switcher + text search
 *   - Per-profile: name chip + tone/detail/speed/strictness/autonomy bars
 *   - ▶ APPLY per profile → POST /v1/mode/apply/{id} → inline confirm
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle: ◈ MXRP at left:246960, bottom:8, zIndex:147.
 * Green badge = active mode name; amber when no active mode detected.
 * 60 s auto-refresh for active mode.
 *
 * Exported helpers for JarvisBrain:
 *   isMxrpQuery(q) / buildMxrpScript()
 *
 * Voice triggers: "mode mixer / behavior mode / active mode / mode profile /
 *   apply mode / jarvis mode / mxrp / mode control / current mode /
 *   behavior profile / mode settings / which mode"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#4ADE80";
const PURP  = "#B06EFF";
const GRAY  = "#4E6070";
const RED   = "#F87171";

const BTN_LEFT   = 246960;
const REFRESH_MS = 60_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchActive() {
  const r = await fetch(`${apiBase()}/v1/mode/active`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`mode/active ${r.status}`);
  return r.json();
}

async function fetchProfiles() {
  const r = await fetch(`${apiBase()}/v1/mode/profiles`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`mode/profiles ${r.status}`);
  return r.json();
}

async function applyProfile(profileId) {
  const r = await fetch(`${apiBase()}/v1/mode/apply/${encodeURIComponent(profileId)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error(`apply ${r.status}`);
  return r.json();
}

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const MXRP_RE =
  /\b(mode.?mixer|behavior.?mode|active.?mode|mode.?profile|apply.?mode|jarvis.?mode|mxrp|mode.?control|current.?mode|behavior.?profile|mode.?setting|which.?mode|mode.?switch)\b/i;

export function isMxrpQuery(q) {
  return MXRP_RE.test(q || "");
}

export async function buildMxrpScript() {
  try {
    const [active, profiles] = await Promise.all([fetchActive(), fetchProfiles()]);
    window.dispatchEvent(new CustomEvent("jarvis:mxrp-toggle"));
    const name = active?.name || active?.id || "unknown";
    const autonomy = active?.autonomy != null ? Math.round(active.autonomy * 100) : null;
    const presetCount = (profiles?.presets ?? []).length;
    const customCount = (profiles?.custom ?? []).length;
    return (
      `Jarvis is currently operating in ${name} mode` +
      (autonomy != null ? ` with ${autonomy}% autonomy` : "") +
      `. ${presetCount} preset profile${presetCount !== 1 ? "s" : ""} and ${customCount} custom profile${customCount !== 1 ? "s" : ""} are available — say "apply mode" followed by the profile name to switch, sir.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:mxrp-toggle"));
    return "Mode Mixer Control open, sir.";
  }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        background: "rgba(41,231,255,0.04)",
        border: `1px solid ${CY}22`,
        borderRadius: 7,
        padding: "7px 10px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: color || CY,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value ?? "—"}
      </div>
      <div style={{ fontSize: 7, color: GRAY, marginTop: 2, letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

function ScalarBar({ value, color }) {
  const pct = Math.min(100, Math.max(0, Math.round((value ?? 0) * 100)));
  return (
    <div
      style={{
        height: 3,
        background: `${GRAY}33`,
        borderRadius: 2,
        overflow: "hidden",
        flex: 1,
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: color || CY,
          borderRadius: 2,
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
}

function ProfileRow({ profile, active, onApplied }) {
  const [applying, setApplying] = useState(false);
  const [result, setResult]     = useState(null);

  const isActive = active?.id === profile.id || active?.name === profile.name;

  async function handleApply() {
    setApplying(true);
    setResult(null);
    try {
      await applyProfile(profile.id || profile.name);
      setResult("ok");
      onApplied();
    } catch (e) {
      setResult("err:" + e.message);
    } finally {
      setApplying(false);
    }
  }

  const strictness = profile.strictness ?? 0.5;
  const autonomy   = profile.autonomy   ?? 0.2;

  return (
    <div
      style={{
        borderBottom: `1px solid ${CY}18`,
        padding: "7px 12px",
        background: isActive ? `${GREEN}09` : "transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {isActive && (
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: GREEN,
              boxShadow: `0 0 6px ${GREEN}`,
              flexShrink: 0,
            }}
          />
        )}
        <span
          style={{
            color: isActive ? GREEN : CY,
            fontSize: 9,
            fontWeight: 600,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {profile.name || profile.id}
        </span>

        {/* tone chip */}
        {profile.tone && (
          <span
            style={{
              background: `${PURP}18`,
              border: `1px solid ${PURP}44`,
              borderRadius: 4,
              padding: "1px 5px",
              color: PURP,
              fontSize: 7,
              letterSpacing: 1,
            }}
          >
            {profile.tone.toUpperCase()}
          </span>
        )}

        {/* speed chip */}
        {profile.speed && (
          <span
            style={{
              background: `${AMBER}18`,
              border: `1px solid ${AMBER}44`,
              borderRadius: 4,
              padding: "1px 5px",
              color: AMBER,
              fontSize: 7,
              letterSpacing: 1,
            }}
          >
            {profile.speed.toUpperCase()}
          </span>
        )}

        <button
          onClick={handleApply}
          disabled={applying || isActive}
          style={{
            background: isActive ? `${GREEN}18` : applying ? `${GRAY}18` : `${CY}14`,
            border: `1px solid ${isActive ? GREEN : applying ? GRAY : CY}55`,
            borderRadius: 4,
            padding: "1px 7px",
            color: isActive ? GREEN : applying ? GRAY : CY,
            fontSize: 8,
            cursor: isActive || applying ? "default" : "pointer",
            fontFamily: "inherit",
            letterSpacing: 1,
            whiteSpace: "nowrap",
          }}
        >
          {isActive ? "ACTIVE" : applying ? "…" : "▶ APPLY"}
        </button>
      </div>

      {/* scalar bars */}
      <div style={{ display: "flex", gap: 6, marginTop: 5, alignItems: "center" }}>
        <span style={{ fontSize: 7, color: GRAY, minWidth: 52 }}>STRICT</span>
        <ScalarBar value={strictness} color={RED} />
        <span style={{ fontSize: 7, color: GRAY, textAlign: "right", minWidth: 22 }}>
          {Math.round(strictness * 100)}%
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center" }}>
        <span style={{ fontSize: 7, color: GRAY, minWidth: 52 }}>AUTONOMY</span>
        <ScalarBar value={autonomy} color={GREEN} />
        <span style={{ fontSize: 7, color: GRAY, textAlign: "right", minWidth: 22 }}>
          {Math.round(autonomy * 100)}%
        </span>
      </div>

      {result && (
        <div
          style={{
            marginTop: 4,
            fontSize: 8,
            color: result === "ok" ? GREEN : RED,
          }}
        >
          {result === "ok" ? "✓ Mode applied" : `✕ ${result.slice(4)}`}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function ModeMixerControl() {
  const [visible,    setVisible]    = useState(false);
  const [active,     setActive]     = useState(null);
  const [profiles,   setProfiles]   = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [tab,        setTab]        = useState("PRESETS");
  const [search,     setSearch]     = useState("");
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const activeTimer = useRef(null);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:mxrp-toggle", onToggle);
    return () => window.removeEventListener("jarvis:mxrp-toggle", onToggle);
  }, []);

  const loadActive = useCallback(async () => {
    try {
      const d = await fetchActive();
      setActive(d);
    } catch {
      // retain stale
    }
  }, []);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchProfiles();
      setProfiles(d);
    } catch {
      // retain stale
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    loadActive();
    loadProfiles();
    activeTimer.current = setInterval(loadActive, REFRESH_MS);
    return () => clearInterval(activeTimer.current);
  }, [visible, loadActive, loadProfiles]);

  const presets      = profiles?.presets ?? [];
  const custom       = profiles?.custom  ?? [];
  const allProfiles  = tab === "PRESETS" ? presets : custom;
  const q            = search.toLowerCase();
  const filtered     = allProfiles.filter(
    (p) => !q || (p.name || "").toLowerCase().includes(q) || (p.id || "").toLowerCase().includes(q)
  );

  const autonomy     = active?.autonomy != null ? Math.round(active.autonomy * 100) : null;
  const activeName   = active?.name || active?.id || null;
  const badgeColor   = activeName ? GREEN : AMBER;

  async function handleAssess() {
    setAssessing(true);
    try {
      const ctx = `active_mode=${activeName ?? "unknown"}, autonomy=${autonomy ?? "?"}%, presets=${presets.length}, custom=${custom.length}`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `In 2 sentences, assess the Jarvis behavior mode. Context: ${ctx}`,
        }),
      });
      const d = await r.json();
      const brief = (d.answer || "Mode assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessment(brief);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } }));
    } catch {
      setAssessment("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  const panelW = 440;

  return (
    <>
      {/* ── trigger button ── */}
      <div
        style={{
          position: "fixed",
          left:     `min(${BTN_LEFT}px, calc(100vw - 115px))`,
          bottom:   8,
          zIndex:   147,
          display:  "flex",
          flexDirection: "column",
          alignItems:    "center",
          gap: 2,
        }}
      >
        {activeName && (
          <div
            style={{
              background:   badgeColor,
              color:        "#000",
              borderRadius: 8,
              fontSize:     7,
              padding:      "1px 5px",
              fontWeight:   700,
              letterSpacing: 1,
              maxWidth:     90,
              overflow:     "hidden",
              textOverflow: "ellipsis",
              whiteSpace:   "nowrap",
            }}
          >
            {activeName.toUpperCase()}
          </div>
        )}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("jarvis:mxrp-toggle"))}
          style={{
            background:   "rgba(41,231,255,0.08)",
            border:       `1px solid ${CY}55`,
            borderRadius: 6,
            padding:      "3px 8px",
            color:        CY,
            fontSize:     8,
            letterSpacing: 1,
            cursor:       "pointer",
            fontFamily:   "inherit",
            whiteSpace:   "nowrap",
          }}
        >
          ◈ MXRP
        </button>
      </div>

      {/* ── panel ── */}
      {visible && (
        <div
          style={{
            position:      "fixed",
            left:          `min(${BTN_LEFT}px, calc(100vw - ${panelW + 10}px))`,
            bottom:        40,
            zIndex:        147,
            width:         panelW,
            maxHeight:     "74vh",
            background:    "rgba(4,14,22,0.97)",
            border:        `1px solid ${CY}44`,
            borderRadius:  10,
            display:       "flex",
            flexDirection: "column",
            overflow:      "hidden",
            fontFamily:    "monospace",
            boxShadow:     `0 0 28px ${CY}22`,
          }}
        >
          {/* header */}
          <div
            style={{
              padding:      "8px 12px 6px",
              borderBottom: `1px solid ${CY}22`,
              display:      "flex",
              alignItems:   "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span style={{ color: CY, fontWeight: 700, fontSize: 10, letterSpacing: 2 }}>
              ◈ MODE MIXER CONTROL
            </span>
            {loading && <span style={{ color: GRAY, fontSize: 8 }}>…</span>}
            <div style={{ flex: 1 }} />
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                background:   "rgba(41,231,255,0.08)",
                border:       `1px solid ${CY}44`,
                borderRadius: 4,
                padding:      "2px 7px",
                color:        CY,
                fontSize:     8,
                cursor:       assessing ? "default" : "pointer",
                fontFamily:   "inherit",
                letterSpacing: 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            <button
              onClick={() => setVisible(false)}
              style={{
                background: "transparent",
                border:     "none",
                color:      GRAY,
                fontSize:   11,
                cursor:     "pointer",
                fontFamily: "inherit",
                padding:    "0 3px",
              }}
            >
              ✕
            </button>
          </div>

          {/* assessment */}
          {assessment && (
            <div
              style={{
                padding:      "6px 12px",
                fontSize:     9,
                color:        CY,
                background:   `${CY}08`,
                borderBottom: `1px solid ${CY}22`,
                flexShrink:   0,
              }}
            >
              {assessment}
            </div>
          )}

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 12px 6px", flexShrink: 0 }}>
            <StatTile label="PRESETS"   value={presets.length}                     color={CY}    />
            <StatTile label="CUSTOM"    value={custom.length}                      color={PURP}  />
            <StatTile label="AUTONOMY"  value={autonomy != null ? `${autonomy}%` : "—"} color={GREEN} />
            <StatTile label="ACTIVE"    value={activeName ? activeName.toUpperCase().slice(0, 8) : "—"} color={activeName ? GREEN : AMBER} />
          </div>

          {/* tabs */}
          <div
            style={{
              display:      "flex",
              gap:          4,
              padding:      "4px 12px",
              flexShrink:   0,
              borderBottom: `1px solid ${CY}22`,
            }}
          >
            {["PRESETS", "CUSTOM"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background:   tab === t ? `${CY}22` : "transparent",
                  border:       `1px solid ${tab === t ? CY : CY + "33"}`,
                  borderRadius: 4,
                  padding:      "2px 10px",
                  color:        tab === t ? CY : GRAY,
                  fontSize:     8,
                  cursor:       "pointer",
                  fontFamily:   "inherit",
                  letterSpacing: 1,
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* search */}
          <div style={{ padding: "5px 12px", flexShrink: 0 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search profiles…"
              style={{
                width:        "100%",
                background:   "rgba(41,231,255,0.05)",
                border:       `1px solid ${CY}22`,
                borderRadius: 5,
                padding:      "3px 8px",
                color:        CY,
                fontSize:     9,
                fontFamily:   "inherit",
                outline:      "none",
                boxSizing:    "border-box",
              }}
            />
          </div>

          {/* active mode summary */}
          {active && (
            <div
              style={{
                padding:      "5px 12px 5px",
                borderBottom: `1px solid ${CY}18`,
                flexShrink:   0,
                fontSize:     8,
                color:        GRAY,
                display:      "flex",
                gap:          10,
                flexWrap:     "wrap",
              }}
            >
              <span>
                <span style={{ color: GREEN }}>● ACTIVE:</span>{" "}
                <span style={{ color: "#DCEBF5" }}>{activeName || "—"}</span>
              </span>
              {active.tone    && <span>tone: <span style={{ color: PURP }}>{active.tone}</span></span>}
              {active.detail  && <span>detail: <span style={{ color: CY }}>{active.detail}</span></span>}
              {active.speed   && <span>speed: <span style={{ color: AMBER }}>{active.speed}</span></span>}
              {active.tool_use && <span>tools: <span style={{ color: GREEN }}>{active.tool_use}</span></span>}
            </div>
          )}

          {/* profile list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 16, color: GRAY, fontSize: 9, textAlign: "center" }}>
                {loading
                  ? "Loading profiles…"
                  : search
                  ? "No matching profiles."
                  : tab === "CUSTOM"
                  ? "No custom profiles saved."
                  : "No preset profiles found."}
              </div>
            ) : (
              filtered.map((p, i) => (
                <ProfileRow
                  key={p.id || p.name || i}
                  profile={p}
                  active={active}
                  onApplied={loadActive}
                />
              ))
            )}
          </div>

          {/* footer */}
          <div
            style={{
              padding:    "5px 12px",
              fontSize:   8,
              color:      GRAY,
              borderTop:  `1px solid ${CY}22`,
              flexShrink: 0,
            }}
          >
            {filtered.length} of {allProfiles.length} profile{allProfiles.length !== 1 ? "s" : ""}{" "}
            · active poll 60 s · /v1/mode
          </div>
        </div>
      )}
    </>
  );
}
