/**
 * TenantRegistryDrawer — Feature 119
 * Right-edge slide-in drawer at 88 % from top listing all registered JARVIS
 * tenants from GET /v1/tenants. Also fetches GET /v1/tenants/whoami once on
 * open to highlight the active tenant + show current principal/role in header.
 * Polls tenant list every 3 min while open.
 *
 * Endpoints:
 *   GET /v1/tenants → { items: [{ id, name, plan, created_ts, settings }], count }
 *   GET /v1/tenants/whoami → { tenant_id, tenant, principal, role, authenticated }
 *
 * Plan badge colours: free=slate, pro=sky, enterprise=violet, custom=amber.
 * Accent: teal (#14B8A6).
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 180_000;
const DRAWER_W = 340;
const TEAL = "#14B8A6";
const SKY = "#38BDF8";
const VIOLET = "#A78BFA";
const AMBER = "#F59E0B";
const SLATE = "#94A3B8";
const GREEN = "#22C55E";

function planColor(plan) {
  const p = (plan || "free").toLowerCase();
  if (p === "pro") return SKY;
  if (p === "enterprise") return VIOLET;
  if (p === "custom") return AMBER;
  return SLATE;
}

function relAge(ts) {
  if (!ts) return "";
  const ms = ts > 1e12 ? ts : ts * 1000;
  const diff = Math.max(0, Date.now() - ms);
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function TenantRegistryDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [whoami, setWhoami] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/tenants")
      .then((d) => {
        if (alive) { setData(d); setErr(false); }
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

  useEffect(() => {
    if (!open || whoami) return;
    let alive = true;
    kimiClient
      .request("/v1/tenants/whoami")
      .then((d) => { if (alive) setWhoami(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [open]);

  const tenants = data?.items ?? [];
  const activeTenantId = whoami?.tenant_id;

  return (
    <>
      {/* Fixed toggle tab — right edge, 88 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close tenant registry" : "Open tenant registry"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "88%",
          transform: "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${TEAL}55`,
          borderRight: open ? "none" : `1px solid ${TEAL}55`,
          color: TEAL,
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: "4px 0 0 4px",
          transition: "right 0.2s ease",
          userSelect: "none",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {open ? "TENANTS ▶" : "TENANTS ◀"}
        {!open && tenants.length > 0 && (
          <span
            style={{
              background: TEAL,
              color: "#000",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {tenants.length}
          </span>
        )}
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
          borderLeft: `1px solid ${TEAL}33`,
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
            flexDirection: "column",
            gap: 6,
            padding: "10px 14px",
            borderBottom: `1px solid ${S.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: S.fs.xs, color: TEAL, letterSpacing: 2, flex: 1 }}>
              TENANT REGISTRY
            </span>
            {data && (
              <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
                {data.count ?? tenants.length} total
              </span>
            )}
          </div>
          {whoami && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: S.fs.xxs,
                color: S.text,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: GREEN,
                  flexShrink: 0,
                }}
              />
              <span style={{ color: GREEN, letterSpacing: 1 }}>
                {whoami.tenant?.name ?? whoami.tenant_id}
              </span>
              {whoami.role && (
                <span
                  style={{
                    fontSize: 9,
                    color: `${TEAL}bb`,
                    border: `1px solid ${TEAL}33`,
                    borderRadius: 3,
                    padding: "0px 4px",
                    letterSpacing: 0.5,
                  }}
                >
                  {whoami.role.toUpperCase()}
                </span>
              )}
              {whoami.principal && whoami.principal !== "anonymous" && (
                <span style={{ color: `${S.text}88`, marginLeft: "auto", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {String(whoami.principal).slice(0, 20)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: TEAL, fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : tenants.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO TENANTS REGISTERED
            </div>
          ) : (
            tenants.map((t) => {
              const isActive = t.id === activeTenantId;
              const pColor = planColor(t.plan);
              const age = relAge(t.created_ts);
              return (
                <div
                  key={t.id}
                  style={{
                    padding: "9px 14px",
                    borderBottom: `1px solid ${isActive ? TEAL + "44" : S.border}`,
                    background: isActive ? `${TEAL}0a` : "transparent",
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                  }}
                >
                  {/* Name row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {isActive && (
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: GREEN,
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span
                      style={{
                        color: isActive ? GREEN : "#DCEBF5",
                        fontSize: S.fs.xs,
                        letterSpacing: 0.5,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {t.name || t.id}
                    </span>
                    {/* Plan badge */}
                    <span
                      style={{
                        fontSize: 9,
                        color: pColor,
                        border: `1px solid ${pColor}55`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        letterSpacing: 1,
                        flexShrink: 0,
                        textTransform: "uppercase",
                      }}
                    >
                      {t.plan || "free"}
                    </span>
                  </div>

                  {/* ID chip + age */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 9,
                        color: `${TEAL}bb`,
                        border: `1px solid ${TEAL}33`,
                        borderRadius: 3,
                        padding: "0px 4px",
                        letterSpacing: 0.5,
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.id}
                    </span>
                    {age && (
                      <span style={{ fontSize: 9, color: `${S.text}88`, letterSpacing: 0.5, marginLeft: "auto" }}>
                        {age}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "8px 14px",
            borderTop: `1px solid ${S.border}`,
            fontSize: 9,
            color: `${S.text}66`,
            letterSpacing: 0.5,
            flexShrink: 0,
          }}
        >
          GET /v1/tenants · 3-min poll · whoami on open
        </div>
      </div>
    </>
  );
}
