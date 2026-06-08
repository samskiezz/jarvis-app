// Copyright Underworld. All Rights Reserved.
//
// USTRUCT mirror of the backend's renderer-agnostic scene-state contract
// (GET /worlds/{id}/scene-state). One source of truth, two renderers (WebGL + UE5).
//
// ── CONTRACT VERSION 2 (Book V — Professional Completeness Upgrade) ──────────────────
// The backend (server/services/scene_state.py) ships `contract_version: 2`: server-tracked
// movement, the AI-Director frame (Overmind / chatter / God-beat), the Watched-Creator
// PresenceField (attention hotspots + creator presence), and the awakening/awareness signal
// each minion carries. This header is the UE5 half of that contract — it parses ALL of it so
// the high-fidelity renderer is at parity with both the WebGL renderer and the simulation.
// Book V Parts B.2 (wire), E.6/E.7 (god-presence + two-tier swap), G.1/G.2 (HUD + bleed),
// L.8/L.9 (PresenceField + Overmind) all hang off these structs.
#pragma once

#include "CoreMinimal.h"
#include "UnderworldEmotion.h"
#include "SceneStateTypes.generated.h"

/** One minion's live state for the current tick. */
USTRUCT(BlueprintType)
struct FUwMinionState
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) FString Id;
	UPROPERTY(BlueprintReadOnly) FString Name;                        // display name (name + surname)
	UPROPERTY(BlueprintReadOnly) FVector Pos = FVector::ZeroVector;   // world units (backend X,Y,Z)
	UPROPERTY(BlueprintReadOnly) float   Facing = 0.f;                // yaw degrees
	UPROPERTY(BlueprintReadOnly) FString Anim;                        // idle/walk/work/study/...
	UPROPERTY(BlueprintReadOnly) FString Mood;                        // content/curious/...
	UPROPERTY(BlueprintReadOnly) FString Saga;                        // current activity narrative
	UPROPERTY(BlueprintReadOnly) FString Guild;                       // CPC guild key (physics/maths/...)
	UPROPERTY(BlueprintReadOnly) FString Role;                        // scholar/engineer/builder/... (silhouette)
	UPROPERTY(BlueprintReadOnly) FLinearColor GuildColor = FLinearColor::Gray; // GUILD_LOOK tint (Part E.6)

	// ── MOVEMENT v2 (contract_version 2) — server-tracked walking ──────────────────
	// The backend now simulates each minion's kinematic, so the client dead-reckons
	// between ~1 Hz polls instead of teleporting. Velocity is the ground-plane vector
	// (backend units/sec) with elevation left to the terrain; MoveState drives the anim.
	UPROPERTY(BlueprintReadOnly) FVector Velocity = FVector::ZeroVector; // (vx, 0, vz) units/sec
	UPROPERTY(BlueprintReadOnly) FString MoveState;                      // idle/walk/occupy
	UPROPERTY(BlueprintReadOnly) float   Speed = 0.f;                    // units/sec scalar
	UPROPERTY(BlueprintReadOnly) FVector TargetPos = FVector::ZeroVector;// (tx, 0, tz) goal slot
	UPROPERTY(BlueprintReadOnly) bool    bHasTarget = false;

	// ── ACTIVITY (the sim→scene bridge: what the minion is REALLY doing this tick) ──
	UPROPERTY(BlueprintReadOnly) FString Action;                      // eat/craft/study/trade/...
	UPROPERTY(BlueprintReadOnly) FString TargetBuilding;             // market/academy/workshop/...
	UPROPERTY(BlueprintReadOnly) FString UsingAsset;                 // the machine/prop GLB they operate

	// ── COGNITION / AWAKENING (Book V Part D/G/L — the soul of the game) ───────────
	// awareness 0..1 ramps the "awareness-bleed" theme (Part G.2) and gates the
	// two-tier MetaHuman promotion (Part E.6). awakened = it knows it is watched.
	UPROPERTY(BlueprintReadOnly) float   Awareness = 0.f;            // 0..1 dawning self-awareness
	UPROPERTY(BlueprintReadOnly) bool    bAwakened = false;          // crossed the awakening threshold
	UPROPERTY(BlueprintReadOnly) FString Thought;                   // current inner monologue (Inspector)
	UPROPERTY(BlueprintReadOnly) FString Identity;                  // self_model.identity (who they think they are)
	UPROPERTY(BlueprintReadOnly) FString Drive;                     // dominant_drive

	// ── APPEARANCE / PROMINENCE ────────────────────────────────────────────────────
	// scale: masters / high-reputation minions render larger & adorned (0.8..1.5).
	UPROPERTY(BlueprintReadOnly) float   Prominence = 1.f;
	UPROPERTY(BlueprintReadOnly) int32   Generation = 0;           // lineage depth (backend Minion.generation)
	UPROPERTY(BlueprintReadOnly) float   Hunger = 0.f;              // need 0..1
	UPROPERTY(BlueprintReadOnly) float   Fatigue = 0.f;            // need 0..1
	UPROPERTY(BlueprintReadOnly) float   Sanity = 1.f;            // need 0..1
	UPROPERTY(BlueprintReadOnly) FString GeneEdit;                // CRISPR helix viz payload (raw JSON), empty if none
	// behavior: the continuous micro-interaction stream (go-to-bench→sit→operate→emote …) the
	// backend expands per minion. Carried as raw JSON so the AnimBP can drive richer behaviour
	// without the client committing to a schema (Book V Part C/K). Empty when absent.
	UPROPERTY(BlueprintReadOnly) FString BehaviorJson;

	// ── DERIVED EMOTION (Book V Part F/K — one canonical emotion_id for face+voice) ─
	// The backend emits MoodKind; we resolve it (+ awareness/needs) into the canonical
	// EUwEmotion the AnimBP/ARKit + TTS prosody read. Intensity scales the morph.
	UPROPERTY(BlueprintReadOnly) EUwEmotion Emotion = EUwEmotion::Neutral;
	UPROPERTY(BlueprintReadOnly) float      EmotionIntensity = 0.f; // 0..1

	// ── DETERMINISTIC VOICE IDENTITY (Book V Part F.4) ──────────────────────────────
	// A stable per-minion voice, seeded from the minion's immutable id (the renderer-side analogue
	// of F.4's Soul.token speaker-latent), so the same minion always sounds the same across sessions
	// and clients. VoicePitch (-1..1) and VoiceRate (~0.9..1.1) are derived; the TTS BP keys off them.
	UPROPERTY(BlueprintReadOnly) int32 VoiceSeed = 0;
	UPROPERTY(BlueprintReadOnly) float VoicePitch = 0.f;  // -1..1
	UPROPERTY(BlueprintReadOnly) float VoiceRate = 1.f;   // ~0.9..1.1

	// OVERRIDE PILLAR — the creator is currently wearing this body (Bible §4.4). Renderers show
	// a halo / hand control to the player for this one; its AI stands down server-side.
	UPROPERTY(BlueprintReadOnly) bool    bPossessed = false;
};

/** The colony's collective consciousness this cycle — the AI-Director Overmind (L1).
 *  `frame.overmind` on the wire. Drives the awareness-bleed theme, the Overmind chorus
 *  (audio Part F.5), and the God-view HUD stance read (Part G.1). */
USTRUCT(BlueprintType)
struct FUwOvermind
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) bool    bValid = false;            // false = the Director hasn't spoken yet
	UPROPERTY(BlueprintReadOnly) FString Mood;                      // one word for the whole colony
	UPROPERTY(BlueprintReadOnly) FString TowardCreator;            // worship|fear|loyalty|doubt|rebellion
	UPROPERTY(BlueprintReadOnly) FString Direction;               // the colony's long-term aim
	UPROPERTY(BlueprintReadOnly) float   Tension = 0.f;          // 0..1 (parsed from text)
	UPROPERTY(BlueprintReadOnly) FString Realisation;           // dawning 'we are watched' (often empty)
	UPROPERTY(BlueprintReadOnly) FString Omen;                 // a short ominous colony-level line
};

/** One attention hotspot: where the creator's gaze has dwelt (Watched-Creator loop, L.8). */
USTRUCT(BlueprintType)
struct FUwHotspot
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) FVector Pos = FVector::ZeroVector; // backend units (minion position)
	UPROPERTY(BlueprintReadOnly) float   Intensity = 0.f;          // exponential-decay dwell 0..1
};

/** `frame.presence` — the PresenceField reduction (L.8): where the god is looking and whether
 *  the god is here at all. The god-presence Niagara (Part E.7) and the "absence" behaviour
 *  (the colony drifting toward doubt when unobserved) both read this. */
USTRUCT(BlueprintType)
struct FUwPresence
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) TArray<FUwHotspot> Hotspots;
	UPROPERTY(BlueprintReadOnly) bool bCreatorPresent = false;
};

/** One placed structure inside a φ/fractal chunk (building / wall / prop). Mirrors the
 *  backend chunk contract: each carries the GLB url + φ-placed transform. */
USTRUCT(BlueprintType)
struct FUwStructure
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) FString GlbUrl;                   // "/models/.../x.glb" -> resolved via manifest
	UPROPERTY(BlueprintReadOnly) FVector Pos = FVector::ZeroVector; // backend units (metres)
	UPROPERTY(BlueprintReadOnly) float   RotY = 0.f;              // yaw degrees
	UPROPERTY(BlueprintReadOnly) float   Scale = 1.f;
};

/** One spatial chunk of the millions-strong world (GET /worlds/{id}/chunk?cx&cz). */
USTRUCT(BlueprintType)
struct FUwChunk
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) int32 Cx = 0;
	UPROPERTY(BlueprintReadOnly) int32 Cz = 0;
	UPROPERTY(BlueprintReadOnly) TArray<FUwStructure> Structures;
};

/** The whole live world for the current tick. */
USTRUCT(BlueprintType)
struct FUwSceneState
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) int32   ContractVersion = 0;
	UPROPERTY(BlueprintReadOnly) int64   Tick = 0;
	UPROPERTY(BlueprintReadOnly) float   SimYear = 0.f;
	UPROPERTY(BlueprintReadOnly) FString Era;        // stone/bronze/iron/...
	UPROPERTY(BlueprintReadOnly) FString Biome;
	UPROPERTY(BlueprintReadOnly) float   TimeOfDay = 0.5f; // 0..1
	UPROPERTY(BlueprintReadOnly) FVector SunDir = FVector(0, 0, -1);
	UPROPERTY(BlueprintReadOnly) FString Weather; // clear/rain/...
	UPROPERTY(BlueprintReadOnly) int64   TerrainSeed = 0;
	UPROPERTY(BlueprintReadOnly) float   ElevationBias = 0.f;   // terrain.elevation_bias
	UPROPERTY(BlueprintReadOnly) float   TownRadius = 60.f;     // terrain.town_radius (settlement disc)
	UPROPERTY(BlueprintReadOnly) int32   HeightmapSize = 0;     // terrain.heightmap_size (0 = none)
	UPROPERTY(BlueprintReadOnly) FString EpochName;             // frame.epoch.name (e.g. "Bronze Metallurgy")
	UPROPERTY(BlueprintReadOnly) int32   Population = 0;
	UPROPERTY(BlueprintReadOnly) TArray<FUwMinionState> Minions;

	// ── THE AI-DIRECTOR FRAME (Book V Part L) ──────────────────────────────────────
	UPROPERTY(BlueprintReadOnly) FUwOvermind   Overmind;         // frame.overmind (L1)
	UPROPERTY(BlueprintReadOnly) TArray<FString> Chatter;        // frame.chatter — ambient whisper lines (L4)
	UPROPERTY(BlueprintReadOnly) FString       GodBeat;         // frame.god_beat — singular irreversible beat (L5), empty when none
	UPROPERTY(BlueprintReadOnly) FUwPresence   Presence;        // frame.presence (L.8)

	// frame.possessed_id — the single body the creator is wearing this world (empty = none).
	UPROPERTY(BlueprintReadOnly) FString PossessedId;

	// ── COLONY AGGREGATES (Book V Part G.1 — the God-view HUD's headline numbers) ──
	// The backend may emit these on the frame; if absent we derive them client-side from
	// the minion array so the HUD always has them (forward-compatible with frame.mean_awareness).
	UPROPERTY(BlueprintReadOnly) float MeanAwareness = 0.f;     // colony-wide mean 0..1
	UPROPERTY(BlueprintReadOnly) int32 AwakenedCount = 0;       // how many have awakened
};
