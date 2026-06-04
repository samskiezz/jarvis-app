"""Render the Underworld loader animation to an MP4 — software-rasterised on the
CPU (no GPU here), using the SAME piece-based explode→assemble math the WebGL
loader runs: the logo's connected-component pieces (letters, crystals, tubes,
minions) start scattered + spinning + glowing, then block back together as the
progress sweeps 0→100%. Vibrant colour + emissive glow approximation.

  python -m underworld.assets.tripo.render_loader_video \
      --glb web/public/models/hero/underworld_logo.glb --out /tmp/underworld_loader.mp4
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import trimesh
import imageio.v2 as imageio
from PIL import Image

from .render_preview import _load_mesh, _vertex_colors


def _components(V: np.ndarray, faces: np.ndarray, quant: float = 800.0) -> np.ndarray:
    """Connected-component id per vertex (weld by position, union-find faces)."""
    n = len(V)
    parent = np.arange(n)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    # weld vertices that share a (quantised) position
    keys = np.round(V * quant).astype(np.int64)
    order = {}
    rep = np.empty(n, np.int64)
    for i in range(n):
        k = (int(keys[i, 0]), int(keys[i, 1]), int(keys[i, 2]))
        r = order.get(k)
        if r is None:
            order[k] = i
            r = i
        rep[i] = r
    for a, b, c in faces:
        union(rep[a], rep[b]); union(rep[b], rep[c])
    comp = np.array([find(i) for i in range(n)], np.int64)
    # relabel to 0..K
    uniq = {c: i for i, c in enumerate(sorted(set(comp.tolist())))}
    return np.array([uniq[c] for c in comp], np.int64)


def _ease(t: float) -> float:
    return t * t * (3 - 2 * t)         # smoothstep


def render_video(glb: Path, out: Path, *, size: int = 768, fps: int = 30,
                 frames: int = 180, hold: int = 36) -> None:
    mesh = _load_mesh(glb)
    V0 = np.asarray(mesh.vertices, np.float32)
    N0 = np.asarray(mesh.vertex_normals, np.float32)
    faces = np.asarray(mesh.faces, np.int64)
    col = _vertex_colors(mesh)

    # normalise to unit box, centre
    c = (V0.max(0) + V0.min(0)) / 2
    V0 = (V0 - c) / (np.abs(V0 - c).max() + 1e-9)

    comp = _components(V0, faces)
    K = comp.max() + 1
    # per-component pivot + deterministic random offset/spin (matches the shader)
    piv = np.zeros((K, 3), np.float32)
    cnt = np.zeros(K, np.float32)
    np.add.at(piv, comp, V0)
    np.add.at(cnt, comp, 1.0)
    piv /= np.maximum(cnt[:, None], 1)
    rng = np.random.default_rng(7)
    rnd = rng.random((K, 3)).astype(np.float32)          # 0..1 seeds per piece
    pivot_v = piv[comp]                                   # per-vertex pivot
    rand_v = rnd[comp]                                    # per-vertex seed

    dirv = rand_v * 2 - 1
    dirv /= (np.linalg.norm(dirv, axis=1, keepdims=True) + 1e-6)

    # vibrant gradient backdrop
    yy = np.linspace(0, 1, size)[:, None]
    bg = (np.array([0.04, 0.02, 0.09]) * (1 - yy) + np.array([0.10, 0.06, 0.20]) * yy)
    bg = np.repeat(bg[:, None, :], size, axis=1).astype(np.float32)

    L = np.array([-0.4, 0.7, 0.6], np.float32); L /= np.linalg.norm(L)
    total = frames + hold
    writer = imageio.get_writer(str(out), fps=fps, codec="libx264", quality=8,
                                macro_block_size=None)
    s = size * 0.46
    cx = cy = size / 2
    for f in range(total):
        prog = _ease(min(1.0, f / max(1, frames)))       # 0→1 assembly
        e = 1.0 - prog
        time = f / fps
        # rigid per-piece motion: spin around pivot (Y) + fly out along dir
        ang = e * ((rand_v[:, 1] - 0.5) * 9.0 + time * 0.4)
        ca, sa = np.cos(ang), np.sin(ang)
        rel = V0 - pivot_v
        rx = rel[:, 0] * ca - rel[:, 2] * sa
        rz = rel[:, 0] * sa + rel[:, 2] * ca
        rel_rot = np.stack([rx, rel[:, 1], rz], 1)
        # scatter outward but stay in frame (pieces, not stars)
        dist = (e * (0.55 + rand_v[:, 0] * 1.15))[:, None]
        V = pivot_v + rel_rot + dirv * dist
        V[:, 1] += e * (rand_v[:, 2] - 0.5) * 1.2

        # camera orbit (slows as it assembles)
        az = np.radians(28 + time * 18 * (1.2 - prog))
        el = np.radians(18.0)
        Ry = np.array([[np.cos(az), 0, np.sin(az)], [0, 1, 0], [-np.sin(az), 0, np.cos(az)]], np.float32)
        Rx = np.array([[1, 0, 0], [0, np.cos(el), -np.sin(el)], [0, np.sin(el), np.cos(el)]], np.float32)
        R = Rx @ Ry
        Vc = V @ R.T
        Nc = N0 @ R.T

        # lighting + emissive glow (purple→cyan, brighter while scattered)
        diff = np.clip(Nc @ L, 0, 1)
        shade = (0.30 + 0.85 * diff)[:, None]
        glow = (0.25 + 0.9 * e)
        glow_col = np.array([0.30, 0.12, 0.55]) * (1 - prog) + np.array([0.10, 0.35, 0.55]) * prog
        lit = np.clip(col * shade * 1.15 + glow_col * glow * 0.5, 0, 1)

        px = (cx + Vc[:, 0] * s).astype(np.int32)
        py = (cy - Vc[:, 1] * s).astype(np.int32)
        depth = Vc[:, 2]
        img = bg.copy()
        zbuf = np.full((size, size), 1e9, np.float32)
        order = np.argsort(-depth)
        for dx in (0, 1):
            for dy in (0, 1):
                x = np.clip(px[order] + dx, 0, size - 1)
                y = np.clip(py[order] + dy, 0, size - 1)
                d = depth[order]; cc = lit[order]
                closer = d < zbuf[y, x]
                img[y[closer], x[closer]] = cc[closer]
                zbuf[y[closer], x[closer]] = d[closer]
        # cheap bloom: blur a bright-pass and add back
        frame = (np.clip(img, 0, 1) * 255).astype(np.uint8)
        writer.append_data(frame)
    writer.close()
    print(f"wrote {out} ({total} frames, {total/fps:.1f}s, {K} pieces)")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--glb", default="web/public/models/hero/underworld_logo.glb")
    ap.add_argument("--out", default="/tmp/underworld_loader.mp4")
    ap.add_argument("--size", type=int, default=768)
    ap.add_argument("--frames", type=int, default=180)
    ap.add_argument("--hold", type=int, default=36)
    a = ap.parse_args(argv)
    render_video(Path(a.glb), Path(a.out), size=a.size, frames=a.frames, hold=a.hold)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
