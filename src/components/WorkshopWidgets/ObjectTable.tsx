import { useEffect, useState, useMemo } from "react";
import { COLORS as C } from "@/domain/colors";
import { apiGet } from "@/lib/wave1";

export default function ObjectTable({ config }: { config: any }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
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

  const filtered = useMemo(() => {
    let data = rows;
    const filters = config.filters || {};
    for (const [k, v] of Object.entries(filters)) {
      if (v === undefined || v === null || v === "") continue;
      data = data.filter((r) => {
        const val = r[k] ?? r.props?.[k];
        return String(val).toLowerCase().includes(String(v).toLowerCase());
      });
    }
    return data;
  }, [rows, config.filters]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? a.props?.[sortKey] ?? "";
      const bv = b[sortKey] ?? b.props?.[sortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  if (loading) return <div style={{ color: C.text, fontSize: 10, padding: 12 }}>◌ LOADING…</div>;
  if (error) return <div style={{ color: C.red, fontSize: 10, padding: 12 }}>⚠ {String(error.message || error)}</div>;
  if (sorted.length === 0) return <div style={{ color: C.text, fontSize: 10, padding: 12 }}>No data available</div>;

  const keys = Object.keys(sorted[0] || {}).filter((k) => k !== "props");
  const propKeys = new Set<string>();
  sorted.forEach((r) => {
    if (r.props && typeof r.props === "object") Object.keys(r.props).forEach((k) => propKeys.add(k));
  });
  const allCols = [...keys, ...Array.from(propKeys)];

  const toggleSort = (k: string) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  return (
    <div style={{ overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
        <thead>
          <tr>
            {allCols.map((k) => (
              <th
                key={k}
                onClick={() => toggleSort(k)}
                style={{
                  textAlign: "left",
                  padding: "6px 8px",
                  borderBottom: `1px solid ${C.border}`,
                  color: C.text,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {k} {sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i}>
              {allCols.map((k) => {
                const val = r[k] ?? r.props?.[k] ?? "";
                return (
                  <td
                    key={k}
                    style={{
                      padding: "5px 8px",
                      borderBottom: `1px solid ${C.borderB}`,
                      color: C.textB,
                      maxWidth: 180,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={String(val)}
                  >
                    {String(val).slice(0, 40)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
