import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const API_KEY = (typeof window !== 'undefined' && (window.__JARVIS_API_KEY__ || 'dev-key')) || 'dev-key';
const POLL_MS = 90000;

const SSJAR_RE = /\b(ssjar|swarm[\s_-]*skill[\s_-]*system|system[\s_-]*swarm[\s_-]*skill|swarm[\s_-]*readiness|operational[\s_-]*readiness[\s_-]*swarm|skill[\s_-]*swarm[\s_-]*status|swarm[\s_-]*skill[\s_-]*status|swarm[\s_-]*aip[\s_-]*system|system[\s_-]*swarm[\s_-]*aip|swarm[\s_-]*operational[\s_-]*skill|skill[\s_-]*readiness[\s_-]*swarm|swarm[\s_-]*system[\s_-]*skill)\b/i;

export function isSsjarQuery(t) { return SSJAR_RE.test(t || ''); }

function tok(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const bSet = new Set(bTokens);
  const hits = aTokens.filter(t => bSet.has(t)).length;
  return hits / Math.max(aTokens.length, bTokens.length);
}

const THRESHOLD = 0.08;

function systemHealth(status) {
  if (!status || typeof status !== 'object') return 0;
  const cpu = typeof status.cpu === 'number' ? status.cpu : (status.cpu_percent ?? status.cpu_usage ?? 50);
  const mem = typeof status.memory === 'number' ? status.memory : (status.mem_percent ?? status.memory_percent ?? 50);
  const load = status.load_1m ?? status.load ?? 0;
  const score = 100 - (cpu * 0.4 + mem * 0.4 + Math.min(load * 10, 100) * 0.2);
  return Math.max(0, Math.min(100, Math.round(score)));
}

const COV = {
  FULLY_READY: 'FULLY_READY',
  SKILL_EQUIPPED: 'SKILL_EQUIPPED',
  SYSTEM_ACTIVE: 'SYSTEM_ACTIVE',
  UNSUPPORTED: 'UNSUPPORTED',
};

function classifyJob(jobTokens, skills, healthScore) {
  let bestSkill = null, bestScore = 0;
  for (const sk of skills) {
    const st = tok([sk?.name, sk?.title, sk?.description, sk?.category, sk?.domain, (sk?.tags || []).join(' ')].join(' '));
    const s = matchScore(jobTokens, st);
    if (s > bestScore) { bestScore = s; bestSkill = sk; }
  }
  const hasSkill = bestScore >= THRESHOLD;
  const systemOk = healthScore >= 60;
  let cov;
  if (hasSkill && systemOk) cov = COV.FULLY_READY;
  else if (hasSkill) cov = COV.SKILL_EQUIPPED;
  else if (systemOk) cov = COV.SYSTEM_ACTIVE;
  else cov = COV.UNSUPPORTED;
  return { cov, bestSkill, bestScore };
}

function normaliseArray(raw, ...keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

export async function buildSsjarScript() {
  try {
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [sysRes, swarmRes, skillRes] = await Promise.allSettled([
      fetch(`${API}/v1/jarvis/system/status`, { headers: hdr }).then(r => r.ok ? r.json() : {}),
      fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/v1/aip/skill`, { headers: hdr }).then(r => r.ok ? r.json() : []),
    ]);
    const sysStatus = (sysRes.status === 'fulfilled' ? sysRes.value : {}) || {};
    const jobs = normaliseArray(swarmRes.status === 'fulfilled' ? swarmRes.value : [], 'items', 'data', 'jobs');
    const skills = normaliseArray(skillRes.status === 'fulfilled' ? skillRes.value : [], 'skills', 'items', 'data');
    const health = systemHealth(sysStatus);
    const counts = { [COV.FULLY_READY]: 0, [COV.SKILL_EQUIPPED]: 0, [COV.SYSTEM_ACTIVE]: 0, [COV.UNSUPPORTED]: 0 };
    for (const job of jobs) {
      const jt = tok([job?.name, job?.title, job?.type, job?.objective, job?.description, (job?.tags || []).join(' ')].join(' '));
      const { cov } = classifyJob(jt, skills, health);
      counts[cov]++;
    }
    const total = jobs.length;
    const systemState = health >= 80 ? 'OPTIMAL' : health >= 60 ? 'NOMINAL' : 'DEGRADED';
    return `SSJAR: ${total} swarm jobs assessed against ${skills.length} AIP skills at system health ${health}% (${systemState}). ` +
      `${counts[COV.FULLY_READY]} FULLY READY (skill-matched + healthy system), ` +
      `${counts[COV.SKILL_EQUIPPED]} skill-equipped but system degraded, ` +
      `${counts[COV.SYSTEM_ACTIVE]} system-active without skill coverage, ` +
      `${counts[COV.UNSUPPORTED]} UNSUPPORTED (no skill or healthy system). ` +
      (counts[COV.UNSUPPORTED] > 0
        ? `${counts[COV.UNSUPPORTED]} swarm jobs have no capability backing and no healthy system context — prioritise skill assignment or system recovery.`
        : 'All swarm jobs have at least one readiness dimension covered.');
  } catch {
    return 'SSJAR: unable to fetch system status, swarm job, or AIP skill data — check endpoints.';
  }
}

export default function SwarmSkillSystemReadiness() {
  const [open, setOpen] = useState(false);
  const [sysStatus, setSysStatus] = useState({});
  const [jobs, setJobs] = useState([]);
  const [skills, setSkills] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [sysRes, swarmRes, skillRes] = await Promise.allSettled([
        fetch(`${API}/v1/jarvis/system/status`, { headers: hdr }).then(r => r.ok ? r.json() : {}),
        fetch(`${API}/entities/SwarmJob`, { headers: hdr }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/v1/aip/skill`, { headers: hdr }).then(r => r.ok ? r.json() : []),
      ]);
      setSysStatus((sysRes.status === 'fulfilled' ? sysRes.value : {}) || {});
      setJobs(normaliseArray(swarmRes.status === 'fulfilled' ? swarmRes.value : [], 'items', 'data', 'jobs'));
      setSkills(normaliseArray(skillRes.status === 'fulfilled' ? skillRes.value : [], 'skills', 'items', 'data'));
    } catch { /* silently ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener('jarvis:ssjar-toggle', handler);
    return () => window.removeEventListener('jarvis:ssjar-toggle', handler);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  if (!open) return null;

  const health = systemHealth(sysStatus);
  const systemState = health >= 80 ? 'OPTIMAL' : health >= 60 ? 'NOMINAL' : 'DEGRADED';
  const healthColor = health >= 80 ? '#22c55e' : health >= 60 ? '#eab308' : '#ef4444';

  const classified = jobs.map(job => {
    const label = job?.name ?? job?.title ?? '(unnamed)';
    const type = job?.type ?? job?.kind ?? '';
    const jt = tok([job?.name, job?.title, job?.type, job?.objective, job?.description, (job?.tags || []).join(' ')].join(' '));
    const result = classifyJob(jt, skills, health);
    return { label, type, ...result };
  });

  const counts = { [COV.FULLY_READY]: 0, [COV.SKILL_EQUIPPED]: 0, [COV.SYSTEM_ACTIVE]: 0, [COV.UNSUPPORTED]: 0 };
  classified.forEach(r => counts[r.cov]++);

  const covColor = {
    [COV.FULLY_READY]: '#22c55e',
    [COV.SKILL_EQUIPPED]: '#818cf8',
    [COV.SYSTEM_ACTIVE]: '#eab308',
    [COV.UNSUPPORTED]: '#ef4444',
  };
  const covLabel = {
    [COV.FULLY_READY]: 'FULLY READY',
    [COV.SKILL_EQUIPPED]: 'SKILL EQUIPPED',
    [COV.SYSTEM_ACTIVE]: 'SYSTEM ACTIVE',
    [COV.UNSUPPORTED]: 'UNSUPPORTED',
  };

  const total = classified.length;
  const readyPct = total ? Math.round((counts[COV.FULLY_READY] / total) * 100) : 0;

  const searchLower = search.toLowerCase();
  const visible = classified.filter(r => {
    if (filter !== 'ALL' && r.cov !== filter) return false;
    if (searchLower && !r.label.toLowerCase().includes(searchLower)) return false;
    return true;
  });

  async function assess() {
    setAssessing(true);
    setAssessText('');
    try {
      const prompt = `SSJAR swarm skill system readiness: system health ${health}% (${systemState}), ${total} swarm jobs — ${counts[COV.FULLY_READY]} fully ready (skill+system), ${counts[COV.SKILL_EQUIPPED]} skill-equipped, ${counts[COV.SYSTEM_ACTIVE]} system-active, ${counts[COV.UNSUPPORTED]} unsupported. ${skills.length} AIP skills indexed. Provide a 2-sentence assessment of swarm operational readiness and one actionable recommendation.`;
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

  const GR = '#22c55e';

  return (
    <div style={{
      position: 'fixed', left: 875040, bottom: 8, zIndex: 571, width: 360,
      background: 'rgba(8,12,20,0.97)', border: `1px solid ${GR}44`,
      borderRadius: 10, padding: 14, fontFamily: 'monospace', fontSize: 12,
      color: '#e2e8f0', boxShadow: `0 0 28px ${GR}11`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: GR, fontWeight: 700, fontSize: 13 }}>◈ SSJAR — Swarm × Skill × System Readiness</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>

      {/* System health bar */}
      <div style={{ marginBottom: 10, background: '#0f172a', borderRadius: 6, padding: '6px 10px', border: `1px solid ${healthColor}33` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ color: '#94a3b8', fontSize: 10 }}>System Health</span>
          <span style={{ color: healthColor, fontWeight: 700, fontSize: 12 }}>{health}% — {systemState}</span>
        </div>
        <div style={{ background: '#1e293b', borderRadius: 3, height: 4 }}>
          <div style={{ width: `${health}%`, background: healthColor, height: '100%', borderRadius: 3, transition: 'width 0.5s' }} />
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
        {Object.values(COV).map(cov => (
          <div key={cov} style={{ background: covColor[cov] + '11', border: `1px solid ${covColor[cov]}44`, borderRadius: 6, padding: '6px 8px', textAlign: 'center', cursor: 'pointer' }}
            onClick={() => setFilter(f => f === cov ? 'ALL' : cov)}>
            <div style={{ fontSize: 22, fontWeight: 700, color: covColor[cov] }}>{counts[cov]}</div>
            <div style={{ fontSize: 8, color: '#94a3b8', marginTop: 1 }}>{covLabel[cov]}</div>
          </div>
        ))}
      </div>

      {/* Source tiles */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
        {[['Jobs', total, GR], ['Skills', skills.length, '#818cf8']].map(([lbl, val, col]) => (
          <div key={lbl} style={{ flex: 1, background: col + '11', border: `1px solid ${col}33`, borderRadius: 5, padding: '4px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 8, color: '#64748b' }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
          {Object.values(COV).map(cov => (
            <div key={cov} style={{ flex: counts[cov] || 0.01, background: covColor[cov], transition: 'flex 0.4s' }} />
          ))}
        </div>
        <div style={{ textAlign: 'right', fontSize: 9, color: '#64748b', marginTop: 2 }}>{readyPct}% fully ready</div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {['ALL', ...Object.values(COV)].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '2px 8px', fontSize: 9, borderRadius: 4, cursor: 'pointer', fontWeight: filter === f ? 700 : 400,
            background: filter === f ? (f === 'ALL' ? GR + '22' : covColor[f] + '22') : 'transparent',
            border: `1px solid ${filter === f ? (f === 'ALL' ? GR : covColor[f]) : '#1e293b'}`,
            color: filter === f ? (f === 'ALL' ? GR : covColor[f]) : '#64748b',
          }}>{f === 'ALL' ? 'ALL' : covLabel[f].split(' ')[0]}</button>
        ))}
      </div>

      {/* Search */}
      <input
        value={search} onChange={e => setSearch(e.target.value)} placeholder="Search swarm jobs…"
        style={{ width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 4, padding: '4px 8px', color: '#94a3b8', fontSize: 11, marginBottom: 8 }}
      />

      {/* Rows */}
      <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visible.slice(0, 30).map((row, i) => (
          <div key={i}>
            <div
              onClick={() => setExpanded(expanded === i ? null : i)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '4px 6px', borderRadius: 4, background: '#0f172a', border: `1px solid ${covColor[row.cov]}22` }}
            >
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <span style={{ color: '#cbd5e1', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{row.label}</span>
                {row.type && <span style={{ fontSize: 8, color: '#475569' }}>{row.type}</span>}
              </div>
              <span style={{ fontSize: 8, color: covColor[row.cov], fontWeight: 700, marginLeft: 6, whiteSpace: 'nowrap' }}>{covLabel[row.cov].split(' ')[0]}</span>
            </div>
            {expanded === i && (
              <div style={{ padding: '6px 8px', background: '#080c14', borderRadius: 4, marginTop: 2, fontSize: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ color: '#818cf8', fontWeight: 700, marginBottom: 4 }}>MATCHED SKILL</div>
                    {row.bestSkill ? (
                      <>
                        <div style={{ color: '#cbd5e1' }}>{row.bestSkill?.title ?? row.bestSkill?.name ?? '—'}</div>
                        <div style={{ color: '#64748b', fontSize: 9 }}>{row.bestSkill?.category ?? row.bestSkill?.domain ?? ''}</div>
                        <div style={{ background: '#1e293b', borderRadius: 2, height: 3, marginTop: 4 }}>
                          <div style={{ width: `${Math.round(row.bestScore * 100)}%`, background: '#818cf8', height: '100%', borderRadius: 2 }} />
                        </div>
                        <div style={{ textAlign: 'right', color: '#64748b', fontSize: 8 }}>{Math.round(row.bestScore * 100)}%</div>
                      </>
                    ) : <div style={{ color: '#475569' }}>No skill match</div>}
                  </div>
                  <div>
                    <div style={{ color: healthColor, fontWeight: 700, marginBottom: 4 }}>SYSTEM</div>
                    <div style={{ color: healthColor, fontSize: 13, fontWeight: 700 }}>{health}%</div>
                    <div style={{ color: '#64748b', fontSize: 9 }}>{systemState}</div>
                    <div style={{ background: '#1e293b', borderRadius: 2, height: 3, marginTop: 4 }}>
                      <div style={{ width: `${health}%`, background: healthColor, height: '100%', borderRadius: 2 }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {visible.length === 0 && <div style={{ fontSize: 10, color: '#475569', textAlign: 'center', padding: 8 }}>No swarm jobs match</div>}
        {visible.length > 30 && <div style={{ fontSize: 9, color: '#334155', textAlign: 'center' }}>…+{visible.length - 30} more</div>}
      </div>

      {/* Assess */}
      <div style={{ borderTop: '1px solid #1e293b', paddingTop: 10, marginTop: 8 }}>
        <button
          onClick={assess} disabled={assessing}
          style={{ width: '100%', padding: '6px 0', background: assessing ? '#1e293b' : GR + '11', border: `1px solid ${GR}`, borderRadius: 4, color: GR, cursor: assessing ? 'default' : 'pointer', fontSize: 11, fontWeight: 700 }}
        >{assessing ? '⟳ Assessing…' : '▶ ASSESS — SSJAR readiness brief'}</button>
        {assessText && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8', background: '#0f172a', borderRadius: 4, padding: 8, lineHeight: 1.5 }}>{assessText}</div>
        )}
      </div>

      <div style={{ marginTop: 6, fontSize: 9, color: '#334155', textAlign: 'right' }}>
        {loading ? 'Refreshing…' : `Polls every ${POLL_MS / 1000}s`}
      </div>
    </div>
  );
}
