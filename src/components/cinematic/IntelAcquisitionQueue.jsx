/**
 * IntelAcquisitionQueue — F38.
 * Polls /entities/RiskSignal + /v1/investigations + /knowledge/ to surface
 * topics that appear in active risks/investigations but have no matching
 * knowledge article. Sorted by gap severity (critical-first). ASSESS →
 * /v1/jarvis/agent/chat + /v1/voice/tts. ⚡ IAQ toggle button.
 * Additive only — mounted in App.jsx.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const AM  = "#F59E0B";
const RD  = "#EF4444";
const GR  = "#4ADE80";
const DIM = "#1A2A36";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const IAQ_RE =
  /\bintelligence\s?acquisition|knowledge\s?gap|gap\s?queue|intel\s?queue|iaq\b/i;

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function words(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const wa = new Set(words(a));
  for (const w of words(b)) if (wa.has(w)) return true;
  return false;
}

async function fetchRisks() {
  const r = await fetch(`${apiBase()}/entities/RiskSignal`, { headers: authHdr() });
  const d = await r.json();
  const arr = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
  return arr.map((x) => ({
    id: x.id || x._id || String(Math.random()),
    title: x.title || x.name || x.signal || x.description || "",
    severity: (x.severity || x.level || "medium").toLowerCase(),
  }));
}

async function fetchInvestigations() {
  const r = await fetch(`${apiBase()}/v1/investigations`, { headers: authHdr() });
  const d = await r.json();
  const arr = Array.isArray(d) ? d
    : Array.isArray(d?.data) ? d.data
    : Array.isArray(d?.investigations) ? d.investigations
    : [];
  return arr
    .filter((x) => (x.status || "open") !== "closed")
    .map((x) => ({
      id: x.id || x._id || String(Math.random()),
      title: x.title || x.name || x.case || "",
      priority: (x.priority || "medium").toLowerCase(),
    }));
}

async function fetchKnowledge() {
  const r = await fetch(`${apiBase()}/knowledge/`, { headers: authHdr() });
  const d = await r.json();
  const arr = Array.isArray(d) ? d
    : Array.isArray(d?.data) ? d.data
    : Array.isArray(d?.items) ? d.items
    : Array.isArray(d?.knowledge) ? d.knowledge
    : [];
  return arr.map((x) => x.title || x.name || x.topic || x.subject || "");
}

function severityRank(s) {
  return { critical: 4, high: 3, medium: 2, low: 1 }[s] || 2;
}

function buildGaps(risks, investigations, knowTitles) {
  const gaps = [];
  for (const r of risks) {
    const covered = knowTitles.some((t) => overlap(r.title, t));
    if (!covered) {
      gaps.push({
        id: `risk:${r.id}`,
        topic: r.title,
        source: "Risk Signal",
        severity: r.severity,
        rank: severityRank(r.severity) + 1,
      });
    }
  }
  for (const inv of investigations) {
    const covered = knowTitles.some((t) => overlap(inv.title, t));
    if (!covered) {
      gaps.push({
        id: `inv:${inv.id}`,
        topic: inv.title,
        source: "Investigation",
        severity: inv.priority,
        rank: severityRank(inv.priority),
      });
    }
  }
  gaps.sort((a, b) => b.rank - a.rank);
  return gaps;
}

export function isIaqQuery(text) {
  return IAQ_RE.test(text || "");
}

export async function buildIaqScript() {
  let gaps = [];
  try {
    const [risks, investigations, know] = await Promise.all([
      fetchRisks(),
      fetchInvestigations(),
      fetchKnowledge(),
    ]);
    gaps = buildGaps(risks, investigations, know);
  } catch (_) {}
  if (!gaps.length)
    return "Intelligence acquisition queue is clear — all active risks and investigations have knowledge coverage, sir.";
  const top = gaps.slice(0, 3).map((g) => g.topic).join("; ");
  return (
    `Intelligence acquisition queue has ${gaps.length} gap${gaps.length !== 1 ? "s" : ""}. ` +
    `Top priorities: ${top}. Recommend targeting these for knowledge base expansion.`
  );
}

function SevBadge({ sev }) {
  const clr =
    sev === "critical" ? RD
    : sev === "high"   ? AM
    : sev === "medium" ? CY
    : GR;
  return (
    <span
      style={{
        fontSize: 9, fontWeight: 700, letterSpacing: 1.5, padding: "2px 7px",
        borderRadius: 4, background: clr + "22", color: clr,
        border: `1px solid ${clr}55`, flexShrink: 0,
        textTransform: "uppercase",
      }}
    >
      {sev}
    </span>
  );
}

export default function IntelAcquisitionQueue() {
  const [open, setOpen] = useState(false);
  const [gaps, setGaps] = useState([]);
  const [stats, setStats] = useState({ risks: 0, invs: 0, know: 0 });
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [aiText, setAiText] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [risks, invs, know] = await Promise.all([
        fetchRisks().catch(() => []),
        fetchInvestigations().catch(() => []),
        fetchKnowledge().catch(() => []),
      ]);
      setStats({ risks: risks.length, invs: invs.length, know: know.length });
      setGaps(buildGaps(risks, invs, know));
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:iaq-toggle", handler);
    return () => window.removeEventListener("jarvis:iaq-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 120_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    setAiText("");
    try {
      const script = await buildIaqScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Assess intelligence acquisition gaps: ${gaps.slice(0, 5).map(g => g.topic).join(", ")}. Provide a concise acquisition plan.`,
        }),
      });
      const d = await r.json();
      const reply = d?.response || d?.message || d?.content || script;
      setAiText(reply);
      try {
        await fetch(`${apiBase()}/v1/voice/tts`, {
          method: "POST",
          headers: { ...authHdr(), "Content-Type": "application/json" },
          body: JSON.stringify({ text: reply.slice(0, 400), voice: getActiveVoice() }),
        });
      } catch (_) {}
    } catch (_) {
      const fallback = await buildIaqScript();
      setAiText(fallback);
    }
    setAssessing(false);
  }

  const critCount = gaps.filter((g) => g.severity === "critical").length;
  const highCount = gaps.filter((g) => g.severity === "high").length;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Intelligence Acquisition Queue (F38)"
        style={{
          position: "fixed", bottom: 10, left: 9260, zIndex: 100,
          background: open ? `${CY}22` : "rgba(0,4,10,0.85)",
          border: `1px solid ${open ? CY : CY + "44"}`,
          borderRadius: 6, color: open ? CY : CY + "88",
          fontSize: 10, letterSpacing: 1.5, padding: "4px 10px",
          cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: "nowrap",
        }}
      >
        ⚡ IAQ{critCount > 0 ? ` ${critCount}!` : ""}
      </button>

      {open && (
        <div
          style={{
            position: "fixed", bottom: 38, right: 16, zIndex: 150,
            width: "min(560px, 96vw)", maxHeight: "72vh",
            background: "rgba(4,8,16,0.97)",
            border: `1px solid ${CY}44`, borderRadius: 14,
            boxShadow: `0 0 60px ${CY}14, 0 20px 48px rgba(0,0,0,0.9)`,
            fontFamily: "'JetBrains Mono',monospace",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              borderBottom: `1px solid ${CY}33`, padding: "12px 16px",
              display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
            }}
          >
            <span style={{ color: CY, fontSize: 14 }}>⚡</span>
            <span style={{ color: CY, fontSize: 12, fontWeight: 700, letterSpacing: 2, flex: 1 }}>
              INTEL ACQUISITION QUEUE
            </span>
            <span style={{ color: "#3A5060", fontSize: 10 }}>
              {stats.risks}R · {stats.invs}I · {stats.know}K
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none", border: "none", color: "#3A5060",
                cursor: "pointer", fontSize: 14, lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          {/* Stats row */}
          <div
            style={{
              display: "flex", gap: 12, padding: "8px 16px",
              borderBottom: `1px solid ${CY}1A`, flexShrink: 0,
            }}
          >
            {[
              { label: "GAPS", value: gaps.length, clr: CY },
              { label: "CRITICAL", value: critCount, clr: RD },
              { label: "HIGH", value: highCount, clr: AM },
              { label: "KNOWLEDGE DOCS", value: stats.know, clr: GR },
            ].map(({ label, value, clr }) => (
              <div key={label} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ color: clr, fontSize: 16, fontWeight: 700 }}>{value}</div>
                <div style={{ color: "#3A5060", fontSize: 8, letterSpacing: 1.5, marginTop: 1 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Gap list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {loading && !gaps.length && (
              <div style={{ color: "#3A5060", fontSize: 11, textAlign: "center", padding: 24 }}>
                Scanning knowledge gaps…
              </div>
            )}
            {!loading && !gaps.length && (
              <div style={{ color: GR, fontSize: 11, textAlign: "center", padding: 24 }}>
                ✓ All active risks and investigations have knowledge coverage.
              </div>
            )}
            {gaps.map((g, i) => (
              <div
                key={g.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "7px 16px",
                  borderLeft: g.severity === "critical" ? `2px solid ${RD}` : "2px solid transparent",
                  background: i % 2 === 0 ? `${DIM}80` : "transparent",
                }}
              >
                <span style={{ color: "#3A5060", fontSize: 9, minWidth: 20 }}>{i + 1}</span>
                <span style={{ color: "#AABBC8", fontSize: 11, flex: 1, letterSpacing: 0.3 }}>
                  {g.topic.slice(0, 60)}{g.topic.length > 60 ? "…" : ""}
                </span>
                <span style={{ color: "#3A5060", fontSize: 9, letterSpacing: 1, flexShrink: 0 }}>
                  {g.source === "Risk Signal" ? "◈ RISK" : "⊕ INV"}
                </span>
                <SevBadge sev={g.severity} />
              </div>
            ))}
          </div>

          {/* AI response */}
          {aiText && (
            <div
              style={{
                borderTop: `1px solid ${CY}1A`, padding: "10px 16px",
                color: "#7A95AB", fontSize: 10, lineHeight: 1.6, flexShrink: 0,
                maxHeight: 90, overflowY: "auto",
              }}
            >
              {aiText}
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              borderTop: `1px solid ${CY}1A`, padding: "8px 16px",
              display: "flex", gap: 10, alignItems: "center", flexShrink: 0,
            }}
          >
            <button
              onClick={assess}
              disabled={assessing || !gaps.length}
              style={{
                background: assessing ? `${CY}11` : `${CY}22`,
                border: `1px solid ${CY}55`, borderRadius: 6, color: CY,
                fontSize: 9, letterSpacing: 1.5, padding: "5px 14px",
                cursor: assessing || !gaps.length ? "not-allowed" : "pointer",
                opacity: !gaps.length ? 0.4 : 1,
              }}
            >
              {assessing ? "ASSESSING…" : "▶ ASSESS"}
            </button>
            <button
              onClick={load}
              disabled={loading}
              style={{
                background: "none", border: `1px solid ${CY}33`,
                borderRadius: 6, color: CY + "88",
                fontSize: 9, letterSpacing: 1.5, padding: "5px 12px",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "…" : "↺"}
            </button>
            <span style={{ marginLeft: "auto", color: "#2E4050", fontSize: 9, letterSpacing: 1 }}>
              auto-refresh 120s
            </span>
          </div>
        </div>
      )}
    </>
  );
}
