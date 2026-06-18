// Copyright JARVIS. Licensed for in-project use.

#include "JarvisAnimHelper.h"

#include "Animation/AnimBlueprint.h"
#include "Animation/AnimSequenceBase.h"
#include "Animation/AnimStateMachineTypes.h"
#include "AnimationGraph.h"
#include "AnimationStateMachineGraph.h"
#include "AnimationStateMachineSchema.h"
#include "AnimationStateGraph.h"
#include "AnimationTransitionGraph.h"
#include "AnimationStateNodes/AnimStateNode.h"
#include "AnimationStateNodes/AnimStateTransitionNode.h"
#include "AnimGraphNode_StateMachine.h"
#include "AnimGraphNode_SequencePlayer.h"
#include "AnimGraphNode_StateResult.h"
#include "AnimGraphNode_TransitionResult.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetToolsModule.h"
#include "EdGraph/EdGraph.h"
#include "EdGraph/EdGraphPin.h"
#include "Editor.h"
#include "Engine/Engine.h"
#include "Factories/AnimBlueprintFactory.h"
#include "IAssetTools.h"
#include "K2Node_CallFunction.h"
#include "K2Node_VariableGet.h"
#include "Kismet2/BlueprintEditorUtils.h"
#include "Kismet2/KismetEditorUtilities.h"
#include "PackageTools.h"
#include "Subsystems/EditorSubsystem.h"
#include "UObject/Package.h"
#include "UObject/SavePackage.h"

#define LOG(Verbosity, Format, ...) \
    UE_LOG(LogTemp, Verbosity, TEXT("[JarvisAnimHelper] ") Format, ##__VA_ARGS__)

UJarvisAnimHelper* UJarvisAnimHelper::Get()
{
    if (GEditor)
    {
        return GEditor->GetEditorSubsystem<UJarvisAnimHelper>();
    }
    return nullptr;
}

static UAnimBlueprint* CreateAnimBlueprintAsset(USkeleton* Skeleton,
                                                const FString& PackagePath)
{
    FString PackageName, AssetName;
    PackagePath.Split(TEXT("/"), &PackageName, &AssetName,
                      ESearchCase::IgnoreCase, ESearchDir::FromEnd);

    UAnimBlueprintFactory* Factory = NewObject<UAnimBlueprintFactory>();
    Factory->TargetSkeleton = Skeleton;
    Factory->ParentClass = UAnimInstance::StaticClass();

    IAssetTools& Tools =
        FModuleManager::LoadModuleChecked<FAssetToolsModule>("AssetTools").Get();

    UObject* NewAsset = Tools.CreateAsset(AssetName, PackageName,
                                         UAnimBlueprint::StaticClass(),
                                         Factory);
    return Cast<UAnimBlueprint>(NewAsset);
}

bool UJarvisAnimHelper::AddIntVariable(UAnimBlueprint* AnimBP, FName VarName,
                                      int32 DefaultValue)
{
    if (!AnimBP) return false;
    FEdGraphPinType PinType;
    PinType.PinCategory = UEdGraphSchema_K2::PC_Int;
    const bool bAdded = FBlueprintEditorUtils::AddMemberVariable(
        AnimBP, VarName, PinType, FString::FromInt(DefaultValue));
    return bAdded;
}

bool UJarvisAnimHelper::CompileAndSave(UAnimBlueprint* AnimBP)
{
    if (!AnimBP) return false;
    FKismetEditorUtilities::CompileBlueprint(AnimBP);
    UPackage* Pkg = AnimBP->GetOutermost();
    if (!Pkg) return false;
    Pkg->MarkPackageDirty();
    const FString Filename =
        FPackageName::LongPackageNameToFilename(Pkg->GetName(),
                                                FPackageName::GetAssetPackageExtension());
    FSavePackageArgs SaveArgs;
    SaveArgs.TopLevelFlags = RF_Public | RF_Standalone;
    return UPackage::SavePackage(Pkg, AnimBP, *Filename, SaveArgs);
}

UAnimBlueprint* UJarvisAnimHelper::CreateStateMachineABP(
    USkeleton* Skeleton,
    const FString& OutPackagePath,
    const TArray<FJarvisAnimState>& States,
    const TArray<FJarvisAnimTransition>& Transitions)
{
    if (!Skeleton)
    {
        LOG(Warning, TEXT("CreateStateMachineABP: null skeleton"));
        return nullptr;
    }
    if (States.Num() == 0)
    {
        LOG(Warning, TEXT("CreateStateMachineABP: no states supplied"));
        return nullptr;
    }

    UAnimBlueprint* AnimBP = CreateAnimBlueprintAsset(Skeleton, OutPackagePath);
    if (!AnimBP)
    {
        LOG(Error, TEXT("Failed to create AnimBP asset at %s"), *OutPackagePath);
        return nullptr;
    }

    // anim_state variable.
    AddIntVariable(AnimBP, FName(TEXT("anim_state")), 0);

    // Locate the default AnimGraph.
    TArray<UEdGraph*> AnimGraphs;
    AnimBP->GetAllGraphs(AnimGraphs);
    UEdGraph* AnimGraph = nullptr;
    for (UEdGraph* G : AnimGraphs)
    {
        if (G && G->Schema && G->GetFName() == UEdGraphSchema_K2::GN_AnimGraph)
        {
            AnimGraph = G;
            break;
        }
    }
    if (!AnimGraph && AnimGraphs.Num() > 0)
    {
        AnimGraph = AnimGraphs[0];
    }
    if (!AnimGraph)
    {
        LOG(Error, TEXT("No AnimGraph found in new ABP"));
        return nullptr;
    }

    // Add a state-machine node.
    UAnimGraphNode_StateMachine* SMNode =
        NewObject<UAnimGraphNode_StateMachine>(AnimGraph);
    SMNode->CreateNewGuid();
    SMNode->PostPlacedNewNode();
    SMNode->AllocateDefaultPins();
    AnimGraph->AddNode(SMNode, /*bUserAction*/ false, /*bSelectNewNode*/ false);
    SMNode->NodePosX = 0;
    SMNode->NodePosY = 0;

    UAnimationStateMachineGraph* SMGraph =
        Cast<UAnimationStateMachineGraph>(SMNode->EditorStateMachineGraph);
    if (!SMGraph)
    {
        // Engine variant on 5.4+: BoundGraph holds the state machine subgraph.
        SMGraph = Cast<UAnimationStateMachineGraph>(SMNode->BoundGraph);
    }
    if (!SMGraph)
    {
        LOG(Error, TEXT("State-machine subgraph not initialized"));
        return nullptr;
    }

    // Create state nodes.
    TMap<FName, UAnimStateNode*> StateNodesByName;
    int32 X = 0;
    for (const FJarvisAnimState& S : States)
    {
        UAnimStateNode* StateNode = NewObject<UAnimStateNode>(SMGraph);
        StateNode->CreateNewGuid();
        StateNode->PostPlacedNewNode();
        StateNode->AllocateDefaultPins();
        StateNode->GetStateName() = S.Name.ToString();
        SMGraph->AddNode(StateNode, false, false);
        StateNode->NodePosX = X;
        StateNode->NodePosY = 0;
        X += 320;

        // Inner state graph: place a SequencePlayer feeding StateResult.
        if (UEdGraph* StateGraph = StateNode->BoundGraph)
        {
            UAnimGraphNode_SequencePlayer* SeqNode =
                NewObject<UAnimGraphNode_SequencePlayer>(StateGraph);
            SeqNode->CreateNewGuid();
            SeqNode->PostPlacedNewNode();
            SeqNode->AllocateDefaultPins();
            SeqNode->Node.SetSequence(S.Anim);
            StateGraph->AddNode(SeqNode, false, false);

            // Wire SequencePlayer.Pose -> StateResult.Result if found.
            UAnimGraphNode_StateResult* ResultNode = nullptr;
            for (UEdGraphNode* N : StateGraph->Nodes)
            {
                if (UAnimGraphNode_StateResult* R =
                        Cast<UAnimGraphNode_StateResult>(N))
                {
                    ResultNode = R; break;
                }
            }
            if (ResultNode)
            {
                UEdGraphPin* OutPin = SeqNode->FindPin(TEXT("Pose"), EGPD_Output);
                UEdGraphPin* InPin = ResultNode->FindPin(TEXT("Result"), EGPD_Input);
                if (OutPin && InPin)
                {
                    OutPin->MakeLinkTo(InPin);
                }
            }
        }
        StateNodesByName.Add(S.Name, StateNode);
    }

    // Create transitions.
    for (const FJarvisAnimTransition& T : Transitions)
    {
        UAnimStateNode** FromPtr = StateNodesByName.Find(T.From);
        UAnimStateNode** ToPtr   = StateNodesByName.Find(T.To);
        if (!FromPtr || !ToPtr) continue;

        UAnimStateTransitionNode* TransNode =
            NewObject<UAnimStateTransitionNode>(SMGraph);
        TransNode->CreateNewGuid();
        TransNode->PostPlacedNewNode();
        TransNode->AllocateDefaultPins();
        SMGraph->AddNode(TransNode, false, false);

        UEdGraphPin* FromOut = (*FromPtr)->GetOutputPin();
        UEdGraphPin* ToIn    = (*ToPtr)->GetInputPin();
        UEdGraphPin* TransIn = TransNode->GetInputPin();
        UEdGraphPin* TransOut= TransNode->GetOutputPin();
        if (FromOut && TransIn) FromOut->MakeLinkTo(TransIn);
        if (TransOut && ToIn)   TransOut->MakeLinkTo(ToIn);

        // Inject the comparison rule (`anim_state == N`) into the
        // transition's bound graph by finding a literal int in the rule
        // string. The pattern we support is "anim_state==<int>".
        int32 EqIdx = INDEX_NONE;
        T.Rule.FindLastChar(TEXT('='), EqIdx);
        int32 CompareValue = 0;
        if (EqIdx != INDEX_NONE && EqIdx + 1 < T.Rule.Len())
        {
            CompareValue = FCString::Atoi(*T.Rule.Mid(EqIdx + 1));
        }

        if (UEdGraph* RuleGraph = TransNode->BoundGraph)
        {
            // Find Result node.
            UAnimGraphNode_TransitionResult* ResultNode = nullptr;
            for (UEdGraphNode* N : RuleGraph->Nodes)
            {
                if (auto* R = Cast<UAnimGraphNode_TransitionResult>(N))
                {
                    ResultNode = R; break;
                }
            }

            // VarGet(anim_state).
            UK2Node_VariableGet* VarGet = NewObject<UK2Node_VariableGet>(RuleGraph);
            VarGet->VariableReference.SetSelfMember(FName(TEXT("anim_state")));
            VarGet->CreateNewGuid();
            VarGet->PostPlacedNewNode();
            VarGet->AllocateDefaultPins();
            RuleGraph->AddNode(VarGet, false, false);

            // EqualEqual_IntInt call.
            UK2Node_CallFunction* EqNode = NewObject<UK2Node_CallFunction>(RuleGraph);
            UFunction* EqFunc = UKismetMathLibrary::StaticClass()->FindFunctionByName(
                FName(TEXT("EqualEqual_IntInt")));
            EqNode->SetFromFunction(EqFunc);
            EqNode->CreateNewGuid();
            EqNode->PostPlacedNewNode();
            EqNode->AllocateDefaultPins();
            RuleGraph->AddNode(EqNode, false, false);

            UEdGraphPin* APin = EqNode->FindPin(TEXT("A"));
            UEdGraphPin* BPin = EqNode->FindPin(TEXT("B"));
            UEdGraphPin* OutPin = EqNode->GetReturnValuePin();
            UEdGraphPin* VarOutPin = VarGet->GetValuePin();

            if (VarOutPin && APin) VarOutPin->MakeLinkTo(APin);
            if (BPin) BPin->DefaultValue = FString::FromInt(CompareValue);

            if (ResultNode)
            {
                UEdGraphPin* ResultIn =
                    ResultNode->FindPin(TEXT("bCanEnterTransition"), EGPD_Input);
                if (!ResultIn) ResultIn = ResultNode->FindPin(TEXT("Result"), EGPD_Input);
                if (OutPin && ResultIn) OutPin->MakeLinkTo(ResultIn);
            }
        }
    }

    // Mark first state as the entry point.
    if (StateNodesByName.Num() > 0)
    {
        UAnimStateNode* FirstState = StateNodesByName[States[0].Name];
        if (UEdGraph* SMG = SMNode->BoundGraph)
        {
            // Engine wires an entry node automatically; just connect it.
            for (UEdGraphNode* N : SMG->Nodes)
            {
                if (N && N->IsA<UAnimStateNode>() == false &&
                    N->GetClass()->GetName().Contains(TEXT("Entry")))
                {
                    if (UEdGraphPin* Out = N->FindPinChecked(
                            UEdGraphSchema_K2::PN_Then, EGPD_Output))
                    {
                        Out->MakeLinkTo(FirstState->GetInputPin());
                    }
                    break;
                }
            }
        }
    }

    // Wire the SM node into the AnimGraph result.
    for (UEdGraphNode* N : AnimGraph->Nodes)
    {
        if (N->GetClass()->GetName().Contains(TEXT("Result")))
        {
            UEdGraphPin* In = N->FindPin(TEXT("Result"), EGPD_Input);
            UEdGraphPin* Out = SMNode->FindPin(TEXT("Pose"), EGPD_Output);
            if (In && Out) Out->MakeLinkTo(In);
            break;
        }
    }

    FBlueprintEditorUtils::MarkBlueprintAsStructurallyModified(AnimBP);
    CompileAndSave(AnimBP);
    LOG(Display, TEXT("CreateStateMachineABP: built %d states, %d transitions"),
        States.Num(), Transitions.Num());
    return AnimBP;
}
