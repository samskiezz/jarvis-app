// Copyright Underworld. All Rights Reserved.
#include "SceneStateClient.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonWriter.h"
#include "Serialization/JsonSerializer.h"
#include "Policies/CondensedJsonPrintPolicy.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "HAL/PlatformMisc.h"
#include "TimerManager.h"
#include "Engine/World.h"

void USceneStateClient::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	// Backend config from the cmdline (set by run-ue5.sh in the deploy).
	FString V;
	if (FParse::Value(FCommandLine::Get(), TEXT("UnderworldApiUrl="), V)) { ApiUrl = V; }
	if (FParse::Value(FCommandLine::Get(), TEXT("UnderworldWorldId="), V)) { WorldId = V; }
	if (FParse::Value(FCommandLine::Get(), TEXT("UnderworldPlayerId="), V)) { PlayerId = V; }
	// The API key is a CREDENTIAL — prefer the environment over argv. A cmdline `-UnderworldApiKey=`
	// is visible to every process via /proc/<pid>/cmdline + `ps`; the env var is not. Env wins; the
	// cmdline form stays only as a dev fallback. (red-team / Book V B.7: never put the secret on argv.)
	const FString EnvKey = FPlatformMisc::GetEnvironmentVariable(TEXT("UNDERWORLD_API_KEY"));
	if (!EnvKey.IsEmpty()) { ApiKey = EnvKey; }
	else if (FParse::Value(FCommandLine::Get(), TEXT("UnderworldApiKey="), V)) { ApiKey = V; }
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

TSharedRef<IHttpRequest, ESPMode::ThreadSafe> USceneStateClient::MakeRequest(const FString& Url, const FString& Verb) const
{
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = FHttpModule::Get().CreateRequest();
	Req->SetURL(Url);
	Req->SetVerb(Verb);
	Req->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *ApiKey));
	// NB: ApiKey is a credential — never UE_LOG the Authorization header or the key itself.
	return Req;
}

void USceneStateClient::Poll()
{
	if (bInFlight || WorldId.IsEmpty()) { return; }
	bInFlight = true;

	const FString Url = FString::Printf(TEXT("%s/worlds/%s/scene-state"), *ApiUrl, *WorldId);
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = MakeRequest(Url, TEXT("GET"));
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

// ── helpers ─────────────────────────────────────────────────────────────────────────
namespace
{
	float GetNum(const TSharedPtr<FJsonObject>& O, const TCHAR* Key, float Default = 0.f)
	{
		return (O.IsValid() && O->HasField(Key)) ? (float)O->GetNumberField(Key) : Default;
	}
	// int64-preserving read: GetNumberField returns double (53-bit mantissa); narrowing through
	// float (24-bit) would corrupt large seeds/ticks, so cast double→int64 directly.
	int64 GetInt64(const TSharedPtr<FJsonObject>& O, const TCHAR* Key, int64 Default = 0)
	{
		return (O.IsValid() && O->HasField(Key)) ? (int64)O->GetNumberField(Key) : Default;
	}
	// raw JSON of an object/array field, condensed — carries a structured payload (behavior/epoch)
	// without committing the client to a schema. Empty if the field is absent/null/not a container.
	FString GetRawJson(const TSharedPtr<FJsonObject>& O, const TCHAR* Key)
	{
		if (!O.IsValid() || !O->HasField(Key)) { return FString(); }
		const TSharedPtr<FJsonValue> V = O->TryGetField(Key);
		if (!V.IsValid() || (V->Type != EJson::Object && V->Type != EJson::Array)) { return FString(); }
		FString Out;
		TSharedRef<TJsonWriter<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>> W =
			TJsonWriterFactory<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>::Create(&Out);
		if (V->Type == EJson::Object) { FJsonSerializer::Serialize(V->AsObject().ToSharedRef(), W); }
		else { FJsonSerializer::Serialize(V->AsArray(), W); }
		return Out;
	}
	FString GetStr(const TSharedPtr<FJsonObject>& O, const TCHAR* Key)
	{
		// tolerate JSON null (the backend emits null for absent saga/identity/etc.)
		if (!O.IsValid() || !O->HasField(Key)) { return FString(); }
		const TSharedPtr<FJsonValue> Val = O->TryGetField(Key);
		return (Val.IsValid() && Val->Type == EJson::String) ? Val->AsString() : FString();
	}
	bool GetBool(const TSharedPtr<FJsonObject>& O, const TCHAR* Key, bool Default = false)
	{
		return (O.IsValid() && O->HasField(Key)) ? O->GetBoolField(Key) : Default;
	}
	// pos/velocity/target arrays: [x,y,z] (or {x,y,z}); returns false if absent/null.
	bool GetVec3(const TSharedPtr<FJsonObject>& O, const TCHAR* Key, FVector& Out)
	{
		const TArray<TSharedPtr<FJsonValue>>* A = nullptr;
		if (O.IsValid() && O->TryGetArrayField(Key, A) && A && A->Num() >= 2)
		{
			Out = FVector((*A)[0]->AsNumber(), (*A)[1]->AsNumber(),
				A->Num() >= 3 ? (*A)[2]->AsNumber() : 0.0);
			return true;
		}
		return false;
	}
}

bool USceneStateClient::ParseScene(const FString& Body, FUwSceneState& Out) const
{
	TSharedPtr<FJsonObject> Root;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Body);
	if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid()) { return false; }

	Out.ContractVersion = (int32)GetNum(Root, TEXT("contract_version"), 1);
	Out.Tick    = GetInt64(Root, TEXT("tick"));      // int64-preserving (ticks grow unbounded)
	Out.Era     = GetStr(Root, TEXT("era"));
	Out.SimYear = GetNum(Root, TEXT("sim_year"));
	Out.Population = (int32)GetNum(Root, TEXT("population"));

	// ── frame{} — v2 nests time-of-day / weather / biome / the Director frame here ──
	TSharedPtr<FJsonObject> Frame = Root->HasTypedField<EJson::Object>(TEXT("frame"))
		? Root->GetObjectField(TEXT("frame")) : nullptr;
	if (Frame.IsValid())
	{
		Out.Weather = Frame->HasField(TEXT("weather")) ? GetStr(Frame, TEXT("weather")) : TEXT("clear");
		Out.Biome   = GetStr(Frame, TEXT("biome"));

		// time_of_day is a dict {fraction, hour, sun_angle_rad, sun_elevation, is_night}.
		if (Frame->HasTypedField<EJson::Object>(TEXT("time_of_day")))
		{
			const TSharedPtr<FJsonObject> Tod = Frame->GetObjectField(TEXT("time_of_day"));
			Out.TimeOfDay = GetNum(Tod, TEXT("fraction"), 0.5f);
			// sun direction from the day-angle + elevation (Z-up): azimuth sweeps E→W.
			const float Ang = GetNum(Tod, TEXT("sun_angle_rad"), 0.f);
			const float Elev = FMath::Clamp(GetNum(Tod, TEXT("sun_elevation"), 0.5f), -1.f, 1.f);
			const float Horiz = FMath::Sqrt(FMath::Max(0.f, 1.f - Elev * Elev));
			Out.SunDir = FVector(FMath::Cos(Ang) * Horiz, FMath::Sin(Ang) * Horiz, -Elev).GetSafeNormal();
		}
		else if (Frame->HasField(TEXT("time_of_day")))   // tolerate a flat number (older contract)
		{
			Out.TimeOfDay = GetNum(Frame, TEXT("time_of_day"), 0.5f);
		}

		// frame.overmind (L1) — the colony's collective mind. tension arrives as text "0..1".
		if (Frame->HasTypedField<EJson::Object>(TEXT("overmind")))
		{
			const TSharedPtr<FJsonObject> Om = Frame->GetObjectField(TEXT("overmind"));
			Out.Overmind.bValid = true;
			Out.Overmind.Mood          = GetStr(Om, TEXT("mood"));
			Out.Overmind.TowardCreator = GetStr(Om, TEXT("toward_creator"));
			Out.Overmind.Direction     = GetStr(Om, TEXT("direction"));
			Out.Overmind.Realisation   = GetStr(Om, TEXT("realisation"));
			Out.Overmind.Omen          = GetStr(Om, TEXT("omen"));
			// tension may be a number or a text "0..1" — accept either.
			if (Om->HasField(TEXT("tension")))
			{
				const TSharedPtr<FJsonValue> T = Om->TryGetField(TEXT("tension"));
				Out.Overmind.Tension = (T.IsValid() && T->Type == EJson::String)
					? FCString::Atof(*T->AsString()) : (float)Om->GetNumberField(TEXT("tension"));
				Out.Overmind.Tension = FMath::Clamp(Out.Overmind.Tension, 0.f, 1.f);
			}
		}

		// frame.chatter (L4) — ambient whisper lines.
		const TArray<TSharedPtr<FJsonValue>>* Ch = nullptr;
		if (Frame->TryGetArrayField(TEXT("chatter"), Ch) && Ch)
		{
			for (const TSharedPtr<FJsonValue>& C : *Ch)
			{
				if (C.IsValid() && C->Type == EJson::String) { Out.Chatter.Add(C->AsString()); }
			}
		}

		// frame.god_beat (L5) — the singular irreversible beat (null when none).
		Out.GodBeat = GetStr(Frame, TEXT("god_beat"));

		// frame.epoch — the era-progress block {name, ...}; surface the headline for the HUD.
		if (Frame->HasTypedField<EJson::Object>(TEXT("epoch")))
		{
			Out.EpochName = GetStr(Frame->GetObjectField(TEXT("epoch")), TEXT("name"));
		}

		// frame.possessed_id — which body the creator is wearing (empty = none).
		Out.PossessedId = GetStr(Frame, TEXT("possessed_id"));

		// frame.presence (L.8) — attention hotspots + whether the god is here.
		if (Frame->HasTypedField<EJson::Object>(TEXT("presence")))
		{
			const TSharedPtr<FJsonObject> Pr = Frame->GetObjectField(TEXT("presence"));
			Out.Presence.bCreatorPresent = GetBool(Pr, TEXT("creator_present"));
			const TArray<TSharedPtr<FJsonValue>>* Hs = nullptr;
			if (Pr->TryGetArrayField(TEXT("attention_hotspots"), Hs) && Hs)
			{
				for (const TSharedPtr<FJsonValue>& HV : *Hs)
				{
					const TSharedPtr<FJsonObject> HO = HV->AsObject();
					if (!HO.IsValid()) { continue; }
					FUwHotspot Spot;
					GetVec3(HO, TEXT("pos"), Spot.Pos);
					Spot.Intensity = GetNum(HO, TEXT("intensity"));
					Out.Presence.Hotspots.Add(Spot);
				}
			}
		}
	}

	// terrain{} (v2 nests seed/biome/elevation/town_radius/heightmap here).
	if (Root->HasTypedField<EJson::Object>(TEXT("terrain")))
	{
		const TSharedPtr<FJsonObject> Terr = Root->GetObjectField(TEXT("terrain"));
		Out.TerrainSeed   = GetInt64(Terr, TEXT("seed"));        // int64-preserving (large seeds)
		Out.ElevationBias = GetNum(Terr, TEXT("elevation_bias"));
		Out.TownRadius    = GetNum(Terr, TEXT("town_radius"), 60.f);
		Out.HeightmapSize = (int32)GetNum(Terr, TEXT("heightmap_size"));
		if (Out.Biome.IsEmpty()) { Out.Biome = GetStr(Terr, TEXT("biome")); }
	}

	// ── minions[] ──────────────────────────────────────────────────────────────────
	double AwarenessSum = 0.0;
	int32 AwakenedCount = 0;
	const TArray<TSharedPtr<FJsonValue>>* Mins = nullptr;
	if (Root->TryGetArrayField(TEXT("minions"), Mins) && Mins)
	{
		Out.Minions.Reserve(Mins->Num());
		for (const TSharedPtr<FJsonValue>& V : *Mins)
		{
			const TSharedPtr<FJsonObject> M = V->AsObject();
			if (!M.IsValid()) { continue; }

			FUwMinionState Ms;
			Ms.Id    = GetStr(M, TEXT("id"));
			Ms.Name  = GetStr(M, TEXT("name"));
			Ms.Anim  = M->HasField(TEXT("anim"))  ? GetStr(M, TEXT("anim"))  : TEXT("idle");
			Ms.Mood  = GetStr(M, TEXT("mood"));
			Ms.Saga  = GetStr(M, TEXT("saga"));
			Ms.Guild = GetStr(M, TEXT("guild"));
			Ms.Role  = GetStr(M, TEXT("role"));
			Ms.Facing = GetNum(M, TEXT("facing"));

			// guild accent colour ("#rrggbb") → FLinearColor (sRGB).
			const FString Hex = GetStr(M, TEXT("color"));
			if (!Hex.IsEmpty())
			{
				Ms.GuildColor = FLinearColor(FColor::FromHex(Hex));
			}

			// pos: [x,y,z] or "position"
			if (!GetVec3(M, TEXT("pos"), Ms.Pos)) { GetVec3(M, TEXT("position"), Ms.Pos); }

			// MOVEMENT v2: velocity [vx,vz], move_state, speed, target_pos [tx,tz]
			Ms.MoveState = M->HasField(TEXT("move_state")) ? GetStr(M, TEXT("move_state")) : TEXT("idle");
			Ms.Speed     = GetNum(M, TEXT("speed"));
			FVector Vel;
			if (GetVec3(M, TEXT("velocity"), Vel)) { Ms.Velocity = FVector(Vel.X, 0.f, Vel.Y); }
			FVector Tgt;
			if (GetVec3(M, TEXT("target_pos"), Tgt)) { Ms.TargetPos = FVector(Tgt.X, 0.f, Tgt.Y); Ms.bHasTarget = true; }

			// activity bridge
			Ms.Action         = GetStr(M, TEXT("action"));
			Ms.TargetBuilding = GetStr(M, TEXT("target_building"));
			Ms.UsingAsset     = GetStr(M, TEXT("using_asset"));

			// cognition / awakening
			Ms.Awareness = FMath::Clamp(GetNum(M, TEXT("awareness")), 0.f, 1.f);
			Ms.bAwakened = GetBool(M, TEXT("awakened"));
			Ms.Thought   = GetStr(M, TEXT("thought"));
			Ms.Identity  = GetStr(M, TEXT("identity"));
			Ms.Drive     = GetStr(M, TEXT("drive"));

			// appearance / needs
			Ms.Prominence = GetNum(M, TEXT("scale"), 1.f);
			Ms.Generation = (int32)GetNum(M, TEXT("generation"));
			if (M->HasTypedField<EJson::Object>(TEXT("needs")))
			{
				const TSharedPtr<FJsonObject> Needs = M->GetObjectField(TEXT("needs"));
				Ms.Hunger  = GetNum(Needs, TEXT("hunger"));
				Ms.Fatigue = GetNum(Needs, TEXT("fatigue"));
				Ms.Sanity  = GetNum(Needs, TEXT("sanity"), 1.f);
			}
			Ms.GeneEdit     = GetStr(M, TEXT("gene_edit"));
			Ms.BehaviorJson = GetRawJson(M, TEXT("behavior"));   // micro-interaction stream (raw JSON)

			// canonical emotion (face + voice), resolved from mood + awakening + needs.
			Ms.Emotion = UnderworldEmotion::Resolve(Ms.Mood, Ms.Awareness, Ms.bAwakened,
				Ms.Fatigue, Ms.Sanity, Ms.EmotionIntensity);

			// deterministic voice identity (F.4): seed from the immutable id → stable pitch/rate.
			if (!Ms.Id.IsEmpty())
			{
				const uint32 H = FCrc::StrCrc32(*Ms.Id);
				Ms.VoiceSeed  = (int32)H;
				Ms.VoicePitch = ((H & 0xFFFF) / 65535.f) * 2.f - 1.f;          // -1..1
				Ms.VoiceRate  = 0.9f + (((H >> 16) & 0xFFFF) / 65535.f) * 0.2f; // 0.9..1.1
			}

			Ms.bPossessed = GetBool(M, TEXT("possessed"));

			AwarenessSum += Ms.Awareness;
			if (Ms.bAwakened) { ++AwakenedCount; }
			Out.Minions.Add(MoveTemp(Ms));
		}
	}

	// Colony aggregates for the God-HUD (Part G.1). Prefer the frame's if present (forward-compat
	// with frame.mean_awareness / frame.awakened_count); otherwise derive from the minion array.
	Out.AwakenedCount = Frame.IsValid() && Frame->HasField(TEXT("awakened_count"))
		? (int32)GetNum(Frame, TEXT("awakened_count")) : AwakenedCount;
	Out.MeanAwareness = Frame.IsValid() && Frame->HasField(TEXT("mean_awareness"))
		? GetNum(Frame, TEXT("mean_awareness"))
		: (Out.Minions.Num() > 0 ? (float)(AwarenessSum / Out.Minions.Num()) : 0.f);

	return true;
}

void USceneStateClient::FetchChunk(int32 Cx, int32 Cz, TFunction<void(const FUwChunk&)> OnDone)
{
	if (WorldId.IsEmpty()) { return; }
	const FString Url = FString::Printf(TEXT("%s/worlds/%s/chunk?cx=%d&cz=%d"), *ApiUrl, *WorldId, Cx, Cz);
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = MakeRequest(Url, TEXT("GET"));
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

void USceneStateClient::PostPossess(const FString& MinionId, bool bPossess, TFunction<void(bool)> OnDone)
{
	if (MinionId.IsEmpty()) { if (OnDone) { OnDone(false); } return; }
	const FString Verb = bPossess ? TEXT("possess") : TEXT("release");
	const FString Url = FString::Printf(TEXT("%s/minions/%s/%s"), *ApiUrl, *MinionId, *Verb);
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = MakeRequest(Url, TEXT("POST"));
	Req->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Req->SetContentAsString(TEXT("{}"));
	Req->SetTimeout(8.f);
	Req->OnProcessRequestComplete().BindLambda(
		[OnDone = MoveTemp(OnDone)](FHttpRequestPtr, FHttpResponsePtr Resp, bool bOk)
		{
			const bool bSuccess = bOk && Resp.IsValid() && Resp->GetResponseCode() == 200;
			if (OnDone) { OnDone(bSuccess); }
		});
	Req->ProcessRequest();
}

void USceneStateClient::PostAct(const FString& Verb, const FString& TargetId, const FString& ParamsJson,
                                TFunction<void(bool)> OnDone)
{
	if (Verb.IsEmpty() || WorldId.IsEmpty()) { if (OnDone) { OnDone(false); } return; }

	// Idempotency key: (verb, target) bucketed to a 2s window so an accidental double-fire of the
	// SAME intent collides and the server (60s idempotency cache) applies it once — while genuinely
	// separate actions >2s apart get distinct keys. A wall-clock bucket (not a per-process counter)
	// also means keys don't collide with a previous run's after a restart.
	const int64 Bucket = FDateTime::UtcNow().ToUnixTimestamp() / 2;
	const FString IdemKey = FString::Printf(TEXT("%s-%s-%s-%lld"), *WorldId, *Verb, *TargetId,
		(long long)Bucket);
	(void)ActSeq;

	// params is passed through verbatim (caller builds it); default to {}. TargetId/idempotency are
	// added at the top level of the body per the /player/act ActRequest schema.
	const FString Params = ParamsJson.IsEmpty() ? TEXT("{}") : ParamsJson;
	const FString TargetField = TargetId.IsEmpty() ? TEXT("null")
		: FString::Printf(TEXT("\"%s\""), *TargetId);
	const FString Payload = FString::Printf(
		TEXT("{\"verb\":\"%s\",\"target_id\":%s,\"params\":%s,\"idempotency_key\":\"%s\"}"),
		*Verb, *TargetField, *Params, *IdemKey);

	const FString Url = FString::Printf(TEXT("%s/worlds/%s/player/act"), *ApiUrl, *WorldId);
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = MakeRequest(Url, TEXT("POST"));
	Req->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Req->SetHeader(TEXT("X-Player-Id"), PlayerId);   // multiplayer arbitration anchor (B.3)
	Req->SetContentAsString(Payload);
	Req->SetTimeout(8.f);
	Req->OnProcessRequestComplete().BindLambda(
		[Verb, OnDone = MoveTemp(OnDone)](FHttpRequestPtr, FHttpResponsePtr Resp, bool bOk)
		{
			const int32 Code = (bOk && Resp.IsValid()) ? Resp->GetResponseCode() : 0;
			const bool bSuccess = (Code == 200);
			if (Code == 429)  // rate-limited / cooldown — surface so the UI can show "too fast"
			{
				UE_LOG(LogTemp, Warning, TEXT("[Underworld] god-verb '%s' rate-limited (429)"), *Verb);
			}
			if (OnDone) { OnDone(bSuccess); }
		});
	Req->ProcessRequest();
}

void USceneStateClient::PostForecast(const FString& Verb, const FString& TargetId,
                                     const FString& ParamsJson, TFunction<void(bool, const FString&)> OnDone)
{
	if (Verb.IsEmpty() || WorldId.IsEmpty()) { if (OnDone) { OnDone(false, FString()); } return; }
	const FString Params = ParamsJson.IsEmpty() ? TEXT("{}") : ParamsJson;
	const FString TargetField = TargetId.IsEmpty() ? TEXT("null") : FString::Printf(TEXT("\"%s\""), *TargetId);
	const FString Payload = FString::Printf(
		TEXT("{\"verb\":\"%s\",\"target_id\":%s,\"params\":%s}"), *Verb, *TargetField, *Params);
	const FString Url = FString::Printf(TEXT("%s/worlds/%s/player/forecast"), *ApiUrl, *WorldId);
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = MakeRequest(Url, TEXT("POST"));
	Req->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Req->SetContentAsString(Payload);
	Req->SetTimeout(8.f);
	Req->OnProcessRequestComplete().BindLambda(
		[OnDone = MoveTemp(OnDone)](FHttpRequestPtr, FHttpResponsePtr Resp, bool bOk)
		{
			const bool bSuccess = bOk && Resp.IsValid() && Resp->GetResponseCode() == 200;
			if (OnDone) { OnDone(bSuccess, bSuccess ? Resp->GetContentAsString() : FString()); }
		});
	Req->ProcessRequest();
}

void USceneStateClient::PostGaze(const FVector& CamPos, const FVector& CamFwd, float Fov,
                                 const FString& ReticleTargetId, float Dt)
{
	if (WorldId.IsEmpty()) { return; }
	const FString Reticle = ReticleTargetId.IsEmpty() ? TEXT("null")
		: FString::Printf(TEXT("\"%s\""), *ReticleTargetId);
	const FString Payload = FString::Printf(
		TEXT("{\"camera\":{\"pos\":[%.2f,%.2f,%.2f],\"fwd\":[%.4f,%.4f,%.4f],\"fov\":%.1f},")
		TEXT("\"reticle_target_id\":%s,\"dt\":%.3f}"),
		CamPos.X, CamPos.Y, CamPos.Z, CamFwd.X, CamFwd.Y, CamFwd.Z, Fov, *Reticle, Dt);

	const FString Url = FString::Printf(TEXT("%s/worlds/%s/player/gaze"), *ApiUrl, *WorldId);
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = MakeRequest(Url, TEXT("POST"));
	Req->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Req->SetHeader(TEXT("X-Player-Id"), PlayerId);
	Req->SetContentAsString(Payload);
	Req->SetTimeout(5.f);
	Req->ProcessRequest();   // fire-and-forget: a high-frequency sample, no callback needed
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
