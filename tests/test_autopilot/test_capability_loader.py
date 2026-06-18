"""capability_loader: graceful on missing intelligence/*.json."""
import autopilot.control.capability_loader as cl


def test_load_all_returns_keys():
    out = cl.load_all()
    for k in ("capabilities", "subsystems", "resources", "planes",
              "dbs", "integration", "unknowns", "limitations"):
        assert k in out, f"missing key: {k}"


def test_load_subsystems_returns_dict():
    s = cl.load_subsystems()
    assert isinstance(s, dict)


def test_load_resources_returns_dict():
    r = cl.load_resources()
    assert isinstance(r, dict)
