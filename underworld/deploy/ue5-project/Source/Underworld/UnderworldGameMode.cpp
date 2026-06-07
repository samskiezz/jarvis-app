// Copyright Underworld. All Rights Reserved.
#include "UnderworldGameMode.h"
#include "UnderworldSpectatorPawn.h"

AUnderworldGameMode::AUnderworldGameMode()
{
	DefaultPawnClass = AUnderworldSpectatorPawn::StaticClass();
}
