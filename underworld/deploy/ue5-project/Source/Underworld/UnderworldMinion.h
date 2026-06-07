// Copyright Underworld. All Rights Reserved.
//
// AUnderworldMinion — one rendered minion. The WorldManager pools these and feeds
// each a target state every tick; the actor smoothly interpolates position/facing
// and drives its anim state machine (set BlueprintImplementableEvent OnAnimChanged
// in the Anim BP). Assign a SkeletalMesh + AnimBP on the BP_Minion subclass.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SceneStateTypes.h"
#include "UnderworldMinion.generated.h"

class USkeletalMeshComponent;

UCLASS(Blueprintable)
class UNDERWORLD_API AUnderworldMinion : public AActor
{
	GENERATED_BODY()

public:
	AUnderworldMinion();

	/** Backend → actor: set the goal the actor lerps toward this tick. */
	UFUNCTION(BlueprintCallable) void ApplyState(const FUwMinionState& State);

	UPROPERTY(BlueprintReadOnly) FString MinionId;
	UPROPERTY(BlueprintReadOnly) FString Anim;
	UPROPERTY(BlueprintReadOnly) FString Mood;
	UPROPERTY(BlueprintReadOnly) FString Guild;

	/** Backend units → UE centimetres. Default 100 (1 backend unit = 1 m). */
	UPROPERTY(EditAnywhere, Category="Underworld") float WorldScale = 100.f;
	/** Position/rotation interpolation speed (per second). */
	UPROPERTY(EditAnywhere, Category="Underworld") float LerpSpeed = 6.f;

	/** Anim/guild changed — drive the AnimBP / material from Blueprint. */
	UFUNCTION(BlueprintImplementableEvent) void OnAnimChanged(const FString& NewAnim);
	UFUNCTION(BlueprintImplementableEvent) void OnGuildChanged(const FString& NewGuild);

protected:
	virtual void Tick(float DeltaSeconds) override;

	UPROPERTY(VisibleAnywhere) USkeletalMeshComponent* Mesh = nullptr;

	FVector  TargetLocation = FVector::ZeroVector;
	FRotator TargetRotation = FRotator::ZeroRotator;
};
