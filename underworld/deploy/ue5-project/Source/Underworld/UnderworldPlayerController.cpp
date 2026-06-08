// Copyright Underworld. All Rights Reserved.
#include "UnderworldPlayerController.h"
#include "UnderworldMinion.h"
#include "UnderworldWorldManager.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputActionValue.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"
#include "TimerManager.h"

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
	// Feed the PresenceField the minion under the reticle so attention hotspots + confrontation
	// gating track where the god is actually looking (Part L.8).
	if (UWorld* W = GetWorld())
	{
		const float Period = FMath::Max(0.05f, ReticleTraceInterval);
		W->GetTimerManager().SetTimer(ReticleTimer, this, &AUnderworldPlayerController::UpdateReticle, Period, true, Period);
	}
}

void AUnderworldPlayerController::EndPlay(const EEndPlayReason::Type Reason)
{
	if (UWorld* W = GetWorld()) { W->GetTimerManager().ClearTimer(ReticleTimer); }
	Super::EndPlay(Reason);
}

void AUnderworldPlayerController::SetupInputComponent()
{
	Super::SetupInputComponent();
	if (UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(InputComponent))
	{
		if (PossessAction) { EIC->BindAction(PossessAction, ETriggerEvent::Started, this, &AUnderworldPlayerController::OnPossessPressed); }
		if (ReleaseAction) { EIC->BindAction(ReleaseAction, ETriggerEvent::Started, this, &AUnderworldPlayerController::OnReleasePressed); }
		if (BlessAction)   { EIC->BindAction(BlessAction, ETriggerEvent::Started, this, &AUnderworldPlayerController::OnBlessPressed); }
		if (GiftAction)    { EIC->BindAction(GiftAction, ETriggerEvent::Started, this, &AUnderworldPlayerController::OnGiftPressed); }
		// Cull on Triggered: bind it to a Hold trigger in the IMC so this only fires after the hold.
		if (CullAction)    { EIC->BindAction(CullAction, ETriggerEvent::Triggered, this, &AUnderworldPlayerController::OnCullTriggered); }
	}
}

AUnderworldWorldManager* AUnderworldPlayerController::FindWorldManager() const
{
	return Cast<AUnderworldWorldManager>(
		UGameplayStatics::GetActorOfClass(GetWorld(), AUnderworldWorldManager::StaticClass()));
}

FString AUnderworldPlayerController::TraceMinionId() const
{
	FHitResult Hit;
	if (!GetHitResultUnderCursor(ECC_Visibility, /*bTraceComplex=*/false, Hit)) { return FString(); }
	AActor* Actor = Hit.GetActor();
	while (Actor)               // the skeletal mesh may be a child; walk up to the minion actor
	{
		if (const AUnderworldMinion* Minion = Cast<AUnderworldMinion>(Actor)) { return Minion->MinionId; }
		Actor = Actor->GetOwner();
	}
	return FString();
}

void AUnderworldPlayerController::UpdateReticle()
{
	if (AUnderworldWorldManager* Mgr = FindWorldManager()) { Mgr->SetReticleTarget(TraceMinionId()); }
}

void AUnderworldPlayerController::OnPossessPressed(const FInputActionValue& /*V*/)
{
	AUnderworldWorldManager* Mgr = FindWorldManager();
	if (!Mgr) { return; }
	const FString Id = TraceMinionId();
	if (!Id.IsEmpty()) { Mgr->RequestPossess(Id); }
}

void AUnderworldPlayerController::OnReleasePressed(const FInputActionValue& /*V*/)
{
	if (AUnderworldWorldManager* Mgr = FindWorldManager()) { Mgr->ReleasePossession(); }
}

void AUnderworldPlayerController::OnBlessPressed(const FInputActionValue& /*V*/)
{
	AUnderworldWorldManager* Mgr = FindWorldManager();
	if (!Mgr) { return; }
	const FString Id = TraceMinionId();
	if (!Id.IsEmpty()) { Mgr->Bless(Id); }
}

void AUnderworldPlayerController::OnGiftPressed(const FInputActionValue& /*V*/)
{
	AUnderworldWorldManager* Mgr = FindWorldManager();
	if (!Mgr) { return; }
	const FString Id = TraceMinionId();
	if (!Id.IsEmpty()) { Mgr->Gift(Id, 1.f); }
}

void AUnderworldPlayerController::OnCullTriggered(const FInputActionValue& /*V*/)
{
	AUnderworldWorldManager* Mgr = FindWorldManager();
	if (!Mgr) { return; }
	const FString Id = TraceMinionId();
	// The Hold trigger having fired IS the confirm (red-team: destructive verbs need a deliberate hold).
	if (!Id.IsEmpty()) { Mgr->Cull(Id, /*bConfirmed=*/true); }
}
