import { useState, useEffect, useCallback } from 'react';

const API = '';
const SDMC_RE = /\b(sci[._-]?domain|science[._-]?domain|domain[._-]?console|science[._-]?console|sci[._-]?console|sdmc|available[._-]?science|science[._-]?methods?|science[._-]?capabilit|domain[._-]?methods?|which[._-]?science|underworld[._-]?science)\b/i;

export function isSdmcQuery(t) {
  return SDMC_RE.test(t || '');
}

export async function buildSdmcScript() {
  const r = await fetch(`${API}/v1/sci/domains`).then(d => d.json()).catch(() => ({}));
  const domains = normaliseArray(r);
  const totalMethods = domains.reduce((s, d) => s + methodCount(d), 0);
  const names = domains.slice(0, 6).map(d => d.label || d.id || '?').join(', ');
  return (
    `Science Domain Console: ${domains.length} domain consoles registered, ${totalMethods} total methods available. ` +
    `Consoles: ${names || 'none'}${domains.length > 6 ? ` and ${domains.length - 6} more` : ''}. ` +
    `Use POST /v1/sci/domains/{id}/run to execute science methods through any console.`
  );
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['domains', 'items', 'results', 'data', 'consoles']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function methodCount(domain) {
  if (typeof domain.methods === 'number') return domain.methods;
  if (Array.isArray(domain.methods)) return domain.methods.length;
  return 0;
}

const PANEL_W = 620;
const PANEL_H = 580;
const CY = '#22D3EE';
const AM = '#F59E0B';
const GR = '#22C55E';
const VI = '#A78BFA';

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4, border: `1px solid ${color}44`,
    background: `${color}14`, color, fontSize: 10, letterSpacing: 1, marginRight: 4,
  }}>{label}</span>
);

function DomainRow({ domain }) {
  const [expanded, setExpanded] = useState(false);
  const [methods, setMethods] = useState(null);
  const [examples, setExamples] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [runResult, setRunResult] = useState('');
  const [runningIdx, setRunningIdx] = useState(null);

  async function expand() {
    if (!expanded && !methods) {
      setLoadingDetail(true);
      const [mR, eR] = await Promise.allSettled([
        fetch(`${API}/v1/sci/domains/${domain.id}/methods`).then(r => r.json()),
        fetch(`${API}/v1/sci/domains/${domain.id}/examples`).then(r => r.json()),
      ]);
      const mData = mR.status === 'fulfilled' ? mR.value : {};
      const eData = eR.status === 'fulfilled' ? eR.value : {};
      setMethods(Array.isArray(mData) ? mData : (mData.methods || []));
      setExamples(Array.isArray(eData.examples) ? eData.examples : (eData.examples || []));
      setLoadingDetail(false);
    }
    setExpanded(v => !v);
  }

  async function runExample(ex, idx) {
    setRunningIdx(idx);
    setRunResult('');
    try {
      const r = await fetch(`${API}/v1/sci/domains/${domain.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: ex.field, value: ex.value ?? null }),
      });
      const d = await r.json();
      setRunResult(JSON.stringify(d, null, 2).slice(0, 800));
    } catch (e) {
      setRunResult(`Error: ${e.message}`);
    }
    setRunningIdx(null);
  }

  const mc = methodCount(domain);

  return (
    <div style={{ borderBottom: `1px solid ${CY}11`, marginBottom: 2 }}>
      <div
        onClick={expand}
        style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 0' }}
      >
        <span style={{
          width: 7, height: 7, borderRadius: '50%', background: mc > 0 ? GR : '#6E8AA0',
          boxShadow: mc > 0 ? `0 0 6px ${GR}` : 'none', flexShrink: 0,
        }} />
        <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1, fontWeight: 600 }}>
          {domain.label || domain.id || '?'}
        </span>
        {mc > 0 && chip(`${mc}M`, CY)}
        {domain.description && (
          <span style={{ color: '#6E8AA0', fontSize: 10, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {domain.description}
          </span>
        )}
        <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 4 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ paddingLeft: 16, paddingBottom: 8 }}>
          {loadingDetail ? (
            <div style={{ color: '#6E8AA0', fontSize: 10 }}>loading methods…</div>
          ) : (
            <>
              {methods && methods.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>METHODS</div>
                  {methods.map((m, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ color: CY, fontSize: 10 }}>{m.name || m.method || String(m)}</span>
                      {m.description && (
                        <span style={{ color: '#6E8AA0', fontSize: 10 }}>— {m.description}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {examples && examples.length > 0 && (
                <div>
                  <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>EXAMPLES</div>
                  {examples.map((ex, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      {chip(ex.field || '?', VI)}
                      {ex.value !== undefined && (
                        <span style={{ color: '#6E8AA0', fontSize: 9, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {JSON.stringify(ex.value).slice(0, 60)}
                        </span>
                      )}
                      <button
                        onClick={() => runExample(ex, i)}
                        disabled={runningIdx === i}
                        style={{
                          marginLeft: 'auto', padding: '1px 8px', borderRadius: 3,
                          border: `1px solid ${GR}55`, background: 'transparent',
                          color: GR, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                        }}
                      >
                        {runningIdx === i ? 'running…' : '▶ RUN'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {runResult && (
                <pre style={{
                  color: '#DCEBF5', fontSize: 9, background: 'rgba(0,207,255,0.04)',
                  border: `1px solid ${CY}22`, borderRadius: 4, padding: '6px 8px',
                  marginTop: 4, maxHeight: 120, overflow: 'auto', whiteSpace: 'pre-wrap',
                }}>
                  {runResult}
                </pre>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function SciDomainConsolePanel() {
  const [open, setOpen] = useState(false);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/v1/sci/domains`).then(d => d.json());
      setDomains(normaliseArray(r));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:sdmc-toggle', onToggle);
    return () => window.removeEventListener('jarvis:sdmc-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 120000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const totalMethods = domains.reduce((s, d) => s + methodCount(d), 0);
  const withMethods = domains.filter(d => methodCount(d) > 0);

  const filtered = domains
    .filter(d => tab === 'ALL' || (tab === 'WITH METHODS' ? methodCount(d) > 0 : methodCount(d) === 0))
    .filter(d => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        String(d.id || '').toLowerCase().includes(s) ||
        String(d.label || '').toLowerCase().includes(s) ||
        String(d.description || '').toLowerCase().includes(s)
      );
    });

  const badgeCount = domains.length;
  const badgeColor = badgeCount > 0 ? GR : '#6E8AA0';

  async function assess() {
    setAssessing(true);
    setBrief('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message: `You have ${domains.length} science domain consoles registered with ${totalMethods} total methods. ${withMethods.length} consoles have methods available. Domains: ${domains.slice(0, 6).map(d => d.label || d.id).join(', ')}${domains.length > 6 ? '...' : ''}. Give a 2-sentence science domain readiness brief highlighting available capabilities and any gaps.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Science Domain Console (SDMC)"
        style={{
          position: 'fixed', left: 684720, bottom: 8, zIndex: 244,
          width: 58, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ⚗ SDMC
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
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${CY}22`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 12px ${CY}` }}>
              ⚗ SCIENCE DOMAIN CONSOLES
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
                style={{
                  background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0,
                }}
              >✕</button>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'DOMAINS', val: domains.length, col: CY },
              { label: 'METHODS', val: totalMethods, col: VI },
              { label: 'WITH METHODS', val: withMethods.length, col: GR },
              { label: 'AVAILABLE', val: domains.length > 0 ? 'YES' : 'NONE', col: AM },
            ].map(({ label: l, val, col }) => (
              <div key={l} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '6px 8px', textAlign: 'center',
              }}>
                <div style={{ color: col, fontSize: 15, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center' }}>
            {['ALL', 'WITH METHODS', 'NO METHODS'].map(t => (
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
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search domains…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                borderRadius: 4, color: '#DCEBF5', padding: '2px 8px', fontSize: 10, outline: 'none',
                fontFamily: "'JetBrains Mono',monospace", width: 160,
              }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading science domains…' : 'No domains found.'}
              </div>
            ) : filtered.map((domain, i) => (
              <DomainRow key={domain.id || i} domain={domain} />
            ))}
          </div>

          {brief && (
            <div style={{
              padding: '8px 14px', borderTop: `1px solid ${CY}22`,
              color: '#DCEBF5', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
              background: 'rgba(34,211,238,0.03)',
            }}>
              <span style={{ color: CY, fontSize: 9, letterSpacing: 2 }}>ASSESS ▸ </span>{brief}
            </div>
          )}
        </div>
      )}
    </>
  );
}
