import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "@/lib/api";

interface Props {
  className?: string;
}

export default function StatusBanner({ className }: Props) {
  const status = useQuery({
    queryKey: ["service-status"],
    queryFn: () => api.serviceStatus(),
    refetchInterval: 15000,
  });
  const issues = useQuery({
    queryKey: ["known-issues"],
    queryFn: () => api.knownIssues(),
    refetchInterval: 60000,
  });

  const tone = useMemo(() => {
    const lag = status.data?.tick_lag_s ?? 0;
    const err = status.data?.last_error_ts;
    const issuesPresent = issues.data?.markdown?.toLowerCase().includes("open") &&
      !issues.data?.markdown?.toLowerCase().includes("no open issues");
    if (status.data && status.data.scheduler_running === false) return "error";
    if (lag > 30 || err || issuesPresent) return "warn";
    return "ok";
  }, [status.data, issues.data]);

  if (!status.data) return null;
  const toneCls = tone === "ok"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
    : tone === "warn"
    ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
    : "border-rose-500/40 bg-rose-500/10 text-rose-200";

  const lag = status.data.tick_lag_s;
  const issuesLine = (() => {
    if (!issues.data?.found) return null;
    const md = issues.data.markdown.toLowerCase();
    const open = md.includes("## open") && !md.includes("_no open issues_");
    return open ? "Open known issues" : null;
  })();

  return (
    <div className={`flex items-center justify-between gap-3 rounded-md border px-3 py-1.5 text-[10px] uppercase tracking-widest ${toneCls} ${className ?? ""}`}>
      <span className="flex items-center gap-2">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${
          tone === "ok" ? "bg-emerald-400 animate-pulse" : tone === "warn" ? "bg-amber-400" : "bg-rose-400"
        }`} />
        {status.data.service} v{status.data.version} · {status.data.scheduler_running ? "running" : "halted"}
      </span>
      <span className="flex items-center gap-3 font-mono normal-case">
        <span>{status.data.worlds} world(s)</span>
        {lag !== null && lag !== undefined ? <span>lag {lag.toFixed(1)}s</span> : null}
        {issuesLine ? <span>{issuesLine}</span> : null}
      </span>
    </div>
  );
}
