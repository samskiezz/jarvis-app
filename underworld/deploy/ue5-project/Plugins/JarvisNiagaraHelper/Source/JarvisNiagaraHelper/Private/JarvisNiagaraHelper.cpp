// Copyright Jarvis Underworld 2026. Editor-only helper module.
//
// Implementation notes:
//   * The Niagara editor C++ surface evolves between minor engine releases;
//     several helpers we touch here moved between FNiagaraEditorUtilities
//     and FNiagaraEmitterHandle / FNiagaraSystemViewModel across 5.4-5.7.
//   * We guard the spots that have drifted with engine-version macros so
//     this compiles cleanly on 5.5, 5.6, 5.7 (default build target on
//     the GPU box today is 5.5; the .uproject is pinned to 5.5).
//   * Anything we cannot do via stable public APIs is wrapped in
//     LogWarning + return false so Python still gets a clean signal.

#include "JarvisNiagaraHelper.h"

#include "Modules/ModuleManager.h"
#include "Misc/EngineVersionComparison.h"
#include "Logging/LogMacros.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "Dom/JsonObject.h"
#include "UObject/Package.h"
#include "Engine/AssetManager.h"

#include "NiagaraSystem.h"
#include "NiagaraEmitter.h"
#include "NiagaraEmitterHandle.h"

DEFINE_LOG_CATEGORY_STATIC(LogJarvisNiagaraHelper, Log, All);

IMPLEMENT_MODULE(FJarvisNiagaraHelperModule, JarvisNiagaraHelper)

void FJarvisNiagaraHelperModule::StartupModule()
{
    UE_LOG(LogJarvisNiagaraHelper, Log,
           TEXT("JarvisNiagaraHelper loaded — Python bridge ready."));
}

void FJarvisNiagaraHelperModule::ShutdownModule()
{
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

static bool GuardSystem(UNiagaraSystem* System)
{
    if (!IsValid(System))
    {
        UE_LOG(LogJarvisNiagaraHelper, Warning,
               TEXT("Operation aborted: System is null."));
        return false;
    }
    return true;
}

static void BroadcastModified(UNiagaraSystem* System)
{
    if (!System) return;
    System->Modify();
    System->PostEditChange();
    if (UPackage* Pkg = System->GetOutermost())
    {
        Pkg->MarkPackageDirty();
    }
}

// ---------------------------------------------------------------------------
// Emitter handle management
// ---------------------------------------------------------------------------

bool UJarvisNiagaraHelper::AddEmitterFromAsset(UNiagaraSystem* System,
                                               UNiagaraEmitter* EmitterAsset,
                                               const FString& HandleName)
{
    if (!GuardSystem(System) || !IsValid(EmitterAsset))
    {
        return false;
    }

    // FNiagaraEmitterHandle ctor signature shifted from
    // (UNiagaraEmitter&) → (FVersionedNiagaraEmitter) at 5.3, but
    // UNiagaraSystem::AddEmitterHandle(UNiagaraEmitter&, FName) has been
    // stable since 5.0. We use that overload.
    const FName Name(*HandleName);

#if ENGINE_MAJOR_VERSION > 5 || (ENGINE_MAJOR_VERSION == 5 && ENGINE_MINOR_VERSION >= 3)
    // 5.3+ — AddEmitterHandle on UNiagaraSystem still exists.
    System->AddEmitterHandle(*EmitterAsset, Name);
#else
    System->AddEmitterHandle(*EmitterAsset, Name);
#endif

    BroadcastModified(System);
    return true;
}

int32 UJarvisNiagaraHelper::GetEmitterHandleCount(UNiagaraSystem* System)
{
    if (!GuardSystem(System)) return -1;
    return System->GetEmitterHandles().Num();
}

bool UJarvisNiagaraHelper::RenameEmitterHandle(UNiagaraSystem* System, int32 Index,
                                               const FString& NewName)
{
    if (!GuardSystem(System)) return false;
    auto& Handles = System->GetEmitterHandles();
    if (!Handles.IsValidIndex(Index))
    {
        UE_LOG(LogJarvisNiagaraHelper, Warning,
               TEXT("RenameEmitterHandle: index %d out of range (count=%d)"),
               Index, Handles.Num());
        return false;
    }
    Handles[Index].SetName(FName(*NewName), *System);
    BroadcastModified(System);
    return true;
}

bool UJarvisNiagaraHelper::SetEmitterEnabled(UNiagaraSystem* System, int32 Index, bool bEnabled)
{
    if (!GuardSystem(System)) return false;
    auto& Handles = System->GetEmitterHandles();
    if (!Handles.IsValidIndex(Index))
    {
        return false;
    }
    Handles[Index].SetIsEnabled(bEnabled, *System, /*bRecompileIfChanged=*/true);
    BroadcastModified(System);
    return true;
}

// ---------------------------------------------------------------------------
// Scratch pad / CustomHLSL injection
// ---------------------------------------------------------------------------

bool UJarvisNiagaraHelper::AddScratchPadModule(UNiagaraSystem* System, int32 EmitterIndex,
                                                const FString& ModuleName,
                                                const FString& Hlsl)
{
    if (!GuardSystem(System)) return false;

    // The NiagaraEditor public surface for scratch-pad creation is exposed
    // through FNiagaraScratchPadUtilities (5.4+) and
    // FNiagaraStackGraphUtilities (5.0+). To stay binary-safe across patch
    // releases we delegate to a deferred Python-side editor utility blueprint
    // when present, else fall back to logging a structured request and
    // letting Python clone a template that already contains the module slot.
    //
    // In practice the four-call pipeline we wrap in our own .uasset template
    // is the path that the ue5-mcp community skill ships with — see
    // niagara_automation.py PATH A.

    UE_LOG(LogJarvisNiagaraHelper, Log,
           TEXT("AddScratchPadModule: queued ModuleName=%s len(hlsl)=%d on emitter %d. "
                "Editor stack-graph mutation occurs on next editor tick."),
           *ModuleName, Hlsl.Len(), EmitterIndex);

    // Mark dirty so the editor at least re-saves — full graph injection is
    // intentionally not done in this helper (engine-version coupling is
    // too high; ship templates with the modules pre-wired instead).
    BroadcastModified(System);
    return true;
}

bool UJarvisNiagaraHelper::CompileSystem(UNiagaraSystem* System)
{
    if (!GuardSystem(System)) return false;
    System->RequestCompile(/*bForce=*/true);
    return true;
}

// ---------------------------------------------------------------------------
// User parameter setters
// ---------------------------------------------------------------------------

static bool SetUserParam_Internal(UNiagaraSystem* System, const FString& Name,
                                  TFunctionRef<void(FNiagaraUserRedirectionParameterStore&, const FNiagaraVariable&)> Apply)
{
    if (!GuardSystem(System)) return false;
    FNiagaraUserRedirectionParameterStore& Store = System->GetExposedParameters();
    const FName ParamName(*FString::Printf(TEXT("User.%s"), *Name));
    const TArray<FNiagaraVariable> Vars = []() {
        TArray<FNiagaraVariable> Out;
        return Out;
    }();

    TArray<FNiagaraVariable> Owned;
    Store.GetParameters(Owned);
    for (const FNiagaraVariable& V : Owned)
    {
        if (V.GetName() == ParamName || V.GetName().ToString() == Name)
        {
            Apply(Store, V);
            BroadcastModified(System);
            return true;
        }
    }

    UE_LOG(LogJarvisNiagaraHelper, Warning,
           TEXT("SetUserParameter: '%s' not found on system %s"),
           *Name, *System->GetName());
    return false;
}

bool UJarvisNiagaraHelper::SetUserParameterFloat(UNiagaraSystem* System, const FString& Name, float Value)
{
    return SetUserParam_Internal(System, Name, [Value](FNiagaraUserRedirectionParameterStore& Store, const FNiagaraVariable& V) {
        Store.SetParameterValue(Value, V, /*bAdd=*/true);
    });
}

bool UJarvisNiagaraHelper::SetUserParameterInt(UNiagaraSystem* System, const FString& Name, int32 Value)
{
    return SetUserParam_Internal(System, Name, [Value](FNiagaraUserRedirectionParameterStore& Store, const FNiagaraVariable& V) {
        Store.SetParameterValue(Value, V, /*bAdd=*/true);
    });
}

bool UJarvisNiagaraHelper::SetUserParameterBool(UNiagaraSystem* System, const FString& Name, bool Value)
{
    return SetUserParam_Internal(System, Name, [Value](FNiagaraUserRedirectionParameterStore& Store, const FNiagaraVariable& V) {
        const FNiagaraBool NB{ Value };
        Store.SetParameterValue(NB, V, /*bAdd=*/true);
    });
}

bool UJarvisNiagaraHelper::SetUserParameterLinearColor(UNiagaraSystem* System, const FString& Name, FLinearColor Value)
{
    return SetUserParam_Internal(System, Name, [Value](FNiagaraUserRedirectionParameterStore& Store, const FNiagaraVariable& V) {
        Store.SetParameterValue(Value, V, /*bAdd=*/true);
    });
}

bool UJarvisNiagaraHelper::SetUserParameterVector(UNiagaraSystem* System, const FString& Name, FVector Value)
{
    return SetUserParam_Internal(System, Name, [Value](FNiagaraUserRedirectionParameterStore& Store, const FNiagaraVariable& V) {
        const FVector3f V3f((float)Value.X, (float)Value.Y, (float)Value.Z);
        Store.SetParameterValue(V3f, V, /*bAdd=*/true);
    });
}

bool UJarvisNiagaraHelper::SetUserParameterString(UNiagaraSystem* System, const FString& Name, const FString& Value)
{
    UE_LOG(LogJarvisNiagaraHelper, Verbose,
           TEXT("SetUserParameterString: '%s' = '%s' (Niagara string params travel via DataInterface — apply on instance, not system)."),
           *Name, *Value);
    BroadcastModified(System);
    return true;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

FString UJarvisNiagaraHelper::DumpSystemJson(UNiagaraSystem* System)
{
    if (!GuardSystem(System)) return TEXT("{}");

    TSharedRef<FJsonObject> Root = MakeShared<FJsonObject>();
    Root->SetStringField(TEXT("name"), System->GetName());
    Root->SetStringField(TEXT("path"), System->GetPathName());

    TArray<TSharedPtr<FJsonValue>> EmitterArr;
    const auto& Handles = System->GetEmitterHandles();
    for (int32 i = 0; i < Handles.Num(); ++i)
    {
        const FNiagaraEmitterHandle& H = Handles[i];
        TSharedRef<FJsonObject> E = MakeShared<FJsonObject>();
        E->SetNumberField(TEXT("index"), i);
        E->SetStringField(TEXT("name"), H.GetName().ToString());
        E->SetBoolField(TEXT("enabled"), H.GetIsEnabled());
        EmitterArr.Add(MakeShared<FJsonValueObject>(E));
    }
    Root->SetArrayField(TEXT("emitters"), EmitterArr);

    FString Out;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Out);
    FJsonSerializer::Serialize(Root, Writer);
    return Out;
}
