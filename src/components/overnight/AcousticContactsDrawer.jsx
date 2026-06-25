import { useState, useEffect, useRef } from "react";

const POLL_MS = 180_000;
const ACC = "#65A30D";

function rel(ts) {
  const d = Date.now() / 1000 - ts;
  if (d < 60) return `${Math.round(d)}s ago`;
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  return `${Math.round(d / 3600)}h ago`;
}

export default function AcousticContactsDrawer() {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [model, setModel] = useState("");
  const [err, setErr] = useState(null);
  const timerRef = useRef(null);

  const fetchContacts = async () => {
    try {
      const r = await fetch("/v1/acoustic/contacts?limit=100");
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      setContacts(d.contacts || []);
      setModel(d.model || "");
      setErr(null);
    } catch {
      setErr("FETCH ERROR");
    }
  };

  useEffect(() => {
    if (!open) {
      clearInterval(timerRef.current);
      return;
    }
    fetchContacts();
    timerRef.current = setInterval(fetchContacts, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  return (
    <>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          right: open ? 280 : 0,
          top: "45%",
          zIndex: 200,
          background: "#0a0c10",
          border: `1px solid ${ACC}`,
          borderRight: "none",
          color: ACC,
          padding: "6px 4px",
          cursor: "pointer",
          fontSize: 10,
          fontFamily: "monospace",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transform: "rotate(180deg)",
          userSelect: "none",
          letterSpacing: 1,
          transition: "right 0.2s",
        }}
      >
        ◉ SONAR
      </div>

      {open && (
        <div
          style={{
            position: "fixed",
            right: 0,
            top: 0,
            bottom: 0,
            width: 280,
            zIndex: 199,
            background: "rgba(8,10,14,0.97)",
            border: `1px solid ${ACC}`,
            borderRight: "none",
            display: "flex",
            flexDirection: "column",
            fontFamily: "monospace",
            fontSize: 11,
            overflowY: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              borderBottom: `1px solid ${ACC}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <div>
              <span style={{ color: ACC, fontWeight: 700, letterSpacing: 1 }}>
                ◉ ACOUSTIC CONTACTS
              </span>
              <span style={{ color: "#666", marginLeft: 8 }}>
                {contacts.length} logged
              </span>
            </div>
            <span
              onClick={() => setOpen(false)}
              style={{ cursor: "pointer", color: "#555", fontSize: 13 }}
            >
              ✕
            </span>
          </div>

          {model ? (
            <div
              style={{
                padding: "4px 12px",
                background: "rgba(101,163,13,0.06)",
                fontSize: 9,
                color: "#666",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                flexShrink: 0,
              }}
            >
              {model.length > 48 ? model.slice(0, 45) + "…" : model}
            </div>
          ) : null}

          <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
            {err && (
              <div style={{ color: "#ef4444", padding: "14px 12px" }}>{err}</div>
            )}
            {!err && contacts.length === 0 && (
              <div
                style={{
                  color: "#555",
                  padding: "28px 12px",
                  textAlign: "center",
                  letterSpacing: 1,
                }}
              >
                NO ACOUSTIC CONTACTS
              </div>
            )}
            {contacts.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: "7px 12px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      color: c.label ? "#e2e8f0" : "#555",
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 160,
                    }}
                  >
                    {c.label || "(unlabeled)"}
                  </span>
                  <span style={{ color: "#555", fontSize: 10, flexShrink: 0 }}>
                    {rel(c.ts)}
                  </span>
                </div>

                {c.classification ? (
                  <div style={{ marginTop: 3 }}>
                    <span
                      style={{
                        background: "rgba(101,163,13,0.14)",
                        color: ACC,
                        borderRadius: 3,
                        padding: "1px 5px",
                        fontSize: 9,
                        letterSpacing: 0.4,
                      }}
                    >
                      {c.classification.length > 30
                        ? c.classification.slice(0, 27) + "…"
                        : c.classification}
                    </span>
                  </div>
                ) : null}

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 4,
                    color: "#666",
                    fontSize: 10,
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: "#888" }}>
                    {c.lat != null ? c.lat.toFixed(4) : "—"}°,{" "}
                    {c.lon != null ? c.lon.toFixed(4) : "—"}°
                  </span>
                  {c.confidence != null && (
                    <span
                      style={{
                        color: c.confidence >= 0.7 ? ACC : "#888",
                        fontWeight: c.confidence >= 0.7 ? 700 : 400,
                      }}
                    >
                      {(c.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                  <span
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      padding: "0 4px",
                      borderRadius: 2,
                      color: "#aaa",
                    }}
                  >
                    {c.source || "operator"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              padding: "6px 12px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              color: "#444",
              fontSize: 9,
              flexShrink: 0,
            }}
          >
            polls every 3 min · /v1/acoustic/contacts
          </div>
        </div>
      )}
    </>
  );
}
