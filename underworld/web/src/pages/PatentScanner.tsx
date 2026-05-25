import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "@/lib/api";

export default function PatentScanner() {
  const [query, setQuery] = useState("solar inverter");
  const [onlyExpired, setOnlyExpired] = useState(true);

  const search = useMutation({
    mutationFn: () => api.searchPatents(query, 15, onlyExpired),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-xl uppercase tracking-[0.3em] text-glow-purple">Patent Scanner</h1>
        <p className="mt-1 text-[11px] text-zinc-500">
          Real USPTO PatentsView search via the backend. CPC classes outside the allow-list
          (chemistry, medicinals, weapons, nuclear) are filtered server-side.
        </p>
      </header>

      <form
        className="grid grid-cols-[1fr_auto_auto] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search.mutate();
        }}
      >
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title (e.g. lithium battery)"
        />
        <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-zinc-400">
          <input
            type="checkbox"
            checked={onlyExpired}
            onChange={(e) => setOnlyExpired(e.target.checked)}
          />
          Expired only
        </label>
        <button type="submit" className="btn" disabled={search.isPending}>
          <Search size={12} />
          {search.isPending ? "Scanning…" : "Scan"}
        </button>
      </form>

      <section className="panel">
        <div className="panel-header">
          <span>Results</span>
          <span className="text-zinc-500">{search.data?.length ?? 0}</span>
        </div>
        {search.isError ? (
          <div className="p-4 text-[10px] text-glow-rose">{(search.error as Error).message}</div>
        ) : null}
        <ul className="divide-y divide-glow-purple/10">
          {(search.data ?? []).map((p) => (
            <li key={p.id} className="p-4">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[11px] text-zinc-100">{p.title}</div>
                <span className="badge border-glow-amber/40 text-glow-amber">{p.id}</span>
              </div>
              <div className="mt-1 text-[10px] text-zinc-500">
                {p.cpc_class ?? "?"} · {p.grant_date ?? "no date"} ·{" "}
                {p.expired ? "EXPIRED" : "ACTIVE"} · src={p.source}
              </div>
              {p.abstract ? (
                <p className="mt-2 line-clamp-3 text-[10px] text-zinc-400">{p.abstract}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
