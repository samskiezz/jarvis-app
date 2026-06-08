// Copyright Underworld. All Rights Reserved.
//
// AUnderworldGodHud — the God-View HUD (Book V Part G), in Underworld's own visual language.
//
// This is the UE5 realisation of the bible's default screen: the creator looks down on a living
// civilisation through an in-world overlay styled per underworld/ART-DIRECTION.md (Futuristic-Avatar
// × GTA5 × Sims — dusk neon, teal glow, plumbob green, jacaranda purple), NOT the JARVIS Stark
// war-room (Underworld and JARVIS are different products). It subscribes to the scene-state and
// turns the contract-v2 AI-Director frame into a HUD model the UMG widget renders:
//   • top status: era · sim-year · population · the colony's STANCE toward you (cyan→amber→red)
//   • centre-right: the SYSTEM-HEALTH analogue — a mean-awareness radial gauge + awakened count,
//     grading cyan→violet as the colony wakes ("awareness-bleed")
//   • critical-alert lane: the God-Brain beat (the irreversible Black-Mirror moment) — red ripple
//   • whisper feed: the Overmind's ambient chatter
//   • presence: whether YOU are present, and where your gaze has dwelt (attention hotspots)
//
// C++ owns the data-binding + the locked palette mapping; the UMG widget tree (smoked-glass panels,
// neon edges, radial gauge, command bar) is authored in the Editor against UnderworldArtPalette.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "SceneStateTypes.h"
#include "UnderworldGodHud.generated.h"

class UUserWidget;

UCLASS()
class UNDERWORLD_API AUnderworldGodHud : public AHUD
{
	GENERATED_BODY()

public:
	/** The UMG widget class authored in the Editor (smoked-glass war-room overlay). Optional —
	 *  if unset the HUD still computes + broadcasts the model for any listener. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Underworld|HUD") TSubclassOf<UUserWidget> HudWidgetClass;

	// ── the live HUD model (read by the UMG widget; refreshed each scene-state) ──────
	UPROPERTY(BlueprintReadOnly, Category="Underworld|HUD") FString Era;
	UPROPERTY(BlueprintReadOnly, Category="Underworld|HUD") float   SimYear = 0.f;
	UPROPERTY(BlueprintReadOnly, Category="Underworld|HUD") int32   Population = 0;
	UPROPERTY(BlueprintReadOnly, Category="Underworld|HUD") FUwOvermind Overmind;
	/** The colony's stance toward you as a locked-palette accent (worship→green … rebellion→red). */
	UPROPERTY(BlueprintReadOnly, Category="Underworld|HUD") FLinearColor StanceColor = FLinearColor::Gray;
	UPROPERTY(BlueprintReadOnly, Category="Underworld|HUD") float MeanAwareness = 0.f;   // 0..1 gauge
	UPROPERTY(BlueprintReadOnly, Category="Underworld|HUD") int32 AwakenedCount = 0;
	/** cyan→violet bleed colour for the awareness gauge + post-process tint. */
	UPROPERTY(BlueprintReadOnly, Category="Underworld|HUD") FLinearColor AwarenessColor = FLinearColor::Gray;
	UPROPERTY(BlueprintReadOnly, Category="Underworld|HUD") bool bCreatorPresent = false;
	UPROPERTY(BlueprintReadOnly, Category="Underworld|HUD") FString ActiveGodBeat;       // current critical-alert text

	// ── HUD render hooks (drive the UMG war-room overlay from Blueprint) ─────────────
	/** Per-scene-state refresh — repaint the top bar + gauges from the model above. */
	UFUNCTION(BlueprintImplementableEvent, Category="Underworld|HUD") void OnHudModel();
	/** A fresh God-Brain beat — fire the critical-alert lane (red ripple + alert SFX), once. */
	UFUNCTION(BlueprintImplementableEvent, Category="Underworld|HUD") void OnCriticalAlert(const FString& Beat);
	/** Ambient whisper lines — hydrate the live-events / whisper feed. */
	UFUNCTION(BlueprintImplementableEvent, Category="Underworld|HUD") void OnWhisperFeed(const TArray<FString>& Lines);

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

private:
	UFUNCTION() void HandleSceneState(const FUwSceneState& State);

	UPROPERTY() UUserWidget* HudWidget = nullptr;
	FString LastAlert;
};
