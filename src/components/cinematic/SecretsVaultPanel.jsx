import { useState, useEffect, useCallback, useRef } from 'react';

const API = '';
const VLTX_RE = /\b(secrets?[._-]?vault|vault[._-]?panel|secret[._-]?keys?|vltx|vault[._-]?secrets?|stored[._-]?secrets?|api[._-]?keys?[._-]?vault|credential[._-]?vault|secret[._-]?registry|connector[._-]?secrets?)\b/i;

export function isVltxQuery(t) {
  return VLTX_RE.test(t || '');
}

export async function buildVltxScript() {
  try {
    const r = await fetch(`${API}/v1/vault/`);
    if (!r.ok) return 'Secrets Vault: unable to reach the vault endpoint.';
    const data = await r.json();
    const items = data.items || [];
    const total = items.length;
    const owners = [...new Set(items.map(s => s.owner).filter(Boolean))];
    if (total === 0) return 'Secrets Vault is empty — no secrets registered. Use the vault panel to add connector credentials.';
    return `Secrets Vault: ${total} secret${total === 1 ? '' : 's'} stored (names + metadata only — values never exposed). ` +
      `${owners.length > 0 ? `Owner${owners.length > 1 ? 's' : ''}: ${owners.slice(0, 3).join(', ')}${owners.length > 3 ? '…' : ''}.` : 'No owner metadata set.'} ` +
      `All values are server-side only; the API surface is read-safe.`;
  } catch {
    return 'Secrets Vault: endpoint unreachable — check backend health.';
  }
}

const CY = '#00D4FF';
const GN = '#22C55E';
const AM = '#F59E0B';
const RD = '#F43F5E';
const DIM = '#3A4A5A';
const PU = '#A855F7';

function age(ts) {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Chip({ label, color = CY, dim }) {
  return (
    <span style={{
      fontSize: 10, padding: '1px 7px', borderRadius: 4, letterSpacing: 1,
      border: `1px solid ${dim ? DIM : color}55`,
      color: dim ? DIM : color, background: `${dim ? DIM : color}11`,
    }}>{label}</span>
  );
}

function StatTile({ label, value, color = CY }) {
  return (
    <div style={{
      flex: 1, minWidth: 80, background: 'rgba(0,212,255,0.04)',
      border: `1px solid ${color}22`, borderRadius: 8, padding: '8px 10px',
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: 'monospace' }}>{value ?? '—'}</div>
      <div style={{ fontSize: 9, color: '#6E8AA0', letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

const API_KEY = typeof window !== 'undefined'
  ? (window.__JARVIS_API_KEY__ || localStorage.getItem('jarvis_api_key') || 'dev-key')
  : 'dev-key';

export default function SecretsVaultPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [secrets, setSecrets] = useState([]);
  const [search, setSearch] = useState('');
  const [assessing, setAssessing] = useState(false);

  // add form
  const [addName, setAddName] = useState('');
  const [addValue, setAddValue] = useState('');
  const [addOwner, setAddOwner] = useState('');
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState(null);

  // delete state
  const [deleting, setDeleting] = useState(null);

  const timer = useRef(null);

  const fetchSecrets = useCallback(async () => {
    try {
      const r = await fetch(`${API}/v1/vault/`);
      if (r.ok) {
        const data = await r.json();
        setSecrets(data.items || []);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchSecrets();
    timer.current = setInterval(fetchSecrets, 60_000);
    return () => clearInterval(timer.current);
  }, [fetchSecrets]);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:vltx-toggle', toggle);
    return () => window.removeEventListener('jarvis:vltx-toggle', toggle);
  }, []);

  async function addSecret() {
    if (!addName.trim() || !addValue.trim()) return;
    setAdding(true);
    setAddResult(null);
    try {
      const r = await fetch(`${API}/v1/vault/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ name: addName.trim(), value: addValue.trim(), owner: addOwner.trim() }),
      });
      const data = await r.json();
      if (r.ok) {
        setAddResult({ ok: true, msg: `Stored: ${addName.trim()}` });
        setAddName(''); setAddValue(''); setAddOwner('');
        await fetchSecrets();
      } else {
        setAddResult({ ok: false, msg: data.detail || 'Failed to store secret.' });
      }
    } catch (e) {
      setAddResult({ ok: false, msg: String(e) });
    }
    setAdding(false);
  }

  async function deleteSecret(name) {
    setDeleting(name);
    try {
      const r = await fetch(`${API}/v1/vault/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (r.ok) await fetchSecrets();
    } catch { /* silent */ }
    setDeleting(null);
  }

  async function assess() {
    setAssessing(true);
    const script = await buildVltxScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
  }

  const owners = [...new Set(secrets.map(s => s.owner).filter(Boolean))];
  const latestUpdated = secrets.reduce((max, s) => Math.max(max, s.updated_ts || 0), 0);
  const obf = secrets[0]?.obfuscation || 'base64';

  const tabs = ['ALL', ...owners.map(o => o.toUpperCase()), 'ADD'];

  const displayed = secrets.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.name.toLowerCase().includes(q) || (s.owner || '').toLowerCase().includes(q);
    const matchTab = tab === 'ALL' || tab === 'ADD' || (s.owner || '').toUpperCase() === tab;
    return matchSearch && matchTab;
  });

  const badgeColor = secrets.length > 0 ? GN : DIM;

  const inputStyle = {
    background: 'rgba(0,212,255,0.07)', border: `1px solid ${CY}33`,
    color: '#DCEBF5', borderRadius: 4, padding: '4px 8px', fontSize: 11,
    fontFamily: "'JetBrains Mono',monospace", outline: 'none', width: '100%',
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Secrets Vault Panel"
        style={{
          position: 'fixed', left: 388320, bottom: 8, zIndex: 178,
          background: 'rgba(5,8,13,0.82)', border: `1px solid ${badgeColor}55`,
          color: badgeColor, borderRadius: 6, padding: '3px 9px', fontSize: 11,
          letterSpacing: 2, cursor: 'pointer', backdropFilter: 'blur(6px)',
          boxShadow: `0 0 12px ${badgeColor}22`,
          fontFamily: "'JetBrains Mono',monospace",
        }}
      >
        ◈ VLTX{secrets.length > 0 && (
          <span style={{
            marginLeft: 5, fontSize: 10, background: badgeColor, color: '#04060A',
            borderRadius: 10, padding: '0 5px', fontWeight: 700,
          }}>{secrets.length}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', left: 388320, bottom: 48, zIndex: 178,
      width: 420, maxHeight: '74vh',
      background: 'rgba(6,10,16,0.96)', border: `1px solid ${CY}33`,
      borderRadius: 12, display: 'flex', flexDirection: 'column',
      backdropFilter: 'blur(14px)', boxShadow: `0 0 40px ${CY}18`,
      fontFamily: "'JetBrains Mono',monospace", color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 8px',
        borderBottom: `1px solid ${CY}22`,
      }}>
        <span style={{ color: CY, fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>◈ SECRETS VAULT</span>
        <Chip label={`${secrets.length} KEYS`} color={badgeColor} />
        <Chip label={obf.toUpperCase()} color={AM} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={assess} disabled={assessing} style={{
            fontSize: 9, color: CY, background: `${CY}11`, border: `1px solid ${CY}44`,
            borderRadius: 4, padding: '2px 7px', cursor: 'pointer', letterSpacing: 1,
          }}>{assessing ? '…' : '▶ ASSESS'}</button>
          <button onClick={() => setOpen(false)} style={{
            fontSize: 14, color: '#6E8AA0', background: 'none', border: 'none', cursor: 'pointer',
          }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px' }}>
        <StatTile label="SECRETS" value={secrets.length} color={GN} />
        <StatTile label="OWNERS" value={owners.length || '—'} color={CY} />
        <StatTile label="LAST UPDATED" value={latestUpdated ? age(latestUpdated) : '—'} color={AM} />
        <StatTile label="AT-REST" value={obf.slice(0, 6).toUpperCase()} color={PU} />
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${CY}22`, padding: '0 14px', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontSize: 10, letterSpacing: 1, padding: '4px 10px', whiteSpace: 'nowrap',
            color: tab === t ? CY : '#6E8AA0',
            background: 'none', border: 'none',
            borderBottom: tab === t ? `2px solid ${CY}` : '2px solid transparent',
            cursor: 'pointer',
          }}>{t}</button>
        ))}
      </div>

      {/* search (not on ADD tab) */}
      {tab !== 'ADD' && (
        <div style={{ padding: '8px 14px 4px' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search name / owner…"
            style={inputStyle}
          />
        </div>
      )}

      {/* body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px 14px' }}>
        {tab === 'ADD' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 6 }}>
            <div style={{ fontSize: 9, color: '#6E8AA0', letterSpacing: 1 }}>
              ⚠ VALUES ARE NEVER RETURNED OVER THE API — STORED OBFUSCATED SERVER-SIDE ONLY
            </div>
            <input
              value={addName}
              onChange={e => setAddName(e.target.value)}
              placeholder="secret name (e.g. my_api_key)"
              style={inputStyle}
            />
            <input
              type="password"
              value={addValue}
              onChange={e => setAddValue(e.target.value)}
              placeholder="secret value"
              style={inputStyle}
            />
            <input
              value={addOwner}
              onChange={e => setAddOwner(e.target.value)}
              placeholder="owner (optional)"
              style={inputStyle}
            />
            <button
              onClick={addSecret}
              disabled={adding || !addName.trim() || !addValue.trim()}
              style={{
                background: `${GN}22`, border: `1px solid ${GN}55`, color: GN,
                borderRadius: 6, padding: '6px 14px', fontSize: 11, letterSpacing: 1,
                cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace",
              }}
            >
              {adding ? '…' : '+ STORE SECRET'}
            </button>
            {addResult && (
              <div style={{
                fontSize: 11, padding: '6px 10px', borderRadius: 6,
                background: addResult.ok ? `${GN}11` : `${RD}11`,
                border: `1px solid ${addResult.ok ? GN : RD}44`,
                color: addResult.ok ? GN : RD,
              }}>
                {addResult.msg}
              </div>
            )}
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ color: DIM, fontSize: 11, padding: '20px 0', textAlign: 'center' }}>
            {secrets.length === 0 ? 'vault is empty' : 'no matches'}
          </div>
        ) : (
          displayed.map(s => (
            <div key={s.name} style={{
              borderBottom: `1px solid ${CY}11`, padding: '8px 0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{s.name}</span>
                {s.owner && <Chip label={s.owner} color={CY} />}
                <Chip label={age(s.updated_ts)} color={AM} dim={!s.updated_ts} />
                <button
                  onClick={() => deleteSecret(s.name)}
                  disabled={deleting === s.name}
                  title="Delete secret"
                  style={{
                    fontSize: 10, color: RD, background: `${RD}11`, border: `1px solid ${RD}44`,
                    borderRadius: 4, padding: '1px 7px', cursor: 'pointer', letterSpacing: 1,
                  }}
                >{deleting === s.name ? '…' : '✕ DEL'}</button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                <Chip label={`created ${age(s.created_ts)}`} color={DIM} dim />
                <Chip label={s.obfuscation || 'base64'} color={PU} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* footer */}
      <div style={{
        borderTop: `1px solid ${CY}22`, padding: '6px 14px',
        fontSize: 9, color: '#3A5A6A', letterSpacing: 1,
      }}>
        VALUES NEVER RETURNED OVER API · SERVER-SIDE ONLY · {obf.toUpperCase()} AT REST
      </div>
    </div>
  );
}
