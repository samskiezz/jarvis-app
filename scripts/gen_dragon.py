#!/usr/bin/env python3
"""Procedural 3D DRAGON → binary glTF (.glb), pure stdlib, no deps, no network.

Builds a real, watertight-ish stylised dragon mesh from parametric primitives
(generalised-cylinder body/neck/tail with a parallel-transport frame, scalloped
bat-wing membranes, four splayed legs with claws, horns, spine spikes, jaw,
teeth and glowing eyes), computes smooth per-vertex normals, paints it with
world-aware vertex colours (emerald back → amber belly), and writes a valid
glTF 2.0 GLB the WebGL holo engine and the UE5 Interchange importer both load.

Deterministic and offline — unlike the Tripo / HF-Space paths it needs no API
key and never "pends": run it and a custom GLB exists. stdlib only; structural
self-check at the end. Honest: this is hand-built geometry, not an AI render.

Usage:
  python3 scripts/gen_dragon.py                       # -> public/models/dragon.glb
  python3 scripts/gen_dragon.py --out /tmp/wyrm.glb --segments 24
"""
from __future__ import annotations

import argparse
import json
import math
import os
import struct

# ----------------------------------------------------------------------------- vec
def vadd(a, b):   return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def vsub(a, b):   return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def vscale(a, s): return (a[0] * s, a[1] * s, a[2] * s)
def vdot(a, b):   return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def vcross(a, b): return (a[1] * b[2] - a[2] * b[1],
                          a[2] * b[0] - a[0] * b[2],
                          a[0] * b[1] - a[1] * b[0])
def vlen(a):      return math.sqrt(vdot(a, a)) or 0.0
def vnorm(a):
    l = vlen(a)
    return (a[0] / l, a[1] / l, a[2] / l) if l > 1e-12 else (0.0, 0.0, 0.0)
def lerp(a, b, t): return a + (b - a) * t


def rodrigues(v, axis, ang):
    """Rotate v around unit `axis` by `ang` (Rodrigues' rotation)."""
    c, s = math.cos(ang), math.sin(ang)
    return vadd(vadd(vscale(v, c), vscale(vcross(axis, v), s)),
                vscale(axis, vdot(axis, v) * (1.0 - c)))


# ----------------------------------------------------------------------------- mesh
class Mesh:
    """Accumulates positions, RGBA colours and triangles; bakes smooth normals."""

    def __init__(self):
        self.P: list = []   # positions  [x,y,z]
        self.C: list = []   # colours    [r,g,b,a] in 0..1
        self.F: list = []   # faces      (i,j,k)

    def v(self, p, color):
        self.P.append([p[0], p[1], p[2]])
        self.C.append(list(color))
        return len(self.P) - 1

    def tri(self, a, b, c):
        if a != b and b != c and a != c:
            self.F.append((a, b, c))

    def normals(self):
        N = [(0.0, 0.0, 0.0)] * len(self.P)
        for a, b, c in self.F:
            A, B, Cc = self.P[a], self.P[b], self.P[c]
            fn = vcross(vsub(B, A), vsub(Cc, A))   # area-weighted (un-normalised)
            for i in (a, b, c):
                N[i] = vadd(N[i], fn)
        out = []
        for n in N:
            n = vnorm(n)
            out.append(n if n != (0.0, 0.0, 0.0) else (0.0, 1.0, 0.0))
        return out


def _col(color, p, center, frac):
    """A part colour is either a constant RGBA or a callable(p, center, frac)."""
    return color(p, center, frac) if callable(color) else color


# ----------------------------------------------------------------------------- parts
def add_tube(m: Mesh, spine, radii, color, segs=16, cap_start=True, cap_end=True):
    """Generalised cylinder along a polyline, twist-free via parallel transport."""
    M = len(spine)
    tang = []
    for i in range(M):
        if i == 0:        t = vsub(spine[1], spine[0])
        elif i == M - 1:  t = vsub(spine[-1], spine[-2])
        else:             t = vsub(spine[i + 1], spine[i - 1])
        tang.append(vnorm(t))
    # initial frame perpendicular to the first tangent
    up = (0.0, 1.0, 0.0)
    if abs(vdot(tang[0], up)) > 0.99:
        up = (1.0, 0.0, 0.0)
    r = vnorm(vcross(up, tang[0]))
    u = vnorm(vcross(tang[0], r))
    frames = [(r, u)]
    for i in range(1, M):
        axis = vcross(tang[i - 1], tang[i])
        al = vlen(axis)
        if al < 1e-7:
            frames.append(frames[-1])
        else:
            axis = vscale(axis, 1.0 / al)
            ang = math.atan2(al, vdot(tang[i - 1], tang[i]))
            pr, pu = frames[-1]
            frames.append((vnorm(rodrigues(pr, axis, ang)),
                           vnorm(rodrigues(pu, axis, ang))))
    rings = []
    for i in range(M):
        r, u = frames[i]
        c, rad, frac = spine[i], radii[i], i / (M - 1)
        idx = []
        for s in range(segs):
            th = 2.0 * math.pi * s / segs
            d = vadd(vscale(r, math.cos(th)), vscale(u, math.sin(th)))
            p = vadd(c, vscale(d, rad))
            idx.append(m.v(p, _col(color, p, c, frac)))
        rings.append(idx)
    for i in range(M - 1):
        a, b = rings[i], rings[i + 1]
        for s in range(segs):
            s2 = (s + 1) % segs
            m.tri(a[s], b[s], b[s2])
            m.tri(a[s], b[s2], a[s2])
    if cap_start:
        ci = m.v(spine[0], _col(color, spine[0], spine[0], 0.0))
        a = rings[0]
        for s in range(segs):
            m.tri(ci, a[(s + 1) % segs], a[s])
    if cap_end:
        ci = m.v(spine[-1], _col(color, spine[-1], spine[-1], 1.0))
        a = rings[-1]
        for s in range(segs):
            m.tri(ci, a[s], a[(s + 1) % segs])
    return rings


def add_cone(m: Mesh, base, tip, radius, color, segs=8):
    t = vnorm(vsub(tip, base))
    up = (0.0, 1.0, 0.0)
    if abs(vdot(t, up)) > 0.99:
        up = (1.0, 0.0, 0.0)
    r = vnorm(vcross(up, t)); u = vnorm(vcross(t, r))
    ring = []
    for s in range(segs):
        th = 2.0 * math.pi * s / segs
        d = vadd(vscale(r, math.cos(th)), vscale(u, math.sin(th)))
        ring.append(m.v(vadd(base, vscale(d, radius)), _col(color, base, base, 0.0)))
    ti = m.v(tip, _col(color, tip, tip, 1.0))
    bi = m.v(base, _col(color, base, base, 0.0))
    for s in range(segs):
        s2 = (s + 1) % segs
        m.tri(ring[s], ring[s2], ti)
        m.tri(ring[s2], ring[s], bi)


def add_sphere(m: Mesh, center, radius, color, stacks=8, slices=12):
    grid = []
    for i in range(stacks + 1):
        phi = math.pi * i / stacks
        row = []
        for j in range(slices):
            th = 2.0 * math.pi * j / slices
            p = vadd(center, (radius * math.sin(phi) * math.cos(th),
                              radius * math.cos(phi),
                              radius * math.sin(phi) * math.sin(th)))
            row.append(m.v(p, _col(color, p, center, i / stacks)))
        grid.append(row)
    for i in range(stacks):
        for j in range(slices):
            j2 = (j + 1) % slices
            a, b, c, d = grid[i][j], grid[i][j2], grid[i + 1][j], grid[i + 1][j2]
            m.tri(a, c, d); m.tri(a, d, b)


def add_membrane(m: Mesh, a, b, c, color, depth=2):
    """A triangular wing panel, midpoint-subdivided `depth` times so the big
    membrane catches light smoothly instead of reading as one flat facet."""
    def rec(p0, p1, p2, d):
        if d == 0:
            m.tri(m.v(p0, _col(color, p0, p0, 0)),
                  m.v(p1, _col(color, p1, p1, 0)),
                  m.v(p2, _col(color, p2, p2, 0)))
            return
        m01 = vscale(vadd(p0, p1), 0.5)
        m12 = vscale(vadd(p1, p2), 0.5)
        m20 = vscale(vadd(p2, p0), 0.5)
        rec(p0, m01, m20, d - 1); rec(m01, p1, m12, d - 1)
        rec(m20, m12, p2, d - 1); rec(m01, m12, m20, d - 1)
    rec(a, b, c, depth)


# ----------------------------------------------------------------------------- palette
BACK   = (0.07, 0.42, 0.30, 1.0)   # emerald scales
BELLY  = (0.85, 0.62, 0.18, 1.0)   # warm amber underside
HORN   = (0.90, 0.86, 0.74, 1.0)   # ivory
SPIKE  = (0.10, 0.78, 0.85, 1.0)   # cyan ridge (JARVIS holo accent)
MEMBR  = (0.55, 0.12, 0.16, 1.0)   # crimson wing web
BONE   = (0.16, 0.20, 0.22, 1.0)   # dark wing struts
TOOTH  = (0.95, 0.95, 0.90, 1.0)
EYE    = (1.00, 0.78, 0.10, 1.0)   # glowing amber


def body_color(p, center, frac):
    """Emerald back blending to amber belly by vertical offset from the spine."""
    t = max(-1.0, min(1.0, (p[1] - center[1]) / 0.62))    # +1 top, -1 belly
    k = (t + 1.0) * 0.5
    return (lerp(BELLY[0], BACK[0], k), lerp(BELLY[1], BACK[1], k),
            lerp(BELLY[2], BACK[2], k), 1.0)


# ----------------------------------------------------------------------------- dragon
# master spine, head (+X) -> tail, with body radius at each node
SPINE = [
    (( 3.70, 1.55, 0.0), 0.12), (( 3.40, 1.62, 0.0), 0.22),
    (( 3.05, 1.70, 0.0), 0.34), (( 2.70, 1.62, 0.0), 0.30),
    (( 2.35, 1.45, 0.0), 0.27), (( 2.00, 1.20, 0.0), 0.31),
    (( 1.55, 0.95, 0.0), 0.42), (( 1.05, 0.80, 0.0), 0.55),
    (( 0.45, 0.72, 0.0), 0.62), ((-0.15, 0.70, 0.0), 0.62),
    ((-0.80, 0.72, 0.0), 0.55), ((-1.40, 0.70, 0.0), 0.45),
    ((-2.10, 0.66, 0.0), 0.34), ((-3.00, 0.60, 0.0), 0.24),
    ((-4.00, 0.62, 0.0), 0.15), ((-5.00, 0.80, 0.0), 0.08),
    ((-5.65, 1.05, 0.0), 0.03),
]


def add_leg(m, hip, knee, ankle, foot, radii, color):
    add_tube(m, [hip, knee, ankle, foot], radii, color, segs=10,
             cap_start=False, cap_end=True)
    fwd = vnorm(vsub(foot, ankle))
    side = vnorm(vcross(fwd, (0.0, 1.0, 0.0)))
    for k in (-1, 0, 1):                                   # three claws
        toe = vadd(foot, vadd(vscale(fwd, 0.22), vscale(side, 0.10 * k)))
        toe = (toe[0], -0.04, toe[2])
        add_cone(m, vadd(foot, vscale(side, 0.08 * k)), toe, 0.045, HORN, segs=6)


def add_wing(m, sign):
    """Scalloped bat-wing. sign=+1 right (+Z), -1 left (mirror)."""
    def P(x, y, z): return (x, y, sign * z)
    shoulder = P(0.85, 1.15, 0.22)
    elbow    = P(0.35, 2.05, 1.25)
    wrist    = P(-0.15, 2.55, 2.35)
    tips = [P(0.35, 2.95, 3.45), P(-0.55, 2.10, 3.65),
            P(-1.35, 1.20, 3.35), P(-2.05, 0.45, 2.65)]
    hip = P(-1.30, 0.95, 0.40)
    # arm + finger bones
    add_tube(m, [shoulder, elbow, wrist], [0.075, 0.06, 0.05], BONE,
             segs=7, cap_start=False)
    for t in tips:
        add_tube(m, [wrist, t], [0.05, 0.012], BONE, segs=6, cap_start=False)
    # leading-arm membrane panel
    add_membrane(m, shoulder, elbow, wrist, MEMBR)
    add_membrane(m, shoulder, wrist, tips[0], MEMBR)
    # scalloped webbing between consecutive fingers (mid pulled toward wrist)
    for i in range(len(tips) - 1):
        a, b = tips[i], tips[i + 1]
        mid = vadd(vscale(vadd(a, b), 0.5), vscale(vsub(wrist, vscale(vadd(a, b), 0.5)), 0.28))
        add_membrane(m, wrist, a, mid, MEMBR)
        add_membrane(m, wrist, mid, b, MEMBR)
    # trailing membrane down to the body
    add_membrane(m, wrist, tips[-1], hip, MEMBR)
    add_membrane(m, wrist, hip, shoulder, MEMBR)


def build(segs=16):
    m = Mesh()
    spine = [p for p, _ in SPINE]
    radii = [r for _, r in SPINE]

    # 1) body / neck / tail
    add_tube(m, spine, radii, body_color, segs=segs)

    # 2) lower jaw (slightly open) + teeth
    jaw = [(3.62, 1.40, 0.0), (3.30, 1.42, 0.0), (2.98, 1.48, 0.0)]
    add_tube(m, jaw, [0.07, 0.13, 0.17], body_color, segs=10, cap_start=True)
    for i, x in enumerate((3.45, 3.2, 2.95)):
        for s in (-1, 1):
            add_cone(m, (x, 1.55, 0.10 * s), (x, 1.40, 0.10 * s), 0.03, TOOTH, segs=5)
            add_cone(m, (x, 1.46, 0.10 * s), (x, 1.60, 0.10 * s), 0.03, TOOTH, segs=5)

    # 3) horns (pair) + small brow horns
    for s in (-1, 1):
        add_cone(m, (2.90, 1.92, 0.14 * s), (2.45, 2.55, 0.30 * s), 0.085, HORN, segs=8)
        add_cone(m, (3.05, 1.85, 0.12 * s), (3.18, 2.10, 0.16 * s), 0.04, HORN, segs=6)

    # 4) eyes (glowing)
    for s in (-1, 1):
        add_sphere(m, (3.02, 1.82, 0.21 * s), 0.07, EYE, stacks=6, slices=10)

    # 5) spine ridge spikes, neck -> tail, tapering
    for i in range(3, len(spine) - 2):
        c, r = spine[i], radii[i]
        h = 0.16 + 0.42 * r
        base = (c[0], c[1] + r * 0.92, 0.0)
        tip = (c[0] - 0.10, c[1] + r * 0.92 + h, 0.0)
        add_cone(m, base, tip, max(0.03, r * 0.34), SPIKE, segs=6)

    # 6) four legs (back pair heavier) + claws
    add_leg(m, (1.00, 0.62, 0.42), (1.18, 0.34, 0.60), (1.02, 0.10, 0.58),
            (1.24, 0.02, 0.60), [0.17, 0.14, 0.11, 0.09], body_color)
    add_leg(m, (1.00, 0.62, -0.42), (1.18, 0.34, -0.60), (1.02, 0.10, -0.58),
            (1.24, 0.02, -0.60), [0.17, 0.14, 0.11, 0.09], body_color)
    add_leg(m, (-1.20, 0.64, 0.48), (-0.98, 0.36, 0.66), (-1.22, 0.12, 0.62),
            (-0.94, 0.02, 0.64), [0.20, 0.16, 0.12, 0.10], body_color)
    add_leg(m, (-1.20, 0.64, -0.48), (-0.98, 0.36, -0.66), (-1.22, 0.12, -0.62),
            (-0.94, 0.02, -0.64), [0.20, 0.16, 0.12, 0.10], body_color)

    # 7) wings
    add_wing(m, +1)
    add_wing(m, -1)

    # 8) tail-tip fin (two membrane vanes)
    tip, pre = spine[-1], spine[-3]
    fwd = vnorm(vsub(tip, pre))
    add_membrane(m, pre, tip, vadd(tip, vadd(vscale(fwd, -0.1), (0.0, 0.55, 0.0))), SPIKE, depth=1)
    add_membrane(m, pre, tip, vadd(tip, vadd(vscale(fwd, -0.1), (0.0, -0.45, 0.0))), SPIKE, depth=1)
    return m


# ----------------------------------------------------------------------------- glb
def write_glb(m: Mesh, path: str):
    N = m.normals()
    pos = b"".join(struct.pack("<3f", *p) for p in m.P)
    nrm = b"".join(struct.pack("<3f", *n) for n in N)
    col = b"".join(struct.pack("<4f", *c) for c in m.C)
    idx = b"".join(struct.pack("<3I", *f) for f in m.F)
    nverts, nidx = len(m.P), len(m.F) * 3

    def pad4(b, fill=b"\x00"):
        return b + fill * ((4 - len(b) % 4) % 4)
    pos, nrm, col, idx = pad4(pos), pad4(nrm), pad4(col), pad4(idx)
    blob = pos + nrm + col + idx
    o_pos, o_nrm = 0, len(pos)
    o_col, o_idx = o_nrm + len(nrm), o_nrm + len(nrm) + len(col)

    xs = [p[0] for p in m.P]; ys = [p[1] for p in m.P]; zs = [p[2] for p in m.P]
    gltf = {
        "asset": {"version": "2.0", "generator": "jarvis gen_dragon.py"},
        "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "Dragon"}],
        "meshes": [{"name": "Dragon", "primitives": [{
            "attributes": {"POSITION": 0, "NORMAL": 1, "COLOR_0": 2},
            "indices": 3, "material": 0, "mode": 4}]}],
        "materials": [{"name": "DragonScale", "doubleSided": True,
                       "pbrMetallicRoughness": {
                           "baseColorFactor": [1, 1, 1, 1],
                           "metallicFactor": 0.05, "roughnessFactor": 0.65}}],
        "buffers": [{"byteLength": len(blob)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": o_pos, "byteLength": len(pos), "target": 34962},
            {"buffer": 0, "byteOffset": o_nrm, "byteLength": len(nrm), "target": 34962},
            {"buffer": 0, "byteOffset": o_col, "byteLength": len(col), "target": 34962},
            {"buffer": 0, "byteOffset": o_idx, "byteLength": len(idx), "target": 34963},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": nverts, "type": "VEC3",
             "min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]},
            {"bufferView": 1, "componentType": 5126, "count": nverts, "type": "VEC3"},
            {"bufferView": 2, "componentType": 5126, "count": nverts, "type": "VEC4"},
            {"bufferView": 3, "componentType": 5125, "count": nidx, "type": "SCALAR"},
        ],
    }
    js = pad4(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
    total = 12 + 8 + len(js) + 8 + len(blob)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(js), b"JSON")); f.write(js)
        f.write(struct.pack("<I4s", len(blob), b"BIN\x00")); f.write(blob)
    return nverts, len(m.F)


def main():
    ap = argparse.ArgumentParser(description="Procedural dragon GLB generator")
    ap.add_argument("--out", default=os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "public", "models", "dragon.glb"))
    ap.add_argument("--segments", type=int, default=16,
                    help="radial segments around the body (smoothness)")
    args = ap.parse_args()
    m = build(segs=args.segments)
    nv, nf = write_glb(m, args.out)
    kb = os.path.getsize(args.out) / 1024.0
    print(f"✓ {args.out}  ({nv} verts, {nf} tris, {kb:.0f} KB)")
    print(f"  web:  /models/{os.path.basename(args.out)}")


if __name__ == "__main__":
    main()
