import { useState, useEffect, useCallback } from 'react';

const API = '';

const SSCSTP_RE = /\b(sscstp|system[._-]?contact[._-]?scenario|service[._-]?staffing|service[._-]?scenario|service[._-]?owner|service[._-]?coverage|service[._-]?plan|system[._-]?contact|system[._-]?scenario|system[._-]?staffed|unmanaged[._-]?service|service[._-]?response[._-]?plan|incident[._-]?staffing|service[._-]?contact[._-]?coverage|system[._-]?incident[._-]?plan)\b/i;

export function isSscstpQuery(t) {
  return SSCSTP_RE.test(t || '');
}

function normaliseServices(raw) {
  if (!raw) return [];
  const services = raw.services || raw.components || raw.checks || raw.modules || raw.items || [];
  if (Array.isArray(services) && services.length > 0) {
    return services.map((s, i) => ({
      id:     s.id || s.name || String(i),
      name:   s.name || s.service || s.component || s.module || `Service ${i + 1}`,
      status: (s.status || s.health || s.state || '').toLowerCase(),
      detail: String(s.message || s.detail || s.error || s.latency_ms || '').slice(0, 200),
    }));
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const keys = Object.keys(raw).filter(k => typeof raw[k] === 'string' || typeof raw[k] === 'object');
    if (keys.length > 0) {
      return keys.map((k, i) => {
        const v = raw[k];
        const status = typeof v === 'string' ? v : (v?.status || v?.health || '');
        const detail = typeof v === 'object' ? String(v?.message || v?.detail || JSON.stringify(v)).slice(0, 200) : '';
        return { id: k, name: k, status: status.toLowerCase(), detail };
      });
    }
  }
  return [];
}

function normaliseContacts(raw) {
  if (!raw) return [];
  const arr = ['contacts', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((c, i) => ({
    id:    c.id || String(i),
    name:  c.name || c.full_name || c.fullName || `Contact ${i + 1}`,
    title: c.title || c.role || c.position || '',
    org:   c.company || c.organisation || c.organization || c.org || '',
    desc:  String(c.description || c.bio || c.notes || c.email || '').slice(0, 200),
    tags:  Array.isArray(c.tags) ? c.tags.join(' ') : (c.tags || ''),
  }));
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  const arr = ['scenarios', 'items', 'results', 'data', 'records'].reduce(
    (a, k) => (a.length ? a : Array.isArray(raw?.[k]) ? raw[k] : []),
    Array.isArray(raw) ? raw : [],
  );
  return arr.map((s, i) => ({
    id:       s.id || String(i),
    name:     s.title || s.name || s.label || `Scenario ${i + 1}`,
    status:   (s.status || s.state || '').toLowerCase(),
    category: s.category || s.type || s.kind || '',
    desc:     String(s.description || s.objective || s.summary || '').slice(0, 200),
    tags:     Array.isArray(s.tags) ? s.tags.join(' ') : (s.tags || ''),
  }));
}

function tokens(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2);
}

function matchScore(aToks, bFields) {
  const bToks = bFields.flatMap(f => tokens(f)).filter(Boolean);
  if (!aToks.size || !bToks.length) return 0;
  let hits = 0;
  for (const t of bToks) if (aToks.has(t)) hits++;
  return hits / Math.max(aToks.size, bToks.length);
}

function correlate(services, contacts, scenarios) {
  return services.map(svc => {
    const toks = new Set([...tokens(svc.name), ...tokens(svc.detail)].filter(Boolean));

    const matchedContacts = contacts
      .map(c => ({ ...c, _score: matchScore(toks, [c.name, c.title, c.org, c.desc, c.tags]) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

    const matchedScenarios = scenarios
      .map(s => ({ ...s, _score: matchScore(toks, [s.name, s.category, s.desc, s.tags]) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

    const hasContact  = matchedContacts.length > 0;
    const hasScenario = matchedScenarios.length > 0;

    let coverage;
    if (hasContact && hasScenario)   coverage = 'FULLY MANAGED';
    else if (hasContact)             coverage = 'STAFFED';
    else if (hasScenario)            coverage = 'SCRIPTED';
    else                             coverage = 'UNMANAGED';

    return { ...svc, _contacts: matchedContacts, _scenarios: matchedScenarios, _coverage: coverage };
  });
}

export async function buildSscstpScript() {
  const [svcR, conR, scnR] = await Promise.allSettled([
    fetch(`${API}/v1/jarvis/system/status`).then(r => r.json()),
    fetch(`${API}/entities/Contact`).then(r => r.json()),
    fetch(`${API}/v1/scenario/list`).then(r => r.json()),
  ]);
  const services  = normaliseServices(svcR.status === 'fulfilled' ? svcR.value : {});
  const contacts  = normaliseContacts(conR.status === 'fulfilled' ? conR.value : []);
  const scenarios = normaliseScenarios(scnR.status === 'fulfilled' ? scnR.value : []);
  const enriched  = correlate(services, contacts, scenarios);

  const fm  = enriched.filter(e => e._coverage === 'FULLY MANAGED').length;
  const st  = enriched.filter(e => e._coverage === 'STAFFED').length;
  const sc  = enriched.filter(e => e._coverage === 'SCRIPTED').length;
  const um  = enriched.filter(e => e._coverage === 'UNMANAGED').length;

  return (
    `System Status × Contact × Scenario Triple Coverage: ${services.length} services cross-referenced ` +
    `against ${contacts.length} contacts and ${scenarios.length} scenarios. ` +
    `${fm} FULLY MANAGED (contact owner + scenario plan); ${st} STAFFED (contact found, no scenario plan); ` +
    `${sc} SCRIPTED (scenario exists, no contact owner); ${um} UNMANAGED (no people or incident plan). ` +
    `Priority: ${enriched.filter(e => e._coverage === 'UNMANAGED').map(e => e.name).slice(0, 3).join(', ') || 'none unmanaged'}.`
  );
}

const PANEL_W = 760;
const PANEL_H = 660;
const RD = '#EF4444';
const AM = '#F59E0B';
const CY = '#00CFFF';
const GR = '#22C55E';
const LM = '#84CC16';

const COVERAGE_COLOR = {
  'FULLY MANAGED': GR,
  'STAFFED':       CY,
  'SCRIPTED':      AM,
  'UNMANAGED':     RD,
};

const chip = (label, color = CY) => (
  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: color + '22', color, border: `1px solid ${color}55`, marginLeft: 4, whiteSpace: 'nowrap' }}>
    {label}
  </span>
);

const ScoreBar = ({ score, color }) => (
  <div style={{ height: 3, width: '100%', background: '#1a1a2a', borderRadius: 2, marginTop: 2 }}>
    <div style={{ height: 3, width: `${Math.round(score * 100)}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
  </div>
);

const TABS = ['ALL', 'FULLY MANAGED', 'STAFFED', 'SCRIPTED', 'UNMANAGED'];

export default function SystemContactScenarioTriple() {
  const [open, setOpen]             = useState(false);
  const [services, setServices]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState('');
  const [err, setErr]               = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [svcR, conR, scnR] = await Promise.allSettled([
        fetch(`${API}/v1/jarvis/system/status`).then(r => r.json()),
        fetch(`${API}/entities/Contact`).then(r => r.json()),
        fetch(`${API}/v1/scenario/list`).then(r => r.json()),
      ]);
      const rawSvc = normaliseServices(svcR.status === 'fulfilled' ? svcR.value : {});
      const rawCon = normaliseContacts(conR.status === 'fulfilled' ? conR.value : []);
      const rawScn = normaliseScenarios(scnR.status === 'fulfilled' ? scnR.value : []);
      setServices(correlate(rawSvc, rawCon, rawScn));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:sscstp-toggle', toggle);
    return () => window.removeEventListener('jarvis:sscstp-toggle', toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessText('');
    try {
      const brief = await buildSscstpScript();
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `System service staffing and incident-plan assessment: ${brief}. Give a 2-sentence brief on which unmanaged services are highest priority and what action is needed.` }),
      });
      const d = await r.json();
      const msg = d.response || d.message || d.content || brief;
      setAssessText(msg);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: msg } }));
    } catch (e) {
      setAssessText(String(e));
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    const unmanagedCount = services.filter(s => s._coverage === 'UNMANAGED').length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="System Status × Contact × Scenario Triple Coverage (SSCSTP)"
        style={{
          position: 'fixed', left: 740080, bottom: 8, zIndex: 350,
          background: unmanagedCount > 0 ? '#EF444422' : '#0a0a1a',
          border: `1px solid ${unmanagedCount > 0 ? RD : CY + '44'}`,
          color: unmanagedCount > 0 ? RD : CY, borderRadius: 4,
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace',
        }}
      >
        ◈ SSCSTP{unmanagedCount > 0 ? ` ⚠${unmanagedCount}` : ''}
      </button>
    );
  }

  const fm = services.filter(s => s._coverage === 'FULLY MANAGED').length;
  const st = services.filter(s => s._coverage === 'STAFFED').length;
  const sc = services.filter(s => s._coverage === 'SCRIPTED').length;
  const um = services.filter(s => s._coverage === 'UNMANAGED').length;

  const visible = services.filter(s =>
    (tab === 'ALL' || s._coverage === tab) &&
    (!search || s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.detail.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      position: 'fixed', right: 16, top: 16, width: PANEL_W, maxHeight: PANEL_H,
      background: '#04040e', border: '1px solid #EF444433', borderRadius: 8,
      zIndex: 6002, display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
      overflow: 'hidden', boxShadow: '0 0 24px #EF444418',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #EF444422', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: RD, fontWeight: 700, fontSize: 11 }}>◈ SYSTEM × CONTACT × SCENARIO TRIPLE COVERAGE</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#888' }}>SSCSTP</span>
        {um > 0 && <span style={{ fontSize: 10, color: RD, background: '#EF444422', border: '1px solid #EF444455', borderRadius: 3, padding: '1px 5px' }}>⚠ {um} UNMANAGED</span>}
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer', padding: 0 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          ['SERVICES',       services.length, CY],
          ['FULLY MANAGED',  fm,              GR],
          ['STAFFED',        st,              CY],
          ['SCRIPTED',       sc,              AM],
          ['UNMANAGED',      um,              RD],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: '#0c0c1e', border: `1px solid ${color}33`, borderRadius: 4, padding: '4px 10px', minWidth: 80, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 8, color: '#666', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
        <button
          onClick={assess}
          disabled={assessing}
          style={{ marginLeft: 'auto', background: assessing ? '#111' : '#0a1a0a', border: `1px solid ${GR}55`, color: GR, borderRadius: 4, padding: '4px 12px', fontSize: 10, cursor: assessing ? 'default' : 'pointer', fontFamily: 'monospace' }}
        >
          {assessing ? '…' : '▶ ASSESS'}
        </button>
      </div>

      {assessText && (
        <div style={{ margin: '0 12px 8px', padding: '6px 10px', background: '#0a0a0a', border: `1px solid ${GR}33`, borderRadius: 4, fontSize: 10, color: '#aaa', lineHeight: 1.5, flexShrink: 0 }}>
          {assessText}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, padding: '0 12px 6px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? (COVERAGE_COLOR[t] || CY) + '22' : 'transparent',
            border: `1px solid ${tab === t ? (COVERAGE_COLOR[t] || CY) : '#333'}`,
            color: tab === t ? (COVERAGE_COLOR[t] || CY) : '#666',
            borderRadius: 3, padding: '2px 8px', fontSize: 9, cursor: 'pointer', fontFamily: 'monospace',
          }}>{t}</button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search services…"
          style={{ marginLeft: 'auto', background: '#0c0c1e', border: '1px solid #333', color: '#aaa', borderRadius: 3, padding: '2px 8px', fontSize: 10, fontFamily: 'monospace', width: 160 }}
        />
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: '0 12px 12px' }}>
        {loading && <div style={{ color: '#444', fontSize: 10, padding: 12 }}>loading…</div>}
        {err && <div style={{ color: RD, fontSize: 10, padding: 8 }}>error: {err}</div>}
        {!loading && visible.length === 0 && <div style={{ color: '#444', fontSize: 10, padding: 12 }}>no services match</div>}
        {visible.map(svc => {
          const col  = COVERAGE_COLOR[svc._coverage] || CY;
          const isExp = expanded === svc.id;
          return (
            <div key={svc.id} style={{ marginBottom: 4, background: '#0c0c1e', border: `1px solid ${col}33`, borderRadius: 5 }}>
              <div
                onClick={() => setExpanded(isExp ? null : svc.id)}
                style={{ padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span style={{ fontSize: 10, color: col, fontWeight: 700, minWidth: 110 }}>{svc._coverage}</span>
                <span style={{ fontSize: 11, color: '#ccc', flex: 1 }}>{svc.name}</span>
                {chip(svc.status || 'unknown', svc.status && ['ok','up','online','healthy','running','active','green'].some(g => svc.status.includes(g)) ? GR : AM)}
                {svc._contacts.length > 0  && chip(`${svc._contacts.length} contact${svc._contacts.length > 1 ? 's' : ''}`, CY)}
                {svc._scenarios.length > 0 && chip(`${svc._scenarios.length} scenario${svc._scenarios.length > 1 ? 's' : ''}`, LM)}
                <span style={{ fontSize: 10, color: '#444' }}>{isExp ? '▾' : '▸'}</span>
              </div>
              {isExp && (
                <div style={{ padding: '0 10px 10px', borderTop: `1px solid ${col}22` }}>
                  {svc.detail && (
                    <div style={{ fontSize: 9, color: '#777', marginBottom: 8, marginTop: 6 }}>{svc.detail}</div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 9, color: CY, letterSpacing: 1, marginBottom: 4 }}>CONTACTS</div>
                      {svc._contacts.length === 0
                        ? <div style={{ fontSize: 9, color: '#444', fontStyle: 'italic' }}>no matched contacts</div>
                        : svc._contacts.map(c => (
                          <div key={c.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 10, color: CY }}>{c.name}</span>
                              {c.title && chip(c.title, '#60A5FA')}
                              {c.org   && chip(c.org,   '#818CF8')}
                            </div>
                            <ScoreBar score={c._score} color={CY} />
                          </div>
                        ))
                      }
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: LM, letterSpacing: 1, marginBottom: 4 }}>SCENARIOS</div>
                      {svc._scenarios.length === 0
                        ? <div style={{ fontSize: 9, color: '#444', fontStyle: 'italic' }}>no matched scenarios</div>
                        : svc._scenarios.map(s => (
                          <div key={s.id} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 10, color: LM }}>{s.name}</span>
                              {s.status   && chip(s.status,   AM)}
                              {s.category && chip(s.category, '#A78BFA')}
                            </div>
                            <ScoreBar score={s._score} color={LM} />
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

      <div style={{ padding: '6px 12px', borderTop: '1px solid #1a1a2a', fontSize: 9, color: '#555', flexShrink: 0 }}>
        /v1/jarvis/system/status × /entities/Contact × /v1/scenario/list · 90s auto-refresh
      </div>
    </div>
  );
}
