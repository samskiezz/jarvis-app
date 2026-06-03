import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { COLORS as C } from "@/domain/colors";
import { appParams } from "@/lib/app-params";
import { getLiveIntel } from "@/api/backendFunctions";
import { IntelProfile, RiskSignal, Task } from "@/api/entities";
import { PageShell, PanelCard, StatTile, Grid, DataState } from "@/components/PageKit";

const ACCENT = C.neon;

// Stream analystChat SSE, calling onToken(fullText) as text arrives.
async function streamAnalyst(message, onToken, signal) {
  const headers = { "Content-Type": "application/json" };
  if (appParams.apiKey) headers.Authorization = `Bearer ${appParams.apiKey}`;
  const res = await fetch(`${appParams.apiBaseUrl}/functions/analystChat`, {
    method: "POST", headers, body: JSON.stringify({ message }), signal,
  });
  if (!res.ok || !res.body) throw new Error(`analystChat ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let full = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() || "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return full;
      try { full += JSON.parse(data); onToken(full); } catch { /* skip frame */ }
    }
  }
  return full;
}

const LAUNCH = [
  { name: "PipelineMonitor", label: "Pipeline Monitor", icon: "⛓", color: C.blue },
  { name: "MLHub", label: "ML Hub", icon: "🧠", color: C.purple },
  { name: "Underworld", label: "Underworld", icon: "🕳", color: C.red },
];

export default function CommandCenter() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [intel, profiles, risks, tasks] = await Promise.all([
        getLiveIntel({ type: "all" }).catch(() => null),
        IntelProfile.list().catch(() => []),
        RiskSignal.list().catch(() => []),
        Task.list().catch(() => []),
      ]);
      setStats({
        markets: Array.isArray(intel?.markets) ? intel.markets.length : 0,
        quakes: Array.isArray(intel?.earthquakes) ? intel.earthquakes.length : 0,
        profiles: Array.isArray(profiles) ? profiles.length : 0,
        risks: Array.isArray(risks) ? risks.length : 0,
        tasks: Array.isArray(tasks) ? tasks.length : 0,
      });
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const send = useCallback(async (e) => {
    e?.preventDefault();
    const msg = draft.trim();
    if (!msg || streaming) return;
    setDraft("");
    setReply("");
    setStreaming(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamAnalyst(msg, setReply, ctrl.signal);
    } catch (err) {
      if (err.name !== "AbortError") setReply("⚠ analyst link unavailable.");
    } finally {
      setStreaming(false);
    }
  }, [draft, streaming]);

  return (
    <PageShell title="COMMAND CENTER" subtitle="OPERATIONS HUB · LIVE STATUS · QUICK LAUNCH" accent={ACCENT}>
      <DataState loading={loading} error={error}>
        <Grid min={150} style={{ marginBottom: 14 }}>
          <StatTile label="Markets Live" value={stats?.markets ?? 0} accent={C.gold} />
          <StatTile label="Seismic Events" value={stats?.quakes ?? 0} accent={C.orange} />
          <StatTile label="Intel Profiles" value={stats?.profiles ?? 0} accent={C.blue} />
          <StatTile label="Risk Signals" value={stats?.risks ?? 0} accent={C.red} />
          <StatTile label="Open Tasks" value={stats?.tasks ?? 0} accent={ACCENT} />
        </Grid>
      </DataState>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
        <PanelCard title="QUICK LAUNCH" accent={C.blue}>
          <Grid min={120} gap={8}>
            {LAUNCH.map((l) => (
              <button
                key={l.name}
                onClick={() => navigate(`/apex${createPageUrl(l.name)}`)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6,
                  padding: "14px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                  background: l.color + "12", border: `1px solid ${l.color}44`, textAlign: "left",
                }}
              >
                <span style={{ fontSize: 18 }}>{l.icon}</span>
                <span style={{ fontSize: 10, letterSpacing: 1, color: l.color, fontWeight: 700 }}>{l.label}</span>
              </button>
            ))}
          </Grid>
        </PanelCard>

        <PanelCard title="ANALYST CONSOLE" accent={ACCENT} right={streaming ? <span style={{ fontSize: 8, color: ACCENT }}>◌ STREAMING</span> : null}>
          <form onSubmit={send} style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Issue a command or ask the analyst…"
              style={{
                flex: 1, background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, borderRadius: 5,
                color: C.textB, fontSize: 11, padding: "8px 10px", outline: "none", fontFamily: "inherit",
              }}
            />
            <button
              type="submit"
              disabled={streaming || !draft.trim()}
              style={{
                background: ACCENT + "1a", border: `1px solid ${ACCENT}55`, color: ACCENT,
                fontFamily: "inherit", fontSize: 10, letterSpacing: 2, padding: "8px 16px",
                borderRadius: 5, cursor: streaming ? "wait" : "pointer", fontWeight: 700,
              }}
            >SEND</button>
          </form>
          <div style={{
            minHeight: 120, maxHeight: 260, overflowY: "auto", padding: 10, borderRadius: 5,
            background: "rgba(0,0,0,0.35)", border: `1px solid ${C.border}`,
            fontSize: 11, lineHeight: 1.6, color: "#cfe9dc", whiteSpace: "pre-wrap",
          }}>
            {reply || <span style={{ color: C.text }}>Awaiting command. Replies stream from the JARVIS analyst.</span>}
            {streaming && <span style={{ color: ACCENT }}>▌</span>}
          </div>
        </PanelCard>
      </div>
    </PageShell>
  );
}
