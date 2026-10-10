import { useState, useEffect, useCallback, useRef } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const IPLIGA_RE = /\b(ipliga|intel\s+profile\s+live|intel\s+live\s+annotation|profile\s+live\s+world|profile\s+annotation\s+live|intel\s+annotation\s+world|intel\s+world\s+annotation|intel\s+profile\s+world\s+event|profile\s+live\s+intel|intel\s+profile\s+graph\s+annotation\s+live|alarmed\s+intel\s+profile|intel\s+profile\s+annotation\s+live|intel\s+profile\s+fully\s+alarmed)\b/i;

export function isIpligaQuery(t) { return IPLIGA_RE.test(t || ''); }

export async function buildIpligaScript() {
  try {
    const base = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';
    const headers = { 'Content-Type': 'application/json' };
    const [profRaw, liveRaw, annRaw] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/functions/getLiveIntel`, { headers }).then(r => r.ok ? r.json() : {}),
      fetch(`${base}/v1/graph/annotations`, { headers }).then(r => r.ok ? r.json() : []),
    ]);
    const profiles = normaliseProfiles(profRaw);
    const live = normaliseLive(liveRaw);
    const anns = normaliseAnnotations(annRaw);
    const classified = profiles.map(p => classifyProfile(p, live, anns));
    const fully   = classified.filter(p => p.state === 'FULLY_ALARMED').length;
    const worldTr = classified.filter(p => p.state === 'WORLD_TRIGGERED').length;
    const graphAn = classified.filter(p => p.state === 'GRAPH_ANNOTATED').length;
    const dark    = classified.filter(p => p.state === 'DARK').length;
    const total   = classified.length;
    return `IPLIGA coverage: ${total} intel profiles assessed against ${live.length} live world events and ${anns.length} graph annotations. Fully alarmed ${fully}, world-triggered ${worldTr}, graph-annotated ${graphAn}, dark ${dark}. Alert density ${total > 0 ? Math.round((fully / total) * 100) : 0}%.`;
  } catch {
    return 'IPLIGA coverage data unavailable.';
  }
}

const THRESHOLD = 0.07;

function tok(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function matchScore(toks, fieldText) {
  if (!toks.length || !fieldText) return 0;
  const ft = tok(fieldText);
  if (!ft.length) return 0;
  const hits = toks.filter(t => ft.includes(t)).length;
  return hits / toks.length;
}

function normaliseProfiles(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.items || raw?.data || raw?.results || raw?.profiles || []);
  return arr.map((p, i) => ({
    id: p.id || p._id || `ip-${i}`,
    name: p.name || p.full_name || p.entity_name || `Profile ${i + 1}`,
    company: p.company || p.organization || p.employer || '',
    role: p.role || p.title || p.position || p.job_title || '',
    sector: p.sector || p.industry || p.domain || '',
    nationality: p.nationality || p.country || p.region || '',
    aliases: Array.isArray(p.aliases) ? p.aliases.join(' ') : (p.aliases || ''),
    tags: Array.isArray(p.tags) ? p.tags.join(' ') : (p.tags || ''),
  }));
}

function normaliseLive(raw) {
  const items = [];
  try {
    const eq = raw?.earthquake?.features || raw?.earthquakes || [];
    eq.forEach(f => {
      const p = f?.properties || f || {};
      items.push({
        type: 'SEISMIC',
        name: p.place || p.title || p.name || '',
        location: p.place || p.region || '',
        symbol: '',
        mag: p.mag || p.magnitude || '',
      });
    });
  } catch {}
  try {
    const crypto = raw?.crypto?.data || (Array.isArray(raw?.crypto) ? raw.crypto : Object.values(raw?.crypto || {}));
    crypto.forEach(c => {
      items.push({
        type: 'CRYPTO',
        name: c.name || c.id || c.symbol || '',
        location: '',
        symbol: c.symbol || c.id || '',
        mag: '',
      });
    });
  } catch {}
  try {
    const rates = raw?.forex?.rates || raw?.fx?.rates || {};
    Object.keys(rates).forEach(k => {
      items.push({ type: 'FX', name: k, location: '', symbol: k, mag: '' });
    });
  } catch {}
  return items;
}

function normaliseAnnotations(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.items || raw?.data || raw?.results || raw?.annotations || []);
  return arr.map((a, i) => ({
    id: a.id || a._id || `ann-${i}`,
    label: a.label || a.name || a.title || a.text || a.content || `Annotation ${i + 1}`,
    note: a.note || a.description || a.body || '',
    target_type: a.target_type || a.targetType || a.type || '',
    actor: a.actor || a.author || a.created_by || '',
    tags: Array.isArray(a.tags) ? a.tags.join(' ') : (a.tags || ''),
  }));
}

function classifyProfile(profile, live, anns) {
  const toks = tok(`${profile.name} ${profile.company} ${profile.role} ${profile.sector} ${profile.nationality} ${profile.aliases} ${profile.tags}`);
  const matchedLive = live.filter(e =>
    matchScore(toks, `${e.name} ${e.location} ${e.symbol} ${e.type}`) >= THRESHOLD
  );
  const matchedAnns = anns.filter(a =>
    matchScore(toks, `${a.label} ${a.note} ${a.target_type} ${a.actor} ${a.tags}`) >= THRESHOLD
  );
  let state = 'DARK';
  if (matchedLive.length && matchedAnns.length) state = 'FULLY_ALARMED';
  else if (matchedLive.length) state = 'WORLD_TRIGGERED';
  else if (matchedAnns.length) state = 'GRAPH_ANNOTATED';
  return { ...profile, state, matchedLive, matchedAnns };
}

const STATE_META = {
  FULLY_ALARMED:   { label: 'Fully Alarmed',   color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  WORLD_TRIGGERED: { label: 'World Triggered',  color: '#fb923c', bg: 'rgba(251,146,60,0.12)'  },
  GRAPH_ANNOTATED: { label: 'Graph Annotated',  color: '#38bdf8', bg: 'rgba(56,189,248,0.12)'  },
  DARK:            { label: 'Dark',             color: '#6b7280', bg: 'rgba(107,114,128,0.10)'  },
};

export default function IntelProfileLiveAnnotationTriple() {
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [profiles, setProfiles]   = useState([]);
  const [live, setLive]           = useState([]);
  const [anns, setAnns]           = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter, setFilter]       = useState('ALL');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const headers = { 'Content-Type': 'application/json' };
      const [profRaw, liveRaw, annRaw] = await Promise.all([
        fetch(`${API}/entities/IntelProfile`, { headers }).then(r => r.ok ? r.json() : []),
        fetch(`${API}/functions/getLiveIntel`, { headers }).then(r => r.ok ? r.json() : {}),
        fetch(`${API}/v1/graph/annotations`, { headers }).then(r => r.ok ? r.json() : []),
      ]);
      const profs = normaliseProfiles(profRaw);
      const lv    = normaliseLive(liveRaw);
      const an    = normaliseAnnotations(annRaw);
      setProfiles(profs);
      setLive(lv);
      setAnns(an);
      setClassified(profs.map(p => classifyProfile(p, lv, an)));
    } catch (e) {
      setError(e.message || 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    const onVoice  = e => { if (isIpligaQuery(e.detail?.text || e.detail?.query || '')) setOpen(true); };
    window.addEventListener('jarvis:ipliga-toggle', onToggle);
    window.addEventListener('jarvis:voice-query',   onVoice);
    return () => {
      window.removeEventListener('jarvis:ipliga-toggle', onToggle);
      window.removeEventListener('jarvis:voice-query',   onVoice);
    };
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    fetchAll();
    timerRef.current = setInterval(fetchAll, 60000);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAll]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const total  = classified.length;
      const fully  = classified.filter(p => p.state === 'FULLY_ALARMED').length;
      const dark   = classified.filter(p => p.state === 'DARK').length;
      const msg = `IPLIGA: ${total} intel profiles assessed against ${live.length} live world events and ${anns.length} graph annotations. Fully alarmed (live+annotation) ${fully}, dark (no coverage) ${dark}. Provide a 2-sentence intelligence coverage risk brief.`;
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ message: msg }),
      });
      const d = await r.json();
      const answer = (d.answer || d.response || d.message || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      if (answer) window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: answer } }));
    } catch {}
    setAssessing(false);
  }, [classified, live, anns]);

  if (!open) return null;

  const fully   = classified.filter(p => p.state === 'FULLY_ALARMED').length;
  const worldTr = classified.filter(p => p.state === 'WORLD_TRIGGERED').length;
  const graphAn = classified.filter(p => p.state === 'GRAPH_ANNOTATED').length;
  const dark    = classified.filter(p => p.state === 'DARK').length;
  const total   = classified.length || 1;
  const covPct  = Math.round(((fully + worldTr + graphAn) / total) * 100);

  const visible = classified.filter(p => {
    if (filter !== 'ALL' && p.state !== filter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.company.toLowerCase().includes(q) ||
      p.role.toLowerCase().includes(q) ||
      p.sector.toLowerCase().includes(q) ||
      p.nationality.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{
      position: 'fixed', left: 833600, bottom: 8, zIndex: 517,
      width: 560, background: 'rgba(8,14,26,0.97)',
      border: '1px solid rgba(248,113,113,0.18)', borderRadius: 12,
      boxShadow: '0 0 48px rgba(248,113,113,0.08)',
      fontFamily: '"Share Tech Mono",monospace', color: '#c8d8e8',
      display: 'flex', flexDirection: 'column', maxHeight: 680, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px 8px', borderBottom: '1px solid rgba(248,113,113,0.10)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#f87171', fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>◈ IPLIGA</span>
          <span style={{ color: '#4a6080', fontSize: 10 }}>INTEL PROFILE × LIVE INTEL × ANNOTATION</span>
          {loading && <span style={{ color: '#f87171', fontSize: 10, opacity: 0.7 }}>…</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {fully > 0 && (
            <span style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171', fontSize: 10, borderRadius: 4, padding: '1px 6px' }}>
              {fully} ALARMED
            </span>
          )}
          {dark > 0 && (
            <span style={{ background: 'rgba(107,114,128,0.15)', color: '#9ca3af', fontSize: 10, borderRadius: 4, padding: '1px 6px' }}>
              {dark} DARK
            </span>
          )}
          <button
            onClick={assess} disabled={assessing}
            style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(248,113,113,0.3)', background: 'transparent', color: '#f87171', cursor: 'pointer', fontSize: 10 }}>
            {assessing ? '…' : 'ASSESS'}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(107,114,128,0.3)', background: 'transparent', color: '#6b7280', cursor: 'pointer', fontSize: 10 }}>
            ✕
          </button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid rgba(248,113,113,0.08)', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { label: 'Profiles',        val: classified.length, color: '#94a3b8' },
          { label: 'Live Events',     val: live.length,       color: '#fb923c' },
          { label: 'Annotations',     val: anns.length,       color: '#38bdf8' },
          { label: 'Fully Alarmed',   val: fully,             color: '#f87171' },
          { label: 'World Triggered', val: worldTr,           color: '#fb923c' },
          { label: 'Graph Annotated', val: graphAn,           color: '#38bdf8' },
          { label: 'Dark',            val: dark,              color: '#6b7280' },
          { label: 'Coverage',        val: `${covPct}%`,      color: '#a3e635' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '4px 8px', textAlign: 'center', minWidth: 54 }}>
            <div style={{ color, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: '#334155', fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: '4px 14px 6px', flexShrink: 0 }}>
        <div style={{ height: 4, borderRadius: 2, background: '#1e293b', overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${(fully   / total) * 100}%`, background: '#f87171' }} />
          <div style={{ width: `${(worldTr / total) * 100}%`, background: '#fb923c' }} />
          <div style={{ width: `${(graphAn / total) * 100}%`, background: '#38bdf8' }} />
          <div style={{ width: `${(dark    / total) * 100}%`, background: '#1e293b' }} />
        </div>
      </div>

      {error && (
        <div style={{ padding: '4px 14px', color: '#f87171', fontSize: 10, flexShrink: 0 }}>{error}</div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 14px', flexShrink: 0, flexWrap: 'wrap', borderBottom: '1px solid rgba(248,113,113,0.08)' }}>
        {['ALL', 'FULLY_ALARMED', 'WORLD_TRIGGERED', 'GRAPH_ANNOTATED', 'DARK'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 10,
            background: filter === f ? 'rgba(248,113,113,0.15)' : 'transparent',
            color: filter === f ? '#f87171' : '#475569',
          }}>
            {f === 'FULLY_ALARMED' ? 'FULLY ALARMED' : f === 'WORLD_TRIGGERED' ? 'WORLD TRIGGERED' : f === 'GRAPH_ANNOTATED' ? 'GRAPH ANNOTATED' : f}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(107,114,128,0.2)', background: 'rgba(255,255,255,0.03)', color: '#94a3b8', fontSize: 10, width: 120 }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
        {visible.length === 0 && (
          <div style={{ color: '#334155', textAlign: 'center', paddingTop: 24, fontSize: 11 }}>
            {loading ? 'Loading…' : 'No profiles match.'}
          </div>
        )}
        {visible.map(p => {
          const meta = STATE_META[p.state];
          const isExp = expanded === p.id;
          return (
            <div key={p.id} style={{ marginBottom: 6, border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden' }}>
              <div
                onClick={() => setExpanded(isExp ? null : p.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', background: meta.bg }}>
                <span style={{ color: meta.color, fontSize: 9, fontWeight: 700, minWidth: 110, letterSpacing: 0.5 }}>
                  {meta.label.toUpperCase()}
                </span>
                <span style={{ color: '#e2e8f0', fontSize: 12, flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {p.name}
                </span>
                {p.company && (
                  <span style={{ color: '#475569', fontSize: 10, whiteSpace: 'nowrap' }}>{p.company}</span>
                )}
                <span style={{ color: '#334155', fontSize: 9 }}>L:{p.matchedLive.length} A:{p.matchedAnns.length}</span>
                <span style={{ color: '#334155', fontSize: 12 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  {/* Left: live events */}
                  <div style={{ flex: 1, padding: '8px 10px', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ color: '#fb923c', fontSize: 9, fontWeight: 700, marginBottom: 6, letterSpacing: 1 }}>
                      LIVE WORLD EVENTS ({p.matchedLive.length})
                    </div>
                    {p.matchedLive.length === 0 && (
                      <div style={{ color: '#334155', fontSize: 10 }}>No world events matched.</div>
                    )}
                    {p.matchedLive.slice(0, 6).map((e, i) => {
                      const toks = tok(`${p.name} ${p.company} ${p.role} ${p.sector} ${p.nationality} ${p.aliases}`);
                      const sc = Math.min(matchScore(toks, `${e.name} ${e.location} ${e.symbol} ${e.type}`) * 200, 100);
                      return (
                        <div key={i} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                            <span style={{ color: '#e2e8f0', fontSize: 10, flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                              {e.name || e.symbol || e.type}
                            </span>
                            <span style={{ background: '#7c3aed', color: '#fff', fontSize: 8, padding: '1px 4px', borderRadius: 2 }}>{e.type}</span>
                          </div>
                          <div style={{ height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${sc}%`, height: '100%', background: '#fb923c', borderRadius: 2 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Right: annotations */}
                  <div style={{ flex: 1, padding: '8px 10px' }}>
                    <div style={{ color: '#38bdf8', fontSize: 9, fontWeight: 700, marginBottom: 6, letterSpacing: 1 }}>
                      GRAPH ANNOTATIONS ({p.matchedAnns.length})
                    </div>
                    {p.matchedAnns.length === 0 && (
                      <div style={{ color: '#334155', fontSize: 10 }}>No annotations matched.</div>
                    )}
                    {p.matchedAnns.slice(0, 6).map((a, i) => {
                      const toks = tok(`${p.name} ${p.company} ${p.role} ${p.sector} ${p.nationality} ${p.aliases}`);
                      const sc = Math.min(matchScore(toks, `${a.label} ${a.note} ${a.target_type} ${a.actor} ${a.tags}`) * 200, 100);
                      return (
                        <div key={i} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                            <span style={{ color: '#e2e8f0', fontSize: 10, flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                              {(a.label || '').slice(0, 48)}
                            </span>
                            {a.target_type && (
                              <span style={{ background: '#0e7490', color: '#fff', fontSize: 8, padding: '1px 4px', borderRadius: 2 }}>{a.target_type}</span>
                            )}
                          </div>
                          <div style={{ height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${sc}%`, height: '100%', background: '#38bdf8', borderRadius: 2 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
