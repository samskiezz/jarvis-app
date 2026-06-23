/**
 * Next.js instrumentation hook — announces the :3000 unified surface to the
 * JARVIS Nexus registry on server start, then heartbeats. Runs once per server
 * process (nodejs runtime only). Fire-and-forget; never blocks startup.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const base = process.env.JARVIS_API_BASE || 'http://127.0.0.1:8001';
  const announce = () =>
    fetch(`${base}/v1/registry/announce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'jarvis-palantir', name: 'jarvis-palantir', port: 3000,
        role: 'unified-surface', base_url: 'http://127.0.0.1:3000',
        health_path: '/api/health', routes: ['/nexus', '/api/jarvis/*', '/api/ai/*', '/api/nexus/*'],
        pid: process.pid,
      }),
    }).catch(() => {});
  announce();
  setInterval(
    () =>
      fetch(`${base}/v1/registry/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'jarvis-palantir', status: 'ok' }),
      }).catch(() => {}),
    30000,
  );
}
