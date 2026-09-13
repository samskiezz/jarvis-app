/**
 * CoordinatedResponsePlanner — F245 (CRP)
 *
 * User types an event/incident description → JARVIS parallel-fetches
 * /v1/investigations + /entities/Task + /v1/aip/skill + /v1/scenario/list,
 * keyword-correlates each against the description, then sends a rich
 * context payload to /v1/jarvis/agent/chat for an AI-generated
 * coordinated response plan. Result is displayed + spoken via
 * jarvis:speak-dossier TTS.
 *
 * Voice intents: "coordinate response" | "response plan" | "crp"
 *   | "plan response" | "respond to" | "incident response"
 * Toggle: ◈ CRP button strip (bottom bar)
 * Custom event: jarvis:crp-toggle
 *
 * Additive only — mounted via App.jsx; intent exports for JarvisBrain.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFD700";
const RED = "#FF4D6D";
const PRP = "#B485FF";

const BTN_LEFT = 55640;
const REFRESH_MS = 0; // on-demand only
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const hdrs = { Authorization: `Bearer ${API_KEY}` };

const CRP_RE =
  /\b(coord(inate)?.response|response.plan|crp|plan.response|respond.to|incident.response|coordinate.incident|what.should.i.do|how.do.i.respond)\b/i;

export function isCrpQuery(t) {
  return CRP_RE.test(t || "");
}

export async function buildCrpScript() {
  return (
    "Use the CRP panel to coordinate a response. Type your incident description and click COORDINATE. " +
    "JARVIS will pull active investigations, tasks, skills, and scenarios then produce a response plan."
  );
}

/* ── fetchers ─────────────────────────────────────────────────────────────── */

async function fetchAll() {
  const [invR, taskR, skillR, scenR] = await Promise.allSettled([
    fetch(`${apiBase()}/v1/investigations`, { headers: hdrs }),
    fetch(`${apiBase()}/entities/Task`, { headers: hdrs }),
    fetch(`${apiBase()}/v1/aip/skill`, { headers: hdrs }),
    fetch(`${apiBase()}/v1/scenario/list`, { headers: hdrs }),
  ]);

  const safe = async (r) => {
    if (r.status !== "fulfilled" || !r.value.ok) return [];
    try { return await r.value.json(); } catch { return []; }
  };

  const inv   = await safe(invR);
  const tasks = await safe(taskR);
  const skill = await safe(skillR);
  const scen  = await safe(scenR);

  return {
    investigations: Array.isArray(inv) ? inv : (inv?.items ?? inv?.data ?? []),
    tasks: Array.isArray(tasks) ? tasks : (tasks?.items ?? tasks?.data ?? []),
    skills: Array.isArray(skill) ? skill : (skill?.items ?? skill?.data ?? []),
    scenarios: Array.isArray(scen) ? scen : (scen?.items ?? scen?.data ?? []),
  };
}

function kwMatch(text, keywords) {
  const kws = keywords.toLowerCase().split(/\s+/).filter(k => k.length > 3);
  const t = text.toLowerCase();
  return kws.filter(k => t.includes(k)).length;
}

function correlate(collection, description, fields) {
  return collection
    .map(item => {
      const blob = fields.map(f => String(item[f] || "")).join(" ");
      const score = kwMatch(blob, description);
      return { item, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(x => x.item);
}

async function fetchPlan(description, ctx) {
  const prompt = [
    `Incident/Event: "${description}"`,
    "",
    ctx.investigations.length
      ? `Related open investigations (${ctx.investigations.length}): ${ctx.investigations.map(i => i.title || i.name || i.id).join(", ")}`
      : "No related investigations found.",
    ctx.tasks.length
      ? `Related tasks (${ctx.tasks.length}): ${ctx.tasks.map(t => t.title || t.name || t.id).join(", ")}`
      : "No related tasks found.",
    ctx.skills.length
      ? `Available skills (${ctx.skills.length}): ${ctx.skills.map(s => s.name || s.id).join(", ")}`
      : "No matching skills found.",
    ctx.scenarios.length
      ? `Applicable scenarios/playbooks (${ctx.scenarios.length}): ${ctx.scenarios.map(s => s.name || s.title || s.id).join(", ")}`
      : "No applicable scenarios found.",
    "",
    "Produce a concise 4-step coordinated response plan. Be specific and actionable. " +
    "Reference the actual investigations, tasks, skills, and scenarios above where relevant.",
  ].join("\n");

  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { ...hdrs, "Content-Type": "application/json" },
    body: JSON.stringify({ message: prompt }),
  });
  if (!r.ok) throw new Error(`AI ${r.status}`);
  const d = await r.json();
  return d?.response || d?.message || d?.content || "No plan returned.";
}

/* ── component ────────────────────────────────────────────────────────────── */

export default function CoordinatedResponsePlanner() {
  const [open, setOpen]         = useState(false);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [plan, setPlan]         = useState(null);
  const [ctx, setCtx]           = useState(null);
  const [history, setHistory]   = useState([]);
  const [err, setErr]           = useState(null);
  const inputRef                = useRef(null);

  const toggle = useCallback(() => setOpen(o => !o), []);

  /* listen for voice/keyboard toggle */
  useEffect(() => {
    const onToggle = () => toggle();
    const onAsk = (e) => {
      const q = e.detail?.query || "";
      if (isCrpQuery(q)) { setOpen(true); }
    };
    window.addEventListener("jarvis:crp-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:crp-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, [toggle]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  const coordinate = useCallback(async () => {
    const desc = input.trim();
    if (!desc || loading) return;
    setLoading(true);
    setErr(null);
    setPlan(null);
    setCtx(null);
    try {
      const all = await fetchAll();
      const corr = {
        investigations: correlate(all.investigations, desc, ["title","name","description","notes","tags"]),
        tasks:          correlate(all.tasks,          desc, ["title","name","description","notes","tags"]),
        skills:         correlate(all.skills,         desc, ["name","description","category","tags"]),
        scenarios:      correlate(all.scenarios,      desc, ["name","title","description","tags"]),
      };
      setCtx(corr);
      const text = await fetchPlan(desc, corr);
      setPlan(text);
      setHistory(h => [{ desc, plan: text, ts: Date.now() }, ...h].slice(0, 6));
      /* speak the plan */
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

  const onKey = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) coordinate();
  };

  if (!open) {
    return (
      <button
        onClick={toggle}
        title="Coordinated Response Planner (CRP)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 110,
          background: "rgba(5,10,18,0.88)",
          border: `1px solid ${PRP}55`,
          borderRadius: 6, padding: "3px 10px",
          color: PRP, fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: 1, cursor: "pointer",
        }}
      >
        ◈ CRP
      </button>
    );
  }

  return (
    <>
      <div
        onClick={toggle}
        style={{ position: "fixed", inset: 0, zIndex: 190, background: "rgba(0,4,10,0.65)" }}
      />
      <div style={{
        position: "fixed", top: "10vh", left: "50%", transform: "translateX(-50%)",
        width: "min(720px, 94vw)", zIndex: 191,
        background: "rgba(5,10,20,0.97)",
        border: `1px solid ${PRP}44`,
        borderRadius: 14, overflow: "hidden",
        boxShadow: `0 0 80px ${PRP}18, 0 24px 48px rgba(0,0,0,0.85)`,
        fontFamily: "'JetBrains Mono',monospace",
      }}>
        {/* header */}
        <div style={{
          padding: "12px 18px", borderBottom: `1px solid ${PRP}33`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ color: PRP, fontSize: 11, letterSpacing: 2 }}>◈ COORDINATED RESPONSE PLANNER</span>
          <button onClick={toggle} style={{
            background: "none", border: "none", color: "#4E6070",
            fontSize: 16, cursor: "pointer", padding: "0 4px",
          }}>✕</button>
        </div>

        {/* input */}
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${PRP}22` }}>
          <div style={{ color: "#4E6070", fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>
            DESCRIBE THE INCIDENT OR EVENT
          </div>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="e.g. Database cluster experiencing elevated error rate, possible breach…"
            rows={3}
            style={{
              width: "100%", background: "rgba(41,231,255,0.04)",
              border: `1px solid ${PRP}33`, borderRadius: 6,
              color: "#DCEBF5", fontSize: 13, fontFamily: "inherit",
              padding: "8px 10px", resize: "vertical", outline: "none",
              boxSizing: "border-box",
            }}
          />
          <button
            onClick={coordinate}
            disabled={loading || !input.trim()}
            style={{
              marginTop: 10, padding: "7px 20px",
              background: loading || !input.trim() ? "rgba(180,133,255,0.12)" : `${PRP}22`,
              border: `1px solid ${loading || !input.trim() ? PRP + "22" : PRP + "88"}`,
              borderRadius: 6, color: loading || !input.trim() ? "#4E6070" : PRP,
              fontSize: 11, letterSpacing: 2, cursor: loading || !input.trim() ? "default" : "pointer",
            }}
          >
            {loading ? "COORDINATING…" : "▶ COORDINATE (⌘Enter)"}
          </button>
        </div>

        {/* context summary */}
        {ctx && !loading && (
          <div style={{
            padding: "10px 18px", borderBottom: `1px solid ${PRP}22`,
            display: "flex", gap: 16, flexWrap: "wrap",
          }}>
            {[
              ["INVESTIGATIONS", ctx.investigations.length, RED],
              ["TASKS",          ctx.tasks.length,          AMB],
              ["SKILLS",         ctx.skills.length,         GRN],
              ["SCENARIOS",      ctx.scenarios.length,      CY],
            ].map(([label, count, color]) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ color, fontSize: 18, fontWeight: "bold" }}>{count}</div>
                <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* error */}
        {err && (
          <div style={{ padding: "10px 18px", color: RED, fontSize: 11 }}>
            ✗ {err}
          </div>
        )}

        {/* plan output */}
        {plan && (
          <div style={{
            padding: "14px 18px",
            maxHeight: "35vh", overflowY: "auto",
            borderBottom: `1px solid ${PRP}22`,
          }}>
            <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1, marginBottom: 8 }}>
              RESPONSE PLAN
            </div>
            <div style={{
              color: "#DCEBF5", fontSize: 12, lineHeight: 1.7,
              whiteSpace: "pre-wrap",
            }}>
              {plan}
            </div>
          </div>
        )}

        {/* history */}
        {history.length > 0 && (
          <div style={{ padding: "10px 18px", maxHeight: "18vh", overflowY: "auto" }}>
            <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
              RECENT PLANS
            </div>
            {history.map((h, i) => (
              <div
                key={h.ts}
                onClick={() => { setInput(h.desc); setPlan(h.plan); }}
                style={{
                  padding: "5px 0", borderBottom: `1px solid ${PRP}11`,
                  cursor: "pointer",
                  color: i === 0 ? "#7A95AB" : "#3A5060",
                  fontSize: 11,
                }}
              >
                <span style={{ color: PRP + "88", marginRight: 8 }}>
                  {new Date(h.ts).toLocaleTimeString()}
                </span>
                {h.desc.slice(0, 80)}{h.desc.length > 80 ? "…" : ""}
              </div>
            ))}
          </div>
        )}

        {/* footer */}
        <div style={{
          padding: "6px 18px", borderTop: `1px solid ${PRP}18`,
          color: "#2E4050", fontSize: 9, letterSpacing: 1,
        }}>
          Sources: /v1/investigations · /entities/Task · /v1/aip/skill · /v1/scenario/list · /v1/jarvis/agent/chat
        </div>
      </div>
    </>
  );
}
