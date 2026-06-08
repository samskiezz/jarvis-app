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
	/** God-verbs on the minion under the cursor (Book V Part B.3). Bless/Gift are benevolent and
	 *  fire on press; Cull is destructive — bind it to a HOLD trigger so ETriggerEvent::Triggered
	 *  only fires after the hold (the hold IS the confirm the red-team requires). */
	UPROPERTY(EditAnywhere, Category="Input") UInputAction* BlessAction = nullptr;
	UPROPERTY(EditAnywhere, Category="Input") UInputAction* GiftAction = nullptr;
	UPROPERTY(EditAnywhere, Category="Input") UInputAction* CullAction = nullptr;
	/** Possession input context, added on top of the pawn's own (so it works in both modes). */
	UPROPERTY(EditAnywhere, Category="Input") UInputMappingContext* PossessionContext = nullptr;
	UPROPERTY(EditAnywhere, Category="Input") int32 PossessionContextPriority = 1;

	/** How often (s) to re-trace the minion under the reticle for the PresenceField gaze sample. */
	UPROPERTY(EditAnywhere, Category="Input") float ReticleTraceInterval = 0.2f;

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;
	virtual void SetupInputComponent() override;

private:
	void OnPossessPressed(const FInputActionValue& V);
	void OnReleasePressed(const FInputActionValue& V);
	void OnBlessPressed(const FInputActionValue& V);
	void OnGiftPressed(const FInputActionValue& V);
	void OnCullTriggered(const FInputActionValue& V);   // after the hold-to-confirm
	void UpdateReticle();                                // feeds the WorldManager's gaze target
	/** Trace the minion under the cursor; returns its id (empty if none). */
	FString TraceMinionId() const;
	AUnderworldWorldManager* FindWorldManager() const;

	FTimerHandle ReticleTimer;
};
