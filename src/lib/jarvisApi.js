/**
 * jarvisApi — the unified runtime path from the bot to the backend agent loop.
 *
 * This closes the audit's "dual/inconsistent API access" + "no tool orchestration
 * in the bot" gaps: every conversational turn goes through ONE place
 * (kimiClient.request → /v1/jarvis/agent/chat), which runs the real
 * planner/executor (tool registry + governed dispatcher + step memory) on the
 * server and returns the synthesised answer plus the tool trace.
 */
import { kimiClient } from "@/api/kimiClient";

/**
 * Run one agentic turn. Returns
 * { answer, trace:[{thought,tool,params,observation}], backend, steps, used_tools }.
 * Never throws — on transport failure it returns a structured error answer so the
 * UI (and voice) always have something to say.
 */
export async function agentChat(message, { history = [], maxSteps, pageContext } = {}) {
  // Keep history compact and in the shape the backend expects ({role,text}).
  const compactHistory = (history || [])
    .slice(-8)
    .map((m) => ({ role: m.role === "sam" ? "user" : "jarvis", text: m.text || "" }))
    .filter((m) => m.text);
  try {
    const body = { message, history: compactHistory };
    if (maxSteps) body.max_steps = maxSteps;
    // Optional page/route awareness so the agent knows where the user is.
    // Backend ignores unknown fields — fully non-breaking.
    if (pageContext) body.page_context = pageContext;
    const res = await kimiClient.request("/v1/jarvis/agent/chat", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return {
      answer: res?.answer || "",
      trace: Array.isArray(res?.trace) ? res.trace : [],
      backend: res?.backend ?? null,
      steps: Number(res?.steps || 0),
      used_tools: Array.isArray(res?.used_tools) ? res.used_tools : [],
    };
  } catch (e) {
    return {
      answer: `My apologies, sir — the agent link is down (${e?.message || "error"}).`,
      trace: [], backend: null, steps: 0, used_tools: [], error: true,
    };
  }
}

/** The tool catalogue the agent can call (for "what can you do" surfaces). */
export async function agentTools() {
  try {
    const res = await kimiClient.request("/v1/jarvis/agent/tools");
    return Array.isArray(res?.tools) ? res.tools : [];
  } catch {
    return [];
  }
}
