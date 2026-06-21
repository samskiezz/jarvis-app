import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const RED = "#FF3B3B";
const ORANGE = "#FF8C00";
const POLL_MS = 20_000;
const TOAST_TTL = 12_000;
const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function severityLabel(sev) {
  if (sev >= 90) return { label: "CRITICAL", color: RED };
  if (sev >= 70) return { label: "HIGH", color: ORANGE };
  if (sev >= 40) return { label: "MEDIUM", color: "#FFD700" };
  return { label: "LOW", color: CY };
}

function Toast({ alert, onDismiss }) {
  const { label, color } = severityLabel(alert.payload?.severity ?? 50);
  const name = alert.payload?.name || `Alert #${alert.id}`;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      background: "rgba(7,12,20,0.96)", border: `1px solid ${color}55`,
      borderLeft: `3px solid ${color}`, borderRadius: 10,
      padding: "10px 14px", marginBottom: 8,
      boxShadow: `0 0 30px ${color}18`, maxWidth: 360,
      fontFamily: "'JetBrains Mono', monospace", animation: "jslide 0.25s ease-out",
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%", background: color,
        boxShadow: `0 0 10px ${color}`, marginTop: 4, flexShrink: 0,
        animation: label === "CRITICAL" ? "jpulse 1s ease-in-out infinite" : "none",
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 9, letterSpacing: 1.5, color, textTransform: "uppercase", fontWeight: 700 }}>
            {label}
          </span>
          <span style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 0.5 }}>ALERT</span>
        </div>
        <div style={{ fontSize: 12, color: "#DCEBF5", lineHeight: 1.4, wordBreak: "break-word" }}>{name}</div>
        {alert.payload?.target && (
          <div style={{ fontSize: 10, color: "#6E8AA0", marginTop: 3 }}>target: {alert.payload.target}</div>
        )}
      </div>
      <button onClick={onDismiss} style={{
        background: "none", border: "none", cursor: "pointer",
        color: "#6E8AA0", fontSize: 14, lineHeight: 1, padding: "0 0 0 6px", flexShrink: 0,
      }}>×</button>
    </div>
  );
}

export default function AlertToasts() {
  const [toasts, setToasts] = useState([]);
  const seenIds = useRef(new Set());
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id]);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const announceVoice = useCallback(async (alert) => {
    const name = alert.payload?.name || `alert ${alert.id}`;
    const { label } = severityLabel(alert.payload?.severity ?? 50);
    const script = `Sir, ${label.toLowerCase()} alert: ${name}.`;
    try {
      const r = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: script }),
      });
      if (!r.ok) return;
      const url = URL.createObjectURL(await r.blob());
      const a = new Audio(url);
      a.onended = () => URL.revokeObjectURL(url);
      a.play().catch(() => {});
    } catch (_) {}
  }, []);

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase()}/v1/alerts?status=open`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) return;
      const data = await r.json();
      const alerts = Array.isArray(data) ? data : (data.items || data.alerts || []);
      const newCriticals = alerts.filter((a) => {
        if (seenIds.current.has(a.id)) return false;
        seenIds.current.add(a.id);
        const sev = a.payload?.severity ?? 50;
        return sev >= 70;
      });
      if (newCriticals.length === 0) return;
      setToasts((prev) => [...newCriticals, ...prev].slice(0, 6));
      newCriticals.forEach((a) => {
        const sev = a.payload?.severity ?? 50;
        if (sev >= 90) announceVoice(a);
        timers.current[a.id] = setTimeout(() => dismiss(a.id), TOAST_TTL);
      });
    } catch (_) {}
  }, [announceVoice, dismiss]);

  useEffect(() => {
    poll();
    const iv = setInterval(poll, POLL_MS);
    return () => clearInterval(iv);
  }, [poll]);

  if (toasts.length === 0) return (
    <style>{`
      @keyframes jslide{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}}
      @keyframes jpulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.5}}
    `}</style>
  );

  return (
    <>
      <style>{`
        @keyframes jslide{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}}
        @keyframes jpulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.5}}
      `}</style>
      <div style={{
        position: "fixed", top: 14, right: 14, zIndex: 300,
        display: "flex", flexDirection: "column", alignItems: "flex-end",
      }}>
        {toasts.map((a) => (
          <Toast key={a.id} alert={a} onDismiss={() => dismiss(a.id)} />
        ))}
      </div>
    </>
  );
}
