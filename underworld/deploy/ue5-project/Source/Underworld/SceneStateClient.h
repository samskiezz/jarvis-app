// Copyright Underworld. All Rights Reserved.
//
// SceneStateClient — a GameInstance subsystem that polls the backend's
// /worlds/{id}/scene-state every PollIntervalSeconds and broadcasts the parsed
// state. Reads -UnderworldApiUrl / -UnderworldWorldId / -UnderworldApiKey from the
// cmdline (set by run-ue5.sh). Pure data layer: the WorldManager listens and renders.
//
// Book V (contract v2): parses the FULL scene-state — the AI-Director frame (Overmind /
// chatter / God-beat), the Watched-Creator PresenceField, and per-minion awakening/awareness —
// and is the single egress for the creator's verbs (possess/release, the god-verb `act` bus,
// and gaze sampling that feeds the PresenceField). See Book V Parts B.2 / B.3 / L.8 / L.9.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Interfaces/IHttpRequest.h"
#include "SceneStateTypes.h"
#include "SceneStateClient.generated.h"

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnSceneState, const FUwSceneState&, State);

UCLASS()
class UNDERWORLD_API USceneStateClient : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	/** Fires every successful poll with the latest world state. */
	UPROPERTY(BlueprintAssignable) FOnSceneState OnSceneState;

	UPROPERTY(BlueprintReadOnly) FUwSceneState Latest;

	UFUNCTION(BlueprintCallable) void StartPolling();
	UFUNCTION(BlueprintCallable) void StopPolling();

	/** Fetch ONE φ/fractal chunk (buildings/walls with real GLBs) and deliver it to the
	 *  callback on the game thread. The WorldManager calls this for the ring of chunks
	 *  around the camera; chunks are deterministic + cacheable backend-side. */
	void FetchChunk(int32 Cx, int32 Cz, TFunction<void(const FUwChunk&)> OnDone);

	/** OVERRIDE PILLAR — POST the possess (bPossess=true) or release (false) verb for a minion.
	 *  Server-authoritative: marks the body creator-controlled and the next scene-state poll
	 *  reflects it. OnDone(bool bOk) fires on the game thread. Mirrors FetchChunk's pattern. */
	void PostPossess(const FString& MinionId, bool bPossess, TFunction<void(bool)> OnDone = nullptr);

	/** GOD-VERB BUS (Book V Part B.3 / routes/god.py `POST /worlds/{id}/player/act`).
	 *  bless / gift / cull / smite / speak / override / resurrect, routed through the server's
	 *  rate-limit + audit pipeline. ParamsJson is the verb's `params` object as a JSON string
	 *  (e.g. {"text":"..."} for speak, {"amount":2} for gift, {} otherwise). An idempotency key
	 *  is generated so a double-click can't double-fire a destructive verb. OnDone(bOk) on the
	 *  game thread. 429 (rate-limited) and 4xx come back as bOk=false. */
	void PostAct(const FString& Verb, const FString& TargetId, const FString& ParamsJson = TEXT("{}"),
	             TFunction<void(bool)> OnDone = nullptr);

	/** CONSEQUENCE FORECAST (Book V Part G.4 / `POST /worlds/{id}/player/forecast`). Read-only
	 *  dry-run of a god-verb: returns the predicted field deltas + valence + reversibility as a JSON
	 *  string so the Intervention UI can show "if you do this, then…" BEFORE the creator commits.
	 *  OnDone(bOk, predictedJson) on the game thread. Mutates nothing server-side. */
	void PostForecast(const FString& Verb, const FString& TargetId, const FString& ParamsJson,
	                  TFunction<void(bool, const FString&)> OnDone);

	/** WATCHED-CREATOR loop (Book V Part L.8 / `POST /worlds/{id}/player/gaze`). Report where the
	 *  god-camera is looking + who is under the reticle so the PresenceField builds attention
	 *  hotspots and tracks absence. Fire-and-forget (no callback) — it's a high-frequency sample. */
	void PostGaze(const FVector& CamPos, const FVector& CamFwd, float Fov,
	              const FString& ReticleTargetId, float Dt);

	/** Backend config (overridable via cmdline). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ApiUrl = TEXT("http://localhost:8091");
	UPROPERTY(EditAnywhere, BlueprintReadWrite) FString WorldId;
	UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ApiKey = TEXT("dev-key");
	/** Sent as X-Player-Id on god-verbs so multiplayer arbitration can land later (Book V B.3). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite) FString PlayerId = TEXT("creator");
	UPROPERTY(EditAnywhere, BlueprintReadWrite) float   PollIntervalSeconds = 0.5f;

private:
	void Poll();
	void OnResponse(FHttpRequestPtr Req, FHttpResponsePtr Resp, bool bOk);
	bool ParseScene(const FString& Body, FUwSceneState& Out) const;
	bool ParseChunk(const FString& Body, FUwChunk& Out) const;
	/** Authorize + tag a request with the standard headers (Bearer + content-type). */
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> MakeRequest(const FString& Url, const FString& Verb) const;

	FTimerHandle PollTimer;
	bool bInFlight = false;
	uint64 ActSeq = 0;        // monotonic suffix for idempotency keys (no Date/rand dependency)
};
