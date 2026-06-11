# JARVIS Celestial OS — Repo-to-Universe Mapping and Orbit Specification

Generated: 2026-06-10T12:14:48.106467Z

## Core hierarchy

Apex Core / Arc Hologram > Planet > Moon > Meteorite > Satellite > Dust.

Documents, individual notes, log lines, raw files, database rows, low-centrality graph nodes, old events and low-importance records are **dust by default**. They are GPU-instanced particles only. Search or active workflow can temporarily promote one dust item into a meteorite.

## Navigation flow

1. Home: JARVIS Apex Core is centered. Only important planets are visible.
2. Planet focus: selected planet reveals moons.
3. Moon focus: selected moon reveals top meteorites and a soft dust cloud.
4. Meteorite focus: selected meteorite reveals satellites/actions.
5. Satellite click: execute/open/inspect/control.

## Equations

### Importance

```
I = clamp01(0.22M + 0.16U + 0.14C + 0.14A + 0.12S + 0.10G + 0.08Q + 0.04R)
```

Where M=manual priority, U=usage log-normalised, C=child count log-normalised, A=active workflow, S=severity, G=graph centrality, Q=user intent match, R=recency.

### Planet distance from Apex Core

```
D(I) = 220 + (1 - I)^1.35 * (850 - 220)
```

### Forward cone placement

```
theta_i = laneOffset + i * 137.50776deg
x = cos(theta_i) * D * (0.34 + (1 - I) * 0.34)
y = sin(theta_i) * D * (0.22 + (1 - I) * 0.24)
z = -D
```

### Scale contract

```
Apex Core = 48
Planet radius = lerp(10, 34, I^0.72)
Moon radius = parentPlanetRadius * lerp(0.26, 0.42, I^0.72)
Meteorite radius = parentMoonRadius * lerp(0.12, 0.22, I^0.72)
Satellite radius = parentMeteoriteRadius * lerp(0.06, 0.12, I^0.72)
Dust radius = lerp(0.08, 0.45, I^1.4)
```

### Orbit equation

For a child orbiting a parent:

```
omega = baseSpeed(kind) * (0.55 + I * 0.75) / sqrt(max(orbitRadius, 1) / 50)
phi0 = hash(id) * 2*pi
alpha(t) = phi0 + omega * t
x(t) = a * cos(alpha)
z(t) = b * sin(alpha)
y(t) = sin(alpha * 1.7 + phi0) * inclinationAmplitude
```

`a` is orbitRadius. `b = orbitRadius * (1 - 0.18 * (1 - relationshipStrength))`.

## Replication rule

Run `scan_repo_to_celestial_index.py` from the repo root after every merge/build. It produces a deterministic `celestial_index.generated.json` and `celestial_index.generated.csv`. The Three.js layer should load that index and only render objects permitted by the current camera mode.
