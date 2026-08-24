import { useState, useEffect, useCallback } from 'react';

const API = '';
const POLP_RE = /\b(policy(?:[._-]?decision)?|pdp|abac|clearance[._-]?policy|classify[._-]?object|policy[._-]?check|decide[._-]?access|polp|policy[._-]?enforcement|permission[._-]?decision|access[._-]?decision|security[._-]?policy|label[._-]?policy|access[._-]?control[._-]?policy|policy[._-]?point)\b/i;

export function isPolpQuery(t) {
  return POLP_RE.test(t || '');
}

export async function buildPolpScript() {
  try {
    const r = await fetch(`${API}/v1/jarvis/policy/summary`);
    const d = await r.json();
    const levels = d.levels ?? [];
    const subjects = d.subject_count ?? d.subjects ?? 0;
    const labels = d.label_count ?? d.labels ?? 0;
    return (
      `Policy Decision Point: ${levels.length} clearance levels active (${levels.join(', ') || 'none'}). ` +
      `${subjects} subjects registered, ${labels} object labels in the policy store. ` +
      `PDP is ${d.implemented ? 'implemented and enforcing' : 'available but not fully enforced'}.`
    );
  } catch {
    return 'Policy Decision Point: summary unavailable — check /v1/jarvis/policy/summary.';
  }
}

const PANEL_W = 600;
const PANEL_H = 580;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const RD = '#EF4444';
const PU = '#A78BFA';

const chip = (label, color = CY) => (
  <span style={{
    display: 'inline-block', padding: '1px 7px', borderRadius: 4,
    border: `1px solid ${color}44`, background: `${color}14`,
    color, fontSize: 10, letterSpacing: 1, marginRight: 4, marginBottom: 2,
  }}>{label}</span>
);

const fieldStyle = {
  background: 'rgba(255,255,255,0.03)', border: '1px solid #2a3a4a',
  borderRadius: 4, color: '#DCEBF5', padding: '4px 8px', fontSize: 10, outline: 'none',
  fontFamily: "'JetBrains Mono',monospace", width: '100%', boxSizing: 'border-box',
};

const btnStyle = (col = CY, disabled = false) => ({
  padding: '3px 12px', borderRadius: 3, border: `1px solid ${col}55`,
  background: 'transparent', color: disabled ? '#6E8AA0' : col,
  cursor: disabled ? 'default' : 'pointer', fontSize: 9, letterSpacing: 1,
});

const LEVELS_ORDER = ['TOP SECRET', 'SECRET', 'CONFIDENTIAL', 'OFFICIAL', 'UNCLASSIFIED'];
const LEVEL_COLOR = {
  'TOP SECRET': RD,
  'SECRET': '#F97316',
  'CONFIDENTIAL': AM,
  'OFFICIAL': CY,
  'UNCLASSIFIED': GR,
};

export default function PolicyDecisionPanel() {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('SUMMARY');
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState('');

  // DECIDE tab state
  const [dSubject, setDSubject] = useState('operator');
  const [dAction, setDAction] = useState('read');
  const [dResource, setDResource] = useState('');
  const [dProp, setDProp] = useState('');
  const [dPurpose, setDPurpose] = useState('');
  const [dResult, setDResult] = useState(null);
  const [dRunning, setDRunning] = useState(false);

  // CLASSIFY tab state
  const [cResource, setCResource] = useState('');
  const [cProp, setCProp] = useState('');
  const [cLevel, setCLevel] = useState('OFFICIAL');
  const [cCompartment, setCCompartment] = useState('');
  const [cPurpose, setCPurpose] = useState('');
  const [cResult, setCResult] = useState(null);
  const [cRunning, setCRunning] = useState(false);

  // VIEW tab state
  const [vObject, setVObject] = useState('');
  const [vSubject, setVSubject] = useState('operator');
  const [vPurpose, setVPurpose] = useState('');
  const [vResult, setVResult] = useState(null);
  const [vRunning, setVRunning] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/v1/jarvis/policy/summary`);
      setSummary(await r.json());
    } catch { /* silently skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener('jarvis:polp-toggle', onToggle);
    return () => window.removeEventListener('jarvis:polp-toggle', onToggle);
  }, []);

  useEffect(() => {
    let timer;
    if (open) {
      loadSummary();
      timer = setInterval(loadSummary, 90000);
    }
    return () => clearInterval(timer);
  }, [open, loadSummary]);

  const levels = summary?.levels ?? [];
  const subjectCount = summary?.subject_count ?? summary?.subjects ?? 0;
  const labelCount = summary?.label_count ?? summary?.labels ?? 0;
  const implemented = summary?.implemented ?? false;
  const badgeColor = implemented ? GR : (summary ? AM : '#6E8AA0');

  async function decide() {
    if (!dResource) return;
    setDRunning(true);
    setDResult(null);
    try {
      const r = await fetch(`${API}/v1/jarvis/policy/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          subject_id: dSubject,
          action: dAction,
          resource_id: dResource,
          prop: dProp,
          purpose: dPurpose,
        }),
      });
      setDResult(await r.json());
    } catch (e) {
      setDResult({ error: String(e) });
    }
    setDRunning(false);
  }

  async function classify() {
    if (!cResource) return;
    setCRunning(true);
    setCResult(null);
    try {
      const r = await fetch(`${API}/v1/jarvis/policy/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          resource_id: cResource,
          prop: cProp,
          level: cLevel,
          compartment: cCompartment,
          purpose: cPurpose,
        }),
      });
      setCResult(await r.json());
    } catch (e) {
      setCResult({ error: String(e) });
    }
    setCRunning(false);
  }

  async function viewObject() {
    if (!vObject) return;
    setVRunning(true);
    setVResult(null);
    try {
      const params = new URLSearchParams({ subject_id: vSubject });
      if (vPurpose) params.append('purpose', vPurpose);
      const r = await fetch(`${API}/v1/jarvis/policy/view/${encodeURIComponent(vObject)}?${params}`);
      setVResult(await r.json());
    } catch (e) {
      setVResult({ error: String(e) });
    }
    setVRunning(false);
  }

  async function assess() {
    setAssessing(true);
    setBrief('');
    try {
      const lvls = levels.join(', ') || 'none';
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message: `Policy Decision Point summary: ${levels.length} clearance levels (${lvls}), ${subjectCount} subjects, ${labelCount} object labels. System is ${implemented ? 'enforcing' : 'not fully enforced'}. Give a 2-sentence policy compliance brief.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const TABS = ['SUMMARY', 'DECIDE', 'CLASSIFY', 'VIEW'];

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Policy Decision Point Panel (POLP)"
        style={{
          position: 'fixed', left: 525120, bottom: 8, zIndex: 208,
          width: 58, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ◈ POLP
        {summary && (
          <span style={{
            background: badgeColor, color: '#04060A', borderRadius: 3, padding: '0 4px',
            fontSize: 8, fontWeight: 700, minWidth: 14, textAlign: 'center',
          }}>{levels.length}</span>
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
              ◈ POLICY DECISION POINT
            </span>
            {implemented && chip('ENFORCING', GR)}
            {!implemented && summary && chip('PARTIAL', AM)}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: '#6E8AA0', fontSize: 10 }}>loading…</span>}
              <button onClick={assess} disabled={assessing} style={btnStyle(CY, assessing)}>
                {assessing ? 'assessing…' : '▶ ASSESS'}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: '#6E8AA0', cursor: 'pointer', fontSize: 14, padding: 0 }}
              >✕</button>
            </span>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'LEVELS', val: levels.length, col: CY },
              { label: 'SUBJECTS', val: subjectCount, col: PU },
              { label: 'LABELS', val: labelCount, col: AM },
              { label: 'STATUS', val: implemented ? 'ON' : 'OFF', col: implemented ? GR : RD },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '6px 8px', textAlign: 'center',
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0 }}>
            {TABS.map(t => (
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
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>

            {/* SUMMARY tab */}
            {tab === 'SUMMARY' && (
              <>
                {!summary && !loading && (
                  <div style={{ color: '#6E8AA0', fontSize: 11, textAlign: 'center', paddingTop: 40 }}>
                    No policy data. Is /v1/jarvis/policy mounted?
                  </div>
                )}
                {summary && (
                  <>
                    <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                      CLEARANCE LEVELS
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                      {LEVELS_ORDER.filter(l => levels.includes(l)).map(l => (
                        <span key={l} style={{
                          padding: '3px 10px', borderRadius: 4,
                          border: `1px solid ${(LEVEL_COLOR[l] || CY)}55`,
                          background: `${(LEVEL_COLOR[l] || CY)}14`,
                          color: LEVEL_COLOR[l] || CY, fontSize: 10, letterSpacing: 1,
                        }}>{l}</span>
                      ))}
                      {levels.filter(l => !LEVELS_ORDER.includes(l)).map(l => (
                        <span key={l} style={{
                          padding: '3px 10px', borderRadius: 4,
                          border: `1px solid ${CY}55`, background: `${CY}14`,
                          color: CY, fontSize: 10, letterSpacing: 1,
                        }}>{l}</span>
                      ))}
                      {levels.length === 0 && (
                        <span style={{ color: '#6E8AA0', fontSize: 11 }}>No levels loaded yet.</span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {Object.entries(summary)
                        .filter(([k]) => !['levels', 'implemented'].includes(k))
                        .map(([k, v]) => (
                          <div key={k} style={{
                            background: 'rgba(255,255,255,0.02)', border: '1px solid #1e2d3d',
                            borderRadius: 5, padding: '6px 10px',
                          }}>
                            <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1 }}>
                              {k.replace(/_/g, ' ').toUpperCase()}
                            </div>
                            <div style={{ color: '#DCEBF5', fontSize: 13, marginTop: 2 }}>
                              {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                            </div>
                          </div>
                        ))}
                    </div>
                  </>
                )}
              </>
            )}

            {/* DECIDE tab */}
            {tab === 'DECIDE' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 2 }}>
                  RUNTIME ACCESS DECISION (PDP)
                </div>
                {[
                  { label: 'Subject ID', val: dSubject, set: setDSubject },
                  { label: 'Action', val: dAction, set: setDAction, placeholder: 'read / write / delete' },
                  { label: 'Resource ID', val: dResource, set: setDResource, required: true },
                  { label: 'Property (optional)', val: dProp, set: setDProp },
                  { label: 'Purpose (optional)', val: dPurpose, set: setDPurpose },
                ].map(({ label, val, set, required, placeholder }) => (
                  <div key={label}>
                    <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>
                      {label}{required ? ' *' : ''}
                    </div>
                    <input
                      value={val}
                      onChange={e => set(e.target.value)}
                      placeholder={placeholder || label}
                      style={fieldStyle}
                    />
                  </div>
                ))}
                <button
                  onClick={decide}
                  disabled={dRunning || !dResource}
                  style={{ ...btnStyle(CY, dRunning || !dResource), alignSelf: 'flex-start', marginTop: 4 }}
                >
                  {dRunning ? 'deciding…' : '▶ DECIDE'}
                </button>
                {dResult && (
                  <div style={{
                    padding: '10px 12px', borderRadius: 6, marginTop: 4,
                    background: dResult.error
                      ? `${RD}0d`
                      : dResult.permitted
                        ? `${GR}0d`
                        : `${RD}0d`,
                    border: `1px solid ${dResult.error ? RD : dResult.permitted ? GR : RD}33`,
                  }}>
                    {dResult.error ? (
                      <span style={{ color: RD, fontSize: 11 }}>Error: {dResult.error}</span>
                    ) : (
                      <>
                        <div style={{
                          color: dResult.permitted ? GR : RD,
                          fontSize: 14, fontWeight: 700, letterSpacing: 2, marginBottom: 6,
                        }}>
                          {dResult.permitted ? '✓ PERMITTED' : '✗ DENIED'}
                        </div>
                        {dResult.reason && (
                          <div style={{ color: '#DCEBF5', fontSize: 11 }}>
                            <span style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1 }}>REASON: </span>
                            {dResult.reason}
                          </div>
                        )}
                        {dResult.level && (
                          <div style={{ marginTop: 4 }}>
                            {chip(dResult.level, LEVEL_COLOR[dResult.level] || AM)}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* CLASSIFY tab */}
            {tab === 'CLASSIFY' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 2 }}>
                  CLASSIFY OBJECT OR PROPERTY
                </div>
                {[
                  { label: 'Resource ID', val: cResource, set: setCResource, required: true },
                  { label: 'Property (leave blank for whole object)', val: cProp, set: setCProp },
                  { label: 'Compartment (optional)', val: cCompartment, set: setCCompartment },
                  { label: 'Purpose (optional)', val: cPurpose, set: setCPurpose },
                ].map(({ label, val, set, required }) => (
                  <div key={label}>
                    <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>
                      {label}{required ? ' *' : ''}
                    </div>
                    <input value={val} onChange={e => set(e.target.value)} placeholder={label} style={fieldStyle} />
                  </div>
                ))}
                <div>
                  <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>LEVEL *</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {LEVELS_ORDER.map(l => (
                      <button
                        key={l}
                        onClick={() => setCLevel(l)}
                        style={{
                          padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                          border: `1px solid ${cLevel === l ? (LEVEL_COLOR[l] || CY) : '#2a3a4a'}`,
                          background: cLevel === l ? `${(LEVEL_COLOR[l] || CY)}22` : 'transparent',
                          color: cLevel === l ? (LEVEL_COLOR[l] || CY) : '#6E8AA0',
                        }}
                      >{l}</button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={classify}
                  disabled={cRunning || !cResource}
                  style={{ ...btnStyle(AM, cRunning || !cResource), alignSelf: 'flex-start', marginTop: 4 }}
                >
                  {cRunning ? 'classifying…' : '◆ CLASSIFY'}
                </button>
                {cResult && (
                  <div style={{
                    padding: '10px 12px', borderRadius: 6, marginTop: 4,
                    background: cResult.error ? `${RD}0d` : `${AM}0d`,
                    border: `1px solid ${cResult.error ? RD : AM}33`,
                  }}>
                    {cResult.error
                      ? <span style={{ color: RD, fontSize: 11 }}>Error: {cResult.error}</span>
                      : <pre style={{ color: '#DCEBF5', fontSize: 10, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {JSON.stringify(cResult, null, 2)}
                        </pre>
                    }
                  </div>
                )}
              </div>
            )}

            {/* VIEW tab */}
            {tab === 'VIEW' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 2 }}>
                  POLICY-FILTERED OBJECT VIEW
                </div>
                {[
                  { label: 'Object ID', val: vObject, set: setVObject, required: true },
                  { label: 'Subject ID (your identity)', val: vSubject, set: setVSubject },
                  { label: 'Purpose (optional)', val: vPurpose, set: setVPurpose },
                ].map(({ label, val, set, required }) => (
                  <div key={label}>
                    <div style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>
                      {label}{required ? ' *' : ''}
                    </div>
                    <input value={val} onChange={e => set(e.target.value)} placeholder={label} style={fieldStyle} />
                  </div>
                ))}
                <button
                  onClick={viewObject}
                  disabled={vRunning || !vObject}
                  style={{ ...btnStyle(PU, vRunning || !vObject), alignSelf: 'flex-start', marginTop: 4 }}
                >
                  {vRunning ? 'loading…' : '⊛ VIEW'}
                </button>
                {vResult && (
                  <div style={{
                    padding: '10px 12px', borderRadius: 6, marginTop: 4,
                    background: vResult.error ? `${RD}0d` : `${PU}0d`,
                    border: `1px solid ${vResult.error ? RD : PU}33`,
                  }}>
                    {vResult.error
                      ? <span style={{ color: RD, fontSize: 11 }}>Error: {vResult.error}</span>
                      : (
                        <>
                          {vResult.label && (
                            <div style={{ marginBottom: 6 }}>
                              {chip(vResult.label, LEVEL_COLOR[vResult.label] || AM)}
                            </div>
                          )}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {Object.entries(vResult.props ?? vResult.properties ?? vResult).map(([k, v]) => {
                              if (k === 'label') return null;
                              const redacted = v === null || v === '[REDACTED]';
                              return (
                                <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                                  <span style={{ color: '#6E8AA0', fontSize: 9, letterSpacing: 1, minWidth: 120, flexShrink: 0 }}>
                                    {String(k).replace(/_/g, ' ').toUpperCase()}
                                  </span>
                                  <span style={{ color: redacted ? RD : '#DCEBF5', fontSize: 10, flex: 1 }}>
                                    {redacted ? '[REDACTED]' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )
                    }
                  </div>
                )}
              </div>
            )}

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
