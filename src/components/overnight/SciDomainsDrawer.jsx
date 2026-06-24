/**
 * SciDomainsDrawer — left-edge slide-in drawer showing the underworld science
 * domain consoles from GET /v1/sci/domains.
 *
 * Tab sits at 4 % from top, between GraphCommunitiesView (2 %) and
 * ReportsBrowserDrawer (8 %).
 * Polls domains list every 5 min while open.
 * Clicking a domain row fetches GET /v1/sci/domains/{id}/methods once and
 * expands the method list inline.
 *
 * Accent colour: #22D3EE (cyan-300).
 * Mounted in src/Layout.jsx after GraphCommunitiesView.
 *
 * Real endpoints:
 *   GET /v1/sci/domains          → { domains: [{ id, label, description, methods }] }
 *   GET /v1/sci/domains/{id}/methods  → { id, methods: [{ name, description }] }
 */
import { useEffect, useReducer, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 340;
const ACCENT = "#22D3EE";

function relAge(ts) {
  if (!ts) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function methodCount(domain) {
  if (typeof domain.methods === "number") return domain.methods;
  if (Array.isArray(domain.methods)) return domain.methods.length;
  return null;
}

function DomainRow({ domain }) {
  const [expanded, setExpanded] = useState(false);
  const [methods, setMethods] = useState(null);
  const [loadingMethods, setLoadingMethods] = useState(false);
  const [methodErr, setMethodErr] = useState(false);

  function toggle() {
    if (!expanded && !methods && !loadingMethods) {
      setLoadingMethods(true);
      kimiClient
        .request(`/v1/sci/domains/${domain.id}/methods`)
        .then((d) => {
          const list = Array.isArray(d) ? d : d?.methods ?? d?.results ?? [];
          setMethods(list);
          setLoadingMethods(false);
        })
        .catch(() => {
          setMethodErr(true);
          setLoadingMethods(false);
        });
    }
    setExpanded((v) => !v);
  }

  const count = methodCount(domain);

  return (
    <div style={{ borderBottom: `1px solid ${S.border}` }}>
      <button
        onClick={toggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          width: "100%",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: ACCENT,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            flex: 1,
            fontSize: S.fs.xs,
            color: S.textHi,
            fontFamily: S.mono,
            letterSpacing: 0.5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {domain.label ?? domain.id}
        </span>
        {count != null && (
          <span
            style={{
              fontSize: S.fs.xxs,
              color: ACCENT,
              fontFamily: S.mono,
              letterSpacing: 1,
              background: `${ACCENT}18`,
              border: `1px solid ${ACCENT}44`,
              borderRadius: 3,
              padding: "1px 5px",
              flexShrink: 0,
            }}
          >
            {count}M
          </span>
        )}
        <span
          style={{
            fontSize: S.fs.xxs,
            color: S.text,
            fontFamily: S.mono,
            flexShrink: 0,
          }}
        >
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {domain.description && (
        <div
          style={{
            padding: "0 14px 6px 29px",
            fontSize: S.fs.xxs,
            color: S.text,
            fontFamily: S.mono,
            letterSpacing: 0.3,
            lineHeight: 1.5,
          }}
        >
          {domain.description}
        </div>
      )}

      {expanded && (
        <div
          style={{
            padding: "4px 14px 8px 29px",
          }}
        >
          {loadingMethods ? (
            <div
              style={{
                fontSize: S.fs.xxs,
                color: S.text,
                fontFamily: S.mono,
                letterSpacing: 1,
              }}
            >
              LOADING METHODS…
            </div>
          ) : methodErr ? (
            <div
              style={{
                fontSize: S.fs.xxs,
                color: "#F43F5E",
                fontFamily: S.mono,
                letterSpacing: 1,
              }}
            >
              METHODS UNAVAILABLE
            </div>
          ) : methods && methods.length === 0 ? (
            <div
              style={{
                fontSize: S.fs.xxs,
                color: S.text,
                fontFamily: S.mono,
                letterSpacing: 1,
              }}
            >
              NO METHODS REGISTERED
            </div>
          ) : methods ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {methods.map((m, i) => (
                <div
                  key={m.name ?? i}
                  style={{
                    fontSize: S.fs.xxs,
                    fontFamily: S.mono,
                  }}
                >
                  <span
                    style={{
                      color: ACCENT,
                      letterSpacing: 0.5,
                    }}
                  >
                    {m.name ?? m.method ?? String(m)}
                  </span>
                  {m.description && (
                    <span
                      style={{
                        color: S.text,
                        marginLeft: 6,
                        letterSpacing: 0.3,
                      }}
                    >
                      — {m.description}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function SciDomainsDrawer() {
  const [open, setOpen] = useState(false);
  const [domains, setDomains] = useState(null);
  const [err, setErr] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [tick, bump] = useReducer((n) => n + 1, 0);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/sci/domains")
      .then((d) => {
        if (!alive) return;
        const list = Array.isArray(d)
          ? d
          : d?.domains ?? d?.items ?? d?.results ?? [];
        setDomains(list);
        setErr(false);
        setFetchedAt(Date.now());
      })
      .catch(() => {
        if (alive) setErr(true);
      });

    const timer = setTimeout(() => {
      if (alive) bump();
    }, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, tick]);

  return (
    <>
      {/* Toggle tab — left edge, 4 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close science domains" : "Open science domain consoles"}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "4%",
          zIndex: 9000,
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
        {open ? "SCI ▶" : "SCI ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8995,
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
          <span
            style={{
              fontSize: S.fs.xs,
              color: ACCENT,
              letterSpacing: 2,
              flex: 1,
            }}
          >
            SCIENCE DOMAINS
          </span>
          {domains && (
            <span
              style={{
                fontSize: S.fs.xxs,
                color: `${ACCENT}CC`,
                fontFamily: S.mono,
                letterSpacing: 1,
              }}
            >
              {domains.length} consoles
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {!open ? null : err ? (
            <div
              style={{
                padding: "20px 14px",
                color: "#F43F5E",
                fontSize: S.fs.xs,
                letterSpacing: 1,
              }}
            >
              ENDPOINT UNREACHABLE
            </div>
          ) : !domains ? (
            <div
              style={{
                padding: "20px 14px",
                color: S.text,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              LOADING…
            </div>
          ) : domains.length === 0 ? (
            <div
              style={{
                padding: "20px 14px",
                color: S.text,
                fontSize: S.fs.xxs,
                letterSpacing: 1,
              }}
            >
              NO SCIENCE DOMAINS REGISTERED
            </div>
          ) : (
            domains.map((d) => (
              <DomainRow key={d.id ?? d.label} domain={d} />
            ))
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
          {fetchedAt
            ? `UPDATED ${relAge(fetchedAt)} · 5 MIN POLL`
            : err
            ? "ERR"
            : "…"}
        </div>
      </div>
    </>
  );
}
