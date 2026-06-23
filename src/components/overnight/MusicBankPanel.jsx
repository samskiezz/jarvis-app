/**
 * MusicBankPanel — slide-in left-edge drawer showing pre-baked ambient
 * music loops from GET /v1/music/bank and service availability from
 * GET /v1/music/status. Click a row to play via the browser's native
 * <audio> element; click again (or a different row) to stop/switch.
 *
 * Tab sits at 96 % from top, below SolarEnergyPanel at 93 %.
 * Accent: indigo (#6366F1). Bank polls every 5 minutes while open.
 *
 * Endpoints:
 *   GET /v1/music/bank
 *     → { count, items: [{ name, url, size_bytes }], bank_dir }
 *   GET /v1/music/status
 *     → { suno_configured, stable_audio_configured, musicgen_available, bank_count }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";
import { appParams } from "@/lib/app-params";

const POLL_MS = 300_000; // 5 min
const DRAWER_W = 300;
const INDIGO = "#6366F1";
const GREEN = "#22c55e";
const GREY = "#4e6070";

function fmtBytes(n) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function StatusDot({ on }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: on ? GREEN : GREY,
        marginRight: 5,
        flexShrink: 0,
      }}
    />
  );
}

export default function MusicBankPanel() {
  const [open, setOpen] = useState(false);
  const [bank, setBank] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);
  const [playing, setPlaying] = useState(null); // track name currently playing
  const [, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);

    Promise.all([
      kimiClient.request("/v1/music/bank"),
      kimiClient.request("/v1/music/status"),
    ])
      .then(([bankData, statusData]) => {
        if (!alive) return;
        setBank(bankData);
        setStatus(statusData);
        setErr(false);
      })
      .catch(() => {
        if (alive) setErr(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    timerRef.current = setTimeout(() => {
      if (alive) bump();
    }, POLL_MS);

    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [open]);

  function playTrack(item) {
    const src = `${appParams.apiBaseUrl}${item.url}`;
    if (playing === item.name) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = 0.55;
    audio.play().catch(() => {});
    audio.addEventListener("ended", () => setPlaying(null));
    audioRef.current = audio;
    setPlaying(item.name);
  }

  // Stop audio when drawer closes
  useEffect(() => {
    if (!open && audioRef.current) {
      audioRef.current.pause();
      setPlaying(null);
    }
  }, [open]);

  const items = bank?.items ?? [];

  return (
    <>
      {/* Fixed toggle tab — left edge, 96 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close music bank" : "Open ambient music bank"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "96%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${INDIGO}55`,
          borderLeft: open ? "none" : `1px solid ${INDIGO}55`,
          color: INDIGO,
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: "0 4px 4px 0",
          transition: "left 0.2s ease",
          userSelect: "none",
        }}
      >
        {open ? "MUSIC ▶" : "♪ MUSIC ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8992,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderRight: `1px solid ${INDIGO}33`,
          display: "flex",
          flexDirection: "column",
          transition: "left 0.2s ease",
          fontFamily: S.mono,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderBottom: `1px solid ${S.border}`,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: S.fs.xs, color: INDIGO, letterSpacing: 2, flex: 1 }}>
            ♪ MUSIC BANK
          </span>
          {bank && (
            <span
              style={{
                fontSize: S.fs.xxs,
                color: GREY,
                background: `${INDIGO}22`,
                border: `1px solid ${INDIGO}44`,
                borderRadius: 3,
                padding: "1px 6px",
                letterSpacing: 1,
              }}
            >
              {bank.count} TRACK{bank.count !== 1 ? "S" : ""}
            </span>
          )}
        </div>

        {/* Service status row */}
        {status && (
          <div
            style={{
              padding: "6px 14px",
              borderBottom: `1px solid ${S.border}`,
              display: "flex",
              gap: 12,
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: S.fs.xxs, color: GREY, display: "flex", alignItems: "center" }}>
              <StatusDot on={status.suno_configured} />SUNO
            </span>
            <span style={{ fontSize: S.fs.xxs, color: GREY, display: "flex", alignItems: "center" }}>
              <StatusDot on={status.stable_audio_configured} />STABLE
            </span>
            <span style={{ fontSize: S.fs.xxs, color: GREY, display: "flex", alignItems: "center" }}>
              <StatusDot on={status.musicgen_available} />MUSICGEN
            </span>
          </div>
        )}

        {/* Track list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && !bank && (
            <div style={{ padding: "16px 14px", color: GREY, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING BANK…
            </div>
          )}
          {err && !bank && (
            <div style={{ padding: "16px 14px", color: "#e8203c", fontSize: S.fs.xxs, letterSpacing: 1 }}>
              BANK UNAVAILABLE
            </div>
          )}
          {!loading && !err && items.length === 0 && (
            <div style={{ padding: "16px 14px", color: GREY, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO TRACKS IN BANK
            </div>
          )}
          {items.map((item) => {
            const isPlaying = playing === item.name;
            return (
              <div
                key={item.name}
                onClick={() => playTrack(item)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  borderBottom: `1px solid ${S.border}`,
                  cursor: "pointer",
                  background: isPlaying ? `${INDIGO}18` : "transparent",
                  borderLeft: isPlaying ? `2px solid ${INDIGO}` : "2px solid transparent",
                  transition: "background 0.15s",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    flexShrink: 0,
                    color: isPlaying ? INDIGO : GREY,
                  }}
                >
                  {isPlaying ? "▶" : "◆"}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: S.fs.xxs,
                    color: isPlaying ? S.textHi : S.text,
                    letterSpacing: 0.5,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.name}
                </span>
                <span style={{ fontSize: S.fs.xxs, color: GREY, flexShrink: 0 }}>
                  {fmtBytes(item.size_bytes)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 14px",
            borderTop: `1px solid ${S.border}`,
            fontSize: S.fs.xxs,
            color: GREY,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          {playing ? `▶ ${playing}` : "CLICK TRACK TO PLAY"}
        </div>
      </div>
    </>
  );
}
