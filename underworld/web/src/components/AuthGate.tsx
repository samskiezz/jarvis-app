import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, KeyRound, Skull } from "lucide-react";
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
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-0">
        {/* ambient glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/4 top-1/4 h-72 w-72 rounded-full bg-glow-purple/15 blur-3xl" />
          <div className="absolute right-1/4 bottom-1/4 h-72 w-72 rounded-full bg-glow-sky/10 blur-3xl" />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!keyInput.trim()) return;
            setApiKey(keyInput.trim());
            window.location.reload();
          }}
          className="relative z-10 w-[420px] rounded-xl border border-glow-purple/30 bg-ink-1/80 p-8 shadow-glow-strong backdrop-blur-md"
        >
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 rounded-md bg-gradient-to-br from-glow-purple via-glow-violet to-glow-sky opacity-90" />
              <div className="absolute inset-[2px] flex items-center justify-center rounded-[5px] bg-ink-0">
                <Skull size={18} className="text-glow-purple" />
              </div>
            </div>
            <div>
              <div className="font-display text-lg font-semibold tracking-wider text-zinc-100">
                UNDERWORLD
              </div>
              <div className="text-[9px] uppercase tracking-[0.3em] text-glow-purple/80">
                v0.2 · master reference
              </div>
            </div>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-zinc-400">
            A swarm-simulation engine for AI-led discovery, grounded in expired-patent corpora and
            the V2 Master Reference. Sign in with your bearer key to begin.
          </p>

          <label className="mt-6 block">
            <span className="page-eyebrow flex items-center gap-1">
              <KeyRound size={10} />
              Bearer key
            </span>
            <input
              type="password"
              autoFocus
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="• • • • • • • • • • • •"
              className="input mt-2"
            />
          </label>

          <button type="submit" className="btn-primary mt-4 w-full justify-center">
            Authenticate
            <ArrowRight size={11} />
          </button>

          {meQuery.isError ? (
            <div className="mt-3 rounded border border-glow-rose/30 bg-glow-rose/5 px-3 py-2 text-[10px] text-glow-rose">
              The previous key was rejected. Try again.
            </div>
          ) : null}

          <div className="mt-6 border-t border-glow-purple/10 pt-3 text-[9px] uppercase tracking-widest text-zinc-600">
            Backend validates against /auth/me
          </div>
        </form>
      </div>
    );
  }

  if (meQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-0">
        <div className="flex items-center gap-3 rounded-md border border-glow-purple/20 bg-ink-1 px-4 py-3">
          <div className="h-2 w-2 animate-pulse-glow rounded-full bg-glow-purple" />
          <span className="text-[10px] uppercase tracking-[0.3em] text-glow-purple/80">
            authenticating
          </span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
