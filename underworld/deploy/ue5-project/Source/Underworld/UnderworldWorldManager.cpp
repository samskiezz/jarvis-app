// Copyright Underworld. All Rights Reserved.
#include "UnderworldWorldManager.h"
#include "UnderworldMinion.h"
#include "UnderworldPlayableMinion.h"
#include "SceneStateClient.h"
#include "Engine/DirectionalLight.h"
#include "Components/DirectionalLightComponent.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/StaticMeshActor.h"
#include "Engine/StaticMesh.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "TimerManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

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

	// Build the φ/fractal city by streaming chunks around the camera.
	LoadManifest();
	if (UWorld* W = GetWorld())
	{
		W->GetTimerManager().SetTimer(StreamTimer, this, &AUnderworldWorldManager::UpdateStreaming,
			FMath::Max(0.25f, StreamIntervalSeconds), true, 0.5f);
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
	if (UWorld* W = GetWorld()) { W->GetTimerManager().ClearTimer(StreamTimer); }
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

		// The body the LOCAL player is wearing is rendered by the player-controlled ACharacter,
		// not the lightweight crowd actor — feed the character state and skip the crowd pooling
		// (so it isn't double-rendered). Anim/guild update; movement is player-driven there.
		if (Ms.Id == PossessedId)
		{
			if (PossessedActor) { PossessedActor->ApplyState(Ms); }
			continue;
		}

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

// ── world streaming ────────────────────────────────────────────────────────────────

void AUnderworldWorldManager::LoadManifest()
{
	// glb-url -> /Game asset path, written by Scripts/import_glbs.py and staged into the
	// .pak (Content/UnderworldAssets/manifest.json). Single source of truth — no path guessing.
	const FString Path = FPaths::ProjectContentDir() / TEXT("UnderworldAssets/manifest.json");
	FString Body;
	if (!FFileHelper::LoadFileToString(Body, *Path))
	{
		UE_LOG(LogTemp, Warning, TEXT("[Underworld] manifest not found at %s — buildings will be skipped"), *Path);
		return;
	}
	TSharedPtr<FJsonObject> Root;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Body);
	if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) { return; }
	const TSharedPtr<FJsonObject>* ByUrl = nullptr;
	if (Root->TryGetObjectField(TEXT("by_url"), ByUrl) && ByUrl)
	{
		for (const auto& Pair : (*ByUrl)->Values)
		{
			UrlToAsset.Add(Pair.Key, Pair.Value->AsString());
		}
	}
	UE_LOG(LogTemp, Display, TEXT("[Underworld] manifest loaded: %d glb->asset mappings"), UrlToAsset.Num());
}

UStaticMesh* AUnderworldWorldManager::ResolveMesh(const FString& GlbUrl)
{
	const FString* AssetPath = UrlToAsset.Find(GlbUrl);
	if (!AssetPath) { return nullptr; }                 // not imported / unknown
	if (UStaticMesh** Cached = MeshCache.Find(*AssetPath)) { return *Cached; }

	// "/Game/UnderworldAssets/<cat>/<Name>" -> object "<path>.<Name>"
	FString ObjPath = *AssetPath;
	FString Name;
	ObjPath.Split(TEXT("/"), nullptr, &Name, ESearchCase::IgnoreCase, ESearchDir::FromEnd);
	const FString Full = FString::Printf(TEXT("%s.%s"), **AssetPath, *Name);
	UStaticMesh* Mesh = Cast<UStaticMesh>(StaticLoadObject(UStaticMesh::StaticClass(), nullptr, *Full));
	MeshCache.Add(*AssetPath, Mesh);                    // cache even null to avoid retry storms
	return Mesh;
}

bool AUnderworldWorldManager::GetCameraChunk(FIntPoint& Out) const
{
	APawn* Pawn = UGameplayStatics::GetPlayerPawn(this, 0);
	if (!Pawn) { return false; }
	const FVector L = Pawn->GetActorLocation();
	const float ChunkUU = ChunkSize * WorldScale;       // backend metres -> UE cm
	Out = FIntPoint(FMath::FloorToInt(L.X / ChunkUU), FMath::FloorToInt(L.Y / ChunkUU));
	return true;
}

void AUnderworldWorldManager::UpdateStreaming()
{
	FIntPoint Cam;
	if (!GetCameraChunk(Cam)) { return; }

	USceneStateClient* Client = nullptr;
	if (UGameInstance* GI = UGameplayStatics::GetGameInstance(this))
	{
		Client = GI->GetSubsystem<USceneStateClient>();
	}
	if (!Client) { return; }

	// request the ring around the camera that isn't loaded / in flight
	for (int32 dx = -ChunkRadius; dx <= ChunkRadius; ++dx)
	{
		for (int32 dz = -ChunkRadius; dz <= ChunkRadius; ++dz)
		{
			const FIntPoint Key(Cam.X + dx, Cam.Y + dz);
			if (ChunkActors.Contains(Key) || PendingChunks.Contains(Key)) { continue; }
			PendingChunks.Add(Key);
			TWeakObjectPtr<AUnderworldWorldManager> WeakThis(this);
			Client->FetchChunk(Key.X, Key.Y, [WeakThis](const FUwChunk& Chunk)
			{
				if (WeakThis.IsValid()) { WeakThis->SpawnChunk(Chunk); }
			});
		}
	}

	// despawn chunks outside the (radius + 1) keep-zone
	TArray<FIntPoint> ToRemove;
	for (const auto& Pair : ChunkActors)
	{
		if (FMath::Abs(Pair.Key.X - Cam.X) > ChunkRadius + 1 ||
			FMath::Abs(Pair.Key.Y - Cam.Y) > ChunkRadius + 1)
		{
			ToRemove.Add(Pair.Key);
		}
	}
	for (const FIntPoint& Key : ToRemove) { DespawnChunk(Key); }
}

void AUnderworldWorldManager::SpawnChunk(const FUwChunk& Chunk)
{
	const FIntPoint Key(Chunk.Cx, Chunk.Cz);
	PendingChunks.Remove(Key);
	if (ChunkActors.Contains(Key)) { return; }          // raced — already built

	UWorld* W = GetWorld();
	if (!W) { return; }

	TArray<TWeakObjectPtr<AStaticMeshActor>>& Actors = ChunkActors.Add(Key);
	Actors.Reserve(Chunk.Structures.Num());
	int32 Placed = 0;
	for (const FUwStructure& S : Chunk.Structures)
	{
		UStaticMesh* Mesh = ResolveMesh(S.GlbUrl);
		if (!Mesh) { continue; }

		const FVector Loc(S.Pos.X * WorldScale, S.Pos.Z * WorldScale, S.Pos.Y * WorldScale); // backend (x,y up,z) -> UE (x,y,z up)
		const FRotator Rot(0.f, S.RotY, 0.f);
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
		AStaticMeshActor* A = W->SpawnActor<AStaticMeshActor>(AStaticMeshActor::StaticClass(), Loc, Rot, Params);
		if (!A) { continue; }
		A->SetMobility(EComponentMobility::Movable);   // runtime-spawned; Lumen gives dynamic GI
		if (UStaticMeshComponent* C = A->GetStaticMeshComponent())
		{
			C->SetStaticMesh(Mesh);
			C->SetWorldScale3D(FVector(S.Scale));
		}
		Actors.Add(A);
		++Placed;
	}
	UE_LOG(LogTemp, Verbose, TEXT("[Underworld] chunk (%d,%d): placed %d/%d structures"),
		Chunk.Cx, Chunk.Cz, Placed, Chunk.Structures.Num());
}

void AUnderworldWorldManager::DespawnChunk(const FIntPoint& Key)
{
	if (TArray<TWeakObjectPtr<AStaticMeshActor>>* Actors = ChunkActors.Find(Key))
	{
		for (const TWeakObjectPtr<AStaticMeshActor>& A : *Actors)
		{
			if (A.IsValid()) { A->Destroy(); }
		}
	}
	ChunkActors.Remove(Key);
}

// ── OVERRIDE PILLAR: possession (Bible §4.4) ─────────────────────────────────────────

void AUnderworldWorldManager::RequestPossess(const FString& MinionId)
{
	if (MinionId.IsEmpty() || MinionId == PossessedId) { return; }
	if (!*PlayableMinionClass)
	{
		UE_LOG(LogTemp, Warning, TEXT("[Underworld] PlayableMinionClass not set — cannot possess"));
		return;
	}
	USceneStateClient* Client = nullptr;
	if (UGameInstance* GI = UGameplayStatics::GetGameInstance(this))
	{
		Client = GI->GetSubsystem<USceneStateClient>();
	}
	if (!Client) { return; }

	// release any current possession first (one body at a time), then ask the server.
	if (!PossessedId.IsEmpty()) { ReleasePossession(); }

	TWeakObjectPtr<AUnderworldWorldManager> WeakThis(this);
	const FString Id = MinionId;
	Client->PostPossess(Id, /*bPossess=*/true, [WeakThis, Id](bool bOk)
	{
		if (bOk && WeakThis.IsValid()) { WeakThis->FinishPossess(Id); }
	});
}

void AUnderworldWorldManager::FinishPossess(const FString& MinionId)
{
	UWorld* W = GetWorld();
	if (!W || !*PlayableMinionClass) { return; }

	// spawn the player body at the crowd actor's current transform (seamless hand-off), then
	// remove the crowd actor so the minion isn't double-rendered.
	FVector  Loc = FVector::ZeroVector;
	FRotator Rot = FRotator::ZeroRotator;
	if (AUnderworldMinion* Crowd = Minions.FindRef(MinionId))
	{
		Loc = Crowd->GetActorLocation();
		Rot = Crowd->GetActorRotation();
		Crowd->Destroy();
		Minions.Remove(MinionId);
	}

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;
	PossessedActor = W->SpawnActor<AUnderworldPlayableMinion>(PlayableMinionClass, Loc, Rot, Params);
	if (!PossessedActor) { return; }
	PossessedId = MinionId;

	if (APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0))
	{
		SpectatorPawn = PC->GetPawn();           // remember the god camera to restore on release
		PC->Possess(PossessedActor);             // dive into the body — input now drives it
	}
	UE_LOG(LogTemp, Display, TEXT("[Underworld] possessed minion %s"), *MinionId);
}

void AUnderworldWorldManager::ReleasePossession()
{
	if (PossessedId.IsEmpty()) { return; }

	if (USceneStateClient* Client = UGameplayStatics::GetGameInstance(this)
			? UGameplayStatics::GetGameInstance(this)->GetSubsystem<USceneStateClient>() : nullptr)
	{
		Client->PostPossess(PossessedId, /*bPossess=*/false, nullptr);
	}

	SpectateAgain();                              // hand control back to the god camera
	if (PossessedActor) { PossessedActor->Destroy(); PossessedActor = nullptr; }
	UE_LOG(LogTemp, Display, TEXT("[Underworld] released minion %s"), *PossessedId);
	PossessedId.Empty();                          // crowd actor reappears on the next scene-state
}

void AUnderworldWorldManager::SpectateAgain()
{
	if (APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0))
	{
		if (SpectatorPawn.IsValid()) { PC->Possess(SpectatorPawn.Get()); }
	}
}
