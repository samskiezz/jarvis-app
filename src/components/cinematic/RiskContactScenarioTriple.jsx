import { useState, useEffect, useCallback } from 'react';

const API = '';
const RCSTRI_RE = /\b(rcstri|risk[._\-\s]?contact[._\-\s]?scenario|risk[._\-\s]?contact[._\-\s]?plan|unmanaged[._\-\s]?risk|contained[._\-\s]?risk|risk[._\-\s]?accountability|risk[._\-\s]?scenario[._\-\s]?contact|risk[._\-\s]?playbook[._\-\s]?contact)\b/i;

export function isRcstriQuery(t) { return RCSTRI_RE.test(t || ''); }

export function buildRcstriScript(data) {
  if (!data) return 'Checking risk signals against contacts and scenario playbooks now.';
  const rows = data.rows || [];
  const unmanaged = rows.filter(r => r.state === 'UNMANAGED').length;
  const total = rows.length;
  const topNames = rows.filter(r => r.state === 'UNMANAGED').slice(0, 2).map(r => r.title || 'signal').join(' and ');
  if (unmanaged > 0) {
    return `RCSTRI alert: ${unmanaged} of ${total} active risk signals are UNMANAGED — no contact owner and no scenario playbook${topNames ? ': ' + topNames : ''}. Immediate assignment of a responsible contact and response scenario is required for each unmanaged risk.`;
  }
  return `RCSTRI assessment: all ${total} active risk signals have either contact accountability or scenario coverage. Review PERSON-ASSIGNED signals for missing playbooks and PLANNED signals for unassigned human owners to achieve full risk containment.`;
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(aToks, other) {
  const bToks = tokens(other);
  if (!aToks.length || !bToks.length) return 0;
  let hits = 0;
  for (const a of aToks) for (const b of bToks) {
    if (a === b || (a.length > 3 && b.startsWith(a)) || (b.length > 3 && a.startsWith(b))) hits++;
  }
  return hits / Math.max(aToks.length, bToks.length);
}

function normaliseSignals(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const arr = raw.results || raw.signals || raw.items || raw.data || [];
  return Array.isArray(arr) ? arr : [];
}

function normaliseContacts(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const arr = raw.results || raw.contacts || raw.items || raw.data || [];
  return Array.isArray(arr) ? arr : [];
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const arr = raw.results || raw.scenarios || raw.items || raw.data || [];
  return Array.isArray(arr) ? arr : [];
}

function classifySignal(sig, contacts, scenarios) {
  const sigToks = tokens(`${sig.title || ''} ${sig.name || ''} ${sig.category || ''} ${sig.description || ''} ${sig.source || ''} ${(sig.tags || []).join(' ')}`);
  const hasContact = contacts.some(c =>
    matchScore(sigToks, `${c.name || ''} ${c.company || ''} ${c.title || ''} ${c.role || ''} ${c.description || ''} ${(c.tags || []).join(' ')}`) > 0.05
  );
  const hasScenario = scenarios.some(sc =>
    matchScore(sigToks, `${sc.title || sc.name || ''} ${sc.description || ''} ${sc.category || ''} ${(sc.tags || []).join(' ')}`) > 0.05
  );
  if (hasContact && hasScenario) return 'FULLY CONTAINED';
  if (hasContact) return 'PERSON-ASSIGNED';
  if (hasScenario) return 'PLANNED';
  return 'UNMANAGED';
}

const STATE_ORDER = ['FULLY CONTAINED', 'PERSON-ASSIGNED', 'PLANNED', 'UNMANAGED'];
const STATE_COLOR = {
  'FULLY CONTAINED': '#30D158',
  'PERSON-ASSIGNED': '#FFD60A',
  'PLANNED': '#29E7FF',
  'UNMANAGED': '#FF2D55',
};

export default function RiskContactScenarioTriple() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rskR, conR, scnR] = await Promise.all([
        fetch(`${API}/entities/RiskSignal`),
        fetch(`${API}/entities/Contact`),
        fetch(`${API}/v1/scenario/list`),
      ]);
      const [rskD, conD, scnD] = await Promise.all([rskR.json(), conR.json(), scnR.json()]);
      const sigs = normaliseSignals(rskD);
      const cons = normaliseContacts(conD);
      const scns = normaliseScenarios(scnD);
      setContacts(cons);
      setScenarios(scns);
      const classified = sigs.map(s => ({
        ...s,
        state: classifySignal(s, cons, scns),
        sigToks: tokens(`${s.title || ''} ${s.name || ''} ${s.category || ''} ${s.description || ''} ${s.source || ''} ${(s.tags || []).join(' ')}`),
      }));
      classified.sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state));
      setRows(classified);
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:rcstri-toggle', onToggle);
    return () => window.removeEventListener('jarvis:rcstri-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90000);
    return () => clearInterval(id);
  }, [open, load]);

  const counts = STATE_ORDER.reduce((acc, s) => {
    acc[s] = rows.filter(r => r.state === s).length;
    return acc;
  }, {});
  const unmanagedCount = counts['UNMANAGED'];

  const displayed = rows.filter(r => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (r.title || r.name || '').toLowerCase().includes(q) ||
        (r.category || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    const unmanagedNames = rows.filter(r => r.state === 'UNMANAGED').slice(0, 3).map(r => r.title || r.name || 'signal').join(', ');
    const prompt = `RCSTRI risk containment analysis: ${rows.length} active risk signals cross-referenced against ${contacts.length} contacts and ${scenarios.length} scenario playbooks. ${unmanagedCount} UNMANAGED (no contact + no scenario)${unmanagedNames ? ': ' + unmanagedNames : ''}. Provide a 2-sentence risk containment gap brief identifying the highest-priority unmanaged signals and the recommended assignment steps.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt = (d.answer || '').replace(/<<ACTION:[^>]*>>/g, '').trim();
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch {}
    setAssessing(false);
  }

  function getMatchedContacts(row) {
    return contacts
      .map(c => ({
        c,
        score: matchScore(row.sigToks || [], `${c.name || ''} ${c.company || ''} ${c.title || ''} ${c.role || ''} ${c.description || ''} ${(c.tags || []).join(' ')}`),
      }))
      .filter(x => x.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }

  function getMatchedScenarios(row) {
    return scenarios
      .map(sc => ({
        sc,
        score: matchScore(row.sigToks || [], `${sc.title || sc.name || ''} ${sc.description || ''} ${sc.category || ''} ${(sc.tags || []).join(' ')}`),
      }))
      .filter(x => x.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', left: 769760, bottom: 8, zIndex: 403,
      width: 460,
      background: 'rgba(8,12,20,0.93)',
      border: `1px solid ${unmanagedCount > 0 ? '#FF2D5566' : '#FFFFFF22'}`,
      borderRadius: 10,
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: 11,
      color: '#DCEBF5',
      boxShadow: unmanagedCount > 0 ? '0 0 40px #FF2D5522' : '0 0 24px #00000055',
      backdropFilter: 'blur(8px)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #FFFFFF11' }}>
        <span style={{ color: '#FF2D55', fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>◈ RCSTRI</span>
        <span style={{ color: '#6E8AA0', fontSize: 9, flex: 1 }}>RISK × CONTACT × SCENARIO TRIPLE</span>
        {unmanagedCount > 0 && (
          <span style={{
            background: '#FF2D55', color: '#fff', borderRadius: 4,
            padding: '1px 6px', fontSize: 9, fontWeight: 700,
            animation: 'rcstri-pulse 1.2s ease-in-out infinite',
          }}>
            {unmanagedCount} UNMANAGED
          </span>
        )}
        {loading && <span style={{ color: '#6E8AA0', fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: 'none', color: '#6E8AA0',
          cursor: 'pointer', fontSize: 12, padding: 0,
        }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 5, padding: '6px 12px' }}>
        {STATE_ORDER.map(s => (
          <div key={s} style={{
            flex: '1 1 70px', background: 'rgba(255,255,255,0.04)',
            borderRadius: 6, padding: '4px 4px', textAlign: 'center',
            border: `1px solid ${STATE_COLOR[s]}33`,
          }}>
            <div style={{ color: STATE_COLOR[s], fontSize: 14, fontWeight: 700 }}>{counts[s] || 0}</div>
            <div style={{ color: '#6E8AA0', fontSize: 7, letterSpacing: 0.5, marginTop: 1, lineHeight: 1.2 }}>{s}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {rows.length > 0 && (
        <div style={{ padding: '0 12px 4px' }}>
          <div style={{ height: 4, borderRadius: 3, background: '#FFFFFF11', overflow: 'hidden', display: 'flex' }}>
            {STATE_ORDER.map(s => (
              <div key={s} style={{
                width: `${(counts[s] / rows.length) * 100}%`,
                background: STATE_COLOR[s],
                transition: 'width 0.4s',
              }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <span style={{ color: '#6E8AA0', fontSize: 8 }}>{rows.length} signals · {contacts.length} contacts · {scenarios.length} scenarios</span>
            <span style={{ color: counts['FULLY CONTAINED'] > 0 ? '#30D158' : '#6E8AA0', fontSize: 8 }}>
              {rows.length > 0 ? Math.round((counts['FULLY CONTAINED'] / rows.length) * 100) : 0}% contained
            </span>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 3, padding: '3px 12px', overflowX: 'auto', flexWrap: 'wrap' }}>
        {['ALL', ...STATE_ORDER].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? (STATE_COLOR[f] || '#29E7FF') + '22' : 'none',
            border: `1px solid ${filter === f ? (STATE_COLOR[f] || '#29E7FF') : '#FFFFFF22'}`,
            color: filter === f ? (STATE_COLOR[f] || '#29E7FF') : '#6E8AA0',
            borderRadius: 4, cursor: 'pointer', fontSize: 8, padding: '2px 5px', letterSpacing: 0.5,
            whiteSpace: 'nowrap',
          }}>
            {f === 'ALL' ? `ALL (${rows.length})` : `${f} (${counts[f] || 0})`}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '4px 12px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search risk signals…"
          style={{
            width: '100%', background: 'rgba(255,255,255,0.05)',
            border: '1px solid #FFFFFF22', borderRadius: 4,
            color: '#DCEBF5', fontSize: 10, padding: '3px 8px',
            boxSizing: 'border-box', outline: 'none',
          }}
        />
      </div>

      {/* Rows */}
      <div style={{ maxHeight: 260, overflowY: 'auto', padding: '4px 12px' }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: '#6E8AA0', textAlign: 'center', padding: 12, fontSize: 10 }}>
            no risk signals matched
          </div>
        )}
        {displayed.map((row, i) => {
          const isExpanded = expanded === i;
          const matchedContacts = isExpanded ? getMatchedContacts(row) : [];
          const matchedScenarios = isExpanded ? getMatchedScenarios(row) : [];
          return (
            <div
              key={i}
              onClick={() => setExpanded(isExpanded ? null : i)}
              style={{
                borderLeft: `3px solid ${STATE_COLOR[row.state]}`,
                padding: '5px 8px', marginBottom: 4, borderRadius: 4,
                background: 'rgba(255,255,255,0.03)', cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#DCEBF5', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>
                  {row.title || row.name || '(signal)'}
                </span>
                {row.severity && (
                  <span style={{
                    background: row.severity === 'CRITICAL' ? '#FF2D5533' : row.severity === 'HIGH' ? '#FF6B3533' : '#FFD60A33',
                    color: row.severity === 'CRITICAL' ? '#FF2D55' : row.severity === 'HIGH' ? '#FF6B35' : '#FFD60A',
                    borderRadius: 3, padding: '1px 4px', fontSize: 7, whiteSpace: 'nowrap',
                  }}>{row.severity}</span>
                )}
                <span style={{
                  background: STATE_COLOR[row.state] + '33',
                  color: STATE_COLOR[row.state],
                  borderRadius: 3, padding: '1px 5px', fontSize: 7, whiteSpace: 'nowrap', letterSpacing: 0.5,
                }}>{row.state}</span>
              </div>
              {isExpanded && (
                <div style={{ marginTop: 6 }}>
                  {row.category && (
                    <div style={{ color: '#8EA3B3', fontSize: 9, marginBottom: 4 }}>
                      Category: {row.category}{row.source ? ` · Source: ${row.source}` : ''}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {/* Matched contacts */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#29E7FF', fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>CONTACTS</div>
                      {matchedContacts.length === 0
                        ? <div style={{ color: '#6E8AA0', fontSize: 9 }}>no contact match</div>
                        : matchedContacts.map(({ c, score }, j) => (
                          <div key={j} style={{ marginBottom: 4 }}>
                            <div style={{ color: '#DCEBF5', fontSize: 9, marginBottom: 2 }}>
                              {c.name || '(contact)'}{c.title ? ` · ${c.title}` : ''}
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: '#29E7FF22', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(score * 400, 100)}%`, background: '#29E7FF', height: '100%' }} />
                            </div>
                          </div>
                        ))
                      }
                    </div>
                    {/* Matched scenarios */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#BF5AF2', fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>SCENARIOS</div>
                      {matchedScenarios.length === 0
                        ? <div style={{ color: '#6E8AA0', fontSize: 9 }}>no scenario match</div>
                        : matchedScenarios.map(({ sc, score }, j) => (
                          <div key={j} style={{ marginBottom: 4 }}>
                            <div style={{ color: '#DCEBF5', fontSize: 9, marginBottom: 2 }}>
                              {sc.title || sc.name || '(scenario)'}{sc.category ? ` · ${sc.category}` : ''}
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: '#BF5AF222', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(score * 400, 100)}%`, background: '#BF5AF2', height: '100%' }} />
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ASSESS button */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid #FFFFFF11' }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            width: '100%',
            background: assessing ? '#FF2D5511' : '#FF2D5522',
            border: '1px solid #FF2D5555',
            color: '#FF2D55', borderRadius: 5,
            cursor: assessing ? 'wait' : 'pointer',
            fontSize: 10, padding: '5px 0', letterSpacing: 2,
          }}
        >
          {assessing ? '◉ ASSESSING…' : '▶ ASSESS RISK CONTAINMENT'}
        </button>
      </div>

      <style>{`@keyframes rcstri-pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  );
}
