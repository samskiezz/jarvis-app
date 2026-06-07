import { useEffect, useState, useMemo } from "react";
import { COLORS as C } from "@/domain/colors";
import { apiGet } from "@/lib/wave1";

export default function FilterList({ config, onChange }: { config: any; onChange?: (cfg: any) => void }) {
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

  const field = config.field || "type";

  const facets = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => {
      const val = r[field] ?? r.props?.[field] ?? "(empty)";
      map.set(val, (map.get(val) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows, field]);

  const selected = config.filters?.[field] || "";

  const toggle = (val: string) => {
    const next = val === selected ? "" : val;
    onChange?.({ ...config, filters: { ...(config.filters || {}), [field]: next } });
  };

  if (loading) return <div style={{ color: C.text, fontSize: 10, padding: 12 }}>◌ LOADING…</div>;
  if (error) return <div style={{ color: C.red, fontSize: 10, padding: 12 }}>⚠ {String(error.message || error)}</div>;
  if (facets.length === 0) return <div style={{ color: C.text, fontSize: 10, padding: 12 }}>No data available</div>;

  return (
    <div style={{ padding: 8 }}>
      <div style={{ fontSize: 8, color: C.text, letterSpacing: 1.2, marginBottom: 8, textTransform: "uppercase" }}>
        {config.title || field}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {facets.map(([val, count]) => {
          const active = selected === val;
          return (
            <div
              key={val}
              onClick={() => toggle(val)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 8px",
                borderRadius: 4,
                cursor: "pointer",
                border: `1px solid ${active ? C.neon : C.borderB}`,
                background: active ? `${C.neon}14` : "transparent",
              }}
            >
              <span style={{ fontSize: 9, color: active ? C.neon : C.textB, flex: 1 }}>{val}</span>
              <span
                style={{
                  fontSize: 8,
                  color: C.text,
                  background: "rgba(255,255,255,0.06)",
                  padding: "1px 6px",
                  borderRadius: 3,
                }}
              >
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
