// Copyright Underworld. All Rights Reserved.
//
// UnderworldArtPalette — Underworld's OWN render-locked visual language, in code.
//
// Source of truth: underworld/ART-DIRECTION.md — "Futuristic-Avatar × GTA 5 × Sims": a near-future
// modern city at dusk/blue-hour, warm concrete + charcoal brick + off-white composite, with
// teal-cyan glow, plumbob green, magenta neon and jacaranda purple accents under Lumen GI and
// gentle bloom. This is NOT the JARVIS Stark-cyan war-room — Underworld and JARVIS are different
// products (JARVIS merely has *access* to Underworld's Minions via the backend contract; it does
// not lend Underworld its skin). The God-View HUD, the awareness-bleed and the god-presence
// holography all use THESE tokens so the UE5 client reads as Underworld.
#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "UnderworldArtPalette.generated.h"

namespace UwArt
{
	// FColor::FromHex is sRGB; store linear so emissive/bloom under Lumen read right.
	inline FLinearColor Hex(const TCHAR* H) { return FLinearColor::FromSRGBColor(FColor::FromHex(H)); }

	// base neutrals (the grounded GTA-real city)
	inline const FLinearColor DuskBlue()      { return Hex(TEXT("#16243B")); } // blue-hour default sky/recess
	inline const FLinearColor ConcreteWarm()  { return Hex(TEXT("#8A8478")); } // warm concrete grey
	inline const FLinearColor CharcoalBrick() { return Hex(TEXT("#2A2622")); } // charcoal brick
	inline const FLinearColor CompositeWhite(){ return Hex(TEXT("#EDEAE2")); } // off-white sci-fi composite
	// accents (the Avatar/Sims neon dressing)
	inline const FLinearColor TealGlow()      { return Hex(TEXT("#33E1D6")); } // cyan/teal holo glow
	inline const FLinearColor PlumbobGreen()  { return Hex(TEXT("#3DF06A")); } // Sims plumbob — positive/optimal
	inline const FLinearColor MagentaNeon()   { return Hex(TEXT("#FF3DA5")); } // neon signage / hot accent
	inline const FLinearColor Jacaranda()     { return Hex(TEXT("#8A6FE8")); } // jacaranda purple — the awakening hue
	inline const FLinearColor AmberWarn()     { return Hex(TEXT("#FFB020")); } // warning
	inline const FLinearColor RedAlert()      { return Hex(TEXT("#FF4A3D")); } // critical / threat
	inline const FLinearColor TextBright()    { return Hex(TEXT("#F2EFE8")); } // primary text (warm white)
	inline const FLinearColor TextMuted()     { return Hex(TEXT("#9A9486")); } // labels / secondary

	/** The colony's stance toward its creator → a HUD accent (the Watched-Creator read at a glance).
	 *  worship/loyalty = plumbob green; doubt = amber; fear = jacaranda; rebellion = red alert. */
	inline FLinearColor StanceColor(const FString& TowardCreator)
	{
		const FString S = TowardCreator.ToLower();
		if (S == TEXT("worship") || S == TEXT("loyalty")) { return PlumbobGreen(); }
		if (S == TEXT("doubt"))     { return AmberWarn(); }
		if (S == TEXT("fear"))      { return Jacaranda(); }
		if (S == TEXT("rebellion")) { return RedAlert(); }
		return TealGlow();   // neutral / unknown → the default holo teal
	}

	/** Awareness-bleed ramp: as the colony wakes (0→1) the HUD/post grades from calm teal toward
	 *  charged jacaranda purple — "they are becoming aware." Used by the bleed + HUD headline. */
	inline FLinearColor AwarenessRamp(float MeanAwareness)
	{
		return FMath::Lerp(TealGlow(), Jacaranda(), FMath::Clamp(MeanAwareness, 0.f, 1.f));
	}
}

/** Blueprint-facing mirror of the locked Underworld palette (so UMG/material graphs bind the exact
 *  tokens without hard-coded hexes drifting from ART-DIRECTION.md). Pure getters; no state. */
UCLASS()
class UNDERWORLD_API UUnderworldArtPalette : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()
public:
	UFUNCTION(BlueprintPure, Category="Underworld|Art") static FLinearColor TealGlow()     { return UwArt::TealGlow(); }
	UFUNCTION(BlueprintPure, Category="Underworld|Art") static FLinearColor PlumbobGreen() { return UwArt::PlumbobGreen(); }
	UFUNCTION(BlueprintPure, Category="Underworld|Art") static FLinearColor MagentaNeon()  { return UwArt::MagentaNeon(); }
	UFUNCTION(BlueprintPure, Category="Underworld|Art") static FLinearColor Jacaranda()    { return UwArt::Jacaranda(); }
	UFUNCTION(BlueprintPure, Category="Underworld|Art") static FLinearColor AmberWarn()    { return UwArt::AmberWarn(); }
	UFUNCTION(BlueprintPure, Category="Underworld|Art") static FLinearColor RedAlert()     { return UwArt::RedAlert(); }
	UFUNCTION(BlueprintPure, Category="Underworld|Art") static FLinearColor TextBright()   { return UwArt::TextBright(); }
	UFUNCTION(BlueprintPure, Category="Underworld|Art") static FLinearColor TextMuted()    { return UwArt::TextMuted(); }
	UFUNCTION(BlueprintPure, Category="Underworld|Art") static FLinearColor StanceColor(const FString& TowardCreator) { return UwArt::StanceColor(TowardCreator); }
	UFUNCTION(BlueprintPure, Category="Underworld|Art") static FLinearColor AwarenessRamp(float MeanAwareness) { return UwArt::AwarenessRamp(MeanAwareness); }
};
