/**
 * F303 — AIP Tool Explorer
 * ◈ AIPTOOL button (left:217480, zIndex:399)
 * GET /v1/aip/tools  → tool list; click → detail drawer; "Call Tool" → POST /v1/aip/call
 * GET /v1/aip/proposals → open proposals list
 * GET /v1/aip/skill  → skill scorecard panel
 * ASSESS speaks about AIP tool coverage + TTS
 * Additive only — new file; mounted in App.jsx; does not touch protected files.
 */
import { useState, useEffect, useCallback } from 'react';

const API = '';
const API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) || 'dev-key';

function authHdrs() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };
}

const AIPTOOL_RE =
  /\b(aip\s+tool(s|s?\s+explorer)?|tool\s+explorer|aip\s+explorer|call\s+tool|tool\s+catalogue|tool\s+coverage|aip\s+proposals?|aiptool)\b/i;

export function isAiptoolQuery(t) {
  return AIPTOOL_RE.test(t || '');
}

export async function buildAiptoolScript() {
  try {
    const r = await fetch(`${API}/v1/aip/tools`, { headers: authHdrs() });
    const d = await r.json();
    const tools = Array.isArray(d) ? d : (d.tools || d.data || []);
    const n = tools.length;
    const sample = tools.slice(0, 3).map((t) => t.name || t.tool_name || '?').join(', ');
    return `AIP Tool Explorer: ${n} tool${n !== 1 ? 's' : ''} registered${n > 0 ? `, including ${sample}${n > 3 ? ' and more' : ''}` : ''}. Use the AIPTOOL panel to inspect parameters and call tools directly.`;
  } catch {
    return 'AIP Tool Explorer is standing by. Open the AIPTOOL panel to browse and call registered tools, sir.';
  }
}

const PANEL_W = 700;
const PANEL_H = 600;
const CY = '#00CFFF';
const AM = '#F59E0B';
const GR = '#22C55E';
const RD = '#EF4444';
const BG = 'rgba(6,11,22,0.97)';
const BORDER = 'rgba(0,207,255,0.18)';
const FONT = "'JetBrains Mono',monospace";

const inp = {
  width: '100%',
  background: 'rgba(0,207,255,0.05)',
  border: `1px solid ${BORDER}`,
  color: '#C8D8E8',
  fontFamily: FONT,
  fontSize: 10,
  padding: '4px 7px',
  borderRadius: 3,
  boxSizing: 'border-box',
};

function Lbl({ children }) {
  return (
    <div style={{ color: '#88A4B8', fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>
      {children}
    </div>
  );
}

function Chip({ label, color }) {
  return (
    <span
      style={{
        background: `${color}18`,
        border: `1px solid ${color}55`,
        color,
        borderRadius: 3,
        fontSize: 9,
        padding: '1px 6px',
        letterSpacing: 1,
      }}
    >
      {label}
    </span>
  );
}

export default function AipToolExplorer() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('TOOLS');

  // TOOLS tab
  const [tools, setTools] = useState([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [selectedTool, setSelectedTool] = useState(null);
  const [argsJson, setArgsJson] = useState('{}');
  const [calling, setCalling] = useState(false);
  const [callResult, setCallResult] = useState(null);
  const [callError, setCallError] = useState('');

  // PROPOSALS tab
  const [proposals, setProposals] = useState([]);
  const [propsLoading, setPropsLoading] = useState(false);

  // SKILL tab
  const [skill, setSkill] = useState(null);
  const [skillLoading, setSkillLoading] = useState(false);

  const [assessing, setAssessing] = useState(false);

  // ---- loaders ----
  const loadTools = useCallback(async () => {
    setToolsLoading(true);
    try {
      const r = await fetch(`${API}/v1/aip/tools`, { headers: authHdrs() });
      if (!r.ok) return;
      const d = await r.json();
      const list = Array.isArray(d) ? d : (d.tools || d.data || []);
      setTools(list);
    } catch { /* network */ } finally {
      setToolsLoading(false);
    }
  }, []);

  const loadProposals = useCallback(async () => {
    setPropsLoading(true);
    try {
      const r = await fetch(`${API}/v1/aip/proposals`, { headers: authHdrs() });
      if (!r.ok) return;
      const d = await r.json();
      const list = Array.isArray(d) ? d : (d.proposals || d.data || []);
      setProposals(list);
    } catch { /* network */ } finally {
      setPropsLoading(false);
    }
  }, []);

  const loadSkill = useCallback(async () => {
    setSkillLoading(true);
    try {
      const r = await fetch(`${API}/v1/aip/skill`, { headers: authHdrs() });
      if (!r.ok) return;
      const d = await r.json();
      setSkill(d);
    } catch { /* network */ } finally {
      setSkillLoading(false);
    }
  }, []);

  // ---- effects ----
  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener('jarvis:aiptool-toggle', onToggle);
    return () => window.removeEventListener('jarvis:aiptool-toggle', onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    loadTools();
    loadProposals();
    loadSkill();
  }, [open, loadTools, loadProposals, loadSkill]);

  // reset drawer when switching tools
  const selectTool = useCallback((tool) => {
    setSelectedTool(tool);
    setArgsJson('{}');
    setCallResult(null);
    setCallError('');
  }, []);

  // ---- call tool ----
  const callTool = useCallback(async () => {
    if (!selectedTool) return;
    let args;
    try { args = JSON.parse(argsJson); }
    catch { setCallError('Invalid JSON in args'); return; }
    setCalling(true);
    setCallResult(null);
    setCallError('');
    try {
      const r = await fetch(`${API}/v1/aip/call`, {
        method: 'POST',
        headers: authHdrs(),
        body: JSON.stringify({ tool_name: selectedTool.name || selectedTool.tool_name, args }),
      });
      const d = await r.json();
      if (!r.ok) { setCallError(d.detail || JSON.stringify(d)); return; }
      setCallResult(d);
    } catch (e) {
      setCallError(e.message);
    } finally {
      setCalling(false);
    }
  }, [selectedTool, argsJson]);

  // ---- ASSESS ----
  const assess = useCallback(async () => {
    setAssessing(true);
    const n = tools.length;
    const np = proposals.length;
    const score = skill?.score != null ? `${Math.round(skill.score * 100)}%` : 'unknown';
    const prompt =
      `As JARVIS, briefly assess AIP tool coverage: ${n} tools registered, ${np} open proposals, skill score ${score}. ` +
      `Highlight any coverage gaps or high-priority proposals in 2 sentences.`;
    try {
      const r = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: 'POST',
        headers: authHdrs(),
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text =
        (d.answer || d.response || d.message || '').replace(/<<ACTION:[^>]*>>/g, '').trim() ||
        'AIP tool coverage assessment unavailable, sir.';
      window.dispatchEvent(new CustomEvent('jarvis:speak-dossier', { detail: { text } }));
    } catch {
      window.dispatchEvent(
        new CustomEvent('jarvis:speak-dossier', {
          detail: { text: 'AIP tool coverage assessment is temporarily unavailable, sir.' },
        })
      );
    }
    setAssessing(false);
  }, [tools, proposals, skill]);

  const toolName = (t) => t?.name || t?.tool_name || '?';

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: 'fixed',
          left: 217480,
          bottom: 8,
          zIndex: 399,
          background: open ? 'rgba(0,207,255,0.18)' : 'rgba(6,11,22,0.85)',
          border: `1px solid ${open ? CY : 'rgba(0,207,255,0.35)'}`,
          color: CY,
          fontFamily: FONT,
          fontSize: 10,
          letterSpacing: 1,
          padding: '4px 9px',
          borderRadius: 4,
          cursor: 'pointer',
          textShadow: `0 0 8px ${CY}`,
        }}
      >
        ◈ AIPTOOL
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%,-50%)',
            width: PANEL_W,
            maxHeight: PANEL_H,
            background: BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            zIndex: 9399,
            display: 'flex',
            flexDirection: 'column',
            fontFamily: FONT,
            color: '#C8D8E8',
            boxShadow: '0 0 40px rgba(0,207,255,0.08)',
          }}
        >
          {/* header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: `1px solid ${BORDER}`,
            }}
          >
            <div
              style={{ color: CY, fontSize: 11, letterSpacing: 2, textShadow: `0 0 10px ${CY}` }}
            >
              ◈ AIP TOOL EXPLORER
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  background: 'rgba(0,207,255,0.08)',
                  border: `1px solid ${CY}55`,
                  color: CY,
                  fontFamily: FONT,
                  fontSize: 9,
                  letterSpacing: 1,
                  padding: '3px 9px',
                  borderRadius: 3,
                  cursor: assessing ? 'wait' : 'pointer',
                }}
              >
                {assessing ? '…' : '▶ ASSESS'}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: '#88A4B8', cursor: 'pointer', fontSize: 13 }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* summary tiles */}
          <div style={{ display: 'flex', gap: 8, padding: '8px 14px' }}>
            {[
              { label: 'TOOLS', value: tools.length, color: CY },
              { label: 'PROPOSALS', value: proposals.length, color: AM },
              {
                label: 'SKILL SCORE',
                value: skill?.score != null ? `${Math.round(skill.score * 100)}%` : '—',
                color: GR,
              },
              {
                label: 'PENDING',
                value: proposals.filter((p) => p.status === 'pending' || !p.status).length,
                color: RD,
              },
            ].map((tile) => (
              <div
                key={tile.label}
                style={{
                  flex: 1,
                  background: 'rgba(0,207,255,0.05)',
                  border: `1px solid ${tile.color}44`,
                  borderRadius: 4,
                  padding: '8px 10px',
                }}
              >
                <div style={{ color: tile.color, fontSize: 18, fontWeight: 700 }}>{tile.value}</div>
                <div style={{ color: '#88A4B8', fontSize: 9, letterSpacing: 1, marginTop: 2 }}>
                  {tile.label}
                </div>
              </div>
            ))}
          </div>

          {/* tab bar */}
          <div style={{ display: 'flex', gap: 4, padding: '0 14px 6px' }}>
            {['TOOLS', 'PROPOSALS', 'SKILL'].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? 'rgba(0,207,255,0.12)' : 'transparent',
                  border: `1px solid ${tab === t ? CY : 'rgba(0,207,255,0.2)'}`,
                  color: tab === t ? CY : '#88A4B8',
                  fontFamily: FONT,
                  fontSize: 9,
                  letterSpacing: 1,
                  padding: '3px 10px',
                  borderRadius: 3,
                  cursor: 'pointer',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 14px', display: 'flex', gap: 10 }}>
            {/* TOOLS */}
            {tab === 'TOOLS' && (
              <>
                {/* left: tool list */}
                <div
                  style={{
                    width: 220,
                    flexShrink: 0,
                    overflowY: 'auto',
                    borderRight: `1px solid ${BORDER}`,
                    paddingRight: 8,
                  }}
                >
                  {toolsLoading && (
                    <div style={{ color: '#88A4B8', fontSize: 10, padding: 8 }}>Loading tools…</div>
                  )}
                  {!toolsLoading && tools.length === 0 && (
                    <div style={{ color: '#88A4B8', fontSize: 10, padding: 8 }}>No tools returned.</div>
                  )}
                  {tools.map((tool, i) => (
                    <div
                      key={i}
                      onClick={() => selectTool(tool)}
                      style={{
                        padding: '6px 8px',
                        marginBottom: 3,
                        borderRadius: 4,
                        cursor: 'pointer',
                        background:
                          selectedTool === tool
                            ? 'rgba(0,207,255,0.12)'
                            : 'rgba(0,207,255,0.03)',
                        border: `1px solid ${selectedTool === tool ? CY : 'rgba(0,207,255,0.1)'}`,
                      }}
                    >
                      <div style={{ color: CY, fontSize: 10, fontWeight: 700 }}>{toolName(tool)}</div>
                      <div
                        style={{
                          color: '#88A4B8',
                          fontSize: 9,
                          marginTop: 2,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {tool.description || '—'}
                      </div>
                    </div>
                  ))}
                </div>

                {/* right: detail + call */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {!selectedTool && (
                    <div style={{ color: '#88A4B8', fontSize: 10, padding: '12px 0' }}>
                      Select a tool to see details and call it.
                    </div>
                  )}
                  {selectedTool && (
                    <>
                      <div>
                        <div style={{ color: CY, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                          {toolName(selectedTool)}
                        </div>
                        <div style={{ color: '#C8D8E8', fontSize: 10, marginBottom: 6 }}>
                          {selectedTool.description || 'No description available.'}
                        </div>
                        {/* parameters */}
                        {selectedTool.parameters && (
                          <div>
                            <Lbl>PARAMETERS</Lbl>
                            <div
                              style={{
                                background: 'rgba(0,207,255,0.04)',
                                border: `1px solid ${BORDER}`,
                                borderRadius: 4,
                                padding: '6px 8px',
                                fontSize: 9,
                                color: '#C8D8E8',
                              }}
                            >
                              {typeof selectedTool.parameters === 'string'
                                ? selectedTool.parameters
                                : JSON.stringify(selectedTool.parameters, null, 2)}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* call form */}
                      <div>
                        <Lbl>ARGS (JSON)</Lbl>
                        <textarea
                          value={argsJson}
                          onChange={(e) => setArgsJson(e.target.value)}
                          rows={4}
                          style={{ ...inp, resize: 'vertical' }}
                        />
                      </div>
                      <button
                        onClick={callTool}
                        disabled={calling}
                        style={{
                          background: calling ? 'rgba(0,207,255,0.05)' : 'rgba(0,207,255,0.12)',
                          border: `1px solid ${CY}`,
                          color: CY,
                          fontFamily: FONT,
                          fontSize: 10,
                          letterSpacing: 1,
                          padding: '6px 14px',
                          borderRadius: 4,
                          cursor: calling ? 'wait' : 'pointer',
                          alignSelf: 'flex-start',
                        }}
                      >
                        {calling ? '◌ CALLING…' : '▶ CALL TOOL'}
                      </button>

                      {callError && (
                        <div
                          style={{
                            background: 'rgba(239,68,68,0.08)',
                            border: `1px solid ${RD}`,
                            borderRadius: 4,
                            padding: '8px 10px',
                            color: RD,
                            fontSize: 10,
                          }}
                        >
                          {callError}
                        </div>
                      )}
                      {callResult && (
                        <div
                          style={{
                            background: 'rgba(0,207,255,0.04)',
                            border: `1px solid ${BORDER}`,
                            borderRadius: 4,
                            padding: '10px 12px',
                          }}
                        >
                          <div style={{ color: GR, fontSize: 10, fontWeight: 700, marginBottom: 6 }}>
                            ✓ RESULT
                          </div>
                          <pre
                            style={{
                              color: '#C8D8E8',
                              margin: 0,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              fontSize: 10,
                            }}
                          >
                            {JSON.stringify(callResult, null, 2)}
                          </pre>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}

            {/* PROPOSALS */}
            {tab === 'PROPOSALS' && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {propsLoading && (
                  <div style={{ color: '#88A4B8', fontSize: 10, padding: 8 }}>Loading proposals…</div>
                )}
                {!propsLoading && proposals.length === 0 && (
                  <div style={{ color: '#88A4B8', fontSize: 10, padding: 8 }}>No open proposals.</div>
                )}
                {proposals.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'rgba(0,207,255,0.04)',
                      border: `1px solid ${BORDER}`,
                      borderRadius: 4,
                      padding: '8px 10px',
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ color: CY, fontSize: 10, fontWeight: 700 }}>
                        {p.title || p.name || `Proposal #${i + 1}`}
                      </div>
                      <Chip
                        label={(p.status || 'pending').toUpperCase()}
                        color={
                          p.status === 'approved'
                            ? GR
                            : p.status === 'rejected'
                            ? RD
                            : AM
                        }
                      />
                    </div>
                    {p.description && (
                      <div style={{ color: '#88A4B8', fontSize: 9 }}>{p.description}</div>
                    )}
                    {p.tool_name && (
                      <div style={{ color: '#C8D8E8', fontSize: 9, marginTop: 3 }}>
                        Tool: <span style={{ color: CY }}>{p.tool_name}</span>
                      </div>
                    )}
                    {p.created_at && (
                      <div style={{ color: '#55687A', fontSize: 9, marginTop: 2 }}>
                        {new Date(p.created_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* SKILL */}
            {tab === 'SKILL' && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {skillLoading && (
                  <div style={{ color: '#88A4B8', fontSize: 10, padding: 8 }}>Loading skill data…</div>
                )}
                {!skillLoading && !skill && (
                  <div style={{ color: '#88A4B8', fontSize: 10, padding: 8 }}>No skill data returned.</div>
                )}
                {skill && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* overall score */}
                    {skill.score != null && (
                      <div
                        style={{
                          background: 'rgba(0,207,255,0.06)',
                          border: `1px solid ${CY}44`,
                          borderRadius: 4,
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                        }}
                      >
                        <div style={{ color: GR, fontSize: 28, fontWeight: 700 }}>
                          {Math.round(skill.score * 100)}%
                        </div>
                        <div>
                          <div style={{ color: CY, fontSize: 10, letterSpacing: 1 }}>OVERALL SKILL SCORE</div>
                          {skill.level && (
                            <div style={{ color: '#88A4B8', fontSize: 9, marginTop: 2 }}>
                              Level: {skill.level}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {/* metrics */}
                    {skill.metrics && (
                      <div>
                        <Lbl>METRICS</Lbl>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {Object.entries(skill.metrics).map(([k, v]) => (
                            <div
                              key={k}
                              style={{
                                background: 'rgba(0,207,255,0.04)',
                                border: `1px solid ${BORDER}`,
                                borderRadius: 4,
                                padding: '6px 10px',
                                minWidth: 80,
                              }}
                            >
                              <div style={{ color: AM, fontSize: 13, fontWeight: 700 }}>
                                {typeof v === 'number' && v <= 1 ? `${Math.round(v * 100)}%` : String(v)}
                              </div>
                              <div style={{ color: '#88A4B8', fontSize: 9, letterSpacing: 1, marginTop: 2 }}>
                                {k.toUpperCase()}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* raw dump for any extra fields */}
                    {Object.keys(skill).filter((k) => !['score', 'level', 'metrics'].includes(k)).length > 0 && (
                      <div>
                        <Lbl>ADDITIONAL DATA</Lbl>
                        <pre
                          style={{
                            background: 'rgba(0,207,255,0.03)',
                            border: `1px solid ${BORDER}`,
                            borderRadius: 4,
                            padding: '8px 10px',
                            color: '#C8D8E8',
                            fontSize: 9,
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {JSON.stringify(
                            Object.fromEntries(
                              Object.entries(skill).filter(
                                ([k]) => !['score', 'level', 'metrics'].includes(k)
                              )
                            ),
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
