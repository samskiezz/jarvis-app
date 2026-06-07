// Copyright Underworld. All Rights Reserved.
//
// Editor build target for the Underworld project (UE 5.4). Used when opening
// the project in the UE5 editor and for editor-tooling builds.

using UnrealBuildTool;
using System.Collections.Generic;

public class UnderworldEditorTarget : TargetRules
{
	public UnderworldEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;

		// Standard UE5.4 build/include settings.
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_4;

		ExtraModuleNames.AddRange(new string[] { "Underworld" });
	}
}
