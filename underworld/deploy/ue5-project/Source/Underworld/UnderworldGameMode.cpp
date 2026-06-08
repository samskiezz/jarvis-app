// Copyright Underworld. All Rights Reserved.
#include "UnderworldGameMode.h"
#include "UnderworldSpectatorPawn.h"
#include "UnderworldPlayerController.h"
#include "UnderworldGodHud.h"

AUnderworldGameMode::AUnderworldGameMode()
{
	DefaultPawnClass = AUnderworldSpectatorPawn::StaticClass();
	PlayerControllerClass = AUnderworldPlayerController::StaticClass();   // click-to-possess
	HUDClass = AUnderworldGodHud::StaticClass();                          // the JARVIS war-room God-HUD
}
