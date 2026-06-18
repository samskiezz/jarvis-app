// Copyright JARVIS. Licensed for in-project use.

using UnrealBuildTool;

public class JarvisAnimHelper : ModuleRules
{
    public JarvisAnimHelper(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new string[]
        {
            "Core",
            "CoreUObject",
            "Engine",
            "UnrealEd",
            "AnimGraph",
            "AnimGraphRuntime",
            "BlueprintGraph",
            "AssetTools",
            "AssetRegistry",
            "Kismet",
            "KismetCompiler",
            "EditorSubsystem",
        });

        PrivateDependencyModuleNames.AddRange(new string[]
        {
            "Slate",
            "SlateCore",
            "EditorStyle",
            "GraphEditor",
            "PropertyEditor",
            "ToolMenus",
        });
    }
}
