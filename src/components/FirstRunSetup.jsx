/**
 * FirstRunSetup — the first-time install/initialise pop-up.
 *
 * On first load it checks the backend + whether the platform has data. If the data
 * is empty (a fresh deploy), it shows an "Initialise System" modal that runs the
 * autobuild (load → project → scrape → live feeds → snapshot) with live progress,
 * then marks setup done and gets out of the way. Versions advance after: bumping
 * SETUP_VERSION re-offers setup. If the backend is unreachable it shows exactly
 * what to fix (the #1 cause of an all-zeros deploy).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { appParams } from "@/lib/app-params";
import { apiGet, apiPost } from "@/lib/wave1";

const SETUP_VERSION = "1";
const KEY = "jarvis_setup_done_v";

export default function FirstRunSetup() {
  const [phase, setPhase] = useState("checking"); // checking|offline|needs_setup|installing|ready
  const [, setDetail] = useState(null);
  const [log, setLog] = useState([]);
  const pollRef = useRef(null);

  const done = () => { try { localStorage.setItem(KEY, SETUP_VERSION); } catch { /* */ } };
  const wasDone = () => { try { return localStorage.getItem(KEY) === SETUP_VERSION; } catch { return false; } };

  const check = useCallback(async () => {
    try {
      const s = await apiGet("/v1/jarvis/system/status");
      const objs = s?.gotham?.ontology_objects || 0;
      const eps = s?.foundry?.endpoints || 0;
      setDetail(s);
      if (objs > 200 || eps > 0) { setPhase("ready"); done(); }
      else if (wasDone()) setPhase("ready");
      else setPhase("needs_setup");
    } catch {
      setPhase("offline");
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  const addLog = (m) => setLog((l) => [...l.slice(-6), m]);

  const install = async () => {
    setPhase("installing");
    addLog("Starting autobuild — load · project · scrape · live feeds…");
    try {
      apiPost("/v1/jarvis/system/autobuild?scrape_batches=1", {}).then((r) => {
        addLog(`Build complete (+${r?.fetched_this_run ?? 0} docs).`);
      }).catch(() => addLog("Build call returned — verifying data…"));
    } catch { /* */ }
    // poll status until the graph has data
    let n = 0;
    pollRef.current = setInterval(async () => {
      n += 1;
      try {
        const s = await apiGet("/v1/jarvis/system/status");
        const objs = s?.gotham?.ontology_objects || 0;
        const eps = s?.foundry?.endpoints || 0;
        addLog(`Foundry ${eps.toLocaleString()} endpoints · Gotham ${objs.toLocaleString()} objects`);
        setDetail(s);
        if (objs > 200 || eps > 0) {
          clearInterval(pollRef.current); done(); setPhase("ready");
        }
      } catch { /* keep polling */ }
      if (n > 40) { clearInterval(pollRef.current); done(); setPhase("ready"); }
    }, 4000);
  };

  useEffect(() => () => clearInterval(pollRef.current), []);

  if (phase === "checking" || phase === "ready") return null;

  const C = { bg: "rgba(2,8,14,0.97)", neon: "#00e0c8", blue: "#3ad8ff", red: "#ff3b6b", gold: "#e8a800", text: "#8aa", textB: "#cfe9dc", border: "rgba(0,200,160,0.25)" };
  const apiUrl = appParams.apiBaseUrl;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,2,6,0.86)", backdropFilter: "blur(6px)", fontFamily: "'JetBrains Mono',monospace" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 480, maxWidth: "92vw", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12,
        boxShadow: "0 12px 60px rgba(0,0,0,0.8)", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: phase === "offline" ? C.red : C.neon, boxShadow: `0 0 10px ${phase === "offline" ? C.red : C.neon}` }} />
          <span style={{ color: C.neon, letterSpacing: 3, fontWeight: 700 }}>JARVIS · FIRST-RUN SETUP</span>
        </div>

        {phase === "offline" && (
          <div style={{ padding: 20, color: C.textB, fontSize: 12, lineHeight: 1.7 }}>
            <div style={{ color: C.red, fontWeight: 700, marginBottom: 8 }}>Backend not reachable</div>
            The UI cannot reach the API at <code style={{ color: C.gold }}>{apiUrl}</code>.
            <div style={{ marginTop: 10, fontSize: 11, color: C.text }}>On the server, start it:</div>
            <pre style={{ background: "rgba(0,0,0,0.5)", padding: 10, borderRadius: 6, fontSize: 10, color: C.blue, overflowX: "auto" }}>
{`cd jarvis-app
pip install -r server/requirements.txt
python -m uvicorn server.main:app --host 0.0.0.0 --port 8000`}</pre>
            <div style={{ fontSize: 10, color: C.text }}>It must bind <b>0.0.0.0:8000</b> (not localhost) so this page can reach it.</div>
            <button onClick={check} style={btn(C.neon)}>↻ Retry</button>
          </div>
        )}

        {phase === "needs_setup" && (
          <div style={{ padding: 20, color: C.textB, fontSize: 12, lineHeight: 1.7 }}>
            <div style={{ color: C.gold, fontWeight: 700, marginBottom: 8 }}>System is empty — initialise it now</div>
            This loads the full dataset, projects the ontology (Foundry → Gotham),
            ingests live feeds, scrapes new documents, and snapshots everything.
            One click; it then runs on its own and versions advance from here.
            <button onClick={install} style={btn(C.neon, true)}>⚡ Initialise System</button>
            <button onClick={() => { done(); setPhase("ready"); }} style={{ ...btn(C.text), marginLeft: 8 }}>Skip</button>
          </div>
        )}

        {phase === "installing" && (
          <div style={{ padding: 20, color: C.textB, fontSize: 12 }}>
            <div style={{ color: C.neon, fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <Spinner color={C.neon} /> Building the platform…
            </div>
            <div style={{ background: "rgba(0,0,0,0.5)", borderRadius: 6, padding: 10, minHeight: 120, fontSize: 10, color: C.blue, display: "flex", flexDirection: "column", gap: 4 }}>
              {log.map((l, i) => <div key={i}>› {l}</div>)}
            </div>
            <div style={{ fontSize: 9, color: C.text, marginTop: 8 }}>This can take a minute on first run. You can keep using the app.</div>
            <button onClick={() => { done(); setPhase("ready"); }} style={{ ...btn(C.text), marginTop: 10 }}>Run in background</button>
          </div>
        )}
      </div>
    </div>
  );
}

const btn = (color, primary) => ({
  marginTop: 14, padding: "9px 16px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
  fontSize: 11, fontWeight: 700, letterSpacing: 1,
  background: primary ? color + "22" : "transparent", border: `1px solid ${color}66`, color,
});

function Spinner({ color }) {
  return <span style={{ display: "inline-block", width: 12, height: 12, border: `2px solid ${color}40`,
    borderTopColor: color, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />;
}
