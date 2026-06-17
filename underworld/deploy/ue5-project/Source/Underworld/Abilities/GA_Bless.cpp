// Copyright Underworld. All Rights Reserved.
#include "Abilities/GA_Bless.h"
#include "AbilitySystemComponent.h"
#include "Abilities/GE_BlessingBuff.h"

UGA_Bless::UGA_Bless()
{
	InstancingPolicy = EGameplayAbilityInstancingPolicy::InstancedPerActor;
	BlessingBuff = UGE_BlessingBuff::StaticClass();
}

void UGA_Bless::ActivateAbility(const FGameplayAbilitySpecHandle Handle,
	const FGameplayAbilityActorInfo* ActorInfo, const FGameplayAbilityActivationInfo ActivationInfo,
	const FGameplayEventData* TriggerEventData)
{
	Super::ActivateAbility(Handle, ActorInfo, ActivationInfo, TriggerEventData);
	UE_LOG(LogTemp, Log, TEXT("[Underworld] GA_Bless activated"));

	if (UAbilitySystemComponent* ASC = ActorInfo ? ActorInfo->AbilitySystemComponent.Get() : nullptr)
	{
		if (BlessingBuff)
		{
			const FGameplayEffectContextHandle Ctx = ASC->MakeEffectContext();
			const FGameplayEffectSpecHandle Spec = ASC->MakeOutgoingSpec(BlessingBuff, 1.f, Ctx);
			if (Spec.IsValid())
			{
				ASC->ApplyGameplayEffectSpecToSelf(*Spec.Data.Get());
			}
		}
	}
	EndAbility(Handle, ActorInfo, ActivationInfo, true, false);
}
