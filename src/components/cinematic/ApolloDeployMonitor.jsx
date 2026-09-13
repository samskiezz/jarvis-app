/**
 * ApolloDeployMonitor — F282.
 *
 * Deployment fleet dashboard wired to the live Apollo delivery service.
 *
 * Data sources (all real — endpoints in /v1/apollo):
 *   GET  /v1/apollo/fleet          (poll 60 s)
 *        → {environments:[{name,tier,current_version,last_good,ts}], artifacts:int, releases:int}
 *   GET  /v1/apollo/releases?limit=50  (fetch on panel open)
 *        → {releases:[{id,artifact,version,env,strategy,status,ts}]}
 *
 * Displays:
 *   - Stat tiles: environments / artifacts / releases / deployed-count
 *   - FLEET | RELEASES tab switcher + text search
 *   - FLEET: per-env tier chip + current_version + last_good + age
 *   - RELEASES: release history with status chip + artifact@version + env + strategy + age
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence deploy brief + TTS
 *
 * Toggle: ◈ APLD at left:306240, bottom:8, zIndex:160.
 * Badge: green=env-count, amber=no current versions deployed.
 * Auto-refresh: fleet 60 s; releases fetched once on open.
 *
 * Exported helpers for JarvisBrain:
 *   isApldQuery(q) / buildApldScript()
 *
 * Voice triggers: "apollo / deploy / release pipeline / deployment monitor /
 *   fleet status / apld / deployed versions / release history / environment status /
 *   rollout status / deployment fleet / release tracker / latest releases"
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

const BTN_LEFT = 306240;
const POLL_MS  = 60_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const APLD_RE =
  /\b(apollo|deploy(?:ment)?|release\s+pipeline|deployment\s+monitor|fleet\s+status|apld\b|deployed\s+versions|release\s+history|environment\s+status|rollout\s+status|deployment\s+fleet|release\s+tracker|latest\s+releases)\b/i;

export function isApldQuery(q) {
  return APLD_RE.test(q || "");
}

export async function buildApldScript() {
  try {
    const [fleetR, relR] = await Promise.all([
      fetch(`${apiBase()}/v1/apollo/fleet`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/apollo/releases?limit=50`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const fleet = await fleetR.json();
    const rels  = await relR.json();
    window.dispatchEvent(new CustomEvent("jarvis:apld-toggle"));
    const envs    = fleet?.environments ?? [];
    const artCnt  = fleet?.artifacts ?? 0;
    const relCnt  = rels?.releases?.length ?? fleet?.releases ?? 0;
    const deployed = envs.filter((e) => e.current_version).length;
    return (
      `Apollo fleet: ${envs.length} environment${envs.length !== 1 ? "s" : ""} registered, ` +
      `${deployed} with active deployments, ` +
      `${artCnt} artifact${artCnt !== 1 ? "s" : ""} tracked, ` +
      `${relCnt} release${relCnt !== 1 ? "s" : ""} in history. ` +
      (deployed < envs.length
        ? `${envs.length - deployed} environment${envs.length - deployed !== 1 ? "s" : ""} have no current deployment — check the fleet panel for details.`
        : "All environments have an active deployment.")
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:apld-toggle"));
    return "Apollo Deploy Monitor open, sir.";
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

const TIER_LABELS = ["dev", "staging", "canary", "prod"];

function tierLabel(t) {
  if (typeof t === "string") return t;
  return TIER_LABELS[t] ?? `tier${t}`;
}

function tierColor(t) {
  const label = (typeof t === "string" ? t : TIER_LABELS[t] ?? "").toLowerCase();
  if (label === "prod" || label === "production") return RD;
  if (label === "canary")                         return AM;
  if (label === "staging")                        return PU;
  return CY;
}

function statusColor(s) {
  const v = (s || "").toLowerCase();
  if (v === "deployed" || v === "ok" || v === "done") return GN;
  if (v === "rolled_back")                            return AM;
  if (v === "failed" || v === "error")                return RD;
  return GRAY;
}

function strategyColor(s) {
  const v = (s || "").toLowerCase();
  if (v === "blue_green" || v === "blue-green") return CY;
  if (v === "canary")                           return AM;
  if (v === "rolling")                          return PU;
  return GRAY;
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchFleet() {
  const r = await fetch(`${apiBase()}/v1/apollo/fleet`, { headers: hdr() });
  if (!r.ok) throw new Error(`fleet ${r.status}`);
  return r.json();
}

async function fetchReleases(limit = 50) {
  const r = await fetch(`${apiBase()}/v1/apollo/releases?limit=${limit}`, { headers: hdr() });
  if (!r.ok) throw new Error(`releases ${r.status}`);
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

function EnvRow({ env }) {
  const [expanded, setExpanded] = useState(false);
  const tLabel = tierLabel(env.tier);
  const tColor = tierColor(env.tier);
  const hasCurrent = !!env.current_version;

  return (
    <div style={{ borderBottom: "1px solid rgba(41,231,255,0.07)", padding: "6px 8px", cursor: "pointer" }}>
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
      >
        <Chip label={tLabel.toUpperCase()} color={tColor} />
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
          {env.name}
        </span>
        {hasCurrent ? (
          <Chip label={`v${env.current_version}`} color={GN} />
        ) : (
          <Chip label="no deploy" color={DIM} />
        )}
        <span style={{ color: GRAY, fontSize: 9 }}>{age(env.ts)}</span>
        <span style={{ color: GRAY, fontSize: 9 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div
          style={{
            background: "rgba(0,0,0,0.18)",
            borderRadius: 4,
            marginTop: 6,
            padding: "7px 9px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Chip label={`tier: ${tLabel}`} color={tColor} />
            {env.current_version && (
              <Chip label={`current: ${env.current_version}`} color={GN} />
            )}
            {env.last_good && (
              <Chip label={`last good: ${env.last_good}`} color={CY} />
            )}
          </div>
          {env.current_version && env.last_good && env.current_version !== env.last_good && (
            <div style={{ color: AM, fontSize: 9, marginTop: 2 }}>
              ⚠ Current version differs from last known good — possible unstable deploy.
            </div>
          )}
          <div style={{ color: GRAY, fontSize: 9 }}>
            Last updated: {age(env.ts)}
          </div>
        </div>
      )}
    </div>
  );
}

function ReleaseRow({ release }) {
  const [expanded, setExpanded] = useState(false);
  const statusStr   = release.status ?? "unknown";
  const strategyStr = release.strategy ?? "—";
  const artifactStr = release.artifact
    ? `${release.artifact}@${release.version ?? "?"}`
    : release.version ?? "—";

  return (
    <div style={{ borderBottom: "1px solid rgba(41,231,255,0.07)", padding: "6px 8px", cursor: "pointer" }}>
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
      >
        <Chip label={statusStr.toUpperCase()} color={statusColor(statusStr)} />
        <Chip label={release.env ?? "?"}      color={tierColor(release.env ?? "")} />
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
          {artifactStr}
        </span>
        <span style={{ color: GRAY, fontSize: 9 }}>{age(release.ts)}</span>
        <span style={{ color: GRAY, fontSize: 9 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div
          style={{
            background: "rgba(0,0,0,0.18)",
            borderRadius: 4,
            marginTop: 6,
            padding: "7px 9px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {release.id && <Chip label={`id: ${release.id}`} color={GRAY} />}
            <Chip label={`strategy: ${strategyStr}`} color={strategyColor(strategyStr)} />
            {release.approval_id && (
              <Chip label={`approval: ${release.approval_id}`} color={PU} />
            )}
          </div>
          {release.gates && (
            <div style={{ color: GRAY, fontSize: 9 }}>
              gates: {typeof release.gates === "string" ? release.gates : JSON.stringify(release.gates)}
            </div>
          )}
          {release.stages && (
            <div style={{ color: GRAY, fontSize: 9 }}>
              stages: {typeof release.stages === "string" ? release.stages : JSON.stringify(release.stages)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function ApolloDeployMonitor() {
  const [open, setOpen]           = useState(false);
  const [fleetData, setFleetData] = useState(null);
  const [relsData, setRelsData]   = useState(null);
  const [tab, setTab]             = useState("FLEET");
  const [search, setSearch]       = useState("");
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const pollRef = useRef(null);

  const loadFleet = useCallback(async () => {
    try {
      const d = await fetchFleet();
      setFleetData(d);
    } catch { /* keep stale */ }
  }, []);

  const loadReleases = useCallback(async () => {
    try {
      const d = await fetchReleases(50);
      setRelsData(d);
    } catch { /* keep stale */ }
  }, []);

  useEffect(() => {
    loadFleet();
    pollRef.current = setInterval(loadFleet, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [loadFleet]);

  useEffect(() => {
    if (open) loadReleases();
  }, [open, loadReleases]);

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:apld-toggle", toggle);
    return () => window.removeEventListener("jarvis:apld-toggle", toggle);
  }, []);

  const envs      = fleetData?.environments ?? [];
  const artCnt    = fleetData?.artifacts ?? 0;
  const relCnt    = fleetData?.releases ?? 0;
  const deployed  = envs.filter((e) => e.current_version).length;
  const releases  = relsData?.releases ?? [];

  const filteredEnvs = envs.filter((e) => {
    if (!search) return true;
    const hay = `${e.name ?? ""} ${tierLabel(e.tier)} ${e.current_version ?? ""}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  const filteredRels = releases.filter((r) => {
    if (!search) return true;
    const hay = `${r.artifact ?? ""} ${r.version ?? ""} ${r.env ?? ""} ${r.status ?? ""}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  async function assess() {
    setAssessing(true); setAssessText("");
    try {
      const script = await buildApldScript();
      setAssessText(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch { setAssessText("Assessment unavailable."); }
    setAssessing(false);
  }

  const badgeColor = deployed > 0 ? GN : AM;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Apollo Deploy Monitor"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 160,
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
        ◈ APLD
        {envs.length > 0 && (
          <span
            style={{
              background: `${badgeColor}33`,
              border: `1px solid ${badgeColor}`,
              borderRadius: 3,
              color: badgeColor,
              fontSize: 8,
              padding: "0 3px",
            }}
          >
            {deployed}/{envs.length}
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
          ◈ APOLLO DEPLOY
        </span>
        {deployed > 0 && <Chip label={`${deployed} active`} color={GN} />}
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
        <StatTile label="environments" value={envs.length}  color={envs.length > 0 ? CY : GRAY} />
        <StatTile label="artifacts"   value={artCnt}         color={artCnt > 0 ? PU : GRAY} />
        <StatTile label="releases"    value={relCnt}         color={relCnt > 0 ? AM : GRAY} />
        <StatTile label="deployed"    value={deployed}       color={deployed > 0 ? GN : RD} />
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
          { key: "FLEET",    count: envs.length     },
          { key: "RELEASES", count: releases.length  },
        ].map(({ key, count }) => (
          <TabBtn
            key={key}
            label={key}
            active={tab === key}
            count={count}
            onClick={() => setTab(key)}
          />
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === "RELEASES" ? "search releases…" : "search environments…"}
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

      {/* content area */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {tab === "FLEET" ? (
          fleetData === null ? (
            <div style={{ color: GRAY, fontSize: 10, padding: "16px 12px", textAlign: "center" }}>
              Loading fleet…
            </div>
          ) : filteredEnvs.length === 0 ? (
            <div style={{ color: GRAY, fontSize: 10, padding: "16px 12px", textAlign: "center" }}>
              {envs.length === 0 ? "No environments registered." : "No environments match."}
            </div>
          ) : (
            filteredEnvs.map((e, i) => <EnvRow key={e.name ?? i} env={e} />)
          )
        ) : relsData === null ? (
          <div style={{ color: GRAY, fontSize: 10, padding: "16px 12px", textAlign: "center" }}>
            Loading releases…
          </div>
        ) : filteredRels.length === 0 ? (
          <div style={{ color: GRAY, fontSize: 10, padding: "16px 12px", textAlign: "center" }}>
            {releases.length === 0 ? "No releases recorded." : "No releases match."}
          </div>
        ) : (
          filteredRels.map((r, i) => <ReleaseRow key={r.id ?? i} release={r} />)
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
          {tab === "RELEASES"
            ? `${filteredRels.length}/${releases.length} releases`
            : `${filteredEnvs.length}/${envs.length} environments`}
        </span>
        <span>poll 60 s · /v1/apollo</span>
      </div>
    </div>
  );
}
