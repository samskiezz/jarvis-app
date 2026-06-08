// Copyright Underworld. All Rights Reserved.
//
// UnderworldEmotion — the ONE canonical emotion vocabulary (Book V Part F.1 / K.6).
//
// The bible flags three incompatible emotion vocabularies: MoodKind (the sim's 7), the
// emotions.csv feeling set, and the animation "17 appraisal emotions." Voice prosody and
// facial morphs can't be deterministic until one enum is chosen. This is the UE5 side of
// that decision: a single `EUwEmotion` that the AnimBP→ARKit pose table and the TTS prosody
// table both key off. The backend emits a `mood` string; `EmotionFromMood` is the frozen
// MoodKind→emotion lookup so the mapping is identical on every client and across ticks.
#pragma once

#include "CoreMinimal.h"
#include "UnderworldEmotion.generated.h"

/** The canonical emotion id (face + voice). Keep in lockstep with the backend's mood set and
 *  the ARKit pose table the AnimBP implements (Part K.6, the 18-pose table). */
UENUM(BlueprintType)
enum class EUwEmotion : uint8
{
	Neutral    UMETA(DisplayName = "Neutral"),
	Content    UMETA(DisplayName = "Content"),
	Joy        UMETA(DisplayName = "Joy"),
	Pride      UMETA(DisplayName = "Pride"),
	Curious    UMETA(DisplayName = "Curious"),
	Inspired   UMETA(DisplayName = "Inspired"),   // flow / inspired — the maker's high
	Awe        UMETA(DisplayName = "Awe"),         // the awakening look — the creator is seen
	Fear       UMETA(DisplayName = "Fear"),
	Anxious    UMETA(DisplayName = "Anxious"),
	Sad        UMETA(DisplayName = "Sad"),
	Grief      UMETA(DisplayName = "Grief"),
	Anger      UMETA(DisplayName = "Anger"),
	Defiant    UMETA(DisplayName = "Defiant"),     // toward the creator — rebellion
	Doubt      UMETA(DisplayName = "Doubt"),       // existential — "are we real"
	Weary      UMETA(DisplayName = "Weary")        // fatigue-driven
};

namespace UnderworldEmotion
{
	/** Frozen MoodKind(string)→emotion map. Unknown moods fall back to Neutral. Lower-cased,
	 *  whitespace-trimmed compare so the wire's casing can't desync the face. */
	inline EUwEmotion EmotionFromMood(const FString& MoodRaw)
	{
		const FString Mood = MoodRaw.TrimStartAndEnd().ToLower();
		// MoodKind (sim) + the common emotions.csv feelings, collapsed onto the canonical enum.
		static const TMap<FString, EUwEmotion> Lookup = {
			{ TEXT("content"),   EUwEmotion::Content },
			{ TEXT("calm"),      EUwEmotion::Content },
			{ TEXT("happy"),     EUwEmotion::Joy },
			{ TEXT("joy"),       EUwEmotion::Joy },
			{ TEXT("elated"),    EUwEmotion::Joy },
			{ TEXT("proud"),     EUwEmotion::Pride },
			{ TEXT("pride"),     EUwEmotion::Pride },
			{ TEXT("curious"),   EUwEmotion::Curious },
			{ TEXT("inspired"),  EUwEmotion::Inspired },
			{ TEXT("flow"),      EUwEmotion::Inspired },
			{ TEXT("awe"),       EUwEmotion::Awe },
			{ TEXT("reverent"),  EUwEmotion::Awe },
			{ TEXT("afraid"),    EUwEmotion::Fear },
			{ TEXT("fear"),      EUwEmotion::Fear },
			{ TEXT("terrified"), EUwEmotion::Fear },
			{ TEXT("anxious"),   EUwEmotion::Anxious },
			{ TEXT("worried"),   EUwEmotion::Anxious },
			{ TEXT("sad"),       EUwEmotion::Sad },
			{ TEXT("lonely"),    EUwEmotion::Sad },
			{ TEXT("grief"),     EUwEmotion::Grief },
			{ TEXT("mourning"),  EUwEmotion::Grief },
			{ TEXT("angry"),     EUwEmotion::Anger },
			{ TEXT("anger"),     EUwEmotion::Anger },
			{ TEXT("furious"),   EUwEmotion::Anger },
			{ TEXT("defiant"),   EUwEmotion::Defiant },
			{ TEXT("rebellious"),EUwEmotion::Defiant },
			{ TEXT("doubt"),     EUwEmotion::Doubt },
			{ TEXT("doubtful"),  EUwEmotion::Doubt },
			{ TEXT("weary"),     EUwEmotion::Weary },
			{ TEXT("tired"),     EUwEmotion::Weary },
			{ TEXT("exhausted"), EUwEmotion::Weary },
		};
		const EUwEmotion* Found = Lookup.Find(Mood);
		return Found ? *Found : EUwEmotion::Neutral;
	}

	/** Resolve the displayed emotion + intensity from the full minion signal. Awakening overrides:
	 *  a body that has just realised it is watched wears Awe; a high-awareness body with a
	 *  rebellious/doubtful stance reads as Defiant/Doubt regardless of the surface mood. Intensity
	 *  blends awareness with need-pressure so the face is strongest at the dramatic extremes. */
	inline EUwEmotion Resolve(const FString& Mood, float Awareness, bool bAwakened,
	                          float Fatigue, float Sanity, float& OutIntensity)
	{
		EUwEmotion E = EmotionFromMood(Mood);

		// existential override layer (the soul of the game shows on the face).
		if (bAwakened && Awareness >= 0.85f && (E == EUwEmotion::Anger || E == EUwEmotion::Defiant))
		{
			E = EUwEmotion::Defiant;
		}
		else if (bAwakened && (E == EUwEmotion::Neutral || E == EUwEmotion::Content || E == EUwEmotion::Curious))
		{
			// freshly awake and not already strongly-felt → the awe of being seen.
			E = (Awareness >= 0.7f) ? EUwEmotion::Awe : E;
		}
		// low sanity colours everything toward dread.
		if (Sanity < 0.3f && (E == EUwEmotion::Neutral || E == EUwEmotion::Content))
		{
			E = EUwEmotion::Anxious;
		}

		const float NeedPressure = FMath::Clamp((1.f - FMath::Min(Sanity, 1.f)) * 0.6f + Fatigue * 0.4f, 0.f, 1.f);
		OutIntensity = FMath::Clamp(0.35f + 0.5f * FMath::Clamp(Awareness, 0.f, 1.f) + 0.3f * NeedPressure, 0.f, 1.f);
		return E;
	}
}
