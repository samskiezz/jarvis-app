import { useState, useEffect, useCallback, useRef } from 'react';

const API = '';
const SCVC_RE = /\b(spec[._-]?case|case[._-]?coverage|scvc|spec[._-]?cases|spec[._-]?linked|unlinked[._-]?spec|case[._-]?coverage[._-]?tracker|spec[._-]?to[._-]?case|spec[._-]?coverage[._-]?map|spec[._-]?backing|specs[._-]?without[._-]?cases|spec[._-]?evidence)\b/i;

export function isScvcQuery(t) {
  return SCVC_RE.test(t || '');
}

export async function buildScvcScript() {
  const [spR, csR] = await Promise.allSettled([
    fetch(`${API}/v1/spec/list`).then(r => r.json()),
    fetch(`${API}/v1/cases`).then(r => r.json()),
  ]);
  const specs = normaliseArray(spR.status === 'fulfilled' ? spR.value : []);
  const cases = normaliseArray(csR.status === 'fulfilled' ? csR.value : []);
  const linked = specs.filter(s => correlate(s, cases).length > 0).length;
  const unlinked = specs.length - linked;
  return `Spec × Case Coverage: ${specs.length} specs, ${cases.length} cases in system. ` +
    `${linked} spec(s) are LINKED to at least one case; ${unlinked} are UNLINKED (no case backing). ` +
    `${unlinked > 0 ? `Unlinked specs include: ${specs.filter(s => correlate(s, cases).length === 0).slice(0, 3).map(s => s.title || s.name || s.id || '?').join(', ')}.` : 'All specs have case coverage.'}`;
}

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ['items', 'results', 'data', 'specs', 'cases', 'records', 'list']) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(s => s.length > 2);
}

function correlate(spec, cases) {
  const sToks = new Set([...tokens(spec.title), ...tokens(spec.name), ...tokens(spec.description), ...tokens(spec.kind)]);
  const matched = [];
  for (const c of cases) {
    const cToks = [...tokens(c.title), ...tokens(c.description), ...tokens(c.status), ...tokens(c.kind)];
    const overlap = cToks.filter(t => sToks.has(t));
    if (overlap.length > 0) matched.push({ ...c, _score: overlap.length });
  }
  return matched.sort((a, b) => b._score - a._score);
}

const CY = '#00D4FF';
const GN = '#22C55E';
const AM = '#F59E0B';
const RD = '#F43F5E';
const PU = '#A855F7';
const DIM = '#3A4A5A';

const STATUS_COLOR = {
  open: AM, investigating: CY, closed: GN, resolved: GN,
  active: CY, pending: AM, archived: DIM,
};

function age(ts) {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
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

function ScoreBar({ value, max = 5, color = CY }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 3, background: '#1A2535', borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 10, color, fontFamily: 'monospace', minWidth: 16 }}>{value}</span>
    </div>
  );
}

export default function SpecCaseCoverage() {
  const [open, setOpen] = useState(false);
  const [specs, setSpecs] = useState([]);
  const [cases, setCases] = useState([]);
  const [tab, setTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState('');
  const timer = useRef(null);

  const fetchData = useCallback(async () => {
    const [spR, csR] = await Promise.allSettled([
      fetch(`${API}/v1/spec/list`).then(r => r.json()),
      fetch(`${API}/v1/cases`).then(r => r.json()),
    ]);
    if (spR.status === 'fulfilled') setSpecs(normaliseArray(spR.value));
    if (csR.status === 'fulfilled') setCases(normaliseArray(csR.value));
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(p => !p);
    window.addEventListener('jarvis:scvc-toggle', onToggle);
    return () => window.removeEventListener('jarvis:scvc-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timer.current = setInterval(fetchData, 90_000);
    return () => clearInterval(timer.current);
  }, [open, fetchData]);

  const enriched = specs.map(s => ({ ...s, _cases: correlate(s, cases) }));
  const linked = enriched.filter(s => s._cases.length > 0);
  const unlinked = enriched.filter(s => s._cases.length === 0);
  const badge = unlinked.length > 0 ? unlinked.length : null;

  const filtered = enriched.filter(s => {
    const matchTab = tab === 'ALL' || (tab === 'LINKED' && s._cases.length > 0) || (tab === 'UNLINKED' && s._cases.length === 0);
    const q = search.toLowerCase();
    const matchSearch = !q || (s.title || s.name || '').toLowerCase().includes(q) || (s.kind || '').toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const assess = async () => {
    setAssessing(true); setAssessText('');
    try {
      const script = await buildScvcScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.message || JSON.stringify(d);
      setAssessText(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch (e) {
      setAssessText('Assessment unavailable.');
    } finally {
      setAssessing(false);
    }
  };

  const TABS = ['ALL', 'LINKED', 'UNLINKED'];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Spec × Case Coverage (SCVC)"
        style={{
          position: 'fixed', left: 379200, bottom: 8, zIndex: 176,
          background: 'rgba(0,212,255,0.08)', border: `1px solid ${badge ? AM : CY}44`,
          color: badge ? AM : CY, fontFamily: 'monospace', fontSize: 10,
          padding: '3px 8px', borderRadius: 4, cursor: 'pointer', letterSpacing: 1,
          display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        ◈ SCVC
        {badge != null && (
          <span style={{
            background: AM, color: '#000', borderRadius: 8,
            fontSize: 9, padding: '0 5px', fontWeight: 700,
          }}>{badge}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', left: 379200, bottom: 48, zIndex: 176,
      width: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      background: 'rgba(8,16,28,0.97)', border: `1px solid ${CY}33`,
      borderRadius: 12, fontFamily: 'monospace', color: CY,
      boxShadow: `0 0 32px ${CY}18`,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderBottom: `1px solid ${CY}22`,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, flex: 1 }}>
          SPEC × CASE COVERAGE
        </span>
        {badge != null && (
          <span style={{ background: AM, color: '#000', borderRadius: 8, fontSize: 9, padding: '0 6px', fontWeight: 700 }}>
            {badge} UNLINKED
          </span>
        )}
        <button onClick={assess} disabled={assessing} style={{
          background: 'none', border: `1px solid ${PU}55`, color: PU,
          fontSize: 9, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', letterSpacing: 1,
        }}>
          {assessing ? '...' : '▶ ASSESS'}
        </button>
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: 'none', color: '#6E8AA0', fontSize: 14, cursor: 'pointer', padding: '0 4px',
        }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 14px' }}>
        <StatTile label="SPECS" value={specs.length} color={CY} />
        <StatTile label="CASES" value={cases.length} color={PU} />
        <StatTile label="LINKED" value={linked.length} color={GN} />
        <StatTile label="UNLINKED" value={unlinked.length} color={unlinked.length > 0 ? AM : GN} />
      </div>

      {/* Assess output */}
      {assessText && (
        <div style={{
          margin: '0 14px 6px', padding: '8px 10px', background: `${PU}11`,
          border: `1px solid ${PU}33`, borderRadius: 6, fontSize: 10, color: '#C0D4E8', lineHeight: 1.5,
        }}>{assessText}</div>
      )}

      {/* Tabs + Search */}
      <div style={{ display: 'flex', gap: 4, padding: '0 14px 6px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${CY}22` : 'none',
            border: `1px solid ${tab === t ? CY : DIM}55`,
            color: tab === t ? CY : '#6E8AA0', fontSize: 9, padding: '2px 8px',
            borderRadius: 4, cursor: 'pointer', letterSpacing: 1,
          }}>{t} {t === 'UNLINKED' && unlinked.length > 0 ? `(${unlinked.length})` : ''}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search specs…"
          style={{
            marginLeft: 'auto', background: 'rgba(0,212,255,0.05)',
            border: `1px solid ${CY}22`, color: CY, fontSize: 10,
            padding: '2px 8px', borderRadius: 4, outline: 'none', width: 130,
          }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 12px' }}>
        {filtered.length === 0 && (
          <div style={{ color: DIM, fontSize: 10, textAlign: 'center', padding: '20px 0' }}>
            No specs match current filter.
          </div>
        )}
        {filtered.map(s => {
          const isLinked = s._cases.length > 0;
          const sid = s.id || s.spec_id || JSON.stringify(s).slice(0, 16);
          const isExp = expanded === sid;
          return (
            <div key={sid} style={{
              marginBottom: 4, border: `1px solid ${isLinked ? GN : AM}22`,
              borderRadius: 6, background: `rgba(${isLinked ? '34,197,94' : '245,158,11'},0.03)`,
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : sid)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', cursor: 'pointer' }}
              >
                <span style={{ color: isLinked ? GN : AM, fontSize: 11 }}>{isLinked ? '✓' : '○'}</span>
                <span style={{ flex: 1, fontSize: 10, color: '#C0D4E8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.title || s.name || sid}
                </span>
                {s.kind && <Chip label={s.kind} color={PU} />}
                {s.status && <Chip label={s.status} color={s.status === 'approved' ? GN : s.status === 'draft' ? AM : CY} />}
                <span style={{ fontSize: 9, color: DIM }}>{age(s.created_at || s.updated_at)}</span>
                <span style={{ color: isLinked ? GN : AM, fontSize: 9 }}>
                  {isLinked ? `${s._cases.length} case${s._cases.length > 1 ? 's' : ''}` : 'NO CASES'}
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>{isExp ? '▲' : '▼'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: `1px solid ${CY}11` }}>
                  {s.description && (
                    <div style={{ fontSize: 9, color: '#6E8AA0', marginTop: 6, marginBottom: 6, lineHeight: 1.5 }}>
                      {String(s.description).slice(0, 200)}{String(s.description).length > 200 ? '…' : ''}
                    </div>
                  )}
                  {isLinked ? (
                    <div>
                      <div style={{ fontSize: 9, color: DIM, letterSpacing: 1, marginBottom: 4 }}>LINKED CASES</div>
                      {s._cases.slice(0, 5).map((c, i) => {
                        const cid = c.id || c.case_id || i;
                        const sc = STATUS_COLOR[c.status?.toLowerCase()] || DIM;
                        return (
                          <div key={cid} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '4px 0', borderBottom: `1px solid ${CY}0A`,
                          }}>
                            <Chip label={c.status || 'unknown'} color={sc} />
                            <span style={{ flex: 1, fontSize: 10, color: '#C0D4E8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.title || c.name || cid}
                            </span>
                            <div style={{ width: 80 }}>
                              <ScoreBar value={c._score || 0} max={5} color={GN} />
                            </div>
                          </div>
                        );
                      })}
                      {s._cases.length > 5 && (
                        <div style={{ fontSize: 9, color: DIM, paddingTop: 4 }}>
                          +{s._cases.length - 5} more case(s) matched
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{
                      fontSize: 10, color: AM, padding: '6px 0',
                      border: `1px solid ${AM}22`, borderRadius: 4, textAlign: 'center',
                    }}>
                      No case coverage — consider opening a case for this spec.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: '6px 14px', borderTop: `1px solid ${CY}11`,
        fontSize: 9, color: DIM, display: 'flex', justifyContent: 'space-between',
      }}>
        <span>SCVC · {filtered.length}/{specs.length} specs shown</span>
        <span>{linked.length > 0 ? `${Math.round(linked.length / Math.max(specs.length, 1) * 100)}% covered` : 'no coverage'}</span>
      </div>
    </div>
  );
}
