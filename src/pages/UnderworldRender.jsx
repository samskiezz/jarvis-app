/**
 * UnderworldRender — the ONE-CLICK installer for the Underworld UE5 render.
 *
 * A single button runs the entire pipeline that used to take days of manual work: build the game
 * module, author the level, cook + package the Linux Shipping client, then (gated) ship it to the
 * GPU box and stream it. It polls the same `/v1/pipeline` status the Fleet Control panel uses, so
 * you watch every step finish live with an ETA. Re-runnable any time — it resumes off existing
 * outputs, so a second click is fast.
 */
import { useCallback, useEffect, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { appParams } from "@/lib/app-params";
import { PageShell, PanelCard, Grid, StatTile } from "@/components/PageKit";

const VIOLET = "#7A5CFF";
const POLL_MS = 3000;
const API = () => appParams.apiBaseUrl;
const auth = () => (appParams.apiKey ? { Authorization: `Bearer ${appParams.apiKey}` } : {});

const fmtEta = (s) => {
  if (s == null) return "—";
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
};
const stCol = (st) => st === "done" ? C.neon : st === "running" ? C.blue
  : st === "failed" ? C.red : st === "stalled" ? C.gold : C.text;
const stIcon = (st, i) => st === "done" ? "✓" : st === "failed" ? "✗"
  : st === "running" ? "◔" : st === "stalled" ? "⚠" : i + 1;

// Plain-English description of what each pipeline step does (shown so the one click isn't a black box).
const WHAT = {
  mesh: "Give the crowd minions a visible body",
  module: "Compile the game code",
  level: "Build the world (sun · ground · minions)",
  package: "Cook + package the Linux game (the long one)",
  transfer: "Ship the build to the GPU box",
  vram: "Make room on the GPU",
  stream: "Start the live stream on the 4090",
};

export default function UnderworldRender() {
  const [pipe, setPipe] = useState(null);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API()}/v1/pipeline`, { headers: auth() });
      if (r.ok) setPipe(await r.json().catch(() => null));
    } catch { /* transient — keep last state */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const post = useCallback(async (path, startMsg) => {
    setBusy(true); setFlash(startMsg);
    try {
      const r = await fetch(`${API()}${path}`, { method: "POST", headers: auth() });
      const d = await r.json().catch(() => ({}));
      setFlash(d.already_running ? "already running…"
        : d.ok === false ? `✗ ${d.error || d.reason || "failed"}`
        : "✓ started");
      setTimeout(load, 700);
    } catch (e) { setFlash(`✗ ${e}`); }
    finally { setBusy(false); }
  }, [load]);

  const steps = pipe?.steps || [];
  const status = pipe?.status || "idle";
  const pct = pipe?.overall_pct || 0;
  const running = status === "running";
  const ready = status === "ready" || status === "done";
  const buildDone = steps.find((s) => s.id === "package")?.status === "done";
  const gpuLive = steps.find((s) => s.id === "stream")?.status === "done";
  const heroColor = status === "failed" || status === "stalled" ? C.red : ready ? C.neon : VIOLET;

  const bigBtn = (label, color, onClick, disabled) => (
    <button onClick={onClick} disabled={disabled}
      style={{ width: "100%", padding: "20px 24px", fontSize: 16, fontWeight: 800, letterSpacing: 2,
        fontFamily: "inherit", color: disabled ? C.textB : "#04060a",
        background: disabled ? "rgba(255,255,255,0.06)" : color,
        border: `1px solid ${color}`, borderRadius: 12, cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : `0 0 28px ${color}66`, transition: "all .2s" }}>
      {label}
    </button>
  );

  return (
    <PageShell title="UNDERWORLD RENDER" subtitle="ONE-CLICK BUILD → COOK → DEPLOY → STREAM" accent={VIOLET}>
      <Grid min={150} style={{ marginBottom: 16 }}>
        <StatTile label="Status" value={status.toUpperCase()} accent={heroColor} />
        <StatTile label="Progress" value={`${pct}%`} accent={VIOLET} />
        <StatTile label="ETA" value={running ? fmtEta(pipe?.eta_s) : ready ? "—" : "—"} accent={C.blue} />
        <StatTile label="GPU Stream" value={gpuLive ? "LIVE" : "—"} accent={gpuLive ? C.neon : C.text} />
      </Grid>

      {flash && (
        <div style={{ marginBottom: 12, fontSize: 12, letterSpacing: 1,
          color: flash.startsWith("✓") ? C.neon : flash.startsWith("✗") ? C.red : C.gold }}>{flash}</div>
      )}

      {/* THE button — one click runs everything. Becomes DEPLOY once the local build is done. */}
      <PanelCard accent={VIOLET}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {!buildDone
            ? bigBtn(running ? `⚙ BUILDING…  ${pct}%` : "⚡ ONE-CLICK BUILD",
                heroColor, () => post("/v1/pipeline/start", "launching the build…"), busy || running)
            : bigBtn(gpuLive ? "🎮 STREAM IS LIVE" : "🎮 DEPLOY TO GPU & STREAM",
                gpuLive ? C.neon : C.gold, () => post("/v1/pipeline/deploy", "deploying to the GPU…"),
                busy || gpuLive)}

          {/* progress bar */}
          <div style={{ height: 10, borderRadius: 6, background: "rgba(0,0,0,0.5)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: heroColor,
              boxShadow: `0 0 12px ${heroColor}`, transition: "width .5s ease" }} />
          </div>
          <div style={{ fontSize: 11, color: C.textB, textAlign: "center" }}>
            {status === "idle" ? "Press the button — it builds, cooks and packages the game, then waits for your OK to stream."
              : running ? `Working… ${fmtEta(pipe?.eta_s)} left. Safe to leave — it runs in the background.`
              : status === "ready" ? "Build complete & ready. Press DEPLOY to stream it on the GPU."
              : status === "failed" ? "Hit a snag — see the failing step below."
              : status === "stalled" ? "The run stopped unexpectedly — press the button to relaunch (it resumes where it left off)."
              : gpuLive ? "Live on the GPU. Enjoy." : ""}
          </div>
        </div>
      </PanelCard>

      {/* the playable link, once the stream is live */}
      {pipe?.play_url && (
        <a href={pipe.play_url} target="_blank" rel="noreferrer"
          style={{ display: "block", marginTop: 14, padding: "18px 24px", textAlign: "center",
            fontSize: 17, fontWeight: 800, letterSpacing: 2, textDecoration: "none", color: "#04060a",
            background: C.neon, border: `1px solid ${C.neon}`, borderRadius: 12,
            boxShadow: `0 0 30px ${C.neon}88` }}>
          ▶ PLAY NOW — {pipe.play_url.replace("https://", "")}
        </a>
      )}

      {/* live per-step checklist */}
      <PanelCard title="WHAT IT'S DOING" accent={VIOLET} style={{ marginTop: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(steps.length ? steps : Object.keys(WHAT).map((id) => ({ id, status: "pending" }))).map((s, i) => {
            const el = s.started ? ((s.ended || Date.now() / 1000) - s.started) : 0;
            return (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "28px 1fr 84px",
                gap: 10, alignItems: "center", padding: "9px 10px", borderRadius: 7,
                background: s.status === "running" ? VIOLET + "14" : "rgba(0,0,0,0.25)",
                border: `1px solid ${s.status === "running" ? VIOLET + "66" : C.border}` }}>
                <span style={{ color: stCol(s.status), fontWeight: 800, fontSize: 13, textAlign: "center" }}>
                  {stIcon(s.status, i)}
                </span>
                <span style={{ fontSize: 12, color: s.status === "pending" ? C.text : C.textB }}>
                  {WHAT[s.id] || s.label || s.id}
                </span>
                <span style={{ fontSize: 10, color: stCol(s.status), fontWeight: 700, textAlign: "right" }}>
                  {s.status === "running" ? fmtEta(el)
                    : s.status === "done" ? "done"
                    : s.status === "pending" ? `~${fmtEta(s.est_s)}`
                    : (s.status || "").toUpperCase()}
                </span>
              </div>
            );
          })}
          {steps.some((s) => s.status === "failed" || s.status === "stalled") && (
            <div style={{ fontSize: 10, color: C.red, marginTop: 4, whiteSpace: "pre-wrap" }}>
              {steps.find((s) => s.status === "failed" || s.status === "stalled")?.detail}
            </div>
          )}
        </div>
      </PanelCard>
    </PageShell>
  );
}
