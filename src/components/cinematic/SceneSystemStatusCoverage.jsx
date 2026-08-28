/**
 * F224: Scene × System Status Exposure (SCSTS)
 *
 * Parallel-fetches /v1/cinematic/scene/{id} (all 10 scenes) × /v1/jarvis/system/status,
 * then keyword-correlates each scene's anchor text against live system service
 * names and metadata to surface MONITORED (≥1 service aligns — scene has live
 * infrastructure coverage) vs UNMONITORED (no service alignment — scene lacks
 * infrastructure backing).
 *
 * Real endpoints:
 *   GET /v1/cinematic/scene/:id      — scene anchor text
 *   GET /v1/jarvis/system/status     — live service health
 *   POST /v1/jarvis/agent/chat       — ASSESS brief
 *
 * Voice triggers: "scene system" / "system scene" / "scsts" / "scene status" /
 *   "scene service coverage" / "scene infrastructure" / "monitored scene" /
 *   "scene health coverage" / "scene service health" / "operational scene health"
 */

import { useState, useEffect, useRef } from "react";

const API     = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const API_KEY = import.meta.env.VITE_API_KEY ?? "dev-key";
const hdr     = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };

const SCENE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const THRESHOLD = 0.1;

const TE  = "#2DD4BF";  // teal   — monitored
const AM  = "#F59E0B";  // amber  — unmonitored / badge
const GR  = "#22C55E";  // green  — healthy
const OR  = "#F97316";  // orange — degraded
const RD  = "#EF4444";  // red    — down
const DIM = "#6B7280";  // dim

const SCSTS_RE =
  /\b(scsts|scene[._-]?system|system[._-]?scene|scene[._-]?status|scene[._-]?service[._-]?coverage|scene[._-]?infrastructure|monitored[._-]?scene|scene[._-]?health[._-]?coverage|scene[._-]?service[._-]?health|operational[._-]?scene[._-]?health)\b/i;

export function isScstsQuery(t) { return SCSTS_RE.test(t || ""); }

// ── normalizers ───────────────────────────────────────────────────────────────

function normaliseScene(raw, id) {
  if (!raw) return null;
  const title =
    raw.title ?? raw.name ?? raw.label ??
    (Array.isArray(raw.anchors) ? raw.anchors[0]?.label : undefined) ??
    `Scene ${id}`;
  const anchors = Array.isArray(raw.anchors)
    ? raw.anchors.map(a => a.label ?? a.title ?? a.text ?? String(a)).join(" ")
    : String(raw.description ?? raw.summary ?? "");
  return {
    id:      String(id),
    label:   `Scene ${String(id).padStart(2, "0")} — ${title}`,
    anchors,
  };
}

function normaliseServices(raw) {
  if (!raw) return [];
  const services =
    raw.services ?? raw.components ?? raw.checks ?? raw.modules ?? raw.items ?? [];
  if (Array.isArray(services) && services.length > 0) {
    return services.map((s, i) => ({
      id:     s.id ?? s.name ?? String(i),
      name:   String(s.name ?? s.service ?? s.component ?? s.module ?? `Service ${i + 1}`),
      status: String(s.status ?? s.health ?? s.state ?? "").toLowerCase(),
      detail: String(s.message ?? s.detail ?? s.error ?? "").slice(0, 180),
    }));
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const keys = Object.keys(raw).filter(k => {
      const v = raw[k];
      return typeof v === "string" || (typeof v === "object" && v !== null);
    });
    if (keys.length > 0) {
      return keys.map(k => {
        const v = raw[k];
        const status = typeof v === "string" ? v : String(v?.status ?? v?.health ?? "");
        const detail = typeof v === "object" ? String(v?.message ?? v?.detail ?? "").slice(0, 180) : "";
        return { id: k, name: k, status: status.toLowerCase(), detail };
      });
    }
  }
  return [];
}

function healthColour(status) {
  const s = String(status).toLowerCase();
  if (["ok", "up", "online", "healthy", "running", "active", "green"].some(g => s.includes(g))) return GR;
  if (["degraded", "slow", "warn", "yellow", "partial"].some(g => s.includes(g))) return OR;
  return RD;
}

function healthLabel(status) {
  const s = String(status).toLowerCase();
  if (["ok", "up", "online", "healthy", "running", "active", "green"].some(g => s.includes(g))) return "HEALTHY";
  if (["degraded", "slow", "warn", "yellow", "partial"].some(g => s.includes(g))) return "DEGRADED";
  return "DOWN";
}

// ── token helpers ─────────────────────────────────────────────────────────────

function tokens(str) {
  return String(str || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(t => t.length > 2);
}

function matchScore(aToks, bStr) {
  const bToks = tokens(bStr);
  if (!aToks.length || !bToks.length) return 0;
  const sa = new Set(aToks);
  const hits = bToks.filter(t => sa.has(t)).length;
  return hits / Math.max(sa.size, bToks.length);
}

// ── correlator ────────────────────────────────────────────────────────────────

function correlate(scenes, services) {
  return scenes.map(scene => {
    const scToks = tokens(scene.label + " " + scene.anchors);
    const matched = services
      .map(svc => {
        const sc = matchScore(scToks, svc.name + " " + svc.detail);
        return { ...svc, _score: sc };
      })
      .filter(svc => svc._score >= THRESHOLD)
      .sort((a, b) => b._score - a._score)
      .slice(0, 6);

    return {
      ...scene,
      _services: matched,
      _coverage: matched.length > 0 ? "MONITORED" : "UNMONITORED",
    };
  });
}

// ── data fetcher ──────────────────────────────────────────────────────────────

async function fetchAll() {
  const [sceneResults, svcRaw] = await Promise.all([
    Promise.all(
      SCENE_IDS.map(id =>
        fetch(`${API}/v1/cinematic/scene/${id}`, { headers: hdr })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    ),
    fetch(`${API}/v1/jarvis/system/status`, { headers: hdr })
      .then(r => r.ok ? r.json() : {})
      .catch(() => {}),
  ]);

  const scenes   = sceneResults.map((raw, i) => normaliseScene(raw, SCENE_IDS[i])).filter(Boolean);
  const services = normaliseServices(svcRaw);
  return { rows: correlate(scenes, services), serviceCount: services.length };
}

// ── spoken script builder ─────────────────────────────────────────────────────

export async function buildScstsScript() {
  try {
    const { rows, serviceCount } = await fetchAll();
    if (!rows.length) return "Scene System Status coverage unavailable — check endpoints.";
    const monitored   = rows.filter(r => r._coverage === "MONITORED");
    const unmonitored = rows.filter(r => r._coverage === "UNMONITORED");
    return (
      `SCSTS: ${rows.length} cinematic scenes cross-referenced against ${serviceCount} live system services. ` +
      `${monitored.length} MONITORED (at least one service aligns with scene domain — infrastructure coverage confirmed); ` +
      `${unmonitored.length} UNMONITORED (no service alignment — scene lacks live infrastructure backing). ` +
      (unmonitored.length > 0
        ? `Unmonitored scenes: ${unmonitored.map(s => s.label.split("—")[0].trim()).join(", ")}. ` +
          `Recommend adding service tags or enriching system status metadata to establish scene-level infrastructure coverage.`
        : `All scenes carry live infrastructure coverage. System-scene alignment is complete.`)
    );
  } catch {
    return "Scene System Status coverage unavailable — check endpoints.";
  }
}

// ── sub-components ────────────────────────────────────────────────────────────

function ScoreBadge({ score, colour }) {
  const pct = Math.round(score * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: "#1f2937", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: colour ?? TE, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 10, color: colour ?? TE, minWidth: 30, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

function ServiceChip({ svc }) {
  const col = healthColour(svc.status);
  const lbl = healthLabel(svc.status);
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
        <span style={{ fontSize: 11, color: "#e5e7eb", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {svc.name}
        </span>
        <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: col + "22", color: col, marginLeft: 4, fontWeight: 700 }}>
          {lbl}
        </span>
      </div>
      <ScoreBadge score={svc._score} colour={TE} />
    </div>
  );
}

function SceneRow({ row, expanded, onToggle }) {
  const isMonitored = row._coverage === "MONITORED";
  const color = isMonitored ? TE : AM;
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
          borderRadius: 8, cursor: "pointer", userSelect: "none",
          background: expanded ? "#1e293b" : "#111827",
          borderLeft: `3px solid ${color}`,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color, minWidth: 96, whiteSpace: "nowrap" }}>
          {row._coverage}
        </span>
        <span style={{ fontSize: 12, color: "#e5e7eb", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.label}
        </span>
        <span style={{ fontSize: 10, color: DIM }}>
          {row._services.length > 0 ? `${row._services.length} svc` : "none"}
        </span>
        <span style={{ fontSize: 12, color: DIM }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "8px 12px", background: "#0f172a", borderRadius: "0 0 8px 8px", marginTop: 2 }}>
          {row._services.length === 0 ? (
            <p style={{ fontSize: 11, color: AM, margin: 0 }}>
              No live system service aligns with this scene's domain. Infrastructure blind spot.
            </p>
          ) : (
            row._services.map(svc => <ServiceChip key={svc.id} svc={svc} />)
          )}
        </div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function SceneSystemStatusCoverage() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [svcCount,  setSvcCount]  = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const { rows: r, serviceCount } = await fetchAll();
      setRows(r);
      setSvcCount(serviceCount);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const onToggle = () => setOpen(o => { if (!o) load(); return !o; });
    window.addEventListener("jarvis:scsts-toggle", onToggle);
    return () => window.removeEventListener("jarvis:scsts-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 60_000);
    return () => clearInterval(timerRef.current);
  }, [open]);

  if (!open) return null;

  const monitored   = rows.filter(r => r._coverage === "MONITORED").length;
  const unmonitored = rows.filter(r => r._coverage === "UNMONITORED").length;

  const visible = rows.filter(r => {
    if (filter === "MONITORED"   && r._coverage !== "MONITORED")   return false;
    if (filter === "UNMONITORED" && r._coverage !== "UNMONITORED") return false;
    if (search && !r.label.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function toggleExpand(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildScstsScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ message: `Scene System Status Coverage assessment: ${script}` }),
      });
      const d = await r.json();
      const brief = d.response ?? d.message ?? d.text ?? script;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: brief }));
    } catch {
      buildScstsScript().then(s =>
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: s }))
      ).catch(() => {});
    } finally {
      setAssessing(false);
    }
  }

  const TABS = ["ALL", "MONITORED", "UNMONITORED"];

  const statTiles = [
    ["SCENES",      rows.length,  TE],
    ["SERVICES",    svcCount,     "#818cf8"],
    ["MONITORED",   monitored,    TE],
    ["UNMONITORED", unmonitored,  AM],
  ];

  return (
    <div style={{
      position: "fixed", bottom: 8, left: 752960, zIndex: 373,
      width: 480, maxHeight: 580, display: "flex", flexDirection: "column",
      background: "#0a0f1a", border: "1px solid #1e293b", borderRadius: 12,
      boxShadow: "0 4px 32px rgba(0,0,0,0.7)", fontFamily: "monospace",
      overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
        borderBottom: "1px solid #1e293b", background: "#0d1421",
      }}>
        <span style={{ color: AM, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ SCSTS</span>
        <span style={{ color: "#64748b", fontSize: 10, flex: 1 }}>Scene × System Status Exposure</span>
        {unmonitored > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>
            {unmonitored} unmonitored
          </span>
        )}
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${TE}44`, borderRadius: 6,
          color: TE, fontSize: 10, padding: "2px 8px", cursor: "pointer",
        }}>
          {assessing ? "…" : "ASSESS"}
        </button>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: DIM, fontSize: 14, cursor: "pointer", padding: "0 2px",
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, padding: "10px 14px 6px" }}>
        {statTiles.map(([lbl, val, col]) => (
          <div key={lbl} style={{
            background: "#111827", borderRadius: 8, padding: "6px 8px", textAlign: "center",
            border: `1px solid ${col}22`,
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? TE + "22" : "none",
            border: `1px solid ${filter === t ? TE : "#1e293b"}`,
            borderRadius: 6, color: filter === t ? TE : DIM,
            fontSize: 9, padding: "2px 8px", cursor: "pointer", letterSpacing: 1,
          }}>
            {t}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search scenes…"
          style={{
            marginLeft: "auto", background: "#111827", border: "1px solid #1e293b",
            borderRadius: 6, color: "#e5e7eb", fontSize: 10, padding: "2px 8px",
            outline: "none", width: 110,
          }}
        />
      </div>

      {/* body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 10px" }}>
        {loading && <div style={{ color: DIM, fontSize: 11, padding: 12 }}>loading…</div>}
        {err     && <div style={{ color: RD,  fontSize: 11, padding: 12 }}>error: {err}</div>}
        {!loading && !err && visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 10, padding: 12 }}>no scenes match</div>
        )}
        {visible.map(row => (
          <SceneRow
            key={row.id}
            row={row}
            expanded={!!expanded[row.id]}
            onToggle={() => toggleExpand(row.id)}
          />
        ))}
      </div>

      {/* footer */}
      <div style={{ borderTop: "1px solid #1e293b", padding: "5px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 9, color: DIM }}>60-s auto-refresh · {rows.length} scenes · {svcCount} services</span>
        <button onClick={load} disabled={loading} style={{
          background: "none", border: `1px solid ${TE}44`, borderRadius: 6,
          color: TE, fontSize: 9, padding: "2px 8px", cursor: "pointer",
        }}>
          {loading ? "…" : "↻"}
        </button>
      </div>
    </div>
  );
}
