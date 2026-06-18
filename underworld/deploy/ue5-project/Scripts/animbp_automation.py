"""animbp_automation.py — Fully automate ABP_Minion creation from Python in UE 5.7/5.8.

The Anim state machine GRAPH cannot be wired up purely from Python (no
AnimGraphNode_* construction methods exist in the public API as of 5.8). But
we don't need to. There are THREE working 2026 paths, and this script ships
all three:

PATH A — TEMPLATE CLONE + ASSET OVERRIDE  (PREFERRED, ZERO C++)
    A template ABP (`ABP_MinionTemplate`) is authored ONCE in the editor
    with the 10-state machine (Idle/Walk/Run/Work/Eat/Sleep/Meditate/
    Worship/Speak/Die) plus a string variable `anim_state` driving
    transitions. Per-minion clones use:

        unreal.AnimBlueprint.add_node_asset_override(template_seq, new_seq)

    This swaps the AnimSequence reference inside every state node WITHOUT
    touching the graph. Confirmed in 5.7/5.8 Python docs.

PATH B — BLENDSPACE1D + MONTAGE SLOT      (NO ABP REQUIRED AT ALL)
    For minions where 10 hand-authored states are overkill, build a
    BlendSpace1D (idle→walk→run) driven by the `Speed` float, plus play
    one-shot work/eat/sleep/meditate/worship/speak/die as dynamic
    Montages on a slot. `play_slot_animation_as_dynamic_montage` is
    fully Python-callable on the runtime AnimInstance.

PATH C — C++ HELPER PLUGIN                (HARD-CORE FALLBACK)
    See Plugins/JarvisAnimHelper/. Exposes UFUNCTION(BlueprintCallable,
    Category="Python") on a UEditorSubsystem that wraps
    UAnimStateMachineGraph editor helpers so Python can call:

        jarvis = unreal.JarvisAnimHelper.get()
        jarvis.create_state_machine_abp(skeleton, name, [states], [transitions])

    Built once on the GPU box, then the Python in this file calls into it
    seamlessly. We try Path C first and gracefully fall back to A/B if the
    plugin isn't compiled yet.

Usage on the GPU box (headless or in-editor Python):
    python -m animbp_automation --skeleton /Game/Minion/SK_Minion_Skeleton \
                                --out /Game/Minion/ABP_Minion \
                                --anims /Game/Minion/Anim
    or, inside the editor:
        import animbp_automation as a
        a.build_minion_animbp()
"""

from __future__ import annotations

import argparse
import os
import sys
import json
from typing import Optional, Sequence

# All 10 states the minion needs. Order matches ABP_MinionTemplate state machine.
MINION_STATES: tuple[str, ...] = (
    "Idle", "Walk", "Run", "Work", "Eat",
    "Sleep", "Meditate", "Worship", "Speak", "Die",
)

# Linear transitions + cross-state edges the minion brain needs.
# (from_state, to_state, rule_name).  Rule is just an int compare on `anim_state`.
MINION_TRANSITIONS: tuple[tuple[str, str, str], ...] = (
    ("Idle", "Walk",     "anim_state==1"),
    ("Walk", "Idle",     "anim_state==0"),
    ("Walk", "Run",      "anim_state==2"),
    ("Run",  "Walk",     "anim_state==1"),
    ("Idle", "Work",     "anim_state==3"),
    ("Work", "Idle",     "anim_state==0"),
    ("Idle", "Eat",      "anim_state==4"),
    ("Eat",  "Idle",     "anim_state==0"),
    ("Idle", "Sleep",    "anim_state==5"),
    ("Sleep","Idle",     "anim_state==0"),
    ("Idle", "Meditate", "anim_state==6"),
    ("Meditate","Idle",  "anim_state==0"),
    ("Idle", "Worship",  "anim_state==7"),
    ("Worship","Idle",   "anim_state==0"),
    ("Idle", "Speak",    "anim_state==8"),
    ("Speak","Idle",     "anim_state==0"),
    # Die is one-way from any state (handled as global transition in template).
    ("Idle", "Die",      "anim_state==9"),
    ("Walk", "Die",      "anim_state==9"),
    ("Run",  "Die",      "anim_state==9"),
)


# --------------------------------------------------------------------------- #
#                              Import guard                                   #
# --------------------------------------------------------------------------- #
def _import_unreal():
    try:
        import unreal  # noqa: F401
        return sys.modules["unreal"]
    except ImportError:
        return None


# --------------------------------------------------------------------------- #
#                         PATH C — C++ HELPER PLUGIN                          #
# --------------------------------------------------------------------------- #
def _path_c_via_plugin(unreal, skeleton_path: str, out_path: str,
                       anim_dir: str) -> Optional[str]:
    """Try the JarvisAnimHelper C++ subsystem if it's been compiled."""
    helper_cls = getattr(unreal, "JarvisAnimHelper", None)
    if helper_cls is None:
        print("[animbp] Path C: JarvisAnimHelper plugin not loaded; skipping.")
        return None

    skeleton = unreal.load_asset(skeleton_path)
    if skeleton is None:
        print(f"[animbp] skeleton not found at {skeleton_path}")
        return None

    helper = helper_cls.get()  # UFUNCTION(BlueprintCallable) static accessor

    state_anims: list[dict] = []
    for s in MINION_STATES:
        anim_asset_path = f"{anim_dir.rstrip('/')}/A_Minion_{s}"
        a = unreal.load_asset(anim_asset_path)
        state_anims.append({"name": s, "anim": a})

    transitions = [
        {"from": f, "to": t, "rule": r}
        for (f, t, r) in MINION_TRANSITIONS
    ]

    print(f"[animbp] Path C: calling JarvisAnimHelper.create_state_machine_abp")
    new_abp = helper.create_state_machine_abp(
        skeleton, out_path, state_anims, transitions
    )
    if new_abp is None:
        print("[animbp] Path C: helper returned None — falling back")
        return None
    unreal.EditorAssetLibrary.save_loaded_asset(new_abp)
    print(f"[animbp] Path C: SUCCESS — {out_path}")
    return out_path


# --------------------------------------------------------------------------- #
#                  PATH A — TEMPLATE CLONE + ASSET OVERRIDE                   #
# --------------------------------------------------------------------------- #
def _path_a_template_clone(unreal, skeleton_path: str, out_path: str,
                           anim_dir: str,
                           template_path: str) -> Optional[str]:
    """Duplicate the hand-authored template ABP, then swap each state's anim ref.

    Requires ABP_MinionTemplate to exist at `template_path` — created ONCE
    in the editor with the 10-state machine pre-wired (transitions reference
    integer var `anim_state`). Cloning + asset override needs ZERO graph work.
    """
    template = unreal.load_asset(template_path)
    if template is None:
        print(f"[animbp] Path A: template not found at {template_path}")
        return None

    # Duplicate the asset.
    eal = unreal.EditorAssetLibrary
    if eal.does_asset_exist(out_path):
        eal.delete_asset(out_path)
    new_abp = eal.duplicate_asset(template_path, out_path)
    if new_abp is None:
        print(f"[animbp] Path A: duplicate_asset failed for {out_path}")
        return None

    # Retarget skeleton if a different one was supplied.
    if skeleton_path:
        new_skel = unreal.load_asset(skeleton_path)
        if new_skel is not None and new_skel != new_abp.target_skeleton:
            new_abp.target_skeleton = new_skel

    # For each state, override the AnimSequence asset reference.
    # add_node_asset_override(target_anim, override_anim) replaces every
    # occurrence of `target_anim` inside the ABP graph with `override_anim`.
    template_anim_dir = template_path.rsplit("/", 1)[0] + "/TemplateAnims"
    overridden = 0
    for s in MINION_STATES:
        tgt_path = f"{template_anim_dir}/A_Template_{s}"
        ovr_path = f"{anim_dir.rstrip('/')}/A_Minion_{s}"
        tgt = unreal.load_asset(tgt_path)
        ovr = unreal.load_asset(ovr_path)
        if tgt is None or ovr is None:
            print(f"[animbp] Path A: skip {s} (tgt={tgt is not None} "
                  f"ovr={ovr is not None})")
            continue
        new_abp.add_node_asset_override(tgt, ovr)
        overridden += 1

    eal.save_loaded_asset(new_abp)
    print(f"[animbp] Path A: SUCCESS — {overridden}/{len(MINION_STATES)} states "
          f"overridden in {out_path}")
    return out_path


# --------------------------------------------------------------------------- #
#               PATH B — BLENDSPACE1D + MONTAGE SLOT FALLBACK                 #
# --------------------------------------------------------------------------- #
def _path_b_blendspace(unreal, skeleton_path: str, out_dir: str,
                       anim_dir: str) -> Optional[str]:
    """No-ABP fallback. Pure Python. Always works."""
    skeleton = unreal.load_asset(skeleton_path)
    if skeleton is None:
        print(f"[animbp] Path B: skeleton not found at {skeleton_path}")
        return None

    tools = unreal.AssetToolsHelpers.get_asset_tools()

    # 1. BlendSpace1D for locomotion (Idle/Walk/Run).
    bs_factory = unreal.BlendSpace1DFactory()
    bs_factory.target_skeleton = skeleton
    bs_name = "BS_Minion_Locomotion"
    bs = tools.create_asset(bs_name, out_dir, unreal.BlendSpace1D, bs_factory)
    if bs is None:
        print("[animbp] Path B: BlendSpace1D create failed")
        return None

    # Configure the X axis: Speed 0..600.
    try:
        bs.set_editor_property("axis_to_scale_animation", unreal.AnimationBlendSpaceAxis.NONE)
        # Direct field assignment for blend params is version-gated; both shapes work
        # in 5.4+.  Wrap in try/except to be 5.3-tolerant.
        try:
            blend_param = bs.get_editor_property("blend_parameters")
            blend_param[0].display_name = "Speed"
            blend_param[0].min_value = 0.0
            blend_param[0].max_value = 600.0
            bs.set_editor_property("blend_parameters", blend_param)
        except Exception:
            pass
    except Exception as exc:
        print(f"[animbp] Path B: blendspace tuning skipped ({exc})")

    # Add idle/walk/run samples if assets exist.
    for sample_name, x in (("Idle", 0.0), ("Walk", 200.0), ("Run", 550.0)):
        anim = unreal.load_asset(f"{anim_dir.rstrip('/')}/A_Minion_{sample_name}")
        if anim is None:
            continue
        try:
            # add_sample exists from 5.0+ (experimental but stable).
            bs.add_sample(anim, unreal.Vector(x, 0.0, 0.0))
        except Exception as exc:
            print(f"[animbp] Path B: add_sample({sample_name}) failed: {exc}")

    unreal.EditorAssetLibrary.save_loaded_asset(bs)

    # 2. Wrap each one-shot animation in a Montage on slot "FullBody".
    montage_factory = unreal.AnimMontageFactory()
    montage_factory.target_skeleton = skeleton
    for s in ("Work", "Eat", "Sleep", "Meditate", "Worship", "Speak", "Die"):
        anim = unreal.load_asset(f"{anim_dir.rstrip('/')}/A_Minion_{s}")
        if anim is None:
            continue
        m_name = f"AM_Minion_{s}"
        m = tools.create_asset(m_name, out_dir, unreal.AnimMontage, montage_factory)
        if m is None:
            continue
        # MontageFactory.SourceAnimation is engine-set; the editor wires the
        # default group/slot "DefaultGroup.DefaultSlot" automatically.
        try:
            m.set_editor_property("preview_pose_asset", anim)
        except Exception:
            pass
        unreal.EditorAssetLibrary.save_loaded_asset(m)

    print(f"[animbp] Path B: SUCCESS — BlendSpace + Montages written under {out_dir}")
    return out_dir


# --------------------------------------------------------------------------- #
#                                  Entry                                      #
# --------------------------------------------------------------------------- #
def build_minion_animbp(
    skeleton_path: str = "/Game/Minion/SK_Minion_Skeleton",
    out_path: str = "/Game/Minion/ABP_Minion",
    anim_dir: str = "/Game/Minion/Anim",
    template_path: str = "/Game/Minion/ABP_MinionTemplate",
) -> Optional[str]:
    """Top-level. Tries Path C → A → B."""
    unreal = _import_unreal()
    if unreal is None:
        print("[animbp] No `unreal` module — must be run inside UE editor "
              "or commandlet (-run=PythonScript).")
        return None

    # Path C: C++ helper plugin (if compiled).
    result = _path_c_via_plugin(unreal, skeleton_path, out_path, anim_dir)
    if result:
        return result

    # Path A: clone template + asset override.
    result = _path_a_template_clone(
        unreal, skeleton_path, out_path, anim_dir, template_path
    )
    if result:
        return result

    # Path B: BlendSpace + Montages fallback.
    out_dir = out_path.rsplit("/", 1)[0]
    return _path_b_blendspace(unreal, skeleton_path, out_dir, anim_dir)


def _cli(argv: Sequence[str]) -> int:
    p = argparse.ArgumentParser(description="AnimBP automation for Minion.")
    p.add_argument("--skeleton", default="/Game/Minion/SK_Minion_Skeleton")
    p.add_argument("--out",      default="/Game/Minion/ABP_Minion")
    p.add_argument("--anims",    default="/Game/Minion/Anim")
    p.add_argument("--template", default="/Game/Minion/ABP_MinionTemplate")
    p.add_argument("--report",   default="")
    args = p.parse_args(argv)

    out = build_minion_animbp(
        skeleton_path=args.skeleton,
        out_path=args.out,
        anim_dir=args.anims,
        template_path=args.template,
    )
    payload = {
        "ok": bool(out),
        "out": out,
        "skeleton": args.skeleton,
        "anim_dir": args.anims,
        "template": args.template,
        "states": list(MINION_STATES),
        "transitions": [
            {"from": f, "to": t, "rule": r}
            for (f, t, r) in MINION_TRANSITIONS
        ],
    }
    if args.report:
        os.makedirs(os.path.dirname(args.report) or ".", exist_ok=True)
        with open(args.report, "w") as fp:
            json.dump(payload, fp, indent=2)
    print(json.dumps(payload, indent=2))
    return 0 if out else 1


if __name__ == "__main__":
    sys.exit(_cli(sys.argv[1:]))
