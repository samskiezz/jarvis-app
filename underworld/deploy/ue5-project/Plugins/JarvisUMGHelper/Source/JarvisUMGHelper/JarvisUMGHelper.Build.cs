// Copyright Underworld. All Rights Reserved.
//
// Editor-only module that exposes WidgetTree mutation helpers to Python/Blueprints.
// Depends on UMGEditor + UnrealEd because we mark the WidgetBlueprint as
// structurally modified after we mutate its tree (without this the Designer
// view never refreshes and the BP never recompiles its generated class).

using UnrealBuildTool;

public class JarvisUMGHelper : ModuleRules
{
	public JarvisUMGHelper(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"UMG"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"Slate",
			"SlateCore",
			"UnrealEd",
			"UMGEditor",
			"BlueprintGraph",
			"Kismet",
			"KismetCompiler",
			"AssetTools",
			"AssetRegistry",
			"EditorScriptingUtilities",
			"EditorSubsystem"
		});
	}
}
