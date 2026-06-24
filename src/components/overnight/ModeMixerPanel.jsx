/**
 * ModeMixerPanel — F73
 * Left-edge slide-in drawer at 48 % vertical.
 * Shows the active JARVIS behaviour-mode profile and the preset catalog.
 * Polls GET /v1/mode/active every 60 s; loads GET /v1/mode/profiles once on open.
 */
import { useEffect, useRef, useState } from "react";

const ACC     = "#EAB308"; // yellow-500
const BG      = "rgba(5,12,20,0.97)";
const BORDER  = `1px solid ${ACC}33`;
const MONO    = "'JetBrains Mono','Courier New',monospace";
const POLL_MS = 60_000;

const PROFILE_FIELDS = [
  ["tone",        (p) => p.tone],
  ["detail",      (p) => p.detail],
  ["speed",       (p) => p.speed],
  ["tool_use",    (p) => p.tool_use],
  ["privacy",     (p) => p.privacy],
  ["cost",        (p) => p.cost],
  ["safety",      (p) => p.safety],
  ["voice",       (p) => p.voice_style],
  ["strictness",  (p) => typeof p.strictness === "number" ? (p.strictness * 100).toFixed(0) + "%" : null],
  ["autonomy",    (p) => typeof p.autonomy   === "number" ? (p.autonomy   * 100).toFixed(0) + "%" : null],
];

export default function ModeMixerPanel() {
  const [open, setOpen]         = useState(false);
  const [active, setActive]     = useState(null);
  const [profiles, setProfiles] = useState(null);
  const [err, setErr]           = useState(null);
  const [loading, setLoading]   = useState(false);
  const profilesLoaded          = useRef(false);
  const timerRef                = useRef(null);

  async function fetchActive() {
    setLoading(true);
    try {
      const r = await fetch("/v1/mode/active");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setActive(await r.json());
      setErr(null);
    } catch (e) {
      setErr(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }

  async function fetchProfiles() {
    try {
      const r = await fetch("/v1/mode/profiles");
      if (!r.ok) return;
      setProfiles(await r.json());
    } catch { /* best-effort */ }
  }

  useEffect(() => {
    if (!open) {
      clearInterval(timerRef.current);
      return;
    }
    fetchActive();
    timerRef.current = setInterval(fetchActive, POLL_MS);
    if (!profilesLoaded.current) {
      fetchProfiles();
      profilesLoaded.current = true;
    }
    return () => clearInterval(timerRef.current);
  }, [open]);

  const profile  = active?.profile  ?? {};
  const activeId = active?.active_id ?? "—";
  const presets  = Object.values(profiles?.presets ?? {});
  const custom   = Object.values(profiles?.custom  ?? {});

  return (
    <>
      {/* Tab trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Mode Mixer — /v1/mode/active"
        style={{
          position: "fixed",
          left: open ? 340 : 0,
          top: "48%",
          zIndex: 120,
          background: open ? ACC : BG,
          border: BORDER,
          borderLeft: "none",
          borderRadius: "0 6px 6px 0",
          color: open ? "#000" : ACC,
          cursor: "pointer",
          fontFamily: MONO,
          fontSize: 9,
          letterSpacing: 1,
          padding: "6px 5px",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transition: "left 0.25s ease",
          boxShadow: `0 0 12px ${ACC}22`,
        }}
      >
        ◈ MODE
      </button>

      {/* Drawer */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            width: 340,
            height: "100vh",
            zIndex: 119,
            background: BG,
            borderRight: BORDER,
            display: "flex",
            flexDirection: "column",
            fontFamily: MONO,
            boxShadow: `12px 0 40px ${ACC}11`,
          }}
        >
          {/* Header */}
          <div
            style={{
              borderBottom: BORDER,
              padding: "10px 14px 8px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: ACC, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
                ◈ MODE MIXER
              </span>
              {loading && (
                <span style={{ color: ACC, fontSize: 9, opacity: 0.6 }}>⟳</span>
              )}
              {profile.name && (
                <span
                  style={{
                    marginLeft: "auto",
                    background: `${ACC}22`,
                    color: ACC,
                    border: `1px solid ${ACC}44`,
                    borderRadius: 4,
                    padding: "1px 8px",
                    fontSize: 9,
                    letterSpacing: 1,
                    fontWeight: 700,
                  }}
                >
                  {profile.name.toUpperCase()}
                </span>
              )}
            </div>
            <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1 }}>
              GET /v1/mode/active · 60s poll
            </div>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {err && (
              <div style={{ color: "#EF4444", fontSize: 10, padding: "12px 14px", letterSpacing: 1 }}>
                ✗ {err}
              </div>
            )}

            {/* Active profile fields */}
            {!err && profile.name && (
              <div style={{ padding: "0 14px 8px" }}>
                <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>
                  ACTIVE PROFILE
                </div>
                {PROFILE_FIELDS
                  .map(([k, fn]) => [k, fn(profile)])
                  .filter(([, v]) => v != null)
                  .map(([k, v]) => (
                    <div
                      key={k}
                      style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}
                    >
                      <span style={{ color: "#4E6070", fontSize: 10, letterSpacing: 1 }}>
                        {k}
                      </span>
                      <span
                        style={{
                          background: `${ACC}18`,
                          color: ACC,
                          border: `1px solid ${ACC}33`,
                          borderRadius: 3,
                          fontSize: 9,
                          padding: "0 6px",
                          letterSpacing: 0.5,
                        }}
                      >
                        {String(v).toUpperCase()}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {/* Presets section */}
            {presets.length > 0 && (
              <>
                <div style={{ borderTop: BORDER, margin: "4px 0 8px" }} />
                <div style={{ padding: "0 14px" }}>
                  <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>
                    PRESETS ({presets.length})
                  </div>
                  {presets.map((p) => (
                    <PresetRow key={p.id} preset={p} isActive={p.id === activeId} acc={ACC} />
                  ))}
                </div>
              </>
            )}

            {/* Custom profiles section */}
            {custom.length > 0 && (
              <>
                <div style={{ borderTop: BORDER, margin: "4px 0 8px" }} />
                <div style={{ padding: "0 14px" }}>
                  <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>
                    CUSTOM ({custom.length})
                  </div>
                  {custom.map((p) => (
                    <PresetRow key={p.id} preset={p} isActive={p.id === activeId} acc={ACC} />
                  ))}
                </div>
              </>
            )}

            {!err && !loading && !profile.name && (
              <div style={{ color: "#4E6070", fontSize: 10, padding: "18px 14px", textAlign: "center", letterSpacing: 1 }}>
                NO MODE DATA
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              borderTop: BORDER,
              padding: "6px 14px",
              color: "#2E4050",
              fontSize: 9,
              letterSpacing: 1,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>BEHAVIOUR CONTROL</span>
            <span>↺ 60s</span>
          </div>
        </div>
      )}

      <style>{`
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${ACC}33; border-radius: 2px; }
      `}</style>
    </>
  );
}

function PresetRow({ preset, isActive, acc }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      onClick={() => setExpanded((v) => !v)}
      style={{
        padding: "6px 0",
        cursor: "pointer",
        borderBottom: "1px solid rgba(255,255,255,0.03)",
        background: expanded ? `${acc}08` : "transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: isActive ? acc : "#1E3040",
            border: `1px solid ${isActive ? acc : "#2E4050"}`,
            flexShrink: 0,
            boxShadow: isActive ? `0 0 5px ${acc}88` : "none",
          }}
        />
        <span
          style={{
            color: isActive ? acc : "#DCEBF5",
            fontSize: 11,
            flex: 1,
            letterSpacing: 0.5,
            fontWeight: isActive ? 700 : 400,
          }}
        >
          {preset.name || preset.id}
        </span>
        <span style={{ color: "#4E6070", fontSize: 9, letterSpacing: 0.5 }}>
          {preset.tone ?? "—"} · {preset.detail ?? "—"}
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: 5, paddingLeft: 13, display: "flex", flexWrap: "wrap", gap: "3px 8px" }}>
          {[
            ["speed",   preset.speed],
            ["tools",   preset.tool_use],
            ["safety",  preset.safety],
            ["cost",    preset.cost],
            ["auto",    typeof preset.autonomy === "number" ? (preset.autonomy * 100).toFixed(0) + "%" : null],
          ]
            .filter(([, v]) => v != null)
            .map(([k, v]) => (
              <span key={k} style={{ color: "#4E6070", fontSize: 8, letterSpacing: 0.5 }}>
                {k}:<span style={{ color: "#8AAABB", marginLeft: 2 }}>{String(v)}</span>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
