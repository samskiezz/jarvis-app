# Underworld UE5 — Book V: STATUS

**State: COMPLETE (code + contract), verified, with a self-terminating server-side verify loop running.**

You asked to start and finish Book V on the UE5 side, run it with Kimi/swarms on the server, and
have it keep going till done so you could close the chat and sleep. Here's where it landed.

## What "Book V on UE5" was
The bible's Book V (Professional Completeness Upgrade) is a contract spec. The **backend** half
already shipped (`scene_state.py` emits `contract_version: 2`). The **UE5 client** half was lagging —
it only parsed a subset of v2 and had a latent bug (it read `time_of_day`/`weather`/`terrain_seed`
at the top level, but v2 nests them under `frame{}`/`terrain{}`). This work brings the UE5 client to
full Book V / v2 parity. It's all C++/config — no Editor needed — so it was finishable headless.

## Done (this session)
- **Full v2 parse** — `SceneStateTypes.h` + `SceneStateClient.cpp` now read the entire contract:
  the AI-Director frame (Overmind, chatter, God-beat), the Watched-Creator PresenceField, and every
  per-minion field (awareness, awakened, needs, identity, drive, prominence, guild colour). Latent
  top-level/`frame` bug fixed.
- **God-verbs + gaze** — `PostAct` (bless/gift/cull/smite/speak) and `PostGaze` wired to the real
  `routes/god.py` endpoints, through the `WorldManager` god API + `PlayerController` inputs. Red-team
  mitigations folded in: no key logging, `speak` sanitised, destructive verbs confirm-gated + cooled
  down, gaze ≤10 Hz, 429 surfaced.
- **Render hooks** — minion prominence scale, guild tint, mood→emotion (`EUwEmotion`), awareness-bleed,
  awakening one-shot; frame hooks for Overmind / God-beat (fire-once) / presence; two-tier crowd→
  MetaHuman promotion (decision + hysteresis + ≤4 budget in C++; mesh swap is the Editor half).
- **God-View HUD** — `AUnderworldGodHud` in **Underworld's own** palette (`UnderworldArtPalette.h`,
  per ART-DIRECTION.md) — *not* JARVIS. Stance read, mean-awareness gauge, awakened count, critical-
  alert lane, whisper feed.
- **Underworld ≠ JARVIS** — corrected per your note. The UE5 client wears Underworld's look; JARVIS is
  a separate product whose only tie is *access* to the Minions, through these same v2 contracts. That
  access seam is documented in `BOOK-V-UE5-CONFORMANCE.md` and the bible's new **Part M**.
- **Tests green** — fixed a stale assertion + a pre-existing anim bug; added `test_ue5_v2_contract_fields`
  (a two-way guard: fails if either end drops a field). All `test_scene_state.py` pass.
- **Docs** — `BOOK-V-UE5-CONFORMANCE.md` (full requirement→symbol map), runbook updated, bible Part M added.

## Does the game play? — YES (today, via the live renderer)
Verified end-to-end on the running server:
- **Sim**: `underworld-backend` live on `:8091`, world *Underworld Prime* auto-advancing (tick 1069+),
  serving `contract_version: 2` with every field the UE5 client reads (incl. the audit-added
  `epoch`/`generation`/`behavior`/`presence`) on the live wire.
- **Renderer**: `underworld-web` (the WebGL/R3F world) live on `:5180` — *UNDERWORLD · Patent
  Civilisation Simulator* — playing that exact scene-state now.

So the **game plays today in the browser**. The **UE5 high-fidelity** path is now code-complete at
Book V/v2 parity behind the *same* `scene-state` contract (no backend change) — but to *play as a UE5
build* it still needs the one thing a headless sandbox can't do: the Unreal Editor + a GPU render box
+ authored art + packaging (see `UE5-FINISH-RUNBOOK.md`). The code/contract half — Book V's subject —
is done.

## Hardened by an adversarial audit (10 fixes)
A 22-agent adversarial workflow (review → skeptic-verify → synthesise) found **10 real defects; all
10 fixed**: 4 dropped wire fields (`behavior`, `generation`, `epoch`, terrain
`elevation_bias`/`town_radius`/`heightmap_size`), a `tick`/`seed` int64→float precision loss (broke
deterministic terrain parity), the prominence change-detect guard, the API key on argv (now
env-first), the idempotency key (now a 2 s wall-clock bucket), and the two bible gaps **F.4**
(deterministic per-minion voice) and **G.4** (consequence-forecast — a real read-only backend
endpoint + client call). New backend test `test_god_forecast.py`; the contract guard updated.

## The loop (running on the server, GPU-accelerated)
`underworld/scripts/bookv_polish_loop.py`, installed on **system cron** (survives this chat closing).
Each pass: runs the contract tests; an **authoritative deterministic set-diff** (instant, exact) of
the spec keys vs the keys the UE5 parser reads; and a **GPU-resident semantic review** on the Vast
2×4090 box (`llama3.1:8b`, ~1.5 s, VRAM-loaded — Kimi K2.6 fallback) as advisory. Appends to
`BOOKV_LOOP_JOURNAL.md`; when clean twice in a row it writes `.bookv_done` and **removes its own cron
entry** — it stops itself. It does **not** edit code or touch git (so you won't wake to a broken
tree); anything needing real code work is logged as `NEEDS-CLAUDE` in the journal.

### Check on it when you wake
```
cat underworld/deploy/ue5-project/BOOKV_LOOP_JOURNAL.md     # per-pass log + DONE marker
ls  underworld/deploy/ue5-project/.bookv_done               # exists once it self-completes
crontab -l | grep underworld-bookv-loop                     # gone once done
grep NEEDS-CLAUDE underworld/deploy/ue5-project/BOOKV_LOOP_JOURNAL.md   # anything for me to action
```

## What still needs you (the Editor/art half — unchanged, can't be done headless)
Import GLBs, build the level, author `BP_Minion`/`BP_PlayableMinion` (Anim BP + the new
`OnEmotionChanged`/`OnAwarenessChanged`/`OnAwakened`/`OnGuildColor`/`OnHeroPromotionChanged` events),
the `WBP_GodHud` widget against `UnderworldArtPalette`, Niagara, then package Linux Shipping on a
Vulkan+NVENC box. See `UE5-FINISH-RUNBOOK.md`.
