// Copyright Underworld. All Rights Reserved.
#include "UnderworldWorldManager.h"
#include "UnderworldMinion.h"
#include "SceneStateClient.h"
#include "Engine/DirectionalLight.h"
#include "Components/DirectionalLightComponent.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

AUnderworldWorldManager::AUnderworldWorldManager()
{
	PrimaryActorTick.bCanEverTick = false;
}

void AUnderworldWorldManager::BeginPlay()
{
	Super::BeginPlay();

	if (UGameInstance* GI = UGameplayStatics::GetGameInstance(this))
	{
		if (USceneStateClient* Client = GI->GetSubsystem<USceneStateClient>())
		{
			Client->OnSceneState.AddDynamic(this, &AUnderworldWorldManager::HandleSceneState);
			// catch up immediately if a state already arrived
			if (Client->Latest.Minions.Num() > 0) { HandleSceneState(Client->Latest); }
		}
	}
}

void AUnderworldWorldManager::EndPlay(const EEndPlayReason::Type Reason)
{
	if (UGameInstance* GI = UGameplayStatics::GetGameInstance(this))
	{
		if (USceneStateClient* Client = GI->GetSubsystem<USceneStateClient>())
		{
			Client->OnSceneState.RemoveDynamic(this, &AUnderworldWorldManager::HandleSceneState);
		}
	}
	Super::EndPlay(Reason);
}

void AUnderworldWorldManager::HandleSceneState(const FUwSceneState& State)
{
	if (State.Tick == LastTick) { return; }
	LastTick = State.Tick;

	// Sun from time-of-day (0..1 → -90..270 pitch sweep).
	if (Sun)
	{
		const float Pitch = State.TimeOfDay * 360.f - 90.f;
		Sun->SetActorRotation(FRotator(Pitch, 45.f, 0.f));
	}

	if (!*MinionClass) { return; }

	// Reconcile: update/spawn present minions, mark seen.
	TSet<FString> Seen;
	Seen.Reserve(State.Minions.Num());
	for (const FUwMinionState& Ms : State.Minions)
	{
		Seen.Add(Ms.Id);
		AUnderworldMinion* Actor = Minions.FindRef(Ms.Id);
		if (!Actor)
		{
			FActorSpawnParameters Params;
			Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
			Actor = GetWorld()->SpawnActor<AUnderworldMinion>(
				MinionClass, FVector(Ms.Pos.X, Ms.Pos.Y, Ms.Pos.Z) * 100.f, FRotator::ZeroRotator, Params);
			if (Actor) { Minions.Add(Ms.Id, Actor); }
		}
		if (Actor) { Actor->ApplyState(Ms); }
	}

	// Despawn the dead.
	TArray<FString> Dead;
	for (const TPair<FString, AUnderworldMinion*>& Pair : Minions)
	{
		if (!Seen.Contains(Pair.Key)) { Dead.Add(Pair.Key); }
	}
	for (const FString& Id : Dead)
	{
		if (AUnderworldMinion* A = Minions.FindRef(Id)) { A->Destroy(); }
		Minions.Remove(Id);
	}
}
