// Copyright Underworld. All Rights Reserved.
//
// AUnderworldAvatar — the creator's FREE-WALK body (Bible §4.4 god-layer foundation). When the
// player chooses "free" mode (player_avatar.mode == "free" on the backend), this ACharacter is
// spawned and possessed by the AGodCameraController. Distinct from AUnderworldPlayableMinion —
// that one's body is a possessed colony body; this one is the creator-as-distinct-actor.
//
// The avatar pose is mirrored to the backend each tick via player_avatar.move so the WebGL +
// UE5 renderers agree on where the creator's body is.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "UnderworldAvatar.generated.h"

class UCameraComponent;
class USpringArmComponent;
class UInputAction;
class UInputMappingContext;
struct FInputActionValue;

UCLASS(Blueprintable)
class UNDERWORLD_API AUnderworldAvatar : public ACharacter
{
	GENERATED_BODY()

public:
	AUnderworldAvatar();

	/** The player id this avatar is bound to (passed in the X-Player-Id header on backend writes). */
	UPROPERTY(BlueprintReadWrite, Category="Underworld") FString PlayerId;
	/** The world id this avatar lives in. */
	UPROPERTY(BlueprintReadWrite, Category="Underworld") FString WorldId;

	/** Backend units → UE centimetres (1 backend unit = 1 m), matches the crowd body. */
	UPROPERTY(EditAnywhere, Category="Underworld") float WorldScale = 100.f;

	/** How often (s) to POST the avatar pose to /worlds/{id}/player/avatar/move. */
	UPROPERTY(EditAnywhere, Category="Underworld") float BackendSyncInterval = 0.25f;

	UPROPERTY(EditAnywhere, Category="Input") UInputMappingContext* MappingContext = nullptr;
	UPROPERTY(EditAnywhere, Category="Input") UInputAction* MoveAction = nullptr;
	UPROPERTY(EditAnywhere, Category="Input") UInputAction* LookAction = nullptr;
	UPROPERTY(EditAnywhere, Category="Input") UInputAction* JumpAction = nullptr;

protected:
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void SetupPlayerInputComponent(UInputComponent* Input) override;

	UPROPERTY(VisibleAnywhere) USpringArmComponent* SpringArm = nullptr;
	UPROPERTY(VisibleAnywhere) UCameraComponent* Camera = nullptr;

	void Move(const FInputActionValue& V);
	void Look(const FInputActionValue& V);

private:
	float TimeUntilNextSync = 0.f;
};
