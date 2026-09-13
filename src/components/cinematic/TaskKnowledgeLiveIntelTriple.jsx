import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const TKLIVE_RE = /\b(tklive|task[\s_-]*knowledge[\s_-]*live|task[\s_-]*kb[\s_-]*live|live[\s_-]*task[\s_-]*knowledge|task[\s_-]*live[\s_-]*intel[\s_-]*knowledge|task[\s_-]*world[\s_-]*knowledge|tk[\s_-]*live|knowledge[\s_-]*live[\s_-]*task)\b/i;

export function isTkliveQuery(t) { return TKLIVE_RE.test(t || ''); }

export async function buildTkliveScript() {
  try {
    const [taskRes, kbRes, intelRes] = await Promise.all([
      fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : {}),
    ]);
    const tasks = Array.isArray(taskRes) ? taskRes : (taskRes?.items ?? taskRes?.data ?? taskRes?.tasks ?? []);
    const kbArticles = Array.isArray(kbRes) ? kbRes : (kbRes?.items ?? kbRes?.data ?? kbRes?.articles ?? []);
    const liveEvents = Array.isArray(intelRes) ? intelRes : (intelRes?.events ?? intelRes?.items ?? intelRes?.data ?? []);
    const kbTitles = new Set(kbArticles.map(a => (a?.title ?? a?.name ?? '').toLowerCase()));
    const liveTopics = new Set(liveEvents.map(e => (e?.topic ?? e?.title ?? e?.type ?? '').toLowerCase()));
    let fullyLive = 0, kbOnly = 0, liveOnly = 0, dormant = 0;
    for (const t of tasks) {
      const label = (t?.title ?? t?.name ?? t?.label ?? '').toLowerCase();
      const hasKb = kbTitles.size > 0 && [...kbTitles].some(k => k.includes(label.slice(0, 6)) || label.includes(k.slice(0, 6)));
      const hasLive = liveTopics.size > 0 && [...liveTopics].some(lv => lv.includes(label.slice(0, 6)) || label.includes(lv.slice(0, 6)));
      if (hasKb && hasLive) fullyLive++;
      else if (hasKb) kbOnly++;
      else if (hasLive) liveOnly++;
      else dormant++;
    }
    const total = tasks.length;
    return `TKLIVE: ${total} tasks — ${fullyLive} fully live (KB + world event), ${kbOnly} KB-only, ${liveOnly} live-only, ${dormant} dormant. ${kbArticles.length} KB articles indexed, ${liveEvents.length} live intel signals active. ${fullyLive > 0 ? `Top coverage: ${fullyLive} tasks have both knowledge backing and live intel trigger.` : 'No tasks have full coverage — enrich KB or await live signals.'}`;
  } catch {
    return 'TKLIVE: unable to fetch task, knowledge, or live intel data — check endpoints.';
  }
}

const API_KEY = (typeof window !== 'undefined' && (window.__JARVIS_API_KEY__ || 'dev-key')) || 'dev-key';
const POLL_MS = 90000;

const COVERAGE = { FULLY_LIVE: 'FULLY_LIVE', KB_ONLY: 'KB_ONLY', LIVE_ONLY: 'LIVE_ONLY', DORMANT: 'DORMANT' };

function classifyTask(label, kbTitles, liveTopics) {
  const slug = label.toLowerCase().slice(0, 8);
  const hasKb = [...kbTitles].some(k => k.includes(slug) || slug.includes(k.slice(0, 6)));
  const hasLive = [...liveTopics].some(lv => lv.includes(slug) || slug.includes(lv.slice(0, 6)));
  if (hasKb && hasLive) return COVERAGE.FULLY_LIVE;
  if (hasKb) return COVERAGE.KB_ONLY;
  if (hasLive) return COVERAGE.LIVE_ONLY;
  return COVERAGE.DORMANT;
}

export default function TaskKnowledgeLiveIntelTriple() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [kbArticles, setKbArticles] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [taskRes, kbRes, intelRes] = await Promise.all([
        fetch(`${API}/entities/Task`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/knowledge/`).then(r => r.ok ? r.json() : []),
        fetch(`${API}/functions/getLiveIntel`).then(r => r.ok ? r.json() : {}),
      ]);
      setTasks(Array.isArray(taskRes) ? taskRes : (taskRes?.items ?? taskRes?.data ?? taskRes?.tasks ?? []));
      setKbArticles(Array.isArray(kbRes) ? kbRes : (kbRes?.items ?? kbRes?.data ?? kbRes?.articles ?? []));
      setLiveEvents(Array.isArray(intelRes) ? intelRes : (intelRes?.events ?? intelRes?.items ?? intelRes?.data ?? []));
    } catch { /* silently ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:tklive-toggle', handler);
    return () => window.removeEventListener('jarvis:tklive-toggle', handler);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  if (!open) return null;

  const kbTitles = new Set(kbArticles.map(a => (a?.title ?? a?.name ?? '').toLowerCase()));
  const liveTopics = new Set(liveEvents.map(e => (e?.topic ?? e?.title ?? e?.type ?? '').toLowerCase()));

  const counts = { [COVERAGE.FULLY_LIVE]: 0, [COVERAGE.KB_ONLY]: 0, [COVERAGE.LIVE_ONLY]: 0, [COVERAGE.DORMANT]: 0 };
  const classified = tasks.slice(0, 40).map(t => {
    const label = t?.title ?? t?.name ?? t?.label ?? '(unnamed)';
    const cov = classifyTask(label, kbTitles, liveTopics);
    counts[cov]++;
    return { label, cov };
  });
  const remaining = tasks.length - classified.length;
  if (remaining > 0) counts[COVERAGE.DORMANT] += remaining;

  const covColor = { [COVERAGE.FULLY_LIVE]: '#22d3ee', [COVERAGE.KB_ONLY]: '#a78bfa', [COVERAGE.LIVE_ONLY]: '#fb923c', [COVERAGE.DORMANT]: '#475569' };
  const covLabel = { [COVERAGE.FULLY_LIVE]: 'KB + LIVE', [COVERAGE.KB_ONLY]: 'KB ONLY', [COVERAGE.LIVE_ONLY]: 'LIVE ONLY', [COVERAGE.DORMANT]: 'DORMANT' };

  async function assess() {
    setAssessing(true);
    setAssessText('');
    try {
      const prompt = `TKLIVE status: ${tasks.length} tasks total — ${counts[COVERAGE.FULLY_LIVE]} fully live, ${counts[COVERAGE.KB_ONLY]} KB-only, ${counts[COVERAGE.LIVE_ONLY]} live-only, ${counts[COVERAGE.DORMANT]} dormant. KB: ${kbArticles.length} articles. Live intel: ${liveEvents.length} signals. Provide a 2-sentence operational assessment and one actionable recommendation to improve task coverage.`;
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      if (r.ok) {
        const j = await r.json();
        const txt = j.response || j.message || j.content || '';
        setAssessText(txt);
        window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
      }
    } catch { /* silently ignore */ }
    setAssessing(false);
  }

  const panelStyle = {
    position: 'fixed',
    left: 872800,
    bottom: 8,
    zIndex: 567,
    width: 340,
    background: 'rgba(8,12,20,0.97)',
    border: '1px solid rgba(34,211,238,0.3)',
    borderRadius: 10,
    padding: 14,
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#e2e8f0',
    boxShadow: '0 0 28px rgba(34,211,238,0.08)',
  };

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, fontSize: 13 }}>◈ TKLIVE — Task × KB × Live Intel</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>

      {/* Coverage badges */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
        {Object.values(COVERAGE).map(cov => (
          <div key={cov} style={{ background: covColor[cov] + '11', border: `1px solid ${covColor[cov]}44`, borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: covColor[cov] }}>{counts[cov]}</div>
            <div style={{ fontSize: 8, color: '#94a3b8', marginTop: 1 }}>{covLabel[cov]}</div>
          </div>
        ))}
      </div>

      {/* Source counts */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, gap: 6 }}>
        {[['Tasks', tasks.length, '#22d3ee'], ['KB Articles', kbArticles.length, '#a78bfa'], ['Live Signals', liveEvents.length, '#fb923c']].map(([lbl, val, col]) => (
          <div key={lbl} style={{ flex: 1, background: col + '11', border: `1px solid ${col}33`, borderRadius: 5, padding: '4px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 8, color: '#64748b' }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Task list (top 8) */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: '#22d3ee', fontWeight: 700, marginBottom: 5 }}>TASK COVERAGE SAMPLE</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {classified.slice(0, 8).map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10 }}>
              <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{item.label}</span>
              <span style={{ fontSize: 8, color: covColor[item.cov], fontWeight: 700, marginLeft: 6, whiteSpace: 'nowrap' }}>{covLabel[item.cov]}</span>
            </div>
          ))}
          {tasks.length === 0 && <div style={{ fontSize: 10, color: '#475569' }}>No tasks loaded</div>}
          {tasks.length > 8 && <div style={{ fontSize: 9, color: '#334155' }}>…+{tasks.length - 8} more tasks</div>}
        </div>
      </div>

      {/* Assess */}
      <div style={{ borderTop: '1px solid #1e293b', paddingTop: 10 }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{ width: '100%', padding: '6px 0', background: assessing ? '#1e293b' : '#22d3ee11', border: '1px solid #22d3ee', borderRadius: 4, color: '#22d3ee', cursor: assessing ? 'default' : 'pointer', fontSize: 11, fontWeight: 700 }}
        >{assessing ? '⟳ Assessing…' : '▶ ASSESS — TKLIVE coverage brief'}</button>
        {assessText && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8', background: '#0f172a', borderRadius: 4, padding: 8, lineHeight: 1.5 }}>{assessText}</div>
        )}
      </div>

      <div style={{ marginTop: 8, fontSize: 9, color: '#334155', textAlign: 'right' }}>
        {loading ? 'Refreshing…' : `Polls every ${POLL_MS / 1000}s`}
      </div>
    </div>
  );
}
