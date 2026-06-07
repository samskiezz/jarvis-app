// Copyright Underworld. All Rights Reserved.
//
// AUnderworldGameMode — default pawn is the spectator camera; no HUD-less default.
// Set as the level/project default GameMode (Config/DefaultEngine.ini).
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "UnderworldGameMode.generated.h"

UCLASS()
class UNDERWORLD_API AUnderworldGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AUnderworldGameMode();
};
