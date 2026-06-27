/**
 * ScrapeStatusDrawer — F137
 * Right-edge slide-in drawer showing JARVIS document-scraping status.
 *
 * Polls GET /v1/jarvis/scrape/status every 2 min while open:
 *   → { scraped_documents, stored_full_text: { notes, avg_len, total_chars, db_size_kb },
 *       pending_targets, seed_progress: { fetched, total }, best_engine }
 *
 * Fetches GET /v1/jarvis/scrape/engines once on first open:
 *   → { engines: { content: [...], browser: [...], recon: [...] },
 *       available_counts: { content, browser, recon } }
 *
 * Tab at 99 % from top (right edge, below VaultSecretsDrawer 97 %).
 * Accent: sky-blue #38BDF8.
 *
 * Mount: src/Layout.jsx after <VaultSecretsDrawer />.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS  = 120_000; // 2 min
const DRAWER_W = 340;
const SKY      = "#38BDF8";
const SKY_DIM  = "rgba(56,189,248,0.45)";
const GREEN    = "#22C55E";
const RED      = "#EF4444";
const AMBER    = "#F59E0B";

export default function ScrapeStatusDrawer() {
  const [open,    setOpen]    = useState(false);
  const [status,  setStatus]  = useState(null);
  const [engines, setEngines] = useState(null);
  const [err,     setErr]     = useState(false);
  const [tick,    bump]       = useReducer((n) => n + 1, 0);
  const timerRef              = useRef(null);
  const enginesFetched        = useRef(false);

  // Poll status every POLL_MS while open
  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/jarvis/scrape/status")
      .then((d) => {
        if (alive) { setStatus(d); setErr(false); }
      })
      .catch(() => {
        if (alive) setErr(true);
      });

    timerRef.current = setTimeout(() => {
      if (alive) bump();
    }, POLL_MS);

    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [open, tick]);

  // Fetch engines once per open
  useEffect(() => {
    if (!open || enginesFetched.current) return;
    enginesFetched.current = true;
    let alive = true;

    kimiClient
      .request("/v1/jarvis/scrape/engines")
      .then((d) => {
        if (alive) setEngines(d);
      })
      .catch(() => {});

    return () => { alive = false; };
  }, [open]);

  // Reset engines fetch guard when closed
  useEffect(() => {
    if (!open) enginesFetched.current = false;
  }, [open]);

  const sp        = status?.seed_progress ?? {};
  const ft        = status?.stored_full_text ?? {};
  const bestEng   = status?.best_engine;
  const seedPct   = sp.total > 0 ? Math.round((sp.fetched / sp.total) * 100) : null;
  const allEngines = engines
    ? [
        ...(engines.engines?.content ?? []),
        ...(engines.engines?.browser ?? []),
        ...(engines.engines?.recon   ?? []),
      ]
    : [];
  const availCounts = engines?.available_counts ?? {};

  return (
    <>
      {/* Fixed toggle tab — right edge, 99 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close scrape status" : "Open JARVIS scrape engine status"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "99%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${SKY}55`,
          borderRight: open ? "none" : `1px solid ${SKY}55`,
          color: SKY,
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: "4px 0 0 4px",
          transition: "right 0.2s ease",
          userSelect: "none",
        }}
      >
        {open ? "SCRAPE ▶" : "SCRAPE ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8995,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${SKY}33`,
          display: "flex",
          flexDirection: "column",
          transition: "right 0.2s ease",
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
          <span style={{ fontSize: S.fs.xs, color: SKY, letterSpacing: 2, flex: 1 }}>
            ◈ SCRAPE ENGINE STATUS
          </span>
          {bestEng && (
            <span
              style={{
                fontSize: 9,
                color: GREEN,
                border: `1px solid ${GREEN}55`,
                borderRadius: 3,
                padding: "1px 6px",
                letterSpacing: 1,
                flexShrink: 0,
              }}
            >
              {bestEng.toUpperCase()}
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: RED, fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !status ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : (
            <>
              {/* Stat tiles */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  padding: "10px 14px",
                  borderBottom: `1px solid ${S.border}`,
                }}
              >
                {[
                  { label: "SCRAPED DOCS",    value: status.scraped_documents ?? "—" },
                  { label: "PENDING TARGETS", value: status.pending_targets ?? "—" },
                  { label: "STORED NOTES",    value: ft.notes ?? "—" },
                  { label: "DB SIZE",         value: ft.db_size_kb != null ? `${ft.db_size_kb} KB` : "—" },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    style={{
                      background: "rgba(56,189,248,0.06)",
                      border: `1px solid ${SKY}22`,
                      borderRadius: 4,
                      padding: "7px 10px",
                    }}
                  >
                    <div style={{ fontSize: 9, color: SKY_DIM, letterSpacing: 1.5 }}>{label}</div>
                    <div style={{ fontSize: S.fs.sm, color: "#DCEBF5", letterSpacing: 0.5, marginTop: 2 }}>
                      {String(value)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Seed progress */}
              {sp.total > 0 && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderBottom: `1px solid ${S.border}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 9,
                      color: SKY_DIM,
                      letterSpacing: 1.5,
                      marginBottom: 5,
                    }}
                  >
                    <span>SEED PROGRESS</span>
                    <span style={{ color: SKY }}>{sp.fetched}/{sp.total} ({seedPct}%)</span>
                  </div>
                  <div
                    style={{
                      height: 4,
                      background: "rgba(56,189,248,0.12)",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${seedPct}%`,
                        background: seedPct === 100 ? GREEN : SKY,
                        borderRadius: 2,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Engine availability */}
              {engines && (
                <div style={{ padding: "10px 14px 4px" }}>
                  <div
                    style={{
                      fontSize: 9,
                      color: SKY_DIM,
                      letterSpacing: 1.5,
                      marginBottom: 6,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>ENGINES</span>
                    {["content", "browser", "recon"].map((kind) => (
                      <span
                        key={kind}
                        style={{
                          fontSize: 9,
                          color: availCounts[kind] > 0 ? GREEN : S.text,
                          border: `1px solid ${availCounts[kind] > 0 ? GREEN : S.border}55`,
                          borderRadius: 3,
                          padding: "1px 5px",
                          letterSpacing: 1,
                        }}
                      >
                        {kind.toUpperCase()} {availCounts[kind] ?? 0}
                      </span>
                    ))}
                  </div>
                  {allEngines.map((eng) => (
                    <div
                      key={eng.name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 0",
                        borderBottom: `1px solid ${S.border}`,
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: eng.available ? GREEN : RED,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          flex: 1,
                          fontSize: S.fs.xxs,
                          color: eng.available ? "#DCEBF5" : S.text,
                          letterSpacing: 0.5,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {eng.name}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          color: eng.available ? GREEN : RED,
                          border: `1px solid ${eng.available ? GREEN : RED}44`,
                          borderRadius: 3,
                          padding: "1px 5px",
                          letterSpacing: 1,
                          flexShrink: 0,
                        }}
                      >
                        {eng.available ? "OK" : "MISSING"}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Avg doc length note */}
              {ft.avg_len > 0 && (
                <div
                  style={{
                    padding: "8px 14px 4px",
                    fontSize: 9,
                    color: S.text,
                    letterSpacing: 1,
                  }}
                >
                  avg doc length: {ft.avg_len?.toLocaleString()} chars
                  {ft.total_chars > 0 && (
                    <span> · total: {(ft.total_chars / 1_000_000).toFixed(2)}M chars</span>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "7px 14px",
            borderTop: `1px solid ${S.border}`,
            fontSize: 9,
            color: SKY_DIM,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          ◎ polls every 2 min · engines loaded once per open
        </div>
      </div>
    </>
  );
}
