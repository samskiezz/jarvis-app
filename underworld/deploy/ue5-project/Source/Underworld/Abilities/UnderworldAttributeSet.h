// Copyright Underworld. All Rights Reserved.
//
// UUnderworldAttributeSet — the GAS attributes the creator's verbs mutate. The simulation
// brain (Awareness/Worship/Fear/Rebellion/Mood) is OWNED by the backend Python loop; this
// AttributeSet is the UE5 mirror so blueprints + UI can read and animate it. The intervention
// abilities (Bless/Cull/Gift/Speak) apply GEs that bump these mirror values; the SOURCE of
// truth still gets POSTed back through routes/god.py /player/act, the AttributeSet is the
// local presentation layer.
#pragma once

#include "AbilitySystemComponent.h"
#include "AttributeSet.h"
#include "CoreMinimal.h"
#include "UnderworldAttributeSet.generated.h"

#define ATTRIBUTE_ACCESSORS(ClassName, PropertyName) \
	GAMEPLAYATTRIBUTE_PROPERTY_GETTER(ClassName, PropertyName) \
	GAMEPLAYATTRIBUTE_VALUE_GETTER(PropertyName) \
	GAMEPLAYATTRIBUTE_VALUE_SETTER(PropertyName) \
	GAMEPLAYATTRIBUTE_VALUE_INITTER(PropertyName)

UCLASS()
class UNDERWORLD_API UUnderworldAttributeSet : public UAttributeSet
{
	GENERATED_BODY()

public:
	UPROPERTY(BlueprintReadOnly, Category="Underworld|Attributes")
	FGameplayAttributeData Awareness;
	ATTRIBUTE_ACCESSORS(UUnderworldAttributeSet, Awareness)

	UPROPERTY(BlueprintReadOnly, Category="Underworld|Attributes")
	FGameplayAttributeData Worship;
	ATTRIBUTE_ACCESSORS(UUnderworldAttributeSet, Worship)

	UPROPERTY(BlueprintReadOnly, Category="Underworld|Attributes")
	FGameplayAttributeData Fear;
	ATTRIBUTE_ACCESSORS(UUnderworldAttributeSet, Fear)

	UPROPERTY(BlueprintReadOnly, Category="Underworld|Attributes")
	FGameplayAttributeData Rebellion;
	ATTRIBUTE_ACCESSORS(UUnderworldAttributeSet, Rebellion)

	UPROPERTY(BlueprintReadOnly, Category="Underworld|Attributes")
	FGameplayAttributeData Mood;
	ATTRIBUTE_ACCESSORS(UUnderworldAttributeSet, Mood)
};
