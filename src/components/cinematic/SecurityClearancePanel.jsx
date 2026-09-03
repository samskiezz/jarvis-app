import { useState, useEffect, useCallback, useRef } from 'react';

const API = '';
const SCLR_RE = /\b(security[._-]?clearance|acl|who[._-]?am[._-]?i|my[._-]?role|audit[._-]?chain|compliance[._-]?status|sclr|clearance[._-]?level|access[._-]?control|permission[._-]?check|security[._-]?audit|security[._-]?panel|data[._-]?classif|mark[._-]?clearance)\b/i;

export function isSclrQuery(t) {
  return SCLR_RE.test(t || '');
}

export async function buildSclrScript() {
  const [aclR, compR] = await Promise.allSettled([
    fetch(`${API}/v1/security/acl`).then(r => r.json()),
    fetch(`${API}/v1/security/compliance/status`).then(r => r.json()),
  ]);
  const acl = aclR.status === 'fulfilled' ? aclR.value : {};
  const comp = compR.status === 'fulfilled' ? compR.value : {};
  const role = acl.role || 'unknown';
  const clearanceLevels = (acl.clearance || []).length;
  const overall = comp.overall || 'unknown';
  const chainLen = comp.audit?.chain_length || 0;
  const chainOk = comp.audit?.chain_integrity ?? false;
  return `Security Clearance: caller role is "${role}" with ${clearanceLevels} clearance level(s). ` +
    `Audit chain has ${chainLen} entries — integrity ${chainOk ? 'VERIFIED' : 'BROKEN'}. ` +
    `Compliance posture: ${overall}. ${!chainOk ? 'WARNING: audit chain integrity failure detected.' : 'All security planes nominal.'}`;
}

const CY = '#00D4FF';
const GN = '#22C55E';
const AM = '#F59E0B';
const RD = '#F43F5E';
const DIM = '#3A4A5A';

const MARK_COLORS = {
  PUBLIC: GN, INTERNAL: CY, FINANCIAL: AM, PII: '#A855F7', RESTRICTED: RD,
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

function CheckMark({ ok }) {
  return <span style={{ color: ok ? GN : RD, fontWeight: 700 }}>{ok ? '✓' : '✗'}</span>;
}

export default function SecurityClearancePanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('ACL');
  const [acl, setAcl] = useState(null);
  const [comp, setComp] = useState(null);
  const [audit, setAudit] = useState(null);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // ACL check form
  const [checkAction, setCheckAction] = useState('read');
  const [checkResource, setCheckResource] = useState('');
  const [checkMark, setCheckMark] = useState('PUBLIC');
  const [checkResult, setCheckResult] = useState(null);
  const [checking, setChecking] = useState(false);

  // Assess
  const [assessing, setAssessing] = useState(false);

  const aclTimer = useRef(null);
  const compTimer = useRef(null);

  const fetchAcl = useCallback(async () => {
    try {
      const r = await fetch(`${API}/v1/security/acl`);
      if (r.ok) setAcl(await r.json());
    } catch { /* silent */ }
  }, []);

  const fetchComp = useCallback(async () => {
    try {
      const r = await fetch(`${API}/v1/security/compliance/status`);
      if (r.ok) setComp(await r.json());
    } catch { /* silent */ }
  }, []);

  const fetchAudit = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const r = await fetch(`${API}/v1/security/audit?n=50`);
      if (r.ok) setAudit(await r.json());
    } catch { /* silent */ }
    setLoadingAudit(false);
  }, []);

  useEffect(() => {
    fetchAcl();
    fetchComp();
    aclTimer.current = setInterval(fetchAcl, 60_000);
    compTimer.current = setInterval(fetchComp, 120_000);
    return () => {
      clearInterval(aclTimer.current);
      clearInterval(compTimer.current);
    };
  }, [fetchAcl, fetchComp]);

  useEffect(() => {
    if (open && tab === 'AUDIT' && !audit) fetchAudit();
  }, [open, tab, audit, fetchAudit]);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener('jarvis:sclr-toggle', toggle);
    return () => window.removeEventListener('jarvis:sclr-toggle', toggle);
  }, []);

  async function runCheck() {
    if (!checkResource.trim()) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const r = await fetch(`${API}/v1/security/acl/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: checkAction, resource: checkResource.trim(), mark: checkMark }),
      });
      if (r.ok) setCheckResult(await r.json());
    } catch { /* silent */ }
    setChecking(false);
  }

  async function assess() {
    setAssessing(true);
    const script = await buildSclrScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: script } }));
  }

  // badge colour
  const chainOk = comp?.audit?.chain_integrity ?? null;
  const overall = comp?.overall;
  const badgeColor = chainOk === false ? RD : overall === 'partial' ? AM : chainOk ? GN : DIM;

  const role = acl?.role || '—';
  const clearanceLevels = acl?.clearance?.length ?? 0;
  const chainLen = comp?.audit?.chain_length ?? '—';

  // merged audit items for AUDIT tab
  const auditItems = audit ? [
    ...(audit.audit_chain?.items || []).map(i => ({ ...i, _src: 'audit' })),
    ...(audit.revdb?.items || []).map(i => ({
      actor: i.author || '—', action: 'revdb.commit',
      resource: i.id || '', timestamp: i.timestamp, _src: 'revdb', ...i,
    })),
  ].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)) : [];

  const MARKS = ['PUBLIC', 'INTERNAL', 'FINANCIAL', 'PII', 'RESTRICTED'];
  const TABS = ['ACL', 'COMPLIANCE', 'AUDIT', 'CHECK'];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Security Clearance Panel"
        style={{
          position: 'fixed', left: 370080, bottom: 8, zIndex: 174,
          background: 'rgba(5,8,13,0.82)', border: `1px solid ${badgeColor}55`,
          color: badgeColor, borderRadius: 6, padding: '3px 9px', fontSize: 11,
          letterSpacing: 2, cursor: 'pointer', backdropFilter: 'blur(6px)',
          boxShadow: `0 0 12px ${badgeColor}22`,
          fontFamily: "'JetBrains Mono',monospace",
        }}
      >
        ◈ SCLR{clearanceLevels > 0 && (
          <span style={{
            marginLeft: 5, fontSize: 10, background: badgeColor, color: '#04060A',
            borderRadius: 10, padding: '0 5px', fontWeight: 700,
          }}>{clearanceLevels}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', left: 370080, bottom: 48, zIndex: 174,
      width: 420, maxHeight: '74vh',
      background: 'rgba(6,10,16,0.96)', border: `1px solid ${CY}33`,
      borderRadius: 12, display: 'flex', flexDirection: 'column',
      backdropFilter: 'blur(14px)', boxShadow: `0 0 40px ${CY}18`,
      fontFamily: "'JetBrains Mono',monospace", color: '#DCEBF5', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 0',
        borderBottom: `1px solid ${CY}22`, paddingBottom: 8,
      }}>
        <span style={{ color: CY, fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>◈ SECURITY CLEARANCE</span>
        <Chip label={role.toUpperCase()} color={role === 'admin' ? RD : role === 'analyst' ? AM : GN} />
        <Chip label={overall?.toUpperCase() || '—'} color={badgeColor} />
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
        <StatTile label="ROLE" value={role.slice(0, 8)} color={role === 'admin' ? RD : CY} />
        <StatTile label="CLEARANCE" value={clearanceLevels} color={GN} />
        <StatTile label="CHAIN LEN" value={chainLen} color={chainOk ? GN : RD} />
        <StatTile label="OVERALL" value={overall?.slice(0, 6) || '—'} color={badgeColor} />
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${CY}22`, padding: '0 14px' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); if (t === 'AUDIT' && !audit) fetchAudit(); }} style={{
            fontSize: 10, letterSpacing: 1, padding: '4px 10px',
            color: tab === t ? CY : '#6E8AA0',
            background: 'none', border: 'none',
            borderBottom: tab === t ? `2px solid ${CY}` : '2px solid transparent',
            cursor: 'pointer',
          }}>{t}</button>
        ))}
      </div>

      {/* body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>

        {tab === 'ACL' && (
          <div>
            <div style={{ fontSize: 11, color: '#6E8AA0', marginBottom: 8 }}>
              Principal: <span style={{ color: CY }}>{acl?.principal || '—'}</span>
              &nbsp;·&nbsp;Tenant: <span style={{ color: CY }}>{acl?.tenant_id || '—'}</span>
            </div>
            <div style={{ fontSize: 11, color: '#6E8AA0', marginBottom: 6 }}>Clearance marks:</div>
            {(acl?.clearance || []).length === 0
              ? <div style={{ color: DIM, fontSize: 11 }}>No clearance marks assigned.</div>
              : acl.clearance.map(m => (
                <Chip key={m} label={m} color={MARK_COLORS[m] || CY} />
              ))
            }
            <div style={{ fontSize: 11, color: '#6E8AA0', marginTop: 12, marginBottom: 6 }}>Visibility matrix:</div>
            {MARKS.map(m => {
              const canView = acl?.[`can_view_${m.toLowerCase()}`];
              return (
                <div key={m} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 0', borderBottom: `1px solid ${CY}11`,
                }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: canView ? MARK_COLORS[m] : DIM,
                    display: 'inline-block', flexShrink: 0,
                    boxShadow: canView ? `0 0 8px ${MARK_COLORS[m]}` : 'none',
                  }} />
                  <span style={{ fontSize: 11, color: MARK_COLORS[m], letterSpacing: 1, width: 90 }}>{m}</span>
                  <span style={{ fontSize: 10, color: canView ? GN : '#6E8AA0' }}>
                    {canView === true ? 'CAN VIEW' : canView === false ? 'DENIED' : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'COMPLIANCE' && (
          <div>
            {!comp
              ? <div style={{ color: DIM, fontSize: 11 }}>Loading compliance scorecard…</div>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    {
                      label: 'Audit Chain', color: comp.audit?.chain_integrity ? GN : RD,
                      lines: [
                        `Status: ${comp.audit?.status || '—'}`,
                        `Integrity: ${comp.audit?.chain_integrity ? 'VERIFIED' : 'BROKEN'}`,
                        `Length: ${comp.audit?.chain_length ?? '—'}`,
                        comp.audit?.broken_at ? `Broken at: ${comp.audit.broken_at}` : null,
                      ].filter(Boolean),
                    },
                    {
                      label: 'RevDB', color: comp.revdb?.latest_commit ? GN : AM,
                      lines: [
                        `Status: ${comp.revdb?.status || '—'}`,
                        `Latest: ${comp.revdb?.latest_commit?.slice(0, 12) || 'none'}`,
                        `At: ${age(comp.revdb?.latest_timestamp)}`,
                      ],
                    },
                    {
                      label: 'Tenancy', color: GN,
                      lines: [
                        `Status: ${comp.tenancy?.status || '—'}`,
                        `Tenants: ${comp.tenancy?.tenant_count ?? '—'}`,
                      ],
                    },
                    {
                      label: 'Cross-Org', color: GN,
                      lines: [
                        `Status: ${comp.cross_org?.status || '—'}`,
                        `Active shares: ${comp.cross_org?.active_shares ?? '—'}`,
                      ],
                    },
                    {
                      label: 'Clearance Model', color: GN,
                      lines: [
                        `Status: ${comp.clearance_model?.status || '—'}`,
                        `Lattice: ${(comp.clearance_model?.lattice || []).join(' > ') || '—'}`,
                      ],
                    },
                  ].map(card => (
                    <div key={card.label} style={{
                      background: `${card.color}08`, border: `1px solid ${card.color}33`,
                      borderRadius: 8, padding: '8px 12px',
                    }}>
                      <div style={{ fontSize: 11, color: card.color, letterSpacing: 1, marginBottom: 4 }}>{card.label}</div>
                      {card.lines.map(l => (
                        <div key={l} style={{ fontSize: 10, color: '#9AB', lineHeight: 1.6 }}>{l}</div>
                      ))}
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        )}

        {tab === 'AUDIT' && (
          <div>
            {loadingAudit && <div style={{ color: DIM, fontSize: 11 }}>Loading audit log…</div>}
            {!loadingAudit && auditItems.length === 0 && (
              <div style={{ color: DIM, fontSize: 11 }}>No audit entries found.</div>
            )}
            {auditItems.map((item, i) => (
              <div key={i} style={{
                borderBottom: `1px solid ${CY}11`, padding: '5px 0', fontSize: 11,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Chip label={item._src === 'revdb' ? 'REVDB' : 'AUDIT'} color={item._src === 'revdb' ? AM : CY} />
                  <span style={{ color: CY }}>{String(item.actor || '—').slice(0, 24)}</span>
                  <span style={{ color: '#6E8AA0' }}>{item.action || '—'}</span>
                  <span style={{ marginLeft: 'auto', color: '#6E8AA0', fontSize: 10 }}>{age(item.timestamp)}</span>
                </div>
                {item.resource && (
                  <div style={{ fontSize: 10, color: '#6E8AA0', marginTop: 2 }}>
                    resource: {String(item.resource).slice(0, 48)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'CHECK' && (
          <div>
            <div style={{ fontSize: 11, color: '#6E8AA0', marginBottom: 10 }}>
              Test if an action is permitted for the current caller.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 10, color: '#6E8AA0' }}>
                Action
                <select
                  value={checkAction}
                  onChange={e => setCheckAction(e.target.value)}
                  style={{
                    display: 'block', marginTop: 3, width: '100%', background: '#0A0F16',
                    border: `1px solid ${CY}33`, borderRadius: 4, color: CY,
                    padding: '4px 8px', fontSize: 11, fontFamily: 'inherit',
                  }}
                >
                  {['read', 'write', 'delete', 'apply'].map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 10, color: '#6E8AA0' }}>
                Resource
                <input
                  value={checkResource}
                  onChange={e => setCheckResource(e.target.value)}
                  placeholder="e.g. object-123"
                  style={{
                    display: 'block', marginTop: 3, width: '100%', background: '#0A0F16',
                    border: `1px solid ${CY}33`, borderRadius: 4, color: CY,
                    padding: '4px 8px', fontSize: 11, fontFamily: 'inherit', boxSizing: 'border-box',
                  }}
                />
              </label>
              <label style={{ fontSize: 10, color: '#6E8AA0' }}>
                Classification mark
                <select
                  value={checkMark}
                  onChange={e => setCheckMark(e.target.value)}
                  style={{
                    display: 'block', marginTop: 3, width: '100%', background: '#0A0F16',
                    border: `1px solid ${CY}33`, borderRadius: 4, color: CY,
                    padding: '4px 8px', fontSize: 11, fontFamily: 'inherit',
                  }}
                >
                  {MARKS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <button
                onClick={runCheck}
                disabled={checking || !checkResource.trim()}
                style={{
                  padding: '5px 0', background: `${CY}11`, border: `1px solid ${CY}44`,
                  borderRadius: 6, color: CY, fontSize: 11, letterSpacing: 1, cursor: 'pointer',
                }}
              >{checking ? 'Checking…' : '▶ CHECK'}</button>
              {checkResult && (
                <div style={{
                  marginTop: 4, padding: '10px 12px',
                  background: `${checkResult.permitted ? GN : RD}10`,
                  border: `1px solid ${checkResult.permitted ? GN : RD}44`,
                  borderRadius: 8,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: checkResult.permitted ? GN : RD, marginBottom: 6 }}>
                    {checkResult.permitted ? '✓ PERMITTED' : '✗ DENIED'}
                  </div>
                  <div style={{ fontSize: 10, color: '#9AB', lineHeight: 1.7 }}>
                    <div>Role: {checkResult.role}</div>
                    <div>Action: {checkResult.action}</div>
                    <div>Mark: {checkResult.mark}</div>
                    {checkResult.reason && <div style={{ color: RD }}>Reason: {checkResult.reason}</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
