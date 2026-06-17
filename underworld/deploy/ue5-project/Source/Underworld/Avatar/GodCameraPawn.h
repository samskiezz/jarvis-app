// Copyright Underworld. All Rights Reserved.
//
// AGodCameraPawn — the FREE-FLIGHT observation pawn for the god camera. No physical presence
// for the colony (no capsule, no collision channel that would push minions). The colony still
// gets to react to its GAZE via the PresenceField (routes/god.py POST /player/gaze).
//
// Distinct from AUnderworldSpectatorPawn (the streamed viewer): this one is the LOCAL pawn for
// the controlling AGodCameraController, owns the gaze-trace logic, and is the spawn target when
// the avatar mode flips to "god_camera".
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "GodCameraPawn.generated.h"

class UCameraComponent;
class UInputAction;
class UInputMappingContext;
struct FInputActionValue;

UCLASS(Blueprintable)
class UNDERWORLD_API AGodCameraPawn : public APawn
{
	GENERATED_BODY()

public:
	AGodCameraPawn();

	virtual void SetupPlayerInputComponent(UInputComponent* Input) override;

	UPROPERTY(EditAnywhere, Category="Input") UInputMappingContext* MappingContext = nullptr;
	UPROPERTY(EditAnywhere, Category="Input") UInputAction* MoveAction = nullptr;
	UPROPERTY(EditAnywhere, Category="Input") UInputAction* LookAction = nullptr;
	UPROPERTY(EditAnywhere, Category="Input") UInputAction* ZoomAction = nullptr;

	UPROPERTY(EditAnywhere, Category="Camera") float MoveSpeed = 1500.f;
	UPROPERTY(EditAnywhere, Category="Camera") float LookSpeed = 90.f;
	UPROPERTY(EditAnywhere, Category="Camera") float ZoomSpeed = 200.f;

protected:
	virtual void BeginPlay() override;

	UPROPERTY(VisibleAnywhere) UCameraComponent* Camera = nullptr;

	void Move(const FInputActionValue& V);
	void Look(const FInputActionValue& V);
	void Zoom(const FInputActionValue& V);
};
