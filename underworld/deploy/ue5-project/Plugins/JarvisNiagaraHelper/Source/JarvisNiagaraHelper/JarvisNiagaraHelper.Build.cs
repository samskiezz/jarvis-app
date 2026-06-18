// Copyright Jarvis Underworld 2026. Editor-only helper module.

using UnrealBuildTool;

public class JarvisNiagaraHelper : ModuleRules
{
    public JarvisNiagaraHelper(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;
        bUseUnity = false;

        PublicDependencyModuleNames.AddRange(new string[] {
            "Core",
            "CoreUObject",
            "Engine",
        });

        PrivateDependencyModuleNames.AddRange(new string[] {
            "Niagara",
            "NiagaraCore",
            "NiagaraEditor",
            "NiagaraShader",
            "UnrealEd",
            "AssetTools",
            "AssetRegistry",
            "Slate",
            "SlateCore",
            "EditorScriptingUtilities",
            "EditorSubsystem",
            "PythonScriptPlugin",
        });
    }
}
