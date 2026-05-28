import { useMemo } from "react";
import * as THREE from "three";
import { diurnal } from "./Lights";

interface Props {
  tick: number;
  size: number;
}

// A glowing emissive disc that follows the diurnal sun position, plus a
// dimmer moon disc on the opposite side. Both render with toneMapped=false
// so the bloom pass turns them into proper bright haloed celestial bodies.
export default function CelestialBodies({ tick, size }: Props) {
  const d = useMemo(() => diurnal(tick, size), [tick, size]);

  // Sun position: high during day band (cycle 0–30), at horizon during dusk
  // (30–40), below horizon at night (40–60), rising during dawn (60–80).
  const phase = ((tick % 80) + 80) % 80 / 80;
  const sunAngle = phase * Math.PI * 2 - Math.PI / 2;
  // Place celestial bodies on a sphere of radius ~size·2.5 around the world.
  const R = size * 2.5;
  const sunY = Math.sin(sunAngle) * R;
  const sunX = Math.cos(sunAngle) * R * 0.6;
  const sunZ = -R * 0.55;

  // Moon is on the opposite side of the sky.
  const moonAngle = sunAngle + Math.PI;
  const moonY = Math.sin(moonAngle) * R;
  const moonX = Math.cos(moonAngle) * R * 0.6;
  const moonZ = -R * 0.55;

  const sunVisible = sunY > -size * 0.3;
  const moonVisible = moonY > -size * 0.3;

  // Sun colour matches the diurnal phase so dawn/dusk reads warm-orange.
  const sunColour = d.label === "dusk" ? "#ff7a3c"
                  : d.label === "dawn" ? "#ffb38a"
                  : "#fff4d0";
  const sunIntensity = d.label === "day" ? 6 : d.label === "dusk" ? 5 : 3;

  return (
    <>
      {sunVisible && (
        <group position={[sunX, sunY, sunZ]}>
          {/* Sun core — bright, emissive, blooms hard */}
          <mesh>
            <sphereGeometry args={[size * 0.04, 32, 32]} />
            <meshBasicMaterial color={sunColour} toneMapped={false} />
          </mesh>
          {/* Outer halo */}
          <mesh>
            <sphereGeometry args={[size * 0.08, 24, 24]} />
            <meshBasicMaterial
              color={sunColour}
              transparent
              opacity={0.35}
              toneMapped={false}
              depthWrite={false}
            />
          </mesh>
          <pointLight color={sunColour} intensity={sunIntensity} distance={size * 4} decay={0} />
        </group>
      )}

      {moonVisible && (
        <group position={[moonX, moonY, moonZ]}>
          {/* Moon core — softer white */}
          <mesh>
            <sphereGeometry args={[size * 0.035, 32, 32]} />
            <meshBasicMaterial color="#e8eaff" toneMapped={false} />
          </mesh>
          <mesh>
            <sphereGeometry args={[size * 0.06, 24, 24]} />
            <meshBasicMaterial color="#c0c8ff" transparent opacity={0.25} toneMapped={false} depthWrite={false} />
          </mesh>
        </group>
      )}
    </>
  );
}
