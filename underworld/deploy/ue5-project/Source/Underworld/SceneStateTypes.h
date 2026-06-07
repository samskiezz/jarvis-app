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
