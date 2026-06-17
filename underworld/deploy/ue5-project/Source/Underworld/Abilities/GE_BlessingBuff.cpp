// Copyright Underworld. All Rights Reserved.
#include "Abilities/GE_BlessingBuff.h"
#include "Abilities/UnderworldAttributeSet.h"
#include "GameplayEffectComponents/TargetTagsGameplayEffectComponent.h"

UGE_BlessingBuff::UGE_BlessingBuff()
{
	DurationPolicy = EGameplayEffectDurationType::Instant;

	FGameplayModifierInfo MoodMod;
	MoodMod.Attribute = UUnderworldAttributeSet::GetMoodAttribute();
	MoodMod.ModifierOp = EGameplayModOp::Additive;
	MoodMod.ModifierMagnitude = FScalableFloat(0.1f);
	Modifiers.Add(MoodMod);

	FGameplayModifierInfo WorshipMod;
	WorshipMod.Attribute = UUnderworldAttributeSet::GetWorshipAttribute();
	WorshipMod.ModifierOp = EGameplayModOp::Additive;
	WorshipMod.ModifierMagnitude = FScalableFloat(0.05f);
	Modifiers.Add(WorshipMod);
}
