// Copyright Underworld. All Rights Reserved.
//
// AUnderworldSpectatorPawn — the streamed viewer camera. Orbit + fly + zoom, driven
// by Enhanced Input. Pixel Streaming forwards the browser's mouse/keyboard to these
// actions, so the web player flies through the live Underworld.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "UnderworldSpectatorPawn.generated.h"

class UCameraComponent;
class USpringArmComponent;
class UInputAction;
class UInputMappingContext;
struct FInputActionValue;

UCLASS()
class UNDERWORLD_API AUnderworldSpectatorPawn : public APawn
{
	GENERATED_BODY()

public:
	AUnderworldSpectatorPawn();

	virtual void SetupPlayerInputComponent(UInputComponent* Input) override;

	UPROPERTY(EditAnywhere, Category="Input") UInputMappingContext* MappingContext = nullptr;
	UPROPERTY(EditAnywhere, Category="Input") UInputAction* MoveAction = nullptr;
	UPROPERTY(EditAnywhere, Category="Input") UInputAction* LookAction = nullptr;
	UPROPERTY(EditAnywhere, Category="Input") UInputAction* ZoomAction = nullptr;

	UPROPERTY(EditAnywhere, Category="Camera") float MoveSpeed = 1200.f;
	UPROPERTY(EditAnywhere, Category="Camera") float LookSpeed = 90.f;

protected:
	virtual void BeginPlay() override;

	UPROPERTY(VisibleAnywhere) USpringArmComponent* SpringArm = nullptr;
	UPROPERTY(VisibleAnywhere) UCameraComponent* Camera = nullptr;

	void Move(const FInputActionValue& V);
	void Look(const FInputActionValue& V);
	void Zoom(const FInputActionValue& V);
};
