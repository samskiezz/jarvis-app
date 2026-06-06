/**
 * Setup — the always-available install / control centre (the APEX landing page).
 * One big INITIALISE button powers the whole platform (load → project → scrape →
 * live feeds → snapshot), shows backend + LLM + data status, and tells you exactly
 * how to connect your GPU LLM. Unlike a one-shot pop-up, this is a real page you can
 * always come back to.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge } from "@/components/PageKit";
import { apiGet, apiPost } from "@/lib/wave1";
import { appParams } from "@/lib/app-params";

export default function Setup() {
  const [status, setStatus] = useState(null);
  const [llm, setLlm] = useState(null);
  const [offline, setOffline] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle|installing
  const [log, setLog] = useState([]);
  const [gpuUrl, setGpuUrl] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectMsg, setConnectMsg] = useState(null);
  const poll = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const s = await apiGet("/v1/jarvis/system/status");
      setStatus(s); setOffline(false);
      apiGet("/v1/jarvis/research/status").then(setLlm).catch(() => setLlm(null));
    } catch { setOffline(true); }
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 8000); return () => clearInterval(t); }, [refresh]);

  const addLog = (m) => setLog((l) => [...l.slice(-8), m]);
  const install = async () => {
    setPhase("installing"); addLog("Initialising — load · project · scrape · live feeds…");
    apiPost("/v1/jarvis/system/autobuild?scrape_batches=1", {})
      .then((r) => addLog(`Build complete (+${r?.fetched_this_run ?? 0} docs).`))
      .catch(() => addLog("Build running — verifying…"));
    let n = 0;
    poll.current = setInterval(async () => {
      n++; await refresh();
      try {
        const s = await apiGet("/v1/jarvis/system/status");
        const o = s?.gotham?.ontology_objects || 0, e = s?.foundry?.endpoints || 0;
        addLog(`Foundry ${e.toLocaleString()} endpoints · Gotham ${o.toLocaleString()} objects`);
        if (o > 200 || e > 0) { clearInterval(poll.current); setPhase("idle"); addLog("✓ System initialised."); }
      } catch { /* keep polling */ }
      if (n > 45) { clearInterval(poll.current); setPhase("idle"); }
    }, 4000);
  };
  useEffect(() => () => clearInterval(poll.current), []);

  const startGpu = () => { addLog("Starting GPU autopilot — continuous LLM research…");
    apiPost("/v1/jarvis/research/autopilot/start", {}).then(refresh).catch(() => {}); };
  const stopGpu = () => { addLog("Stopping GPU autopilot.");
    apiPost("/v1/jarvis/research/autopilot/stop", {}).then(refresh).catch(() => {}); };

  // Seed the input with the currently-configured host (unless the user is typing).
  useEffect(() => {
    const h = llm?.connection?.ollama_host;
    if (h && !gpuUrl && !h.includes("127.0.0.1")) setGpuUrl(h);
  }, [llm]); // eslint-disable-line react-hooks/exhaustive-deps

  const connectLlm = async () => {
    const url = (gpuUrl || "").trim();
    if (!url) { setConnectMsg({ ok: false, text: "Enter your GPU's Ollama URL, e.g. http://211.72.13.201:41138" }); return; }
    setConnecting(true); setConnectMsg(null);
    addLog(`Connecting LLM → ${url}…`);
    try {
      const r = await apiPost("/v1/jarvis/research/connect", { ollama_host: url });
      if (r?.ok) {
        setConnectMsg({ ok: true, text: `Connected ✓  models: ${(r.models || []).join(", ") || "(none pulled yet — run: ollama pull llama3.1:8b)"}` });
        addLog("✓ LLM connected — GPU autopilot will start hammering.");
        apiPost("/v1/jarvis/research/autopilot/start", {}).catch(() => {});
      } else {
        setConnectMsg({ ok: false, text: r?.hint || r?.error || "Not reachable from the backend." });
      }
      refresh();
    } catch { setConnectMsg({ ok: false, text: "Request failed — is the backend reachable?" }); }
    setConnecting(false);
  };

  const g = status?.gotham || {}, f = status?.foundry || {};
  const objs = g.ontology_objects || 0, eps = f.endpoints || 0;
  const initialised = objs > 200 || eps > 0;
  const llmOn = llm?.available;
  const ap = llm?.autopilot || {};
  const hammering = ap.running && !ap.idle_no_llm && (llmOn || ap.backend);
  const apBadge = !ap.running ? "OFF" : hammering ? "HAMMERING GPU" : "IDLE · WAITING FOR LLM";
  const apColor = !ap.running ? C.gold : hammering ? C.neon : C.gold;

  return (
    <PageShell title="SYSTEM SETUP" subtitle="INSTALL · POWER ON · CONNECT THE LLM" accent="#00e0c8"
      actions={<Badge color={offline ? C.red : initialised ? C.neon : C.gold}>
        {offline ? "BACKEND OFFLINE" : initialised ? "ONLINE" : "NOT INITIALISED"}</Badge>}>

      {/* ── the big install action ──────────────────────────────────────── */}
      <PanelCard title="1 · POWER ON" accent="#00e0c8">
        {offline ? (
          <div style={{ color: C.textB, fontSize: 12, lineHeight: 1.8 }}>
            <span style={{ color: C.red, fontWeight: 700 }}>Backend not reachable at {appParams.apiBaseUrl}.</span>
            <br />Start it on the server (bind 0.0.0.0, not localhost):
            <pre style={pre}>{`python -m uvicorn server.main:app --host 0.0.0.0 --port 8001`}</pre>
            <button onClick={refresh} style={btn("#00e0c8", true)}>↻ Retry</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ color: C.textB, fontSize: 12 }}>
              {initialised
                ? "System is initialised. You can re-run the build any time to grow the data."
                : "System is empty. Click to load the dataset, project the ontology, ingest live feeds and scrape — one click powers everything."}
            </div>
            <div>
              <button onClick={install} disabled={phase === "installing"} style={btn("#00e0c8", true)}>
                {phase === "installing" ? "⏳ Building…" : initialised ? "↻ Rebuild / Grow" : "⚡ Initialise System"}
              </button>
            </div>
            {log.length > 0 && (
              <div style={{ background: "rgba(0,0,0,0.5)", borderRadius: 6, padding: 10, fontSize: 10, color: "#3ad8ff",
                display: "flex", flexDirection: "column", gap: 3, maxHeight: 160, overflowY: "auto" }}>
                {log.map((l, i) => <div key={i}>› {l}</div>)}
              </div>
            )}
          </div>
        )}
      </PanelCard>

      {/* ── live data ───────────────────────────────────────────────────── */}
      <PanelCard title="2 · DATA — ONE CROSS-CORRELATED GRAPH" accent={C.neon}>
        <div style={{ color: C.textB, fontSize: 11, marginBottom: 8 }}>
          Foundry endpoints → Gotham objects → neurons, all tied together by cross-domain
          correlation edges — one shared graph every plane reads from.
        </div>
        <Grid min={130} gap={10}>
          <StatTile label="Endpoints" value={(f.endpoints || 0).toLocaleString()} accent={C.neon} sub="Foundry" />
          <StatTile label="Objects" value={(g.ontology_objects || 0).toLocaleString()} accent={C.neon} sub="Gotham" />
          <StatTile label="Neurons" value={(g.neurons || 0).toLocaleString()} accent={C.neon} />
          <StatTile label="Graph links" value={(g.links || 0).toLocaleString()} accent={C.neon} />
          <StatTile label="Correlations" value={(g.correlations || 0).toLocaleString()} accent="#00e0c8" sub="cross-domain" />
          <StatTile label="Scraped docs" value={(g.scraped_live || 0).toLocaleString()} accent={C.neon} />
        </Grid>
      </PanelCard>

      {/* ── connect the LLM (the Iron Man brain) ────────────────────────── */}
      <PanelCard title="3 · CONNECT THE LLM (JARVIS BRAIN)" accent={llmOn ? C.neon : C.gold}
        right={<Badge color={llmOn ? C.neon : C.gold}>{llmOn ? `ONLINE · ${llm?.backend}` : "NOT CONNECTED"}</Badge>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {llmOn ? (
            <div style={{ color: C.textB, fontSize: 12 }}>
              JARVIS is reasoning with <b>{llm?.backend}</b> at <b>{llm?.connection?.ollama_host}</b>. Voice + tool-use are live.
            </div>
          ) : (
            <div style={{ color: C.textB, fontSize: 12, lineHeight: 1.7 }}>
              Point JARVIS at your GPU's Ollama. On the GPU box, bind it to all interfaces so it's
              reachable from here:
              <pre style={pre}>{`OLLAMA_HOST=0.0.0.0:11434 ollama serve
ollama pull llama3.1:8b`}</pre>
              On <b>vast.ai</b>, enter the <b>external mapped port</b> for 11434 (from your instance's
              port list) — <b>not</b> 11434 itself. Then connect below — no restart, and it survives a
              new instance IP/port.
            </div>
          )}
          {/* live connect — persisted backend-side; no SSH/env/restart */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={gpuUrl} onChange={(e) => setGpuUrl(e.target.value)}
              placeholder={llm?.connection?.ollama_host || "http://211.72.13.201:41138"}
              onKeyDown={(e) => { if (e.key === "Enter") connectLlm(); }}
              style={{ flex: 1, minWidth: 240, padding: "10px 12px", borderRadius: 8,
                background: "rgba(0,0,0,0.5)", border: `1px solid ${(llmOn ? C.neon : C.gold)}66`,
                color: C.textB, fontFamily: "inherit", fontSize: 12 }} />
            <button onClick={connectLlm} disabled={connecting} style={btn("#00e0c8", true)}>
              {connecting ? "⏳ Testing…" : llmOn ? "↻ Reconnect" : "🔌 Connect GPU"}
            </button>
          </div>
          {connectMsg && (
            <div style={{ fontSize: 11, color: connectMsg.ok ? C.neon : C.red, lineHeight: 1.6 }}>
              {connectMsg.text}
            </div>
          )}
        </div>
      </PanelCard>

      {/* ── hammer the GPU (continuous autonomous research) ───────────────── */}
      <PanelCard title="4 · GPU AUTOPILOT (HAMMER THE GPU)" accent={apColor}
        right={<Badge color={apColor}>{apBadge}</Badge>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ color: C.textB, fontSize: 12, lineHeight: 1.7 }}>
            The autopilot continuously drives the LLM — decomposing topics, fetching
            grounded evidence and writing cited notes — so a connected GPU is{" "}
            <b>always reasoning</b> and the brain keeps growing.{" "}
            {ap.running
              ? (hammering
                  ? <>It's <b style={{ color: C.neon }}>running on {ap.backend}</b>.</>
                  : <>It's running but <b style={{ color: C.gold }}>no LLM is reachable yet</b> — connect your GPU (step 3) and it starts hammering automatically.</>)
              : "It's off — press Start to begin."}
          </div>
          <Grid min={140} gap={10}>
            <StatTile label="Topics researched" value={(ap.topics_researched || 0).toLocaleString()} accent={apColor} />
            <StatTile label="Notes injected" value={(ap.notes_injected || 0).toLocaleString()} accent={apColor} sub="grounded" />
            <StatTile label="Workers" value={(ap.concurrency || 0).toLocaleString()} accent={apColor} sub="concurrent" />
            <StatTile label="Last topic" value={ap.last_topic || "—"} accent={apColor} />
          </Grid>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={startGpu} disabled={!!ap.running} style={btn(C.neon, true)}>
              {ap.running ? "⚡ Running…" : "⚡ Start hammering the GPU"}
            </button>
            {ap.running && <button onClick={stopGpu} style={btn(C.gold, false)}>■ Stop</button>}
          </div>
        </div>
      </PanelCard>
    </PageShell>
  );
}

const pre = { background: "rgba(0,0,0,0.55)", padding: 10, borderRadius: 6, fontSize: 10,
  color: "#3ad8ff", overflowX: "auto", margin: "8px 0" };
const btn = (color, primary) => ({ padding: "11px 20px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
  fontSize: 13, fontWeight: 700, letterSpacing: 1, background: primary ? color + "22" : "transparent",
  border: `1px solid ${color}88`, color });
