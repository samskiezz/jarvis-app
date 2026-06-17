// Copyright Underworld. All Rights Reserved.
#include "Abilities/GA_Gift.h"

UGA_Gift::UGA_Gift()
{
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
}

void UGA_Gift::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo, const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);
	UE_LOG(LogTemp, Log, TEXT("[Underworld] GA_Gift activated amount=%f"), Amount);
	EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
}
