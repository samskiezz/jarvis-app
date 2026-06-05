
export type Quat = [number, number, number, number];

export function normalize(q: Quat): Quat {
  const [x,y,z,w] = q;
  const len = Math.hypot(x,y,z,w) || 1;
  return [x/len, y/len, z/len, w/len];
}

export function slerp(a: Quat, b: Quat, t: number): Quat {
  let [ax,ay,az,aw] = normalize(a);
  let [bx,by,bz,bw] = normalize(b);
  let cos = ax*bx + ay*by + az*bz + aw*bw;
  if (cos < 0) { bx=-bx; by=-by; bz=-bz; bw=-bw; cos=-cos; }
  if (cos > 0.9995) return normalize([ax + t*(bx-ax), ay + t*(by-ay), az + t*(bz-az), aw + t*(bw-aw)]);
  const theta = Math.acos(cos);
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1-t)*theta) / sinTheta;
  const wb = Math.sin(t*theta) / sinTheta;
  return [ax*wa + bx*wb, ay*wa + by*wb, az*wa + bz*wb, aw*wa + bw*bw];
}
