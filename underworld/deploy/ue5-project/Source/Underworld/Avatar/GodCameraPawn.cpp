// Copyright Underworld. All Rights Reserved.
#include "Avatar/GodCameraPawn.h"
#include "Camera/CameraComponent.h"
#include "Components/InputComponent.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "GameFramework/PlayerController.h"
#include "InputActionValue.h"

AGodCameraPawn::AGodCameraPawn()
{
	PrimaryActorTick.bCanEverTick = true;
	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("GodCamera"));
	RootComponent = Camera;
}

void AGodCameraPawn::BeginPlay()
{
	Super::BeginPlay();
	UE_LOG(LogTemp, Log, TEXT("[Underworld] GodCameraPawn BeginPlay"));
	if (APlayerController* PC = Cast<APlayerController>(GetController()))
	{
		if (ULocalPlayer* LP = PC->GetLocalPlayer())
		{
			if (UEnhancedInputLocalPlayerSubsystem* Sub =
				LP->GetSubsystem<UEnhancedInputLocalPlayerSubsystem>())
			{
				if (MappingContext) { Sub->AddMappingContext(MappingContext, 0); }
			}
		}
	}
}

void AGodCameraPawn::SetupPlayerInputComponent(UInputComponent* Input)
{
	Super::SetupPlayerInputComponent(Input);
	if (UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(Input))
	{
		if (MoveAction) { EIC->BindAction(MoveAction, ETriggerEvent::Triggered, this, &AGodCameraPawn::Move); }
		if (LookAction) { EIC->BindAction(LookAction, ETriggerEvent::Triggered, this, &AGodCameraPawn::Look); }
		if (ZoomAction) { EIC->BindAction(ZoomAction, ETriggerEvent::Triggered, this, &AGodCameraPawn::Zoom); }
	}
}

void AGodCameraPawn::Move(const FInputActionValue& V)
{
	const FVector2D In = V.Get<FVector2D>();
	if (!Controller) { return; }
	const FRotator Yaw(0.f, Controller->GetControlRotation().Yaw, 0.f);
	const FVector Fwd = FRotationMatrix(Yaw).GetUnitAxis(EAxis::X);
	const FVector Rgt = FRotationMatrix(Yaw).GetUnitAxis(EAxis::Y);
	const FVector Delta = (Fwd * In.Y + Rgt * In.X) * MoveSpeed * GetWorld()->GetDeltaSeconds();
	SetActorLocation(GetActorLocation() + Delta);
}

void AGodCameraPawn::Look(const FInputActionValue& V)
{
	const FVector2D In = V.Get<FVector2D>();
	AddControllerYawInput(In.X);
	AddControllerPitchInput(In.Y);
}

void AGodCameraPawn::Zoom(const FInputActionValue& V)
{
	const float Val = V.Get<float>();
	const FVector Fwd = GetActorRotation().Vector();
	SetActorLocation(GetActorLocation() + Fwd * Val * ZoomSpeed * GetWorld()->GetDeltaSeconds());
}
