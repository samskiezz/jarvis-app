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
import HoloCore from "@/components/Jarvis/HoloCore";
import { PLANE_MODELS } from "@/three/modelRegistry";

export default function Setup() {
  const [status, setStatus] = useState(null);
  const [llm, setLlm] = useState(null);
  const [offline, setOffline] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle|installing
  const [log, setLog] = useState([]);
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

  const g = status?.gotham || {}, f = status?.foundry || {};
  const objs = g.ontology_objects || 0, eps = f.endpoints || 0;
  const initialised = objs > 200 || eps > 0;
  const llmOn = llm?.available;
  const core = PLANE_MODELS.jarvis; // GPU-rendered JARVIS core avatar (Iron Man arc-reactor)

  return (
    <PageShell title="SYSTEM SETUP" subtitle="INSTALL · POWER ON · CONNECT THE LLM" accent="#00e0c8"
      actions={<Badge color={offline ? C.red : initialised ? C.neon : C.gold}>
        {offline ? "BACKEND OFFLINE" : initialised ? "ONLINE" : "NOT INITIALISED"}</Badge>}>

      {/* ── GPU-rendered holographic JARVIS core (WebGL · ACES + UnrealBloom) ─ */}
      <PanelCard title="JARVIS CORE · WEBGL · ACES+BLOOM" accent={core.color} noPad>
        <div style={{ borderRadius: 8, overflow: "hidden",
          background: "radial-gradient(circle at 50% 45%, rgba(8,24,44,0.7), rgba(0,2,6,0.95))" }}>
          {/* HoloCore loads the jarvis_core_avatar GLB; falls back to the procedural
              arc-reactor core gracefully if the model is missing. */}
          <HoloCore color={core.color} glbUrl={core.model} height={420} />
        </div>
      </PanelCard>

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
      <PanelCard title="2 · DATA" accent={C.neon}>
        <Grid min={140} gap={10}>
          <StatTile label="Endpoints" value={(f.endpoints || 0).toLocaleString()} accent={C.neon} sub="Foundry" />
          <StatTile label="Objects" value={(g.ontology_objects || 0).toLocaleString()} accent={C.neon} sub="Gotham" />
          <StatTile label="Neurons" value={(g.neurons || 0).toLocaleString()} accent={C.neon} />
          <StatTile label="Scraped docs" value={(g.scraped_live || 0).toLocaleString()} accent={C.neon} />
        </Grid>
      </PanelCard>

      {/* ── connect the LLM (the Iron Man brain) ────────────────────────── */}
      <PanelCard title="3 · CONNECT THE LLM (JARVIS BRAIN)" accent={llmOn ? C.neon : C.gold}
        right={<Badge color={llmOn ? C.neon : C.gold}>{llmOn ? `ONLINE · ${llm?.backend}` : "NOT CONNECTED"}</Badge>}>
        {llmOn ? (
          <div style={{ color: C.textB, fontSize: 12 }}>
            JARVIS is reasoning with <b>{llm?.backend}</b>. Voice + tool-use are live.
          </div>
        ) : (
          <div style={{ color: C.textB, fontSize: 12, lineHeight: 1.8 }}>
            The chat says "no LLM" because no model backend is reachable yet. JARVIS
            falls back to grounded search until you connect one. On your <b>vast.ai GPU</b>:
            <pre style={pre}>{`# on the GPU box
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.1:8b
ollama serve   # serves on :11434`}</pre>
            Then tell the backend where it is and restart it:
            <pre style={pre}>{`export OLLAMA_HOST=http://<gpu-ip>:11434
# restart: API_PORT=8001 ./serve.sh`}</pre>
            Now JARVIS reasons on your GPU — the "Iron Man" brain.
          </div>
        )}
      </PanelCard>
    </PageShell>
  );
}

const pre = { background: "rgba(0,0,0,0.55)", padding: 10, borderRadius: 6, fontSize: 10,
  color: "#3ad8ff", overflowX: "auto", margin: "8px 0" };
const btn = (color, primary) => ({ padding: "11px 20px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
  fontSize: 13, fontWeight: 700, letterSpacing: 1, background: primary ? color + "22" : "transparent",
  border: `1px solid ${color}88`, color });
