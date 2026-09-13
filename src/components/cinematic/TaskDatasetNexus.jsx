/**
 * TaskDatasetNexus — F539 (TDSET)
 * "JARVIS, task dataset / dataset task / tdset / which tasks have data / data-backed tasks"
 * Cross-references /entities/Task + /v1/datasets.
 * Finds GROUNDED tasks (≥1 dataset keyword-matches) vs UNGROUNDED (no data backing).
 * Coverage % tile; ALL/GROUNDED/UNGROUNDED filter tabs + search; click-to-expand matched datasets.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence data-readiness brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 44_460;
const Z_INDEX  = 110;

const TDSET_RE =
  /\btdset\b|\btask.?dataset\b|\bdataset.?task\b|\bwhich.?tasks?.?have.?data\b|\bdata.?backed.?tasks?\b|\bungrounded.?task.?data\b|\btask.?data.?coverage\b|\btask.?data.?backing\b|\bdata.?grounded.?tasks?\b/i;

export function isTdsetQuery(text) {
  return TDSET_RE.test(text || "");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseTasks(data) {
  if (!data) return [];
  const raw =
    data.tasks || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((t, i) => ({
    id:          t.id || `task-${i}`,
    title:       t.title || t.name || `Task ${i + 1}`,
    description: t.description || t.body || t.summary || "",
    status:      (t.status || "PENDING").toUpperCase(),
    tags:        Array.isArray(t.tags) ? t.tags.join(" ") : String(t.tags || ""),
  }));
}

function normaliseDatasets(data) {
  if (!data) return [];
  const raw =
    data.datasets || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((d, i) => ({
    id:   d.id || `ds-${i}`,
    name: d.name || d.title || `Dataset ${i + 1}`,
    kind: (d.kind || d.type || d.format || "TABLE").toUpperCase(),
    rows: typeof d.rows === "number" ? d.rows : (typeof d.row_count === "number" ? d.row_count : null),
    tags: Array.isArray(d.tags) ? d.tags.join(" ") : String(d.tags || ""),
  }));
}

function crossRef(tasks, datasets) {
  return tasks.map((task) => {
    const haystack = `${task.title} ${task.description} ${task.tags}`;
    const matches = datasets
      .map((ds) => ({
        ds,
        hits: overlap(haystack, `${ds.name} ${ds.kind} ${ds.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...task,
      grounded: matches.length > 0,
      matches: matches.map(({ ds, hits }) => ({ ...ds, hits })),
    };
  });
}

// ─── buildTdsetScript (for JarvisBrain) ──────────────────────────────────────

export async function buildTdsetScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [tasksRes, datasetsRes] = await Promise.all([
      fetch(`${base}/entities/Task`, { headers: hdr }).then((r) => r.ok ? r.json() : {}),
      fetch(`${base}/v1/datasets`,   { headers: hdr }).then((r) => r.ok ? r.json() : {}),
    ]);

    const tasks    = normaliseTasks(tasksRes);
    const datasets = normaliseDatasets(datasetsRes);
    const crossed  = crossRef(tasks, datasets);

    const total      = crossed.length;
    const grounded   = crossed.filter((t) => t.grounded).length;
    const ungrounded = total - grounded;
    const coverage   = total > 0 ? Math.round((grounded / total) * 100) : 0;
    const topUngrounded = crossed
      .filter((t) => !t.grounded)
      .slice(0, 2)
      .map((t) => t.title)
      .join(", ");

    const prompt = `JARVIS task-dataset nexus: ${total} active tasks cross-referenced against ${datasets.length} datasets. ${grounded} tasks are grounded in dataset data (${coverage}% coverage). ${ungrounded} tasks have no dataset backing — they may be operating on assumptions. Top ungrounded tasks: ${topUngrounded || "none"}. Provide a 2-sentence data-readiness brief.`;
    const chatRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt }),
    });
    const chatData = chatRes.ok ? await chatRes.json() : {};
    const brief =
      chatData.response || chatData.message || chatData.content ||
      `${grounded} of ${total} tasks are backed by dataset data (${coverage}% coverage). ${ungrounded} tasks lack any dataset grounding — consider linking data sources to these missions.`;

    window.dispatchEvent(
      new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } })
    );
    return brief;
  } catch (err) {
    return `Task-dataset nexus error: ${err.message}`;
  }
}

// ─── status colour ────────────────────────────────────────────────────────────

function statusColor(status) {
  if (status === "DONE" || status === "COMPLETED") return GRN;
  if (status === "IN_PROGRESS" || status === "ACTIVE") return CY;
  if (status === "BLOCKED")                            return "#FF3B3B";
  return DIM;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function TaskDatasetNexus() {
  const [open, setOpen]           = useState(false);
  const [crossed, setCrossed]     = useState([]);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]         = useState("");
  const [loading, setLoading]     = useState(false);
  const timerRef = useRef(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [tasksRes, datasetsRes] = await Promise.all([
        fetch(`${base}/entities/Task`, { headers: hdr }).then((r) => r.ok ? r.json() : {}),
        fetch(`${base}/v1/datasets`,   { headers: hdr }).then((r) => r.ok ? r.json() : {}),
      ]);
      const tasks    = normaliseTasks(tasksRes);
      const datasets = normaliseDatasets(datasetsRes);
      setCrossed(crossRef(tasks, datasets));
    } catch (_) {
      /* network unavailable */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:tdset-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tdset-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetch_();
    timerRef.current = setInterval(fetch_, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetch_]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const result = await buildTdsetScript();
      setBrief(result);
    } finally {
      setAssessing(false);
    }
  }, []);

  const grounded   = crossed.filter((t) => t.grounded);
  const ungrounded = crossed.filter((t) => !t.grounded);
  const coverage   = crossed.length > 0
    ? Math.round((grounded.length / crossed.length) * 100)
    : 0;

  const visible = crossed
    .filter((t) => {
      if (tab === "GROUNDED")   return t.grounded;
      if (tab === "UNGROUNDED") return !t.grounded;
      return true;
    })
    .filter((t) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    });

  const btnStyle = {
    position: "fixed",
    bottom: 8,
    left: BTN_LEFT,
    zIndex: Z_INDEX,
    background: "rgba(0,20,40,0.85)",
    border: `1px solid ${!open ? DIM : CY}`,
    color: !open ? DIM : CY,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "3px 7px",
    cursor: "pointer",
    borderRadius: 3,
    whiteSpace: "nowrap",
  };

  if (!open) {
    return (
      <button
        style={btnStyle}
        onClick={() => setOpen(true)}
        title="Task × Dataset Nexus (TDSET)"
      >
        ◈ TDSET{ungrounded.length > 0 && (
          <span style={{ color: AMB, marginLeft: 4 }}>{ungrounded.length}</span>
        )}
      </button>
    );
  }

  const panel = {
    position: "fixed",
    bottom: 36,
    left: Math.min(BTN_LEFT, window.innerWidth - 480),
    width: 460,
    maxHeight: "75vh",
    overflowY: "auto",
    zIndex: Z_INDEX + 1,
    background: "rgba(0,10,25,0.97)",
    border: `1px solid ${CY}`,
    borderRadius: 6,
    fontFamily: "monospace",
    fontSize: 11,
    color: CY,
    padding: 14,
    boxShadow: `0 0 24px ${CY}44`,
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(false)}>
        ◈ TDSET ✕
      </button>

      <div style={panel}>
        <div style={{ fontSize: 13, fontWeight: "bold", marginBottom: 10 }}>
          ◈ TASK × DATASET NEXUS
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[
            ["TASKS",      crossed.length,    CY],
            ["GROUNDED",   grounded.length,   GRN],
            ["UNGROUNDED", ungrounded.length, AMB],
            ["COVERAGE",   `${coverage}%`,    coverage > 40 ? GRN : AMB],
          ].map(([label, val, col]) => (
            <div
              key={label}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${col}55`,
                borderRadius: 4,
                padding: "4px 6px",
                textAlign: "center",
              }}
            >
              <div style={{ color: col, fontSize: 14, fontWeight: "bold" }}>{val}</div>
              <div style={{ color: DIM, fontSize: 9 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {["ALL", "GROUNDED", "UNGROUNDED"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? CY : "transparent",
                color: tab === t ? "#000" : DIM,
                border: `1px solid ${tab === t ? CY : DIM}`,
                borderRadius: 3,
                padding: "2px 8px",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${DIM}`,
            borderRadius: 3,
            color: CY,
            padding: "3px 6px",
            fontSize: 10,
            marginBottom: 8,
            boxSizing: "border-box",
          }}
        />

        {/* list */}
        {loading && !crossed.length ? (
          <div style={{ color: DIM, textAlign: "center", padding: 20 }}>FETCHING…</div>
        ) : visible.length === 0 ? (
          <div style={{ color: DIM, padding: 12 }}>No tasks match.</div>
        ) : (
          visible.map((task) => (
            <div
              key={task.id}
              style={{
                borderBottom: "1px solid rgba(41,231,255,0.1)",
                paddingBottom: 8,
                marginBottom: 8,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                onClick={() => setExpanded(expanded === task.id ? null : task.id)}
              >
                <span
                  style={{
                    fontSize: 9,
                    padding: "1px 5px",
                    borderRadius: 3,
                    background: task.grounded ? `${GRN}22` : `${AMB}22`,
                    color: task.grounded ? GRN : AMB,
                    border: `1px solid ${task.grounded ? GRN : AMB}55`,
                    flexShrink: 0,
                  }}
                >
                  {task.grounded ? "GROUNDED" : "UNGROUNDED"}
                </span>
                <span style={{ color: task.grounded ? CY : DIM, flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {task.title}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    padding: "1px 4px",
                    borderRadius: 2,
                    background: `${statusColor(task.status)}22`,
                    color: statusColor(task.status),
                    border: `1px solid ${statusColor(task.status)}55`,
                    flexShrink: 0,
                  }}
                >
                  {task.status}
                </span>
                <span style={{ color: DIM }}>{expanded === task.id ? "▲" : "▼"}</span>
              </div>

              {expanded === task.id && (
                <div style={{ marginTop: 6, paddingLeft: 8 }}>
                  {task.description && (
                    <div style={{ color: DIM, fontSize: 10, marginBottom: 4, lineHeight: 1.4 }}>
                      {task.description.slice(0, 120)}{task.description.length > 120 ? "…" : ""}
                    </div>
                  )}
                  {task.matches.length === 0 ? (
                    <div style={{ color: AMB, fontSize: 10 }}>No datasets correlated.</div>
                  ) : (
                    task.matches.slice(0, 5).map((ds) => (
                      <div
                        key={ds.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 6,
                          marginBottom: 4,
                          paddingLeft: 4,
                          borderLeft: `2px solid ${GRN}55`,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 8,
                            padding: "1px 4px",
                            borderRadius: 2,
                            background: `${CY}22`,
                            color: CY,
                            border: `1px solid ${CY}44`,
                            flexShrink: 0,
                            marginTop: 1,
                          }}
                        >
                          {ds.kind}
                        </span>
                        <div style={{ flexGrow: 1 }}>
                          <div style={{ color: CY, fontSize: 10 }}>{ds.name}</div>
                          {ds.rows !== null && (
                            <div style={{ color: DIM, fontSize: 9 }}>{ds.rows.toLocaleString()} rows</div>
                          )}
                        </div>
                        <span style={{ color: DIM, fontSize: 9, flexShrink: 0 }}>{ds.hits}↑</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {/* assess */}
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            marginTop: 8,
            width: "100%",
            background: assessing ? "transparent" : `${GRN}22`,
            border: `1px solid ${GRN}`,
            color: GRN,
            borderRadius: 3,
            padding: "4px 0",
            cursor: assessing ? "not-allowed" : "pointer",
            fontSize: 10,
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>

        {brief && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              background: "rgba(0,229,160,0.06)",
              border: `1px solid ${GRN}44`,
              borderRadius: 4,
              color: GRN,
              fontSize: 10,
              lineHeight: 1.5,
            }}
          >
            {brief}
          </div>
        )}
      </div>
    </>
  );
}
