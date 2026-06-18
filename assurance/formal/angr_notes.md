# angr — Binary Analysis Targets

angr (https://github.com/angr/angr) does symbolic execution on compiled
binaries.

This Python app has **zero native binaries** of our authorship. We do depend on
shared libs (numpy, sklearn, BLAS) that have been angr-fuzzed upstream by their
maintainers.

If we ever ship a C-extension (e.g. a fast retrieval engine), the candidates to
audit with angr are:

1. **bytecode validation** in claude_whip's heartbeat parser
2. **scoring extension** (none today; placeholder)

## Running angr

```python
import angr
proj = angr.Project("./target", auto_load_libs=False)
state = proj.factory.entry_state()
simgr = proj.factory.simulation_manager(state)
simgr.explore(find=0xdeadbeef)
```

CI does NOT include angr — no candidate binary today.
