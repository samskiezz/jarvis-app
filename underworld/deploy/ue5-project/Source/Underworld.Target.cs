// Copyright Underworld. All Rights Reserved.
//
// Game build target for the Underworld pixel-streaming runtime (UE 5.4).
// This is the standalone/packaged build that gets launched headless by the
// pixel-streaming deploy. It pulls in the primary "Underworld" game module.

using UnrealBuildTool;
using System.Collections.Generic;

public class UnderworldTarget : TargetRules
{
	public UnderworldTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;

		// Standard UE5.4 build/include settings.
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_4;

		ExtraModuleNames.AddRange(new string[] { "Underworld" });
	}
}
