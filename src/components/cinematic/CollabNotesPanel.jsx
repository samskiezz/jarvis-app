import { useState, useEffect, useCallback, useRef } from 'react';

const API = '';
const NOTES_RE = /\b(notes?[._-]?thread|collab[._-]?notes?|thread[._-]?notes?|resource[._-]?notes?|add[._-]?note|notes?[._-]?panel|collab[._-]?thread|add[._-]?comment|activity[._-]?notes?|note[._-]?thread|my[._-]?notes?|team[._-]?notes?)\b/i;

export function isNotesQuery(t) {
  return NOTES_RE.test(t || '');
}

export async function buildNotesScript() {
  try {
    const r = await fetch(`${API}/v1/activity?limit=20`);
    const d = await r.json();
    const items = Array.isArray(d.items) ? d.items : [];
    if (!items.length) {
      return 'Collab Notes Panel: no recent activity. Use NOTES panel to add threaded notes to any resource (object/case/graph/dataset/investigation).';
    }
    const authors = [...new Set(items.map(i => i.author).filter(Boolean))].slice(0, 3);
    const types = [...new Set(items.map(i => i.resource_type).filter(Boolean))].slice(0, 3);
    return (
      `Collaboration Notes: ${items.length} recent activity item${items.length !== 1 ? 's' : ''}. ` +
      `Authors: ${authors.join(', ') || 'unknown'}. ` +
      `Resources touched: ${types.join(', ') || 'mixed'}. ` +
      `Use the NOTES panel to view or add threaded comments to any Jarvis resource.`
    );
  } catch {
    return 'Collab Notes Panel: unable to reach /v1/activity.';
  }
}

const PANEL_W = 620;
const PANEL_H = 580;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const PR = '#A78BFA';
const RD = '#F43F5E';
const DIM = '#6E8AA0';

const RESOURCE_TYPES = ['object', 'case', 'graph', 'dataset', 'investigation', 'agent', 'task', 'spec', 'decision'];

function chip(label, color = CY) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 4,
      border: `1px solid ${color}44`, background: `${color}14`,
      color, fontSize: 10, letterSpacing: 1, marginRight: 4, verticalAlign: 'middle',
    }}>{label}</span>
  );
}

function ageLabel(ts) {
  if (!ts) return '';
  const secs = Math.floor((Date.now() / 1000) - (typeof ts === 'string' ? new Date(ts).getTime() / 1000 : ts));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function CollabNotesPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('NOTES');

  const [resType, setResType] = useState('object');
  const [resId, setResId] = useState('');
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [fetchedFor, setFetchedFor] = useState(null);

  const [activity, setActivity] = useState([]);
  const [actLoading, setActLoading] = useState(false);

  const [body, setBody] = useState('');
  const [author, setAuthor] = useState('operator');
  const [posting, setPosting] = useState(false);
  const [postErr, setPostErr] = useState('');

  const [editing, setEditing] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [saving, setSaving] = useState(false);

  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const [actSearch, setActSearch] = useState('');
  const timerRef = useRef(null);

  const loadNotes = useCallback(async (rt, rid) => {
    if (!rt || !rid.trim()) return;
    setNotesLoading(true);
    try {
      const r = await fetch(`${API}/v1/notes?resource_type=${encodeURIComponent(rt)}&resource_id=${encodeURIComponent(rid.trim())}`);
      const d = await r.json();
      setNotes(Array.isArray(d.items) ? d.items : []);
      setFetchedFor(`${rt}:${rid.trim()}`);
    } catch { setNotes([]); }
    setNotesLoading(false);
  }, []);

  const loadActivity = useCallback(async () => {
    setActLoading(true);
    try {
      const r = await fetch(`${API}/v1/activity?limit=50`);
      const d = await r.json();
      setActivity(Array.isArray(d.items) ? d.items : []);
    } catch { setActivity([]); }
    setActLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:notes-toggle', onToggle);
    return () => window.removeEventListener('jarvis:notes-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    loadActivity();
    timerRef.current = setInterval(loadActivity, 60000);
    return () => clearInterval(timerRef.current);
  }, [open, loadActivity]);

  async function postNote() {
    if (!body.trim() || !resId.trim()) return;
    setPosting(true); setPostErr('');
    try {
      const r = await fetch(`${API}/v1/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ resource_type: resType, resource_id: resId.trim(), body: body.trim(), author }),
      });
      if (!r.ok) { setPostErr(`Error ${r.status}`); }
      else { setBody(''); await loadNotes(resType, resId); }
    } catch (e) { setPostErr(String(e)); }
    setPosting(false);
  }

  async function deleteNote(id) {
    try {
      await fetch(`${API}/v1/notes/${id}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer dev-key' },
      });
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch { /* ignore */ }
  }

  async function saveEdit(id) {
    if (!editBody.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/v1/notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ body: editBody.trim() }),
      });
      if (r.ok) {
        const updated = await r.json();
        setNotes(prev => prev.map(n => n.id === id ? updated : n));
        setEditing(null);
      }
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function assess() {
    setAssessing(true); setBrief('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message: `The Collab Notes activity feed has ${activity.length} recent entries. ` +
            `Currently viewing ${tab === 'NOTES' && fetchedFor ? `notes for ${fetchedFor} (${notes.length} notes)` : 'the activity feed'}. ` +
            `Give a 2-sentence collaboration health brief covering note volume and any notable authors or resource types.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const badgeCount = activity.length;
  const badgeColor = badgeCount > 0 ? GR : DIM;

  const filteredActivity = activity.filter(a => {
    if (!actSearch) return true;
    const q = actSearch.toLowerCase();
    return (
      String(a.body || '').toLowerCase().includes(q) ||
      String(a.author || '').toLowerCase().includes(q) ||
      String(a.resource_type || '').toLowerCase().includes(q) ||
      String(a.resource_id || '').toLowerCase().includes(q)
    );
  });

  const inputStyle = {
    background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
    borderRadius: 4, color: '#DCEBF5', padding: '4px 10px', fontSize: 10,
    outline: 'none', fontFamily: "'JetBrains Mono',monospace",
  };

  const btnStyle = (col = CY) => ({
    padding: '3px 10px', borderRadius: 3, border: `1px solid ${col}55`,
    background: 'transparent', color: col, cursor: 'pointer', fontSize: 9,
    letterSpacing: 1, fontFamily: "'JetBrains Mono',monospace",
  });

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Collab Notes Thread (NOTES)"
        style={{
          position: 'fixed', left: 666480, bottom: 8, zIndex: 240,
          width: 58, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ✏ NOTES
        {badgeCount > 0 && (
          <span style={{
            background: badgeColor, color: '#04060A', borderRadius: 3, padding: '0 4px',
            fontSize: 8, fontWeight: 700, minWidth: 14, textAlign: 'center',
          }}>{badgeCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: PANEL_W, height: PANEL_H, zIndex: 9200,
          background: 'rgba(6,10,18,0.97)', border: `1px solid ${CY}33`,
          borderRadius: 12, backdropFilter: 'blur(16px)',
          boxShadow: `0 0 60px ${CY}22`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* header */}
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${CY}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${CY}` }}>
              ✏ COLLAB NOTES THREAD
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {(notesLoading || actLoading) && <span style={{ color: DIM, fontSize: 10 }}>loading…</span>}
              <button onClick={assess} disabled={assessing} style={btnStyle()}>
                {assessing ? 'assessing…' : '▶ ASSESS'}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
            </span>
          </div>

          {/* stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'ACTIVITY', val: activity.length, col: GR },
              { label: 'NOTE COUNT', val: notes.length, col: CY },
              { label: 'RESOURCE TYPE', val: resType, col: AM },
              { label: 'RESOURCE ID', val: resId.trim() || '—', col: PR },
            ].map(({ label: l, val, col }) => (
              <div key={l} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '5px 7px', textAlign: 'center', minWidth: 0,
              }}>
                <div style={{ color: col, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</div>
                <div style={{ color: DIM, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* tab switcher */}
          <div style={{ display: 'flex', gap: 4, padding: '0 14px 6px', flexShrink: 0 }}>
            {['NOTES', 'ACTIVITY'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 10px', borderRadius: 3, fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? CY : '#2a3a4a'}`,
                  background: tab === t ? `${CY}18` : 'transparent',
                  color: tab === t ? CY : DIM, cursor: 'pointer',
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >{t}</button>
            ))}
          </div>

          {/* NOTES tab */}
          {tab === 'NOTES' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0 14px' }}>
              {/* resource picker */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexShrink: 0 }}>
                <select
                  value={resType}
                  onChange={e => setResType(e.target.value)}
                  style={{ ...inputStyle, width: 130, padding: '4px 6px', cursor: 'pointer' }}
                >
                  {RESOURCE_TYPES.map(rt => <option key={rt} value={rt}>{rt}</option>)}
                </select>
                <input
                  value={resId}
                  onChange={e => setResId(e.target.value)}
                  placeholder="resource id…"
                  style={{ ...inputStyle, flex: 1 }}
                  onKeyDown={e => e.key === 'Enter' && loadNotes(resType, resId)}
                />
                <button
                  onClick={() => loadNotes(resType, resId)}
                  disabled={!resId.trim() || notesLoading}
                  style={btnStyle(CY)}
                >LOAD</button>
              </div>

              {/* note compose */}
              <div style={{ marginBottom: 8, flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                  <input
                    value={author}
                    onChange={e => setAuthor(e.target.value)}
                    placeholder="author"
                    style={{ ...inputStyle, width: 110 }}
                  />
                  <textarea
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    placeholder="add note… (@mention supported)"
                    style={{
                      ...inputStyle, flex: 1, height: 40, resize: 'vertical',
                      padding: '4px 10px', lineHeight: 1.4,
                    }}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) postNote(); }}
                  />
                  <button
                    onClick={postNote}
                    disabled={posting || !body.trim() || !resId.trim()}
                    style={btnStyle(GR)}
                  >{posting ? '…' : '+ ADD'}</button>
                </div>
                {postErr && <div style={{ color: RD, fontSize: 9 }}>{postErr}</div>}
              </div>

              {/* notes list */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {!fetchedFor ? (
                  <div style={{ color: DIM, fontSize: 11, textAlign: 'center', paddingTop: 30 }}>
                    Select a resource type + ID and press LOAD to view notes.
                  </div>
                ) : notes.length === 0 ? (
                  <div style={{ color: DIM, fontSize: 11, textAlign: 'center', paddingTop: 30 }}>
                    No notes for {fetchedFor}.
                  </div>
                ) : notes.filter(n => !n.deleted).map(n => (
                  <div key={n.id} style={{
                    borderBottom: `1px solid ${CY}11`, paddingBottom: 8, marginBottom: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      {chip(n.author || 'anon', CY)}
                      {chip(ageLabel(n.created_at || n.ts), DIM)}
                      {n.edited_at && chip('edited', AM)}
                      {Array.isArray(n.mentions) && n.mentions.length > 0 && (
                        n.mentions.map(m => chip(`@${m.id || m}`, PR))
                      )}
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => { setEditing(n.id); setEditBody(n.body); }}
                          style={{ ...btnStyle(AM), padding: '1px 6px', fontSize: 8 }}
                        >EDIT</button>
                        <button
                          onClick={() => deleteNote(n.id)}
                          style={{ ...btnStyle(RD), padding: '1px 6px', fontSize: 8 }}
                        >DEL</button>
                      </span>
                    </div>
                    {editing === n.id ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <textarea
                          value={editBody}
                          onChange={e => setEditBody(e.target.value)}
                          style={{ ...inputStyle, flex: 1, height: 36, resize: 'none', padding: '3px 8px' }}
                        />
                        <button onClick={() => saveEdit(n.id)} disabled={saving} style={btnStyle(GR)}>
                          {saving ? '…' : 'SAVE'}
                        </button>
                        <button onClick={() => setEditing(null)} style={btnStyle(DIM)}>✕</button>
                      </div>
                    ) : (
                      <div style={{ color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, paddingLeft: 2 }}>
                        {n.body}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ACTIVITY tab */}
          {tab === 'ACTIVITY' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0 14px' }}>
              <input
                value={actSearch}
                onChange={e => setActSearch(e.target.value)}
                placeholder="search activity…"
                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', marginBottom: 8, flexShrink: 0 }}
              />
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {filteredActivity.length === 0 ? (
                  <div style={{ color: DIM, fontSize: 11, textAlign: 'center', paddingTop: 30 }}>
                    {actLoading ? 'Loading activity…' : 'No activity.'}
                  </div>
                ) : filteredActivity.map((a, i) => (
                  <div key={a.id || i} style={{ borderBottom: `1px solid ${CY}11`, paddingBottom: 6, marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                      {a.resource_type && chip(a.resource_type, CY)}
                      {a.resource_id && (
                        <span style={{ color: PR, fontSize: 9 }}>{String(a.resource_id).slice(0, 20)}</span>
                      )}
                      {a.author && chip(a.author, GR)}
                      <span style={{ marginLeft: 'auto', color: DIM, fontSize: 9 }}>
                        {ageLabel(a.created_at || a.ts)}
                      </span>
                    </div>
                    <div style={{ color: '#DCEBF5', fontSize: 10, lineHeight: 1.4, paddingLeft: 2 }}>
                      {String(a.body || a.action || '').slice(0, 160)}
                      {String(a.body || a.action || '').length > 160 ? '…' : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {brief && (
            <div style={{
              padding: '8px 14px', borderTop: `1px solid ${CY}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(0,207,255,0.03)',
            }}>
              <span style={{ color: CY, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
