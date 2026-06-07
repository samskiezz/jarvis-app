// Copyright Underworld. All Rights Reserved.
//
// AUnderworldWorldManager — subscribes to the SceneStateClient and reconciles the
// rendered world with each tick: spawns a minion actor for each new id, updates
// existing ones, and despawns the dead. Also drives the directional sun (time-of-day)
// and a sky/weather hook. Drop one instance in the Underworld level.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SceneStateTypes.h"
#include "UnderworldWorldManager.generated.h"

class AUnderworldMinion;
class ADirectionalLight;

UCLASS()
class UNDERWORLD_API AUnderworldWorldManager : public AActor
{
	GENERATED_BODY()

public:
	AUnderworldWorldManager();

	/** BP_Minion class to spawn (assign in the level — has the skeletal mesh + AnimBP). */
	UPROPERTY(EditAnywhere, Category="Underworld") TSubclassOf<AUnderworldMinion> MinionClass;

	/** The level's sun, rotated by scene-state time-of-day. */
	UPROPERTY(EditAnywhere, Category="Underworld") ADirectionalLight* Sun = nullptr;

	UFUNCTION() void HandleSceneState(const FUwSceneState& State);

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

private:
	UPROPERTY() TMap<FString, AUnderworldMinion*> Minions;
	int64 LastTick = -1;
};
