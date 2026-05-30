import { useEffect, useRef, useState } from "react";

interface Props {
  /** Public URL of the Pixel Streaming signaling server (Unreal /
   *  Pixel-Streaming-Infrastructure or NVIDIA CloudXR endpoint). */
  signalingUrl: string;
  /** Auto-connect on mount. Default true. */
  autoConnect?: boolean;
  /** Resolution sent to the streamer (request side). */
  width?: number;
  height?: number;
  /** Override the world id to send to the Unreal client so it joins the same
   * simulation room as the React UI. */
  worldId?: string;
}

// Unreal Engine 5 Pixel Streaming bridge.
//
// Renders the Unreal client's video stream inside an iframe, with input
// forwarding (mouse/keyboard) handled by the official frontend served from
// the signaling server. This is how AAA-quality games run in a browser tab —
// Fortnite/UEFN previews, Roblox studio web, Resident Evil cloud demos all
// use this exact technique.
//
// The Unreal-side instance runs on a GPU-equipped VPS, renders a real UE5
// scene with Lumen GI + Nanite + hardware ray tracing, captures it via the
// PixelStreaming plugin, encodes to H.264/H.265, and ships frames over
// WebRTC to whichever browser opens this iframe.
//
// To wire it up to projectsolar.cloud:
//   1. GPU VPS with NVIDIA driver + Docker
//   2. docker run -e SIGNALLING_URL=wss://projectsolar.cloud/ws ...
//      epicgames/pixel-streaming-signalling
//   3. Run the Unreal client headless against the signaling URL
//   4. Set signalingUrl="https://projectsolar.cloud/pixelstream/" here
export default function PixelStreamingViewer({
  signalingUrl,
  autoConnect = true,
  width = 1280,
  height = 720,
  worldId,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!autoConnect) return;
    // The signaling server's frontend handles WebRTC negotiation internally;
    // we just load it. Once the iframe DOMContentLoaded fires we send the
    // world id as a custom message via the PixelStreaming JS API.
    const onLoad = () => setConnected(true);
    const onErr = () => setError("Pixel-Streaming signaling endpoint unreachable. Is the GPU host up?");
    const f = iframeRef.current;
    if (!f) return;
    f.addEventListener("load", onLoad);
    f.addEventListener("error", onErr);
    return () => {
      f.removeEventListener("load", onLoad);
      f.removeEventListener("error", onErr);
    };
  }, [autoConnect]);

  // Forward worldId once the streamer is ready. The Unreal-side `WorldClient`
  // listens on the PixelStreaming `OnInputEvent` channel for JSON commands.
  useEffect(() => {
    if (!connected || !worldId) return;
    const msg = { type: "set_world", world_id: worldId };
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }, [connected, worldId]);

  // Forward keyboard events from the parent into the iframe so the user
  // doesn't have to click into the stream to get focus first. This matches
  // what RuneScape's native NXT loader does.
  useEffect(() => {
    if (!connected) return;
    const fwd = (e: KeyboardEvent) => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "key", key: e.key, down: e.type === "keydown" }, "*",
      );
    };
    window.addEventListener("keydown", fwd);
    window.addEventListener("keyup", fwd);
    return () => {
      window.removeEventListener("keydown", fwd);
      window.removeEventListener("keyup", fwd);
    };
  }, [connected]);

  return (
    <div style={{ position: "relative", width, height }}>
      <iframe
        ref={iframeRef}
        src={`${signalingUrl}?AutoPlayVideo=true&AutoConnect=true&MatchViewportRes=true&hideUI=true`}
        title="Underworld Unreal Pixel Stream"
        width={width}
        height={height}
        allow="autoplay; encrypted-media; gamepad; xr-spatial-tracking; fullscreen"
        style={{
          border: "none",
          borderRadius: 8,
          background: "#020509",
          display: "block",
        }}
      />
      {!connected && !error ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-zinc-400">
          Connecting to GPU streamer…
        </div>
      ) : null}
      {error ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-red-950/40 text-xs text-red-200">
          {error}
        </div>
      ) : null}
      <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-glow-jade/40 bg-glow-jade/15 px-2 py-1 text-[9px] uppercase tracking-widest text-glow-jade backdrop-blur">
        {connected ? "● UE5 PIXEL STREAM" : "○ CONNECTING"}
      </div>
    </div>
  );
}
