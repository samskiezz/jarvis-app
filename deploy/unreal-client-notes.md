# Unreal Engine 5 client → Underworld backend

If you need true photoreal (Sims-4-tier or beyond) rendering, the browser
client cannot get you there. WebGL/WebGPU + CC0 assets caps out at the
stylised PBR scene shipped in `underworld/web/`. To exceed it you need a
native engine. This file is the spec for an Unreal Engine 5 client that
drives the same Python simulation backend over HTTP.

## Architecture

```
┌─────────────────────────────────────┐         ┌──────────────────────┐
│ Unreal Engine 5 client (.exe / Mac) │ ──HTTP→ │ FastAPI backend      │
│  • Landscape + Nanite buildings     │ ──SSE→  │ (running on VPS:8000)│
│  • MetaHuman / Quixel characters    │         │  - simulation        │
│  • Lumen real-time GI               │         │  - DNA / breeding    │
│  • RTX hardware ray tracing (opt)   │         │  - reincarnation     │
└─────────────────────────────────────┘         │  - inventions / Soul │
                                                └──────────────────────┘
```

The backend already exposes everything the client needs (see `deploy/README.md`
for the route list). The Unreal client is a **separate codebase**, owned by
you, in a separate repo. This file is the spec; build is yours to do.

## Project setup

1. Unreal Engine 5.4+ with the **HTTP** and **HTTP-Blueprints** plugins
   enabled (both ship in-engine).
2. New C++ template project. Name it `UnderworldUE`.
3. Add to `Source/UnderworldUE/UnderworldUE.Build.cs`:
   ```cs
   PublicDependencyModuleNames.AddRange(new[] {
       "Core", "CoreUObject", "Engine", "InputCore",
       "HTTP", "Json", "JsonUtilities",
   });
   ```

## Backend client (C++)

```cpp
// Source/UnderworldUE/Public/UWBackend.h
UCLASS()
class UNDERWORLDUE_API UUWBackend : public UObject {
    GENERATED_BODY()
public:
    UPROPERTY(EditAnywhere) FString BaseUrl  = "http://YOUR_VPS_IP";
    UPROPERTY(EditAnywhere) FString ApiKey   = "PASTE_BEARER_KEY";

    DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnMinions, const FString&, JsonBody);
    UPROPERTY(BlueprintAssignable) FOnMinions OnMinions;

    UFUNCTION(BlueprintCallable) void RefreshMinions(const FString& WorldId);
private:
    void Get(const FString& Path, TFunction<void(const FString&)> OnOk);
};
```

```cpp
// Source/UnderworldUE/Private/UWBackend.cpp
void UUWBackend::Get(const FString& Path, TFunction<void(const FString&)> OnOk) {
    auto Req = FHttpModule::Get().CreateRequest();
    Req->SetURL(BaseUrl + Path);
    Req->SetVerb("GET");
    Req->SetHeader("Authorization", "Bearer " + ApiKey);
    Req->OnProcessRequestComplete().BindLambda(
        [OnOk](FHttpRequestPtr, FHttpResponsePtr Res, bool Ok) {
            if (Ok && Res->GetResponseCode() == 200) OnOk(Res->GetContentAsString());
        });
    Req->ProcessRequest();
}

void UUWBackend::RefreshMinions(const FString& WorldId) {
    Get(FString::Printf(TEXT("/worlds/%s/minions?alive=true&limit=500"), *WorldId),
        [this](const FString& Body) { OnMinions.Broadcast(Body); });
}
```

Poll every 3-5s (call from a `UWorldSubsystem::Tick`).

## Per-Minion actor

```cpp
// AMinionActor.h
UCLASS()
class AMinionActor : public APawn {
    GENERATED_BODY()
public:
    UPROPERTY(EditAnywhere) class USkeletalMeshComponent* Mesh;
    UPROPERTY(EditAnywhere) class UAnimSequence* IdleAnim;
    UPROPERTY(EditAnywhere) class UAnimSequence* WalkAnim;
    // Free MetaHuman pulled in via Quixel Bridge — there are 50+ presets
    // and the Lyra / City Sample Crowds tools can drive their anims.
    void ApplyMinionJson(const TSharedPtr<FJsonObject>& M);
};
```

Spawn one `AMinionActor` per JSON entry. Material instance per guild
parameterised by `GuildColour` so you keep the costume base texture and
just tint per faction (same trick I used in the Three.js client).

## Terrain

The backend's `/worlds/{id}/map` returns a 32×32 heightmap normalised
[0,1]. Use it to drive `ALandscape`:

```cpp
TArray<uint16> Heights;
for (auto Row : HeightMapJsonArray)
  for (auto V : Row)
    Heights.Add((uint16)(V.AsDouble() * 65535.f));
ALandscape* L = GetWorld()->SpawnActor<ALandscape>();
L->Import(FGuid::NewGuid(), 0, 0, 31, 31, 1, 1, Heights, nullptr, {}, ELandscapeImportAlphamapType::Additive);
```

Apply the photoreal Quixel terrain materials (free in UE5) for grass /
dirt / rock / sand layers, splat-blended by elevation — same logic as the
Three.js splat shader, just in Material Editor with `WorldPositionOffset.Z`
as input.

## Quixel Megascans (FREE in UE5)

- Open **Quixel Bridge** (built into UE5)
- Sign in (free Epic account)
- Filter to "Megascans" / "Free"
- 16,000+ photoreal assets: trees, rocks, plants, buildings, furniture
- Drag straight into the Content Browser — they come in with Nanite +
  Lumen-ready materials

That solves the "1000 different assets" requirement. Megascans alone has
~20,000 PBR assets, all free for UE5.

## Lumen + Nanite + Hardware RT

In `Project Settings → Rendering`:
- Dynamic Global Illumination → **Lumen**
- Reflection Method → **Lumen** (or **Hardware Ray Tracing** if your VPS or
  client GPU supports it)
- Shadow Map Method → **Virtual Shadow Maps**
- Anti-Aliasing → **TSR**
- Nanite Skeletal Mesh Support → **Enabled** (experimental but works)

That's the closest you can get to ray-traced Sims-4-tier rendering on
consumer hardware. Hardware RT on an RTX GPU + Lumen + Nanite is the
modern AAA pipeline.

## Build & ship

```bash
# From the Unreal project root
./Engine/Build/BatchFiles/RunUAT.sh BuildCookRun \
    -project=$(pwd)/UnderworldUE.uproject \
    -platform=Win64 -clientconfig=Shipping -build -cook -stage -pak
```

Ship the resulting `.exe` to users. They run it locally; it connects to
your VPS for the simulation state. The backend doesn't know or care that
the client is Unreal instead of the browser.

## Effort

Realistic: **2-4 weeks of focused Unreal work** for a polished client that
hits Sims-4-tier on a mid-range desktop GPU, including the Quixel asset
integration and the per-Minion actor / Landscape / material system. Less
if you reuse Lyra Starter Game / City Sample as a base.
