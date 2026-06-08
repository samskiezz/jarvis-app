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

	if (State.Anim != Anim)   { Anim = State.Anim;   OnAnimChanged(Anim); }
	if (State.Guild != Guild) { Guild = State.Guild; OnGuildChanged(Guild); }
	if (State.MoveState != MoveState) { MoveState = State.MoveState; }
	Mood = State.Mood;
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
