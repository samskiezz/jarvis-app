// Copyright Underworld. All Rights Reserved.
//
// UGA_Bless — the GAS surface for the BLESS intervention verb (Bible §4.6, B-3 pipeline).
// ActivateAbility logs + applies UGE_BlessingBuff to the target. The persistent simulation
// effect (+reputation, +morale on the backend minion) is the responsibility of the existing
// routes/god.py /player/act path — this ability is the UE5-side trigger so blueprints and
// Niagara can hang off the activation (gold sparkle, hymn TTS, target glow).
#pragma once

#include "Abilities/GameplayAbility.h"
#include "CoreMinimal.h"
#include "GA_Bless.generated.h"

UCLASS()
class UNDERWORLD_API UGA_Bless : public UGameplayAbility
{
	GENERATED_BODY()

public:
	UGA_Bless();

	/** The GE this ability applies. Defaults to UGE_BlessingBuff; override in BP for a tuned curve. */
	UPROPERTY(EditDefaultsOnly, Category="Underworld") TSubclassOf<class UGameplayEffect> BlessingBuff;

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo, const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;
};
