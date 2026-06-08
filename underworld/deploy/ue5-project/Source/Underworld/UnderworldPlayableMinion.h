// Copyright Underworld. All Rights Reserved.
//
// AUnderworldPlayableMinion — the EMBODIED, possessable minion. The whole game pivots on the
// creator being able to possess ANY minion; the crowd is rendered by the lightweight pooled
// AUnderworldMinion (dead-reckoned actors), but the moment the player possesses one, it is
// re-spawned (or upgraded) as this ACharacter so it gets a real UCharacterMovementComponent,
// capsule collision, and footstep-correct locomotion.
//
// Two drive modes:
//   • AI-DRIVEN  (default): follows the backend kinematic — steers toward the server's target
//     slot using AddMovementInput, at the server-reported ground speed. The colony walks.
//   • POSSESSED  (player APlayerController took over): server state is ignored for movement;
//     CharacterMovement consumes player input. The backend is told via the possess route so the
//     sim treats this body as creator-controlled (override authority).
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "SceneStateTypes.h"
#include "UnderworldEmotion.h"
#include "UnderworldPlayableMinion.generated.h"

UCLASS(Blueprintable)
class UNDERWORLD_API AUnderworldPlayableMinion : public ACharacter
{
	GENERATED_BODY()

public:
	AUnderworldPlayableMinion();

	/** Backend → character: latest kinematic. Ignored for movement while possessed. */
	UFUNCTION(BlueprintCallable) void ApplyState(const FUwMinionState& State);

	/** True once an APlayerController possesses this body (creator override). */
	UFUNCTION(BlueprintPure) bool IsPlayerControlled() const { return bPlayerPossessed; }

	UPROPERTY(BlueprintReadOnly) FString MinionId;
	UPROPERTY(BlueprintReadOnly) FString Anim;
	UPROPERTY(BlueprintReadOnly) FString Mood;
	UPROPERTY(BlueprintReadOnly) FString Guild;
	UPROPERTY(BlueprintReadOnly) FString MoveState;
	// The hero body carries the face + awakening signal too (Part E.6/F/K) — it's the one most
	// likely to be a MetaHuman in close-up, so its emotion/awareness must read.
	UPROPERTY(BlueprintReadOnly) float      Awareness = 0.f;
	UPROPERTY(BlueprintReadOnly) bool       bAwakened = false;
	UPROPERTY(BlueprintReadOnly) EUwEmotion Emotion = EUwEmotion::Neutral;
	UPROPERTY(BlueprintReadOnly) float      EmotionIntensity = 0.f;

	/** Backend units → UE centimetres (1 backend unit = 1 m). Matches the crowd + buildings. */
	UPROPERTY(EditAnywhere, Category="Underworld") float WorldScale = 100.f;
	/** How close (cm) to the server slot before we stop steering and let it idle/occupy. */
	UPROPERTY(EditAnywhere, Category="Underworld") float ArriveRadius = 60.f;

	/** Player input axes (bind in the BP / Enhanced Input). Only used while possessed. */
	UFUNCTION(BlueprintCallable) void MoveForward(float Value);
	UFUNCTION(BlueprintCallable) void MoveRight(float Value);
	UFUNCTION(BlueprintCallable) void Turn(float Value);
	UFUNCTION(BlueprintCallable) void LookUp(float Value);

	/** Anim/guild changed — drive the AnimBP / material from Blueprint. */
	UFUNCTION(BlueprintImplementableEvent) void OnAnimChanged(const FString& NewAnim);
	UFUNCTION(BlueprintImplementableEvent) void OnGuildChanged(const FString& NewGuild);
	/** Canonical emotion changed — drive the ARKit/morph face + TTS prosody (Part F/K). */
	UFUNCTION(BlueprintImplementableEvent) void OnEmotionChanged(EUwEmotion NewEmotion, float Intensity);
	/** Awareness ramped — drive the awareness-bleed rim/eye glow (Part G.2). */
	UFUNCTION(BlueprintImplementableEvent) void OnAwarenessChanged(float NewAwareness);
	/** Fired when the creator possesses / releases this body — drive UI + the possess route. */
	UFUNCTION(BlueprintImplementableEvent) void OnPossessionChanged(bool bNowPlayer);

protected:
	virtual void Tick(float DeltaSeconds) override;
	virtual void PossessedBy(AController* NewController) override;
	virtual void UnPossessed() override;

private:
	bool    bPlayerPossessed = false;
	FVector ServerTarget     = FVector::ZeroVector;   // UE-space slot to steer toward (AI mode)
	float   ServerGroundSpeed = 0.f;                  // UE cm/s from the backend kinematic
	bool    bHasTarget       = false;
};
