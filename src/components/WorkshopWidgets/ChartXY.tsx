import { useEffect, useState, useMemo } from "react";
import { COLORS as C } from "@/domain/colors";
import { apiGet } from "@/lib/wave1";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function ChartXY({ config }: { config: any }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const source = config.dataSource || "/v1/ontology/objects";
    apiGet(source)
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : res?.objects || res?.items || [];
        setRows(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [config.dataSource]);

  const chartType = config.chartType || "line";
  const xKey = config.bindings?.x || "label";
  const yKey = config.bindings?.y || config.field || "score";

  const data = useMemo(() => {
    return rows
      .map((r) => {
        const x = r[xKey] ?? r.props?.[xKey] ?? r.id;
        const y = Number(r[yKey] ?? r.props?.[yKey]);
        return { x: String(x), y: Number.isFinite(y) ? y : 0 };
      })
      .filter((d) => d.x !== undefined);
  }, [rows, xKey, yKey]);

  if (loading) return <div style={{ color: C.text, fontSize: 10, padding: 12 }}>◌ LOADING…</div>;
  if (error) return <div style={{ color: C.red, fontSize: 10, padding: 12 }}>⚠ {String(error.message || error)}</div>;
  if (data.length === 0) return <div style={{ color: C.text, fontSize: 10, padding: 12 }}>No data available</div>;

  const accent = config.accent || C.blue;

  return (
    <div style={{ padding: 8, height: "100%", minHeight: 140 }}>
      <div style={{ fontSize: 8, color: C.text, letterSpacing: 1.2, marginBottom: 6, textTransform: "uppercase" }}>
        {config.title || "Chart"}
      </div>
      <ResponsiveContainer width="100%" height="85%">
        {chartType === "bar" ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.borderB} />
            <XAxis dataKey="x" tick={{ fill: C.text, fontSize: 9 }} />
            <YAxis tick={{ fill: C.text, fontSize: 9 }} />
            <Tooltip
              contentStyle={{
                background: C.glass,
                border: `1px solid ${C.border}`,
                fontSize: 10,
                color: C.textB,
              }}
            />
            <Bar dataKey="y" fill={accent} />
          </BarChart>
        ) : chartType === "scatter" ? (
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke={C.borderB} />
            <XAxis dataKey="x" tick={{ fill: C.text, fontSize: 9 }} />
            <YAxis dataKey="y" tick={{ fill: C.text, fontSize: 9 }} />
            <Tooltip
              contentStyle={{
                background: C.glass,
                border: `1px solid ${C.border}`,
                fontSize: 10,
                color: C.textB,
              }}
            />
            <Scatter data={data} fill={accent} />
          </ScatterChart>
        ) : (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.borderB} />
            <XAxis dataKey="x" tick={{ fill: C.text, fontSize: 9 }} />
            <YAxis tick={{ fill: C.text, fontSize: 9 }} />
            <Tooltip
              contentStyle={{
                background: C.glass,
                border: `1px solid ${C.border}`,
                fontSize: 10,
                color: C.textB,
              }}
            />
            <Line type="monotone" dataKey="y" stroke={accent} dot={false} strokeWidth={1.5} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
