// Copyright Underworld. All Rights Reserved.
//
// UGE_BlessingBuff — the GameplayEffect spawned by UGA_Bless. Bumps the target minion's Mood
// + Worship attribute mirrors. The PERSISTENT backend effect (reputation / morale) is applied
// by routes/god.py's bless verb; this GE drives the renderer-side stat displays and any UI
// animation that hangs off attribute change notifies.
#pragma once

#include "CoreMinimal.h"
#include "GameplayEffect.h"
#include "GE_BlessingBuff.generated.h"

UCLASS()
class UNDERWORLD_API UGE_BlessingBuff : public UGameplayEffect
{
	GENERATED_BODY()

public:
	UGE_BlessingBuff();
};
