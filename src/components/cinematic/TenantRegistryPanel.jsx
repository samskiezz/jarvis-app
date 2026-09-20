import { useState, useEffect, useCallback } from 'react';

const API = '';
const TNRP_RE = /\b(tenant[._-]?registry|tenant[._-]?panel|list[._-]?tenant|my[._-]?tenant|my[._-]?role|who[._-]?am[._-]?i|multi[._-]?tenant|tenant[._-]?list|tnrp|tenants)\b/i;

export function isTnrpQuery(t) {
  return TNRP_RE.test(t || '');
}

export async function buildTnrpScript() {
  const [listR, whoR] = await Promise.allSettled([
    fetch(`${API}/v1/tenants`).then(r => r.json()),
    fetch(`${API}/v1/tenants/whoami`).then(r => r.json()),
  ]);
  const tenants = normaliseList(listR.status === 'fulfilled' ? listR.value : []);
  const whoami = whoR.status === 'fulfilled' ? whoR.value : null;
  const myTenant = whoami?.tenant?.name || whoami?.tenant_id || 'unknown';
  const myRole = whoami?.role || 'unknown';
  return (
    `Tenant Registry: ${tenants.length} tenant(s) registered. ` +
    `Active tenant: ${myTenant} (role: ${myRole}). ` +
    `Tenants: ${tenants.slice(0, 5).map(t => t.name || t.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'tenants', 'results', 'data', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function age(ts) {
  if (!ts) return '';
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return `${Math.round(d / 1000)}s ago`;
  if (d < 3600000) return `${Math.round(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.round(d / 3600000)}h ago`;
  return `${Math.round(d / 86400000)}d ago`;
}

const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const VI = '#A78BFA';
const PK = '#F472B6';
const PANEL_W = 560;
const PANEL_H = 560;

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4,
    border: `1px solid ${color}44`, background: `${color}14`,
    color, fontSize: 10, letterSpacing: 1, marginRight: 4,
  }}>{label}</span>
);

export default function TenantRegistryPanel() {
  const [open, setOpen] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [whoami, setWhoami] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('TENANTS');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [members, setMembers] = useState({});
  const [loadingMembers, setLoadingMembers] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');
  const [newName, setNewName] = useState('');
  const [newPlan, setNewPlan] = useState('');
  const [addResult, setAddResult] = useState('');
  const [addingTenant, setAddingTenant] = useState(false);

  const loadWhoami = useCallback(async () => {
    try {
      const r = await fetch(`${API}/v1/tenants/whoami`);
      const d = await r.json();
      setWhoami(d);
    } catch { /* skip */ }
  }, []);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/v1/tenants`);
      const d = await r.json();
      setTenants(normaliseList(d));
    } catch { /* skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:tnrp-toggle', onToggle);
    return () => window.removeEventListener('jarvis:tnrp-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      loadTenants();
      loadWhoami();
      timer = setInterval(loadTenants, 90000);
    }
    return () => clearInterval(timer);
  }, [open, loadTenants, loadWhoami]);

  const expandTenant = useCallback(async (id, idx) => {
    if (expanded === idx) { setExpanded(null); return; }
    setExpanded(idx);
    if (members[id]) return;
    setLoadingMembers(prev => ({ ...prev, [id]: true }));
    try {
      const r = await fetch(`${API}/v1/tenants/${id}/members`);
      const d = await r.json();
      const list = d.members || d.items || d || [];
      setMembers(prev => ({ ...prev, [id]: Array.isArray(list) ? list : [] }));
    } catch {
      setMembers(prev => ({ ...prev, [id]: [] }));
    }
    setLoadingMembers(prev => ({ ...prev, [id]: false }));
  }, [expanded, members]);

  const addTenant = useCallback(async () => {
    if (!newName.trim()) return;
    setAddingTenant(true);
    setAddResult('');
    try {
      const r = await fetch(`${API}/v1/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ name: newName.trim(), plan: newPlan.trim() || undefined }),
      });
      const d = await r.json();
      if (d.id || d.name) {
        setAddResult(`✓ Created: ${d.name || d.id}`);
        setNewName('');
        setNewPlan('');
        loadTenants();
      } else {
        setAddResult(d.detail || JSON.stringify(d).slice(0, 80));
      }
    } catch (e) {
      setAddResult('Error: ' + e.message);
    }
    setAddingTenant(false);
  }, [newName, newPlan, loadTenants]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief('');
    try {
      const msg = `Tenant Registry has ${tenants.length} tenant(s). Active: ${whoami?.tenant?.name || whoami?.tenant_id || 'unknown'}, role: ${whoami?.role || 'unknown'}. Give a 2-sentence tenant health and access model brief.`;
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ message: msg }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }, [tenants, whoami]);

  const filtered = tenants.filter(t => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      String(t.name || '').toLowerCase().includes(s) ||
      String(t.id || '').toLowerCase().includes(s) ||
      String(t.plan || '').toLowerCase().includes(s)
    );
  });

  const badgeCount = tenants.length;
  const badgeColor = badgeCount > 0 ? GR : AM;

  const myTenantName = whoami?.tenant?.name || whoami?.tenant_id || null;
  const myRole = whoami?.role || null;
  const myPrincipal = whoami?.principal || null;

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Tenant Registry Panel (TNRP)"
        style={{
          position: 'fixed', left: 698400, bottom: 8, zIndex: 247,
          width: 56, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ TNRP
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
          {/* Header */}
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${CY}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${CY}` }}>
              ◈ TENANT REGISTRY
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  padding: '2px 8px', borderRadius: 3, border: `1px solid ${CY}55`,
                  background: 'transparent', color: CY, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                }}
              >{assessing ? 'assessing…' : '▶ ASSESS'}</button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0 }}
              >✕</button>
            </span>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'TENANTS', val: tenants.length, col: CY },
              { label: 'MY TENANT', val: myTenantName || '—', col: VI },
              { label: 'MY ROLE', val: myRole || '—', col: GR },
              { label: 'PRINCIPAL', val: myPrincipal || '—', col: AM },
            ].map(({ label: l, val, col }) => (
              <div key={l} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '6px 8px', textAlign: 'center', minWidth: 0,
              }}>
                <div style={{ color: col, fontSize: typeof val === 'number' ? 16 : 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</div>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center' }}>
            {['TENANTS', 'WHOAMI', 'ADD'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? CY : '#2a3a4a'}`,
                  background: tab === t ? `${CY}22` : 'transparent',
                  color: tab === t ? CY : '#6E8AA0',
                }}
              >{t}</button>
            ))}
            {tab === 'TENANTS' && (
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="search tenants…"
                style={{
                  marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                  borderRadius: 4, color: '#DCEBF5', padding: '2px 8px', fontSize: 10, outline: 'none',
                  fontFamily: "'JetBrains Mono',monospace", width: 160,
                }}
              />
            )}
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {tab === 'WHOAMI' && (
              whoami ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                  {[
                    ['Tenant ID', whoami.tenant_id || whoami.tenant?.id],
                    ['Tenant Name', whoami.tenant?.name],
                    ['Plan', whoami.tenant?.plan],
                    ['Principal', whoami.principal],
                    ['Role', whoami.role],
                  ].map(([k, v]) => v != null && (
                    <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', borderBottom: `1px solid ${CY}11`, paddingBottom: 5 }}>
                      <span style={{ color: '#6E8AA0', fontSize: 10, width: 100, flexShrink: 0 }}>{k}</span>
                      <span style={{ color: '#DCEBF5', fontSize: 11 }}>{String(v)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#6E8AA0', fontSize: 11, paddingTop: 20 }}>Loading identity context…</div>
              )
            )}

            {tab === 'ADD' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
                <div style={{ color: '#6E8AA0', fontSize: 10, letterSpacing: 1 }}>CREATE NEW TENANT</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { label: 'Name *', val: newName, set: setNewName, ph: 'tenant name' },
                    { label: 'Plan', val: newPlan, set: setNewPlan, ph: 'free / pro / enterprise' },
                  ].map(({ label: l, val, set, ph }) => (
                    <div key={l} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: '#6E8AA0', fontSize: 10, width: 60, flexShrink: 0 }}>{l}</span>
                      <input
                        value={val}
                        onChange={e => set(e.target.value)}
                        placeholder={ph}
                        style={{
                          flex: 1, background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                          borderRadius: 4, color: '#DCEBF5', padding: '4px 8px', fontSize: 10, outline: 'none',
                          fontFamily: "'JetBrains Mono',monospace",
                        }}
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={addTenant}
                  disabled={addingTenant || !newName.trim()}
                  style={{
                    padding: '4px 12px', borderRadius: 3, border: `1px solid ${GR}55`,
                    background: `${GR}14`, color: GR, cursor: 'pointer', fontSize: 10, letterSpacing: 1,
                    alignSelf: 'flex-start',
                  }}
                >{addingTenant ? 'creating…' : '+ CREATE'}</button>
                {addResult && (
                  <div style={{ color: addResult.startsWith('✓') ? GR : PK, fontSize: 10 }}>{addResult}</div>
                )}
              </div>
            )}

            {tab === 'TENANTS' && (
              filtered.length === 0 ? (
                <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                  {loading ? 'Loading…' : 'No tenants found.'}
                </div>
              ) : filtered.map((t, i) => {
                const tid = t.id || t.tenant_id || String(i);
                const isExp = expanded === i;
                const mems = members[tid] || [];
                const isLoadingM = loadingMembers[tid];
                return (
                  <div key={tid} style={{ borderBottom: `1px solid ${CY}11`, paddingBottom: 6, marginBottom: 6 }}>
                    <div
                      onClick={() => expandTenant(tid, i)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '4px 0' }}
                    >
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%', background: GR,
                        boxShadow: `0 0 6px ${GR}`, flexShrink: 0,
                      }} />
                      <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{t.name || t.id || '?'}</span>
                      {t.plan && chip(t.plan, VI)}
                      {t.created_at && (
                        <span style={{ color: '#6E8AA0', fontSize: 9 }}>{age(t.created_at)}</span>
                      )}
                      <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 4 }}>{isExp ? '▲' : '▼'}</span>
                    </div>

                    {isExp && (
                      <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                        <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>MEMBERS</div>
                        {isLoadingM ? (
                          <div style={{ color: '#6E8AA0', fontSize: 10 }}>loading members…</div>
                        ) : mems.length === 0 ? (
                          <div style={{ color: AM, fontSize: 10 }}>No members found.</div>
                        ) : mems.map((m, j) => (
                          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            {chip(m.role || 'member', m.role === 'owner' ? GR : CY)}
                            <span style={{ color: '#DCEBF5', fontSize: 10 }}>{m.principal || m.id || '?'}</span>
                            {m.joined_at && (
                              <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>{age(m.joined_at)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

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
