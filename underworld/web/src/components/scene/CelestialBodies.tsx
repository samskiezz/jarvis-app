import { useMemo } from "react";
import { diurnal } from "./Lights";

interface Props {
  tick: number;
  size: number;
}

// Emissive sun + moon discs that follow the diurnal cycle.
//
// Critical: every material here sets `fog={false}` so the linear fog (which
// caps opaque at ~size*1.8) doesn't swallow celestial bodies sitting on
// the size*1.5 sky-shell. Also placed *closer* than the fog far-plane
// (1.5*size, fog ends at 1.8*size) so they're never further than the
// horizon. RenderOrder pinned low so they draw first, behind everything.
export default function CelestialBodies({ tick, size }: Props) {
  const d = useMemo(() => diurnal(tick, size), [tick, size]);

  const phase = ((tick % 80) + 80) % 80 / 80;
  const sunAngle = phase * Math.PI * 2 - Math.PI / 2;
  // Inside the fog far-plane so they actually render visible.
  const R = size * 1.5;
  const sunY = Math.sin(sunAngle) * R;
  const sunX = Math.cos(sunAngle) * R * 0.6;
  const sunZ = -R * 0.55;

  const moonAngle = sunAngle + Math.PI;
  const moonY = Math.sin(moonAngle) * R;
  const moonX = Math.cos(moonAngle) * R * 0.6;
  const moonZ = -R * 0.55;

  const sunVisible = sunY > -size * 0.2;
  const moonVisible = moonY > -size * 0.2;

  const sunColour = d.label === "dusk" ? "#ff7a3c"
                  : d.label === "dawn" ? "#ffb38a"
                  : "#fff4d0";
  const sunIntensity = d.label === "day" ? 6 : d.label === "dusk" ? 5 : 3;

  // Sun disc is significantly larger than before so it reads from far away.
  const sunCoreR = size * 0.06;
  const sunHaloR = size * 0.14;
  const moonCoreR = size * 0.05;
  const moonHaloR = size * 0.10;

  return (
    <>
      {sunVisible && (
        <group position={[sunX, sunY, sunZ]} renderOrder={-1}>
          <mesh renderOrder={-1}>
            <sphereGeometry args={[sunCoreR, 32, 32]} />
            <meshBasicMaterial color={sunColour} toneMapped={false} fog={false} depthWrite={false} />
          </mesh>
          <mesh renderOrder={-1}>
            <sphereGeometry args={[sunHaloR, 24, 24]} />
            <meshBasicMaterial
              color={sunColour}
              transparent
              opacity={0.45}
              toneMapped={false}
              fog={false}
              depthWrite={false}
            />
          </mesh>
          <pointLight color={sunColour} intensity={sunIntensity} distance={size * 4} decay={0} />
        </group>
      )}

      {moonVisible && (
        <group position={[moonX, moonY, moonZ]} renderOrder={-1}>
          <mesh renderOrder={-1}>
            <sphereGeometry args={[moonCoreR, 32, 32]} />
            <meshBasicMaterial color="#e8eaff" toneMapped={false} fog={false} depthWrite={false} />
          </mesh>
          <mesh renderOrder={-1}>
            <sphereGeometry args={[moonHaloR, 24, 24]} />
            <meshBasicMaterial color="#c0c8ff" transparent opacity={0.35} toneMapped={false} fog={false} depthWrite={false} />
          </mesh>
        </group>
      )}
    </>
  );
}
