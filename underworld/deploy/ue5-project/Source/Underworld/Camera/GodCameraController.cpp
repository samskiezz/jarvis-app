// Copyright Underworld. All Rights Reserved.
#include "Camera/GodCameraController.h"
#include "Avatar/GodCameraPawn.h"
#include "Engine/World.h"
#include "TimerManager.h"

AGodCameraController::AGodCameraController()
{
	bShowMouseCursor = true;
	GodPawnClass = AGodCameraPawn::StaticClass();
}

void AGodCameraController::BeginPlay()
{
	Super::BeginPlay();
	UE_LOG(LogTemp, Log, TEXT("[Underworld] GodCameraController BeginPlay world=%s player=%s"),
		*WorldId, *PlayerId);

	if (GodPawnClass && !GetPawn())
	{
		FActorSpawnParameters Sp;
		Sp.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		const FVector SpawnLoc(0.f, 0.f, 3000.f);
		if (AGodCameraPawn* Pawn = GetWorld()->SpawnActor<AGodCameraPawn>(
				GodPawnClass, SpawnLoc, FRotator::ZeroRotator, Sp))
		{
			Possess(Pawn);
		}
	}

	GetWorldTimerManager().SetTimer(GazeTimer, this, &AGodCameraController::TraceGaze,
		GazeTraceInterval, true, GazeTraceInterval);
}

void AGodCameraController::EndPlay(const EEndPlayReason::Type Reason)
{
	GetWorldTimerManager().ClearTimer(GazeTimer);
	Super::EndPlay(Reason);
}

void AGodCameraController::TraceGaze()
{
	float X = 0.f, Y = 0.f;
	if (!GetMousePosition(X, Y)) { return; }
	FHitResult Hit;
	if (GetHitResultAtScreenPosition(FVector2D(X, Y), ECC_Visibility, false, Hit))
	{
		OnGazeHit(Hit.ImpactPoint, Hit.GetActor());
	}
}

void AGodCameraController::OnGazeHit(const FVector& WorldLocation, const AActor* HitActor)
{
	// Phase 3 stub: the HTTP emit to /worlds/{id}/player/gaze is wired in the existing
	// SceneStateClient (which already POSTs gaze; we hand it the actor id when one is hit).
	const FString ActorTag = HitActor ? HitActor->GetName() : TEXT("");
	UE_LOG(LogTemp, Verbose, TEXT("[Underworld] gaze hit loc=%s actor=%s"),
		*WorldLocation.ToString(), *ActorTag);
}
