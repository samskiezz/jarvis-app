/**
 * ScenarioEnginePanel — F281.
 *
 * What-if / model-ops scenario runner wired to the live scenario service.
 *
 * Data sources (all real — endpoints in /v1/scenario):
 *   GET  /v1/scenario/list?limit=50       (poll 90 s)
 *        → {count, runs:[{id,name,engine,status,created_at,...}]}
 *   GET  /v1/scenario/models              (on open)
 *        → {models:[{name,description,...}], drift:{...}}
 *   GET  /v1/scenario/{id}               (lazy expand)
 *        → {id,name,engine,status,result,...}
 *   POST /v1/scenario/run                 (bearer, inline run form)
 *        body: {name, params}
 *        → {id, name, engine, status, result}
 *
 * Displays:
 *   - Stat tiles: total runs / models / recent (7d) / avg engine
 *   - RUNS | MODELS tab switcher + text search
 *   - RUNS: per-run name + engine chip + status chip + age; expand → lazy detail
 *   - MODELS: model name + description
 *   - Inline ▶ RUN form: scenario name + JSON params textarea → POST /v1/scenario/run
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence scenario brief + TTS
 *
 * Toggle: ⊡ SCEN at left:301680, bottom:8, zIndex:159.
 * Badge: green=run-count, amber=no runs.
 * Auto-refresh: list 90 s; models fetched once on open.
 *
 * Exported helpers for JarvisBrain:
 *   isScenQuery(q) / buildScenScript()
 *
 * Voice triggers: "scenario / what if / scenario engine / model run / run scenario /
 *   scenario list / scen / model registry / scenario models / what-if analysis /
 *   optimize scenario / scenario runner"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const PU   = "#A78BFA";
const DIM  = "#3A4A55";
const GRAY = "#4E6070";

const BTN_LEFT  = 301680;
const POLL_MS   = 90_000;
const API_KEY   =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const SCEN_RE =
  /\b(scenario|what[\s-]if|scenario\s+engine|model\s+run|run\s+scenario|scenario\s+list|scen\b|model\s+registry|scenario\s+models|what-if\s+analysis|optimize\s+scenario|scenario\s+runner)\b/i;

export function isScenQuery(q) {
  return SCEN_RE.test(q || "");
}

export async function buildScenScript() {
  try {
    const [listR, modelsR] = await Promise.all([
      fetch(`${apiBase()}/v1/scenario/list?limit=50`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/scenario/models`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const list   = await listR.json();
    const models = await modelsR.json();
    window.dispatchEvent(new CustomEvent("jarvis:scen-toggle"));
    const count      = list?.count ?? (list?.runs?.length ?? 0);
    const modelCount = models?.models?.length ?? 0;
    const engines    = [...new Set((list?.runs ?? []).map((r) => r.engine).filter(Boolean))];
    const engineStr  = engines.length ? engines.join("/") : "unknown";
    return (
      `Scenario engine: ${count} run${count !== 1 ? "s" : ""} logged, ` +
      `${modelCount} model${modelCount !== 1 ? "s" : ""} registered` +
      (engines.length ? `, using engine${engines.length > 1 ? "s" : ""} ${engineStr}` : "") +
      ". " +
      (count > 0
        ? `Open the panel to review recent what-if runs or launch a new scenario.`
        : "No scenario runs recorded yet — use the RUN form to start a what-if analysis.")
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:scen-toggle"));
    return "Scenario Engine Panel open, sir.";
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function hdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function age(ts) {
  if (!ts) return "—";
  const raw =
    typeof ts === "number"
      ? ts > 1e10
        ? ts / 1000
        : ts
      : new Date(ts).getTime() / 1000;
  if (isNaN(raw)) return "—";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - raw));
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function statusColor(status) {
  const s = (status || "").toLowerCase();
  if (s === "done" || s === "ok" || s === "complete" || s === "completed") return GN;
  if (s === "running" || s === "pending") return AM;
  if (s === "error" || s === "failed")    return RD;
  return GRAY;
}

function engineColor(engine) {
  const e = (engine || "").toLowerCase();
  if (e.includes("counterfactual")) return PU;
  if (e.includes("local"))          return CY;
  if (e.includes("optim"))          return AM;
  return GRAY;
}

function truncate(v, len = 400) {
  const s = typeof v === "string" ? v : JSON.stringify(v, null, 2);
  if (!s) return "";
  return s.length > len ? s.slice(0, len) + "\n…" : s;
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchList(limit = 50) {
  const r = await fetch(`${apiBase()}/v1/scenario/list?limit=${limit}`, { headers: hdr() });
  if (!r.ok) throw new Error(`list ${r.status}`);
  return r.json();
}

async function fetchModels() {
  const r = await fetch(`${apiBase()}/v1/scenario/models`, { headers: hdr() });
  if (!r.ok) throw new Error(`models ${r.status}`);
  return r.json();
}

async function fetchRun(id) {
  const r = await fetch(`${apiBase()}/v1/scenario/${id}`, { headers: hdr() });
  if (!r.ok) throw new Error(`run ${r.status}`);
  return r.json();
}

async function postRun(name, params) {
  const r = await fetch(`${apiBase()}/v1/scenario/run`, {
    method: "POST",
    headers: { ...hdr(), "Content-Type": "application/json" },
    body: JSON.stringify({ name, params }),
  });
  if (!r.ok) throw new Error(`run-post ${r.status}`);
  return r.json();
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
        minWidth: 60,
      }}
    >
      <div style={{ color, fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{value}</div>
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

function TabBtn({ label, active, count, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "rgba(41,231,255,0.12)" : "transparent",
        border: `1px solid ${active ? CY : "rgba(41,231,255,0.15)"}`,
        borderRadius: 4,
        color: active ? CY : GRAY,
        cursor: "pointer",
        fontSize: 10,
        fontFamily: "monospace",
        letterSpacing: "0.06em",
        padding: "3px 8px",
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {label}
      {count != null && (
        <span
          style={{
            background: count > 0 ? `${CY}22` : `${DIM}44`,
            border: `1px solid ${count > 0 ? CY : DIM}`,
            borderRadius: 3,
            color: count > 0 ? CY : GRAY,
            fontSize: 9,
            padding: "0 3px",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function Chip({ label, color }) {
  return (
    <span
      style={{
        background: `${color}22`,
        border: `1px solid ${color}55`,
        borderRadius: 3,
        color,
        fontSize: 9,
        fontFamily: "monospace",
        padding: "1px 5px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function RunRow({ run, onRunAdded }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail]     = useState(null);
  const [loading, setLoading]   = useState(false);

  async function expand() {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (!detail) {
      setLoading(true);
      try {
        const d = await fetchRun(run.id ?? run.scenario_id ?? run.name);
        setDetail(d);
      } catch { /* leave null */ }
      setLoading(false);
    }
  }

  const statusStr = run.status ?? "unknown";
  const engineStr = run.engine ?? run.type ?? "—";

  return (
    <div style={{ borderBottom: "1px solid rgba(41,231,255,0.07)", padding: "6px 8px", cursor: "pointer" }}>
      <div
        onClick={expand}
        style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
      >
        <Chip label={statusStr.toUpperCase()} color={statusColor(statusStr)} />
        <Chip label={engineStr}               color={engineColor(engineStr)} />
        <span
          style={{
            color: CY,
            fontSize: 11,
            fontFamily: "monospace",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {run.name ?? run.id ?? "unnamed"}
        </span>
        <span style={{ color: GRAY, fontSize: 9 }}>{age(run.created_at ?? run.ts)}</span>
        <span style={{ color: GRAY, fontSize: 9 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div
          style={{
            background: "rgba(0,0,0,0.18)",
            borderRadius: 4,
            marginTop: 6,
            padding: "7px 9px",
          }}
        >
          {loading ? (
            <div style={{ color: GRAY, fontSize: 10 }}>Loading…</div>
          ) : detail ? (
            <>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                {detail.id   && <Chip label={`id: ${detail.id}`}     color={GRAY} />}
                {detail.engine && <Chip label={detail.engine}         color={engineColor(detail.engine)} />}
              </div>
              {detail.result != null && (
                <pre
                  style={{
                    color: GN,
                    fontSize: 9,
                    fontFamily: "monospace",
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxHeight: 220,
                    overflowY: "auto",
                  }}
                >
                  {truncate(detail.result)}
                </pre>
              )}
              {detail.params != null && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ color: GRAY, fontSize: 9, cursor: "pointer" }}>params</summary>
                  <pre style={{ color: PU, fontSize: 9, fontFamily: "monospace", margin: "4px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {truncate(detail.params, 300)}
                  </pre>
                </details>
              )}
            </>
          ) : (
            <div style={{ color: GRAY, fontSize: 10 }}>Detail unavailable.</div>
          )}
        </div>
      )}
    </div>
  );
}

function ModelRow({ model }) {
  const [expanded, setExpanded] = useState(false);
  const name = model.name ?? model.id ?? "?";
  const desc = model.description ?? model.desc ?? null;

  return (
    <div style={{ borderBottom: "1px solid rgba(41,231,255,0.07)", padding: "6px 8px", cursor: "pointer" }}>
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
      >
        <Chip label="MODEL" color={PU} />
        <span style={{ color: CY, fontSize: 11, fontFamily: "monospace", flex: 1 }}>{name}</span>
        {model.type && <Chip label={model.type} color={GRAY} />}
        <span style={{ color: GRAY, fontSize: 9 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && desc && (
        <div style={{ background: "rgba(0,0,0,0.18)", borderRadius: 4, marginTop: 6, padding: "6px 9px", color: GN, fontSize: 10, lineHeight: 1.5 }}>
          {desc}
        </div>
      )}
    </div>
  );
}

function RunForm({ onRunComplete }) {
  const [runName, setRunName]   = useState("scenario");
  const [params, setParams]     = useState("{}");
  const [running, setRunning]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);

  async function handleRun(e) {
    e.preventDefault();
    setRunning(true); setResult(null); setError(null);
    let parsedParams = {};
    try { parsedParams = JSON.parse(params); } catch { /* ignore, send empty */ }
    try {
      const d = await postRun(runName, parsedParams);
      setResult(d);
      if (onRunComplete) onRunComplete(d);
    } catch (err) {
      setError(err.message);
    }
    setRunning(false);
  }

  return (
    <form onSubmit={handleRun} style={{ padding: "8px 12px", borderTop: `1px solid ${CY}22` }}>
      <div style={{ color: CY, fontSize: 9, letterSpacing: "0.07em", marginBottom: 6 }}>▶ NEW SCENARIO RUN</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
        <input
          value={runName}
          onChange={(e) => setRunName(e.target.value)}
          placeholder="scenario name"
          style={{
            background: "rgba(41,231,255,0.05)",
            border: "1px solid rgba(41,231,255,0.15)",
            borderRadius: 4,
            color: CY,
            fontFamily: "monospace",
            fontSize: 10,
            outline: "none",
            padding: "3px 8px",
            flex: 1,
            minWidth: 120,
          }}
        />
        <button
          type="submit"
          disabled={running}
          style={{
            background: `${GN}11`,
            border: `1px solid ${GN}44`,
            borderRadius: 3,
            color: running ? GRAY : GN,
            cursor: running ? "wait" : "pointer",
            fontFamily: "monospace",
            fontSize: 9,
            padding: "3px 10px",
            flexShrink: 0,
          }}
        >
          {running ? "running…" : "▶ RUN"}
        </button>
      </div>
      <textarea
        value={params}
        onChange={(e) => setParams(e.target.value)}
        rows={2}
        placeholder='params JSON e.g. {"key":"value"}'
        style={{
          background: "rgba(41,231,255,0.04)",
          border: "1px solid rgba(41,231,255,0.12)",
          borderRadius: 4,
          color: PU,
          fontFamily: "monospace",
          fontSize: 9,
          outline: "none",
          padding: "4px 7px",
          resize: "vertical",
          width: "100%",
          boxSizing: "border-box",
        }}
      />
      {result && (
        <div style={{ marginTop: 6, background: "rgba(74,222,128,0.06)", borderRadius: 4, padding: "5px 8px" }}>
          <div style={{ color: GN, fontSize: 9, marginBottom: 3 }}>RUN COMPLETE</div>
          <pre style={{ color: GN, fontSize: 9, fontFamily: "monospace", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflowY: "auto" }}>
            {truncate(result, 300)}
          </pre>
        </div>
      )}
      {error && (
        <div style={{ marginTop: 4, color: RD, fontSize: 9 }}>Error: {error}</div>
      )}
    </form>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function ScenarioEnginePanel() {
  const [open, setOpen]         = useState(false);
  const [listData, setListData] = useState(null);
  const [modelsData, setModels] = useState(null);
  const [tab, setTab]           = useState("RUNS");
  const [search, setSearch]     = useState("");
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const pollRef = useRef(null);

  const loadList = useCallback(async () => {
    try {
      const d = await fetchList(50);
      setListData(d);
    } catch { /* keep stale */ }
  }, []);

  const loadModels = useCallback(async () => {
    try {
      const d = await fetchModels();
      setModels(d);
    } catch { /* keep stale */ }
  }, []);

  useEffect(() => {
    loadList();
    pollRef.current = setInterval(loadList, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [loadList]);

  useEffect(() => {
    if (open) loadModels();
  }, [open, loadModels]);

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:scen-toggle", toggle);
    return () => window.removeEventListener("jarvis:scen-toggle", toggle);
  }, []);

  const runs       = listData?.runs ?? [];
  const totalRuns  = listData?.count ?? runs.length;
  const models     = modelsData?.models ?? [];
  const drift      = modelsData?.drift ?? null;

  const now7d = Date.now() - 7 * 86400 * 1000;
  const recent7d = runs.filter((r) => {
    const ts = r.created_at ? new Date(r.created_at).getTime() : 0;
    return ts >= now7d;
  }).length;

  const engines = [...new Set(runs.map((r) => r.engine).filter(Boolean))];

  const filtered = (tab === "MODELS" ? [] : runs).filter((r) => {
    if (!search) return true;
    const hay = `${r.name ?? ""} ${r.engine ?? ""} ${r.status ?? ""}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  const filteredModels = models.filter((m) => {
    if (!search) return true;
    const hay = `${m.name ?? ""} ${m.description ?? ""}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  function handleRunAdded(newRun) {
    setListData((prev) => {
      const existing = prev?.runs ?? [];
      return {
        count: (prev?.count ?? 0) + 1,
        runs: [newRun, ...existing],
      };
    });
    setTab("RUNS");
  }

  async function assess() {
    setAssessing(true); setAssessText("");
    try {
      const script = await buildScenScript();
      setAssessText(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch { setAssessText("Assessment unavailable."); }
    setAssessing(false);
  }

  const badgeColor = totalRuns > 0 ? GN : AM;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Scenario Engine Panel"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 159,
          background: "rgba(10,18,24,0.85)",
          border: `1px solid ${badgeColor}55`,
          borderRadius: 4,
          color: badgeColor,
          cursor: "pointer",
          fontFamily: "monospace",
          fontSize: 9,
          letterSpacing: "0.07em",
          padding: "3px 7px",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        ⊡ SCEN
        {totalRuns > 0 && (
          <span
            style={{
              background: `${GN}33`,
              border: `1px solid ${GN}`,
              borderRadius: 3,
              color: GN,
              fontSize: 8,
              padding: "0 3px",
            }}
          >
            {totalRuns}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        left: 8,
        bottom: 40,
        zIndex: 9200,
        background: "rgba(6,14,20,0.97)",
        border: `1px solid ${CY}33`,
        borderRadius: 10,
        boxShadow: `0 0 32px ${CY}18`,
        width: 480,
        maxHeight: "76vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "monospace",
        overflow: "hidden",
      }}
    >
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          borderBottom: `1px solid ${CY}22`,
          padding: "8px 12px",
          gap: 8,
        }}
      >
        <span style={{ color: CY, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>
          ⊡ SCENARIO ENGINE
        </span>
        {engines.map((e) => (
          <Chip key={e} label={e} color={engineColor(e)} />
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            background: `${CY}11`,
            border: `1px solid ${CY}44`,
            borderRadius: 3,
            color: assessing ? GRAY : CY,
            cursor: assessing ? "wait" : "pointer",
            fontSize: 9,
            padding: "2px 7px",
          }}
        >
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "transparent",
            border: "none",
            color: GRAY,
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
            padding: "0 2px",
          }}
        >
          ×
        </button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <StatTile label="total runs"  value={totalRuns}      color={totalRuns > 0 ? GN : GRAY} />
        <StatTile label="models"      value={models.length}  color={models.length > 0 ? PU : GRAY} />
        <StatTile label="recent 7d"   value={recent7d}       color={recent7d > 0 ? CY : GRAY} />
        <StatTile label="engines"     value={engines.length || "—"} color={engines.length > 0 ? AM : GRAY} />
      </div>

      {/* tabs + search */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "0 12px 8px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {[
          { key: "RUNS",   count: runs.length   },
          { key: "MODELS", count: models.length  },
          { key: "RUN",    count: null            },
        ].map(({ key, count }) => (
          <TabBtn
            key={key}
            label={key}
            active={tab === key}
            count={count}
            onClick={() => setTab(key)}
          />
        ))}
        {tab !== "RUN" && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === "MODELS" ? "search models…" : "search runs…"}
            style={{
              background: "rgba(41,231,255,0.05)",
              border: "1px solid rgba(41,231,255,0.15)",
              borderRadius: 4,
              color: CY,
              fontFamily: "monospace",
              fontSize: 10,
              outline: "none",
              padding: "3px 8px",
              flex: 1,
              minWidth: 100,
            }}
          />
        )}
      </div>

      {/* assess text */}
      {assessText && (
        <div
          style={{
            background: "rgba(41,231,255,0.06)",
            borderTop: `1px solid ${CY}22`,
            color: CY,
            fontSize: 10,
            lineHeight: 1.5,
            padding: "7px 12px",
          }}
        >
          {assessText}
        </div>
      )}

      {/* drift chip */}
      {drift && tab === "MODELS" && (
        <div style={{ display: "flex", gap: 5, padding: "0 12px 6px", flexWrap: "wrap" }}>
          {Object.entries(drift).slice(0, 4).map(([k, v]) => (
            <Chip key={k} label={`${k}: ${typeof v === "number" ? v.toFixed(3) : v}`} color={AM} />
          ))}
        </div>
      )}

      {/* content area */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {tab === "RUN" ? (
          <RunForm onRunComplete={handleRunAdded} />
        ) : tab === "MODELS" ? (
          modelsData === null ? (
            <div style={{ color: GRAY, fontSize: 10, padding: "16px 12px", textAlign: "center" }}>
              Loading models…
            </div>
          ) : filteredModels.length === 0 ? (
            <div style={{ color: GRAY, fontSize: 10, padding: "16px 12px", textAlign: "center" }}>
              {models.length === 0 ? "No models registered." : "No models match."}
            </div>
          ) : (
            filteredModels.map((m, i) => <ModelRow key={m.name ?? i} model={m} />)
          )
        ) : listData === null ? (
          <div style={{ color: GRAY, fontSize: 10, padding: "16px 12px", textAlign: "center" }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ color: GRAY, fontSize: 10, padding: "16px 12px", textAlign: "center" }}>
            {runs.length === 0 ? "No scenario runs yet — use the RUN tab." : "No runs match."}
          </div>
        ) : (
          filtered.map((r, i) => <RunRow key={r.id ?? r.name ?? i} run={r} />)
        )}
      </div>

      {/* footer */}
      <div
        style={{
          borderTop: `1px solid ${CY}22`,
          color: GRAY,
          fontSize: 9,
          padding: "5px 12px",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>
          {tab === "MODELS"
            ? `${filteredModels.length}/${models.length} models`
            : tab === "RUN"
            ? "POST /v1/scenario/run"
            : `${filtered.length}/${runs.length} runs`}
        </span>
        <span>poll 90 s · /v1/scenario</span>
      </div>
    </div>
  );
}
