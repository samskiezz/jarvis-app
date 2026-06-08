// Copyright Underworld. All Rights Reserved.
//
// USTRUCT mirror of the backend's renderer-agnostic scene-state contract
// (GET /worlds/{id}/scene-state). One source of truth, two renderers (WebGL + UE5).
#pragma once

#include "CoreMinimal.h"
#include "SceneStateTypes.generated.h"

/** One minion's live state for the current tick. */
USTRUCT(BlueprintType)
struct FUwMinionState
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) FString Id;
	UPROPERTY(BlueprintReadOnly) FVector Pos = FVector::ZeroVector;   // world units (backend X,Y,Z)
	UPROPERTY(BlueprintReadOnly) float   Facing = 0.f;                // yaw degrees
	UPROPERTY(BlueprintReadOnly) FString Anim;                        // idle/walk/work/study/...
	UPROPERTY(BlueprintReadOnly) FString Mood;                        // content/curious/...
	UPROPERTY(BlueprintReadOnly) FString Saga;                        // current activity narrative
	UPROPERTY(BlueprintReadOnly) FString Guild;                       // A..H CPC guild (skin tint)

	// ── MOVEMENT v2 (contract_version 2) — server-tracked walking ──────────────────
	// The backend now simulates each minion's kinematic, so the client dead-reckons
	// between ~1 Hz polls instead of teleporting. Velocity is the ground-plane vector
	// (backend units/sec) with elevation left to the terrain; MoveState drives the anim.
	UPROPERTY(BlueprintReadOnly) FVector Velocity = FVector::ZeroVector; // (vx, 0, vz) units/sec
	UPROPERTY(BlueprintReadOnly) FString MoveState;                      // idle/walk/occupy
	UPROPERTY(BlueprintReadOnly) float   Speed = 0.f;                    // units/sec scalar
	UPROPERTY(BlueprintReadOnly) FVector TargetPos = FVector::ZeroVector;// (tx, 0, tz) goal slot
	UPROPERTY(BlueprintReadOnly) bool    bHasTarget = false;
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

	UPROPERTY(BlueprintReadOnly) int64   Tick = 0;
	UPROPERTY(BlueprintReadOnly) FString Era;        // stone/bronze/iron/...
	UPROPERTY(BlueprintReadOnly) FString Biome;
	UPROPERTY(BlueprintReadOnly) float   TimeOfDay = 0.5f; // 0..1
	UPROPERTY(BlueprintReadOnly) FVector SunDir = FVector(0, 0, -1);
	UPROPERTY(BlueprintReadOnly) FString Weather; // clear/rain/...
	UPROPERTY(BlueprintReadOnly) int64   TerrainSeed = 0;
	UPROPERTY(BlueprintReadOnly) TArray<FUwMinionState> Minions;
};
