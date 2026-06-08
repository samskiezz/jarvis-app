// Copyright Underworld. All Rights Reserved.

#include "JarvisHudManager.h"
#include "Engine/StaticMeshActor.h"
#include "Engine/StaticMesh.h"
#include "Components/StaticMeshComponent.h"
#include "Materials/MaterialInterface.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

AJarvisHudManager::AJarvisHudManager()
{
	PrimaryActorTick.bCanEverTick = false;
}

void AJarvisHudManager::BeginPlay()
{
	Super::BeginPlay();
	LoadManifest();

	FString Chamber = DefaultChamber;
	FString Cmd;
	if (FParse::Value(FCommandLine::Get(), TEXT("-JarvisChamber="), Cmd) && !Cmd.IsEmpty())
	{
		Chamber = Cmd;
	}
	LoadChamber(Chamber);
}

void AJarvisHudManager::EndPlay(const EEndPlayReason::Type Reason)
{
	UnloadChamber();
	Super::EndPlay(Reason);
}

void AJarvisHudManager::LoadManifest()
{
	const FString Path = FPaths::ProjectContentDir() / TEXT("JarvisAssets/manifest.json");
	FString Body;
	if (!FFileHelper::LoadFileToString(Body, *Path))
	{
		UE_LOG(LogTemp, Warning, TEXT("[JarvisHud] manifest not found: %s"), *Path);
		return;
	}
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Body);
	if (!FJsonSerializer::Deserialize(Reader, ManifestRoot) || !ManifestRoot.IsValid())
	{
		UE_LOG(LogTemp, Warning, TEXT("[JarvisHud] manifest parse failed"));
		return;
	}
	const TSharedPtr<FJsonObject>* ByScene;
	int32 SceneCount = 0;
	if (ManifestRoot->TryGetObjectField(TEXT("by_scene"), ByScene))
	{
		SceneCount = (*ByScene)->Values.Num();
	}
	UE_LOG(LogTemp, Display, TEXT("[JarvisHud] manifest loaded: %d scenes"), SceneCount);
}

UStaticMesh* AJarvisHudManager::ResolveMesh(const FString& GamePath)
{
	if (UStaticMesh** Cached = MeshCache.Find(GamePath))
	{
		return *Cached;
	}
	UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *GamePath);
	if (Mesh)
	{
		MeshCache.Add(GamePath, Mesh);
	}
	else
	{
		UE_LOG(LogTemp, Warning, TEXT("[JarvisHud] failed to load mesh: %s"), *GamePath);
	}
	return Mesh;
}

// Procedural command-center layout. Anchor prefix decides the zone; index within the
// anchor stacks/spreads multiple props so a chamber reads like the locked render.
FTransform AJarvisHudManager::AnchorTransform(const FString& Anchor, int32 Idx, int32 Count)
{
	FString Prefix = Anchor;
	int32 Dot;
	if (Anchor.FindChar('.', Dot))
	{
		Prefix = Anchor.Left(Dot);
	}
	const float Spread = (Count > 1) ? (Idx - (Count - 1) * 0.5f) : 0.f;
	FVector Loc = FVector::ZeroVector;
	FRotator Rot = FRotator::ZeroRotator;
	float Scale = 1.f;

	if (Prefix == TEXT("hero"))            { Loc = FVector(0.f, 0.f, 170.f);                 Scale = 2.4f; }
	else if (Prefix == TEXT("center"))     { Loc = FVector(Spread * 130.f, 300.f, 120.f);     Scale = 1.1f; }
	else if (Prefix == TEXT("left"))       { Loc = FVector(-470.f, Spread * 40.f, 70.f + Idx * 65.f); Rot = FRotator(0.f, 32.f, 0.f); Scale = 0.85f; }
	else if (Prefix == TEXT("right"))      { Loc = FVector(470.f, Spread * 40.f, 70.f + Idx * 65.f);  Rot = FRotator(0.f, -32.f, 0.f); Scale = 0.85f; }
	else if (Prefix == TEXT("floor"))      { Loc = FVector(Spread * 170.f, 140.f, 2.f);       Scale = 0.9f; }
	else if (Prefix == TEXT("status"))     { Loc = FVector(390.f, -280.f, 250.f);             Scale = 0.7f; }
	else /* bottom */                      { Loc = FVector(Spread * 150.f, -320.f, 45.f);     Scale = 0.75f; }

	return FTransform(Rot, Loc, FVector(Scale));
}

void AJarvisHudManager::LoadChamber(const FString& ChamberName)
{
	UnloadChamber();
	if (!ManifestRoot.IsValid())
	{
		LoadManifest();
		if (!ManifestRoot.IsValid()) { return; }
	}

	const TSharedPtr<FJsonObject>* ByScene;
	if (!ManifestRoot->TryGetObjectField(TEXT("by_scene"), ByScene)) { return; }

	const TSharedPtr<FJsonObject>* Chamber;
	if (!(*ByScene)->TryGetObjectField(ChamberName, Chamber))
	{
		UE_LOG(LogTemp, Warning, TEXT("[JarvisHud] chamber not in manifest: %s"), *ChamberName);
		return;
	}

	UWorld* World = GetWorld();
	int32 Spawned = 0;
	for (const auto& AnchorPair : (*Chamber)->Values)
	{
		const FString& Anchor = AnchorPair.Key;
		const TArray<TSharedPtr<FJsonValue>>* Paths;
		if (!AnchorPair.Value->TryGetArray(Paths)) { continue; }

		const FTransform Base = GetActorTransform();
		const int32 Count = Paths->Num();
		for (int32 i = 0; i < Count; ++i)
		{
			const FString GamePath = (*Paths)[i]->AsString();
			UStaticMesh* Mesh = ResolveMesh(GamePath);
			if (!Mesh) { continue; }

			const FTransform Local = AnchorTransform(Anchor, i, Count);
			const FTransform World3D = Local * Base;

			FActorSpawnParameters Params;
			Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
			AStaticMeshActor* Actor = World->SpawnActor<AStaticMeshActor>(
				AStaticMeshActor::StaticClass(), World3D.GetLocation(), World3D.Rotator(), Params);
			if (!Actor) { continue; }

			Actor->SetMobility(EComponentMobility::Movable);
			Actor->SetActorScale3D(World3D.GetScale3D());
			UStaticMeshComponent* Comp = Actor->GetStaticMeshComponent();
			Comp->SetStaticMesh(Mesh);
			if (HolographicMasterMaterial)
			{
				const int32 NumMats = Comp->GetNumMaterials();
				for (int32 m = 0; m < NumMats; ++m)
				{
					Comp->SetMaterial(m, HolographicMasterMaterial);
				}
			}
			CurrentChamber.Add(Actor);
			++Spawned;
		}
	}
	CurrentChamberName = ChamberName;
	UE_LOG(LogTemp, Display, TEXT("[JarvisHud] chamber '%s' assembled: %d props"), *ChamberName, Spawned);
}

void AJarvisHudManager::UnloadChamber()
{
	for (AStaticMeshActor* Actor : CurrentChamber)
	{
		if (IsValid(Actor)) { Actor->Destroy(); }
	}
	CurrentChamber.Empty();
	CurrentChamberName.Empty();
}

void AJarvisHudManager::GetChamberList(TArray<FString>& OutChambers) const
{
	if (!ManifestRoot.IsValid()) { return; }
	const TSharedPtr<FJsonObject>* ByScene;
	if (!ManifestRoot->TryGetObjectField(TEXT("by_scene"), ByScene)) { return; }
	for (const auto& Pair : (*ByScene)->Values)
	{
		OutChambers.Add(Pair.Key);
	}
}
