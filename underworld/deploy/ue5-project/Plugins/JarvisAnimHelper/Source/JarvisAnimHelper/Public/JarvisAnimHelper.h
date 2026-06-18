// Copyright JARVIS. Licensed for in-project use.
//
// Editor subsystem that exposes AnimBP state-machine graph editing to Python
// via BlueprintCallable UFUNCTIONs. Bridge for animbp_automation.py.
//
// Python usage:
//     helper = unreal.JarvisAnimHelper.get()
//     helper.create_state_machine_abp(skeleton, "/Game/Path/ABP_Foo",
//                                     state_anims, transitions)

#pragma once

#include "CoreMinimal.h"
#include "EditorSubsystem.h"
#include "JarvisAnimHelper.generated.h"

class UAnimBlueprint;
class UAnimSequenceBase;
class USkeleton;

USTRUCT(BlueprintType)
struct FJarvisAnimState
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite, Category="Jarvis")
    FName Name;

    UPROPERTY(BlueprintReadWrite, Category="Jarvis")
    UAnimSequenceBase* Anim = nullptr;
};

USTRUCT(BlueprintType)
struct FJarvisAnimTransition
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadWrite, Category="Jarvis")
    FName From;

    UPROPERTY(BlueprintReadWrite, Category="Jarvis")
    FName To;

    // Plain-text rule. Compiled into AnimStateTransitionGraph as an integer
    // compare against the AnimBP's `anim_state` variable.
    UPROPERTY(BlueprintReadWrite, Category="Jarvis")
    FString Rule;
};

UCLASS()
class JARVISANIMHELPER_API UJarvisAnimHelper : public UEditorSubsystem
{
    GENERATED_BODY()

public:
    /** Convenience accessor for Python. */
    UFUNCTION(BlueprintCallable, Category="Jarvis|AnimBP")
    static UJarvisAnimHelper* Get();

    /**
     * Create a brand-new AnimBlueprint with a complete state machine.
     *
     * - Creates the asset at OutPackagePath.
     * - Adds an integer var `anim_state` to the AnimBP.
     * - Builds an AnimStateMachineGraph with one state per `States` entry.
     * - Each state plays the supplied AnimSequence on loop.
     * - For each transition, creates the connection with an integer-equality
     *   rule against `anim_state`.
     * - Compiles and saves the asset.
     *
     * Returns the new UAnimBlueprint or nullptr on failure.
     */
    UFUNCTION(BlueprintCallable, Category="Jarvis|AnimBP")
    UAnimBlueprint* CreateStateMachineABP(
        USkeleton* Skeleton,
        const FString& OutPackagePath,
        const TArray<FJarvisAnimState>& States,
        const TArray<FJarvisAnimTransition>& Transitions
    );

    /**
     * Add an int property to an existing AnimBlueprint at runtime. Used by
     * CreateStateMachineABP but exposed so Python can poke at existing ABPs
     * without recreating them.
     */
    UFUNCTION(BlueprintCallable, Category="Jarvis|AnimBP")
    bool AddIntVariable(UAnimBlueprint* AnimBP, FName VarName,
                        int32 DefaultValue = 0);

    /** Force a Blueprint recompile + save. */
    UFUNCTION(BlueprintCallable, Category="Jarvis|AnimBP")
    bool CompileAndSave(UAnimBlueprint* AnimBP);
};
