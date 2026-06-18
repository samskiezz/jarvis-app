// Copyright Underworld. All Rights Reserved.
//
// UMGHelperLibrary
// ----------------
// Editor-only BlueprintFunctionLibrary that fills in the last few WidgetTree
// operations the stock Python API does NOT expose cleanly in UE 5.5 / 5.6 / 5.7:
//
//   * Construct an arbitrary UWidget INTO a WidgetBlueprint's tree (not just
//     into a runtime UUserWidget). The stock unreal.WidgetTree.construct_widget
//     binding works, but you still need C++ to mark the package dirty and to
//     ask Kismet to recompile. Without that, the asset looks empty in the
//     Designer next time it's opened and the generated class is stale.
//   * Set the RootWidget on a WidgetBlueprint's tree (the property is read-only
//     from Python for WidgetBlueprint assets).
//   * Add a child to any UPanelWidget by class+name (so callers don't need to
//     know about CanvasPanelSlot vs VerticalBoxSlot vs OverlaySlot).
//   * Stamp a WidgetBlueprint as structurally modified + force a synchronous
//     recompile so its UWidgetBlueprintGeneratedClass is regenerated.
//   * Save the asset to disk.
//
// All functions are static UFUNCTION(BlueprintCallable) which means Python can
// call them as `unreal.UMGHelperLibrary.construct_widget_in_blueprint(...)`.
//
// References that informed this surface:
//   - https://unreal-garden.com/tutorials/build-widgets-in-editor/
//   - https://forums.unrealengine.com/t/c-adding-widget-to-widgettree-doesnt-update-hierarchy-view-in-editor/361258
//   - https://github.com/20tab/UnrealEnginePython/issues/388 (the working pre-5.0 pattern)

#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "UMGHelperLibrary.generated.h"

class UWidgetBlueprint;
class UWidget;
class UPanelWidget;
class UPanelSlot;

UCLASS()
class JARVISUMGHELPER_API UUMGHelperLibrary : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	/**
	 * Load (or return null) a UWidgetBlueprint asset by package path
	 * (e.g. "/Game/UI/WBP_RootScreen.WBP_RootScreen").
	 */
	UFUNCTION(BlueprintCallable, Category="Jarvis|UMG", meta=(DisplayName="Load Widget Blueprint"))
	static UWidgetBlueprint* LoadWidgetBlueprint(const FString& PackagePath);

	/**
	 * Construct a widget of WidgetClass and inject it into the
	 * WidgetBlueprint's WidgetTree under the optional Parent panel.
	 *
	 * If Parent is null:
	 *   - if the tree has no RootWidget AND WidgetClass derives from UPanelWidget,
	 *     the new widget becomes the RootWidget.
	 *   - otherwise the call fails and returns null.
	 *
	 * If Parent is a UPanelWidget that already lives in this tree, the new
	 * widget is added as a child via UPanelWidget::AddChild.
	 *
	 * The asset is marked structurally modified but NOT saved. Call
	 * RecompileAndSave when the batch is complete.
	 */
	UFUNCTION(BlueprintCallable, Category="Jarvis|UMG", meta=(DisplayName="Construct Widget In Blueprint"))
	static UWidget* ConstructWidgetInBlueprint(
		UWidgetBlueprint* WidgetBlueprint,
		TSubclassOf<UWidget> WidgetClass,
		FName WidgetName,
		UPanelWidget* Parent
	);

	/**
	 * Find a child widget by name anywhere in the WidgetBlueprint's tree.
	 * Returns null if no widget with that name exists. Used by Python to
	 * resolve "Parent" pointers across separate calls.
	 */
	UFUNCTION(BlueprintCallable, Category="Jarvis|UMG", meta=(DisplayName="Find Widget By Name"))
	static UWidget* FindWidgetByName(UWidgetBlueprint* WidgetBlueprint, FName WidgetName);

	/**
	 * Force-set the RootWidget on a WidgetBlueprint's tree. Used when callers
	 * want to swap an existing root for a new panel without re-creating the BP.
	 * Existing children of the old root are NOT re-parented; the caller is
	 * responsible for that.
	 */
	UFUNCTION(BlueprintCallable, Category="Jarvis|UMG", meta=(DisplayName="Set Root Widget"))
	static bool SetRootWidget(UWidgetBlueprint* WidgetBlueprint, UPanelWidget* NewRoot);

	/**
	 * Mark the WidgetBlueprint as structurally modified, kick the Kismet
	 * synchronous compile path, then save the package via the asset
	 * registry. Returns true on success.
	 *
	 * This is the missing step in pure-Python automation — without it the
	 * UWidgetBlueprintGeneratedClass never regenerates and the Designer view
	 * shows an empty hierarchy on next open.
	 */
	UFUNCTION(BlueprintCallable, Category="Jarvis|UMG", meta=(DisplayName="Recompile And Save"))
	static bool RecompileAndSave(UWidgetBlueprint* WidgetBlueprint);

	/**
	 * Create a brand new UWidgetBlueprint asset at PackagePath with the given
	 * ParentClass (usually UUserWidget::StaticClass()) and an empty CanvasPanel
	 * as its root. The asset is NOT saved — the caller decides when.
	 */
	UFUNCTION(BlueprintCallable, Category="Jarvis|UMG", meta=(DisplayName="Create Widget Blueprint Asset"))
	static UWidgetBlueprint* CreateWidgetBlueprintAsset(
		const FString& PackagePath,
		const FString& AssetName,
		TSubclassOf<UUserWidget> ParentClass
	);
};
