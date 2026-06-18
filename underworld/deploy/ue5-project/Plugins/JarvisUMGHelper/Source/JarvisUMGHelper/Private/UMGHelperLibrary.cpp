// Copyright Underworld. All Rights Reserved.
#include "UMGHelperLibrary.h"

#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetToolsModule.h"
#include "Blueprint/UserWidget.h"
#include "Blueprint/WidgetTree.h"
#include "Components/CanvasPanel.h"
#include "Components/PanelWidget.h"
#include "Components/Widget.h"
#include "Editor.h"
#include "FileHelpers.h"
#include "Kismet2/BlueprintEditorUtils.h"
#include "Kismet2/KismetEditorUtilities.h"
#include "PackageTools.h"
#include "UObject/Package.h"
#include "UObject/SavePackage.h"
#include "WidgetBlueprint.h"
#include "WidgetBlueprintFactory.h"

UWidgetBlueprint* UUMGHelperLibrary::LoadWidgetBlueprint(const FString& PackagePath)
{
	if (PackagePath.IsEmpty())
	{
		return nullptr;
	}
	UObject* Loaded = StaticLoadObject(UWidgetBlueprint::StaticClass(), nullptr, *PackagePath);
	return Cast<UWidgetBlueprint>(Loaded);
}

UWidget* UUMGHelperLibrary::ConstructWidgetInBlueprint(
	UWidgetBlueprint* WidgetBlueprint,
	TSubclassOf<UWidget> WidgetClass,
	FName WidgetName,
	UPanelWidget* Parent)
{
	if (!WidgetBlueprint || !WidgetClass || !WidgetBlueprint->WidgetTree)
	{
		return nullptr;
	}

	UWidgetTree* Tree = WidgetBlueprint->WidgetTree;
	Tree->Modify();
	WidgetBlueprint->Modify();

	// Make sure name is unique within the tree.
	FName UseName = WidgetName;
	if (UseName == NAME_None || FindWidgetByName(WidgetBlueprint, UseName) != nullptr)
	{
		const FString Base = (UseName == NAME_None) ? WidgetClass->GetName() : UseName.ToString();
		int32 Suffix = 0;
		do
		{
			UseName = FName(*FString::Printf(TEXT("%s_%d"), *Base, ++Suffix));
		} while (FindWidgetByName(WidgetBlueprint, UseName) != nullptr);
	}

	UWidget* NewWidget = Tree->ConstructWidget<UWidget>(WidgetClass, UseName);
	if (!NewWidget)
	{
		return nullptr;
	}

	if (Parent)
	{
		Parent->Modify();
		UPanelSlot* Slot = Parent->AddChild(NewWidget);
		if (!Slot)
		{
			// AddChild can refuse (e.g. CanvasPanel full, type mismatch). Caller
			// should pick a different parent; we leave the widget orphaned in
			// the tree rather than crash.
			UE_LOG(LogTemp, Warning, TEXT("[JarvisUMG] AddChild returned null for %s under %s"),
				*NewWidget->GetName(), *Parent->GetName());
		}
	}
	else if (Tree->RootWidget == nullptr && WidgetClass->IsChildOf(UPanelWidget::StaticClass()))
	{
		Tree->RootWidget = NewWidget;
	}
	else if (Tree->RootWidget == nullptr)
	{
		UE_LOG(LogTemp, Warning, TEXT("[JarvisUMG] Refusing to set non-panel %s as RootWidget"),
			*NewWidget->GetName());
		return nullptr;
	}

	FBlueprintEditorUtils::MarkBlueprintAsStructurallyModified(WidgetBlueprint);
	return NewWidget;
}

UWidget* UUMGHelperLibrary::FindWidgetByName(UWidgetBlueprint* WidgetBlueprint, FName WidgetName)
{
	if (!WidgetBlueprint || !WidgetBlueprint->WidgetTree)
	{
		return nullptr;
	}
	return WidgetBlueprint->WidgetTree->FindWidget(WidgetName);
}

bool UUMGHelperLibrary::SetRootWidget(UWidgetBlueprint* WidgetBlueprint, UPanelWidget* NewRoot)
{
	if (!WidgetBlueprint || !WidgetBlueprint->WidgetTree || !NewRoot)
	{
		return false;
	}
	WidgetBlueprint->WidgetTree->Modify();
	WidgetBlueprint->WidgetTree->RootWidget = NewRoot;
	FBlueprintEditorUtils::MarkBlueprintAsStructurallyModified(WidgetBlueprint);
	return true;
}

bool UUMGHelperLibrary::RecompileAndSave(UWidgetBlueprint* WidgetBlueprint)
{
	if (!WidgetBlueprint)
	{
		return false;
	}

	FKismetEditorUtilities::CompileBlueprint(WidgetBlueprint);

	UPackage* Package = WidgetBlueprint->GetOutermost();
	if (!Package)
	{
		return false;
	}
	Package->MarkPackageDirty();

	const FString PackageFilename = FPackageName::LongPackageNameToFilename(
		Package->GetName(), FPackageName::GetAssetPackageExtension());

	FSavePackageArgs SaveArgs;
	SaveArgs.TopLevelFlags = RF_Public | RF_Standalone;
	SaveArgs.SaveFlags = SAVE_NoError;
	SaveArgs.Error = GError;

	return UPackage::SavePackage(Package, WidgetBlueprint, *PackageFilename, SaveArgs);
}

UWidgetBlueprint* UUMGHelperLibrary::CreateWidgetBlueprintAsset(
	const FString& PackagePath,
	const FString& AssetName,
	TSubclassOf<UUserWidget> ParentClass)
{
	if (PackagePath.IsEmpty() || AssetName.IsEmpty())
	{
		return nullptr;
	}

	UWidgetBlueprintFactory* Factory = NewObject<UWidgetBlueprintFactory>();
	Factory->ParentClass = ParentClass ? ParentClass.Get() : UUserWidget::StaticClass();

	FAssetToolsModule& AssetTools = FModuleManager::LoadModuleChecked<FAssetToolsModule>("AssetTools");
	UObject* NewAsset = AssetTools.Get().CreateAsset(AssetName, PackagePath,
		UWidgetBlueprint::StaticClass(), Factory);
	UWidgetBlueprint* WBP = Cast<UWidgetBlueprint>(NewAsset);
	if (!WBP)
	{
		return nullptr;
	}

	// Factory creates an empty tree — drop a CanvasPanel root in so callers
	// have somewhere to add children straight away.
	if (WBP->WidgetTree && WBP->WidgetTree->RootWidget == nullptr)
	{
		UCanvasPanel* Root = WBP->WidgetTree->ConstructWidget<UCanvasPanel>(
			UCanvasPanel::StaticClass(), TEXT("RootCanvas"));
		WBP->WidgetTree->RootWidget = Root;
		FBlueprintEditorUtils::MarkBlueprintAsStructurallyModified(WBP);
	}
	return WBP;
}
