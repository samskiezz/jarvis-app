import { useState, useEffect, useCallback } from "react";

const ACCENT = "#8B5CF6";
const POLL_MS = 5 * 60_000;

const DRIVER_LABELS = {
  webgazer: "WebGazer (Eye)",
  tobii: "Tobii (Eye HW)",
  web_bluetooth: "Web Bluetooth",
  usb_hid: "USB HID Switch",
  nvda: "NVDA (Screen Reader)",
  voiceover: "VoiceOver",
  dwell: "Dwell Click",
};

export default function A11yDriversPanel() {
  const [open, setOpen] = useState(false);
  const [drivers, setDrivers] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [activating, setActivating] = useState({});
  const [results, setResults] = useState({});

  const fetchDrivers = useCallback(() => {
    setLoading(true);
    fetch("/v1/a11y/drivers")
      .then((r) => r.json())
      .then((d) => { setDrivers(d); setErr(null); })
      .catch((e) => setErr(e.message || "fetch error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchDrivers();
    const id = setInterval(fetchDrivers, POLL_MS);
    return () => clearInterval(id);
  }, [open, fetchDrivers]);

  const activate = useCallback((name) => {
    setActivating((v) => ({ ...v, [name]: true }));
    fetch(`/v1/a11y/drivers/${name}/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then((r) => r.json())
      .then((d) => setResults((v) => ({ ...v, [name]: d })))
      .catch((e) => setResults((v) => ({ ...v, [name]: { ok: false, reason: e.message } })))
      .finally(() => setActivating((v) => ({ ...v, [name]: false })));
  }, []);

  const driverMap = drivers?.drivers || (drivers && typeof drivers === "object" && !Array.isArray(drivers) ? drivers : {});
  const driverEntries = Object.entries(driverMap);
  const okCount = driverEntries.filter(([, v]) => v?.ok).length;

  const tab = {
    position: "fixed",
    left: open ? 340 : 0,
    top: "78%",
    transform: "translateY(-50%)",
    zIndex: 180,
    background: "#0f172a",
    border: `1px solid ${ACCENT}`,
    borderLeft: open ? "none" : `1px solid ${ACCENT}`,
    color: ACCENT,
    fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
    fontSize: 11,
    letterSpacing: 1,
    padding: "10px 6px",
    cursor: "pointer",
    writingMode: "vertical-rl",
    textOrientation: "mixed",
    userSelect: "none",
    transition: "left 0.2s",
    borderRadius: open ? "0 4px 4px 0" : "4px",
  };

  const panel = {
    position: "fixed",
    left: 0,
    top: "78%",
    transform: "translateY(-50%)",
    width: 340,
    maxHeight: "60vh",
    overflowY: "auto",
    background: "#0b1120",
    border: `1px solid ${ACCENT}`,
    borderRight: "none",
    zIndex: 179,
    fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
    fontSize: 11,
    color: "#94a3b8",
    display: open ? "flex" : "none",
    flexDirection: "column",
  };

  return (
    <>
      <button style={tab} onClick={() => setOpen((v) => !v)} title="Accessibility Drivers">
        {open ? "◀" : "◉"} A11Y
      </button>

      <div style={panel}>
        <div style={{
          padding: "10px 12px 8px",
          borderBottom: "1px solid rgba(148,163,184,0.12)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
          position: "sticky",
          top: 0,
          background: "#0b1120",
          zIndex: 1,
        }}>
          <span style={{ color: "#e2e8f0", letterSpacing: 1, fontWeight: 700 }}>A11Y DRIVERS</span>
          {loading && <span style={{ opacity: 0.5, fontSize: 10 }}>updating…</span>}
          <div style={{ flex: 1 }} />
          {driverEntries.length > 0 && (
            <span style={{
              background: "rgba(139,92,246,0.15)",
              color: ACCENT,
              border: `1px solid ${ACCENT}`,
              borderRadius: 3,
              fontSize: 10,
              padding: "1px 5px",
              letterSpacing: 1,
            }}>{okCount}/{driverEntries.length} OK</span>
          )}
        </div>

        {err && (
          <div style={{ padding: "10px 12px", color: "#F87171", fontSize: 10 }}>⚠ {err}</div>
        )}

        {!drivers && !err && !loading && (
          <div style={{ padding: "10px 12px", opacity: 0.4 }}>Fetching…</div>
        )}

        {driverEntries.length > 0 && (
          <div style={{ padding: "8px 0", display: "flex", flexDirection: "column" }}>
            {driverEntries.map(([name, info]) => {
              const ok = info?.ok;
              const res = results[name];
              return (
                <div key={name} style={{
                  padding: "8px 12px",
                  borderBottom: "1px solid rgba(148,163,184,0.07)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: ok ? "#4ADE80" : "#475569",
                      flexShrink: 0,
                    }} />
                    <span style={{ flex: 1, color: "#cbd5e1", letterSpacing: 0.5 }}>
                      {DRIVER_LABELS[name] || name}
                    </span>
                    <span style={{
                      background: ok ? "rgba(74,222,128,0.15)" : "rgba(71,85,105,0.3)",
                      color: ok ? "#4ADE80" : "#64748b",
                      border: `1px solid ${ok ? "#4ADE80" : "#334155"}`,
                      borderRadius: 3,
                      fontSize: 10,
                      padding: "1px 5px",
                      letterSpacing: 1,
                    }}>{ok ? "OK" : "UNAVAIL"}</span>
                    <button
                      onClick={() => activate(name)}
                      disabled={!!activating[name]}
                      style={{
                        background: "transparent",
                        border: `1px solid ${ACCENT}`,
                        color: ACCENT,
                        borderRadius: 3,
                        fontSize: 10,
                        padding: "1px 6px",
                        cursor: activating[name] ? "wait" : "pointer",
                        letterSpacing: 0.5,
                        opacity: activating[name] ? 0.5 : 1,
                        fontFamily: "inherit",
                      }}
                    >{activating[name] ? "…" : "ACTIVATE"}</button>
                  </div>
                  {info?.reason && (
                    <div style={{ fontSize: 10, color: "#64748b", paddingLeft: 16 }}>
                      {info.reason}
                    </div>
                  )}
                  {res && (
                    <div style={{ fontSize: 10, paddingLeft: 16, color: res.ok ? "#4ADE80" : "#F87171" }}>
                      → {res.ok ? "activated" : (res.reason || res.detail || "failed")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {drivers && driverEntries.length === 0 && (
          <div style={{ padding: "10px 12px", opacity: 0.4 }}>NO DRIVERS FOUND</div>
        )}

        <div style={{
          padding: "6px 12px",
          borderTop: "1px solid rgba(148,163,184,0.08)",
          fontSize: 10,
          color: "#475569",
          flexShrink: 0,
        }}>
          GET /v1/a11y/drivers · {POLL_MS / 60000}m poll · POST …/activate
        </div>
      </div>
    </>
  );
}
