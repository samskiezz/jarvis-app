import { useEffect, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { apiGet } from "@/lib/wave1";

const MAP_W = 360;
const MAP_H = 180;

function project(lat: number, lng: number) {
  return {
    x: ((Number(lng) + 180) / 360) * MAP_W,
    y: ((90 - Number(lat)) / 180) * MAP_H,
  };
}

const LAND = [
  "M40,28 L82,24 L96,44 L78,70 L58,78 L46,60 L40,42 Z",
  "M84,92 L100,88 L104,116 L92,140 L82,130 L82,104 Z",
  "M168,30 L196,26 L200,44 L182,52 L170,46 Z",
  "M170,60 L208,56 L214,96 L196,128 L182,110 L172,82 Z",
  "M204,24 L300,22 L312,58 L268,74 L224,64 L204,44 Z",
  "M286,116 L322,112 L330,134 L300,142 L284,130 Z",
];

function geoOf(o: any) {
  const p = (o && (o.properties || o.props || o.geo || o)) || {};
  const lat = Number(p.lat ?? p.latitude ?? o?.lat ?? o?.latitude);
  const lng = Number(p.lng ?? p.lon ?? p.longitude ?? o?.lng ?? o?.lon ?? o?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

export default function MapWidget({ config }: { config: any }) {
  const [objects, setObjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const source = config.dataSource || "/v1/geo/objects";
    apiGet(source)
      .then((res) => {
        if (cancelled) return;
        const list = res?.objects || [];
        setObjects(list);
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

  const points = objects.map((o) => geoOf(o)).filter(Boolean) as { lat: number; lng: number }[];

  if (loading) return <div style={{ color: C.text, fontSize: 10, padding: 12 }}>◌ LOADING…</div>;
  if (error) return <div style={{ color: C.red, fontSize: 10, padding: 12 }}>⚠ {String(error.message || error)}</div>;
  if (points.length === 0) return <div style={{ color: C.text, fontSize: 10, padding: 12 }}>No data available</div>;

  return (
    <div style={{ padding: 8 }}>
      <div style={{ fontSize: 8, color: C.text, letterSpacing: 1.2, marginBottom: 6, textTransform: "uppercase" }}>
        {config.title || "Map"}
      </div>
      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        style={{ width: "100%", height: "auto", background: "rgba(0,0,0,0.25)", borderRadius: 4 }}
      >
        {LAND.map((d, i) => (
          <path key={i} d={d} fill="rgba(140,170,190,0.06)" stroke="none" />
        ))}
        {points.map((pt, i) => {
          const { x, y } = project(pt.lat, pt.lng);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={2.5}
              fill={C.gold}
              opacity={0.9}
            >
              <title>{`${pt.lat.toFixed(2)}, ${pt.lng.toFixed(2)}`}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}
