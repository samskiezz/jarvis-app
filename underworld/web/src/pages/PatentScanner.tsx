import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, FileSearch, Search } from "lucide-react";
import { api } from "@/lib/api";
import EmptyState from "@/components/ui/EmptyState";

const QUICK_QUERIES = [
  "solar inverter",
  "lithium battery",
  "wind turbine blade",
  "neural network",
  "fuel cell electrode",
  "satellite antenna",
];

export default function PatentScanner() {
  const [query, setQuery] = useState("solar inverter");
  const [onlyExpired, setOnlyExpired] = useState(true);

  const search = useMutation({
    mutationFn: () => api.searchPatents(query, 25, onlyExpired),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <div className="page-eyebrow">Patent scanner</div>
        <h1 className="mt-1 page-title">USPTO PatentsView</h1>
        <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-zinc-500">
          Real-time search via the backend. The conservative CPC allow-list (chemistry / medicinals
          / weapons / nuclear are blocked) is enforced server-side. Minions use the same scanner
          when generating inventions.
        </p>
      </header>

      <section className="panel-elevated">
        <div className="panel-header">
          <span className="flex items-center gap-1.5">
            <Search size={11} />
            Query
          </span>
          <span>{search.data?.length ?? 0} hits</span>
        </div>
        <form
          className="space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            search.mutate();
          }}
        >
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <div className="relative">
              <Search size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                className="input pl-8"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title (e.g. lithium battery)"
              />
            </div>
            <label className="flex items-center gap-1.5 rounded-md border border-zinc-800 px-3 py-2 text-[10px] uppercase tracking-widest text-zinc-400">
              <input
                type="checkbox"
                checked={onlyExpired}
                onChange={(e) => setOnlyExpired(e.target.checked)}
                className="accent-glow-purple"
              />
              Expired only
            </label>
            <button type="submit" className="btn-primary" disabled={search.isPending}>
              <Search size={11} />
              {search.isPending ? "Scanning…" : "Scan"}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            <span className="text-zinc-500">Quick:</span>
            {QUICK_QUERIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuery(q)}
                className="rounded border border-zinc-800 px-2 py-0.5 text-zinc-400 hover:border-glow-purple/40 hover:text-glow-purple"
              >
                {q}
              </button>
            ))}
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <span>Results</span>
          <span>{search.data?.length ?? 0}</span>
        </div>
        {search.isError ? (
          <div className="rounded border border-glow-rose/30 bg-glow-rose/5 m-3 p-3 text-[10px] text-glow-rose">
            {(search.error as Error).message}
          </div>
        ) : null}
        {search.isPending ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-20 rounded" />)}
          </div>
        ) : search.data && search.data.length > 0 ? (
          <ul className="divide-y divide-glow-purple/10">
            {search.data.map((p) => (
              <li key={p.id} className="p-4 transition hover:bg-glow-purple/5">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-[12px] font-medium text-zinc-100">{p.title}</div>
                  <span
                    className={`badge font-mono ${p.expired ? "border-zinc-700 text-zinc-400" : "border-glow-jade/40 text-glow-jade"}`}
                  >
                    {p.id}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-widest">
                  <span className="text-glow-purple">{p.cpc_class ?? "?"}</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-400">{p.grant_date ?? "no date"}</span>
                  <span className="text-zinc-600">·</span>
                  <span className={p.expired ? "text-zinc-500" : "text-glow-jade"}>
                    {p.expired ? "expired" : "active"}
                  </span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-500">src={p.source}</span>
                </div>
                {p.abstract ? (
                  <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-zinc-400">
                    {p.abstract}
                  </p>
                ) : null}
                <div className="mt-2 flex items-center gap-2">
                  <a
                    href={`https://patents.google.com/patent/${p.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest text-glow-sky hover:text-glow-purple"
                  >
                    Google Patents <ExternalLink size={10} />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<FileSearch size={20} />}
            title={search.data ? "No matches" : "Run a query above"}
            hint={
              search.data
                ? "Try a different keyword, or untick 'expired only'."
                : "Search USPTO PatentsView and surface prior art."
            }
          />
        )}
      </section>
    </div>
  );
}
