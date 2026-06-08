// Copyright Underworld. All Rights Reserved.
#include "UnderworldPlayableMinion.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/Controller.h"
#include "GameFramework/PlayerController.h"

AUnderworldPlayableMinion::AUnderworldPlayableMinion()
{
	PrimaryActorTick.bCanEverTick = true;

	// Orient the body toward its motion (server velocity when AI-driven, input when possessed)
	// rather than the controller, so AI walking looks right without a controller rotation.
	bUseControllerRotationYaw = false;
	if (UCharacterMovementComponent* Move = GetCharacterMovement())
	{
		Move->bOrientRotationToMovement = true;
		Move->RotationRate = FRotator(0.f, 540.f, 0.f);
		Move->MaxWalkSpeed = 320.f;            // overridden per-tick from the server in AI mode
		Move->BrakingDecelerationWalking = 2000.f;
	}
}

void AUnderworldPlayableMinion::ApplyState(const FUwMinionState& State)
{
	MinionId = State.Id;

	// Backend Y-up (index 1 = height) → UE Z-up: (x, y-up, z) ⇒ (x, z, y-up).
	ServerTarget = State.bHasTarget
		? FVector(State.TargetPos.X * WorldScale, State.TargetPos.Z * WorldScale, GetActorLocation().Z)
		: FVector(State.Pos.X, State.Pos.Z, State.Pos.Y) * WorldScale;
	bHasTarget        = true;
	ServerGroundSpeed = FVector(State.Velocity.X, State.Velocity.Z, 0.f).Size() * WorldScale;

	if (State.Anim != Anim)   { Anim = State.Anim;   OnAnimChanged(Anim); }
	if (State.Guild != Guild) { Guild = State.Guild; OnGuildChanged(Guild); }
	MoveState = State.MoveState;
	Mood = State.Mood;

	// While the creator drives this body, the server does NOT move it — but if the AI body
	// drifted from the server's authoritative position (no possession), gently reconcile when
	// far off to avoid divergence. Only hard-correct when there's no player at the wheel.
	if (!bPlayerPossessed)
	{
		const FVector ServerPos = FVector(State.Pos.X, State.Pos.Z, State.Pos.Y) * WorldScale;
		if (FVector::DistSquared(GetActorLocation(), ServerPos) > FMath::Square(400.f))
		{
			SetActorLocation(FVector(ServerPos.X, ServerPos.Y, GetActorLocation().Z));
		}
	}
}

void AUnderworldPlayableMinion::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (bPlayerPossessed || !bHasTarget) { return; }   // player input drives it; or nothing to do

	// AI-DRIVEN: steer toward the server's target slot at the server-reported ground speed.
	if (UCharacterMovementComponent* Move = GetCharacterMovement())
	{
		if (ServerGroundSpeed > 1.f) { Move->MaxWalkSpeed = ServerGroundSpeed; }
	}
	FVector ToTarget = ServerTarget - GetActorLocation();
	ToTarget.Z = 0.f;
	const float Dist = ToTarget.Size();
	if (Dist > ArriveRadius && ServerGroundSpeed > 1.f)
	{
		AddMovementInput(ToTarget / FMath::Max(Dist, 1.f), 1.f);
	}
}

void AUnderworldPlayableMinion::PossessedBy(AController* NewController)
{
	Super::PossessedBy(NewController);
	const bool bIsPlayer = NewController && NewController->IsPlayerController();
	if (bIsPlayer && !bPlayerPossessed)
	{
		bPlayerPossessed = true;
		bUseControllerRotationYaw = true;                       // input-relative steering
		if (UCharacterMovementComponent* Move = GetCharacterMovement())
		{
			Move->MaxWalkSpeed = 600.f;                         // responsive player speed
		}
		OnPossessionChanged(true);
	}
}

void AUnderworldPlayableMinion::UnPossessed()
{
	Super::UnPossessed();
	if (bPlayerPossessed)
	{
		bPlayerPossessed = false;
		bUseControllerRotationYaw = false;
		OnPossessionChanged(false);
	}
}

void AUnderworldPlayableMinion::MoveForward(float Value)
{
	if (!bPlayerPossessed || FMath::IsNearlyZero(Value)) { return; }
	const FRotator Yaw(0.f, GetControlRotation().Yaw, 0.f);
	AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::X), Value);
}

void AUnderworldPlayableMinion::MoveRight(float Value)
{
	if (!bPlayerPossessed || FMath::IsNearlyZero(Value)) { return; }
	const FRotator Yaw(0.f, GetControlRotation().Yaw, 0.f);
	AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::Y), Value);
}

void AUnderworldPlayableMinion::Turn(float Value)   { if (bPlayerPossessed) { AddControllerYawInput(Value); } }
void AUnderworldPlayableMinion::LookUp(float Value) { if (bPlayerPossessed) { AddControllerPitchInput(Value); } }
