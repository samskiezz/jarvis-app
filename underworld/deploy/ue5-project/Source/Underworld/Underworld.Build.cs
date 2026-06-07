// Copyright Underworld. All Rights Reserved.
//
// Build rules for the primary "Underworld" runtime module (UE 5.4/5.5).
// Pulls in HTTP + Json for the scene-state poller, EnhancedInput for the camera,
// and PixelStreaming so the headless build can stream to the browser.

using UnrealBuildTool;

public class Underworld : ModuleRules
{
	public Underworld(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"EnhancedInput",
			"HTTP",          // SceneStateClient polls the backend
			"Json",          // parse the scene-state contract
			"JsonUtilities",
			"UMG",           // optional in-engine HUD overlay
			"PixelStreaming" // expose the stream + receive input
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"Slate",
			"SlateCore"
		});
	}
}
