// Copyright Underworld. All Rights Reserved.
//
// SceneStateClient — a GameInstance subsystem that polls the backend's
// /worlds/{id}/scene-state every PollIntervalSeconds and broadcasts the parsed
// state. Reads -UnderworldApiUrl / -UnderworldWorldId / -UnderworldApiKey from the
// cmdline (set by run-ue5.sh). Pure data layer: the WorldManager listens and renders.
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

	/** Backend config (overridable via cmdline). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ApiUrl = TEXT("http://localhost:8091");
	UPROPERTY(EditAnywhere, BlueprintReadWrite) FString WorldId;
	UPROPERTY(EditAnywhere, BlueprintReadWrite) FString ApiKey = TEXT("dev-key");
	UPROPERTY(EditAnywhere, BlueprintReadWrite) float   PollIntervalSeconds = 0.5f;

private:
	void Poll();
	void OnResponse(FHttpRequestPtr Req, FHttpResponsePtr Resp, bool bOk);
	bool ParseScene(const FString& Body, FUwSceneState& Out) const;
	bool ParseChunk(const FString& Body, FUwChunk& Out) const;

	FTimerHandle PollTimer;
	bool bInFlight = false;
};
