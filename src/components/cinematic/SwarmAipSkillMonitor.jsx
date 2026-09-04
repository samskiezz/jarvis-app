/**
 * F446 — SwarmJob × AIP Skill Coverage Monitor (SASM)
 *
 * Answers: "For each running swarm job, is there an AIP skill that can
 * resource it — or is the job operating without any dedicated skill?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/SwarmJob   → all swarm jobs
 *   GET /v1/aip/skill        → all registered AIP skills
 *
 * Classification per swarm job:
 *   SKILLED     — ≥1 AIP skill keyword-matches the job
 *   UNSUPPORTED — no AIP skill correlates — operational blind spot
 *
 * Stat tiles:  jobs / skills / skilled / unsupported
 * Amber badge: UNSUPPORTED count on button
 * Expand row:  matched skills (max 5) with category badge + relevance bar
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat +
 *             jarvis:speak-dossier TTS
 *
 * Toggle:  ◈ SASM  at left:7800, bottom:18, zIndex:68
 * Event:   jarvis:sasm-toggle
 * Voice:   "swarm skill / skill swarm / sasm / unsupported swarm /
 *           swarm without skill / skill swarm gap / aip swarm /
 *           swarm coverage skill / swarm aip coverage"
 * Refresh: 90 s auto-poll.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) ||
  'dev-key';

const BG   = 'rgba(10,12,20,0.97)';
const BD   = 'rgba(255,255,255,0.10)';
const MU   = '#64748B';
const CY   = '#06B6D4';
const GR   = '#10B981';
const AM   = '#F59E0B';
const MONO = "'JetBrains Mono','Fira Code',monospace";

const FILTERS     = ['ALL', 'SKILLED', 'UNSUPPORTED'];
const CLASS_COLOR = { SKILLED: GR, UNSUPPORTED: AM };
const CLASS_LABEL = { SKILLED: 'SKLD', UNSUPPORTED: 'NONE' };

const STATUS_COLOR = {
  running:   CY,
  queued:    AM,
  completed: GR,
  failed:    '#EF4444',
};

function tokens(str) {
  if (!str) return [];
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(s => s.length > 2);
}

function score(srcTokens, target) {
  const tgt = tokens(
    [target.name, target.description, target.category,
     ...(target.tags || [])].join(' ')
  );
  if (!tgt.length) return 0;
  return srcTokens.filter(t => tgt.includes(t)).length / Math.max(srcTokens.length, 1);
}

function hdr() {
  return { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' };
}

async function fetchJson(url) {
  const r = await fetch(API + url, { headers: hdr() });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

function Bar({ pct, color }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 2, height: 4, flex: 1 }}>
      <div style={{ width: `${Math.min(100, pct * 100)}%`, background: color, height: 4, borderRadius: 2, transition: 'width 0.4s' }} />
    </div>
  );
}

function Tile({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BD}`, borderRadius: 4, padding: '6px 10px', textAlign: 'center' }}>
      <div style={{ fontFamily: MONO, fontSize: 18, color: color || CY, fontWeight: 700 }}>{value}</div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: MU, letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

export default function SwarmAipSkillMonitor() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);
  const [filter, setFilter]       = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef                  = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [jobsRaw, skillsRaw] = await Promise.all([
        fetchJson('/entities/SwarmJob'),
        fetchJson('/v1/aip/skill'),
      ]);
      const jobs   = jobsRaw?.items   || jobsRaw?.data   || (Array.isArray(jobsRaw)   ? jobsRaw   : []);
      const skills = skillsRaw?.items || skillsRaw?.data || skillsRaw?.skills || (Array.isArray(skillsRaw) ? skillsRaw : []);

      const classified = jobs.map(job => {
        const toks = tokens(
          [job.name, job.description, job.target, job.objective, job.type,
           ...(job.tags || [])].join(' ')
        );
        const matched = skills
          .map(s => ({ ...s, _rel: score(toks, s) }))
          .filter(s => s._rel > 0)
          .sort((a, b) => b._rel - a._rel)
          .slice(0, 5);
        const cls = matched.length > 0 ? 'SKILLED' : 'UNSUPPORTED';
        return { ...job, _cls: cls, _skills: matched };
      });

      setRows(classified);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener('jarvis:sasm-toggle', handler);
    return () => window.removeEventListener('jarvis:sasm-toggle', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const filtered = rows.filter(r => {
    if (filter !== 'ALL' && r._cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.name || r.description || r.target || '').toLowerCase().includes(q);
    }
    return true;
  });

  const skilled     = rows.filter(r => r._cls === 'SKILLED').length;
  const unsupported = rows.filter(r => r._cls === 'UNSUPPORTED').length;

  async function assess() {
    setAssessing(true);
    try {
      const summary = `${rows.length} swarm jobs: ${skilled} have AIP skill coverage, ${unsupported} are unsupported (no correlated AIP skill).`;
      const prompt  = `You are JARVIS. Given: ${summary}. Provide a 2-sentence swarm skill coverage brief covering the biggest gap and the recommended immediate action.`;
      const r = await fetch(API + '/v1/jarvis/agent/chat', {
        method: 'POST',
        headers: hdr(),
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d?.response || d?.message || d?.content || 'Assessment unavailable.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch (e) {
      console.error('SASM assess error', e);
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', left: 7800, bottom: 18, zIndex: 68,
          background: unsupported > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(6,182,212,0.10)',
          border: `1px solid ${unsupported > 0 ? AM : CY}`,
          borderRadius: 4, padding: '3px 8px', cursor: 'pointer',
          fontFamily: MONO, fontSize: 10, color: unsupported > 0 ? AM : CY,
          display: 'flex', alignItems: 'center', gap: 5,
        }}
        title="SwarmJob × AIP Skill Coverage Monitor (SASM)"
      >
        ◈ SASM
        {unsupported > 0 && (
          <span style={{ background: AM, color: '#000', borderRadius: 10, padding: '0 5px', fontSize: 9, fontWeight: 700 }}>
            {unsupported}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', right: 18, top: 60, width: 480, maxHeight: '85vh',
      background: BG, border: `1px solid ${CY}`, borderRadius: 8, zIndex: 9900,
      display: 'flex', flexDirection: 'column', fontFamily: MONO, overflow: 'hidden',
      boxShadow: `0 0 30px rgba(6,182,212,0.15)`,
    }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BD}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: CY, fontSize: 11, fontWeight: 700, flex: 1, letterSpacing: 1 }}>
          ◈ SWARM × AIP SKILL COVERAGE
        </span>
        <button onClick={assess} disabled={assessing} style={{ background: 'rgba(6,182,212,0.15)', border: `1px solid ${CY}`, borderRadius: 3, color: CY, fontSize: 9, padding: '2px 8px', cursor: 'pointer' }}>
          {assessing ? '...' : '▶ ASSESS'}
        </button>
        <button onClick={load} style={{ background: 'none', border: 'none', color: MU, cursor: 'pointer', fontSize: 12 }}>⟳</button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: MU, cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px' }}>
        <Tile label="JOBS"        value={rows.length} />
        <Tile label="SKILLED"     value={skilled}     color={GR} />
        <Tile label="UNSUPPORTED" value={unsupported} color={unsupported > 0 ? AM : MU} />
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 6px', flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? 'rgba(6,182,212,0.15)' : 'none',
            border: `1px solid ${filter === f ? CY : BD}`,
            borderRadius: 3, color: filter === f ? CY : MU,
            fontSize: 9, padding: '2px 7px', cursor: 'pointer',
          }}>{f}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '0 14px 6px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search swarm jobs…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BD}`, borderRadius: 3, color: '#cdd6f4', fontSize: 10, padding: '4px 8px', fontFamily: MONO, boxSizing: 'border-box' }}
        />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px' }}>
        {loading && <div style={{ color: MU, fontSize: 10, textAlign: 'center', padding: 20 }}>loading…</div>}
        {err     && <div style={{ color: '#EF4444', fontSize: 10, padding: 10 }}>Error: {err}</div>}
        {!loading && !err && filtered.length === 0 && (
          <div style={{ color: MU, fontSize: 10, textAlign: 'center', padding: 20 }}>no swarm jobs match</div>
        )}
        {filtered.map((job, i) => {
          const id  = job.id || job._id || i;
          const exp = expanded[id];
          const clr = CLASS_COLOR[job._cls] || MU;
          const status = (job.status || '').toLowerCase();
          const statClr = STATUS_COLOR[status] || MU;
          const title = job.name || job.description || job.target || `Job ${i + 1}`;
          return (
            <div key={id} style={{ marginBottom: 4 }}>
              <div
                onClick={() => setExpanded(p => ({ ...p, [id]: !p[id] }))}
                style={{
                  background: 'rgba(255,255,255,0.03)', border: `1px solid ${BD}`, borderRadius: 4,
                  padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <span style={{ fontSize: 9, color: clr, fontWeight: 700, minWidth: 32 }}>
                  {CLASS_LABEL[job._cls]}
                </span>
                {status && (
                  <span style={{ fontSize: 8, color: statClr, border: `1px solid ${statClr}`, borderRadius: 2, padding: '1px 4px', minWidth: 28, textAlign: 'center' }}>
                    {status.toUpperCase().slice(0, 4)}
                  </span>
                )}
                <span style={{ flex: 1, fontSize: 10, color: '#cdd6f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {title}
                </span>
                <span style={{ fontSize: 9, color: MU }}>{exp ? '▲' : '▼'}</span>
              </div>

              {exp && (
                <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${BD}`, borderRadius: '0 0 4px 4px', padding: '8px 10px', marginTop: -1 }}>
                  {job._skills.length > 0 ? (
                    <>
                      <div style={{ fontSize: 9, color: CY, marginBottom: 4, letterSpacing: 1 }}>MATCHED AIP SKILLS ({job._skills.length})</div>
                      {job._skills.map((s, si) => (
                        <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          {s.category && (
                            <span style={{ fontSize: 8, color: AM, border: `1px solid ${AM}`, borderRadius: 2, padding: '1px 3px', minWidth: 30, textAlign: 'center', whiteSpace: 'nowrap' }}>
                              {s.category.slice(0, 6).toUpperCase()}
                            </span>
                          )}
                          <span style={{ flex: 1, fontSize: 9, color: '#cdd6f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.name || `Skill ${si + 1}`}
                          </span>
                          <Bar pct={s._rel} color={GR} />
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{ fontSize: 9, color: AM }}>No correlated AIP skill found — unsupported swarm job.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── JarvisBrain intent helpers ───────────────────────────────────────────────
const SASM_TRIGGERS = [
  'swarm skill', 'skill swarm', 'sasm', 'unsupported swarm',
  'swarm without skill', 'skill swarm gap', 'aip swarm',
  'swarm coverage skill', 'swarm aip coverage',
];

export function isSasmQuery(q) {
  const lq = (q || '').toLowerCase();
  return SASM_TRIGGERS.some(t => lq.includes(t));
}

export async function buildSasmScript() {
  try {
    const [jobsRaw, skillsRaw] = await Promise.all([
      fetch('/entities/SwarmJob', { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      fetch('/v1/aip/skill',      { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    ]);
    const jobs   = jobsRaw?.items   || jobsRaw?.data   || (Array.isArray(jobsRaw)   ? jobsRaw   : []);
    const skills = skillsRaw?.items || skillsRaw?.data || skillsRaw?.skills || (Array.isArray(skillsRaw) ? skillsRaw : []);
    let skilled = 0;
    jobs.forEach(job => {
      const toks = tokens([job.name, job.description, job.target, job.objective, job.type, ...(job.tags || [])].join(' '));
      if (skills.some(s => score(toks, s) > 0)) skilled++;
    });
    const unsupported = jobs.length - skilled;
    return `JARVIS: ${jobs.length} swarm jobs — ${skilled} have AIP skill coverage, ${unsupported} unsupported. Opening SASM for swarm-skill coverage details.`;
  } catch {
    return 'JARVIS: Opening SwarmJob × AIP Skill Coverage Monitor — SASM panel loading.';
  }
}
