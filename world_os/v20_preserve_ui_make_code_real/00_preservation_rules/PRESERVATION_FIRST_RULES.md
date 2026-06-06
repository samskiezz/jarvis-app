# V20 Preservation-First Rules

This pack treats the uploaded V7 ZIP as the canonical codebase.

## Never delete or shrink these systems
- `ui/`
- `advanced_ui/`
- `ui/jarvis_command_center/`
- `ui/jarvis_enterprise_operator_full/`
- WebGPU/WebGL/WASM/Protobuf/GPU-picking/quaternion-camera contracts
- graphics/effects/sounds/rendering/design-token files
- Foundry/Gotham/Apollo/AIP architecture files
- source/catalogue/database files

## Merge rule
New versions must patch in place or add overlays. They must not replace the UI with a smaller database-only pack.

## Honesty rule
A file is only called production-ready if it:
1. compiles or validates,
2. has a test or build log,
3. does not raise `NotImplementedError`,
4. does not hide missing live infrastructure behind fake success.

## Packaging rule
V20 keeps V7 as canonical and stores V18 only as a reference folder named `_preserved_reference_v18_no_overwrite`.
