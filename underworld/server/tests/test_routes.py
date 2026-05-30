def test_root_open(client):
    # `/` either serves the React bundle (`text/html`) when present in
    # underworld/web/dist or returns the service descriptor as JSON. Both
    # paths are 200 + unauthenticated — that's what the test cares about.
    res = client.get("/")
    assert res.status_code == 200
    content_type = res.headers.get("content-type", "")
    if "application/json" in content_type:
        assert res.json()["service"] == "underworld"
    else:
        assert "html" in content_type.lower()


def test_healthz_open(client):
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json() == {"ok": True}


def test_auth_required(client):
    assert client.get("/auth/me").status_code == 401


def test_auth_me(client, headers):
    res = client.get("/auth/me", headers=headers)
    assert res.status_code == 200
    assert res.json()["authenticated"] is True


def test_create_world_seeds_requested_population(client, headers):
    res = client.post(
        "/worlds",
        json={"name": "RouteTest", "cpc_class": "H02J", "starting_population": 64, "population_cap": 200},
        headers=headers,
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["seed_class"] == "H02J"
    assert body["tick"] == 0
    assert body["minion_count"] >= 60  # within a few of 64 due to apportionment


def test_world_map(client, headers):
    create = client.post(
        "/worlds",
        json={"name": "MapTest", "cpc_class": "F03D", "starting_population": 20},
        headers=headers,
    )
    world_id = create.json()["id"]
    res = client.get(f"/worlds/{world_id}/map", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["cpc_class"] == "F03D"
    assert len(body["heightmap"]) == 32


def test_latest_actions_returns_minion_id_to_action_map(client, headers):
    create = client.post(
        "/worlds",
        json={"name": "ActionsRoute", "cpc_class": "G06F", "starting_population": 24, "population_cap": 80},
        headers=headers,
    )
    wid = create.json()["id"]
    client.post(f"/worlds/{wid}/advance", headers=headers, json={"ticks": 2})

    res = client.get(f"/worlds/{wid}/latest-actions", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["world_id"] == wid
    assert body["tick"] == 2
    assert isinstance(body["actions"], dict)
    # Every alive minion took at least one action across the 2 ticks.
    assert len(body["actions"]) > 0
    # Action names are bare verbs (not the bracketed memory format).
    sample = next(iter(body["actions"].values()))
    assert "[" not in sample and "]" not in sample


def test_auto_advance_toggle(client, headers):
    create = client.post(
        "/worlds",
        json={"name": "AutoTest", "cpc_class": "H02J", "starting_population": 16},
        headers=headers,
    )
    wid = create.json()["id"]
    res = client.patch(
        f"/worlds/{wid}/auto-advance",
        json={"auto_advance": True, "interval_s": 2.0},
        headers=headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["auto_advance"] is True
    assert body["auto_advance_interval_s"] == 2.0


def test_advance_and_population_stats(client, headers):
    create = client.post(
        "/worlds",
        json={"name": "Stats", "cpc_class": "G06F", "starting_population": 32},
        headers=headers,
    )
    wid = create.json()["id"]
    advance = client.post(f"/worlds/{wid}/advance", headers=headers, json={"ticks": 1})
    assert advance.status_code == 200, advance.text
    r = advance.json()
    assert r["final_tick"] == 1
    assert "births" in r["reports"][0]

    stats = client.get(f"/worlds/{wid}/population", headers=headers)
    assert stats.status_code == 200
    body = stats.json()
    assert body["alive"] > 0
    assert body["history"], "expected at least one snapshot"


def test_minion_dna_and_soul_endpoints(client, headers):
    create = client.post(
        "/worlds",
        json={"name": "DNA", "cpc_class": "G06F", "starting_population": 16},
        headers=headers,
    )
    wid = create.json()["id"]
    minions = client.get(f"/worlds/{wid}/minions", headers=headers).json()
    assert minions
    mid = minions[0]["id"]
    dna = client.get(f"/minions/{mid}/dna", headers=headers)
    assert dna.status_code == 200
    body = dna.json()
    assert body["length"] >= 256
    assert "intelligence" in body["traits"]

    soul = client.get(f"/minions/{mid}/soul", headers=headers)
    assert soul.status_code == 200
    assert soul.json()["incarnation"] == 1


def test_breed_endpoint(client, headers):
    create = client.post(
        "/worlds",
        json={"name": "BreedRoute", "cpc_class": "G06F", "starting_population": 32, "population_cap": 200},
        headers=headers,
    )
    wid = create.json()["id"]
    # Need world tick > 40 before either parent is breeding-age.
    client.post(f"/worlds/{wid}/advance", headers=headers, json={"ticks": 45})
    minions = client.get(f"/worlds/{wid}/minions?alive=true&limit=10", headers=headers).json()
    assert len(minions) >= 2
    body = client.post(
        "/minions/breed",
        headers=headers,
        json={"parent_a_id": minions[0]["id"], "parent_b_id": minions[1]["id"]},
    )
    # 201 if eligible (different DNA, adults) OR 409 if not.
    assert body.status_code in {201, 409}


def test_fork_endpoint(client, headers):
    create = client.post(
        "/worlds",
        json={"name": "ForkRoute", "cpc_class": "G06F", "starting_population": 16},
        headers=headers,
    )
    wid = create.json()["id"]
    minions = client.get(f"/worlds/{wid}/minions?limit=1", headers=headers).json()
    mid = minions[0]["id"]
    res = client.post("/minions/fork", headers=headers, json={"minion_id": mid})
    assert res.status_code == 201
    clone = res.json()
    assert clone["forked_from_id"] == mid
    assert clone["alive"] is True


def test_lineage_endpoint(client, headers):
    create = client.post(
        "/worlds",
        json={"name": "Lineage", "cpc_class": "G06F", "starting_population": 16},
        headers=headers,
    )
    wid = create.json()["id"]
    minions = client.get(f"/worlds/{wid}/minions?limit=1", headers=headers).json()
    mid = minions[0]["id"]
    res = client.get(f"/minions/{mid}/lineage", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["root"] == mid
    assert isinstance(body["ancestors"], list)
    assert isinstance(body["descendants"], list)


def test_safety_check_blocks_red_line(client, headers):
    res = client.post(
        "/safety/check",
        headers=headers,
        json={"text": "improvised explosive device build guide"},
    )
    assert res.json()["blocked"] is True


def test_patent_search_route(client, headers):
    res = client.post(
        "/patents/search",
        headers=headers,
        json={"query": "display", "limit": 5, "only_expired": True},
    )
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_guild_list_includes_all_eleven(client, headers):
    res = client.get("/guilds", headers=headers)
    assert res.status_code == 200
    names = {g["name"] for g in res.json()}
    # 11 guilds total
    for required in ("Mathematics", "Physics", "Electrical", "Mechanical", "Civil",
                     "Materials", "Computing", "Energy", "Agriculture", "Patent", "Safety"):
        assert required in names, f"missing {required}"
