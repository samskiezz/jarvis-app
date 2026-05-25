import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getApiKey, setApiKey } from "@/lib/config";

export default function AuthGate({ children }: { children: ReactNode }) {
  const [keyInput, setKeyInput] = useState("");
  const stored = getApiKey();

  const meQuery = useQuery({
    queryKey: ["auth", "me", stored],
    queryFn: api.me,
    enabled: !!stored,
    retry: false,
  });

  if (!stored || meQuery.isError) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!keyInput.trim()) return;
          setApiKey(keyInput.trim());
          window.location.reload();
        }}
        className="flex min-h-screen items-center justify-center bg-ink-0"
      >
        <div className="w-[360px] rounded-md border border-glow-purple/30 bg-ink-1 p-6 shadow-[0_0_32px_rgba(168,85,247,0.15)]">
          <div className="text-[10px] uppercase tracking-[0.3em] text-glow-purple">UNDERWORLD</div>
          <div className="mt-1 text-[11px] text-zinc-400">
            Bearer key — validated against the backend at /auth/me.
          </div>
          <input
            type="password"
            autoFocus
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="API key"
            className="input mt-4"
          />
          <button type="submit" className="btn mt-3 w-full justify-center">
            AUTHENTICATE
          </button>
          {meQuery.isError ? (
            <div className="mt-3 text-[10px] text-glow-rose">
              The previous key was rejected. Try again.
            </div>
          ) : null}
        </div>
      </form>
    );
  }

  if (meQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[10px] uppercase tracking-[0.3em] text-glow-purple/70">
        · authenticating ·
      </div>
    );
  }

  return <>{children}</>;
}
