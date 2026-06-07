// Copyright Underworld. All Rights Reserved.
#include "UnderworldSpectatorPawn.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputActionValue.h"
#include "GameFramework/PlayerController.h"

AUnderworldSpectatorPawn::AUnderworldSpectatorPawn()
{
	PrimaryActorTick.bCanEverTick = false;

	SpringArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("SpringArm"));
	RootComponent = SpringArm;
	SpringArm->TargetArmLength = 1500.f;
	SpringArm->bDoCollisionTest = false;
	SpringArm->bEnableCameraLag = true;

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(SpringArm);
}

void AUnderworldSpectatorPawn::BeginPlay()
{
	Super::BeginPlay();
	if (APlayerController* PC = Cast<APlayerController>(GetController()))
	{
		if (auto* Sub = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
		{
			if (MappingContext) { Sub->AddMappingContext(MappingContext, 0); }
		}
	}
}

void AUnderworldSpectatorPawn::SetupPlayerInputComponent(UInputComponent* Input)
{
	Super::SetupPlayerInputComponent(Input);
	if (UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(Input))
	{
		if (MoveAction) { EIC->BindAction(MoveAction, ETriggerEvent::Triggered, this, &AUnderworldSpectatorPawn::Move); }
		if (LookAction) { EIC->BindAction(LookAction, ETriggerEvent::Triggered, this, &AUnderworldSpectatorPawn::Look); }
		if (ZoomAction) { EIC->BindAction(ZoomAction, ETriggerEvent::Triggered, this, &AUnderworldSpectatorPawn::Zoom); }
	}
}

void AUnderworldSpectatorPawn::Move(const FInputActionValue& V)
{
	const FVector2D Axis = V.Get<FVector2D>();
	const FRotator Yaw(0.f, GetActorRotation().Yaw, 0.f);
	AddActorWorldOffset(Yaw.RotateVector(FVector(Axis.Y, Axis.X, 0.f)) * MoveSpeed * GetWorld()->GetDeltaSeconds(), true);
}

void AUnderworldSpectatorPawn::Look(const FInputActionValue& V)
{
	const FVector2D Axis = V.Get<FVector2D>();
	AddActorLocalRotation(FRotator(0.f, Axis.X * LookSpeed * GetWorld()->GetDeltaSeconds(), 0.f));
	SpringArm->AddLocalRotation(FRotator(-Axis.Y * LookSpeed * GetWorld()->GetDeltaSeconds(), 0.f, 0.f));
}

void AUnderworldSpectatorPawn::Zoom(const FInputActionValue& V)
{
	SpringArm->TargetArmLength = FMath::Clamp(SpringArm->TargetArmLength - V.Get<float>() * 120.f, 300.f, 6000.f);
}
