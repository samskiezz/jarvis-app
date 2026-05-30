from underworld.server.world import seed as world_seed


def test_seed_deterministic():
    a = world_seed.derive_seed("H02J")
    b = world_seed.derive_seed("H02J")
    assert a == b
    assert a.seed_int > 0


def test_different_classes_differ():
    a = world_seed.derive_seed("G06F")
    b = world_seed.derive_seed("F03D")
    assert a.seed_int != b.seed_int
    assert a.biome_hint != b.biome_hint or a.elevation_bias != b.elevation_bias


def test_heightmap_in_range():
    seed = world_seed.derive_seed("E04F")
    grid = world_seed.heightmap(seed, size=16)
    assert len(grid) == 16
    assert all(len(row) == 16 for row in grid)
    for row in grid:
        for v in row:
            assert 0.0 <= v <= 1.0


def test_heightmap_deterministic():
    s = world_seed.derive_seed("H02J")
    g1 = world_seed.heightmap(s, size=8)
    g2 = world_seed.heightmap(s, size=8)
    assert g1 == g2
