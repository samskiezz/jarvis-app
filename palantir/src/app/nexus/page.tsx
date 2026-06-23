'use client';

import { useEffect, useState } from 'react';

interface Service {
  id: string; name?: string; port?: number | null; role?: string;
  status?: string; alive?: boolean; last_seen?: number;
}
interface BusEvent { seq: number; ts: number; topic: string; type: string; actor?: string; payload?: Record<string, unknown>; }
interface NexusState {
  services: { count: number; alive: number; roster: Service[] };
  latest_snapshot: BusEvent | null;
  latest_tasks: BusEvent | null;
  recent_events: BusEvent[];
  error?: string;
}

const GOLD = '#D4AF37';

export default function NexusPage() {
  const [state, setState] = useState<NexusState | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch('/api/nexus/state', { cache: 'no-store' });
        const data = (await res.json()) as NexusState;
        if (!active) return;
        setState(data);
        setErr(data.error || null);
      } catch (e) {
        if (active) setErr(e instanceof Error ? e.message : 'fetch failed');
      }
    };
    load();
    const id = setInterval(load, 4000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const restart = async (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm(`Restart service "${id}"?`)) return;
    try {
      await fetch('/api/nexus/intervene', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'restart' }),
      });
    } catch { /* fire-and-forget; roster refresh shows the result */ }
  };

  const svc = state?.services;
  const roster = svc?.roster || [];
  const tasks = state?.latest_tasks?.payload as { done?: number; in_progress?: number; partial?: number; queued?: number } | undefined;

  return (
    <main style={{ minHeight: '100vh', background: '#06060C', color: '#e8e8ea', fontFamily: 'ui-monospace, monospace', padding: '32px' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 16, borderBottom: `1px solid ${GOLD}33`, paddingBottom: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, letterSpacing: '0.3em', color: GOLD, fontWeight: 700, margin: 0 }}>JARVIS · NEXUS</h1>
        <span style={{ fontSize: 11, opacity: 0.6, letterSpacing: '0.2em' }}>COLLECTIVE CONTROL PLANE</span>
        {tasks && (
          <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.8 }}>
            TASKS <b style={{ color: '#76FF03' }}>{tasks.done ?? 0}</b> done · <b style={{ color: GOLD }}>{tasks.in_progress ?? 0}</b> active · {tasks.partial ?? 0} partial · {tasks.queued ?? 0} queued
          </span>
        )}
        <span style={{ marginLeft: tasks ? 16 : 'auto', fontSize: 12 }}>
          <b style={{ color: GOLD }}>{svc?.alive ?? '–'}</b>/<span>{svc?.count ?? '–'}</span> services alive
        </span>
      </header>

      {err && (
        <div style={{ background: '#FF174411', border: '1px solid #FF174455', color: '#FF6D7D', padding: '8px 12px', marginBottom: 20, fontSize: 12 }}>
          [ NEXUS BACKEND: {err} ]
        </div>
      )}

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Service roster */}
        <div>
          <h2 style={{ fontSize: 12, letterSpacing: '0.25em', color: GOLD, opacity: 0.8, marginBottom: 12 }}>SERVICE REGISTRY</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {roster.length === 0 && <div style={{ opacity: 0.4, fontSize: 12 }}>no services registered</div>}
            {roster.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#ffffff06', border: '1px solid #ffffff10', padding: '8px 12px', borderRadius: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.alive ? '#76FF03' : '#FF1744', boxShadow: s.alive ? '0 0 8px #76FF03' : 'none', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{s.id}</span>
                <span style={{ fontSize: 11, opacity: 0.5 }}>{s.role}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.5 }}>{s.port ? `:${s.port}` : ''}</span>
                <span style={{ fontSize: 10, color: s.alive ? '#76FF03' : '#FF6D7D', letterSpacing: '0.1em' }}>{s.alive ? 'ALIVE' : 'STALE'}</span>
                <button onClick={() => restart(s.id)} title={`Restart ${s.id}`}
                  style={{ fontSize: 9, color: GOLD, background: 'transparent', border: `1px solid ${GOLD}44`, borderRadius: 3, padding: '2px 6px', cursor: 'pointer', letterSpacing: '0.1em' }}>
                  RESTART
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Coordinated event stream + snapshot */}
        <div>
          <h2 style={{ fontSize: 12, letterSpacing: '0.25em', color: GOLD, opacity: 0.8, marginBottom: 12 }}>COORDINATED EVENT STREAM</h2>
          {state?.latest_snapshot && (
            <div style={{ background: `${GOLD}0d`, border: `1px solid ${GOLD}33`, padding: '8px 12px', borderRadius: 4, marginBottom: 12, fontSize: 11 }}>
              LATEST SNAPSHOT · {JSON.stringify(state.latest_snapshot.payload)}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '60vh', overflowY: 'auto' }}>
            {(state?.recent_events || []).map((e) => (
              <div key={e.seq} style={{ display: 'flex', gap: 8, fontSize: 11, padding: '4px 8px', background: '#ffffff04', borderLeft: `2px solid ${GOLD}44` }}>
                <span style={{ color: GOLD, minWidth: 90 }}>{e.topic}.{e.type}</span>
                <span style={{ opacity: 0.4, minWidth: 70 }}>{e.actor || ''}</span>
                <span style={{ opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{JSON.stringify(e.payload).slice(0, 80)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
