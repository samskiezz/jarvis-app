import { MutableRefObject, useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

interface Props {
  selectedId: string | null;
  /** Ref to the selected minion's world position, updated each frame. */
  position: THREE.Vector3;
  /** Ref the controller writes WASD direction (unit vector in XZ) to. */
  controlInputRef: MutableRefObject<THREE.Vector3>;
  followDistance?: number;
  followHeight?: number;
}

const tmpDir = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpForward = new THREE.Vector3();

// Drives a third-person follow-cam on the selected minion and forwards
// WASD/arrow keys to the avatar via controlInputRef. The avatar reads that
// each frame and applies it as movement, replacing its wander/walk logic.
export default function CharacterController({
  selectedId, position, controlInputRef,
  followDistance = 8, followHeight = 5,
}: Props) {
  const camera = useThree((s) => s.camera);
  const yawRef = useRef(Math.PI * 0.25);
  const pitchRef = useRef(0.32);
  const keysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedId) return;
    const keys = keysRef.current;
    const controlInput = controlInputRef.current;
    const down = (e: KeyboardEvent) => { keys.add(e.key.toLowerCase()); };
    const up   = (e: KeyboardEvent) => { keys.delete(e.key.toLowerCase()); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      keys.clear();
      controlInput.set(0, 0, 0);
    };
  }, [selectedId, controlInputRef]);

  useFrame((_, dt) => {
    if (!selectedId) return;
    const keys = keysRef.current;

    // Forward/back/strafe relative to current yaw. Camera-relative WASD so
    // the user always presses 'forward' to move into the screen.
    tmpForward.set(-Math.cos(yawRef.current), 0, -Math.sin(yawRef.current));
    tmpRight.set(Math.sin(yawRef.current), 0, -Math.cos(yawRef.current));
    tmpDir.set(0, 0, 0);
    if (keys.has("w") || keys.has("arrowup"))    tmpDir.add(tmpForward);
    if (keys.has("s") || keys.has("arrowdown"))  tmpDir.sub(tmpForward);
    if (keys.has("d") || keys.has("arrowright")) tmpDir.add(tmpRight);
    if (keys.has("a") || keys.has("arrowleft"))  tmpDir.sub(tmpRight);
    if (tmpDir.lengthSq() > 0.01) tmpDir.normalize();
    controlInputRef.current.copy(tmpDir);

    // Mouse-style yaw via Q/E since OrbitControls is disabled in this mode.
    const yawDelta = (keys.has("q") ? 1 : 0) - (keys.has("e") ? 1 : 0);
    yawRef.current += yawDelta * dt * 1.6;

    // Spherical orbit around the character.
    const horiz = Math.cos(pitchRef.current) * followDistance;
    const camOffset = new THREE.Vector3(
      Math.cos(yawRef.current) * horiz,
      Math.sin(pitchRef.current) * followDistance + followHeight,
      Math.sin(yawRef.current) * horiz,
    );
    const desired = position.clone().add(camOffset);
    camera.position.lerp(desired, Math.min(1, dt * 6));
    camera.lookAt(position.x, position.y + 1.8, position.z);
  });

  return null;
}
