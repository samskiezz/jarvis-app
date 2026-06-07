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

	if (State.Anim != Anim)   { Anim = State.Anim;   OnAnimChanged(Anim); }
	if (State.Guild != Guild) { Guild = State.Guild; OnGuildChanged(Guild); }
	Mood = State.Mood;
}

void AUnderworldMinion::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	const float A = FMath::Clamp(LerpSpeed * DeltaSeconds, 0.f, 1.f);
	SetActorLocation(FMath::VInterpTo(GetActorLocation(), TargetLocation, DeltaSeconds, LerpSpeed));
	SetActorRotation(FMath::RInterpTo(GetActorRotation(), TargetRotation, DeltaSeconds, LerpSpeed));
	(void)A;
}
