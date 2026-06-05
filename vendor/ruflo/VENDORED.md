# Vendored: ruflo

This directory is a **complete, verbatim copy** of the upstream repository
[`ruvnet/ruflo`](https://github.com/ruvnet/ruflo), vendored into this project at
the user's request ("add everything, all its features and functions").

| | |
|---|---|
| **Upstream**      | https://github.com/ruvnet/ruflo |
| **Branch**        | `main` |
| **Commit**        | `d065b15927c6ba7318623e8af123e7980e4c6681` (see `.UPSTREAM_SHA`) |
| **Vendored on**   | 2026-06-05 |
| **License**       | MIT — Copyright (c) 2024-2026 ruvnet (see `LICENSE` in this directory) |

## Terms

ruflo is MIT-licensed, which permits copying, modification, and redistribution
provided the copyright notice and license text are retained. The original
`LICENSE` file is preserved unmodified in this directory to satisfy that
requirement. All copyright remains with the original author (ruvnet).

## What this is — and isn't

This is the **source tree**, copied complete (everything except the upstream
`.git` history, which was removed so it vendors as plain files rather than a
nested repository). It includes ruflo's TypeScript/Rust/Svelte code, agents,
plugins, docs, and configuration.

It is **not yet wired into this project's runtime.** ruflo is a Node/Rust
framework; this app's backend is Python/FastAPI. Vendoring places the code in
the tree; making ruflo's services actually run and integrate with the backend
(installing its npm/pnpm dependencies, building it, and bridging it to the
Python API) is a separate integration step. See the upstream `README.md` and
`CLAUDE.md` in this directory for ruflo's own build/run instructions.

## Updating

To refresh from upstream, re-clone `ruvnet/ruflo`, remove its `.git`, and
replace this directory's contents, then update the commit SHA above.
