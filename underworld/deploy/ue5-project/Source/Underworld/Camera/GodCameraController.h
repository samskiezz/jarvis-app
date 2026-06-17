// Copyright Underworld. All Rights Reserved.
//
// AGodCameraController — the LOCAL controller for the god camera. Distinct from
// AUnderworldPlayerController (which possesses minions): this one drives AGodCameraPawn for
// the free-flight observation mode and emits gaze hits to the backend via the existing
// SceneStateClient HTTP plumbing (POST /worlds/{id}/player/gaze).
//
// Gaze hits are FUNDAMENTAL to the watched-creator loop (Bible §4.5): wherever the creator
// looks, the PresenceField raises attention and the colony reacts.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "GodCameraController.generated.h"

class AGodCameraPawn;

UCLASS()
class UNDERWORLD_API AGodCameraController : public APlayerController
{
	GENERATED_BODY()

public:
	AGodCameraController();

	/** Class for the pawn we spawn + auto-possess on BeginPlay (override in BP for a custom pawn). */
	UPROPERTY(EditAnywhere, Category="Underworld")
	TSubclassOf<AGodCameraPawn> GodPawnClass;

	/** How often (s) to re-trace under the reticle and emit a gaze sample. */
	UPROPERTY(EditAnywhere, Category="Underworld") float GazeTraceInterval = 0.2f;

	/** Backend world id this controller is bound to (mirrors UnderworldPlayerController). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Underworld") FString WorldId;

	/** Backend player id (header X-Player-Id). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Underworld") FString PlayerId = TEXT("creator");

	/** Called when the reticle trace hits a world location / actor. Emits to the backend. */
	void OnGazeHit(const FVector& WorldLocation, const AActor* HitActor);

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

private:
	void TraceGaze();
	FTimerHandle GazeTimer;
};
