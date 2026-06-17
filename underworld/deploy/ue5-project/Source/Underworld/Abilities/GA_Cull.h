// Copyright Underworld. All Rights Reserved.
//
// UGA_Cull — the GAS surface for the CULL intervention verb (irreversible: see god.py forecast).
// Hold-to-confirm bound on the player controller side; ActivateAbility logs a stub here. The
// real "minion dies" mutation belongs to the backend (routes/god.py /player/act verb=cull) so
// that Event(divine_act, valence=-1) is the single source of truth.
#pragma once

#include "Abilities/GameplayAbility.h"
#include "CoreMinimal.h"
#include "GA_Cull.generated.h"

UCLASS()
class UNDERWORLD_API UGA_Cull : public UGameplayAbility
{
	GENERATED_BODY()

public:
	UGA_Cull();
	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo, const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;
};
