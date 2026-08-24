import { useState, useEffect, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
const API_KEY = (typeof window !== 'undefined' && (window.__JARVIS_API_KEY__ || 'dev-key')) || 'dev-key';
const POLL_MS = 90000;

const TSIT_RE = /\b(tsit|task[._-]?swarm[._-]?invest|swarm[._-]?task[._-]?invest|funded[._-]?tasks?|resourced[._-]?tasks?|task[._-]?investment[._-]?swarm|task[._-]?swarm[._-]?fund|swarm[._-]?funded[._-]?task)\b/i;
export function isTsitQuery(t) { return TSIT_RE.test(t || ''); }

function tok(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}
function matchScore(aTokens, bSet) {
  if (!aTokens.length || !bSet.size) return 0;
  return aTokens.filter(t => bSet.has(t)).length / Math.max(aTokens.length, bSet.size);
}
const THRESHOLD = 0.06;

const COV = {
  FULLY_RESOURCED: 'FULLY_RESOURCED',
  JOB_ASSIGNED: 'JOB_ASSIGNED',
  FUNDED: 'FUNDED',
  DARK: 'DARK',
};

const COV_COLOUR = {
  [COV.FULLY_RESOURCED]: '#00ffcc',
  [COV.JOB_ASSIGNED]: '#7bd4ff',
  [COV.FUNDED]: '#ffd700',
  [COV.DARK]: '#ff4455',
};

const FILTER_TABS = ['ALL', ...Object.keys(COV)];

function normaliseArray(raw, ...keys) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];
  for (const k of keys) if (Array.isArray(raw[k])) return raw[k];
  const first = Object.values(raw).find(v => Array.isArray(v));
  return first || [];
}

function classifyTask(taskTokens, jobs, investments) {
  const jobSet = new Set(jobs.flatMap(j => tok([j.name, j.description, j.target, j.objective, j.tags].join(' '))));
  const invSet = new Set(investments.flatMap(i => tok([i.name, i.sector, i.type, i.notes, i.tags, i.description].join(' '))));
  const jobScore = matchScore(taskTokens, jobSet);
  const invScore = matchScore(taskTokens, invSet);
  const hasJob = jobScore >= THRESHOLD;
  const hasInv = invScore >= THRESHOLD;
  if (hasJob && hasInv) return { cov: COV.FULLY_RESOURCED, jobScore, invScore };
  if (hasJob) return { cov: COV.JOB_ASSIGNED, jobScore, invScore };
  if (hasInv) return { cov: COV.FUNDED, jobScore, invScore };
  return { cov: COV.DARK, jobScore, invScore };
}

export async function buildTsitScript() {
  const hdrs = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
  try {
    const [tRes, jRes, iRes] = await Promise.all([
      fetch(`${API}/entities/Task`, { headers: hdrs }),
      fetch(`${API}/entities/SwarmJob`, { headers: hdrs }),
      fetch(`${API}/entities/Investment`, { headers: hdrs }),
    ]);
    const tasks = normaliseArray(tRes.ok ? await tRes.json() : {}, 'items', 'data', 'results', 'tasks');
    const jobs = normaliseArray(jRes.ok ? await jRes.json() : {}, 'items', 'data', 'results', 'jobs');
    const investments = normaliseArray(iRes.ok ? await iRes.json() : {}, 'items', 'data', 'results', 'investments');
    const enriched = tasks.map(t => {
      const tt = tok([t.name, t.description, t.status, t.priority, t.tags, t.notes].join(' '));
      return { ...t, ...classifyTask(tt, jobs, investments) };
    });
    const fullyResourced = enriched.filter(t => t.cov === COV.FULLY_RESOURCED).length;
    const jobAssigned = enriched.filter(t => t.cov === COV.JOB_ASSIGNED).length;
    const funded = enriched.filter(t => t.cov === COV.FUNDED).length;
    const dark = enriched.filter(t => t.cov === COV.DARK).length;
    return `TASK × SWARM JOB × INVESTMENT TRIPLE COVERAGE. ${tasks.length} tasks cross-referenced against ${jobs.length} swarm jobs and ${investments.length} investments. FULLY RESOURCED: ${fullyResourced} tasks with both swarm job assignment and investment backing. JOB ASSIGNED: ${jobAssigned} tasks with swarm coverage but no investment match. FUNDED: ${funded} tasks with investment alignment but no swarm job. DARK: ${dark} tasks with neither swarm nor investment coverage. ${dark > 0 ? `${dark} task${dark > 1 ? 's are' : ' is'} completely unresourced — operational gap identified.` : 'All tasks have at least one resource dimension covered.'}`;
  } catch {
    return 'TSIT triple coverage check failed. Verify Task, SwarmJob, and Investment endpoints.';
  }
}

export default function TaskSwarmInvestmentTriple() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);

  const hdrs = { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    try {
      const [tRes, jRes, iRes] = await Promise.all([
        fetch(`${API}/entities/Task`, { headers: hdrs }),
        fetch(`${API}/entities/SwarmJob`, { headers: hdrs }),
        fetch(`${API}/entities/Investment`, { headers: hdrs }),
      ]);
      const t = normaliseArray(tRes.ok ? await tRes.json() : {}, 'items', 'data', 'results', 'tasks');
      const j = normaliseArray(jRes.ok ? await jRes.json() : {}, 'items', 'data', 'results', 'jobs');
      const i = normaliseArray(iRes.ok ? await iRes.json() : {}, 'items', 'data', 'results', 'investments');
      setTasks(t); setJobs(j); setInvestments(i);
      const e = t.map(task => {
        const tt = tok([task.name, task.description, task.status, task.priority, task.tags, task.notes].join(' '));
        const matchedJobs = j.filter(job => {
          const js = new Set(tok([job.name, job.description, job.target, job.objective, job.tags].join(' ')));
          return matchScore(tt, js) >= THRESHOLD;
        });
        const matchedInvs = i.filter(inv => {
          const is = new Set(tok([inv.name, inv.sector, inv.type, inv.notes, inv.tags, inv.description].join(' ')));
          return matchScore(tt, is) >= THRESHOLD;
        });
        const jobSet = new Set(j.flatMap(jb => tok([jb.name, jb.description, jb.target, jb.objective, jb.tags].join(' '))));
        const invSet = new Set(i.flatMap(iv => tok([iv.name, iv.sector, iv.type, iv.notes, iv.tags, iv.description].join(' '))));
        const jobScore = matchScore(tt, jobSet);
        const invScore = matchScore(tt, invSet);
        const hasJob = jobScore >= THRESHOLD;
        const hasInv = invScore >= THRESHOLD;
        let cov;
        if (hasJob && hasInv) cov = COV.FULLY_RESOURCED;
        else if (hasJob) cov = COV.JOB_ASSIGNED;
        else if (hasInv) cov = COV.FUNDED;
        else cov = COV.DARK;
        return { ...task, cov, jobScore, invScore, matchedJobs, matchedInvs };
      });
      setEnriched(e);
      setLastUpdate(new Date());
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:tsit-toggle', handler);
    return () => window.removeEventListener('jarvis:tsit-toggle', handler);
  }, []);

  const speak = (text) => window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));

  const assess = async (task) => {
    setAssessing(true); setAssessText('');
    try {
      const prompt = `Assess this task's resource coverage. Task: "${task.name || 'Unknown'}". Status: ${task.cov}. Swarm job match score: ${(task.jobScore * 100).toFixed(0)}%. Investment match score: ${(task.invScore * 100).toFixed(0)}%. Matched jobs: ${task.matchedJobs?.length || 0}. Matched investments: ${task.matchedInvs?.length || 0}. Provide a 2-sentence operational resource assessment.`;
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ message: prompt }),
      });
      const d = r.ok ? await r.json() : {};
      const txt = d.response || d.message || d.content || d.text || 'No assessment available.';
      setAssessText(txt);
      speak(txt);
    } catch { setAssessText('Assessment failed.'); }
    setAssessing(false);
  };

  const fullyResourced = enriched.filter(t => t.cov === COV.FULLY_RESOURCED).length;
  const jobAssigned = enriched.filter(t => t.cov === COV.JOB_ASSIGNED).length;
  const funded = enriched.filter(t => t.cov === COV.FUNDED).length;
  const dark = enriched.filter(t => t.cov === COV.DARK).length;

  const visible = enriched.filter(t => {
    if (filter !== 'ALL' && t.cov !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (t.name || '').toLowerCase().includes(s) || (t.description || '').toLowerCase().includes(s);
    }
    return true;
  });

  const BTN_STYLE = {
    position: 'fixed', left: 880640, bottom: 8, zIndex: 581,
    background: 'rgba(5,8,13,0.82)', border: '1px solid #0ff6', borderRadius: 4,
    color: '#0ff', fontSize: 9, padding: '3px 7px', cursor: 'pointer', letterSpacing: 1,
    fontFamily: "'JetBrains Mono',monospace",
  };

  return (
    <>
      <button style={BTN_STYLE} onClick={() => setOpen(o => !o)} title="Task × SwarmJob × Investment Coverage">
        ◈ TSIT
        {dark > 0 && (
          <span style={{ marginLeft: 4, background: '#ff4455', color: '#fff', borderRadius: 3, padding: '1px 4px', fontSize: 8 }}>
            {dark}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: 880640, bottom: 36, zIndex: 582,
          width: 340, maxHeight: '70vh', display: 'flex', flexDirection: 'column',
          background: 'rgba(5,8,13,0.95)', border: '1px solid #0ff4', borderRadius: 8,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#cde',
          boxShadow: '0 0 30px #0ff2',
        }}>
          <div style={{ padding: '6px 10px', borderBottom: '1px solid #0ff2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#0ff', fontWeight: 700, letterSpacing: 2, fontSize: 9 }}>TASK × SWARM × INVEST</span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#0ff7', cursor: 'pointer', fontSize: 12 }}>✕</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, padding: '6px 10px', borderBottom: '1px solid #0ff1' }}>
            {[
              { label: 'TASKS', val: enriched.length, color: '#0ff' },
              { label: 'FULL', val: fullyResourced, color: '#00ffcc' },
              { label: 'FUNDED', val: funded, color: '#ffd700' },
              { label: 'DARK', val: dark, color: '#ff4455' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ textAlign: 'center', padding: '4px 0', background: 'rgba(0,255,204,0.04)', borderRadius: 4 }}>
                <div style={{ color, fontSize: 13, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#556', fontSize: 7, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 2, padding: '4px 10px', borderBottom: '1px solid #0ff1', flexWrap: 'wrap' }}>
            {FILTER_TABS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ fontSize: 8, padding: '2px 5px', borderRadius: 3, cursor: 'pointer', letterSpacing: 0.5,
                  background: filter === f ? '#0ff' : 'transparent',
                  border: `1px solid ${filter === f ? '#0ff' : '#0ff4'}`,
                  color: filter === f ? '#04060A' : '#0ff8' }}>
                {f.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          <div style={{ padding: '4px 10px', borderBottom: '1px solid #0ff1' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…"
              style={{ width: '100%', background: 'transparent', border: '1px solid #0ff3', borderRadius: 3,
                color: '#cde', fontSize: 9, padding: '2px 6px', outline: 'none', boxSizing: 'border-box' }} />
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {visible.length === 0 && (
              <div style={{ padding: 10, color: '#446', fontSize: 9, textAlign: 'center' }}>No tasks match filter.</div>
            )}
            {visible.map((t, i) => {
              const key = t.id || t.name || i;
              const isExp = expanded === key;
              return (
                <div key={key} style={{ borderBottom: '1px solid #0ff1', padding: '5px 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                    onClick={() => setExpanded(isExp ? null : key)}>
                    <span style={{ color: COV_COLOUR[t.cov], fontWeight: 600, fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.name || `Task #${i + 1}`}
                    </span>
                    <span style={{ color: COV_COLOUR[t.cov], fontSize: 8, marginLeft: 6, flexShrink: 0 }}>{t.cov.replace(/_/g, ' ')}</span>
                  </div>
                  <div style={{ color: '#556', fontSize: 8, marginTop: 1 }}>
                    JOB: {(t.jobScore * 100).toFixed(0)}% · INV: {(t.invScore * 100).toFixed(0)}%
                    {t.priority && <span style={{ marginLeft: 6, color: '#888' }}>· {t.priority}</span>}
                    {t.status && <span style={{ marginLeft: 6, color: '#667' }}>· {t.status}</span>}
                  </div>
                  {isExp && (
                    <div style={{ marginTop: 5, paddingTop: 5, borderTop: '1px solid #0ff1' }}>
                      {t.matchedJobs && t.matchedJobs.length > 0 && (
                        <div style={{ marginBottom: 4 }}>
                          <div style={{ color: '#7bd4ff', fontSize: 8, marginBottom: 2 }}>SWARM JOBS ({t.matchedJobs.length}):</div>
                          {t.matchedJobs.slice(0, 3).map((j, ji) => (
                            <div key={ji} style={{ color: '#99b', fontSize: 8, paddingLeft: 6 }}>
                              · {j.name || `Job #${ji + 1}`}
                              {j.status && <span style={{ color: '#556', marginLeft: 4 }}>({j.status})</span>}
                            </div>
                          ))}
                          {t.matchedJobs.length > 3 && <div style={{ color: '#446', fontSize: 8, paddingLeft: 6 }}>+{t.matchedJobs.length - 3} more</div>}
                        </div>
                      )}
                      {t.matchedInvs && t.matchedInvs.length > 0 && (
                        <div style={{ marginBottom: 4 }}>
                          <div style={{ color: '#ffd700', fontSize: 8, marginBottom: 2 }}>INVESTMENTS ({t.matchedInvs.length}):</div>
                          {t.matchedInvs.slice(0, 3).map((inv, ii) => (
                            <div key={ii} style={{ color: '#99b', fontSize: 8, paddingLeft: 6 }}>
                              · {inv.name || `Inv #${ii + 1}`}
                              {inv.sector && <span style={{ color: '#556', marginLeft: 4 }}>({inv.sector})</span>}
                            </div>
                          ))}
                          {t.matchedInvs.length > 3 && <div style={{ color: '#446', fontSize: 8, paddingLeft: 6 }}>+{t.matchedInvs.length - 3} more</div>}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <button onClick={() => assess(t)}
                          style={{ fontSize: 9, padding: '2px 6px', background: '#001a22', border: '1px solid #0ff4', color: '#0ff', cursor: 'pointer', borderRadius: 3 }}>
                          ASSESS
                        </button>
                        <button onClick={() => speak(`Task ${t.name || 'unknown'}: ${t.cov.replace(/_/g, ' ')}. Swarm match: ${(t.jobScore * 100).toFixed(0)}%. Investment match: ${(t.invScore * 100).toFixed(0)}%.`)}
                          style={{ fontSize: 9, padding: '2px 6px', background: '#001a22', border: '1px solid #0ff4', color: '#0ff', cursor: 'pointer', borderRadius: 3 }}>
                          SPEAK
                        </button>
                      </div>
                      {assessing && expanded === key && <div style={{ color: '#888', fontSize: 9, marginTop: 3 }}>Assessing…</div>}
                      {assessText && expanded === key && <div style={{ color: '#aee', fontSize: 9, marginTop: 3, maxHeight: 80, overflowY: 'auto' }}>{assessText}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '4px 10px', borderTop: '1px solid #0ff2', display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#556' }}>
            <span>
              DARK: <span style={{ color: '#ff4455' }}>{dark}</span> ·
              FULL: <span style={{ color: '#00ffcc' }}>{fullyResourced}</span>
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {lastUpdate && <span style={{ fontSize: 8, color: '#334' }}>{lastUpdate.toLocaleTimeString()}</span>}
              <button onClick={load} style={{ background: 'none', border: 'none', color: '#0ff7', cursor: 'pointer', fontSize: 9 }}>↻</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
