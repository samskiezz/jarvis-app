// Copyright Underworld. All Rights Reserved.
#include "UnderworldMinion.h"
#include "Components/SkeletalMeshComponent.h"

AUnderworldMinion::AUnderworldMinion()
{
	PrimaryActorTick.bCanEverTick = true;
	Mesh = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Mesh"));
	RootComponent = Mesh;
}

void AUnderworldMinion::ApplyState(const FUwMinionState& State)
{
	MinionId = State.Id;
	DisplayName = State.Name;

	// Backend is Y-up (index 1 = height), same as the chunk/structure contract and the
	// Omniverse renderer. UE is Z-up, so map backend (x, y-up, z) → UE (x, z, y-up).
	// Keeps minions on the SAME ground plane as the streamed buildings.
	TargetLocation = FVector(State.Pos.X, State.Pos.Z, State.Pos.Y) * WorldScale;
	TargetRotation = FRotator(0.f, State.Facing, 0.f);

	// MOVEMENT v2 — the server kinematic. Velocity is ground-plane (vx,0,vz) backend u/s;
	// map to UE (x=vx, y=vz) and scale to cm/s. The slot is the building the action targets.
	ServerVelocity = FVector(State.Velocity.X, State.Velocity.Z, 0.f) * WorldScale;
	GroundSpeed    = ServerVelocity.Size();
	bHasSlot       = State.bHasTarget;
	if (bHasSlot)
	{
		// target_pos is ground-plane (tx,0,tz); keep the actor's current height for the clamp.
		TargetSlot = FVector(State.TargetPos.X * WorldScale, State.TargetPos.Z * WorldScale, TargetLocation.Z);
	}

	// ── identity / activity ─────────────────────────────────────────────────────────
	if (State.Anim != Anim)   { Anim = State.Anim;   OnAnimChanged(Anim); }
	if (State.Guild != Guild) { Guild = State.Guild; OnGuildChanged(Guild); }
	if (!State.GuildColor.Equals(GuildColor)) { GuildColor = State.GuildColor; OnGuildColor(GuildColor); }
	if (State.MoveState != MoveState) { MoveState = State.MoveState; }
	Mood     = State.Mood;
	Role     = State.Role;
	Action   = State.Action;
	Thought  = State.Thought;
	Identity = State.Identity;

	// ── prominence: masters / high-reputation render larger & adorned ────────────────
	// Store the CLAMPED factor (not the raw value) so the change-detect guard reconciles — else an
	// out-of-range prominence re-issues SetActorScale3D every tick and Prominence reports a value
	// that was never applied to the transform.
	const float ClampedProm = FMath::Clamp(State.Prominence, 0.5f, 2.5f);
	const float NewScale = BaseScale * ClampedProm;
	if (!FMath::IsNearlyEqual(NewScale, Prominence * BaseScale, 0.001f))
	{
		Prominence = ClampedProm;
		SetActorScale3D(FVector(NewScale));
	}

	// ── emotion (face + voice) ───────────────────────────────────────────────────────
	if (State.Emotion != Emotion || !FMath::IsNearlyEqual(State.EmotionIntensity, EmotionIntensity, 0.02f))
	{
		Emotion = State.Emotion;
		EmotionIntensity = State.EmotionIntensity;
		OnEmotionChanged(Emotion, EmotionIntensity);
	}

	// ── awakening / awareness (the soul) ─────────────────────────────────────────────
	const bool bWasAwake = bAwakened;
	if (!FMath::IsNearlyEqual(State.Awareness, Awareness, 0.01f))
	{
		Awareness = State.Awareness;
		OnAwarenessChanged(Awareness);
	}
	bAwakened = State.bAwakened;
	if (bAwakened && !bWasAwake)   // the one-shot "it sees you" beat
	{
		OnAwakened();
	}
}

bool AUnderworldMinion::WantsHeroFidelity(const FVector& ViewerLocation, float NearDistanceUU) const
{
	// In-conversation (talk anim) or awakened bodies promote when near; always-promote candidates
	// (possession) are handled by the WorldManager which swaps the actor outright. (Part E.6.)
	const bool bNear = FVector::DistSquared(GetActorLocation(), ViewerLocation) <= FMath::Square(NearDistanceUU);
	const bool bInConversation = (Anim == TEXT("talk"));
	return bNear && (bAwakened || bInConversation);
}

void AUnderworldMinion::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	// Dead-reckoning: while the server says we're walking, extrapolate the goal along the
	// server velocity so motion stays continuous between ~1 Hz polls. Clamp so we never
	// over-run the building slot (which would cause a visible snap-back on the next poll).
	if (bDeadReckon && MoveState == TEXT("walk") && !ServerVelocity.IsNearlyZero())
	{
		FVector Predicted = TargetLocation + ServerVelocity * DeltaSeconds;
		if (bHasSlot)
		{
			const FVector ToSlot   = TargetSlot - TargetLocation;
			const FVector ToPredict = Predicted - TargetLocation;
			// if we'd pass the slot (direction flips or overshoot), pin to the slot
			if ((ToSlot | ToPredict) <= 0.f || ToPredict.SizeSquared() > ToSlot.SizeSquared())
			{
				Predicted = TargetSlot;
			}
		}
		TargetLocation = Predicted;
	}

	SetActorLocation(FMath::VInterpTo(GetActorLocation(), TargetLocation, DeltaSeconds, LerpSpeed));
	SetActorRotation(FMath::RInterpTo(GetActorRotation(), TargetRotation, DeltaSeconds, LerpSpeed));
}
