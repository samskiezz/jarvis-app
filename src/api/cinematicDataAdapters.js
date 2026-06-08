/**
 * cinematicDataAdapters — thin client over the server-authoritative scene
 * hydration. The backend (server/routes/cinematic.py) does the real aggregation
 * and routes live DB/feed data to each scene's named anchors, and self-heals gaps
 * via the scraper/research subsystem. The client just fetches + polls.
 */

const env = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : {};

function apiBase() {
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

const API_KEY = env.VITE_API_KEY || "dev-key";

/** Fetch a scene's fully-hydrated anchors from the backend. */
export async function fetchScene(sceneId, context) {
  const qs = context ? `?context=${encodeURIComponent(context)}` : "";
  const r = await fetch(`${apiBase()}/v1/cinematic/scene/${sceneId}${qs}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`scene ${sceneId} -> ${r.status}`);
  return r.json();
}

/** List scene metadata from the backend (parallels the local registry). */
export async function fetchScenes() {
  const r = await fetch(`${apiBase()}/v1/cinematic/scenes`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`scenes -> ${r.status}`);
  return r.json();
}

/** Current self-healing acquisition jobs (web/document scrapes in flight). */
export async function fetchAcquireStatus() {
  const r = await fetch(`${apiBase()}/v1/cinematic/acquire/status`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`acquire status -> ${r.status}`);
  return r.json();
}

/** Live growing-brain telemetry: nodes (neurons), synapses, clusters, docs. */
export async function fetchBrain() {
  const r = await fetch(`${apiBase()}/v1/cinematic/brain`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`brain -> ${r.status}`);
  return r.json();
}

export { apiBase };
