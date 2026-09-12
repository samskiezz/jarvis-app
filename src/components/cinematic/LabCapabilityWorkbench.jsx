/**
 * LabCapabilityWorkbench — F286.
 *
 * Scientific lab capability surface wired to the real Jarvis labs bridge.
 *
 * Data sources (real — /v1/labs):
 *   GET  /v1/labs/catalog          (poll 120 s)
 *        → { capabilities: [{ capability, module, description, loaded, status }] }
 *   POST /v1/labs/run              (on user action)
 *        body: { capability, params }
 *        → { status, module?, capability?, data?, reason? }
 *
 * Displays:
 *   - Stat tiles: total / available / unavailable / domains
 *   - ALL + capability filter tabs + text search
 *   - Per-capability: name chip + module + status dot + description
 *   - Expand → params JSON textarea + ▶ RUN → inline result block
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence lab brief + TTS
 *
 * Toggle: ⚗ LABS at left:324480, bottom:8, zIndex:164.
 * Badge: green=available count, amber=any unavailable.
 *
 * Exported helpers for JarvisBrain:
 *   isLabsQuery(q) / buildLabsScript()
 *
 * Voice triggers: "labs / lab capabilities / drug discovery / quantum demo /
 *   disease model / patent classify / materials / manufacturing sim /
 *   science lab / lab catalog / available labs / run lab / lab workbench"
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
const PU   = "#A78BFA";

const BTN_LEFT = 324480;
const POLL_MS  = 120_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const LABS_RE =
  /\b(labs?\b|lab\s+capabilities?|drug\s+discovery|quantum\s+demo|disease\s+model|patent\s+classif|materials?\s+(or\s+)?standards?|manufacturing\s+sim|science\s+lab|lab\s+catalog|available\s+labs?|run\s+lab|lab\s+workbench|lab\s+bench)\b/i;

export function isLabsQuery(q) {
  return LABS_RE.test(q || "");
}

export async function buildLabsScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/labs/catalog`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const caps = d?.capabilities ?? [];
    window.dispatchEvent(new CustomEvent("jarvis:labs-toggle"));
    const avail = caps.filter((c) => c.status === "available").length;
    const total = caps.length;
    if (!total)
      return "Lab Capability Workbench: no capabilities registered in the labs bridge.";
    const names = caps.filter((c) => c.status === "available").map((c) => c.capability).join(", ");
    return (
      `Lab Capability Workbench: ${avail} of ${total} science capabilities available — ${names || "none"}. ` +
      "Open the Labs panel to run capabilities or inspect degraded modules."
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:labs-toggle"));
    return "Lab Capability Workbench panel open. Catalog loading.";
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function hdr(json = false) {
  const h = { Authorization: `Bearer ${API_KEY}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function StatTile({ label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        background: "rgba(41,231,255,0.03)",
        border: `1px solid ${color}22`,
        borderRadius: 5,
        padding: "5px 7px",
        textAlign: "center",
      }}
    >
      <div style={{ color, fontSize: 15, fontWeight: 700, lineHeight: 1.1 }}>{value}</div>
      <div style={{ color: GRAY, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function TabBtn({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `${CY}18` : "transparent",
        border: `1px solid ${active ? CY : DIM}`,
        borderRadius: 3,
        color: active ? CY : GRAY,
        cursor: "pointer",
        fontFamily: "monospace",
        fontSize: 9,
        letterSpacing: "0.06em",
        padding: "2px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

const STATUS_COLORS = {
  available: GN,
  unavailable: RD,
};

function capLabel(capability) {
  return capability.replace(/_/g, " ").toUpperCase();
}

function CapabilityRow({ cap, expanded, onToggle }) {
  const [params, setParams]       = useState("{}");
  const [running, setRunning]     = useState(false);
  const [result, setResult]       = useState(null);
  const statusColor = STATUS_COLORS[cap.status] ?? GRAY;

  const handleRun = useCallback(async () => {
    setRunning(true);
    setResult(null);
    let parsedParams = {};
    try {
      parsedParams = JSON.parse(params || "{}");
    } catch {
      setResult({ status: "error", reason: "Invalid JSON in params." });
      setRunning(false);
      return;
    }
    try {
      const r = await fetch(`${apiBase()}/v1/labs/run`, {
        method: "POST",
        headers: hdr(true),
        body: JSON.stringify({ capability: cap.capability, params: parsedParams }),
      });
      const d = await r.json();
      setResult(d);
    } catch (err) {
      setResult({ status: "error", reason: String(err) });
    } finally {
      setRunning(false);
    }
  }, [cap.capability, params]);

  return (
    <div
      style={{
        borderBottom: `1px solid ${CY}11`,
        padding: "6px 4px",
      }}
    >
      {/* row header */}
      <div
        onClick={onToggle}
        style={{
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 7,
          userSelect: "none",
        }}
      >
        {/* status dot */}
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: statusColor,
            flexShrink: 0,
            boxShadow: cap.status === "available" ? `0 0 4px ${GN}88` : "none",
          }}
        />
        {/* name chip */}
        <span
          style={{
            background: `${statusColor}18`,
            border: `1px solid ${statusColor}44`,
            borderRadius: 3,
            color: statusColor,
            fontSize: 9,
            letterSpacing: 1,
            padding: "1px 5px",
            flexShrink: 0,
          }}
        >
          {capLabel(cap.capability)}
        </span>
        {/* module */}
        <span style={{ color: GRAY, fontSize: 9, flexShrink: 0 }}>
          [{cap.module}]
        </span>
        {/* description */}
        <span
          style={{
            color: "#ADC1CD",
            fontSize: 9,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {cap.description}
        </span>
        <span style={{ color: expanded ? CY : GRAY, fontSize: 10, flexShrink: 0 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {/* expanded detail */}
      {expanded && (
        <div
          style={{
            marginTop: 8,
            paddingLeft: 14,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {cap.status === "unavailable" && (
            <div
              style={{
                background: `${RD}11`,
                border: `1px solid ${RD}33`,
                borderRadius: 4,
                color: RD,
                fontSize: 9,
                lineHeight: 1.5,
                padding: "4px 7px",
              }}
            >
              ⚠ Module unavailable — underworld module not importable in this process.
              {cap.detail && (
                <span style={{ color: GRAY }}> {cap.detail}</span>
              )}
            </div>
          )}

          {cap.status === "available" && (
            <>
              <div style={{ color: GRAY, fontSize: 9, letterSpacing: 1 }}>PARAMS (JSON)</div>
              <textarea
                value={params}
                onChange={(e) => setParams(e.target.value)}
                rows={3}
                style={{
                  background: "rgba(41,231,255,0.04)",
                  border: `1px solid ${CY}33`,
                  borderRadius: 4,
                  color: "#ADC1CD",
                  fontFamily: "monospace",
                  fontSize: 9,
                  lineHeight: 1.5,
                  outline: "none",
                  padding: "5px 7px",
                  resize: "vertical",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ color: GRAY, fontSize: 8 }}>
                {cap.capability === "drug_discovery" &&
                  'Params: {"target": "<protein sequence>", "candidate": "<SMILES>"}'}
                {cap.capability === "disease_model" &&
                  'Params: {"kind": "sir"} — sir / seir / r0 / herd'}
                {cap.capability === "quantum_demo" &&
                  'Params: {"kind": "time_crystal"} — time_crystal / topological / bec / mbl / metrology'}
                {cap.capability === "manufacturing_sim" &&
                  'Params: {"stages": [...], "raw_materials": [...]} (all optional)'}
                {cap.capability === "patent_classify" &&
                  'Params: {"text": "<patent description text>"}'}
                {cap.capability === "materials_or_standards" &&
                  'Params: {"kind": "tolerance"} — tolerance / calibration / material'}
              </div>
              <button
                onClick={handleRun}
                disabled={running}
                style={{
                  alignSelf: "flex-start",
                  background: running ? `${GN}08` : `${GN}12`,
                  border: `1px solid ${running ? DIM : GN + "55"}`,
                  borderRadius: 4,
                  color: running ? GRAY : GN,
                  cursor: running ? "wait" : "pointer",
                  fontFamily: "monospace",
                  fontSize: 9,
                  letterSpacing: "0.06em",
                  padding: "3px 10px",
                }}
              >
                {running ? "▷ running…" : "▶ RUN"}
              </button>
            </>
          )}

          {result && (
            <div
              style={{
                background: result.status === "ok" ? `${GN}09` : `${RD}09`,
                border: `1px solid ${result.status === "ok" ? GN : RD}22`,
                borderRadius: 4,
                color: "#ADC1CD",
                fontSize: 9,
                lineHeight: 1.5,
                maxHeight: 180,
                overflowY: "auto",
                padding: "6px 8px",
              }}
            >
              <div style={{ color: result.status === "ok" ? GN : RD, marginBottom: 4, fontWeight: 700 }}>
                {result.status === "ok" ? "✓ OK" : `✗ ${result.status?.toUpperCase()}`}
                {result.module && (
                  <span style={{ color: GRAY, fontWeight: 400, marginLeft: 6 }}>
                    [{result.module}]
                  </span>
                )}
              </div>
              {result.reason && (
                <div style={{ color: RD, marginBottom: 4 }}>{result.reason}</div>
              )}
              {result.data && (
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    fontSize: 8,
                    color: "#ADC1CD",
                  }}
                >
                  {JSON.stringify(result.data, null, 2).slice(0, 800)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function LabCapabilityWorkbench() {
  const [open, setOpen]             = useState(false);
  const [caps, setCaps]             = useState([]);
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [tick, setTick]             = useState(0);
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState("");

  const timerRef = useRef(null);

  // Poll catalog
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch(`${apiBase()}/v1/labs/catalog`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => { if (alive) setCaps(d?.capabilities ?? []); })
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
    window.addEventListener("jarvis:labs-toggle", fn);
    return () => window.removeEventListener("jarvis:labs-toggle", fn);
  }, []);

  const handleAssess = useCallback(async () => {
    setAssessing(true);
    setAssessText("");
    try {
      const avail = caps.filter((c) => c.status === "available").length;
      const unavail = caps.filter((c) => c.status !== "available").length;
      const names = caps.map((c) => c.capability).join(", ");
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: hdr(true),
        body: JSON.stringify({
          message:
            `Lab Capability Workbench: ${caps.length} capabilities registered — ` +
            `${avail} available, ${unavail} unavailable. Capabilities: ${names}. ` +
            "Give a 2-sentence assessment of the lab readiness and the most useful capability to run.",
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
  }, [caps]);

  // Filter
  const capNames = [...new Set(caps.map((c) => c.capability).filter(Boolean))];
  const visible = caps.filter((c) => {
    if (tab !== "ALL" && c.capability !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (c.capability ?? "").toLowerCase().includes(q) ||
        (c.module ?? "").toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const total   = caps.length;
  const avail   = caps.filter((c) => c.status === "available").length;
  const unavail = caps.filter((c) => c.status !== "available").length;
  const domains = new Set(caps.map((c) => (c.module ?? "").split("/")[0])).size;

  const badgeColor = unavail > 0 ? AM : avail > 0 ? GN : DIM;
  const badgeVal   = avail;

  const PANEL_W = 420;

  return (
    <>
      {/* ── dock button ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Lab Capability Workbench (F286)"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 164,
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
        <span style={{ fontSize: 13 }}>⚗</span>
        <span>LABS</span>
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
            maxHeight: 580,
            boxShadow: `0 0 24px ${PU}18`,
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
            <span style={{ color: PU, letterSpacing: 2, fontWeight: 700, fontSize: 11 }}>
              ⚗ LAB CAPABILITY WORKBENCH
            </span>
            <span
              style={{
                marginLeft: "auto",
                background: avail > 0 ? `${GN}18` : `${DIM}18`,
                color: avail > 0 ? GN : GRAY,
                border: `1px solid ${avail > 0 ? GN : DIM}44`,
                borderRadius: 3,
                padding: "1px 6px",
                fontSize: 9,
                letterSpacing: 1,
              }}
            >
              {avail}/{total} AVAIL
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
            <StatTile label="Total"     value={total}   color={total > 0 ? PU : GRAY} />
            <StatTile label="Available" value={avail}   color={avail > 0 ? GN : GRAY} />
            <StatTile label="Degraded"  value={unavail} color={unavail > 0 ? RD : GRAY} />
            <StatTile label="Domains"   value={domains} color={domains > 0 ? CY : GRAY} />
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
            {capNames.map((c) => (
              <TabBtn
                key={c}
                label={capLabel(c)}
                active={tab === c}
                onClick={() => setTab(c)}
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

          {/* capabilities list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px" }}>
            {!caps.length && (
              <div style={{ color: GRAY, fontSize: 10, padding: "8px 2px" }}>
                Loading lab catalog…
              </div>
            )}
            {caps.length > 0 && !visible.length && (
              <div style={{ color: GRAY, fontSize: 10, padding: "8px 2px" }}>
                No capabilities match filter.
              </div>
            )}
            {visible.map((c) => (
              <CapabilityRow
                key={c.capability}
                cap={c}
                expanded={expanded === c.capability}
                onToggle={() =>
                  setExpanded(expanded === c.capability ? null : c.capability)
                }
              />
            ))}
            {visible.length > 0 && (
              <div style={{ color: DIM, fontSize: 8, marginTop: 8, letterSpacing: 1 }}>
                {visible.length} / {caps.length} capabilities shown
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
                background: assessing ? `${PU}05` : `${PU}0a`,
                border: `1px solid ${assessing ? DIM : PU + "55"}`,
                borderRadius: 4,
                color: assessing ? GRAY : PU,
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
                  background: `${PU}09`,
                  border: `1px solid ${PU}22`,
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
              GET /v1/labs/catalog · 120 s poll · POST /v1/labs/run
            </span>
          </div>
        </div>
      )}
    </>
  );
}
