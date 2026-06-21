/**
 * AlertBadge — polls GET /v1/alerts every 30 s and shows a red count badge
 * in the top breadcrumb strip. Hides when count is zero. Clicking navigates
 * to the Alerts & Notifications page.
 *
 * Mounted inside the breadcrumb strip div in src/Layout.jsx.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 30_000;

export default function AlertBadge() {
  const navigate = useNavigate();
  const [count, setCount] = useState(null);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    let alive = true;
    kimiClient
      .request("/v1/alerts")
      .then((d) => {
        if (alive) {
          const n = typeof d?.count === "number" ? d.count : (d?.items?.length ?? 0);
          setCount(n);
        }
      })
      .catch(() => {
        if (alive) setCount(null);
      });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [tick]);

  if (!count) return null;

  return (
    <button
      onClick={() => navigate("/apex/AlertsNotificationCenter")}
      title={`${count} open alert${count !== 1 ? "s" : ""} — click to view`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: "0 4px",
        fontFamily: S.mono,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 16,
          height: 14,
          padding: "0 4px",
          borderRadius: 7,
          background: "#e8203c",
          color: "#fff",
          fontSize: S.fs.xxs,
          fontFamily: S.mono,
          letterSpacing: 0.5,
          lineHeight: 1,
          fontWeight: 700,
        }}
      >
        {count > 99 ? "99+" : count}
      </span>
      <span style={{ fontSize: S.fs.xxs, color: "#e8203c", letterSpacing: 1 }}>
        ALERTS
      </span>
    </button>
  );
}
