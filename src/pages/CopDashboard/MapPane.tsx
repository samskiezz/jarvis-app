/**
 * MapPane — COP map pane showing entity layers with cross-pane selection.
 *
 * Reuses the live Leaflet map pattern from GeoWorkspace but in a contained
 * panel size. Clicking an entity triggers cross-pane highlight.
 */
import { useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { COLORS as C, SHELL as S } from "@/domain/colors";
import { panelStyle, panelHeaderStyle } from "./CopDashboard";

interface GeoObject {
  id: string;
  label?: string;
  type?: string;
  lat: number;
  lon: number;
  mark?: string;
}

interface Props {
  objects: GeoObject[];
  selection?: any;
  onSelect: (obj: GeoObject) => void;
}

const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTR = "&copy; OpenStreetMap &copy; CARTO";

const typeColor: Record<string, string> = {
  person: C.neon,
  org: C.blue,
  asset: C.gold,
  property: C.blue,
  risk: C.red,
  target: C.red,
};

export default function MapPane({ objects, selection, onSelect }: Props) {
  const center = useMemo(() => {
    if (!objects.length) return { lat: 20, lng: 0 };
    const lats = objects.map((o) => o.lat);
    const lons = objects.map((o) => o.lon);
    return { lat: lats.reduce((a, b) => a + b, 0) / lats.length, lng: lons.reduce((a, b) => a + b, 0) / lons.length };
  }, [objects]);

  const selectedId = selection?.id || selection?.object_id;

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle(C.gold)}>MAP</div>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={2}
          style={{ width: "100%", height: "100%", background: S.bg }}
          scrollWheelZoom={false}
        >
          <TileLayer url={DARK_TILES} attribution={TILE_ATTR} />
          {objects.map((o) => {
            const isSel = selectedId === o.id;
            const color = typeColor[o.type || ""] || C.neon;
            return (
              <CircleMarker
                key={o.id}
                center={[o.lat, o.lon]}
                radius={isSel ? 8 : 5}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: isSel ? 0.9 : 0.6,
                  weight: isSel ? 3 : 1.5,
                }}
                eventHandlers={{
                  click: () => onSelect({ ...o, source_pane: "map" }),
                }}
              >
                <Popup>
                  <div style={{ fontSize: 11, color: "#000" }}>
                    <strong>{o.label || o.id}</strong>
                    <div>{o.type}</div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
