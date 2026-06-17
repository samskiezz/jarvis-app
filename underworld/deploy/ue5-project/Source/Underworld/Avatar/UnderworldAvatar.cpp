// Copyright Underworld. All Rights Reserved.
#include "Avatar/UnderworldAvatar.h"
#include "Camera/CameraComponent.h"
#include "Components/InputComponent.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "InputActionValue.h"

AUnderworldAvatar::AUnderworldAvatar()
{
	PrimaryActorTick.bCanEverTick = true;

	bUseControllerRotationYaw = true;
	bUseControllerRotationPitch = false;
	bUseControllerRotationRoll = false;

	SpringArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("AvatarSpringArm"));
	SpringArm->SetupAttachment(RootComponent);
	SpringArm->TargetArmLength = 400.f;
	SpringArm->bUsePawnControlRotation = true;

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("AvatarCamera"));
	Camera->SetupAttachment(SpringArm, USpringArmComponent::SocketName);
	Camera->bUsePawnControlRotation = false;

	if (UCharacterMovementComponent* Move = GetCharacterMovement())
	{
		Move->bOrientRotationToMovement = false;
		Move->MaxWalkSpeed = 600.f;
		Move->JumpZVelocity = 480.f;
	}
}

void AUnderworldAvatar::BeginPlay()
{
	Super::BeginPlay();
	UE_LOG(LogTemp, Log, TEXT("[Underworld] Avatar BeginPlay player=%s world=%s"),
		*PlayerId, *WorldId);

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

void AUnderworldAvatar::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	TimeUntilNextSync -= DeltaSeconds;
	if (TimeUntilNextSync <= 0.f)
	{
		TimeUntilNextSync = BackendSyncInterval;
		// Phase 3 stub — the backend POST is wired in Phase 6 via the existing SceneStateClient.
		// We just record the pose here so the next sync can pick it up.
	}
}

void AUnderworldAvatar::SetupPlayerInputComponent(UInputComponent* Input)
{
	Super::SetupPlayerInputComponent(Input);
	if (UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(Input))
	{
		if (MoveAction) { EIC->BindAction(MoveAction, ETriggerEvent::Triggered, this, &AUnderworldAvatar::Move); }
		if (LookAction) { EIC->BindAction(LookAction, ETriggerEvent::Triggered, this, &AUnderworldAvatar::Look); }
		if (JumpAction) { EIC->BindAction(JumpAction, ETriggerEvent::Started, this, &ACharacter::Jump); }
	}
}

void AUnderworldAvatar::Move(const FInputActionValue& V)
{
	const FVector2D In = V.Get<FVector2D>();
	if (Controller)
	{
		const FRotator Yaw(0.f, Controller->GetControlRotation().Yaw, 0.f);
		AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::X), In.Y);
		AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::Y), In.X);
	}
}

void AUnderworldAvatar::Look(const FInputActionValue& V)
{
	const FVector2D In = V.Get<FVector2D>();
	AddControllerYawInput(In.X);
	AddControllerPitchInput(In.Y);
}
