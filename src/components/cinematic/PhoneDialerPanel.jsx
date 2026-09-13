/**
 * PhoneDialerPanel — F284.
 *
 * Phone & SMS control surface wired to the Jarvis phone provider backend.
 *
 * Data sources (all real — endpoints in /v1/phone):
 *   GET  /v1/phone/status          (poll 60 s)
 *        → { provider, dial_capable, sms_capable, number, status, hint? }
 *   POST /v1/phone/dial            → { ok, call_sid?, error? }
 *        body: { number, message? }
 *   POST /v1/phone/sms             → { ok, sid?, error? }
 *        body: { number, text }
 *
 * Displays:
 *   - Stat tiles: provider / dial-capable / sms-capable / status
 *   - STATUS | DIAL | SMS tab switcher
 *   - STATUS: raw provider fields + hint text
 *   - DIAL: number input + optional TwiML/text message → POST /v1/phone/dial → result block
 *   - SMS: number input + text body → POST /v1/phone/sms → result block
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence phone brief + TTS
 *
 * Toggle: ☎ PHON at left:315360, bottom:8, zIndex:162.
 * Badge: green=provider active, amber=mock/fallback, dim=unavailable.
 *
 * Exported helpers for JarvisBrain:
 *   isPhonQuery(q) / buildPhonScript()
 *
 * Voice triggers: "phone / dial / sms / phone control / dialer / outbound call /
 *   send sms / phone panel / text message / phon / phone status /
 *   call control / phone provider"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AM  = "#F5A623";
const GN  = "#4ADE80";
const RD  = "#F87171";
const DIM = "#3A4A55";
const GRAY = "#4E6070";

const BTN_LEFT = 315360;
const POLL_MS  = 60_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const PHON_RE =
  /\b(phone|dial\b|sms\b|phone\s+control|dialer|outbound\s+call|send\s+sms|phone\s+panel|text\s+message|phon\b|phone\s+status|call\s+control|phone\s+provider)\b/i;

export function isPhonQuery(q) {
  return PHON_RE.test(q || "");
}

export async function buildPhonScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/phone/status`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    window.dispatchEvent(new CustomEvent("jarvis:phon-toggle"));
    const prov = d?.provider ?? "unknown";
    const dial = d?.dial_capable ? "dial-capable" : "dial-unavailable";
    const sms  = d?.sms_capable  ? "SMS-capable"  : "SMS-unavailable";
    const st   = d?.status ?? "unknown";
    return (
      `Phone provider: ${prov} (${st}), ${dial}, ${sms}. ` +
      (d?.number ? `Outbound number: ${d.number}. ` : "") +
      (d?.hint ? d.hint : "Open the Phone Dialer Panel to send calls or SMS.")
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:phon-toggle"));
    return "Phone Dialer Panel open, sir.";
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function hdr() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

function badgeColor(d) {
  if (!d) return DIM;
  const st = (d.status ?? "").toLowerCase();
  if (st === "active" || st === "ok" || st === "ready") return GN;
  if (st === "mock" || st === "fallback" || st === "degraded") return AM;
  return RD;
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
        minWidth: 56,
      }}
    >
      <div style={{ color, fontSize: 15, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div
        style={{
          color: GRAY,
          fontSize: 9,
          marginTop: 3,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
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
        padding: "3px 10px",
      }}
    >
      {label}
    </button>
  );
}

function ResultBlock({ result }) {
  if (!result) return null;
  const ok = result.ok === true;
  const color = ok ? GN : RD;
  return (
    <div
      style={{
        marginTop: 8,
        background: `${color}11`,
        border: `1px solid ${color}44`,
        borderRadius: 4,
        padding: "8px 10px",
        fontSize: 11,
        color,
        fontFamily: "monospace",
      }}
    >
      {ok ? "✓ " : "✗ "}
      {ok
        ? result.call_sid ?? result.sid ?? "sent"
        : result.error ?? result.detail ?? "failed"}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function PhoneDialerPanel() {
  const [open, setOpen]   = useState(false);
  const [status, setStatus] = useState(null);
  const [tab, setTab]     = useState("STATUS");
  const [tick, setTick]   = useState(0);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");

  // DIAL form
  const [dialNumber, setDialNumber] = useState("");
  const [dialMsg, setDialMsg]       = useState("");
  const [dialBusy, setDialBusy]     = useState(false);
  const [dialResult, setDialResult] = useState(null);

  // SMS form
  const [smsNumber, setSmsNumber]   = useState("");
  const [smsText, setSmsText]       = useState("");
  const [smsBusy, setSmsBusy]       = useState(false);
  const [smsResult, setSmsResult]   = useState(null);

  const timerRef = useRef(null);

  // Poll status
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch(`${apiBase()}/v1/phone/status`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => { if (alive) setStatus(d); })
      .catch(() => {});
    timerRef.current = setTimeout(() => { if (alive) setTick((n) => n + 1); }, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [open, tick]);

  // Toggle listener
  useEffect(() => {
    const fn = () => setOpen((v) => !v);
    window.addEventListener("jarvis:phon-toggle", fn);
    return () => window.removeEventListener("jarvis:phon-toggle", fn);
  }, []);

  const handleDial = useCallback(async () => {
    if (!dialNumber.trim()) return;
    setDialBusy(true);
    setDialResult(null);
    try {
      const r = await fetch(`${apiBase()}/v1/phone/dial`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ number: dialNumber.trim(), message: dialMsg.trim() || undefined }),
      });
      setDialResult(await r.json());
    } catch {
      setDialResult({ ok: false, error: "network error" });
    } finally {
      setDialBusy(false);
    }
  }, [dialNumber, dialMsg]);

  const handleSms = useCallback(async () => {
    if (!smsNumber.trim() || !smsText.trim()) return;
    setSmsBusy(true);
    setSmsResult(null);
    try {
      const r = await fetch(`${apiBase()}/v1/phone/sms`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ number: smsNumber.trim(), text: smsText.trim() }),
      });
      setSmsResult(await r.json());
    } catch {
      setSmsResult({ ok: false, error: "network error" });
    } finally {
      setSmsBusy(false);
    }
  }, [smsNumber, smsText]);

  const handleAssess = useCallback(async () => {
    setAssessing(true);
    setAssessText("");
    try {
      const ctx = status
        ? `Phone provider: ${status.provider ?? "?"}, status: ${status.status ?? "?"}, dial: ${status.dial_capable}, sms: ${status.sms_capable}.`
        : "Phone status unknown.";
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({
          message: `${ctx} Give a 2-sentence assessment of the phone/SMS capability and any issues.`,
        }),
      });
      const d = await r.json();
      const txt = d?.response ?? d?.message ?? d?.text ?? "";
      setAssessText(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessText("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [status]);

  const bc = badgeColor(status);
  const provLabel = status?.provider ?? (status ? "?" : "—");
  const dialCap   = status?.dial_capable ? "YES" : (status ? "NO" : "—");
  const smsCap    = status?.sms_capable  ? "YES" : (status ? "NO" : "—");
  const stLabel   = status?.status ?? (status ? "?" : "—");

  const PANEL_W = 360;

  return (
    <>
      {/* ── dock button ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Phone Dialer Panel (F284)"
        style={{
          position: "fixed",
          left:   BTN_LEFT,
          bottom: 8,
          zIndex: 162,
          background:  open ? `${CY}22` : "rgba(10,18,28,0.88)",
          border:      `1px solid ${open ? CY : "#1E3040"}`,
          borderRadius: 4,
          color:  open ? CY : "#3A6070",
          cursor: "pointer",
          fontFamily: "monospace",
          fontSize: 9,
          letterSpacing: "0.08em",
          padding: "4px 7px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          whiteSpace: "nowrap",
          userSelect: "none",
          transition: "border-color 0.15s, color 0.15s, background 0.15s",
        }}
      >
        <span style={{ fontSize: 13 }}>☎</span>
        <span>PHON</span>
        {/* badge */}
        <span
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            background: bc,
            borderRadius: "50%",
            width: 8,
            height: 8,
            border: "1px solid #0A121C",
          }}
        />
      </button>

      {/* ── panel ── */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: BTN_LEFT - PANEL_W + 40,
            bottom: 36,
            width: PANEL_W,
            zIndex: 900,
            background: "rgba(4,10,20,0.97)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: `1px solid ${CY}33`,
            borderRadius: 8,
            fontFamily: "monospace",
            fontSize: 11,
            color: "#ADC1CD",
            display: "flex",
            flexDirection: "column",
            maxHeight: 520,
            boxShadow: `0 0 24px ${CY}18`,
          }}
        >
          {/* header */}
          <div
            style={{
              padding: "10px 14px 8px",
              borderBottom: `1px solid ${CY}22`,
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span style={{ color: CY, letterSpacing: 2, fontWeight: 700, fontSize: 11 }}>
              ☎ PHONE DIALER
            </span>
            <span
              style={{
                marginLeft: "auto",
                background: `${bc}22`,
                color: bc,
                border: `1px solid ${bc}44`,
                borderRadius: 3,
                padding: "1px 6px",
                fontSize: 9,
                letterSpacing: 1,
              }}
            >
              {stLabel.toUpperCase()}
            </span>
            <button
              onClick={() => setTick((n) => n + 1)}
              title="Refresh"
              style={{
                background: "transparent",
                border: `1px solid ${CY}33`,
                borderRadius: 3,
                color: CY,
                cursor: "pointer",
                fontSize: 10,
                padding: "1px 5px",
                fontFamily: "inherit",
              }}
            >
              ↺
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: GRAY,
                cursor: "pointer",
                fontSize: 13,
                lineHeight: 1,
                padding: "0 2px",
              }}
            >
              ×
            </button>
          </div>

          {/* stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "8px 12px",
              flexShrink: 0,
              borderBottom: `1px solid ${CY}11`,
            }}
          >
            <StatTile label="Provider"  value={provLabel} color={CY} />
            <StatTile label="Dial"      value={dialCap}   color={dialCap === "YES" ? GN : (status ? RD : DIM)} />
            <StatTile label="SMS"       value={smsCap}    color={smsCap  === "YES" ? GN : (status ? RD : DIM)} />
            <StatTile label="Status"    value={stLabel.toUpperCase() || "—"} color={bc} />
          </div>

          {/* tab bar */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "6px 12px",
              flexShrink: 0,
              borderBottom: `1px solid ${CY}11`,
            }}
          >
            {["STATUS", "DIAL", "SMS"].map((t) => (
              <TabBtn key={t} label={t} active={tab === t} onClick={() => setTab(t)} />
            ))}
          </div>

          {/* body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
            {tab === "STATUS" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {!status && (
                  <span style={{ color: GRAY, fontSize: 10 }}>Loading…</span>
                )}
                {status && Object.entries(status).map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "flex-start",
                      borderBottom: `1px solid ${CY}0A`,
                      paddingBottom: 4,
                    }}
                  >
                    <span style={{ color: GRAY, fontSize: 9, letterSpacing: 1, minWidth: 100, textTransform: "uppercase" }}>
                      {k}
                    </span>
                    <span style={{ color: "#ADC1CD", fontSize: 11, wordBreak: "break-all" }}>
                      {String(v)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {tab === "DIAL" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ color: GRAY, fontSize: 9, letterSpacing: 1 }}>
                  NUMBER
                  <input
                    value={dialNumber}
                    onChange={(e) => setDialNumber(e.target.value)}
                    placeholder="+15551234567"
                    style={inputStyle}
                  />
                </label>
                <label style={{ color: GRAY, fontSize: 9, letterSpacing: 1 }}>
                  MESSAGE (optional TwiML/text)
                  <textarea
                    value={dialMsg}
                    onChange={(e) => setDialMsg(e.target.value)}
                    placeholder="Hello, this is Jarvis…"
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </label>
                <button
                  onClick={handleDial}
                  disabled={dialBusy || !dialNumber.trim()}
                  style={actionBtnStyle(dialBusy || !dialNumber.trim(), GN)}
                >
                  {dialBusy ? "DIALLING…" : "▶ DIAL"}
                </button>
                <ResultBlock result={dialResult} />
              </div>
            )}

            {tab === "SMS" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ color: GRAY, fontSize: 9, letterSpacing: 1 }}>
                  NUMBER
                  <input
                    value={smsNumber}
                    onChange={(e) => setSmsNumber(e.target.value)}
                    placeholder="+15551234567"
                    style={inputStyle}
                  />
                </label>
                <label style={{ color: GRAY, fontSize: 9, letterSpacing: 1 }}>
                  MESSAGE TEXT
                  <textarea
                    value={smsText}
                    onChange={(e) => setSmsText(e.target.value)}
                    placeholder="Message body…"
                    rows={4}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                </label>
                <button
                  onClick={handleSms}
                  disabled={smsBusy || !smsNumber.trim() || !smsText.trim()}
                  style={actionBtnStyle(smsBusy || !smsNumber.trim() || !smsText.trim(), CY)}
                >
                  {smsBusy ? "SENDING…" : "▶ SEND SMS"}
                </button>
                <ResultBlock result={smsResult} />
              </div>
            )}
          </div>

          {/* assess footer */}
          <div
            style={{
              borderTop: `1px solid ${CY}11`,
              padding: "7px 12px",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                background: assessing ? "rgba(41,231,255,0.05)" : "rgba(41,231,255,0.08)",
                border: `1px solid ${CY}44`,
                borderRadius: 4,
                color: assessing ? GRAY : CY,
                cursor: assessing ? "wait" : "pointer",
                fontFamily: "monospace",
                fontSize: 10,
                letterSpacing: "0.06em",
                padding: "4px 10px",
                textAlign: "left",
              }}
            >
              {assessing ? "▷ assessing…" : "▶ ASSESS"}
            </button>
            {assessText && (
              <div
                style={{
                  background: `${CY}09`,
                  border: `1px solid ${CY}22`,
                  borderRadius: 4,
                  color: "#ADC1CD",
                  fontSize: 10,
                  lineHeight: 1.5,
                  padding: "6px 8px",
                }}
              >
                {assessText}
              </div>
            )}
            <span style={{ color: "#1E3040", fontSize: 9, letterSpacing: 1 }}>
              GET /v1/phone/status · 60 s poll
            </span>
          </div>
        </div>
      )}
    </>
  );
}

// ─── style helpers ────────────────────────────────────────────────────────────

const inputStyle = {
  display: "block",
  marginTop: 4,
  width: "100%",
  background: "rgba(41,231,255,0.05)",
  border: "1px solid rgba(41,231,255,0.20)",
  borderRadius: 4,
  color: "#ADC1CD",
  fontFamily: "monospace",
  fontSize: 11,
  padding: "5px 8px",
  outline: "none",
  boxSizing: "border-box",
};

function actionBtnStyle(disabled, accent) {
  return {
    background: disabled ? "rgba(41,231,255,0.03)" : `${accent}18`,
    border: `1px solid ${disabled ? "#1E3040" : accent + "66"}`,
    borderRadius: 4,
    color: disabled ? GRAY : accent,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "monospace",
    fontSize: 10,
    letterSpacing: "0.08em",
    padding: "5px 12px",
  };
}
