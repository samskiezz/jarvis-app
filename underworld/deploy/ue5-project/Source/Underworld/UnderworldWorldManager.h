// Copyright Underworld. All Rights Reserved.
//
// AUnderworldWorldManager — subscribes to the SceneStateClient and reconciles the
// rendered world with each tick: spawns a minion actor for each new id, updates
// existing ones, and despawns the dead. Also drives the directional sun (time-of-day)
// and a sky/weather hook. Drop one instance in the Underworld level.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SceneStateTypes.h"
#include "UnderworldWorldManager.generated.h"

class AUnderworldMinion;
class ADirectionalLight;
class AStaticMeshActor;
class UStaticMesh;

UCLASS()
class UNDERWORLD_API AUnderworldWorldManager : public AActor
{
	GENERATED_BODY()

public:
	AUnderworldWorldManager();

	/** BP_Minion class to spawn (assign in the level — has the skeletal mesh + AnimBP). */
	UPROPERTY(EditAnywhere, Category="Underworld") TSubclassOf<AUnderworldMinion> MinionClass;

	/** The level's sun, rotated by scene-state time-of-day. */
	UPROPERTY(EditAnywhere, Category="Underworld") ADirectionalLight* Sun = nullptr;

	/** φ/fractal world streaming. ChunkSize is in backend units (metres); must match the
	 *  backend's chunk_size (512). Radius = how many chunks each way to keep materialised
	 *  around the camera. WorldScale converts backend metres -> UE centimetres. */
	UPROPERTY(EditAnywhere, Category="Underworld|World") float ChunkSize = 512.f;
	UPROPERTY(EditAnywhere, Category="Underworld|World") int32 ChunkRadius = 2;
	UPROPERTY(EditAnywhere, Category="Underworld|World") float WorldScale = 100.f;
	UPROPERTY(EditAnywhere, Category="Underworld|World") float StreamIntervalSeconds = 1.0f;

	UFUNCTION() void HandleSceneState(const FUwSceneState& State);

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

private:
	// minions (live, every tick)
	UPROPERTY() TMap<FString, AUnderworldMinion*> Minions;
	int64 LastTick = -1;

	// ── world streaming (buildings from φ/fractal chunks) ──────────────────────────
	void LoadManifest();                                  // glb url -> /Game asset path
	UStaticMesh* ResolveMesh(const FString& GlbUrl);      // cached
	void UpdateStreaming();                                // ring of chunks around camera
	void SpawnChunk(const FUwChunk& Chunk);
	void DespawnChunk(const FIntPoint& Key);
	bool GetCameraChunk(FIntPoint& Out) const;

	TMap<FString, FString>            UrlToAsset;          // from manifest.json
	UPROPERTY() TMap<FString, UStaticMesh*> MeshCache;     // assetPath -> loaded mesh (hard ref vs GC)
	// nested-container TMap can't be a UPROPERTY; weak ptrs avoid dangling without GC tracking
	TMap<FIntPoint, TArray<TWeakObjectPtr<AStaticMeshActor>>> ChunkActors;
	TSet<FIntPoint>                   PendingChunks;        // requested, in flight
	FTimerHandle StreamTimer;
};
