/**
 * DailyPriorityDigest — F577
 * "JARVIS, daily priorities / priority digest / dpdig / what needs attention / top priorities"
 * Aggregates top-priority items from:
 *   /entities/Task (BLOCKED + high-priority statuses)
 *   /entities/RiskSignal (CRITICAL + HIGH severity)
 *   /v1/investigations (OPEN + ESCALATED)
 *   /v1/ops/events (CRITICAL severity)
 * Ranks all items by urgency score → unified priority digest.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const RED = "#FF4455";
const AMB = "#FFA500";
const GRN = "#00E5A0";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 60_000;
const BTN_LEFT = 66_820;
const Z_INDEX  = 136;

const DPDIG_RE =
  /\bdpdig\b|\bdaily.?priorit(?:y|ies)\b|\bpriority.?digest\b|\bwhat.?needs.?attention\b|\btop.?priorit(?:y|ies)\b|\bpriority.?list\b|\burgent.?items\b|\baction.?items\b|\bpriority.?board\b/i;

export function isDpdigQuery(text) {
  return DPDIG_RE.test(text || "");
}

const URGENCY = {
  // Task statuses
  BLOCKED: 90,
  ESCALATED: 85,
  CRITICAL: 100,
  HIGH: 70,
  OPEN: 40,
  IN_PROGRESS: 30,
  ACTIVE: 35,
  PENDING: 20,
  // default
  _: 10,
};

function score(item) {
  const s = (item.severity || item.status || item.priority || "").toUpperCase();
  return URGENCY[s] ?? URGENCY._;
}

function urgencyColor(s) {
  const u = score({ severity: s, status: s, priority: s });
  if (u >= 90) return RED;
  if (u >= 70) return AMB;
  if (u >= 40) return CY;
  return DIM;
}

function kindLabel(kind) {
  const map = { TASK: "TASK", RISK: "RISK", CASE: "CASE", OPS: "OPS" };
  return map[kind] || kind;
}

function kindColor(kind) {
  if (kind === "RISK" || kind === "OPS") return RED;
  if (kind === "CASE") return AMB;
  return CY;
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function loadItems() {
  const base = apiBase();
  const [tasks, risks, investigations, events] = await Promise.allSettled([
    fetchJson(`${base}/entities/Task`),
    fetchJson(`${base}/entities/RiskSignal`),
    fetchJson(`${base}/v1/investigations`),
    fetchJson(`${base}/v1/ops/events`),
  ]);

  const all = [];

  const taskList = tasks.status === "fulfilled"
    ? (Array.isArray(tasks.value) ? tasks.value : tasks.value?.items ?? tasks.value?.results ?? [])
    : [];
  taskList.forEach((t) => {
    const st = (t.status || "").toUpperCase();
    if (["BLOCKED", "ESCALATED", "CRITICAL", "HIGH"].includes(st)) {
      all.push({
        id: `task-${t.id || t.name}`,
        kind: "TASK",
        title: t.title || t.name || t.id || "Unnamed Task",
        status: st,
        detail: t.description || t.details || t.notes || "",
        urgency: URGENCY[st] ?? 50,
      });
    }
  });

  const riskList = risks.status === "fulfilled"
    ? (Array.isArray(risks.value) ? risks.value : risks.value?.items ?? risks.value?.results ?? [])
    : [];
  riskList.forEach((r) => {
    const sev = (r.severity || r.level || "").toUpperCase();
    if (["CRITICAL", "HIGH"].includes(sev)) {
      all.push({
        id: `risk-${r.id || r.signal_id || r.name}`,
        kind: "RISK",
        title: r.title || r.name || r.signal_type || "Unknown Risk",
        status: sev,
        detail: r.description || r.summary || "",
        urgency: URGENCY[sev] ?? 70,
      });
    }
  });

  const caseList = investigations.status === "fulfilled"
    ? (Array.isArray(investigations.value) ? investigations.value
        : investigations.value?.items ?? investigations.value?.investigations ?? [])
    : [];
  caseList.forEach((c) => {
    const st = (c.status || "").toUpperCase();
    if (["OPEN", "ESCALATED", "ACTIVE"].includes(st)) {
      all.push({
        id: `case-${c.id || c.case_id}`,
        kind: "CASE",
        title: c.title || c.name || c.case_id || "Unknown Case",
        status: st,
        detail: c.summary || c.description || c.lead || "",
        urgency: URGENCY[st] ?? 40,
      });
    }
  });

  const evList = events.status === "fulfilled"
    ? (Array.isArray(events.value) ? events.value : events.value?.items ?? events.value?.events ?? [])
    : [];
  evList.forEach((e) => {
    const sev = (e.severity || e.level || "").toUpperCase();
    if (sev === "CRITICAL") {
      all.push({
        id: `ops-${e.id || e.event_id}`,
        kind: "OPS",
        title: e.title || e.action || e.name || "Critical Ops Event",
        status: sev,
        detail: e.description || e.source || "",
        urgency: 95,
      });
    }
  });

  all.sort((a, b) => b.urgency - a.urgency);
  return all;
}

export async function buildDpdigScript() {
  try {
    const items = await loadItems();
    const critical = items.filter((i) => i.urgency >= 90);
    const high = items.filter((i) => i.urgency >= 70 && i.urgency < 90);
    const top3 = items.slice(0, 3).map((i) => `${i.kind}:${i.title.slice(0, 30)}`).join(", ");
    const summary = [
      `Priority digest: ${items.length} urgent items — ${critical.length} critical, ${high.length} high.`,
      `Top priorities: ${top3 || "none identified"}.`,
    ].join(" ");
    return summary;
  } catch {
    return "Priority digest unavailable — check backend connectivity.";
  }
}

export default function DailyPriorityDigest() {
  const [open, setOpen]       = useState(false);
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [tab, setTab]         = useState("ALL");
  const [query, setQuery]     = useState("");
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]     = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all = await loadItems();
      setItems(all);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen((o) => !o); };
    window.addEventListener("jarvis:dpdig-toggle", handler);
    return () => window.removeEventListener("jarvis:dpdig-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [open, refresh]);

  const critical = items.filter((i) => i.urgency >= 90).length;

  const tabs = ["ALL", "CRITICAL", "HIGH", "OPEN"];
  const visible = items.filter((i) => {
    if (tab === "CRITICAL" && i.urgency < 90) return false;
    if (tab === "HIGH" && (i.urgency < 70 || i.urgency >= 90)) return false;
    if (tab === "OPEN" && i.kind !== "CASE") return false;
    if (query && !`${i.title} ${i.detail} ${i.kind}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  async function handleAssess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const top = items.slice(0, 10).map((i) => `[${i.kind}] ${i.title} (${i.status})`).join("; ");
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Daily Priority Digest — top urgent items: ${top}. In 2 sentences, summarize the operational situation and the single most critical action needed.`,
        }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || "";
      setBrief(text);
      if (text) {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: text.slice(0, 300) }),
        });
      }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z_INDEX,
          background: open ? `${RED}22` : "rgba(10,20,30,0.82)",
          border: `1px solid ${open ? RED : RED + "55"}`,
          color: open ? RED : RED + "99",
          fontFamily: "monospace",
          fontSize: 9,
          padding: "3px 7px",
          borderRadius: 3,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
        title="Daily Priority Digest"
      >
        ◈ DPDIG
        {critical > 0 && (
          <span style={{
            marginLeft: 4, background: RED, color: "#fff",
            borderRadius: "50%", fontSize: 8, padding: "0 4px",
          }}>
            {critical}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed",
          right: 8,
          top: 48,
          width: 360,
          maxHeight: "80vh",
          overflowY: "auto",
          background: "rgba(5,15,25,0.96)",
          border: `1px solid ${RED}55`,
          borderRadius: 6,
          padding: 12,
          zIndex: Z_INDEX + 1,
          fontFamily: "monospace",
          boxShadow: `0 0 24px ${RED}22`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <span style={{ color: RED, fontSize: 12, fontWeight: "bold" }}>◈ DAILY PRIORITY DIGEST</span>
              <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>
                {items.length} urgent items · {critical} critical
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={handleAssess}
                disabled={assessing || items.length === 0}
                style={{
                  background: assessing ? `${RED}22` : `${RED}18`,
                  border: `1px solid ${RED}55`,
                  color: RED, fontSize: 9, padding: "2px 8px",
                  borderRadius: 3, cursor: assessing ? "wait" : "pointer",
                }}
              >
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none", border: `1px solid ${DIM}44`,
                  color: DIM, fontSize: 9, padding: "2px 6px",
                  borderRadius: 3, cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* AI Brief */}
          {brief && (
            <div style={{
              background: `${RED}11`, border: `1px solid ${RED}33`,
              borderRadius: 4, padding: "6px 8px", marginBottom: 8, fontSize: 10, color: CY,
            }}>
              {brief}
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${RED}22` : "none",
                  border: `1px solid ${tab === t ? RED : RED + "33"}`,
                  color: tab === t ? RED : DIM,
                  cursor: "pointer", padding: "2px 10px", borderRadius: 3,
                  fontSize: 10,
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search priorities…"
            style={{
              width: "100%", background: `${RED}08`, border: `1px solid ${RED}33`,
              color: CY, padding: "4px 8px", borderRadius: 3, fontSize: 10,
              marginBottom: 8, boxSizing: "border-box",
            }}
          />

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[
              { label: "CRITICAL", value: items.filter((i) => i.urgency >= 90).length, color: RED },
              { label: "HIGH", value: items.filter((i) => i.urgency >= 70 && i.urgency < 90).length, color: AMB },
              { label: "OPEN CASES", value: items.filter((i) => i.kind === "CASE").length, color: CY },
            ].map((tile) => (
              <div key={tile.label} style={{
                flex: 1, background: `${tile.color}0A`, border: `1px solid ${tile.color}33`,
                borderRadius: 4, padding: "4px 6px", textAlign: "center",
              }}>
                <div style={{ color: tile.color, fontSize: 14, fontWeight: "bold" }}>{tile.value}</div>
                <div style={{ color: DIM, fontSize: 8 }}>{tile.label}</div>
              </div>
            ))}
          </div>

          {/* Items */}
          {loading ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>No priority items match.</div>
          ) : (
            visible.map((item) => (
              <div key={item.id}>
                <div
                  onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 6px", marginBottom: 3, cursor: "pointer",
                    borderRadius: 3,
                    background: `${urgencyColor(item.status)}08`,
                    border: `1px solid ${urgencyColor(item.status)}33`,
                  }}
                >
                  <span style={{
                    fontSize: 8, padding: "1px 4px", borderRadius: 2,
                    background: `${kindColor(item.kind)}18`,
                    color: kindColor(item.kind),
                    minWidth: 28, textAlign: "center",
                  }}>
                    {kindLabel(item.kind)}
                  </span>
                  <span style={{
                    flex: 1, fontSize: 10,
                    color: urgencyColor(item.status),
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {item.title}
                  </span>
                  <span style={{
                    fontSize: 8, padding: "1px 4px", borderRadius: 2,
                    background: `${urgencyColor(item.status)}18`,
                    color: urgencyColor(item.status),
                  }}>
                    {item.status}
                  </span>
                  <span style={{ fontSize: 8, color: DIM }}>{item.urgency}</span>
                </div>

                {expanded === item.id && (
                  <div style={{ marginLeft: 12, marginBottom: 6, fontSize: 9, color: DIM }}>
                    {item.detail ? item.detail.slice(0, 160) : "No additional detail."}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
