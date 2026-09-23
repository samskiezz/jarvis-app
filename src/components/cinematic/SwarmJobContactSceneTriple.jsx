import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const SJCSCN_RE = /\b(sjcscn|swarm\s+(job\s+)?(contact|person)\s+scene|contact\s+swarm\s+scene|scene\s+swarm\s+contact|unmapped\s+swarm(\s+job)?|swarm\s+scene\s+contact|swarm\s+contact\s+scene|swarm\s+job\s+scene|swarm\s+job\s+contact\s+scene)\b/i;

const THRESHOLD = 0.07;

const SCENE_IDS = [
  '01_command_atrium',
  '02_ai_core_chamber',
  '03_world_control_room',
  '04_intelligence_graph_space',
  '05_operations_war_room',
  '06_data_fusion_reactor',
  '07_document_intelligence_vault',
  '08_simulation_theatre',
  '09_analytics_observatory',
  '10_system_security_core',
];

function tok(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  const hits = toks.filter(t => ft.includes(t)).length;
  return hits / toks.length;
}

function normaliseSwarmJobs(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.swarm_jobs) ? data.swarm_jobs
    : Array.isArray(data.swarmJobs) ? data.swarmJobs
    : Array.isArray(data.jobs) ? data.jobs
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(j => ({
    id: j.id || j._id || j.jobId || String(Math.random()),
    name: j.name || j.title || j.label || j.objective || 'Untitled Job',
    description: j.description || j.summary || j.objective || '',
    type: j.type || j.job_type || j.category || '',
    status: j.status || j.state || '',
    tags: Array.isArray(j.tags) ? j.tags.join(' ') : String(j.tags || ''),
    raw: j,
  }));
}

function normaliseContacts(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.contacts) ? data.contacts
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(c => ({
    id: c.id || c._id || c.contactId || String(Math.random()),
    name: c.name || c.full_name || c.display_name || 'Unknown Contact',
    company: c.company || c.organisation || c.org || '',
    title: c.title || c.role || c.position || '',
    email: c.email || '',
    tags: Array.isArray(c.tags) ? c.tags.join(' ') : String(c.tags || ''),
    description: c.description || c.notes || c.bio || '',
    raw: c,
  }));
}

function normaliseScene(data, sceneId) {
  if (!data) return { id: sceneId, anchors: [] };
  const anchors = Array.isArray(data.anchors) ? data.anchors
    : Array.isArray(data.data) ? data.data
    : [];
  const label = data.label || data.name || data.title || sceneId.replace(/_/g, ' ');
  const anchorText = anchors.map(a =>
    [a.key, a.label, a.value, a.description].filter(Boolean).join(' ')
  ).join(' ');
  return { id: sceneId, label, anchors, anchorText };
}

function correlate(swarmJobs, contacts, scenes) {
  return swarmJobs.map(job => {
    const toks = tok([job.name, job.description, job.type, job.tags, job.status].join(' '));

    const matchedContacts = contacts
      .map(c => {
        const score = Math.max(
          matchScore(toks, c.name),
          matchScore(toks, c.company),
          matchScore(toks, c.title),
          matchScore(toks, c.tags),
          matchScore(toks, c.description),
        );
        return { ...c, matchScore: score };
      })
      .filter(c => c.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const matchedScenes = scenes
      .map(s => {
        const score = Math.max(
          matchScore(toks, s.label),
          matchScore(toks, s.anchorText),
        );
        return { ...s, matchScore: score };
      })
      .filter(s => s.matchScore >= THRESHOLD)
      .sort((a, b) => b.matchScore - a.matchScore);

    const hasContact = matchedContacts.length > 0;
    const hasScene = matchedScenes.length > 0;

    let state;
    if (hasContact && hasScene) state = 'FULLY LINKED';
    else if (hasContact) state = 'CONTACT-LINKED';
    else if (hasScene) state = 'SCENE-ANCHORED';
    else state = 'UNMAPPED';

    return { job, matchedContacts, matchedScenes, state };
  });
}

export function isSjcscnQuery(t) {
  return SJCSCN_RE.test(t || '');
}

export async function buildSjcscnScript() {
  try {
    const sceneResults = await Promise.allSettled(
      SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : null))
    );
    const scenes = sceneResults.map((r, i) =>
      normaliseScene(r.status === 'fulfilled' ? r.value : null, SCENE_IDS[i])
    );

    const [jobsRes, contactsRes] = await Promise.allSettled([
      fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : null),
    ]);

    const swarmJobs = normaliseSwarmJobs(jobsRes.status === 'fulfilled' ? jobsRes.value : null);
    const contacts = normaliseContacts(contactsRes.status === 'fulfilled' ? contactsRes.value : null);
    const rows = correlate(swarmJobs, contacts, scenes);
    const fullyLinked = rows.filter(r => r.state === 'FULLY LINKED').length;
    const contactLinked = rows.filter(r => r.state === 'CONTACT-LINKED').length;
    const sceneAnchored = rows.filter(r => r.state === 'SCENE-ANCHORED').length;
    const unmapped = rows.filter(r => r.state === 'UNMAPPED').length;
    return `SJCSCN SwarmJob×Contact×Scene: ${rows.length} swarm jobs analysed. ` +
      `${fullyLinked} FULLY LINKED (contact + scene), ` +
      `${contactLinked} CONTACT-LINKED only, ${sceneAnchored} SCENE-ANCHORED only, ${unmapped} UNMAPPED. ` +
      (unmapped > 0
        ? `Top unmapped: "${rows.find(r => r.state === 'UNMAPPED')?.job.name || 'see panel'}" — no contact or scene coverage.`
        : 'All swarm jobs have contact or scene coverage.');
  } catch {
    return 'SJCSCN: data fetch failed.';
  }
}

export default function SwarmJobContactSceneTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener('jarvis:sjcscn-toggle', handler);
    return () => window.removeEventListener('jarvis:sjcscn-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const sceneResults = await Promise.allSettled(
        SCENE_IDS.map(id => fetch(`${API}/v1/cinematic/scene/${id}`).then(r => r.ok ? r.json() : Promise.reject(r.status)))
      );
      const scenes = sceneResults.map((r, i) =>
        normaliseScene(r.status === 'fulfilled' ? r.value : null, SCENE_IDS[i])
      );

      const [jobsRes, contactsRes] = await Promise.allSettled([
        fetch(`${API}/entities/SwarmJob`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);

      const swarmJobs = normaliseSwarmJobs(jobsRes.status === 'fulfilled' ? jobsRes.value : null);
      const contacts = normaliseContacts(contactsRes.status === 'fulfilled' ? contactsRes.value : null);

      if (!swarmJobs.length && !contacts.length) {
        setErr('No data returned from SwarmJob or Contact endpoints.');
      }

      setRows(correlate(swarmJobs, contacts, scenes));
      setLastRefresh(new Date());
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const fullyLinked = rows.filter(r => r.state === 'FULLY LINKED').length;
  const contactLinked = rows.filter(r => r.state === 'CONTACT-LINKED').length;
  const sceneAnchored = rows.filter(r => r.state === 'SCENE-ANCHORED').length;
  const unmapped = rows.filter(r => r.state === 'UNMAPPED').length;

  const TABS = ['ALL', 'FULLY LINKED', 'CONTACT-LINKED', 'SCENE-ANCHORED', 'UNMAPPED'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.job.name.toLowerCase().includes(q) ||
        r.job.description.toLowerCase().includes(q) ||
        r.matchedContacts.some(c => c.name.toLowerCase().includes(q)) ||
        r.matchedScenes.some(s => s.label.toLowerCase().includes(q));
    }
    return true;
  });

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Swarm job "${row.job.name}" [${row.state}]: ` +
      `matched contacts: ${row.matchedContacts.map(c => c.name).join(', ') || 'none'}. ` +
      `matched scenes: ${row.matchedScenes.map(s => s.label).join(', ') || 'none'}. ` +
      `Job type: ${row.job.type || 'unknown'}, status: ${row.job.status || 'unknown'}. ` +
      `Give a 2-sentence swarm job accountability and scene-context brief — does this job have adequate human contact coverage and cinematic scene anchoring, or is it an unmapped automation gap?`;
    try {
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = res.ok ? await res.json() : null;
      const text = data?.response || data?.message || data?.content || 'No assessment returned.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
      fetch(`${API}/v1/voice/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }).catch(() => {});
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }, []);

  const STATE_COLOUR = {
    'FULLY LINKED':    '#22d3ee',
    'CONTACT-LINKED':  '#a78bfa',
    'SCENE-ANCHORED':  '#34d399',
    'UNMAPPED':        '#888',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 776480,
          bottom: 8,
          zIndex: 415,
          background: 'rgba(0,20,40,0.92)',
          border: '1px solid #22d3ee44',
          color: '#22d3ee',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: 1,
        }}
      >
        ◈ SJCSCN
        {unmapped > 0 ? (
          <span style={{
            marginLeft: 5,
            background: '#888',
            color: '#fff',
            borderRadius: 8,
            padding: '1px 5px',
            fontSize: 10,
          }}>
            {unmapped}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 60,
      right: 16,
      width: 700,
      maxHeight: 'calc(100vh - 80px)',
      overflowY: 'auto',
      background: 'rgba(0,12,28,0.97)',
      border: '1px solid #22d3ee55',
      borderRadius: 8,
      zIndex: 415,
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#c8e6ff',
      boxShadow: '0 0 32px #22d3ee22',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #22d3ee22',
        background: 'rgba(34,211,238,0.05)',
      }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, letterSpacing: 1 }}>
          ◈ SWARM JOB × CONTACT × SCENE
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastRefresh && (
            <span style={{ color: '#555', fontSize: 10 }}>
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: 'none',
              border: '1px solid #22d3ee44',
              color: '#22d3ee',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 11,
            }}
          >
            {loading ? '…' : '↻'}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: 14,
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid #22d3ee11' }}>
        {[
          { label: 'FULLY LINKED',   val: fullyLinked,   col: '#22d3ee' },
          { label: 'CONTACT-LINKED', val: contactLinked, col: '#a78bfa' },
          { label: 'SCENE-ANCHORED', val: sceneAnchored, col: '#34d399' },
          { label: 'UNMAPPED',       val: unmapped,      col: '#888' },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1,
            textAlign: 'center',
            background: 'rgba(34,211,238,0.04)',
            border: `1px solid ${s.col}33`,
            borderRadius: 4,
            padding: '6px 4px',
          }}>
            <div style={{ color: s.col, fontSize: 18, fontWeight: 700 }}>{s.val}</div>
            <div style={{ color: '#556', fontSize: 9, letterSpacing: 0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #22d3ee11' }}>
          <div style={{ fontSize: 10, color: '#556', marginBottom: 3 }}>
            COVERAGE — {Math.round((fullyLinked / rows.length) * 100)}% fully linked
          </div>
          <div style={{ height: 4, background: '#111', borderRadius: 2, display: 'flex', overflow: 'hidden' }}>
            <div style={{ width: `${(fullyLinked / rows.length) * 100}%`, background: '#22d3ee' }} />
            <div style={{ width: `${(contactLinked / rows.length) * 100}%`, background: '#a78bfa' }} />
            <div style={{ width: `${(sceneAnchored / rows.length) * 100}%`, background: '#34d399' }} />
            <div style={{ width: `${(unmapped / rows.length) * 100}%`, background: '#333' }} />
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #22d3ee11', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? 'rgba(34,211,238,0.18)' : 'none',
              border: `1px solid ${filter === t ? '#22d3ee' : '#22d3ee22'}`,
              color: filter === t ? '#22d3ee' : '#556',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 10,
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: 'auto',
            background: 'rgba(34,211,238,0.05)',
            border: '1px solid #22d3ee22',
            color: '#c8e6ff',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 10,
            fontFamily: 'monospace',
            outline: 'none',
            width: 120,
          }}
        />
      </div>

      {/* Error */}
      {err && (
        <div style={{ padding: '6px 12px', color: '#ff4444', fontSize: 11 }}>
          {err}
        </div>
      )}

      {/* Loading */}
      {loading && !rows.length && (
        <div style={{ padding: '16px 12px', color: '#556', textAlign: 'center' }}>
          Loading…
        </div>
      )}

      {/* Rows */}
      <div>
        {visible.map((row, i) => {
          const key = row.job.id + i;
          const isExpanded = expanded === key;
          return (
            <div
              key={key}
              style={{ borderBottom: '1px solid #22d3ee0a', padding: '6px 12px' }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                onClick={() => setExpanded(isExpanded ? null : key)}
              >
                <span style={{
                  display: 'inline-block',
                  minWidth: 112,
                  fontSize: 9,
                  fontWeight: 700,
                  color: STATE_COLOUR[row.state],
                  background: `${STATE_COLOUR[row.state]}18`,
                  border: `1px solid ${STATE_COLOUR[row.state]}44`,
                  borderRadius: 3,
                  padding: '1px 5px',
                  letterSpacing: 0.5,
                  textAlign: 'center',
                }}>
                  {row.state}
                </span>
                <span style={{ flex: 1, color: '#c8e6ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.job.name}
                </span>
                {row.job.type && (
                  <span style={{ fontSize: 9, color: '#22d3ee88', background: 'rgba(34,211,238,0.08)', borderRadius: 3, padding: '1px 5px' }}>
                    {row.job.type}
                  </span>
                )}
                {row.job.status && (
                  <span style={{ fontSize: 9, color: '#556' }}>{row.job.status}</span>
                )}
                <span style={{ color: '#444', fontSize: 10 }}>{isExpanded ? '▲' : '▼'}</span>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  {/* Contacts */}
                  <div style={{ flex: 1, background: 'rgba(167,139,250,0.05)', borderRadius: 4, padding: '6px 8px' }}>
                    <div style={{ color: '#a78bfa', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      CONTACTS ({row.matchedContacts.length})
                    </div>
                    {row.matchedContacts.length === 0 ? (
                      <div style={{ color: '#444', fontSize: 10 }}>No contact match</div>
                    ) : (
                      row.matchedContacts.slice(0, 5).map((c, j) => (
                        <div key={c.id + j} style={{ marginBottom: 4 }}>
                          <div style={{ color: '#c8e6ff', fontSize: 10, marginBottom: 1 }}>{c.name}</div>
                          {(c.company || c.title) && (
                            <div style={{ fontSize: 9, color: '#a78bfa88' }}>
                              {[c.title, c.company].filter(Boolean).join(' · ')}
                            </div>
                          )}
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(c.matchScore * 100)}%`, background: '#a78bfa', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Scenes */}
                  <div style={{ flex: 1, background: 'rgba(52,211,153,0.05)', borderRadius: 4, padding: '6px 8px' }}>
                    <div style={{ color: '#34d399', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                      SCENES ({row.matchedScenes.length})
                    </div>
                    {row.matchedScenes.length === 0 ? (
                      <div style={{ color: '#444', fontSize: 10 }}>No scene match</div>
                    ) : (
                      row.matchedScenes.slice(0, 5).map((s, j) => (
                        <div key={s.id + j} style={{ marginBottom: 4 }}>
                          <div style={{ color: '#c8e6ff', fontSize: 10, marginBottom: 1 }}>{s.label}</div>
                          <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(s.matchScore * 100)}%`, background: '#34d399', height: '100%' }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {isExpanded && (
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing}
                    style={{
                      background: 'rgba(34,211,238,0.1)',
                      border: '1px solid #22d3ee44',
                      color: '#22d3ee',
                      padding: '3px 12px',
                      borderRadius: 3,
                      fontSize: 10,
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                    }}
                  >
                    {assessing ? '…' : '▶ ASSESS'}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {!loading && !err && visible.length === 0 && rows.length > 0 && (
          <div style={{ padding: '12px', color: '#556', textAlign: 'center', fontSize: 11 }}>
            No items match the current filter.
          </div>
        )}
      </div>
    </div>
  );
}
