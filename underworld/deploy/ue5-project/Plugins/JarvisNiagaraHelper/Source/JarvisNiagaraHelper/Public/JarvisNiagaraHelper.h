// Copyright Jarvis Underworld 2026. Editor-only helper module.
#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleInterface.h"
#include "EditorSubsystem.h"
#include "Math/Color.h"
#include "Math/Vector.h"
#include "JarvisNiagaraHelper.generated.h"

class UNiagaraSystem;
class UNiagaraEmitter;

/**
 * Editor module shell — the real work lives on UJarvisNiagaraHelper.
 */
class FJarvisNiagaraHelperModule : public IModuleInterface
{
public:
    virtual void StartupModule() override;
    virtual void ShutdownModule() override;
};

/**
 * Editor subsystem exposing FNiagaraEditorModule operations to Python and
 * Blueprints. UE 5.5 / 5.7 / 5.8 compatible.
 *
 * Surfaced in Python as `unreal.JarvisNiagaraHelper` (auto-binding by
 * `meta = (ScriptName = "JarvisNiagaraHelper")` on the methods).
 *
 * The PythonScriptPlugin's auto-binding generator picks up any
 * UFUNCTION(BlueprintCallable) on a UCLASS that itself is UCLASS-tagged
 * with `meta=(ScriptName="...")`, so all these names resolve as
 * `unreal.JarvisNiagaraHelper.add_emitter_from_asset(...)` etc.
 */
UCLASS(BlueprintType, meta = (ScriptName = "JarvisNiagaraHelper"))
class JARVISNIAGARAHELPER_API UJarvisNiagaraHelper : public UEditorSubsystem
{
    GENERATED_BODY()

public:
    // ------------------------------------------------------------------
    // Emitter handle management
    // ------------------------------------------------------------------

    /** Append an emitter onto a system. Returns true on success. */
    UFUNCTION(BlueprintCallable, CallInEditor, Category = "Jarvis FX|Niagara",
              meta = (ScriptMethod, DisplayName = "Add Emitter From Asset"))
    static bool AddEmitterFromAsset(UNiagaraSystem* System,
                                    UNiagaraEmitter* EmitterAsset,
                                    const FString& HandleName);

    /** Returns the number of emitter handles on a system. */
    UFUNCTION(BlueprintCallable, CallInEditor, Category = "Jarvis FX|Niagara",
              meta = (ScriptMethod, DisplayName = "Get Emitter Handle Count"))
    static int32 GetEmitterHandleCount(UNiagaraSystem* System);

    /** Renames the emitter handle at `Index`. */
    UFUNCTION(BlueprintCallable, CallInEditor, Category = "Jarvis FX|Niagara",
              meta = (ScriptMethod, DisplayName = "Rename Emitter Handle"))
    static bool RenameEmitterHandle(UNiagaraSystem* System, int32 Index,
                                    const FString& NewName);

    /** Enable/disable an emitter handle. */
    UFUNCTION(BlueprintCallable, CallInEditor, Category = "Jarvis FX|Niagara",
              meta = (ScriptMethod, DisplayName = "Set Emitter Enabled"))
    static bool SetEmitterEnabled(UNiagaraSystem* System, int32 Index, bool bEnabled);

    // ------------------------------------------------------------------
    // Scratch-pad / CustomHLSL module injection
    // ------------------------------------------------------------------

    /**
     * Inject a CustomHLSL scratch-pad module onto an emitter's particle
     * update stack. Returns true if the module was created and compiled.
     *
     * This is the route a generative AI agent uses to author novel
     * behaviours from Python without hand-authoring graphs.
     */
    UFUNCTION(BlueprintCallable, CallInEditor, Category = "Jarvis FX|Niagara",
              meta = (ScriptMethod, DisplayName = "Add Scratch Pad Module"))
    static bool AddScratchPadModule(UNiagaraSystem* System, int32 EmitterIndex,
                                    const FString& ModuleName,
                                    const FString& Hlsl);

    /** Force a full system compile + post-edit-change broadcast. */
    UFUNCTION(BlueprintCallable, CallInEditor, Category = "Jarvis FX|Niagara",
              meta = (ScriptMethod, DisplayName = "Compile System"))
    static bool CompileSystem(UNiagaraSystem* System);

    // ------------------------------------------------------------------
    // User-parameter setters (typed)
    // ------------------------------------------------------------------

    UFUNCTION(BlueprintCallable, CallInEditor, Category = "Jarvis FX|Niagara",
              meta = (ScriptMethod, DisplayName = "Set User Parameter (Float)"))
    static bool SetUserParameterFloat(UNiagaraSystem* System, const FString& Name, float Value);

    UFUNCTION(BlueprintCallable, CallInEditor, Category = "Jarvis FX|Niagara",
              meta = (ScriptMethod, DisplayName = "Set User Parameter (Int)"))
    static bool SetUserParameterInt(UNiagaraSystem* System, const FString& Name, int32 Value);

    UFUNCTION(BlueprintCallable, CallInEditor, Category = "Jarvis FX|Niagara",
              meta = (ScriptMethod, DisplayName = "Set User Parameter (Bool)"))
    static bool SetUserParameterBool(UNiagaraSystem* System, const FString& Name, bool Value);

    UFUNCTION(BlueprintCallable, CallInEditor, Category = "Jarvis FX|Niagara",
              meta = (ScriptMethod, DisplayName = "Set User Parameter (LinearColor)"))
    static bool SetUserParameterLinearColor(UNiagaraSystem* System, const FString& Name, FLinearColor Value);

    UFUNCTION(BlueprintCallable, CallInEditor, Category = "Jarvis FX|Niagara",
              meta = (ScriptMethod, DisplayName = "Set User Parameter (Vector)"))
    static bool SetUserParameterVector(UNiagaraSystem* System, const FString& Name, FVector Value);

    UFUNCTION(BlueprintCallable, CallInEditor, Category = "Jarvis FX|Niagara",
              meta = (ScriptMethod, DisplayName = "Set User Parameter (String)"))
    static bool SetUserParameterString(UNiagaraSystem* System, const FString& Name, const FString& Value);

    // ------------------------------------------------------------------
    // Diagnostics
    // ------------------------------------------------------------------

    /** Returns a JSON blob describing the system's emitters and stacks. */
    UFUNCTION(BlueprintCallable, CallInEditor, Category = "Jarvis FX|Niagara",
              meta = (ScriptMethod, DisplayName = "Dump System Json"))
    static FString DumpSystemJson(UNiagaraSystem* System);
};
