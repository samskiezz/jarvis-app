import { useState, useEffect, useCallback } from 'react';

const API = '';
const SCI3D_RE = /\b(sci[._-]?3d|3d[._-]?data|molecule|orbital|trajectory|scientific[._-]?3d|3d[._-]?studio|sci3d|molecular[._-]?data|atom[._-]?data|kepler[._-]?orbit|3d[._-]?science|holo[._-]?cad)\b/i;

export function isSci3dQuery(t) {
  return SCI3D_RE.test(t || '');
}

export async function buildSci3dScript() {
  try {
    const cat = await fetch(`${API}/v1/sci/3d/catalog`).then(r => r.json());
    const datasets = Array.isArray(cat.datasets) ? cat.datasets : [];
    const molecules = datasets.filter(d => d.type === 'molecule').length;
    const orbitals = datasets.filter(d => d.type === 'orbital').length;
    const trajectories = datasets.filter(d => d.type === 'trajectory').length;
    return (
      `Scientific 3D Data Studio: ${datasets.length} datasets in catalog ` +
      `(${molecules} molecules, ${orbitals} orbital paths, ${trajectories} trajectories). ` +
      `Available: ${datasets.map(d => d.label || d.id).join(', ') || 'none'}.`
    );
  } catch {
    return 'Scientific 3D Data Studio: catalog unavailable.';
  }
}

const CY = '#00CFFF';
const GR = '#00FF9F';
const AM = '#F5A623';
const OR = '#FF6B35';
const PU = '#A78BFA';
const DM = '#6E8AA0';

const PRESETS = {
  molecule: {
    water: {
      label: 'Water (H₂O)',
      atoms: [
        { element: 'O', x: 0, y: 0, z: 0 },
        { element: 'H', x: 0.96, y: 0, z: 0 },
        { element: 'H', x: -0.24, y: 0.93, z: 0 },
      ],
      bonds: [[0, 1], [0, 2]],
    },
    benzene: {
      label: 'Benzene Ring',
      atoms: [
        { element: 'C', x: 1.40, y: 0, z: 0 },
        { element: 'C', x: 0.70, y: 1.21, z: 0 },
        { element: 'C', x: -0.70, y: 1.21, z: 0 },
        { element: 'C', x: -1.40, y: 0, z: 0 },
        { element: 'C', x: -0.70, y: -1.21, z: 0 },
        { element: 'C', x: 0.70, y: -1.21, z: 0 },
        { element: 'H', x: 2.49, y: 0, z: 0 },
        { element: 'H', x: 1.24, y: 2.15, z: 0 },
        { element: 'H', x: -1.24, y: 2.15, z: 0 },
        { element: 'H', x: -2.49, y: 0, z: 0 },
        { element: 'H', x: -1.24, y: -2.15, z: 0 },
        { element: 'H', x: 1.24, y: -2.15, z: 0 },
      ],
      bonds: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[0,6],[1,7],[2,8],[3,9],[4,10],[5,11]],
    },
  },
  trajectory: {
    mars_transfer: {
      label: 'Earth-Mars Transfer',
      waypoints: [[0,0,0],[1,0.5,0.1],[2,1.2,0.3],[3,1.8,0.5],[4,2.2,0.7],[5,2.6,1.0],[6,2.9,1.2],[7.5,3.1,1.5]],
      steps: 80,
    },
    leo: {
      label: 'LEO Approach',
      waypoints: [[0,0,0],[100,-50,20],[200,-80,40],[350,-60,60],[400,0,80],[350,80,60]],
      steps: 60,
    },
  },
  orbital: {
    leo_orbit: {
      label: 'LEO Reference (6700 km)',
      a: 6.7, e: 0.0, i: 51.6, omega: 0, raan: 0, nu_steps: 200,
    },
    mars_orbit: {
      label: 'Mars Orbit',
      a: 1.524, e: 0.0934, i: 1.85, omega: 286, raan: 49.5, nu_steps: 200,
    },
  },
};

const ELEMENT_COLOR = {
  H: '#FFFFFF', C: '#888888', N: '#3050F8', O: '#FF0D0D',
  S: '#FFFF30', F: '#90E050', Cl: '#1FF01F', P: '#FF8000',
};

function chip(text, col) {
  return (
    <span style={{
      padding: '1px 5px', borderRadius: 3, fontSize: 9, letterSpacing: 1,
      border: `1px solid ${col}55`, color: col, background: `${col}11`,
      flexShrink: 0,
    }}>{text}</span>
  );
}

function ScatterSvg({ points }) {
  if (!points || points.length === 0) return null;
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const W = 340, H = 120, PAD = 10;
  const toSvg = ([x, y]) => [
    PAD + ((x - minX) / rangeX) * (W - 2 * PAD),
    PAD + (1 - (y - minY) / rangeY) * (H - 2 * PAD),
  ];
  const d = points.map((p, i) => {
    const [sx, sy] = toSvg(p);
    return `${i === 0 ? 'M' : 'L'}${sx.toFixed(1)},${sy.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={W} height={H} style={{ overflow: 'visible' }}>
      <path d={d} fill="none" stroke={CY} strokeWidth="1.5" opacity="0.8" />
      {points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 12)) === 0).map((p, i) => {
        const [sx, sy] = toSvg(p);
        return <circle key={i} cx={sx} cy={sy} r={2} fill={CY} opacity="0.6" />;
      })}
    </svg>
  );
}

function MoleculeView({ result }) {
  if (!result) return null;
  const { atoms = [], bonds = [] } = result;
  const xs = atoms.map(a => a.x), ys = atoms.map(a => a.y);
  const minX = Math.min(...xs, 0), maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0), maxY = Math.max(...ys, 1);
  const W = 340, H = 140, PAD = 20;
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
  const sx = a => PAD + ((a.x - minX) / rangeX) * (W - 2 * PAD);
  const sy = a => PAD + (1 - (a.y - minY) / rangeY) * (H - 2 * PAD);
  return (
    <svg width={W} height={H} style={{ overflow: 'visible' }}>
      {bonds.map(([i, j], k) => (
        <line key={k}
          x1={sx(atoms[i])} y1={sy(atoms[i])}
          x2={sx(atoms[j])} y2={sy(atoms[j])}
          stroke="#334455" strokeWidth="1.5" />
      ))}
      {atoms.map((a, i) => {
        const col = ELEMENT_COLOR[a.element] || '#AABBCC';
        return (
          <g key={i}>
            <circle cx={sx(a)} cy={sy(a)} r={a.element === 'H' ? 4 : 7} fill={col} opacity="0.85" />
            <text x={sx(a)} y={sy(a) + 4} textAnchor="middle" fontSize="7"
              fill="#000" fontWeight="700" style={{ pointerEvents: 'none' }}>
              {a.element}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const PANEL_W = 620, PANEL_H = 520;

export default function Sci3dStudio() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('CATALOG');
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState('');
  const [assessing, setAssessing] = useState(false);

  const [molPreset, setMolPreset] = useState('water');
  const [molResult, setMolResult] = useState(null);
  const [molRunning, setMolRunning] = useState(false);

  const [trajPreset, setTrajPreset] = useState('mars_transfer');
  const [trajResult, setTrajResult] = useState(null);
  const [trajRunning, setTrajRunning] = useState(false);

  const [orbPreset, setOrbPreset] = useState('leo_orbit');
  const [orbResult, setOrbResult] = useState(null);
  const [orbRunning, setOrbRunning] = useState(false);

  const [generatedCount, setGeneratedCount] = useState(0);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/v1/sci/3d/catalog`);
      const d = await r.json();
      setCatalog(Array.isArray(d.datasets) ? d.datasets : []);
    } catch { setCatalog([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && catalog.length === 0) loadCatalog();
  }, [open, catalog.length, loadCatalog]);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener('jarvis:sci3d-toggle', handler);
    return () => window.removeEventListener('jarvis:sci3d-toggle', handler);
  }, []);

  async function runMolecule() {
    setMolRunning(true);
    setMolResult(null);
    const preset = PRESETS.molecule[molPreset];
    try {
      const r = await fetch(`${API}/v1/sci/3d/molecule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ atoms: preset.atoms, bonds: preset.bonds }),
      });
      const d = await r.json();
      setMolResult(d);
      setGeneratedCount(n => n + 1);
    } catch { setMolResult({ error: 'Request failed' }); }
    setMolRunning(false);
  }

  async function runTrajectory() {
    setTrajRunning(true);
    setTrajResult(null);
    const preset = PRESETS.trajectory[trajPreset];
    try {
      const r = await fetch(`${API}/v1/sci/3d/trajectory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waypoints: preset.waypoints, steps: preset.steps }),
      });
      const d = await r.json();
      setTrajResult(d);
      setGeneratedCount(n => n + 1);
    } catch { setTrajResult({ error: 'Request failed' }); }
    setTrajRunning(false);
  }

  async function runOrbital() {
    setOrbRunning(true);
    setOrbResult(null);
    const preset = PRESETS.orbital[orbPreset];
    try {
      const r = await fetch(`${API}/v1/sci/3d/orbital`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preset),
      });
      const d = await r.json();
      setOrbResult(d);
      setGeneratedCount(n => n + 1);
    } catch { setOrbResult({ error: 'Request failed' }); }
    setOrbRunning(false);
  }

  async function assess() {
    setAssessing(true);
    setBrief('');
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer dev-key' },
        body: JSON.stringify({
          message: `Scientific 3D Data Studio has ${catalog.length} datasets in catalog. ${generatedCount} geometry datasets generated this session. Give a 2-sentence scientific data studio brief covering the geometric analysis capabilities.`,
        }),
      });
      const d = await r.json();
      const txt = d.response || d.answer || d.text || d.content || '';
      setBrief(txt);
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text: txt } }));
    } catch { setBrief('Agent unavailable.'); }
    setAssessing(false);
  }

  const molecules = catalog.filter(d => d.type === 'molecule');
  const orbitals = catalog.filter(d => d.type === 'orbital');
  const trajectories = catalog.filter(d => d.type === 'trajectory');

  const badgeColor = catalog.length > 0 ? GR : DM;
  const badgeCount = catalog.length;

  const TYPE_COLOR = { molecule: PU, orbital: CY, trajectory: OR };

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Scientific 3D Data Studio (SCI3D)"
        style={{
          position: 'fixed', left: 693840, bottom: 8, zIndex: 246,
          width: 60, height: 22, borderRadius: 3,
          border: `1px solid ${badgeColor}77`, cursor: 'pointer',
          background: 'rgba(5,8,13,0.75)', color: badgeColor,
          fontSize: 9, letterSpacing: 1, backdropFilter: 'blur(6px)',
          boxShadow: `0 0 10px ${badgeColor}44`, fontFamily: "'JetBrains Mono',monospace",
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        }}
      >
        ⬡ SCI3D
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
              ⬡ SCIENTIFIC 3D DATA STUDIO
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {loading && <span style={{ color: DM, fontSize: 10 }}>loading…</span>}
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
                style={{ background: 'none', border: 'none', color: DM, cursor: 'pointer', fontSize: 14, padding: 0 }}
              >✕</button>
            </span>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 14px', flexShrink: 0 }}>
            {[
              { label: 'DATASETS', val: catalog.length, col: CY },
              { label: 'MOLECULES', val: molecules.length, col: PU },
              { label: 'ORBITALS', val: orbitals.length, col: OR },
              { label: 'GENERATED', val: generatedCount, col: GR },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1, background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: '6px 8px', textAlign: 'center',
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: DM, fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 6, padding: '0 14px 8px', flexShrink: 0 }}>
            {['CATALOG', 'MOLECULE', 'TRAJECTORY', 'ORBITAL'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '2px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                  border: `1px solid ${tab === t ? CY : '#2a3a4a'}`,
                  background: tab === t ? `${CY}22` : 'transparent',
                  color: tab === t ? CY : DM,
                }}
              >{t}</button>
            ))}
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>

            {/* CATALOG tab */}
            {tab === 'CATALOG' && (
              <div>
                {catalog.length === 0 ? (
                  <div style={{ color: DM, fontSize: 11, textAlign: 'center', paddingTop: 30 }}>
                    {loading ? 'Loading catalog…' : 'No datasets in catalog.'}
                  </div>
                ) : catalog.map((d, i) => {
                  const col = TYPE_COLOR[d.type] || DM;
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 0', borderBottom: `1px solid ${CY}11`,
                    }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: col, flexShrink: 0,
                      }} />
                      <span style={{ color: '#DCEBF5', fontSize: 11, flex: 1 }}>{d.label || d.id}</span>
                      {chip(d.type || '—', col)}
                      {d.atoms && chip(`${d.atoms} atoms`, PU)}
                      {d.points && chip(`${d.points} pts`, CY)}
                      {d.waypoints && chip(`${d.waypoints} waypoints`, OR)}
                    </div>
                  );
                })}
              </div>
            )}

            {/* MOLECULE tab */}
            {tab === 'MOLECULE' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ color: DM, fontSize: 9, letterSpacing: 1 }}>PRESET</span>
                  <select
                    value={molPreset}
                    onChange={e => { setMolPreset(e.target.value); setMolResult(null); }}
                    style={{
                      background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                      borderRadius: 4, color: '#DCEBF5', padding: '2px 8px',
                      fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
                    }}
                  >
                    {Object.entries(PRESETS.molecule).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={runMolecule}
                    disabled={molRunning}
                    style={{
                      padding: '2px 12px', borderRadius: 3, border: `1px solid ${PU}55`,
                      background: `${PU}11`, color: PU, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                    }}
                  >{molRunning ? 'running…' : '▶ GENERATE'}</button>
                </div>
                <div style={{ color: DM, fontSize: 9, marginBottom: 6 }}>
                  {PRESETS.molecule[molPreset].atoms.length} atoms · {(PRESETS.molecule[molPreset].bonds || []).length} bonds
                </div>
                {molResult && !molResult.error && (
                  <div>
                    <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                      GEOMETRY — {molResult.count} atoms
                    </div>
                    <MoleculeView result={molResult} />
                    <div style={{ marginTop: 8, overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                        <thead>
                          <tr>
                            {['#', 'El', 'X', 'Y', 'Z'].map(h => (
                              <th key={h} style={{ color: DM, textAlign: 'left', padding: '2px 6px', borderBottom: `1px solid ${CY}22` }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {molResult.atoms.map((a, i) => (
                            <tr key={i}>
                              <td style={{ color: DM, padding: '2px 6px' }}>{i}</td>
                              <td style={{ color: ELEMENT_COLOR[a.element] || '#AABBCC', padding: '2px 6px', fontWeight: 700 }}>{a.element}</td>
                              <td style={{ color: '#DCEBF5', padding: '2px 6px' }}>{Number(a.x).toFixed(3)}</td>
                              <td style={{ color: '#DCEBF5', padding: '2px 6px' }}>{Number(a.y).toFixed(3)}</td>
                              <td style={{ color: '#DCEBF5', padding: '2px 6px' }}>{Number(a.z).toFixed(3)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {molResult && molResult.error && (
                  <div style={{ color: '#F43F5E', fontSize: 10 }}>{molResult.error}</div>
                )}
              </div>
            )}

            {/* TRAJECTORY tab */}
            {tab === 'TRAJECTORY' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ color: DM, fontSize: 9, letterSpacing: 1 }}>PRESET</span>
                  <select
                    value={trajPreset}
                    onChange={e => { setTrajPreset(e.target.value); setTrajResult(null); }}
                    style={{
                      background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                      borderRadius: 4, color: '#DCEBF5', padding: '2px 8px',
                      fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
                    }}
                  >
                    {Object.entries(PRESETS.trajectory).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={runTrajectory}
                    disabled={trajRunning}
                    style={{
                      padding: '2px 12px', borderRadius: 3, border: `1px solid ${OR}55`,
                      background: `${OR}11`, color: OR, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                    }}
                  >{trajRunning ? 'running…' : '▶ GENERATE'}</button>
                </div>
                <div style={{ color: DM, fontSize: 9, marginBottom: 6 }}>
                  {PRESETS.trajectory[trajPreset].waypoints.length} waypoints → {PRESETS.trajectory[trajPreset].steps} interpolated steps
                </div>
                {trajResult && !trajResult.error && (
                  <div>
                    <div style={{ color: OR, fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                      PATH — {trajResult.steps} interpolated points from {trajResult.waypoints.length} waypoints
                    </div>
                    <ScatterSvg points={trajResult.interpolated} />
                    <div style={{ marginTop: 8 }}>
                      <div style={{ color: DM, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>WAYPOINTS</div>
                      {trajResult.waypoints.map((w, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, fontSize: 10, color: '#DCEBF5', marginBottom: 2 }}>
                          <span style={{ color: DM, width: 18 }}>{i}</span>
                          <span>x={Number(w[0]).toFixed(2)}</span>
                          <span>y={Number(w[1]).toFixed(2)}</span>
                          <span>z={Number(w[2]).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {trajResult && trajResult.error && (
                  <div style={{ color: '#F43F5E', fontSize: 10 }}>{trajResult.error}</div>
                )}
              </div>
            )}

            {/* ORBITAL tab */}
            {tab === 'ORBITAL' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ color: DM, fontSize: 9, letterSpacing: 1 }}>PRESET</span>
                  <select
                    value={orbPreset}
                    onChange={e => { setOrbPreset(e.target.value); setOrbResult(null); }}
                    style={{
                      background: 'rgba(255,255,255,0.03)', border: `1px solid #2a3a4a`,
                      borderRadius: 4, color: '#DCEBF5', padding: '2px 8px',
                      fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
                    }}
                  >
                    {Object.entries(PRESETS.orbital).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={runOrbital}
                    disabled={orbRunning}
                    style={{
                      padding: '2px 12px', borderRadius: 3, border: `1px solid ${CY}55`,
                      background: `${CY}11`, color: CY, cursor: 'pointer', fontSize: 9, letterSpacing: 1,
                    }}
                  >{orbRunning ? 'running…' : '▶ GENERATE'}</button>
                </div>
                {(() => {
                  const p = PRESETS.orbital[orbPreset];
                  return (
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 8 }}>
                      {[['a', p.a, 'AU'], ['e', p.e, ''], ['i', p.i, '°'], ['ω', p.omega, '°'], ['Ω', p.raan, '°']].map(([lbl, val, unit]) => (
                        <div key={lbl} style={{ textAlign: 'center' }}>
                          <div style={{ color: CY, fontSize: 13, fontWeight: 700 }}>{val}{unit}</div>
                          <div style={{ color: DM, fontSize: 9 }}>{lbl}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {orbResult && !orbResult.error && (
                  <div>
                    <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                      ORBITAL PATH — {orbResult.points.length} points
                    </div>
                    <ScatterSvg points={orbResult.points} />
                    <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
                      {Object.entries(orbResult.params || {}).map(([k, v]) => (
                        <div key={k} style={{ fontSize: 10 }}>
                          <span style={{ color: DM }}>{k}=</span>
                          <span style={{ color: '#DCEBF5' }}>{typeof v === 'number' ? v.toFixed(3) : v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {orbResult && orbResult.error && (
                  <div style={{ color: '#F43F5E', fontSize: 10 }}>{orbResult.error}</div>
                )}
              </div>
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
