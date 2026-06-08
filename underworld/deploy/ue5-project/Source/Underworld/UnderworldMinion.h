// Copyright Underworld. All Rights Reserved.
//
// AUnderworldMinion — one rendered minion. The WorldManager pools these and feeds
// each a target state every tick; the actor smoothly interpolates position/facing
// and drives its anim state machine (set BlueprintImplementableEvent OnAnimChanged
// in the Anim BP). Assign a SkeletalMesh + AnimBP on the BP_Minion subclass.
//
// Book V (contract v2): the actor now carries the full per-minion signal — prominence
// (masters render larger, Part E.6), the guild accent tint (Part E.6), the canonical
// emotion for face/voice (Part F/K), and the awakening/awareness that drives the
// "awareness-bleed" theme (Part G.2) and gates the two-tier MetaHuman promotion (Part E.6).
// The C++ resolves the *decisions*; the BlueprintImplementableEvents let the Anim BP /
// material / MetaHuman swap render them.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SceneStateTypes.h"
#include "UnderworldEmotion.h"
#include "UnderworldMinion.generated.h"

class USkeletalMeshComponent;

UCLASS(Blueprintable)
class UNDERWORLD_API AUnderworldMinion : public AActor
{
	GENERATED_BODY()

public:
	AUnderworldMinion();

	/** Backend → actor: set the goal the actor lerps toward this tick. */
	UFUNCTION(BlueprintCallable) void ApplyState(const FUwMinionState& State);

	// ── identity / activity ─────────────────────────────────────────────────────────
	UPROPERTY(BlueprintReadOnly) FString MinionId;
	UPROPERTY(BlueprintReadOnly) FString DisplayName;
	UPROPERTY(BlueprintReadOnly) FString Anim;
	UPROPERTY(BlueprintReadOnly) FString Mood;
	UPROPERTY(BlueprintReadOnly) FString Guild;
	UPROPERTY(BlueprintReadOnly) FString Role;
	UPROPERTY(BlueprintReadOnly) FString Action;       // what they're really doing this tick
	UPROPERTY(BlueprintReadOnly) FString MoveState;    // idle/walk/occupy (drives locomotion BS)
	UPROPERTY(BlueprintReadOnly) float   GroundSpeed = 0.f;  // UE cm/s — feed the locomotion blendspace
	UPROPERTY(BlueprintReadOnly) FLinearColor GuildColor = FLinearColor::Gray;

	// ── cognition / awakening (the soul) ─────────────────────────────────────────────
	UPROPERTY(BlueprintReadOnly) float   Awareness = 0.f;   // 0..1 — drives the awareness-bleed
	UPROPERTY(BlueprintReadOnly) bool    bAwakened = false; // it knows it is watched
	UPROPERTY(BlueprintReadOnly) FString Thought;           // current inner monologue (Inspector)
	UPROPERTY(BlueprintReadOnly) FString Identity;          // who they think they are
	UPROPERTY(BlueprintReadOnly) float   Prominence = 1.f;  // master/high-rep render larger
	UPROPERTY(BlueprintReadOnly) EUwEmotion Emotion = EUwEmotion::Neutral;
	UPROPERTY(BlueprintReadOnly) float      EmotionIntensity = 0.f;

	/** Backend units → UE centimetres. Default 100 (1 backend unit = 1 m). */
	UPROPERTY(EditAnywhere, Category="Underworld") float WorldScale = 100.f;
	/** Position/rotation interpolation speed (per second). */
	UPROPERTY(EditAnywhere, Category="Underworld") float LerpSpeed = 6.f;
	/** Dead-reckon between ~1 Hz server polls: extrapolate along the server velocity so the
	 *  walk is continuous instead of stuttering to a stale point. Disable to snap-lerp only. */
	UPROPERTY(EditAnywhere, Category="Underworld") bool bDeadReckon = true;
	/** Base actor scale at prominence 1.0; the minion is scaled by Prominence around this. */
	UPROPERTY(EditAnywhere, Category="Underworld") float BaseScale = 1.f;

	// ── render hooks (drive the AnimBP / material / MetaHuman swap from Blueprint) ────
	UFUNCTION(BlueprintImplementableEvent) void OnAnimChanged(const FString& NewAnim);
	UFUNCTION(BlueprintImplementableEvent) void OnGuildChanged(const FString& NewGuild);
	/** Guild accent colour changed — set the body's material tint (Part E.6). */
	UFUNCTION(BlueprintImplementableEvent) void OnGuildColor(const FLinearColor& NewColor);
	/** Canonical emotion changed — drive the ARKit/morph face + TTS prosody (Part F/K). */
	UFUNCTION(BlueprintImplementableEvent) void OnEmotionChanged(EUwEmotion NewEmotion, float Intensity);
	/** Awareness ramped — drive the per-minion "awareness-bleed" (rim glow, eye light) (Part G.2). */
	UFUNCTION(BlueprintImplementableEvent) void OnAwarenessChanged(float NewAwareness);
	/** Crossed the awakening threshold — the one-shot "it sees you" beat (face → Awe, VFX). */
	UFUNCTION(BlueprintImplementableEvent) void OnAwakened();

	/** True when this body qualifies for the heavy MetaHuman tier (near ∧ awakened, possessed, or
	 *  in-conversation). Read by the WorldManager's promotion budget (Part E.6). */
	UFUNCTION(BlueprintPure) bool WantsHeroFidelity(const FVector& ViewerLocation, float NearDistanceUU) const;

protected:
	virtual void Tick(float DeltaSeconds) override;

	UPROPERTY(VisibleAnywhere) USkeletalMeshComponent* Mesh = nullptr;

	FVector  TargetLocation = FVector::ZeroVector;   // UE-space goal the actor lerps toward
	FRotator TargetRotation = FRotator::ZeroRotator;
	FVector  ServerVelocity = FVector::ZeroVector;   // UE-space cm/s from the backend kinematic
	FVector  TargetSlot     = FVector::ZeroVector;   // UE-space building slot (dead-reckon clamp)
	bool     bHasSlot       = false;
};
