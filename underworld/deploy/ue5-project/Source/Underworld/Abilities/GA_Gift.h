// Copyright Underworld. All Rights Reserved.
//
// UGA_Gift — the GAS surface for the GIFT intervention verb. Backend mutates karma (god.py).
// The ability stub fires for blueprint hooks (drop-from-sky VFX, target sparkle, item icon).
#pragma once

#include "Abilities/GameplayAbility.h"
#include "CoreMinimal.h"
#include "GA_Gift.generated.h"

UCLASS()
class UNDERWORLD_API UGA_Gift : public UGameplayAbility
{
	GENERATED_BODY()

public:
	UGA_Gift();

	/** Token gift amount. The backend's god.py uses this as the karma increment. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Underworld") float Amount = 1.0f;

	virtual void ActivateAbility(const FGameplayAbilitySpecHandle Handle,
		const FGameplayAbilityActorInfo* ActorInfo, const FGameplayAbilityActivationInfo ActivationInfo,
		const FGameplayEventData* TriggerEventData) override;
};
