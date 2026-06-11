# Celestial Menu Missing Feature / Function List

This list is for the JARVIS celestial UI: not a game, but using modern game-menu streaming discipline so the first screen is usable fast and details stream in progressively.

## Current Acceptance Standard

Only current code and fresh verification count as truth. Older vision docs are background only.

- Every camera mode must render the same loaded celestial hierarchy after the stage queue is flushed.
- Explore mode must frame the loaded 3D universe, not a static guessed position.
- The index is only a controller; every result must select or promote a 3D body.
- Search must remain 3D: select an existing body, select a real domain body, or create a promoted 3D search body.
- Dust must have visible tiny GLB samples plus aggregate counts; it must not be only abstract text.
- Planets, moons, meteorites, satellites, file moons, and dust samples must all be selectable where loaded.
- New repo/database entries must flow through `/celestial`, `/search`, `/children`, `/detail`, or `/metrics` without hand-editing layout coordinates.
- A camera-mode parity proof must compare Equator, Explore, and Focus counts after streaming is complete.

1. First-playable-screen budget: core, closest planets, dock, chat, and search must be usable before lower detail finishes loading.
2. Asset priority lanes: planets first, visible moons second, file moons third, meteorites/satellites fourth, dust samples last.
3. Distance-based GLB priority: camera-nearest queued assets load before far assets.
4. Mobile load cap: lower concurrent GLB count on phones/tablets.
5. Desktop load cap: higher but still bounded concurrent GLB count.
6. Idle-time detail streaming: non-critical bodies build during idle frames.
7. Frame budget guard: staged construction should stop when a frame takes too long.
8. Duplicate guard by repo id: each repo celestial node renders once.
9. Duplicate guard by body name: no repeated Three.js body entries after refresh.
10. Duplicate guard by shortcut id: no repeated card shortcuts.
11. Planet shortcut menu: each planet card lists its moons and top repo children.
12. Moon shortcut menu: each moon card lists meteorites, satellites, file moons, and parent back-link.
13. Meteorite shortcut menu: each meteorite card links to parent and relevant actions.
14. Satellite action menu: satellites represent final actions/tools and must execute or explain unavailable state.
15. Dust sample cards: tiny dust GLBs show source/parent and link back upward.
16. Dust aggregate counts: cards show full dust counts without loading all dust as GLBs.
17. Search-promoted dust: search should promote matching dust records into visible tiny GLBs.
18. Focus mode streaming: entering a planet should stream more children for that planet.
19. Unfocus cleanup: far lower-tier detail can unload or downshift after leaving a focus area.
20. Camera breadcrumb: show current path from core to planet/moon/meteorite/satellite.
21. Controller-like navigation: arrow/WASD/keyboard focus between celestial shortcuts.
22. Touch navigation: tap body, tap label, pinch/drag, and accessible fallback list.
23. Label density mode: full labels near focus, reduced labels at overview.
24. Label collision reduction: avoid unreadable overlap in busy systems.
25. Selection ring: selected body needs a clear non-destructive visual state.
26. Hover/press feedback: body and label react without changing the design language.
27. Progressive orbit reveal: orbits for focused family appear before distant orbits.
28. Relationship orbit spacing: children spacing should use parent size, child count, importance, and relationship.
29. Importance-based start layout: most used/core features closest to the centre orb.
30. Live status weighting: active alerts, GPU pressure, failed workers, and current tasks can move/promote bodies.
31. Time-slice updates: live refresh should update cards and metrics without rebuilding the whole scene.
32. Streaming status indicator: subtle loader tells the user detail is still streaming.
33. “Loaded detail” count: debug/developer panel can show planets/moons/GLBs queued/loaded.
34. GLB fallback material: if a GLB fails, keep a holographic fallback body.
35. Retry failed assets later: failed detail can retry after the first screen is stable.
36. Cache reuse: same GLB asset should clone from cache instead of fetching repeatedly.
37. Memory pressure mode: lower detail and cap particles when device struggles.
38. Reduced-motion mode: keep hierarchy functional without heavy animation.
39. Tab-hidden pause: pause animation and streaming pressure when browser tab is hidden.
40. Card action availability: disabled/unavailable actions should explain why, not silently fail.
41. Screen-reader equivalent: every 3D stage should have a list/menu equivalent.
42. Command search: typing a feature name should fly to the matching body.
43. Recent destinations: keep quick shortcuts to recently used planets/functions.
44. Critical queue: warnings/alerts should spawn near the relevant parent as meteorites.
45. Data freshness badge: cards should show whether data is live, cached, or unavailable.
46. World rebuild protection: refresh should patch existing bodies instead of duplicating.
47. Snapshot proof route: expose lightweight counts for automated render tests.
48. Mobile viewport proof: desktop, tablet, and phone screenshots must be checked before push.
49. Performance proof: record body counts, GLB queue, errors, and frame health after load.
50. Safe rollout rule: preview locally before pushing live to main.
