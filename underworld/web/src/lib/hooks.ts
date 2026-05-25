import { useEffect, useRef, useState } from "react";
import { API_BASE_URL, getApiKey } from "./config";

/** Subscribe to SSE events for a world. Uses fetch-based streaming so we
 * can attach the Bearer header (the native EventSource API can't). */
export function useWorldStream(worldId: string | undefined, enabled = true) {
  const [events, setEvents] = useState<{ kind: string; tick?: number; payload?: Record<string, unknown>; at?: string }[]>([]);
  const [connected, setConnected] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!worldId || !enabled) return;
    const ac = new AbortController();
    abortRef.current = ac;

    (async () => {
      try {
        const key = getApiKey();
        const res = await fetch(`${API_BASE_URL}/worlds/${worldId}/stream`, {
          headers: key ? { Authorization: `Bearer ${key}` } : undefined,
          signal: ac.signal,
        });
        if (!res.body) return;
        setConnected(true);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!ac.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const payload = line.replace(/^data:\s*/, "").trim();
            if (!payload) continue;
            try {
              const evt = JSON.parse(payload);
              if (evt.kind === "heartbeat") continue;
              setEvents((prev) => [evt, ...prev].slice(0, 100));
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.warn("[stream] error", err);
        }
      } finally {
        setConnected(false);
      }
    })();

    return () => {
      ac.abort();
      abortRef.current = null;
    };
  }, [worldId, enabled]);

  return { events, connected };
}
