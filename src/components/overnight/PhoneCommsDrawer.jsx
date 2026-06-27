import { useState, useEffect, useRef, useCallback } from "react";

const ACCENT = "#0EA5E9";
const POLL_MS = 5 * 60 * 1000;
const TAB_TOP = "40%";

const BACKEND_COLORS = {
  twilio:   "#38BDF8",
  telnyx:   "#818CF8",
  asterisk: "#A78BFA",
  none:     "#64748B",
};

const BACKEND_LABELS = {
  twilio:   "TWILIO",
  telnyx:   "TELNYX",
  asterisk: "ASTERISK",
  none:     "NONE",
};

function relAge(ts) {
  if (!ts) return "";
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  return `${Math.floor(d / 3600)}h ago`;
}

export default function PhoneCommsDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setFetching(true);
    try {
      const r = await fetch("/v1/phone/status");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setErr(null);
      setFetchedAt(Date.now());
    } catch (e) {
      setErr(e.message);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const backend = data?.backend ?? "none";
  const configured = data?.configured ?? false;
  const candidates = data?.candidates ?? [];
  const bColor = BACKEND_COLORS[backend] ?? BACKEND_COLORS.none;
  const bLabel = BACKEND_LABELS[backend] ?? backend?.toUpperCase() ?? "NONE";

  return (
    <>
      {/* Slide-in tab */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Phone & Comms Status"
        style={{
          position: "fixed",
          right: open ? 280 : 0,
          top: TAB_TOP,
          zIndex: 200,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "#0f172a",
          border: `1px solid ${ACCENT}`,
          borderRight: "none",
          borderRadius: "6px 0 0 6px",
          color: ACCENT,
          fontFamily: "monospace",
          fontSize: 10,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          transition: "right 0.25s ease",
        }}
      >
        ☎ COMMS ▶
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -280,
          top: "20%",
          width: 280,
          maxHeight: "60vh",
          overflowY: "auto",
          background: "#0f172a",
          border: `1px solid ${ACCENT}`,
          borderRight: "none",
          borderRadius: "8px 0 0 8px",
          zIndex: 199,
          transition: "right 0.25s ease",
          fontFamily: "monospace",
          fontSize: 11,
          color: "#cbd5e1",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "10px 12px 8px",
            borderBottom: `1px solid ${ACCENT}33`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span style={{ color: ACCENT, fontWeight: "bold", letterSpacing: 1 }}>
            ☎ PHONE / COMMS
          </span>
          <button
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 13 }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "10px 12px" }}>
          {fetching && !data && (
            <div style={{ color: "#475569", textAlign: "center", padding: "20px 0" }}>
              LOADING…
            </div>
          )}

          {err && (
            <div style={{ color: "#f87171", background: "#1e0a0a", borderRadius: 4, padding: "8px 10px" }}>
              ⚠ {err}
            </div>
          )}

          {data && (
            <>
              {/* Active backend */}
              <div
                style={{
                  background: "#1e293b",
                  borderRadius: 6,
                  padding: "10px 12px",
                  marginBottom: 10,
                  border: `1px solid ${bColor}44`,
                }}
              >
                <div style={{ color: "#94a3b8", fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>
                  ACTIVE BACKEND
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      background: bColor + "22",
                      border: `1px solid ${bColor}`,
                      color: bColor,
                      borderRadius: 4,
                      padding: "2px 8px",
                      fontSize: 11,
                      fontWeight: "bold",
                      letterSpacing: 1,
                    }}
                  >
                    {bLabel}
                  </span>
                  <span
                    style={{
                      background: configured ? "#052e16" : "#1e0a0a",
                      border: `1px solid ${configured ? "#22c55e" : "#ef4444"}`,
                      color: configured ? "#4ade80" : "#f87171",
                      borderRadius: 4,
                      padding: "2px 6px",
                      fontSize: 9,
                      letterSpacing: 1,
                    }}
                  >
                    {configured ? "CONFIGURED" : "NOT CONFIGURED"}
                  </span>
                </div>
              </div>

              {/* Candidates table */}
              {candidates.length > 0 && (
                <div>
                  <div style={{ color: "#475569", fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>
                    BACKEND CANDIDATES
                  </div>
                  {candidates.map((c) => {
                    const cColor = BACKEND_COLORS[c.name] ?? "#64748b";
                    const cLabel = BACKEND_LABELS[c.name] ?? c.name?.toUpperCase();
                    return (
                      <div
                        key={c.name}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "5px 0",
                          borderBottom: "1px solid #1e293b",
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: c.configured ? "#22c55e" : "#374151",
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            color: cColor,
                            fontSize: 10,
                            fontWeight: "bold",
                            letterSpacing: 1,
                            minWidth: 72,
                          }}
                        >
                          {cLabel}
                        </span>
                        <span
                          style={{
                            color: c.configured ? "#4ade80" : "#64748b",
                            fontSize: 9,
                          }}
                        >
                          {c.configured ? "✓ ready" : "— unconfigured"}
                        </span>
                        {c.name === backend && (
                          <span
                            style={{
                              marginLeft: "auto",
                              color: ACCENT,
                              fontSize: 9,
                              letterSpacing: 1,
                            }}
                          >
                            ACTIVE
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Setup note when none configured */}
              {!configured && (
                <div
                  style={{
                    marginTop: 10,
                    padding: "8px 10px",
                    background: "#1c1a0a",
                    border: "1px solid #d9770644",
                    borderRadius: 4,
                    color: "#fbbf24",
                    fontSize: 9,
                    lineHeight: 1.5,
                  }}
                >
                  ⚙ Set TWILIO_SID + TWILIO_AUTH_TOKEN, TELNYX_API_KEY, or ASTERISK_ARI_URL to activate a backend.
                </div>
              )}
            </>
          )}

          {/* Footer */}
          {fetchedAt && (
            <div style={{ color: "#334155", fontSize: 9, marginTop: 10, textAlign: "right" }}>
              polled {relAge(fetchedAt)} · 5 min interval
            </div>
          )}
        </div>
      </div>
    </>
  );
}
