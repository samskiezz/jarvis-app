// @ts-nocheck
import { useState, useEffect, useCallback } from "react";
import { PageShell, PanelCard } from "@/components/PageKit";
import { COLORS as C } from "@/domain/colors";
import { apiGet, apiPost } from "@/lib/wave1";
import HoloCAD from "@/components/HoloCAD/HoloCAD";

interface CatalogItem {
  id: string;
  type: string;
  label: string;
}

export default function HoloCADPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawInput, setRawInput] = useState("");

  useEffect(() => {
    apiGet("/v1/sci/3d/catalog")
      .then((res: any) => {
        setCatalog(res?.datasets || []);
      })
      .catch(() => setCatalog([]));
  }, []);

  const loadDataset = useCallback(async (item: CatalogItem) => {
    setLoading(true);
    setError(null);
    try {
      let payload: any = {};
      if (item.type === "molecule") {
        if (item.id === "water") {
          payload = {
            atoms: [
              { element: "O", x: 0, y: 0, z: 0 },
              { element: "H", x: 0.96, y: 0, z: 0 },
              { element: "H", x: -0.24, y: 0.93, z: 0 },
            ],
            bonds: [[0, 1], [0, 2]],
          };
        } else if (item.id === "caffeine") {
          payload = {
            atoms: [
              { element: "C", x: 0, y: 0, z: 0 },
              { element: "N", x: 1.4, y: 0, z: 0 },
              { element: "C", x: 2.2, y: 1.2, z: 0 },
              { element: "O", x: 1.8, y: -1.1, z: 0 },
              { element: "C", x: 3.6, y: 1.0, z: 0 },
              { element: "N", x: 4.2, y: -0.2, z: 0 },
            ],
            bonds: [[0, 1], [1, 2], [1, 3], [2, 4], [4, 5]],
          };
        } else {
          payload = { atoms: [{ element: "C", x: 0, y: 0, z: 0 }], bonds: [] };
        }
        const res = await apiPost("/v1/sci/3d/molecule", payload);
        setData({ type: "molecule", points: res.atoms, bonds: res.bonds, meta: { id: item.id, label: item.label } });
      } else if (item.type === "trajectory") {
        payload = { waypoints: [[0, 0, 0], [2, 1, 1], [4, 0, 2], [6, 2, 3], [8, 0, 4]], steps: 80 };
        const res = await apiPost("/v1/sci/3d/trajectory", payload);
        setData({ type: "trajectory", points: res.interpolated, meta: { id: item.id, label: item.label } });
      } else if (item.type === "orbital") {
        payload = { a: 7000, e: 0.1, i: 45, omega: 30, raan: 60, nu_steps: 120 };
        const res = await apiPost("/v1/sci/3d/orbital", payload);
        setData({ type: "orbital", points: res.points, meta: { id: item.id, label: item.label, params: res.params } });
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load dataset");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRaw = useCallback(() => {
    try {
      const parsed = JSON.parse(rawInput);
      if (parsed.points || parsed.atoms) {
        const type = parsed.type || "molecule";
        const points = parsed.atoms || parsed.points || [];
        const bonds = parsed.bonds || [];
        setData({ type, points, bonds, meta: { source: "raw" } });
        setError(null);
      } else {
        setError("JSON must contain 'points' or 'atoms'");
      }
    } catch {
      setError("Invalid JSON");
    }
  }, [rawInput]);

  // URL param support
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type");
    const dataset = params.get("dataset");
    if (type && catalog.length) {
      const item = catalog.find((c) => c.id === dataset) || { id: dataset || "custom", type, label: "Custom" };
      loadDataset(item as CatalogItem);
    }
  }, [catalog, loadDataset]);

  return (
    <PageShell title="HOLOCAD" subtitle="Holographic Scientific Visualiser" accent={C.blue}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        <div>
          <HoloCAD data={data} title="HoloCAD Viewer" />
          {error && (
            <div style={{ marginTop: 10, color: C.red, fontSize: 10, padding: 8, border: `1px solid ${C.red}33`, borderRadius: 4, background: C.redD }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <PanelCard title="CATALOG" accent={C.blue}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {catalog.map((item) => (
                <button
                  key={item.id}
                  onClick={() => loadDataset(item)}
                  disabled={loading}
                  style={{
                    textAlign: "left", padding: "8px 10px", borderRadius: 4,
                    background: "rgba(0,150,212,0.08)", border: `1px solid ${C.blue}33`,
                    color: C.textB, fontSize: 10, cursor: "pointer", fontFamily: "inherit",
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  <span style={{ color: C.blue, fontWeight: 700 }}>{item.label}</span>
                  <span style={{ color: C.text, marginLeft: 8, fontSize: 8 }}>{item.type.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </PanelCard>

          <PanelCard title="RAW DATA" accent={C.neon}>
            <textarea
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder={'{"type":"molecule","atoms":[...],"bonds":[...]}'}
              style={{
                width: "100%", height: 120, background: "rgba(0,0,0,0.3)",
                border: `1px solid ${C.border}`, borderRadius: 4, color: C.textB,
                fontSize: 9, padding: 8, fontFamily: "inherit", resize: "vertical",
              }}
            />
            <button
              onClick={loadRaw}
              style={{
                marginTop: 8, padding: "6px 12px", borderRadius: 4,
                background: "rgba(0,200,120,0.12)", border: `1px solid ${C.neon}44`,
                color: C.neon, fontSize: 10, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Load JSON
            </button>
          </PanelCard>
        </div>
      </div>
    </PageShell>
  );
}
