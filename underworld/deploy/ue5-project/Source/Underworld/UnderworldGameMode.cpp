// Copyright Underworld. All Rights Reserved.
#include "UnderworldGameMode.h"
#include "UnderworldSpectatorPawn.h"
#include "UnderworldPlayerController.h"

AUnderworldGameMode::AUnderworldGameMode()
{
	DefaultPawnClass = AUnderworldSpectatorPawn::StaticClass();
	PlayerControllerClass = AUnderworldPlayerController::StaticClass();   // click-to-possess
}
