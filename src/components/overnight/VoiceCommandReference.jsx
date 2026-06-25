/**
 * VoiceCommandReference — F95
 * Right-edge slide-in at 69 % vertical.
 * Fetches GET /v1/voice/status (once on open) — TTS provider + STT availability.
 * Fetches GET /v1/voice/commands (once on open) — full grouped catalog.
 * Searchable by phrase/example/description.
 * Tab: ⌘ CMDS ▶  Accent: #60A5FA (blue-400)
 */
import { useEffect, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const DRAWER_W = 340;
const BLUE = "#60A5FA";

export default function VoiceCommandReference() {
  const [open, setOpen]     = useState(false);
  const [status, setStatus] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [err, setErr]       = useState(false);
  const [query, setQuery]   = useState("");
  const fetchedRef          = useRef(false);

  useEffect(() => {
    if (!open || fetchedRef.current) return;
    fetchedRef.current = true;
    let alive = true;

    Promise.all([
      kimiClient.request("/v1/voice/status").catch(() => null),
      kimiClient.request("/v1/voice/commands").catch(() => null),
    ]).then(([st, cat]) => {
      if (!alive) return;
      if (!st && !cat) { setErr(true); return; }
      setStatus(st);
      setCatalog(cat);
      setErr(false);
    });

    return () => { alive = false; };
  }, [open]);

  const categories = catalog?.categories ?? [];
  const q = query.trim().toLowerCase();

  const filteredCats = q
    ? categories
        .map((cat) => ({
          ...cat,
          commands: cat.commands.filter(
            (c) =>
              c.phrase.toLowerCase().includes(q) ||
              c.example.toLowerCase().includes(q) ||
              c.description.toLowerCase().includes(q),
          ),
        }))
        .filter((cat) => cat.commands.length > 0)
    : categories;

  const totalVisible = filteredCats.reduce((acc, c) => acc + c.commands.length, 0);

  return (
    <>
      {/* Tab toggle */}
      <div
        onClick={() => setOpen((o) => !o)}
        title="Voice Command Reference — GET /v1/voice/commands"
        style={{
          position: "fixed", right: open ? DRAWER_W : 0, top: "69%",
          zIndex: 120, cursor: "pointer",
          background: open ? BLUE : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : BLUE,
          border: `1px solid ${BLUE}77`,
          borderRight: open ? "none" : `1px solid ${BLUE}77`,
          borderRadius: "6px 0 0 6px",
          padding: "6px 5px",
          fontSize: 9, fontFamily: S.mono, letterSpacing: 1.5,
          writingMode: "vertical-rl", textOrientation: "mixed",
          userSelect: "none", backdropFilter: "blur(6px)",
          boxShadow: `0 0 14px ${BLUE}33`,
          transition: "right 0.25s ease",
        }}
      >
        ⌘ CMDS ▶
      </div>

      {/* Drawer */}
      <div style={{
        position: "fixed", right: open ? 0 : -DRAWER_W - 2, top: 0, bottom: 0,
        width: DRAWER_W, zIndex: 119,
        background: "rgba(5,8,13,0.92)", borderLeft: `1px solid ${BLUE}44`,
        backdropFilter: "blur(12px)", display: "flex", flexDirection: "column",
        transition: "right 0.25s ease",
        fontFamily: S.mono, color: "#DCEBF5",
      }}>
        {/* Header */}
        <div style={{
          padding: "10px 14px 8px", borderBottom: `1px solid ${BLUE}33`,
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: BLUE, fontSize: 10, letterSpacing: 2, fontWeight: 700 }}>
              ⌘ VOICE COMMANDS
            </span>
            <span style={{ marginLeft: "auto", fontSize: 9, color: "#6B7280" }}>
              {catalog === null && !err ? "…" : `${totalVisible} cmd${totalVisible !== 1 ? "s" : ""}`}
            </span>
          </div>

          {/* TTS / STT status chips */}
          {status && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              <span style={{
                fontSize: 9, letterSpacing: 1,
                color: status.tts_available ? "#22C55E" : "#EF4444",
                border: `1px solid ${status.tts_available ? "#22C55E55" : "#EF444455"}`,
                borderRadius: 3, padding: "1px 5px",
              }}>
                TTS {status.tts_provider?.toUpperCase() ?? "UNKNOWN"}
              </span>
              <span style={{
                fontSize: 9, letterSpacing: 1,
                color: status.stt_available ? "#22C55E" : "#6B7280",
                border: `1px solid ${status.stt_available ? "#22C55E55" : "#37415155"}`,
                borderRadius: 3, padding: "1px 5px",
              }}>
                STT {status.stt_engine?.toUpperCase() ?? (status.stt_available ? "ON" : "BROWSER")}
              </span>
            </div>
          )}

          {/* Search */}
          {catalog !== null && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="filter commands…"
              style={{
                background: "rgba(255,255,255,0.04)", border: `1px solid ${BLUE}33`,
                borderRadius: 4, padding: "4px 8px",
                fontSize: 10, color: "#DCEBF5", fontFamily: S.mono, outline: "none",
                width: "100%", boxSizing: "border-box",
              }}
            />
          )}
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {err && (
            <div style={{ padding: "14px", color: "#EF4444", fontSize: 10, textAlign: "center" }}>
              ENDPOINT ERROR — /v1/voice/commands
            </div>
          )}
          {!err && catalog === null && (
            <div style={{ padding: "14px", color: "#6B7280", fontSize: 10, textAlign: "center" }}>
              LOADING…
            </div>
          )}
          {!err && catalog !== null && filteredCats.length === 0 && (
            <div style={{ padding: "14px", color: "#6B7280", fontSize: 10, textAlign: "center" }}>
              {q ? "NO MATCHING COMMANDS" : "NO COMMANDS AVAILABLE"}
            </div>
          )}

          {filteredCats.map((cat) => (
            <div key={cat.name} style={{ marginBottom: 2 }}>
              {/* Category header */}
              <div style={{
                padding: "5px 14px 3px",
                fontSize: 9, letterSpacing: 2,
                color: BLUE, fontWeight: 700,
                borderBottom: `1px solid ${BLUE}22`,
                background: `${BLUE}08`,
              }}>
                {cat.name.toUpperCase()}
              </div>

              {/* Commands */}
              {cat.commands.map((cmd, i) => (
                <div
                  key={i}
                  style={{
                    padding: "7px 14px",
                    borderBottom: "1px solid rgba(255,255,255,0.03)",
                    display: "flex", flexDirection: "column", gap: 3,
                  }}
                >
                  {/* Phrase */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
                  }}>
                    <span style={{ fontSize: 10, color: "#E2E8F0", fontWeight: 500 }}>
                      {cmd.phrase}
                    </span>
                  </div>

                  {/* Example */}
                  {cmd.example && cmd.example !== cmd.phrase && (
                    <div style={{ fontSize: 9, color: BLUE, opacity: 0.75 }}>
                      e.g. &ldquo;{cmd.example}&rdquo;
                    </div>
                  )}

                  {/* Description */}
                  <div style={{
                    fontSize: 9, color: "#6B7280",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {cmd.description}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: "6px 14px", borderTop: `1px solid ${BLUE}22`,
          fontSize: 9, color: "#374151", letterSpacing: 1,
        }}>
          GET /v1/voice/status · /v1/voice/commands · fetched once on open
        </div>
      </div>
    </>
  );
}
