/**
 * ContactsDirectoryDrawer — slide-in right-edge drawer listing contacts
 * from GET /entities/Contact, polling every 2 min while open.
 *
 * Tab sits at 50 % from top (right edge, between PipelineRunsDrawer 35 %
 * and DecisionLedgerPanel 65 %).
 * Mounted in src/Layout.jsx after SwarmJobsDrawer.
 *
 * Endpoint: GET /entities/Contact
 * → array | { items | contacts | data | results: [...] }
 *   each contact: { id, name|full_name|display_name, type|kind|role,
 *                   email|email_address, organization|org|company,
 *                   created_at|updated_at }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS  = 120_000;
const DRAWER_W = 320;
const CY   = "#29E7FF";
const VIO  = "#a855f7";
const GREY = "#4e6070";

const TYPE_COLORS = {
  PERSON: CY,
  ORG:    VIO,
  ORGANISATION: VIO,
  ORGANIZATION: VIO,
  COMPANY: VIO,
  TEAM:   "#FFB340",
};

function typeMeta(raw = "") {
  const key = raw.toUpperCase().slice(0, 12);
  return { label: key || "CONTACT", color: TYPE_COLORS[key] ?? GREY };
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
  if (Array.isArray(raw))               return raw;
  if (Array.isArray(raw.items))         return raw.items;
  if (Array.isArray(raw.contacts))      return raw.contacts;
  if (Array.isArray(raw.data))          return raw.data;
  if (Array.isArray(raw.results))       return raw.results;
  return [];
}

export default function ContactsDirectoryDrawer() {
  const [open,     setOpen]  = useState(false);
  const [contacts, setContacts] = useState(null);
  const [err,      setErr]   = useState(false);
  const [query,    setQuery] = useState("");
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/entities/Contact")
      .then((raw) => {
        if (alive) { setContacts(normalise(raw)); setErr(false); }
      })
      .catch(() => {
        if (alive) setErr(true);
      });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timerRef.current); };
  }, [open, tick]);

  const items = contacts ?? [];
  const filtered = query.trim()
    ? items.filter((c) => {
        const name  = (c.name ?? c.full_name ?? c.display_name ?? "").toLowerCase();
        const email = (c.email ?? c.email_address ?? "").toLowerCase();
        const org   = (c.organization ?? c.org ?? c.company ?? "").toLowerCase();
        const q = query.toLowerCase();
        return name.includes(q) || email.includes(q) || org.includes(q);
      })
    : items;

  return (
    <>
      {/* Fixed toggle tab — right edge, 50 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close contacts" : "Open contacts directory"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${CY}55`,
          borderRight: open ? "none" : `1px solid ${CY}55`,
          color: CY,
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
        {open ? "CONTACTS ▶" : "◀ CONTACTS"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8993,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${CY}33`,
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
          <span style={{ fontSize: S.fs.xs, color: CY, letterSpacing: 2, flex: 1 }}>
            CONTACTS
          </span>
          {contacts !== null && (
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
              onChange={(e) => setQuery(e.target.value)}
              placeholder="filter…"
              style={{
                width: "100%",
                background: "transparent",
                border: `1px solid ${CY}33`,
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
          ) : contacts === null ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              {query ? "NO MATCH" : "NO CONTACTS"}
            </div>
          ) : (
            filtered.map((c, idx) => {
              const name  = c.name ?? c.full_name ?? c.display_name ?? `Contact #${idx + 1}`;
              const email = c.email ?? c.email_address;
              const org   = c.organization ?? c.org ?? c.company;
              const age   = relTime(c.updated_at ?? c.created_at);
              const tm    = typeMeta(c.type ?? c.kind ?? c.role ?? "");

              return (
                <div
                  key={c.id ?? idx}
                  style={{
                    padding: "8px 14px",
                    borderBottom: `1px solid ${S.border}`,
                    borderLeft: `3px solid ${tm.color}`,
                  }}
                >
                  {/* name + type badge */}
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
                    <span
                      style={{
                        fontSize: S.fs.xxs,
                        color: tm.color,
                        border: `1px solid ${tm.color}55`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        letterSpacing: 1,
                        flexShrink: 0,
                      }}
                    >
                      {tm.label}
                    </span>
                  </div>

                  {/* email / org / age */}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      fontSize: S.fs.xxs,
                      color: GREY,
                      marginTop: 3,
                      letterSpacing: 0.5,
                    }}
                  >
                    {email && (
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 160,
                        }}
                      >
                        {email}
                      </span>
                    )}
                    {org && (
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 140,
                          color: VIO,
                        }}
                      >
                        {org}
                      </span>
                    )}
                    <span style={{ marginLeft: "auto" }}>{age}</span>
                  </div>
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
          {contacts !== null
            ? `${filtered.length}${query ? `/${items.length}` : ""} CONTACT${filtered.length !== 1 ? "S" : ""} · 2 MIN POLL`
            : err
            ? "ERR"
            : "…"}
        </div>
      </div>
    </>
  );
}
