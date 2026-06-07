import { useEffect, useState, useMemo } from "react";
import { COLORS as C } from "@/domain/colors";
import { apiGet } from "@/lib/wave1";

function Sparkline({ values, color = C.neon, height = 40 }: { values: number[]; color?: string; height?: number }) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length < 2) return null;
  const W = 200;
  const max = Math.max(...nums.map(Math.abs), 1e-9);
  const step = W / (nums.length - 1);
  const y = (v: number) => height / 2 - (v / max) * (height / 2 - 3);
  const pts = nums.map((v, i) => `${i * step},${y(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <line x1="0" y1={height / 2} x2={W} y2={height / 2} stroke={C.border} strokeWidth="1" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

export default function MetricCard({ config }: { config: any }) {
  const [value, setValue] = useState<number | string>("—");
  const [sub, setSub] = useState<string>("");
  const [spark, setSpark] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const fetchData = async () => {
      try {
        if (config.seriesId) {
          const res = await apiGet(`/v1/workshop/series/${config.seriesId}/stats`);
          if (cancelled) return;
          setValue(res?.mean != null ? Number(res.mean).toFixed(2) : "—");
          setSub(`n=${res?.n || 0} · trend=${res?.direction || "flat"}`);
          // Build a fake spark from trend info if no series data available
          setSpark([]);
        } else {
          const source = config.dataSource || "/v1/ontology/objects";
          const res = await apiGet(source);
          if (cancelled) return;
          const list = Array.isArray(res) ? res : res?.objects || res?.items || [];
          setValue(list.length);
          setSub("objects");
          // If numeric field available, build a tiny spark
          const field = config.field || "score";
          const nums = list
            .map((r: any) => Number(r[field] ?? r.props?.[field]))
            .filter((n: number) => Number.isFinite(n));
          setSpark(nums.slice(0, 24));
        }
      } catch {
        setValue("—");
        setSub("error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [config.seriesId, config.dataSource, config.field]);

  const accent = config.accent || C.neon;

  return (
    <div style={{ padding: 10 }}>
      <div style={{ fontSize: 8, color: C.text, letterSpacing: 1.4, textTransform: "uppercase" }}>
        {config.title || "Metric"}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: accent,
          marginTop: 6,
          fontVariantNumeric: "tabular-nums",
          textShadow: `0 0 18px ${accent}55`,
        }}
      >
        {loading ? "◌" : value}
      </div>
      {!loading && <div style={{ fontSize: 8, color: C.text, marginTop: 4 }}>{sub}</div>}
      <div style={{ marginTop: 8 }}>{spark.length > 1 && <Sparkline values={spark} color={accent} />}</div>
    </div>
  );
}
