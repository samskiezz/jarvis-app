import { useState, useEffect, useCallback } from 'react';

const API = '';
const IVIN_RE = /\b(invest(ment)?[._-]?invest(igation)?|invest(igation)?[._-]?invest(ment)?|ivin|investments?[._-]?under[._-]?invest(igation)?|which[._-]?investments?[._-]?are[._-]?invest(igated)?|invest(ment)?[._-]?case|case[._-]?invest(ment)?|investment[._-]?probe|probed[._-]?invest(ment)?)\b/i;

export function isIvinQuery(t) {
  return IVIN_RE.test(t || '');
}

export async function buildIvinScript() {
  const [invR, caseR] = await Promise.allSettled([
    fetch(`${API}/entities/Investment`).then(r => r.json()),
    fetch(`${API}/v1/investigations`).then(r => r.json()),
  ]);
  const investments = normaliseInvestments(invR.status === 'fulfilled' ? invR.value : []);
  const cases = normaliseCases(caseR.status === 'fulfilled' ? caseR.value : []);
  const enriched = correlate(investments, cases);
  const linked = enriched.filter(i => i._linked).length;
  const clear = enriched.length - linked;
  return (
    `Investment × Investigation Correlation: ${investments.length} investments, ${cases.length} open cases indexed. ` +
    `${linked} investments are linked to active investigations; ${clear} appear unlinked. ` +
    `Top linked: ${enriched.filter(i => i._linked).slice(0, 4).map(i => i.name || i.ticker || i.id || '?').join(', ') || 'none'}.`
  );
}

function normaliseInvestments(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'investments', 'entities', 'records']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseCases(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['investigations', 'cases', 'items', 'results', 'data']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(investment, investigation) {
  const invToks = new Set([
    ...tokens(investment.name),
    ...tokens(investment.ticker),
    ...tokens(investment.type),
    ...tokens(investment.sector),
    ...tokens(investment.description),
    ...tokens(investment.tags),
  ].filter(Boolean));
  const caseToks = [
    ...tokens(investigation.title),
    ...tokens(investigation.name),
    ...tokens(investigation.category),
    ...tokens(investigation.description),
    ...tokens(investigation.subject),
    ...tokens(investigation.tags),
  ].filter(Boolean);
  if (!invToks.size || !caseToks.length) return 0;
  let hits = 0;
  for (const t of caseToks) if (invToks.has(t)) hits++;
  return hits / Math.max(invToks.size, caseToks.length);
}

function correlate(investments, cases) {
  return investments.map(inv => {
    const scored = cases
      .map(c => ({ case: c, score: matchScore(inv, c) }))
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
const RD = '#EF4444';
const PU = '#A78BFA';

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

export default function InvestmentInvestigationCorrelator() {
  const [open, setOpen] = useState(false);
  const [investments, setInvestments] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invR, caseR] = await Promise.allSettled([
        fetch(`${API}/entities/Investment`).then(r => r.json()),
        fetch(`${API}/v1/investigations`).then(r => r.json()),
      ]);
      setInvestments(normaliseInvestments(invR.status === 'fulfilled' ? invR.value : []));
      setCases(normaliseCases(caseR.status === 'fulfilled' ? caseR.value : []));
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:ivin-toggle', onToggle);
    return () => window.removeEventListener('jarvis:ivin-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      load();
      timer = setInterval(load, 90000);
    }
    return () => clearInterval(timer);
  }, [open, load]);

  const enriched = correlate(investments, cases);
  const linked = enriched.filter(i => i._linked);
  const unlinked = enriched.filter(i => !i._linked);
  const badgeCount = linked.length;
  const badgeColor = badgeCount > 0 ? AM : GR;

  const filtered = enriched
    .filter(i => tab === 'ALL' || (tab === 'LINKED' ? i._linked : !i._linked))
    .filter(i => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(i.name || '').toLowerCase().includes(q) ||
        String(i.ticker || '').toLowerCase().includes(q) ||
        String(i.type || '').toLowerCase().includes(q) ||
        String(i.sector || '').toLowerCase().includes(q)
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
          message: `You have ${investments.length} investments and ${cases.length} open investigations. ${linked.length} investments are keyword-linked to active cases; ${unlinked.length} appear clear. Give a 2-sentence portfolio investigation risk brief with the key exposure pattern.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const label = i => i.name || i.ticker || i.id || '?';

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Investment × Investigation Correlator (IVIN)"
        style={{
          position: 'fixed', left: 1920, bottom: 8, zIndex: 119,
          width: 54, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        <span>◈</span>
        <span>IVIN</span>
        {badgeCount > 0 && (
          <span style={{
            background: AM, color: '#000', borderRadius: 8,
            fontSize: 8, padding: '0 4px', minWidth: 14, textAlign: 'center',
          }}>{badgeCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', right: 16, top: 52, zIndex: 233,
          width: PANEL_W, maxHeight: PANEL_H,
          background: 'rgba(5,10,18,0.97)', border: `1px solid ${CY}33`,
          borderRadius: 12, overflow: 'hidden',
          boxShadow: `0 0 60px ${CY}18, 0 24px 48px rgba(0,0,0,0.8)`,
          fontFamily: "'JetBrains Mono',monospace", display: 'flex', flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${CY}22`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>INVESTMENT × INVESTIGATION CORRELATOR</span>
            <span style={{ marginLeft: 'auto', color: '#4E6070', fontSize: 10 }}>IVIN</span>
            <button onClick={() => setOpen(false)} style={{
              background: 'none', border: 'none', color: '#4E6070',
              cursor: 'pointer', fontSize: 14, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: `1px solid ${CY}11` }}>
            {[
              { label: 'INVESTMENTS', value: investments.length, color: CY },
              { label: 'CASES', value: cases.length, color: PU },
              { label: 'LINKED', value: linked.length, color: AM },
              { label: 'CLEAR', value: unlinked.length, color: GR },
            ].map(t => (
              <div key={t.label} style={{
                flex: 1, background: `${t.color}0A`, border: `1px solid ${t.color}22`,
                borderRadius: 6, padding: '5px 8px', textAlign: 'center',
              }}>
                <div style={{ color: t.color, fontSize: 16, fontWeight: 700 }}>{loading ? '…' : t.value}</div>
                <div style={{ color: '#4E6070', fontSize: 8, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Filter + search */}
          <div style={{ display: 'flex', gap: 6, padding: '6px 14px', borderBottom: `1px solid ${CY}11` }}>
            {['ALL', 'LINKED', 'CLEAR'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${CY}18` : 'transparent',
                border: `1px solid ${tab === t ? CY : CY + '33'}`,
                borderRadius: 4, color: tab === t ? CY : '#4E6070',
                fontSize: 9, letterSpacing: 1, padding: '2px 8px', cursor: 'pointer',
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search investments…"
              style={{
                marginLeft: 'auto', background: 'transparent', border: `1px solid ${CY}22`,
                borderRadius: 4, color: '#DCEBF5', fontSize: 10, padding: '2px 8px',
                outline: 'none', width: 140,
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '20px', color: '#4E6070', fontSize: 11, textAlign: 'center' }}>
                {loading ? 'Loading investments…' : 'No investments match.'}
              </div>
            )}
            {filtered.map((inv, idx) => (
              <div key={inv.id || idx}>
                <div
                  onClick={() => setExpanded(expanded === idx ? null : idx)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 14px', cursor: 'pointer',
                    background: expanded === idx ? `${CY}09` : 'transparent',
                    borderLeft: `2px solid ${inv._linked ? AM : CY}33`,
                  }}
                >
                  <span style={{ color: inv._linked ? AM : GR, fontSize: 10 }}>{inv._linked ? '⚑' : '✓'}</span>
                  <span style={{ flex: 1, color: '#DCEBF5', fontSize: 12 }}>{label(inv)}</span>
                  {inv.ticker && chip(inv.ticker, PU)}
                  {inv.sector && chip(inv.sector, CY)}
                  {inv._linked && chip(`${inv._matches.length} case${inv._matches.length !== 1 ? 's' : ''}`, AM)}
                  <span style={{ color: '#2E4050', fontSize: 10 }}>{expanded === idx ? '▲' : '▼'}</span>
                </div>
                {expanded === idx && inv._matches.length > 0 && (
                  <div style={{ padding: '4px 28px 8px', borderBottom: `1px solid ${CY}11` }}>
                    {inv._matches.map((m, mi) => (
                      <div key={mi} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                        <span style={{ color: '#4E6070', fontSize: 10, flex: 1 }}>
                          {m.case.title || m.case.name || m.case.id || 'case'}
                        </span>
                        {m.case.status && chip(m.case.status, PU)}
                        {scorebar(m.score, AM)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Assess footer */}
          <div style={{ padding: '8px 14px', borderTop: `1px solid ${CY}22` }}>
            {brief && (
              <div style={{ color: '#9AB5C8', fontSize: 11, lineHeight: 1.5, marginBottom: 6 }}>{brief}</div>
            )}
            <button onClick={assess} disabled={assessing} style={{
              background: `${CY}18`, border: `1px solid ${CY}44`, borderRadius: 5,
              color: CY, fontSize: 10, letterSpacing: 1, padding: '4px 14px', cursor: 'pointer',
            }}>
              {assessing ? 'ASSESSING…' : '▶ ASSESS'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
