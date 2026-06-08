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
class AUnderworldPlayableMinion;
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

	/** BP_PlayableMinion class — the heavier ACharacter spawned when the creator possesses a
	 *  body (capsule + CharacterMovement + the same mesh/AnimBP). Assign in the level. */
	UPROPERTY(EditAnywhere, Category="Underworld") TSubclassOf<AUnderworldPlayableMinion> PlayableMinionClass;

	/** The level's sun, rotated by scene-state time-of-day. */
	UPROPERTY(EditAnywhere, Category="Underworld") ADirectionalLight* Sun = nullptr;

	// ── OVERRIDE PILLAR: possession (Bible §4.4) ───────────────────────────────────
	/** Possess a minion by id: POST the verb, then swap its crowd actor for a player-controlled
	 *  ACharacter that the local PlayerController possesses. Called by the PlayerController on a
	 *  click-trace hit. Releases any current possession first. */
	UFUNCTION(BlueprintCallable, Category="Underworld") void RequestPossess(const FString& MinionId);
	/** Release the current possession: POST release, hand control back to the spectator pawn, and
	 *  let the crowd actor reappear from the next scene-state. */
	UFUNCTION(BlueprintCallable, Category="Underworld") void ReleasePossession();
	/** The minion id the local player is currently wearing (empty = none). */
	UFUNCTION(BlueprintPure, Category="Underworld") FString GetPossessedId() const { return PossessedId; }

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

	// ── possession state (the body the local player is wearing) ────────────────────
	UPROPERTY() AUnderworldPlayableMinion* PossessedActor = nullptr;
	FString PossessedId;                                   // empty = spectating (god camera)
	TWeakObjectPtr<APawn> SpectatorPawn;                   // god camera, re-possessed on release
	void FinishPossess(const FString& MinionId);           // spawn + PlayerController->Possess
	void SpectateAgain();                                  // PlayerController->Possess(spectator)

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
