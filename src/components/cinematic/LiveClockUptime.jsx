import { useEffect, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

/**
 * F21 — Live clock + real process uptime from /v1/jarvis/system/status.
 * Clock ticks every second; uptime polls every 30 s.
 * Mounted in App.jsx; shown as a small display at bottom-left.
 */

const CY = "#29E7FF";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

export function isClockQuery(q) {
  return /\b(clock|time|uptime|how long|running for|system time|what time)\b/i.test(q || "");
}

function formatUptime(seconds) {
  if (seconds == null || isNaN(seconds)) return null;
  const s = Math.floor(parseFloat(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

function dig(obj, ...paths) {
  for (const path of paths) {
    let cur = obj;
    for (const k of path.split(".")) {
      if (cur == null) break;
      cur = cur[k];
    }
    if (cur != null) return cur;
  }
  return undefined;
}

export async function buildClockScript() {
  const headers = { Authorization: `Bearer ${API_KEY}` };
  try {
    const r = await fetch(`${apiBase()}/v1/jarvis/system/status`, { headers });
    const d = r.ok ? await r.json() : null;
    const uptime = dig(d, "uptime", "process_uptime", "system.uptime", "system_uptime");
    const uptimeStr = formatUptime(uptime);
    const now = new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    if (uptimeStr) {
      return `Current time is ${now}. Systems have been online for ${uptimeStr}, sir.`;
    }
    return `Current time is ${now}, sir.`;
  } catch (_) {
    const now = new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    return `Current time is ${now}, sir.`;
  }
}

export default function LiveClockUptime() {
  const [now, setNow] = useState(new Date());
  const [uptime, setUptime] = useState(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  async function fetchUptime() {
    try {
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const r = await fetch(`${apiBase()}/v1/jarvis/system/status`, { headers });
      if (!r.ok) return;
      const d = await r.json();
      const u = dig(d, "uptime", "process_uptime", "system.uptime", "system_uptime");
      if (u != null) setUptime(parseFloat(u));
    } catch (_) {}
  }

  useEffect(() => {
    fetchUptime();
    const id = setInterval(fetchUptime, 30_000);
    return () => clearInterval(id);
  }, []);

  const timeStr = now.toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const uptimeStr = formatUptime(uptime);

  return (
    <div
      style={{
        position: "fixed", left: 18, bottom: 18, zIndex: 68,
        background: "rgba(5,8,13,0.7)",
        border: `1px solid #29E7FF33`,
        borderRadius: 4, padding: "4px 10px",
        fontFamily: "'JetBrains Mono',monospace",
        backdropFilter: "blur(6px)",
        display: "flex", flexDirection: "column", alignItems: "flex-start",
        lineHeight: 1.4, pointerEvents: "none",
      }}
    >
      <span style={{
        fontSize: 12, color: CY, letterSpacing: 2,
        fontVariantNumeric: "tabular-nums",
      }}>
        {timeStr}
      </span>
      {uptimeStr && (
        <span style={{
          fontSize: 9, color: "#29E7FF77", letterSpacing: 1,
          textTransform: "uppercase",
        }}>
          UP {uptimeStr}
        </span>
      )}
    </div>
  );
}
