// Copyright Underworld. All Rights Reserved.
#include "SceneStateClient.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "TimerManager.h"
#include "Engine/World.h"

void USceneStateClient::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	// Backend config from the cmdline (set by run-ue5.sh in the deploy).
	FString V;
	if (FParse::Value(FCommandLine::Get(), TEXT("UnderworldApiUrl="), V)) { ApiUrl = V; }
	if (FParse::Value(FCommandLine::Get(), TEXT("UnderworldWorldId="), V)) { WorldId = V; }
	if (FParse::Value(FCommandLine::Get(), TEXT("UnderworldApiKey="), V)) { ApiKey = V; }
	float F;
	if (FParse::Value(FCommandLine::Get(), TEXT("UnderworldPollSeconds="), F)) { PollIntervalSeconds = F; }

	UE_LOG(LogTemp, Display, TEXT("[Underworld] SceneStateClient api=%s world=%s poll=%.2fs"),
		*ApiUrl, *WorldId, PollIntervalSeconds);

	StartPolling();
}

void USceneStateClient::Deinitialize()
{
	StopPolling();
	Super::Deinitialize();
}

void USceneStateClient::StartPolling()
{
	if (UWorld* W = GetWorld())
	{
		W->GetTimerManager().SetTimer(PollTimer, this, &USceneStateClient::Poll,
			FMath::Max(0.05f, PollIntervalSeconds), true, 0.f);
	}
}

void USceneStateClient::StopPolling()
{
	if (UWorld* W = GetWorld())
	{
		W->GetTimerManager().ClearTimer(PollTimer);
	}
}

void USceneStateClient::Poll()
{
	if (bInFlight || WorldId.IsEmpty()) { return; }
	bInFlight = true;

	const FString Url = FString::Printf(TEXT("%s/worlds/%s/scene-state"), *ApiUrl, *WorldId);
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = FHttpModule::Get().CreateRequest();
	Req->SetURL(Url);
	Req->SetVerb(TEXT("GET"));
	Req->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *ApiKey));
	Req->SetTimeout(8.f);
	Req->OnProcessRequestComplete().BindUObject(this, &USceneStateClient::OnResponse);
	Req->ProcessRequest();
}

void USceneStateClient::OnResponse(FHttpRequestPtr Req, FHttpResponsePtr Resp, bool bOk)
{
	bInFlight = false;
	if (!bOk || !Resp.IsValid() || Resp->GetResponseCode() != 200) { return; }

	FUwSceneState State;
	if (ParseScene(Resp->GetContentAsString(), State))
	{
		Latest = State;
		OnSceneState.Broadcast(State);
	}
}

bool USceneStateClient::ParseScene(const FString& Body, FUwSceneState& Out) const
{
	TSharedPtr<FJsonObject> Root;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Body);
	if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) { return false; }

	Out.Tick        = (int64)Root->GetNumberField(TEXT("tick"));
	Out.Era         = Root->GetStringField(TEXT("era"));
	Out.Biome       = Root->HasField(TEXT("biome")) ? Root->GetStringField(TEXT("biome")) : TEXT("");
	Out.Weather     = Root->HasField(TEXT("weather")) ? Root->GetStringField(TEXT("weather")) : TEXT("clear");
	Out.TimeOfDay   = Root->HasField(TEXT("time_of_day")) ? (float)Root->GetNumberField(TEXT("time_of_day")) : 0.5f;
	Out.TerrainSeed = Root->HasField(TEXT("terrain_seed")) ? (int64)Root->GetNumberField(TEXT("terrain_seed")) : 0;

	// sun: {x,y,z} or {dir:[..]} — best effort
	if (Root->HasTypedField<EJson::Object>(TEXT("sun")))
	{
		const TSharedPtr<FJsonObject> Sun = Root->GetObjectField(TEXT("sun"));
		Out.SunDir = FVector(
			Sun->HasField(TEXT("x")) ? (float)Sun->GetNumberField(TEXT("x")) : 0.f,
			Sun->HasField(TEXT("y")) ? (float)Sun->GetNumberField(TEXT("y")) : 0.f,
			Sun->HasField(TEXT("z")) ? (float)Sun->GetNumberField(TEXT("z")) : -1.f).GetSafeNormal();
	}

	const TArray<TSharedPtr<FJsonValue>>* Mins = nullptr;
	if (Root->TryGetArrayField(TEXT("minions"), Mins) && Mins)
	{
		Out.Minions.Reserve(Mins->Num());
		for (const TSharedPtr<FJsonValue>& V : *Mins)
		{
			const TSharedPtr<FJsonObject> M = V->AsObject();
			if (!M.IsValid()) { continue; }

			FUwMinionState Ms;
			Ms.Id   = M->GetStringField(TEXT("id"));
			Ms.Anim = M->HasField(TEXT("anim")) ? M->GetStringField(TEXT("anim")) : TEXT("idle");
			Ms.Mood = M->HasField(TEXT("mood")) ? M->GetStringField(TEXT("mood")) : TEXT("");
			Ms.Saga = M->HasField(TEXT("saga")) ? M->GetStringField(TEXT("saga")) : TEXT("");
			Ms.Guild= M->HasField(TEXT("guild")) ? M->GetStringField(TEXT("guild")) : TEXT("");
			Ms.Facing = M->HasField(TEXT("facing")) ? (float)M->GetNumberField(TEXT("facing")) : 0.f;

			// pos: [x,y,z] or {x,y,z}
			const TArray<TSharedPtr<FJsonValue>>* P = nullptr;
			if ((M->TryGetArrayField(TEXT("pos"), P) || M->TryGetArrayField(TEXT("position"), P)) && P && P->Num() >= 3)
			{
				Ms.Pos = FVector((*P)[0]->AsNumber(), (*P)[1]->AsNumber(), (*P)[2]->AsNumber());
			}

			// ── MOVEMENT v2: velocity [vx,vz], move_state, speed, target_pos [tx,tz] ──
			Ms.MoveState = M->HasField(TEXT("move_state")) ? M->GetStringField(TEXT("move_state")) : TEXT("idle");
			Ms.Speed     = M->HasField(TEXT("speed")) ? (float)M->GetNumberField(TEXT("speed")) : 0.f;
			const TArray<TSharedPtr<FJsonValue>>* Vel = nullptr;
			if (M->TryGetArrayField(TEXT("velocity"), Vel) && Vel && Vel->Num() >= 2)
			{
				Ms.Velocity = FVector((*Vel)[0]->AsNumber(), 0.f, (*Vel)[1]->AsNumber());
			}
			const TArray<TSharedPtr<FJsonValue>>* Tgt = nullptr;
			if (M->TryGetArrayField(TEXT("target_pos"), Tgt) && Tgt && Tgt->Num() >= 2)
			{
				Ms.TargetPos  = FVector((*Tgt)[0]->AsNumber(), 0.f, (*Tgt)[1]->AsNumber());
				Ms.bHasTarget = true;
			}
			Out.Minions.Add(MoveTemp(Ms));
		}
	}
	return true;
}

void USceneStateClient::FetchChunk(int32 Cx, int32 Cz, TFunction<void(const FUwChunk&)> OnDone)
{
	if (WorldId.IsEmpty()) { return; }
	const FString Url = FString::Printf(TEXT("%s/worlds/%s/chunk?cx=%d&cz=%d"), *ApiUrl, *WorldId, Cx, Cz);
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = FHttpModule::Get().CreateRequest();
	Req->SetURL(Url);
	Req->SetVerb(TEXT("GET"));
	Req->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *ApiKey));
	Req->SetTimeout(15.f);
	Req->OnProcessRequestComplete().BindLambda(
		[this, OnDone = MoveTemp(OnDone)](FHttpRequestPtr, FHttpResponsePtr Resp, bool bOk)
		{
			if (!bOk || !Resp.IsValid() || Resp->GetResponseCode() != 200) { return; }
			FUwChunk Chunk;
			if (ParseChunk(Resp->GetContentAsString(), Chunk) && OnDone) { OnDone(Chunk); }
		});
	Req->ProcessRequest();
}

bool USceneStateClient::ParseChunk(const FString& Body, FUwChunk& Out) const
{
	TSharedPtr<FJsonObject> Root;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Body);
	if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) { return false; }

	// "chunk": [cx, cz]
	const TArray<TSharedPtr<FJsonValue>>* CC = nullptr;
	if (Root->TryGetArrayField(TEXT("chunk"), CC) && CC && CC->Num() >= 2)
	{
		Out.Cx = (int32)(*CC)[0]->AsNumber();
		Out.Cz = (int32)(*CC)[1]->AsNumber();
	}

	// settlements[].placements[] + settlements[].walls[] — each is one structure
	auto AddPlacements = [&Out](const TArray<TSharedPtr<FJsonValue>>* Arr)
	{
		if (!Arr) { return; }
		for (const TSharedPtr<FJsonValue>& V : *Arr)
		{
			const TSharedPtr<FJsonObject> P = V->AsObject();
			if (!P.IsValid() || !P->HasField(TEXT("glb"))) { continue; }
			FUwStructure S;
			S.GlbUrl = P->GetStringField(TEXT("glb"));
			S.RotY   = P->HasField(TEXT("rot_y")) ? (float)P->GetNumberField(TEXT("rot_y")) : 0.f;
			S.Scale  = P->HasField(TEXT("scale")) ? (float)P->GetNumberField(TEXT("scale")) : 1.f;
			const TArray<TSharedPtr<FJsonValue>>* Pos = nullptr;
			if (P->TryGetArrayField(TEXT("pos"), Pos) && Pos && Pos->Num() >= 3)
			{
				S.Pos = FVector((*Pos)[0]->AsNumber(), (*Pos)[1]->AsNumber(), (*Pos)[2]->AsNumber());
			}
			Out.Structures.Add(MoveTemp(S));
		}
	};

	const TArray<TSharedPtr<FJsonValue>>* Settles = nullptr;
	if (Root->TryGetArrayField(TEXT("settlements"), Settles) && Settles)
	{
		for (const TSharedPtr<FJsonValue>& SV : *Settles)
		{
			const TSharedPtr<FJsonObject> S = SV->AsObject();
			if (!S.IsValid()) { continue; }
			const TArray<TSharedPtr<FJsonValue>>* A = nullptr;
			if (S->TryGetArrayField(TEXT("placements"), A)) { AddPlacements(A); }
			if (S->TryGetArrayField(TEXT("walls"), A))      { AddPlacements(A); }
		}
	}
	return true;
}
