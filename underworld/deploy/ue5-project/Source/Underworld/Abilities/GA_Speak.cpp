// Copyright Underworld. All Rights Reserved.
#include "Abilities/GA_Speak.h"

UGA_Speak::UGA_Speak()
{
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
}

void UGA_Speak::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo, const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);
	UE_LOG(LogTemp, Log, TEXT("[Underworld] GA_Speak activated line='%s'"), *Line);
	EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
}
