// Copyright Underworld. All Rights Reserved.
#include "UnderworldGodHud.h"
#include "UnderworldArtPalette.h"
#include "SceneStateClient.h"
#include "Blueprint/UserWidget.h"
#include "Engine/GameInstance.h"
#include "Kismet/GameplayStatics.h"

void AUnderworldGodHud::BeginPlay()
{
	Super::BeginPlay();

	if (UGameInstance* GI = UGameplayStatics::GetGameInstance(this))
	{
		if (USceneStateClient* Client = GI->GetSubsystem<USceneStateClient>())
		{
			Client->OnSceneState.AddDynamic(this, &AUnderworldGodHud::HandleSceneState);
			if (Client->Latest.Tick > 0) { HandleSceneState(Client->Latest); }   // catch up
		}
	}

	// spawn the authored war-room overlay (smoked-glass panels, cyan edges, radial gauge).
	if (*HudWidgetClass)
	{
		if (APlayerController* PC = GetOwningPlayerController())
		{
			HudWidget = CreateWidget<UUserWidget>(PC, HudWidgetClass);
			if (HudWidget) { HudWidget->AddToViewport(); }
		}
	}
}

void AUnderworldGodHud::EndPlay(const EEndPlayReason::Type Reason)
{
	if (UGameInstance* GI = UGameplayStatics::GetGameInstance(this))
	{
		if (USceneStateClient* Client = GI->GetSubsystem<USceneStateClient>())
		{
			Client->OnSceneState.RemoveDynamic(this, &AUnderworldGodHud::HandleSceneState);
		}
	}
	if (HudWidget) { HudWidget->RemoveFromParent(); HudWidget = nullptr; }
	Super::EndPlay(Reason);
}

void AUnderworldGodHud::HandleSceneState(const FUwSceneState& State)
{
	// top status
	Era        = State.Era;
	SimYear    = State.SimYear;
	Population = State.Population;

	// the Watched-Creator read: the colony's stance toward you, coloured by Underworld's palette.
	Overmind    = State.Overmind;
	StanceColor = Overmind.bValid ? UwArt::StanceColor(Overmind.TowardCreator) : UwArt::TealGlow();

	// the colony's awakening gauge, grading teal→jacaranda as they wake (the awareness-bleed).
	MeanAwareness  = State.MeanAwareness;
	AwakenedCount  = State.AwakenedCount;
	AwarenessColor = UwArt::AwarenessRamp(MeanAwareness);

	bCreatorPresent = State.Presence.bCreatorPresent;
	ActiveGodBeat   = State.GodBeat;

	OnHudModel();

	// the critical-alert lane: a fresh, distinct God-Brain beat fires once.
	if (!State.GodBeat.IsEmpty() && State.GodBeat != LastAlert)
	{
		LastAlert = State.GodBeat;
		OnCriticalAlert(State.GodBeat);
	}
	else if (State.GodBeat.IsEmpty())
	{
		LastAlert.Empty();
	}

	if (State.Chatter.Num() > 0) { OnWhisperFeed(State.Chatter); }
}
