import { useState, useEffect, useRef, useCallback } from 'react';

const API = (typeof window !== 'undefined' && window.__JARVIS_API__) || '';

const CGCSKCO_RE = /\b(cgcskco|contact\s+(?:graph\s+)?community\s+skill|contact\s+aip\s+community|contact\s+skill\s+community|contact\s+network\s+skill|contact\s+graph\s+skill|undeployed\s+contact|contact\s+skill\s+graph|skilled\s+networked\s+contact|contact\s+community\s+aip|contact\s+graph\s+community\s+skill|community\s+skill\s+contact|skill\s+community\s+contact)\b/i;

const THRESHOLD = 0.08;

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

function normaliseContacts(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.contacts) ? data.contacts
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(c => ({
    id: c.id || c._id || String(Math.random()),
    name: c.name || c.full_name || c.display_name || 'Unnamed Contact',
    email: c.email || '',
    company: c.company || c.organisation || c.organization || '',
    title: c.title || c.role || c.job_title || '',
    description: c.description || c.bio || c.notes || '',
    raw: c,
  }));
}

function normaliseCommunities(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.communities) ? data.communities
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(c => ({
    id: c.id || c._id || String(Math.random()),
    name: c.name || c.label || c.title || 'Unnamed Community',
    type: c.type || c.kind || c.category || '',
    description: c.description || c.summary || '',
    raw: c,
  }));
}

function normaliseSkills(data) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data
    : Array.isArray(data.skills) ? data.skills
    : Array.isArray(data.data) ? data.data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.results) ? data.results
    : [];
  return arr.map(s => ({
    id: s.id || s._id || String(Math.random()),
    name: s.name || s.title || s.label || 'Unnamed Skill',
    category: s.category || s.type || s.kind || '',
    description: s.description || s.summary || '',
    tags: Array.isArray(s.tags) ? s.tags.join(' ') : String(s.tags || ''),
    raw: s,
  }));
}

function correlate(contacts, communities, skills) {
  return contacts.map(contact => {
    const toks = tok([contact.name, contact.email, contact.company, contact.title, contact.description].join(' '));

    const matchedCommunities = communities
      .map(c => {
        const score = Math.max(
          matchScore(toks, c.name),
          matchScore(toks, c.type),
          matchScore(toks, c.description),
        );
        return { ...c, score };
      })
      .filter(c => c.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const matchedSkills = skills
      .map(s => {
        const score = Math.max(
          matchScore(toks, s.name),
          matchScore(toks, s.category),
          matchScore(toks, s.description),
          matchScore(toks, s.tags),
        );
        return { ...s, score };
      })
      .filter(s => s.score >= THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const hasCommunity = matchedCommunities.length > 0;
    const hasSkill = matchedSkills.length > 0;

    let state;
    if (hasCommunity && hasSkill) state = 'FULLY EQUIPPED';
    else if (hasCommunity) state = 'NETWORKED';
    else if (hasSkill) state = 'SKILLED';
    else state = 'UNDEPLOYED';

    return { contact, matchedCommunities, matchedSkills, state };
  });
}

export function isCgcskcoQuery(t) {
  return CGCSKCO_RE.test(t || '');
}

export async function buildCgcskcoScript() {
  try {
    const [cRes, commRes, sRes] = await Promise.allSettled([
      fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : null),
    ]);
    const contacts = normaliseContacts(cRes.status === 'fulfilled' ? cRes.value : null);
    const communities = normaliseCommunities(commRes.status === 'fulfilled' ? commRes.value : null);
    const skills = normaliseSkills(sRes.status === 'fulfilled' ? sRes.value : null);
    const rows = correlate(contacts, communities, skills);
    const equipped = rows.filter(r => r.state === 'FULLY EQUIPPED').length;
    const networked = rows.filter(r => r.state === 'NETWORKED').length;
    const skilled = rows.filter(r => r.state === 'SKILLED').length;
    const undeployed = rows.filter(r => r.state === 'UNDEPLOYED').length;
    return `CGCSKCO Contact×GraphCommunity×AIPSkill: ${rows.length} contacts analysed. ` +
      `${equipped} FULLY EQUIPPED (community+skill), ` +
      `${networked} NETWORKED (community only), ${skilled} SKILLED (skill only), ${undeployed} UNDEPLOYED (neither — personnel gap). ` +
      (undeployed > 0 ? `${undeployed} contacts have no graph community or AIP skill coverage — personnel deployment gap.` :
        equipped > 0 ? `Top equipped: ${rows.find(r => r.state === 'FULLY EQUIPPED')?.contact.name || 'see panel'}.` :
        'No fully equipped contacts at this time.');
  } catch {
    return 'CGCSKCO: data fetch failed.';
  }
}

export default function ContactGraphCommunitySkillTriple() {
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
    window.addEventListener('jarvis:cgcskco-toggle', handler);
    return () => window.removeEventListener('jarvis:cgcskco-toggle', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [cRes, commRes, sRes] = await Promise.allSettled([
        fetch(`${API}/entities/Contact`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/graph/communities`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        fetch(`${API}/v1/aip/skill`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      ]);
      const contacts = normaliseContacts(cRes.status === 'fulfilled' ? cRes.value : null);
      const communities = normaliseCommunities(commRes.status === 'fulfilled' ? commRes.value : null);
      const skills = normaliseSkills(sRes.status === 'fulfilled' ? sRes.value : null);
      if (!contacts.length && !communities.length && !skills.length) {
        setErr('No data returned from Contact, Graph Communities, or AIP Skill endpoints.');
      }
      setRows(correlate(contacts, communities, skills));
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

  const equipped = rows.filter(r => r.state === 'FULLY EQUIPPED').length;
  const networked = rows.filter(r => r.state === 'NETWORKED').length;
  const skilled = rows.filter(r => r.state === 'SKILLED').length;
  const undeployed = rows.filter(r => r.state === 'UNDEPLOYED').length;

  const TABS = ['ALL', 'FULLY EQUIPPED', 'NETWORKED', 'SKILLED', 'UNDEPLOYED'];

  const visible = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.contact.name.toLowerCase().includes(q) ||
        r.contact.company.toLowerCase().includes(q) ||
        r.contact.title.toLowerCase().includes(q) ||
        r.matchedCommunities.some(c => c.name.toLowerCase().includes(q)) ||
        r.matchedSkills.some(s => s.name.toLowerCase().includes(q));
    }
    return true;
  });

  const total = rows.length;
  const barWidths = total > 0 ? {
    equipped: (equipped / total) * 100,
    networked: (networked / total) * 100,
    skilled: (skilled / total) * 100,
    undeployed: (undeployed / total) * 100,
  } : { equipped: 0, networked: 0, skilled: 0, undeployed: 0 };

  const assess = useCallback(async (row) => {
    setAssessing(true);
    const prompt = `Contact "${row.contact.name}" [${row.state}]: ` +
      `Company: ${row.contact.company || 'unknown'}. Title: ${row.contact.title || 'unknown'}. ` +
      `Graph communities: ${row.matchedCommunities.map(c => c.name).join(', ') || 'none'}. ` +
      `AIP skills: ${row.matchedSkills.map(s => s.name).join(', ') || 'none'}. ` +
      `Give a 2-sentence contact network and capability coverage brief.`;
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
    'FULLY EQUIPPED': '#00ff88',
    'NETWORKED': '#34d399',
    'SKILLED': '#a78bfa',
    'UNDEPLOYED': '#6b7280',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          left: 811760,
          bottom: 8,
          zIndex: 478,
          background: 'rgba(0,20,40,0.92)',
          border: '1px solid #34d39944',
          color: '#34d399',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: 11,
          cursor: 'pointer',
          fontFamily: 'monospace',
          letterSpacing: 1,
        }}
      >
        ◈ CGCSKCO
        {undeployed > 0 ? (
          <span style={{
            marginLeft: 5,
            background: '#6b7280',
            color: '#fff',
            borderRadius: 8,
            padding: '1px 5px',
            fontSize: 10,
          }}>
            {undeployed}
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
      width: 680,
      maxHeight: 'calc(100vh - 80px)',
      overflowY: 'auto',
      background: 'rgba(0,12,28,0.97)',
      border: '1px solid #34d39955',
      borderRadius: 8,
      zIndex: 478,
      fontFamily: 'monospace',
      fontSize: 12,
      color: '#c8e6ff',
      boxShadow: '0 0 32px #34d39922',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #34d39922',
        background: 'rgba(52,211,153,0.05)',
      }}>
        <span style={{ color: '#34d399', fontWeight: 700, letterSpacing: 1 }}>
          ◈ CONTACT × GRAPH COMMUNITY × AIP SKILL
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
              border: '1px solid #34d39944',
              color: '#34d399',
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
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid #34d39911' }}>
        {[
          { label: 'FULLY EQUIPPED', val: equipped, col: '#00ff88' },
          { label: 'NETWORKED', val: networked, col: '#34d399' },
          { label: 'SKILLED', val: skilled, col: '#a78bfa' },
          { label: 'UNDEPLOYED', val: undeployed, col: '#6b7280' },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1,
            textAlign: 'center',
            background: 'rgba(52,211,153,0.04)',
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
      {total > 0 && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #34d39911' }}>
          <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex', background: '#0a0014' }}>
            <div style={{ width: `${barWidths.equipped}%`, background: '#00ff88', transition: 'width 0.4s' }} />
            <div style={{ width: `${barWidths.networked}%`, background: '#34d399', transition: 'width 0.4s' }} />
            <div style={{ width: `${barWidths.skilled}%`, background: '#a78bfa', transition: 'width 0.4s' }} />
            <div style={{ width: `${barWidths.undeployed}%`, background: '#4b5563', transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 3, fontSize: 9, color: '#556' }}>
            <span style={{ color: '#00ff88' }}>■ EQUIPPED</span>
            <span style={{ color: '#34d399' }}>■ NETWORKED</span>
            <span style={{ color: '#a78bfa' }}>■ SKILLED</span>
            <span style={{ color: '#4b5563' }}>■ UNDEPLOYED</span>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? '#34d39922' : 'none',
              border: `1px solid ${filter === t ? '#34d399' : '#34d39933'}`,
              color: filter === t ? '#34d399' : '#556',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 3,
              fontSize: 10,
              letterSpacing: 0.5,
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
            background: 'rgba(52,211,153,0.05)',
            border: '1px solid #34d39933',
            color: '#c8e6ff',
            padding: '2px 8px',
            borderRadius: 3,
            fontSize: 11,
            outline: 'none',
            width: 120,
          }}
        />
      </div>

      {/* Error */}
      {err && (
        <div style={{ color: '#ff6666', padding: '4px 12px', fontSize: 11 }}>⚠ {err}</div>
      )}

      {/* Rows */}
      <div style={{ padding: '0 0 8px' }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: '#444', textAlign: 'center', padding: 24, fontSize: 12 }}>
            No matching contacts.
          </div>
        )}
        {visible.map((row) => {
          const isExp = expanded === row.contact.id;
          const stateCol = STATE_COLOUR[row.state] || '#888';
          return (
            <div
              key={row.contact.id}
              style={{
                borderBottom: '1px solid #34d3990d',
                background: isExp ? 'rgba(52,211,153,0.03)' : 'transparent',
              }}
            >
              <div
                onClick={() => setExpanded(isExp ? null : row.contact.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 12px',
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: stateCol,
                  flexShrink: 0,
                  boxShadow: `0 0 6px ${stateCol}`,
                }} />
                <span style={{ flex: 1, fontWeight: 600, color: '#d0eeff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.contact.name}
                </span>
                <span style={{ color: stateCol, fontSize: 9, letterSpacing: 1, whiteSpace: 'nowrap' }}>
                  {row.state}
                </span>
                {row.contact.title && (
                  <span style={{ color: '#34d399', fontSize: 9, marginLeft: 4 }}>
                    {row.contact.title}
                  </span>
                )}
                {row.contact.company && (
                  <span style={{ color: '#556', fontSize: 9, marginLeft: 4 }}>
                    {row.contact.company}
                  </span>
                )}
                <span style={{ color: '#34d39944', fontSize: 10, marginLeft: 4 }}>{isExp ? '▲' : '▼'}</span>
              </div>

              {isExp && (
                <div style={{ padding: '0 12px 10px' }}>
                  {row.contact.description && (
                    <div style={{ color: '#667', fontSize: 11, marginBottom: 8 }}>
                      {row.contact.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12 }}>
                    {/* Left: matched graph communities */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#34d399', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        GRAPH COMMUNITIES ({row.matchedCommunities.length})
                      </div>
                      {row.matchedCommunities.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No communities matched.</div>
                      )}
                      {row.matchedCommunities.slice(0, 5).map(c => (
                        <div key={c.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#c8e6ff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>{c.name}</span>
                            <span style={{ color: '#34d399', fontSize: 10 }}>{(c.score * 100).toFixed(0)}%</span>
                          </div>
                          {c.type && (
                            <div style={{ color: '#556', fontSize: 10 }}>{c.type}</div>
                          )}
                          <div style={{ height: 3, background: '#0a0014', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(c.score * 100, 100)}%`,
                              background: 'linear-gradient(90deg, #34d399, #059669)',
                              borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Right: matched AIP skills */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#a78bfa', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                        AIP SKILLS ({row.matchedSkills.length})
                      </div>
                      {row.matchedSkills.length === 0 && (
                        <div style={{ color: '#444', fontSize: 11 }}>No AIP skills matched.</div>
                      )}
                      {row.matchedSkills.slice(0, 5).map(s => (
                        <div key={s.id} style={{ marginBottom: 5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#d8c8ff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>{s.name}</span>
                            <span style={{ color: '#a78bfa', fontSize: 10 }}>{(s.score * 100).toFixed(0)}%</span>
                          </div>
                          {s.category && (
                            <div style={{ color: '#556', fontSize: 10 }}>{s.category}</div>
                          )}
                          <div style={{ height: 3, background: '#06060e', borderRadius: 2, marginTop: 3 }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(s.score * 100, 100)}%`,
                              background: 'linear-gradient(90deg, #a78bfa, #6d28d9)',
                              borderRadius: 2,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ASSESS button */}
                  <button
                    onClick={() => assess(row)}
                    disabled={assessing}
                    style={{
                      marginTop: 8,
                      background: 'rgba(52,211,153,0.08)',
                      border: '1px solid #34d39955',
                      color: '#34d399',
                      padding: '3px 14px',
                      borderRadius: 3,
                      cursor: assessing ? 'wait' : 'pointer',
                      fontSize: 11,
                      letterSpacing: 1,
                    }}
                  >
                    {assessing ? 'ASSESSING…' : 'ASSESS'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
