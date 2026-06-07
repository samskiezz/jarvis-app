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

	// Backend (X,Y,Z) → UE (X, Y, Z up). Map backend Z (height) to UE Z.
	TargetLocation = FVector(State.Pos.X, State.Pos.Y, State.Pos.Z) * WorldScale;
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
