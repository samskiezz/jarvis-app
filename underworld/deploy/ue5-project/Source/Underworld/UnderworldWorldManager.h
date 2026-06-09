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
class USceneStateClient;

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

	// ── GOD-VERB BUS (Book V Part B.3 / routes/god.py) ──────────────────────────────
	// The creator's powers, routed through the server's rate-limit + audit pipeline. The benevolent
	// verbs fire immediately; the DESTRUCTIVE verbs (cull/smite/override) require a confirm and are
	// client-cooldown-gated so an accidental double-tap can't grief the colony (red-team mitigation).
	UFUNCTION(BlueprintCallable, Category="Underworld|God") void Bless(const FString& MinionId);
	UFUNCTION(BlueprintCallable, Category="Underworld|God") void Gift(const FString& MinionId, float Amount = 1.f);
	UFUNCTION(BlueprintCallable, Category="Underworld|God") void Speak(const FString& MinionId, const FString& Text);
	/** Destructive: requires bConfirmed=true (a hold-to-confirm in the UI) and respects a per-verb
	 *  client cooldown. Returns false (and a UI warning event) if unconfirmed or on cooldown. */
	UFUNCTION(BlueprintCallable, Category="Underworld|God") bool Cull(const FString& MinionId, bool bConfirmed);
	UFUNCTION(BlueprintCallable, Category="Underworld|God") bool Smite(const FString& MinionId, bool bConfirmed);

	/** The current reticle target (the minion the god-camera is looking at) — set by the controller,
	 *  forwarded to the PresenceField gaze sample. */
	UFUNCTION(BlueprintCallable, Category="Underworld|God") void SetReticleTarget(const FString& MinionId) { ReticleTargetId = MinionId; }

	// ── AI-DIRECTOR + WATCHED-CREATOR render hooks (drive HUD / VFX / audio from BP) ─
	/** The colony's collective mind this cycle (Part L.9). Drive the God-HUD stance read + Overmind chorus. */
	UFUNCTION(BlueprintImplementableEvent, Category="Underworld|Director") void OnOvermind(const FUwOvermind& Overmind);
	/** A singular irreversible beat fired (Part L.9 / E.7). Fired ONCE per distinct beat — the
	 *  Black-Mirror confrontation set-piece. */
	UFUNCTION(BlueprintImplementableEvent, Category="Underworld|Director") void OnGodBeat(const FString& Beat);
	/** Ambient whisper lines this cycle (Part L.4). */
	UFUNCTION(BlueprintImplementableEvent, Category="Underworld|Director") void OnChatter(const TArray<FString>& Lines);
	/** The PresenceField (Part L.8) — attention hotspots + whether the creator is present. Drive the
	 *  god-presence Niagara + the "they cluster / flee where you look" behaviour. */
	UFUNCTION(BlueprintImplementableEvent, Category="Underworld|Director") void OnPresence(const FUwPresence& Presence);
	/** Colony-wide awareness changed (Part G.1/G.2) — drive the post-process "awareness-bleed" ramp
	 *  + the HUD headline (mean awareness, awakened count). */
	UFUNCTION(BlueprintImplementableEvent, Category="Underworld|Director") void OnAwarenessBleed(float MeanAwareness, int32 AwakenedCount);
	/** A UI warning (e.g. a destructive verb rejected on cooldown / needing confirm). */
	UFUNCTION(BlueprintImplementableEvent, Category="Underworld|God") void OnGodVerbWarning(const FString& Message);

	// ── two-tier crowd→MetaHuman promotion (Part E.6) ───────────────────────────────
	/** Fired when a crowd minion crosses into / out of the heavy hero (MetaHuman) tier. The BP does
	 *  the actual mesh swap; C++ owns the decision, hysteresis and the ≤MaxHeroes budget. */
	UFUNCTION(BlueprintImplementableEvent, Category="Underworld|Render") void OnHeroPromotionChanged(AUnderworldMinion* Minion, bool bPromoted);
	/** Promote distance (cm) and the live-MetaHuman budget on the render box (Part E.6: ≤4 on a 2×4090). */
	UPROPERTY(EditAnywhere, Category="Underworld|Render") float HeroPromoteDistance = 1200.f;
	UPROPERTY(EditAnywhere, Category="Underworld|Render") int32 MaxHeroes = 4;

	/** Gaze sample cadence (Hz, capped ≤10 to respect the server — red-team rate-limit mitigation). */
	UPROPERTY(EditAnywhere, Category="Underworld|God") float GazeHz = 5.f;

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

	// ── AI-Director + Watched-Creator frame state (fire hooks only on change) ────────
	FString LastGodBeat;                 // fire OnGodBeat once per distinct beat
	float   LastMeanAwareness = -1.f;    // fire the bleed only when it moves
	FString OvermindFingerprint;         // mood|toward|tension bucket — re-fire OnOvermind on change

	// ── god-verb client guards (red-team: cooldown + confirm on destructive verbs) ───
	FString ReticleTargetId;
	TMap<FString, double> VerbCooldownUntil;   // verb -> world-seconds it's usable again
	void ActVerb(const FString& Verb, const FString& MinionId, const FString& ParamsJson);
	bool DestructiveGuard(const FString& Verb, const FString& MinionId, bool bConfirmed);

	// ── PresenceField gaze reporting (Part L.8) ──────────────────────────────────────
	FTimerHandle GazeTimer;
	void ReportGaze();

	// ── two-tier crowd→MetaHuman promotion (Part E.6) ───────────────────────────────
	TSet<FString> PromotedIds;
	void UpdateHeroPromotion();

	USceneStateClient* GetClient() const;

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
