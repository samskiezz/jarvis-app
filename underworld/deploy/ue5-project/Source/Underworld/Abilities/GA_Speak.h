// Copyright Underworld. All Rights Reserved.
//
// UGA_Speak — the GAS surface for the SPEAK intervention verb (creator-to-minion line). The
// backend (routes/god.py /player/act verb=speak) writes a divine_word Memory + runs the
// moderation gate. This stub triggers the in-engine TTS / floating subtitle hook.
#pragma once

#include "Abilities/GameplayAbility.h"
#include "CoreMinimal.h"
#include "GA_Speak.generated.h"

UCLASS()
class UNDERWORLD_API UGA_Speak : public UGameplayAbility
{
	GENERATED_BODY()

public:
	UGA_Speak();

	/** The line the creator speaks (set on the spec before Activate). Wired to TTS in BP. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Underworld") FString Line;

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo, const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;
};
