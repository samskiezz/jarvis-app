// Copyright Underworld. All Rights Reserved.
//
// AJarvisHudManager — assembles a JARVIS cinematic chamber: reads the JARVIS asset
// manifest (Content/JarvisAssets/manifest.json, by_scene -> anchor -> /Game paths),
// spawns each prop at its named-anchor transform, and applies the holographic master
// material. Mirrors AUnderworldWorldManager's manifest->resolve->spawn pattern, but for
// static scene assembly instead of live minions. Chambers can be swapped at runtime.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "JarvisHudManager.generated.h"

class AStaticMeshActor;
class UStaticMesh;
class UMaterialInterface;

UCLASS()
class UNDERWORLD_API AJarvisHudManager : public AActor
{
	GENERATED_BODY()

public:
	AJarvisHudManager();

	/** Holographic master material applied to every spawned chamber prop. Assign in BP/level. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "JARVIS HUD")
	UMaterialInterface* HolographicMasterMaterial = nullptr;

	/** Chamber loaded on BeginPlay (overridable by -JarvisChamber=<scene_id> on the cmdline). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "JARVIS HUD")
	FString DefaultChamber = TEXT("01_command_atrium");

	/** Spawn all props for the named chamber at their anchor transforms. */
	UFUNCTION(BlueprintCallable, Category = "JARVIS HUD")
	void LoadChamber(const FString& ChamberName);

	/** Destroy the current chamber's props. */
	UFUNCTION(BlueprintCallable, Category = "JARVIS HUD")
	void UnloadChamber();

	UFUNCTION(BlueprintCallable, Category = "JARVIS HUD")
	void GetChamberList(TArray<FString>& OutChambers) const;

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

private:
	void LoadManifest();
	UStaticMesh* ResolveMesh(const FString& GamePath);

	/** Procedural command-center layout: anchor name + index within anchor -> world transform. */
	static FTransform AnchorTransform(const FString& Anchor, int32 IndexInAnchor, int32 CountInAnchor);

	// manifest.json -> by_scene[scene][anchor] = [ "/Game/JarvisAssets/<scene>/<Name>", ... ]
	TSharedPtr<class FJsonObject> ManifestRoot;

	UPROPERTY() TMap<FString, UStaticMesh*> MeshCache;
	UPROPERTY() TArray<AStaticMeshActor*> CurrentChamber;
	FString CurrentChamberName;
};
