// Copyright Underworld. All Rights Reserved.
//
// AUnderworldPlayerController — the creator's input. In the god camera it traces the minion
// under the cursor and possesses it (a click dive into the body, Bible §4.4); a release key
// hands control back to the spectator camera. Possession itself is server-authoritative and
// actor-swapping is done by the WorldManager — this controller just routes the player's verbs.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "UnderworldPlayerController.generated.h"

class UInputAction;
class UInputMappingContext;
struct FInputActionValue;
class AUnderworldWorldManager;

UCLASS()
class UNDERWORLD_API AUnderworldPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	AUnderworldPlayerController();

	/** Click to possess the minion under the cursor (god camera). */
	UPROPERTY(EditAnywhere, Category="Input") UInputAction* PossessAction = nullptr;
	/** Key to release the currently-worn body back to its own AI. */
	UPROPERTY(EditAnywhere, Category="Input") UInputAction* ReleaseAction = nullptr;
	/** Possession input context, added on top of the pawn's own (so it works in both modes). */
	UPROPERTY(EditAnywhere, Category="Input") UInputMappingContext* PossessionContext = nullptr;
	UPROPERTY(EditAnywhere, Category="Input") int32 PossessionContextPriority = 1;

protected:
	virtual void BeginPlay() override;
	virtual void SetupInputComponent() override;

private:
	void OnPossessPressed(const FInputActionValue& V);
	void OnReleasePressed(const FInputActionValue& V);
	AUnderworldWorldManager* FindWorldManager() const;
};
