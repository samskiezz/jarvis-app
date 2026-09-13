import { useState, useEffect, useCallback } from 'react';

const API = '';
const IVSC_RE = /\b(investment[._-]?spec|spec[._-]?invest|ivsc|invest[._-]?coverage|uncovered[._-]?invest(?:ment)?|investment[._-]?specification|investment[._-]?spec[._-]?gap|spec[._-]?backed[._-]?invest|investment[._-]?to[._-]?spec|spec[._-]?for[._-]?invest|investments[._-]?without[._-]?specs|portfolio[._-]?spec|which[._-]?investments[._-]?have[._-]?specs)\b/i;

export function isIvscQuery(t) {
  return IVSC_RE.test(t || '');
}

export async function buildIvscScript() {
  const [invR, spR] = await Promise.allSettled([
    fetch(`${API}/entities/Investment`).then(r => r.json()),
    fetch(`${API}/v1/spec/list`).then(r => r.json()),
  ]);
  const investments = normaliseArray(invR.status === 'fulfilled' ? invR.value : []);
  const specs = normaliseArray(spR.status === 'fulfilled' ? spR.value : []);
  const enriched = correlate(investments, specs);
  const covered = enriched.filter(i => i._linked).length;
  const uncovered = enriched.filter(i => !i._linked).length;
  return (
    `Investment × Spec Coverage: ${investments.length} investments, ${specs.length} specs indexed. ` +
    `${covered} investments have specification backing; ${uncovered} lack formal spec documentation. ` +
    `Top uncovered: ${enriched.filter(i => !i._linked).slice(0, 4).map(i => i.name || i.title || i.ticker || i.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'investments', 'entities', 'records', 'specs']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(inv, spec) {
  const invToks = new Set([
    ...tokens(inv.name),
    ...tokens(inv.title),
    ...tokens(inv.description),
    ...tokens(inv.sector),
    ...tokens(inv.type),
    ...tokens(inv.ticker),
  ].filter(Boolean));
  const specToks = [
    ...tokens(spec.title),
    ...tokens(spec.name),
    ...tokens(spec.description),
    ...tokens(spec.content),
    ...tokens(spec.kind),
  ].filter(Boolean);
  if (!invToks.size || !specToks.length) return 0;
  let hits = 0;
  for (const t of specToks) if (invToks.has(t)) hits++;
  return hits / Math.max(invToks.size, specToks.length);
}

function correlate(investments, specs) {
  return investments.map(inv => {
    const scored = specs
      .map(spec => ({ spec, score: matchScore(inv, spec) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { ...inv, _linked: scored.length > 0, _matches: scored };
  });
}

const PANEL_W = 580;
const PANEL_H = 560;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4, border: `1px solid ${color}44`,
    background: `${color}14`, color, fontSize: 10, letterSpacing: 1, marginRight: 4,
  }}>{label}</span>
);

const scorebar = (score, color = CY) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
    <div style={{ width: 60, height: 4, background: '#1a2535', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(score * 100)}%`, height: '100%', background: color, borderRadius: 2 }} />
    </div>
    <span style={{ color: '#6E8AA0', fontSize: 10 }}>{(score * 100).toFixed(0)}%</span>
  </div>
);

export default function InvestmentSpecCoverage() {
  const [open, setOpen] = useState(false);
  const [investments, setInvestments] = useState([]);
  const [specs, setSpecs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invR, spR] = await Promise.allSettled([
        fetch(`${API}/entities/Investment`).then(r => r.json()),
        fetch(`${API}/v1/spec/list`).then(r => r.json()),
      ]);
      setInvestments(normaliseArray(invR.status === 'fulfilled' ? invR.value : []));
      setSpecs(normaliseArray(spR.status === 'fulfilled' ? spR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:ivsc-toggle', onToggle);
    return () => window.removeEventListener('jarvis:ivsc-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(investments, specs);
  const covered = enriched.filter(i => i._linked);
  const uncovered = enriched.filter(i => !i._linked);
  const badgeCount = uncovered.length;
  const badgeColor = badgeCount > 0 ? AM : GR;

  const filtered = enriched
    .filter(i => tab === 'ALL' || (tab === 'COVERED' ? i._linked : !i._linked))
    .filter(i => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        String(i.name || '').toLowerCase().includes(s) ||
        String(i.title || '').toLowerCase().includes(s) ||
        String(i.ticker || '').toLowerCase().includes(s) ||
        String(i.sector || '').toLowerCase().includes(s)
      );
    });

  async function assess() {
    setAssessing(true);
    setBrief('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message: `You have ${investments.length} investments and ${specs.length} specs. ${covered.length} investments have spec backing; ${uncovered.length} do not. Give a 2-sentence investment spec coverage brief with the key governance gap.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const label = inv => inv.name || inv.title || inv.ticker || inv.id || '?';

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Investment × Spec Coverage (IVSC)"
        style={{
          position: 'fixed', left: 506880, bottom: 8, zIndex: 204,
          width: 54, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ IVSC
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
              ◈ INVESTMENT × SPEC COVERAGE
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

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'INVESTMENTS', val: investments.length, col: CY },
              { label: 'SPECS', val: specs.length, col: CY },
              { label: 'COVERED', val: covered.length, col: GR },
              { label: 'UNCOVERED', val: uncovered.length, col: AM },
            ].map(({ label: l, val, col }) => (
              <div key={l} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '6px 8px', textAlign: 'center',
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0, alignItems: 'center' }}>
            {['ALL', 'COVERED', 'UNCOVERED'].map(t => (
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
              placeholder="search investments…"
              style={{
                marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                borderRadius: 4, color: '#DCEBF5', padding: '2px 8px', fontSize: 10, outline: 'none',
                fontFamily: "'JetBrains Mono',monospace", width: 160,
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            {filtered.length === 0 ? (
              <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                {loading ? 'Loading…' : 'No investments found.'}
              </div>
            ) : filtered.map((inv, i) => {
              const isExp = expanded === i;
              const statusColor = inv._linked ? GR : AM;
              return (
                <div
                  key={inv.id || i}
                  style={{
                    borderBottom: `1px solid ${CY}11`, paddingBottom: 6, marginBottom: 6,
                  }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                      padding: '4px 0',
                    }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', background: statusColor,
                      boxShadow: `0 0 6px ${statusColor}`, flexShrink: 0,
                    }} />
                    <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{label(inv)}</span>
                    {inv.ticker && chip(inv.ticker, CY)}
                    {inv.sector && chip(inv.sector, '#A78BFA')}
                    {chip(inv._linked ? 'COVERED' : 'UNCOVERED', statusColor)}
                    <span style={{ color: '#6E8AA0', fontSize: 9, marginLeft: 'auto' }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ paddingLeft: 14, paddingTop: 4 }}>
                      {inv._matches.length > 0 ? (
                        <>
                          <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED SPECS
                          </div>
                          {inv._matches.map(({ spec, score }, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              {chip(spec.status === 'approved' ? 'approved' : 'draft', spec.status === 'approved' ? GR : AM)}
                              <span style={{ color: '#DCEBF5', fontSize: 10, flex: 1 }}>
                                {spec.title || spec.name || spec.id || '?'}
                              </span>
                              {scorebar(score, CY)}
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: AM, fontSize: 10 }}>No spec backing found for this investment.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Brief block */}
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
