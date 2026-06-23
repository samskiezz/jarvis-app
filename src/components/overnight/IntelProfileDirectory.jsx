/**
 * IntelProfileDirectory — left-edge slide-in drawer listing intelligence
 * profiles from GET /entities/IntelProfile, polling every 3 min while open.
 *
 * Tab sits at 24 % from top (left edge, between SourceConnectorsDrawer 20 %
 * and GeoObjectsDrawer 28 %).
 * Mounted in src/Layout.jsx after GeoObjectsDrawer.
 *
 * Endpoint: GET /entities/IntelProfile
 * → array | { items | profiles | data | results: [...] }
 *   each profile: { id, name|title, type|category, risk_level|threat_level,
 *                   summary|description, created_at|updated_at }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS  = 180_000;
const DRAWER_W = 320;
const ACCENT = "#F97316"; // orange — distinctive from existing panels
const GREY   = "#4e6070";

const RISK_COLORS = {
  CRITICAL: "#e8203c",
  HIGH:     "#F97316",
  MEDIUM:   "#FFB340",
  LOW:      "#29E7FF",
  UNKNOWN:  GREY,
};

function riskMeta(raw = "") {
  const key = raw.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8);
  return { label: key || "—", color: RISK_COLORS[key] ?? GREY };
}

function typeMeta(raw = "") {
  const label = (raw || "PROFILE").toUpperCase().slice(0, 12);
  return label;
}

function relTime(ts) {
  if (!ts) return "—";
  const ms   = typeof ts === "number" && ts < 1e12 ? ts * 1000 : ts;
  const diff = Math.floor((Date.now() - Number(ms)) / 1000);
  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function normalise(raw) {
  if (!raw) return [];
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw.items))        return raw.items;
  if (Array.isArray(raw.profiles))     return raw.profiles;
  if (Array.isArray(raw.data))         return raw.data;
  if (Array.isArray(raw.results))      return raw.results;
  return [];
}

export default function IntelProfileDirectory() {
  const [open,     setOpen]    = useState(false);
  const [profiles, setProfiles] = useState(null);
  const [err,      setErr]     = useState(false);
  const [query,    setQuery]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/entities/IntelProfile")
      .then((raw) => {
        if (alive) { setProfiles(normalise(raw)); setErr(false); }
      })
      .catch(() => {
        if (alive) setErr(true);
      });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timerRef.current); };
  }, [open, tick]);

  const items = profiles ?? [];
  const filtered = query.trim()
    ? items.filter((p) => {
        const name    = (p.name ?? p.title ?? "").toLowerCase();
        const type    = (p.type ?? p.category ?? "").toLowerCase();
        const summary = (p.summary ?? p.description ?? "").toLowerCase();
        const q = query.toLowerCase();
        return name.includes(q) || type.includes(q) || summary.includes(q);
      })
    : items;

  return (
    <>
      {/* Fixed toggle tab — left edge, 24 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close intel profiles" : "Open intel profiles directory"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "24%",
          transform: "translateY(-50%)",
          zIndex: 9001,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${ACCENT}55`,
          borderLeft: open ? "none" : `1px solid ${ACCENT}55`,
          color: ACCENT,
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
        {open ? "◀ INTEL" : "INTEL ▶"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8991,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderRight: `1px solid ${ACCENT}33`,
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
          <span style={{ fontSize: S.fs.xs, color: ACCENT, letterSpacing: 2, flex: 1 }}>
            INTEL PROFILES
          </span>
          {profiles !== null && (
            <span style={{ fontSize: S.fs.xxs, color: GREY, letterSpacing: 1 }}>
              {items.length}
            </span>
          )}
        </div>

        {/* Search input */}
        {open && (
          <div style={{ padding: "6px 14px", borderBottom: `1px solid ${S.border}`, flexShrink: 0 }}>
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setExpanded(null); }}
              placeholder="filter by name / type…"
              style={{
                width: "100%",
                background: "transparent",
                border: `1px solid ${ACCENT}33`,
                borderRadius: 3,
                color: S.textHi,
                fontFamily: S.mono,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
                padding: "3px 8px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: "#e8203c", fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : profiles === null ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              {query ? "NO MATCH" : "NO PROFILES"}
            </div>
          ) : (
            filtered.map((p, idx) => {
              const name    = p.name ?? p.title ?? `Profile #${idx + 1}`;
              const type    = typeMeta(p.type ?? p.category ?? "");
              const risk    = riskMeta(p.risk_level ?? p.threat_level ?? "");
              const summary = p.summary ?? p.description ?? "";
              const age     = relTime(p.updated_at ?? p.created_at);
              const isOpen  = expanded === (p.id ?? idx);

              return (
                <div
                  key={p.id ?? idx}
                  onClick={() => setExpanded(isOpen ? null : (p.id ?? idx))}
                  style={{
                    padding: "8px 14px",
                    borderBottom: `1px solid ${S.border}`,
                    borderLeft: `3px solid ${risk.color}`,
                    cursor: "pointer",
                    background: isOpen ? "rgba(249,115,22,0.06)" : "transparent",
                  }}
                >
                  {/* name + risk badge */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        flex: 1,
                        fontSize: S.fs.xs,
                        color: S.textHi,
                        letterSpacing: 0.5,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {name}
                    </span>
                    {risk.label !== "—" && (
                      <span
                        style={{
                          fontSize: S.fs.xxs,
                          color: risk.color,
                          border: `1px solid ${risk.color}55`,
                          borderRadius: 3,
                          padding: "1px 5px",
                          letterSpacing: 1,
                          flexShrink: 0,
                        }}
                      >
                        {risk.label}
                      </span>
                    )}
                  </div>

                  {/* type + age */}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      fontSize: S.fs.xxs,
                      color: GREY,
                      marginTop: 3,
                      letterSpacing: 0.5,
                    }}
                  >
                    <span style={{ color: ACCENT, opacity: 0.7 }}>{type}</span>
                    <span style={{ marginLeft: "auto" }}>{age}</span>
                  </div>

                  {/* expanded summary */}
                  {isOpen && summary && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: S.fs.xxs,
                        color: S.text,
                        lineHeight: 1.5,
                        letterSpacing: 0.3,
                        borderTop: `1px solid ${ACCENT}22`,
                        paddingTop: 6,
                      }}
                    >
                      {summary.slice(0, 300)}{summary.length > 300 ? "…" : ""}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 14px",
            borderTop: `1px solid ${S.border}`,
            fontSize: S.fs.xxs,
            color: S.text,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          {profiles !== null
            ? `${filtered.length}${query ? `/${items.length}` : ""} PROFILE${filtered.length !== 1 ? "S" : ""} · 3 MIN POLL`
            : err
            ? "ERR"
            : "…"}
        </div>
      </div>
    </>
  );
}
