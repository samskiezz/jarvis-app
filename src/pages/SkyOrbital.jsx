/**
 * SkyOrbital — "SKY / ORBITAL" console.
 *
 * Curates the aerospace slice of the 449-method science engine: astronomy
 * (meteor / asteroid / orbital) plus flight / aerospace / aerodynamics.
 * Thin wrapper over the shared SciDomainConsole.
 */
import SciDomainConsole from "@/components/SciDomainConsole";
import { COLORS as C } from "@/domain/colors";

export default function SkyOrbital() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", overflow: "auto" }}>
      <SciDomainConsole
        title="SKY / ORBITAL"
        subtitle="AEROSPACE TRACK — METEOR · ASTEROID · ORBITAL · FLIGHT · AERODYNAMICS"
        accent={C.blue}
        runLabel="COMPUTE"
        emptyHint="Select an orbital / flight method to compute it."
        domains={["astronomy", "aerodynamics"]}
        extraMatch={["meteor", "asteroid", "orbit", "satellite", "flight", "aero", "mach", "lift", "drag"]}
      />
    </div>
  );
}
