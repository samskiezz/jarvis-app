// Copyright Underworld. All Rights Reserved.
#include "Abilities/GA_Cull.h"

UGA_Cull::UGA_Cull()
{
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
}

void UGA_Cull::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo, const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);
	UE_LOG(LogTemp, Log, TEXT("[Underworld] GA_Cull activated"));
	EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
}
