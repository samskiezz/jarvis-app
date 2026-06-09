#!/usr/bin/env python3
"""Give AUnderworldMinion a VISIBLE default mesh so the headless render isn't an empty world.

The shipped class is a bare USkeletalMeshComponent with no asset (it expects an authored BP_Minion
with a skeletal mesh — Editor/art work we don't have headless). For a real render we attach an
engine cylinder as the body; minions show as moving figures driven by the live sim. Idempotent.
"""
import re

CPP = "/opt/jarvis-app-1/underworld/deploy/ue5-project/Source/Underworld/UnderworldMinion.cpp"
src = open(CPP).read()
if "BodyMesh" in src:
    print("minion mesh already present — skip"); raise SystemExit(0)

# add includes
src = src.replace(
    '#include "Components/SkeletalMeshComponent.h"',
    '#include "Components/SkeletalMeshComponent.h"\n'
    '#include "Components/StaticMeshComponent.h"\n'
    '#include "Engine/StaticMesh.h"\n'
    '#include "UObject/ConstructorHelpers.h"', 1)

# inject a visible cylinder body into the constructor (after RootComponent = Mesh;)
inject = (
    "\n\t// VISIBLE BODY — engine cylinder so headless renders show moving figures (no authored\n"
    "\t// BP_Minion mesh exists). Driven by the live sim through ApplyState/Tick.\n"
    "\tUStaticMeshComponent* BodyMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT(\"BodyMesh\"));\n"
    "\tBodyMesh->SetupAttachment(RootComponent);\n"
    "\tstatic ConstructorHelpers::FObjectFinder<UStaticMesh> CylMesh(TEXT(\"/Engine/BasicShapes/Cylinder.Cylinder\"));\n"
    "\tif (CylMesh.Succeeded()) { BodyMesh->SetStaticMesh(CylMesh.Object); }\n"
    "\tBodyMesh->SetRelativeScale3D(FVector(0.45f, 0.45f, 0.9f));\n"
    "\tBodyMesh->SetRelativeLocation(FVector(0.f, 0.f, 90.f));\n"
    "\tBodyMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);\n")
src = re.sub(r"(RootComponent\s*=\s*Mesh;\s*\n)", r"\1" + inject, src, count=1)

open(CPP, "w").write(src)
print("minion mesh injected into", CPP)
