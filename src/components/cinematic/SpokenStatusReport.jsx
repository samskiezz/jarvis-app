/**
 * SpokenStatusReport — F05
 * "JARVIS, status" → fetches real telemetry from /v1/jarvis/system/status
 * and /v1/cinematic/brain, then returns a spoken sentence for TTS.
 * Wired via JarvisBrain.jsx (additive; no mock data).
 */
import { apiBase } from "@/api/cinematicDataAdapters";

const STATUS_RE =
  /\bstatus\b|\bdiagnostic|\ball systems\b|\bsystem report\b|\bhow are you doing\b/i;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

export function isStatusQuery(text) {
  return STATUS_RE.test(text || "");
}

function dig(obj, ...paths) {
  for (const path of paths) {
    let cur = obj;
    for (const k of path.split(".")) {
      if (cur == null) break;
      cur = cur[k];
    }
    if (cur != null) return cur;
  }
  return undefined;
}

export async function buildStatusScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };

  const [sr, br] = await Promise.allSettled([
    fetch(`${base}/v1/jarvis/system/status`, { headers }).then((r) =>
      r.ok ? r.json() : null
    ),
    fetch(`${base}/v1/cinematic/brain`, { headers }).then((r) =>
      r.ok ? r.json() : null
    ),
  ]);

  const sys = sr.status === "fulfilled" ? sr.value : null;
  const brain = br.status === "fulfilled" ? br.value : null;

  const parts = ["Status report, sir."];

  if (sys) {
    const cpu = dig(sys, "cpu_percent", "cpu", "system.cpu_percent");
    const mem = dig(sys, "memory.percent", "memory_percent", "mem_percent", "mem");
    const loadVal = dig(sys, "load_avg", "load", "system.load_avg", "load_average");

    const cpuN = typeof cpu === "number" ? cpu : parseFloat(cpu);
    const memN = typeof mem === "number" ? mem : parseFloat(mem);

    if (!isNaN(cpuN)) parts.push(`CPU at ${Math.round(cpuN)} percent.`);
    if (!isNaN(memN)) parts.push(`Memory at ${Math.round(memN)} percent.`);

    if (loadVal != null) {
      const l = Array.isArray(loadVal) ? parseFloat(loadVal[0]) : parseFloat(loadVal);
      if (!isNaN(l)) parts.push(`System load ${l.toFixed(2)}.`);
    }
  } else {
    parts.push("System telemetry unavailable.");
  }

  if (brain) {
    const nodes = dig(brain, "nodes", "node_count", "neurons");
    const synapses = dig(brain, "synapses", "edge_count", "edges");
    const nodesN = typeof nodes === "number" ? nodes : parseInt(nodes, 10);
    const synN = typeof synapses === "number" ? synapses : parseInt(synapses, 10);

    if (!isNaN(nodesN) && !isNaN(synN)) {
      parts.push(
        `Neural graph contains ${nodesN.toLocaleString()} nodes and ${synN.toLocaleString()} active synapses.`
      );
    } else if (!isNaN(nodesN)) {
      parts.push(`Neural graph contains ${nodesN.toLocaleString()} nodes.`);
    }
  } else {
    parts.push("Neural graph offline.");
  }

  if (sys || brain) parts.push("All systems nominal.");

  return parts.join(" ");
}
