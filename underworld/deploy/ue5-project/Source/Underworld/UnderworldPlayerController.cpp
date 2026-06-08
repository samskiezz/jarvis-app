// Copyright Underworld. All Rights Reserved.
#include "UnderworldPlayerController.h"
#include "UnderworldMinion.h"
#include "UnderworldWorldManager.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputActionValue.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"

AUnderworldPlayerController::AUnderworldPlayerController()
{
	bShowMouseCursor = true;
	bEnableClickEvents = true;
	bEnableMouseOverEvents = true;
}

void AUnderworldPlayerController::BeginPlay()
{
	Super::BeginPlay();
	if (auto* Sub = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(GetLocalPlayer()))
	{
		if (PossessionContext) { Sub->AddMappingContext(PossessionContext, PossessionContextPriority); }
	}
}

void AUnderworldPlayerController::SetupInputComponent()
{
	Super::SetupInputComponent();
	if (UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(InputComponent))
	{
		if (PossessAction) { EIC->BindAction(PossessAction, ETriggerEvent::Started, this, &AUnderworldPlayerController::OnPossessPressed); }
		if (ReleaseAction) { EIC->BindAction(ReleaseAction, ETriggerEvent::Started, this, &AUnderworldPlayerController::OnReleasePressed); }
	}
}

AUnderworldWorldManager* AUnderworldPlayerController::FindWorldManager() const
{
	return Cast<AUnderworldWorldManager>(
		UGameplayStatics::GetActorOfClass(GetWorld(), AUnderworldWorldManager::StaticClass()));
}

void AUnderworldPlayerController::OnPossessPressed(const FInputActionValue& /*V*/)
{
	AUnderworldWorldManager* Mgr = FindWorldManager();
	if (!Mgr) { return; }

	// trace the minion under the cursor; possess it if found.
	FHitResult Hit;
	if (!GetHitResultUnderCursor(ECC_Visibility, /*bTraceComplex=*/false, Hit)) { return; }
	AActor* Actor = Hit.GetActor();
	while (Actor)               // the skeletal mesh may be a child; walk up to the minion actor
	{
		if (const AUnderworldMinion* Minion = Cast<AUnderworldMinion>(Actor))
		{
			Mgr->RequestPossess(Minion->MinionId);
			return;
		}
		Actor = Actor->GetOwner();
	}
}

void AUnderworldPlayerController::OnReleasePressed(const FInputActionValue& /*V*/)
{
	if (AUnderworldWorldManager* Mgr = FindWorldManager()) { Mgr->ReleasePossession(); }
}
