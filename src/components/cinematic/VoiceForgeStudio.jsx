import { useState, useEffect, useCallback } from 'react';

const API = '';
const VFST_RE = /\b(voice[._-]?forge|voice[._-]?profile|voice[._-]?cloning?|vfst|clone[._-]?voice|voice[._-]?studio|active[._-]?voice|which[._-]?voice|voice[._-]?settings|voice[._-]?profiles)\b/i;

export function isVfstQuery(t) {
  return VFST_RE.test(t || '');
}

export async function buildVfstScript() {
  try {
    const d = await fetch(`${API}/v1/voiceforge/profiles`).then(r => r.json());
    const profiles = Array.isArray(d.profiles) ? d.profiles : [];
    const active = d.active_profile_id || '';
    const activeProfile = profiles.find(p => p.id === active);
    return (
      `Voice Forge Studio: ${profiles.length} voice profile${profiles.length !== 1 ? 's' : ''} registered. ` +
      `Active profile: ${activeProfile ? (activeProfile.name || active) : 'none'}. ` +
      `${profiles.length > 0 ? `Profiles: ${profiles.map(p => p.name || p.id).slice(0, 4).join(', ')}.` : 'No profiles built yet.'}`
    );
  } catch {
    return 'Voice Forge Studio: unable to reach voice forge service.';
  }
}

function ageLabel(ms) {
  if (!ms) return '';
  const d = Date.now() - ms;
  if (d < 60000) return `${Math.floor(d / 1000)}s ago`;
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}

const PANEL_W = 540;
const PANEL_H = 560;
const ACCENT = '#A855F7';

export default function VoiceForgeStudio() {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('PROFILES');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const [testText, setTestText] = useState('VoiceForge profile test.');
  const [testResult, setTestResult] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [buildResults, setBuildResults] = useState({});

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const d = await fetch(`${API}/v1/voiceforge/profiles`).then(r => r.json());
      setProfiles(Array.isArray(d.profiles) ? d.profiles : []);
      setActiveId(d.active_profile_id || '');
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) load();
    const id = open ? setInterval(load, 60000) : null;
    return () => { if (id) clearInterval(id); };
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener('jarvis:vfst-toggle', h);
    return () => window.removeEventListener('jarvis:vfst-toggle', h);
  }, []);

  async function doActivate(profileId) {
    setActionMsg('');
    try {
      const r = await fetch(`${API}/v1/voiceforge/activate/${profileId}`, {
        method: 'POST',
        headers: { Authorization: 'Bearer dev-key' },
      });
      const d = await r.json();
      if (d.ok) {
        setActiveId(profileId);
        setActionMsg(`Activated: ${d.active_profile_id || profileId}`);
        await load();
      } else {
        setActionMsg(`Error: ${d.error || 'activation failed'}`);
      }
    } catch (e) {
      setActionMsg(`Error: ${e.message}`);
    }
  }

  async function doBuild(profileId) {
    setBuildResults(b => ({ ...b, [profileId]: { loading: true } }));
    setActionMsg('');
    try {
      const r = await fetch(`${API}/v1/voiceforge/profiles/${profileId}/build`, {
        method: 'POST',
        headers: { Authorization: 'Bearer dev-key' },
      });
      const d = await r.json();
      setBuildResults(b => ({ ...b, [profileId]: { result: d } }));
      setActionMsg(d.ok ? `Build complete for ${profileId}` : `Build failed: ${d.error || 'unknown'}`);
      await load();
    } catch (e) {
      setBuildResults(b => ({ ...b, [profileId]: { error: e.message } }));
      setActionMsg(`Build error: ${e.message}`);
    }
  }

  async function doDelete(profileId) {
    if (!window.confirm(`Delete profile ${profileId}?`)) return;
    setActionMsg('');
    try {
      const r = await fetch(`${API}/v1/voiceforge/profiles/${profileId}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer dev-key' },
      });
      const d = await r.json();
      setActionMsg(d.ok ? `Deleted profile ${profileId}` : `Error: ${d.error}`);
      await load();
    } catch (e) {
      setActionMsg(`Error: ${e.message}`);
    }
  }

  async function doTest() {
    setTestLoading(true); setTestResult(null);
    try {
      const r = await fetch(`${API}/v1/voiceforge/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ text: testText }),
      });
      setTestResult(await r.json());
    } catch (e) {
      setTestResult({ ok: false, error: e.message });
    }
    setTestLoading(false);
  }

  async function doCreate() {
    if (!newName.trim()) return;
    setCreating(true); setActionMsg('');
    try {
      const r = await fetch(`${API}/v1/voiceforge/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      });
      const d = await r.json();
      if (d.ok || d.profile) {
        setActionMsg(`Created: ${d.profile?.id || 'new profile'}`);
        setNewName(''); setNewDesc('');
        await load();
      } else {
        setActionMsg(`Error: ${d.error || 'create failed'}`);
      }
    } catch (e) {
      setActionMsg(`Error: ${e.message}`);
    }
    setCreating(false);
  }

  async function doAssess() {
    setAssessing(true); setAssessText('');
    try {
      const activeProfile = profiles.find(p => p.id === activeId);
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message: `Voice Forge Studio: ${profiles.length} voice profiles registered. Active profile: ${activeProfile ? activeProfile.name : 'none'}. Profiles: ${profiles.map(p => p.name || p.id).slice(0, 5).join(', ') || 'none'}. Give a 2-sentence voice-studio brief.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.result || JSON.stringify(d);
      setAssessText(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch (e) {
      setAssessText(`Error: ${e.message}`);
    }
    setAssessing(false);
  }

  const filtered = profiles.filter(p => {
    if (!search) return true;
    const s = search.toLowerCase();
    return `${p.name || ''} ${p.id || ''} ${p.description || ''}`.toLowerCase().includes(s);
  });

  const badgeCount = profiles.length;
  const badgeCol = badgeCount > 0 ? '#22C55E' : '#F59E0B';

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Voice Forge Studio (VFST)"
        style={{
          position: 'fixed',
          left: 479520,
          bottom: 8,
          zIndex: 198,
          background: open ? ACCENT : '#1e293b',
          border: `1px solid ${ACCENT}`,
          borderRadius: 6,
          color: '#e2e8f0',
          fontSize: 11,
          fontWeight: 700,
          padding: '4px 9px',
          cursor: 'pointer',
          letterSpacing: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        ◉ VFST
        {badgeCount > 0 && (
          <span style={{ background: badgeCol, color: '#000', borderRadius: 8, fontSize: 10, padding: '0 5px', fontWeight: 800 }}>
            {badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          right: 24,
          bottom: 48,
          width: PANEL_W,
          height: PANEL_H,
          background: 'rgba(10,15,30,0.97)',
          border: `1px solid ${ACCENT}`,
          borderRadius: 12,
          zIndex: 9200,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: `0 0 40px rgba(168,85,247,0.2)`,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: ACCENT, fontSize: 14, fontWeight: 800, letterSpacing: 1 }}>◉ VOICE FORGE STUDIO</span>
            {activeId && (
              <span style={{ background: '#14532d', color: '#22C55E', borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '2px 6px' }}>
                ACTIVE: {profiles.find(p => p.id === activeId)?.name || activeId}
              </span>
            )}
            <span style={{ flex: 1 }} />
            {loading && <span style={{ color: '#64748b', fontSize: 11 }}>loading…</span>}
            <button onClick={load} title="Refresh" style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13 }}>↺</button>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '8px 16px', borderBottom: '1px solid #0f172a' }}>
            {[
              { label: 'PROFILES', val: profiles.length, col: ACCENT },
              { label: 'ACTIVE', val: activeId ? 1 : 0, col: '#22C55E' },
              { label: 'NO REF', val: profiles.filter(p => !p.ref_count).length, col: '#F59E0B' },
              { label: 'BUILT', val: profiles.filter(p => (p.ref_count || 0) > 0).length, col: '#06B6D4' },
            ].map(({ label, val, col }) => (
              <div key={label} style={{ flex: 1, background: '#0f172a', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                <div style={{ color: col, fontSize: 18, fontWeight: 800 }}>{val}</div>
                <div style={{ color: '#475569', fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, padding: '6px 16px', borderBottom: '1px solid #0f172a', alignItems: 'center' }}>
            {['PROFILES', 'TEST', 'NEW'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? ACCENT : '#1e293b',
                border: '1px solid #334155',
                borderRadius: 4,
                color: tab === t ? '#fff' : '#94a3b8',
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 8px',
                cursor: 'pointer',
                letterSpacing: 1,
              }}>{t}</button>
            ))}
            {tab === 'PROFILES' && (
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="search profiles…"
                style={{
                  flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 4,
                  color: '#e2e8f0', fontSize: 11, padding: '3px 8px',
                }}
              />
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {err && <div style={{ color: '#ef4444', fontSize: 12 }}>Error: {err}</div>}
            {actionMsg && (
              <div style={{ background: '#0f172a', borderRadius: 6, padding: '6px 10px', color: '#94a3b8', fontSize: 11 }}>
                {actionMsg}
              </div>
            )}

            {tab === 'PROFILES' && (
              <>
                {!err && filtered.length === 0 && !loading && (
                  <div style={{ color: '#475569', fontSize: 12, marginTop: 24, textAlign: 'center' }}>
                    No voice profiles found. Create one in the NEW tab.
                  </div>
                )}
                {filtered.map((p, i) => {
                  const key = p.id || i;
                  const isActive = p.id === activeId;
                  const isOpen = expanded === key;
                  const bld = buildResults[p.id];
                  return (
                    <div key={key} style={{
                      background: '#0f172a',
                      borderRadius: 6,
                      border: `1px solid ${isActive ? '#166534' : '#1e293b'}`,
                      overflow: 'hidden',
                    }}>
                      <div
                        onClick={() => setExpanded(isOpen ? null : key)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer' }}
                      >
                        {isActive && (
                          <span style={{ background: '#14532d', color: '#22C55E', borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '2px 6px' }}>
                            ACTIVE
                          </span>
                        )}
                        <span style={{ color: '#e2e8f0', fontSize: 12, flex: 1, fontWeight: isActive ? 700 : 400 }}>
                          {p.name || p.id}
                        </span>
                        {p.ref_count > 0 && (
                          <span style={{ background: '#1e3a5f', color: '#06B6D4', borderRadius: 4, fontSize: 9, padding: '1px 5px' }}>
                            {p.ref_count} ref{p.ref_count !== 1 ? 's' : ''}
                          </span>
                        )}
                        {p.created_at && (
                          <span style={{ color: '#475569', fontSize: 10 }}>{ageLabel(p.created_at)}</span>
                        )}
                        <span style={{ color: '#334155', fontSize: 11 }}>{isOpen ? '▲' : '▼'}</span>
                      </div>

                      {isOpen && (
                        <div style={{ borderTop: '1px solid #1e293b', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ color: '#64748b', fontSize: 10 }}>ID:</span>
                            <span style={{ color: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }}>{p.id}</span>
                          </div>
                          {p.description && (
                            <div style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic' }}>
                              {String(p.description).slice(0, 160)}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                            {!isActive && (
                              <button
                                onClick={() => doActivate(p.id)}
                                style={{
                                  background: '#14532d', border: '1px solid #166534', borderRadius: 4,
                                  color: '#22C55E', fontSize: 10, fontWeight: 700, padding: '3px 8px', cursor: 'pointer',
                                }}
                              >
                                ▶ ACTIVATE
                              </button>
                            )}
                            <button
                              onClick={() => doBuild(p.id)}
                              disabled={bld?.loading}
                              style={{
                                background: '#1e3a5f', border: '1px solid #1e40af', borderRadius: 4,
                                color: '#60A5FA', fontSize: 10, fontWeight: 700, padding: '3px 8px', cursor: 'pointer',
                              }}
                            >
                              {bld?.loading ? '⌛ BUILDING…' : '◆ BUILD'}
                            </button>
                            <button
                              onClick={() => doDelete(p.id)}
                              style={{
                                background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 4,
                                color: '#f87171', fontSize: 10, fontWeight: 700, padding: '3px 8px', cursor: 'pointer',
                              }}
                            >
                              ✕ DELETE
                            </button>
                          </div>
                          {bld?.result && (
                            <div style={{ background: '#0f172a', borderRadius: 4, padding: '5px 8px', fontSize: 10, color: bld.result.ok ? '#22C55E' : '#f87171' }}>
                              {bld.result.ok
                                ? `Build OK — ${bld.result.ref_count || 0} reference files`
                                : `Build failed: ${bld.result.error || 'unknown error'}`}
                            </div>
                          )}
                          {bld?.error && (
                            <div style={{ color: '#f87171', fontSize: 10 }}>Error: {bld.error}</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {tab === 'TEST' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
                <div style={{ color: '#64748b', fontSize: 11 }}>
                  Test the currently active voice profile by synthesising a phrase.
                </div>
                <textarea
                  value={testText}
                  onChange={e => setTestText(e.target.value)}
                  rows={3}
                  placeholder="Enter text to synthesise…"
                  style={{
                    background: '#1e293b', border: '1px solid #334155', borderRadius: 6,
                    color: '#e2e8f0', fontSize: 12, padding: '8px 10px', resize: 'vertical',
                  }}
                />
                <button
                  onClick={doTest}
                  disabled={testLoading || !testText.trim()}
                  style={{
                    alignSelf: 'flex-start',
                    background: testLoading ? '#1e293b' : ACCENT,
                    border: 'none', borderRadius: 6, color: '#fff',
                    fontSize: 11, fontWeight: 700, padding: '5px 14px', cursor: 'pointer',
                  }}
                >
                  {testLoading ? 'Synthesising…' : '▶ SYNTHESISE'}
                </button>
                {testResult && (
                  <div style={{ background: '#0f172a', borderRadius: 6, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ color: testResult.ok ? '#22C55E' : '#f87171', fontSize: 12, fontWeight: 700 }}>
                      {testResult.ok ? '✓ Synthesis OK' : '✗ Synthesis Failed'}
                    </div>
                    {testResult.error && (
                      <div style={{ color: '#f87171', fontSize: 11 }}>{testResult.error}</div>
                    )}
                    {testResult.provider && (
                      <div style={{ color: '#64748b', fontSize: 10 }}>Provider: {testResult.provider}</div>
                    )}
                    {testResult.url && (
                      <a
                        href={testResult.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: ACCENT, fontSize: 11, textDecoration: 'underline' }}
                      >
                        ▶ Listen to result
                      </a>
                    )}
                    {testResult.note && (
                      <div style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic' }}>{testResult.note}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === 'NEW' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
                <div style={{ color: '#64748b', fontSize: 11 }}>
                  Create a new voice profile. Upload audio samples after creation using the API.
                </div>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Profile name (required)"
                  style={{
                    background: '#1e293b', border: '1px solid #334155', borderRadius: 6,
                    color: '#e2e8f0', fontSize: 12, padding: '7px 10px',
                  }}
                />
                <input
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Description (optional)"
                  style={{
                    background: '#1e293b', border: '1px solid #334155', borderRadius: 6,
                    color: '#e2e8f0', fontSize: 12, padding: '7px 10px',
                  }}
                />
                <button
                  onClick={doCreate}
                  disabled={creating || !newName.trim()}
                  style={{
                    alignSelf: 'flex-start',
                    background: creating ? '#1e293b' : ACCENT,
                    border: 'none', borderRadius: 6, color: '#fff',
                    fontSize: 11, fontWeight: 700, padding: '5px 14px', cursor: 'pointer',
                  }}
                >
                  {creating ? 'Creating…' : '+ CREATE PROFILE'}
                </button>
              </div>
            )}
          </div>

          <div style={{ padding: '8px 16px', borderTop: '1px solid #1e293b' }}>
            {assessText && (
              <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6, lineHeight: 1.5 }}>{assessText}</div>
            )}
            <button
              onClick={doAssess}
              disabled={assessing}
              style={{
                background: assessing ? '#1e293b' : ACCENT,
                border: 'none', borderRadius: 6, color: '#fff',
                fontSize: 11, fontWeight: 700, padding: '5px 14px', cursor: 'pointer',
              }}
            >
              {assessing ? 'Assessing…' : '▶ ASSESS'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
