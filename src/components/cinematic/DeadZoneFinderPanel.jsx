/**
 * DeadZoneFinderPanel — F285.
 *
 * Cleanup intelligence — scans the repo and inventory for stale, duplicate,
 * broken, or unused features and surfaces actionable findings.
 *
 * Data sources (all real — endpoints in /v1/deadzone):
 *   GET  /v1/deadzone/scan?limit=100   (poll 120 s)
 *        → { items: [{ id, kind, label, count?, suggestion?, ... }] }
 *   GET  /v1/deadzone/{id}             (lazy on expand)
 *        → { finding: { id, kind, label, suggestion, ... } }
 *
 * Displays:
 *   - Stat tiles: total / dup-names / missing-files / stale-files
 *   - ALL + kind filter tabs + text search
 *   - Finding rows with kind chip + label
 *   - Expand → lazy detail fetch (suggestion, count, extra props)
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence cleanup brief + TTS
 *
 * Toggle: ◈ DEAD at left:319920, bottom:8, zIndex:163.
 * Badge: amber=any findings, dim=clean.
 *
 * Exported helpers for JarvisBrain:
 *   isDeadQuery(q) / buildDeadScript()
 *
 * Voice triggers: "dead zone / deadzone / dead zones / stale files /
 *   duplicate features / missing files / dead code / cleanup intel /
 *   dzf / repo cleanup / dead zone finder / unused features"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const DIM  = "#3A4A55";
const GRAY = "#4E6070";

const BTN_LEFT = 319920;
const POLL_MS  = 120_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const DEAD_RE =
  /\b(dead\s*zone|deadzone|dead\s*zones|stale\s+files?|duplicate\s+features?|missing\s+files?|dead\s+code|cleanup\s+intel|dzf\b|repo\s+cleanup|dead\s+zone\s+finder|unused\s+features?)\b/i;

export function isDeadQuery(q) {
  return DEAD_RE.test(q || "");
}

export async function buildDeadScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/deadzone/scan?limit=100`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const items = d?.items ?? [];
    window.dispatchEvent(new CustomEvent("jarvis:dead-toggle"));
    if (!items.length) return "Dead Zone Finder: no findings — repo and inventory look clean, sir.";
    const total = items.length;
    const kinds = {};
    items.forEach((f) => { kinds[f.kind] = (kinds[f.kind] ?? 0) + 1; });
    const summary = Object.entries(kinds)
      .map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`)
      .join(", ");
    return (
      `Dead Zone Finder: ${total} finding${total !== 1 ? "s" : ""} — ${summary}. ` +
      "Open the Dead Zone panel for actionable suggestions and detail."
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:dead-toggle"));
    return "Dead Zone Finder panel open. Live scan available.";
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function hdr() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

const KIND_COLORS = {
  duplicate_name:  AM,
  missing_file:    RD,
  stale_file:      "#A78BFA",
  orphan_route:    "#60A5FA",
  overlapping:     "#F472B6",
};

function kindColor(kind) {
  return KIND_COLORS[kind] ?? CY;
}

function kindLabel(kind) {
  return (kind ?? "finding").replace(/_/g, " ").toUpperCase();
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
        minWidth: 52,
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
        fontSize: 9,
        fontFamily: "monospace",
        letterSpacing: "0.06em",
        padding: "3px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function KindChip({ kind }) {
  const c = kindColor(kind);
  return (
    <span
      style={{
        background: `${c}18`,
        border: `1px solid ${c}44`,
        borderRadius: 3,
        color: c,
        fontSize: 8,
        letterSpacing: "0.06em",
        padding: "1px 5px",
        whiteSpace: "nowrap",
        textTransform: "uppercase",
      }}
    >
      {kindLabel(kind)}
    </span>
  );
}

function FindingRow({ finding, expanded, onToggle }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!expanded || detail !== null) return;
    let alive = true;
    setLoading(true);
    fetch(`${apiBase()}/v1/deadzone/${encodeURIComponent(finding.id)}`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => { if (alive) setDetail(d?.finding ?? finding); })
      .catch(() => { if (alive) setDetail(finding); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [expanded, finding, detail]);

  const borderColor = kindColor(finding.kind);

  return (
    <div
      style={{
        borderLeft: `2px solid ${borderColor}55`,
        marginBottom: 4,
        background: expanded ? "rgba(41,231,255,0.03)" : "transparent",
        borderRadius: "0 4px 4px 0",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          background: "transparent",
          border: "none",
          color: "#ADC1CD",
          cursor: "pointer",
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          padding: "6px 10px",
          textAlign: "left",
          width: "100%",
          fontFamily: "monospace",
          fontSize: 10,
        }}
      >
        <span style={{ color: GRAY, fontSize: 9, marginTop: 1, flexShrink: 0 }}>
          {expanded ? "▾" : "▸"}
        </span>
        <KindChip kind={finding.kind} />
        <span style={{ flex: 1, wordBreak: "break-all", lineHeight: 1.4 }}>
          {finding.label ?? finding.id}
        </span>
        {finding.count != null && finding.count > 1 && (
          <span style={{ color: AM, fontSize: 9, flexShrink: 0 }}>×{finding.count}</span>
        )}
      </button>

      {expanded && (
        <div
          style={{
            padding: "0 10px 8px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {loading && <span style={{ color: GRAY, fontSize: 9 }}>Loading detail…</span>}
          {!loading && detail && (
            <>
              {detail.suggestion && (
                <div
                  style={{
                    background: "rgba(245,166,35,0.07)",
                    border: "1px solid rgba(245,166,35,0.20)",
                    borderRadius: 4,
                    color: AM,
                    fontSize: 9,
                    lineHeight: 1.5,
                    padding: "5px 7px",
                  }}
                >
                  💡 {detail.suggestion}
                </div>
              )}
              {Object.entries(detail)
                .filter(([k]) => !["id", "kind", "label", "suggestion"].includes(k))
                .map(([k, v]) => (
                  <div
                    key={k}
                    style={{ display: "flex", gap: 8, fontSize: 9, color: GRAY }}
                  >
                    <span style={{ textTransform: "uppercase", letterSpacing: 1, minWidth: 80, flexShrink: 0 }}>
                      {k}
                    </span>
                    <span style={{ color: "#ADC1CD", wordBreak: "break-all" }}>
                      {String(v)}
                    </span>
                  </div>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function DeadZoneFinderPanel() {
  const [open, setOpen]           = useState(false);
  const [items, setItems]         = useState([]);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [tick, setTick]           = useState(0);
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");

  const timerRef = useRef(null);

  // Poll scan
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch(`${apiBase()}/v1/deadzone/scan?limit=100`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => { if (alive) setItems(d?.items ?? []); })
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
    window.addEventListener("jarvis:dead-toggle", fn);
    return () => window.removeEventListener("jarvis:dead-toggle", fn);
  }, []);

  const handleAssess = useCallback(async () => {
    setAssessing(true);
    setAssessText("");
    try {
      const total = items.length;
      const kinds = {};
      items.forEach((f) => { kinds[f.kind] = (kinds[f.kind] ?? 0) + 1; });
      const summary = total
        ? Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(", ")
        : "no findings";
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({
          message:
            `Dead Zone Finder scan: ${total} finding(s) — ${summary}. ` +
            "Give a 2-sentence assessment of the repo cleanup priority and the most important action.",
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
  }, [items]);

  // Derive kinds for filter tabs
  const kinds = [...new Set(items.map((f) => f.kind).filter(Boolean))];

  // Filter
  const visible = items.filter((f) => {
    if (tab !== "ALL" && f.kind !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (f.label ?? "").toLowerCase().includes(q) ||
        (f.kind ?? "").toLowerCase().includes(q) ||
        (f.id ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Stat counts
  const total   = items.length;
  const dupCnt  = items.filter((f) => f.kind === "duplicate_name").length;
  const misCnt  = items.filter((f) => f.kind === "missing_file").length;
  const staleCnt = items.filter((f) => f.kind === "stale_file").length;

  const badgeColor = total > 0 ? AM : DIM;

  const PANEL_W = 400;

  return (
    <>
      {/* ── dock button ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Dead Zone Finder (F285)"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 163,
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
        <span style={{ fontSize: 13 }}>◈</span>
        <span>DEAD</span>
        {/* badge */}
        <span
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            background: badgeColor,
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
            maxHeight: 560,
            boxShadow: `0 0 24px ${AM}18`,
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
            <span style={{ color: AM, letterSpacing: 2, fontWeight: 700, fontSize: 11 }}>
              ◈ DEAD ZONE FINDER
            </span>
            <span
              style={{
                marginLeft: "auto",
                background: total > 0 ? `${AM}22` : `${DIM}22`,
                color: total > 0 ? AM : GRAY,
                border: `1px solid ${total > 0 ? AM : DIM}44`,
                borderRadius: 3,
                padding: "1px 6px",
                fontSize: 9,
                letterSpacing: 1,
              }}
            >
              {total} FINDINGS
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
            <StatTile label="Total"    value={total}    color={total > 0 ? AM : GN} />
            <StatTile label="Dup Names" value={dupCnt}  color={dupCnt  > 0 ? AM : GRAY} />
            <StatTile label="Missing"  value={misCnt}   color={misCnt  > 0 ? RD : GRAY} />
            <StatTile label="Stale"    value={staleCnt} color={staleCnt > 0 ? "#A78BFA" : GRAY} />
          </div>

          {/* filter tabs + search */}
          <div
            style={{
              display: "flex",
              gap: 5,
              padding: "6px 12px",
              flexShrink: 0,
              borderBottom: `1px solid ${CY}11`,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <TabBtn label="ALL" active={tab === "ALL"} onClick={() => setTab("ALL")} />
            {kinds.map((k) => (
              <TabBtn
                key={k}
                label={kindLabel(k)}
                active={tab === k}
                onClick={() => setTab(k)}
              />
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: "auto",
                background: "rgba(41,231,255,0.05)",
                border: "1px solid rgba(41,231,255,0.18)",
                borderRadius: 4,
                color: "#ADC1CD",
                fontFamily: "monospace",
                fontSize: 9,
                outline: "none",
                padding: "3px 7px",
                width: 100,
              }}
            />
          </div>

          {/* findings list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
            {!items.length && (
              <div style={{ color: GRAY, fontSize: 10, padding: "8px 2px" }}>
                Loading scan…
              </div>
            )}
            {items.length > 0 && !visible.length && (
              <div style={{ color: GRAY, fontSize: 10, padding: "8px 2px" }}>
                No findings match filter.
              </div>
            )}
            {items.length > 0 && visible.length > 0 && total === 0 && (
              <div
                style={{
                  color: GN,
                  fontSize: 10,
                  padding: "8px 2px",
                  textAlign: "center",
                }}
              >
                ✓ No dead zones detected. Repo looks clean.
              </div>
            )}
            {visible.map((f) => (
              <FindingRow
                key={f.id}
                finding={f}
                expanded={expanded === f.id}
                onToggle={() => setExpanded(expanded === f.id ? null : f.id)}
              />
            ))}
            {visible.length > 0 && (
              <div style={{ color: DIM, fontSize: 8, marginTop: 8, letterSpacing: 1 }}>
                {visible.length} / {items.length} findings shown
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
                background: assessing ? "rgba(245,166,35,0.05)" : "rgba(245,166,35,0.08)",
                border: `1px solid ${assessing ? DIM : AM + "66"}`,
                borderRadius: 4,
                color: assessing ? GRAY : AM,
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
                  background: `${AM}09`,
                  border: `1px solid ${AM}22`,
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
              GET /v1/deadzone/scan · 120 s poll
            </span>
          </div>
        </div>
      )}
    </>
  );
}
