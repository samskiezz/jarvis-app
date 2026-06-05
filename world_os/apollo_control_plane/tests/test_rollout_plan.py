
from apollo_control_plane.rollout_planner.rollout_planner import create_rollout_plan

def test_create_rollout_plan():
    plan = create_rollout_plan("runtime_core", "0.7.0", ["n1","n2"], wave_size=1)
    assert len(plan["waves"]) == 2
    assert plan["rollback_on_failed_gate"] is True
