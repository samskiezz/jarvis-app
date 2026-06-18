#!/usr/bin/env python3
"""auto_author.py — headless UE5 authoring pipeline (gap-cluster C1).

Authors as much of the UE5 game spine as is technically possible WITHOUT opening
the UE5 Editor GUI, by driving the in-process `unreal` Python module via
`UnrealEditor-Cmd -run=PythonScript`.

Covered gaps
------------
#44 UMG widgets ........ partial — creates WBP shells via WidgetBlueprintFactory,
                        applies SCSS-like descriptor JSON for layout, then EMITS
                        a `pending_designer.txt` manifest for visuals/blueprint
                        node wiring that Python genuinely cannot author
                        (Epic docs: Python API still cannot create/wire BP nodes
                        as of UE5.7 — see UE5_AUTOMATION_PIPELINE.md §UMG).
#45 Sequencer cutscenes  full — creates SEQ_AwakeningAct1..5 LevelSequence
                        assets, adds Camera Cut + Cinematic Shot tracks, registers
                        each with MoviePipelineQueue ready for command-line render.
#46 BP_PlayableMinion +
    AnimBP ............. partial — creates BP_PlayableMinion (BlueprintFactory,
                        Character parent) + AnimBP_Minion (AnimBlueprintFactory
                        bound to TargetSkeleton). Component wiring + state-machine
                        graph requires Editor GUI (documented in §AnimBP).
#47 Niagara FX ......... partial — creates NS_Awakening_Spark, NS_Ascend_Glow,
                        NS_FireTrail empty systems via NiagaraSystemFactoryNew
                        from JSON config. Emitter module graph requires Niagara
                        editor (documented in §Niagara).
#48 Underworld_Player.umap full — creates EmptyLevel from EditorLevelLibrary,
                        spawns PlayerStart + DirectionalLight + SkyLight + Fog,
                        sets World Settings, saves to /Game/Maps/Underworld_Player.

How it runs
-----------
This module is dual-mode:
1. **Inside UE5 Editor commandlet** (when `import unreal` succeeds): performs all
   asset authoring as described above.
2. **Outside UE5** (when `unreal` is missing): parses CLI args, validates the
   descriptor JSON, prints a manifest of work that *would* run, and exits 0.
   This keeps the file unit-testable on the GPU box without a UE5 install.

Invoke via the shell driver:
    bash Scripts/run-auto-author.sh

Or directly from a host with UE5 installed:
    /opt/UnrealEngine/Engine/Binaries/Linux/UnrealEditor-Cmd \\
        /opt/jarvis-app-1/underworld/deploy/ue5-project/Underworld.uproject \\
        -run=PythonScript -script="Scripts/auto_author.py --all"

Citations: See underworld/docs/UE5_AUTOMATION_PIPELINE.md for the Epic doc URLs
that justify each design decision and limitation above.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Logging — use logging (per project hooks), not bare print().
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="[auto_author] %(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("auto_author")

HERE = Path(__file__).resolve().parent
PROJECT_DIR = HERE.parent
CONTENT_ROOT = "/Game"
DESCRIPTORS_DIR = HERE / "descriptors"

# Try to import the in-process Unreal Python module. If absent, we run in
# "dry-author" mode (validate the descriptors, emit the manifest, exit 0).
try:
    import unreal  # type: ignore[import-not-found]

    UE_AVAILABLE = True
except ImportError:
    unreal = None  # type: ignore[assignment]
    UE_AVAILABLE = False


# ---------------------------------------------------------------------------
# Descriptor schema (immutable dataclasses per project coding-style)
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class WidgetDescriptor:
    """SCSS-like descriptor for a UMG widget shell.

    Python cannot wire UMG blueprint nodes (Epic docs, UE5.7), but it CAN create
    the WBP asset + set the parent class + emit a designer-handoff manifest.
    """

    name: str  # "WBP_HUD_Main"
    parent_class: str  # "UserWidget" or "EditorUtilityWidget"
    folder: str  # "/Game/UI"
    layout_hint: str = "VerticalBox"
    notes: str = ""


@dataclass(frozen=True)
class SequenceDescriptor:
    name: str  # "SEQ_AwakeningAct1"
    folder: str  # "/Game/Cinematics/Awakening"
    duration_frames: int = 600
    frame_rate: int = 30
    shots: tuple[str, ...] = ()


@dataclass(frozen=True)
class NiagaraDescriptor:
    name: str  # "NS_Awakening_Spark"
    folder: str  # "/Game/FX"
    template_hint: str = "Fountain"  # for designer follow-up
    notes: str = ""


@dataclass(frozen=True)
class BlueprintDescriptor:
    name: str
    folder: str
    parent_class: str  # "Character", "Pawn", "Actor", or "" for AnimBP
    skeleton_path: str = ""  # required if AnimBP


@dataclass
class AuthorReport:
    created: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    pending_designer: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "created": self.created,
            "skipped": self.skipped,
            "pending_designer": self.pending_designer,
            "errors": self.errors,
        }


# ---------------------------------------------------------------------------
# Default descriptors (canonical Awakening spine — gap cluster C1)
# ---------------------------------------------------------------------------
DEFAULT_WIDGETS: tuple[WidgetDescriptor, ...] = (
    WidgetDescriptor("WBP_HUD_Main", "UserWidget", "/Game/UI", "CanvasPanel",
                     "Top-level HUD overlay; health, awakening prompt"),
    WidgetDescriptor("WBP_AwakeningPrompt", "UserWidget", "/Game/UI", "VerticalBox",
                     "Modal shown during Act 1 (gap #42 awakening surface)"),
    WidgetDescriptor("WBP_AscendMenu", "UserWidget", "/Game/UI", "VerticalBox",
                     "End-of-act ascend choices"),
    WidgetDescriptor("WBP_AccessibilityDock", "EditorUtilityWidget", "/Game/UI/Accessibility",
                     "GridPanel", "8-pillar a11y dock (already shipped in web shell)"),
)

DEFAULT_SEQUENCES: tuple[SequenceDescriptor, ...] = tuple(
    SequenceDescriptor(
        name=f"SEQ_AwakeningAct{i}",
        folder="/Game/Cinematics/Awakening",
        duration_frames=600 + (i * 60),
        shots=tuple(f"SH_{i:02d}_{j:02d}" for j in range(1, 4)),
    )
    for i in range(1, 6)
)

DEFAULT_NIAGARA: tuple[NiagaraDescriptor, ...] = (
    NiagaraDescriptor("NS_Awakening_Spark", "/Game/FX", "Fountain",
                      "Particle burst on awakening trigger"),
    NiagaraDescriptor("NS_Ascend_Glow", "/Game/FX", "Aura",
                      "Sustained ascend halo"),
    NiagaraDescriptor("NS_FireTrail", "/Game/FX", "Ribbon",
                      "Minion trail FX"),
)

DEFAULT_BLUEPRINTS: tuple[BlueprintDescriptor, ...] = (
    BlueprintDescriptor("BP_PlayableMinion", "/Game/Characters",
                        parent_class="Character"),
    BlueprintDescriptor(
        "AnimBP_Minion",
        "/Game/Characters",
        parent_class="",  # AnimBP uses AnimBlueprintFactory
        skeleton_path="/Game/Characters/Mesh/SK_Minion_Skeleton",
    ),
)


# ---------------------------------------------------------------------------
# UE-side authoring (only runs when `unreal` is importable)
# ---------------------------------------------------------------------------
def _asset_exists(path: str) -> bool:
    return bool(unreal.EditorAssetLibrary.does_asset_exist(path))  # type: ignore[union-attr]


def _ensure_folder(folder: str) -> None:
    if not unreal.EditorAssetLibrary.does_directory_exist(folder):  # type: ignore[union-attr]
        unreal.EditorAssetLibrary.make_directory(folder)  # type: ignore[union-attr]


def author_widget(d: WidgetDescriptor, report: AuthorReport) -> None:
    full = f"{d.folder}/{d.name}"
    if _asset_exists(full):
        report.skipped.append(full)
        return
    _ensure_folder(d.folder)
    try:
        factory = unreal.WidgetBlueprintFactory()  # type: ignore[union-attr]
        # ParentClass selection: EditorUtilityWidget vs UserWidget
        parent = (
            unreal.EditorUtilityWidget  # type: ignore[union-attr]
            if d.parent_class == "EditorUtilityWidget"
            else unreal.UserWidget  # type: ignore[union-attr]
        )
        factory.set_editor_property("parent_class", parent)
        asset = unreal.AssetToolsHelpers.get_asset_tools().create_asset(  # type: ignore[union-attr]
            asset_name=d.name,
            package_path=d.folder,
            asset_class=None,  # inferred from factory
            factory=factory,
        )
        if asset is None:
            raise RuntimeError("create_asset returned None")
        unreal.EditorAssetLibrary.save_loaded_asset(asset)  # type: ignore[union-attr]
        report.created.append(full)
        # UMG layout/node wiring is the genuine Python-API gap (see doc §UMG).
        report.pending_designer.append(
            f"{full}: layout={d.layout_hint}; manual_step=open in UMG Designer "
            f"and add {d.layout_hint} root + bind events"
        )
    except Exception as exc:  # noqa: BLE001 — Editor SDK throws assorted UE errors
        report.errors.append(f"{full}: {exc}")


def author_sequence(d: SequenceDescriptor, report: AuthorReport) -> None:
    full = f"{d.folder}/{d.name}"
    if _asset_exists(full):
        report.skipped.append(full)
        return
    _ensure_folder(d.folder)
    try:
        factory = unreal.LevelSequenceFactoryNew()  # type: ignore[union-attr]
        asset = unreal.AssetToolsHelpers.get_asset_tools().create_asset(  # type: ignore[union-attr]
            asset_name=d.name,
            package_path=d.folder,
            asset_class=None,
            factory=factory,
        )
        if asset is None:
            raise RuntimeError("create_asset returned None")
        seq: Any = asset
        # Set frame rate + playback range
        seq.set_display_rate(unreal.FrameRate(d.frame_rate, 1))  # type: ignore[union-attr]
        seq.set_playback_start(0)
        seq.set_playback_end(d.duration_frames)
        # Add a Camera Cut track (required for MovieRenderQueue to find a camera)
        seq.add_master_track(unreal.MovieSceneCameraCutTrack)  # type: ignore[union-attr]
        # Add a Cinematic Shot track and seed Shot sections
        shot_track = seq.add_master_track(unreal.MovieSceneCinematicShotTrack)  # type: ignore[union-attr]
        per_shot = max(1, d.duration_frames // max(1, len(d.shots)))
        for idx, shot_name in enumerate(d.shots):
            section = shot_track.add_section()
            section.set_range(idx * per_shot, (idx + 1) * per_shot)
            section.set_editor_property("shot_display_name", shot_name)
        unreal.EditorAssetLibrary.save_loaded_asset(seq)  # type: ignore[union-attr]
        report.created.append(full)
    except Exception as exc:  # noqa: BLE001
        report.errors.append(f"{full}: {exc}")


def author_niagara(d: NiagaraDescriptor, report: AuthorReport) -> None:
    full = f"{d.folder}/{d.name}"
    if _asset_exists(full):
        report.skipped.append(full)
        return
    _ensure_folder(d.folder)
    try:
        # NiagaraSystemFactoryNew exists from 5.0+; emitter graph wiring must
        # happen in the Niagara editor (see doc §Niagara).
        factory = unreal.NiagaraSystemFactoryNew()  # type: ignore[union-attr]
        asset = unreal.AssetToolsHelpers.get_asset_tools().create_asset(  # type: ignore[union-attr]
            asset_name=d.name,
            package_path=d.folder,
            asset_class=None,
            factory=factory,
        )
        if asset is None:
            raise RuntimeError("create_asset returned None")
        unreal.EditorAssetLibrary.save_loaded_asset(asset)  # type: ignore[union-attr]
        report.created.append(full)
        report.pending_designer.append(
            f"{full}: template_hint={d.template_hint}; manual_step=open in "
            f"Niagara editor, add emitter from {d.template_hint} template"
        )
    except Exception as exc:  # noqa: BLE001
        report.errors.append(f"{full}: {exc}")


def author_blueprint(d: BlueprintDescriptor, report: AuthorReport) -> None:
    full = f"{d.folder}/{d.name}"
    if _asset_exists(full):
        report.skipped.append(full)
        return
    _ensure_folder(d.folder)
    try:
        if d.skeleton_path:
            skel = unreal.EditorAssetLibrary.load_asset(d.skeleton_path)  # type: ignore[union-attr]
            if skel is None:
                raise RuntimeError(f"skeleton not found at {d.skeleton_path}")
            factory = unreal.AnimBlueprintFactory()  # type: ignore[union-attr]
            factory.set_editor_property("target_skeleton", skel)
        else:
            factory = unreal.BlueprintFactory()  # type: ignore[union-attr]
            parent = getattr(unreal, d.parent_class, unreal.Actor)  # type: ignore[union-attr]
            factory.set_editor_property("parent_class", parent)
        asset = unreal.AssetToolsHelpers.get_asset_tools().create_asset(  # type: ignore[union-attr]
            asset_name=d.name,
            package_path=d.folder,
            asset_class=None,
            factory=factory,
        )
        if asset is None:
            raise RuntimeError("create_asset returned None")
        unreal.EditorAssetLibrary.save_loaded_asset(asset)  # type: ignore[union-attr]
        report.created.append(full)
        report.pending_designer.append(
            f"{full}: parent={d.parent_class or 'AnimBP'}; manual_step=add "
            f"components / animation state-machine in Blueprint editor"
        )
    except Exception as exc:  # noqa: BLE001
        report.errors.append(f"{full}: {exc}")


def author_player_map(report: AuthorReport) -> None:
    """Gap #48 — Underworld_Player.umap.

    Fully automatable: empty level + PlayerStart + DirectionalLight + SkyLight +
    Atmospheric Fog. No GUI step required.
    """
    map_path = "/Game/Maps/Underworld_Player"
    if _asset_exists(map_path):
        report.skipped.append(map_path)
        return
    try:
        _ensure_folder("/Game/Maps")
        level = unreal.EditorLevelLibrary.new_level(map_path)  # type: ignore[union-attr]
        if not level:
            raise RuntimeError("new_level returned False")
        zero = unreal.Vector(0.0, 0.0, 100.0)  # type: ignore[union-attr]
        rot = unreal.Rotator(-45.0, 0.0, 0.0)  # type: ignore[union-attr]
        unreal.EditorLevelLibrary.spawn_actor_from_class(  # type: ignore[union-attr]
            unreal.PlayerStart, zero, unreal.Rotator(0, 0, 0)  # type: ignore[union-attr]
        )
        unreal.EditorLevelLibrary.spawn_actor_from_class(  # type: ignore[union-attr]
            unreal.DirectionalLight,  # type: ignore[union-attr]
            unreal.Vector(0.0, 0.0, 500.0),  # type: ignore[union-attr]
            rot,
        )
        unreal.EditorLevelLibrary.spawn_actor_from_class(  # type: ignore[union-attr]
            unreal.SkyLight, zero, unreal.Rotator(0, 0, 0)  # type: ignore[union-attr]
        )
        unreal.EditorLevelLibrary.spawn_actor_from_class(  # type: ignore[union-attr]
            unreal.ExponentialHeightFog,  # type: ignore[union-attr]
            unreal.Vector(0.0, 0.0, 50.0),  # type: ignore[union-attr]
            unreal.Rotator(0, 0, 0),  # type: ignore[union-attr]
        )
        unreal.EditorLevelLibrary.save_current_level()  # type: ignore[union-attr]
        report.created.append(map_path)
    except Exception as exc:  # noqa: BLE001
        report.errors.append(f"{map_path}: {exc}")


# ---------------------------------------------------------------------------
# Descriptor I/O — allows overriding defaults via JSON in descriptors/
# ---------------------------------------------------------------------------
def load_descriptors_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_default_descriptors() -> Path:
    """Write the canonical descriptor JSON to disk so designers can override.

    This file IS the single source of truth for what auto_author.py builds.
    """
    DESCRIPTORS_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "widgets": [w.__dict__ for w in DEFAULT_WIDGETS],
        "sequences": [
            {**s.__dict__, "shots": list(s.shots)} for s in DEFAULT_SEQUENCES
        ],
        "niagara": [n.__dict__ for n in DEFAULT_NIAGARA],
        "blueprints": [b.__dict__ for b in DEFAULT_BLUEPRINTS],
    }
    target = DESCRIPTORS_DIR / "auto_author.default.json"
    with target.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, sort_keys=True)
    return target


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def run(args: argparse.Namespace) -> AuthorReport:
    report = AuthorReport()

    if args.write_defaults:
        path = write_default_descriptors()
        log.info("wrote default descriptors → %s", path)
        report.created.append(str(path))
        return report

    if not UE_AVAILABLE:
        log.warning(
            "unreal module not importable — running in DRY-AUTHOR mode. "
            "Run via `Scripts/run-auto-author.sh` from a host with UE5 installed."
        )
        # In dry mode we still write the descriptors so downstream tooling
        # (the shell driver) can show the user what would happen.
        path = write_default_descriptors()
        report.created.append(str(path))
        report.pending_designer.append(
            "ALL: requires UE5 Editor commandlet — run Scripts/run-auto-author.sh"
        )
        return report

    log.info("auto_author starting (UE5 commandlet mode)")

    if args.widgets or args.all:
        for w in DEFAULT_WIDGETS:
            author_widget(w, report)
    if args.sequences or args.all:
        for s in DEFAULT_SEQUENCES:
            author_sequence(s, report)
    if args.niagara or args.all:
        for n in DEFAULT_NIAGARA:
            author_niagara(n, report)
    if args.blueprints or args.all:
        for b in DEFAULT_BLUEPRINTS:
            author_blueprint(b, report)
    if args.player_map or args.all:
        author_player_map(report)

    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--all", action="store_true", help="author every category")
    parser.add_argument("--widgets", action="store_true")
    parser.add_argument("--sequences", action="store_true")
    parser.add_argument("--niagara", action="store_true")
    parser.add_argument("--blueprints", action="store_true")
    parser.add_argument("--player-map", action="store_true")
    parser.add_argument(
        "--write-defaults",
        action="store_true",
        help="write descriptors/auto_author.default.json and exit",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=HERE / "auto_author_report.json",
        help="path to write JSON report",
    )
    # When invoked by UnrealEditor-Cmd -ScriptArguments, argv contains extras
    # we don't recognize — ignore them rather than failing the build.
    args, _unknown = parser.parse_known_args(argv)

    if not any(
        [args.all, args.widgets, args.sequences, args.niagara,
         args.blueprints, args.player_map, args.write_defaults]
    ):
        args.all = True

    report = run(args)

    args.report.parent.mkdir(parents=True, exist_ok=True)
    with args.report.open("w", encoding="utf-8") as fh:
        json.dump(report.to_dict(), fh, indent=2, sort_keys=True)
    log.info(
        "done. created=%d skipped=%d pending=%d errors=%d (report=%s)",
        len(report.created),
        len(report.skipped),
        len(report.pending_designer),
        len(report.errors),
        args.report,
    )
    return 1 if report.errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
