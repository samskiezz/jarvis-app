import { useState, useEffect, useCallback } from 'react';

const API = '';
const BCRM_RE = /\b(people[._-]?directory|crm|brain[._-]?crm|who[._-]?do[._-]?you[._-]?know|contact[._-]?directory|people[._-]?tracker|bcrm|tiered[._-]?contacts|known[._-]?people|mention[._-]?person|record[._-]?observation|person[._-]?profile|who[._-]?do[._-]?i[._-]?know|my[._-]?contacts|contact[._-]?crm)\b/i;

export function isBcrmQuery(t) {
  return BCRM_RE.test(t || '');
}

export async function buildBcrmScript() {
  try {
    const r = await fetch(`${API}/v1/brain/people`).then(r => r.json());
    const items = Array.isArray(r?.items) ? r.items : [];
    const total = r?.count ?? items.length;
    const tier1 = items.filter(p => (p.tier || 0) <= 1).length;
    const top5 = items.slice(0, 5).map(p => p.person || p.name || '?').join(', ');
    return (
      `Brain CRM People Directory: ${total} people known across tiered relationship map. ` +
      `${tier1} in Tier 1 (closest). Top contacts: ${top5 || 'none indexed yet'}.`
    );
  } catch {
    return 'Brain CRM: unable to reach the people directory.';
  }
}

function tierColor(tier) {
  if (tier === 1) return '#22c55e';
  if (tier === 2) return '#60a5fa';
  if (tier === 3) return '#a78bfa';
  return '#94a3b8';
}

function tierLabel(tier) {
  if (tier === 1) return 'T1';
  if (tier === 2) return 'T2';
  if (tier === 3) return 'T3';
  return `T${tier}`;
}

const PILL = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, fontSize: 11, fontWeight: 600, marginRight: 4 };
const ROW = { padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' };
const TILE = { flex: '1 1 90px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' };

export default function BrainCrmDirectory() {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [profiles, setProfiles] = useState({});
  const [profileLoading, setProfileLoading] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState('');
  const [mentionPerson, setMentionPerson] = useState('');
  const [mentionCtx, setMentionCtx] = useState('');
  const [mentionSrc, setMentionSrc] = useState('');
  const [mentionStatus, setMentionStatus] = useState('');
  const [showMention, setShowMention] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await fetch(`${API}/v1/brain/people`).then(r => r.json());
      const items = Array.isArray(r?.items) ? r.items : [];
      setPeople(items);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:bcrm-toggle', h);
    return () => window.removeEventListener('jarvis:bcrm-toggle', h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const loadProfile = useCallback(async (name) => {
    if (profiles[name] || profileLoading[name]) return;
    setProfileLoading(prev => ({ ...prev, [name]: true }));
    try {
      const r = await fetch(`${API}/v1/brain/people/${encodeURIComponent(name)}`).then(r => r.json());
      setProfiles(prev => ({ ...prev, [name]: r }));
    } catch {
      setProfiles(prev => ({ ...prev, [name]: { error: 'Profile unavailable.' } }));
    } finally {
      setProfileLoading(prev => ({ ...prev, [name]: false }));
    }
  }, [profiles, profileLoading]);

  const toggleExpand = (name) => {
    if (expanded === name) {
      setExpanded(null);
    } else {
      setExpanded(name);
      loadProfile(name);
    }
  };

  const submitMention = async (e) => {
    e.preventDefault();
    if (!mentionPerson.trim()) return;
    setMentionStatus('saving…');
    try {
      const r = await fetch(`${API}/v1/brain/mention`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ person: mentionPerson.trim(), context: mentionCtx, source: mentionSrc || null }),
      }).then(r => r.json());
      if (r?.ok) {
        setMentionStatus('✓ Recorded');
        setMentionPerson('');
        setMentionCtx('');
        setMentionSrc('');
        setTimeout(() => { setMentionStatus(''); setShowMention(false); load(); }, 1500);
      } else {
        setMentionStatus(`Error: ${r?.error || 'unknown'}`);
      }
    } catch (e) {
      setMentionStatus(`Error: ${e.message}`);
    }
  };

  const assess = async () => {
    setAssessing(true);
    setAssessment('');
    const tier1 = people.filter(p => (p.tier || 0) <= 1).length;
    const top5 = people.slice(0, 5).map(p => p.person || p.name || '?').join(', ');
    const prompt =
      `Brain CRM People Directory: ${people.length} people in tiered relationship map. ` +
      `${tier1} in Tier 1 (closest). Top contacts: ${top5 || 'none'}. ` +
      `Give a 2-sentence relationship intelligence brief.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      }).then(r => r.json());
      const txt = r?.response || r?.answer || r?.message || r?.content || JSON.stringify(r);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {
      setAssessment('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const tier1Count = people.filter(p => (p.tier || 0) <= 1).length;
  const tier2Count = people.filter(p => p.tier === 2).length;
  const tier3Count = people.filter(p => p.tier === 3).length;
  const badgeColor = people.length > 0 ? '#22c55e' : '#475569';

  const visible = people.filter(p => {
    const name = (p.person || p.name || '').toLowerCase();
    if (search && !name.includes(search.toLowerCase())) return false;
    if (tab === 'T1') return (p.tier || 0) <= 1;
    if (tab === 'T2') return p.tier === 2;
    if (tab === 'T3') return p.tier === 3;
    return true;
  });

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Brain CRM People Directory"
        style={{
          position: 'fixed',
          left: 429360,
          bottom: 8,
          zIndex: 187,
          background: 'rgba(15,23,42,0.85)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          color: '#e2e8f0',
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          letterSpacing: 1,
        }}
      >
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: badgeColor,
          boxShadow: people.length > 0 ? `0 0 6px ${badgeColor}` : 'none',
          display: 'inline-block',
        }} />
        BCRM
        {people.length > 0 && (
          <span style={{ background: badgeColor, color: '#fff', borderRadius: 9, padding: '0 5px', fontSize: 10, fontWeight: 700, marginLeft: 2 }}>
            {people.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 580,
          maxHeight: '82vh',
          overflowY: 'auto',
          background: 'rgba(10,15,30,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          zIndex: 9600,
          color: '#e2e8f0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 60px rgba(0,0,0,0.7)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: '#22c55e' }}>◈ BRAIN CRM PEOPLE DIRECTORY</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setShowMention(v => !v)}
                style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6, color: '#22c55e', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                + MENTION
              </button>
              <button
                onClick={assess}
                disabled={assessing}
                style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 6, color: '#22c55e', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {assessing ? '...' : '▶ ASSESS'}
              </button>
              <button onClick={load} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#94a3b8', padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}>
                ↺
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
          </div>

          {showMention && (
            <form onSubmit={submitMention} style={{ margin: '12px 16px', padding: '12px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>RECORD MENTION</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  value={mentionPerson}
                  onChange={e => setMentionPerson(e.target.value)}
                  placeholder="Person name *"
                  required
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#e2e8f0', padding: '4px 8px', fontSize: 11, outline: 'none' }}
                />
                <textarea
                  value={mentionCtx}
                  onChange={e => setMentionCtx(e.target.value)}
                  placeholder="Context / observation…"
                  rows={2}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#e2e8f0', padding: '4px 8px', fontSize: 11, outline: 'none', resize: 'vertical' }}
                />
                <input
                  value={mentionSrc}
                  onChange={e => setMentionSrc(e.target.value)}
                  placeholder="Source (optional)"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, color: '#e2e8f0', padding: '4px 8px', fontSize: 11, outline: 'none' }}
                />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button type="submit" style={{ background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 5, color: '#22c55e', padding: '4px 14px', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>
                    SAVE
                  </button>
                  {mentionStatus && <span style={{ fontSize: 11, color: mentionStatus.startsWith('Error') ? '#ef4444' : '#22c55e' }}>{mentionStatus}</span>}
                </div>
              </div>
            </form>
          )}

          <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', flexWrap: 'wrap' }}>
            {[
              { label: 'TOTAL', val: people.length, color: '#22c55e' },
              { label: 'TIER 1', val: tier1Count, color: '#22c55e' },
              { label: 'TIER 2', val: tier2Count, color: '#60a5fa' },
              { label: 'TIER 3+', val: tier3Count, color: '#a78bfa' },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {assessment && (
            <div style={{ margin: '0 16px 10px', padding: '10px 12px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, fontSize: 12, color: '#86efac', lineHeight: 1.5 }}>
              {assessment}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px', flexWrap: 'wrap' }}>
            {['ALL', 'T1', 'T2', 'T3'].map(t => {
              const accent = t === 'T1' ? '#22c55e' : t === 'T2' ? '#60a5fa' : t === 'T3' ? '#a78bfa' : '#64748b';
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    background: tab === t ? `${accent}22` : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${tab === t ? `${accent}66` : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 6,
                    color: tab === t ? accent : '#94a3b8',
                    padding: '3px 10px',
                    fontSize: 11,
                    cursor: 'pointer',
                    fontWeight: tab === t ? 700 : 400,
                  }}
                >
                  {t}
                </button>
              );
            })}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search people…"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e2e8f0', padding: '3px 8px', fontSize: 11, outline: 'none', minWidth: 80 }}
            />
          </div>

          {loading && <div style={{ padding: '8px 18px', color: '#64748b', fontSize: 12 }}>Loading…</div>}
          {err && <div style={{ padding: '8px 18px', color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}
          {!loading && visible.length === 0 && (
            <div style={{ padding: '16px 18px', color: '#64748b', fontSize: 12 }}>No people match the current filter.</div>
          )}

          <div>
            {visible.map((p, i) => {
              const name = p.person || p.name || `person-${i}`;
              const tier = p.tier || 0;
              const mentions = p.mention_count ?? p.mentions ?? 0;
              const isExp = expanded === name;
              const tc = tierColor(tier);
              const tl = tierLabel(tier);
              const prof = profiles[name];
              const profLoading = profileLoading[name];

              return (
                <div
                  key={name}
                  style={{ ...ROW, background: isExp ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                  onClick={() => toggleExpand(name)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ ...PILL, background: `${tc}22`, color: tc, border: `1px solid ${tc}55` }}>
                      {tl}
                    </span>
                    <span style={{ fontSize: 12, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    {mentions > 0 && (
                      <span style={{ ...PILL, background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)', marginRight: 0 }}>
                        {mentions}×
                      </span>
                    )}
                    <span style={{ color: '#475569', fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {profLoading && <div style={{ color: '#64748b', fontSize: 11 }}>Loading profile…</div>}
                      {prof && !profLoading && (
                        prof.error ? (
                          <div style={{ color: '#ef4444', fontSize: 11 }}>{prof.error}</div>
                        ) : (
                          <div>
                            {prof.tier != null && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{ color: '#64748b', fontSize: 11 }}>Tier:</span>
                                <span style={{ ...PILL, background: `${tierColor(prof.tier)}22`, color: tierColor(prof.tier), border: `1px solid ${tierColor(prof.tier)}44` }}>
                                  {tierLabel(prof.tier)}
                                </span>
                                <span style={{ color: '#64748b', fontSize: 11 }}>Mentions:</span>
                                <span style={{ color: '#60a5fa', fontSize: 11 }}>{prof.mention_count ?? prof.mentions ?? 0}</span>
                              </div>
                            )}
                            {prof.notes && prof.notes.length > 0 && (
                              <div style={{ marginTop: 6 }}>
                                <div style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Notes ({prof.notes.length}):</div>
                                {prof.notes.slice(0, 4).map((n, j) => {
                                  const body = n.body || n.content || n.text || n.context || n.title || JSON.stringify(n);
                                  const src = n.source || n.src || '';
                                  return (
                                    <div key={j} style={{ marginBottom: 6, padding: '6px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 5 }}>
                                      <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.4 }}>{String(body).slice(0, 200)}{String(body).length > 200 ? '…' : ''}</div>
                                      {src && <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>src: {src}</div>}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {(!prof.notes || prof.notes.length === 0) && (
                              <div style={{ color: '#475569', fontSize: 11 }}>No notes recorded for this person yet.</div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#475569', fontSize: 10 }}>
            {visible.length} of {people.length} people · T1:{tier1Count} T2:{tier2Count} T3+:{tier3Count} · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
