"""Headless software renderer — honest GLB screenshots without a GPU.

No OpenGL/EGL here, so we rasterise the real mesh ourselves with numpy: load the
GLB (full geometry + its baked PBR texture), light it with a simple key+ambient
diffuse term, sample the texture per vertex, and z-buffer-splat into an image.
It's not Lumen — but it shows the genuine mesh, silhouette and baked colours so
we can judge the asset honestly (the cinematic look is the UE5 renderer's job).

  python -m underworld.assets.tripo.render_preview tree_oak library --out /tmp
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image

HERE = Path(__file__).resolve().parent
GLB_DIR = HERE.parents[1] / "web" / "public" / "models" / "generated" / "tripo"


def _load_mesh(path: Path):
    scene = trimesh.load(path, process=False)
    if isinstance(scene, trimesh.Scene):
        mesh = trimesh.util.concatenate(
            [g for g in scene.dump().geometry.values()] if hasattr(scene.dump(), "geometry")
            else list(scene.geometry.values())
        ) if scene.geometry else None
        if mesh is None:
            mesh = trimesh.util.concatenate(tuple(scene.geometry.values()))
    else:
        mesh = scene
    return mesh


def _vertex_colors(mesh) -> np.ndarray:
    """Per-vertex RGB in 0..1 — from the baked texture (via UV) or vertex colours."""
    n = len(mesh.vertices)
    vis = mesh.visual
    try:
        uv = getattr(vis, "uv", None)
        mat = getattr(vis, "material", None)
        img = None
        if mat is not None:
            img = getattr(mat, "baseColorTexture", None) or getattr(mat, "image", None)
        if uv is not None and img is not None:
            tex = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
            h, w = tex.shape[:2]
            u = np.clip(uv[:, 0], 0, 1); v = np.clip(uv[:, 1], 0, 1)
            px = np.clip((u * (w - 1)).astype(int), 0, w - 1)
            py = np.clip(((1 - v) * (h - 1)).astype(int), 0, h - 1)
            return tex[py, px]
    except Exception:
        pass
    try:
        vc = vis.to_color().vertex_colors[:, :3].astype(np.float32) / 255.0
        if len(vc) == n:
            return vc
    except Exception:
        pass
    return np.full((n, 3), 0.72, np.float32)


def render(path: Path, size: int = 768, azim: float = 35.0, elev: float = 22.0) -> Image.Image:
    mesh = _load_mesh(path)
    V = np.asarray(mesh.vertices, np.float32)
    N = np.asarray(mesh.vertex_normals, np.float32)
    col = _vertex_colors(mesh)

    # centre + scale to a unit box
    V = V - (V.max(0) + V.min(0)) / 2
    V = V / (np.abs(V).max() + 1e-9)

    # camera: yaw then pitch
    a, e = np.radians(azim), np.radians(elev)
    Ry = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]], np.float32)
    Rx = np.array([[1, 0, 0], [0, np.cos(e), -np.sin(e)], [0, np.sin(e), np.cos(e)]], np.float32)
    R = Rx @ Ry
    Vc = V @ R.T
    Nc = N @ R.T

    # diffuse key light from upper-left-front + ambient, sky/ground bounce
    L = np.array([-0.4, 0.7, 0.6], np.float32); L /= np.linalg.norm(L)
    diff = np.clip(Nc @ L, 0, 1)
    sky = np.clip(Nc[:, 1] * 0.5 + 0.5, 0, 1)        # up-facing catches sky
    shade = (0.25 + 0.8 * diff + 0.15 * sky)[:, None]
    lit = np.clip(col * shade, 0, 1)

    # orthographic projection to pixels (y up), z for depth
    s = size * 0.42
    cx = cy = size / 2
    px = (cx + Vc[:, 0] * s).astype(np.int32)
    py = (cy - Vc[:, 1] * s).astype(np.int32)
    depth = Vc[:, 2]

    # gradient background
    yy = np.linspace(0, 1, size)[:, None]
    bg = (np.array([0.10, 0.07, 0.14]) * (1 - yy) + np.array([0.20, 0.24, 0.34]) * yy)
    img = np.repeat(bg[:, None, :], size, axis=1).astype(np.float32)
    zbuf = np.full((size, size), 1e9, np.float32)

    order = np.argsort(-depth)  # far first so near overwrites; splat 2x2
    for dx in (0, 1):
        for dy in (0, 1):
            x = np.clip(px[order] + dx, 0, size - 1)
            y = np.clip(py[order] + dy, 0, size - 1)
            d = depth[order]
            c = lit[order]
            closer = d < zbuf[y, x]
            xi, yi, ci, di = x[closer], y[closer], c[closer], d[closer]
            img[yi, xi] = ci
            zbuf[yi, xi] = di
    return Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))


def main(argv=None) -> int:
    argv = argv or sys.argv[1:]
    out = Path("/tmp")
    names = []
    i = 0
    while i < len(argv):
        if argv[i] == "--out":
            out = Path(argv[i + 1]); i += 2
        else:
            names.append(argv[i]); i += 1
    out.mkdir(parents=True, exist_ok=True)
    for name in names:
        p = GLB_DIR / f"{name}.glb"
        if not p.exists():
            print(f"missing {p}", file=sys.stderr); continue
        im = render(p)
        dest = out / f"preview_{name}.png"
        im.save(dest)
        print(f"rendered {name} -> {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
