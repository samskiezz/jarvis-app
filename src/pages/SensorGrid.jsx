/**
 * SensorGrid — "SENSOR GRID" console.
 *
 * Curates the environmental-sensing slice of the 449-method science engine:
 * air quality / ppm (atmoschem), ocean + buoys + hydrology, and seismic
 * (seismology + earth/geology). Thin wrapper over the shared SciDomainConsole.
 */
import SciDomainConsole from "@/components/SciDomainConsole";
import LiveDataPanel from "@/components/LiveDataPanel";
import { COLORS as C } from "@/domain/colors";

export default function SensorGrid() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", overflow: "auto" }}>
      <SciDomainConsole
        title="SENSOR GRID"
        subtitle="ENVIRONMENTAL TELEMETRY — AIR QUALITY · PPM · OCEAN · BUOYS · HYDROLOGY · SEISMIC"
        accent={C.neon}
        runLabel="SAMPLE"
        emptyHint="Select a sensor channel to sample it."
        domains={["atmoschem", "ocean", "hydrology", "hydrogeology", "seismology", "earth", "geology"]}
        extraMatch={["ppm", "air", "buoy", "seismic", "quake", "tide", "groundwater"]}
      />
      <LiveDataPanel pageName="SensorGrid" limit={60} refreshMs={30000} />
    </div>
  );
}
