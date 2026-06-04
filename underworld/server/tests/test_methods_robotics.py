"""Each robotics / kinematics method must reproduce its KNOWN result.

Every assertion below is checked against a published / textbook value with an
explicit tolerance and citation.
"""
import math

import numpy as np

from underworld.server.services.methods_robotics import (
    two_link_forward_kinematics,
    two_link_inverse_kinematics,
    two_link_jacobian,
    pd_joint_control,
    differential_drive_odometry,
    astar_grid_path,
    projectile_range,
    projectile_optimal_angle,
    homogeneous_transform,
)


# 1. FORWARD KINEMATICS — planar 2R end-effector position.
#    KNOWN: l1=l2=1, t1=t2=0 -> arm straight along +x, end-effector at (2,0)
#    (MIT 2.12 Intro to Robotics ch.4; Clemson "Forward Kinematics").
def test_forward_kinematics_known_position():
    r = two_link_forward_kinematics(l1=1.0, l2=1.0, theta1=0.0, theta2=0.0)
    assert abs(r["x"] - 2.0) < 1e-12
    assert abs(r["y"] - 0.0) < 1e-12
    assert abs(r["max_reach"] - 2.0) < 1e-12
    # right angle at the elbow: t1=0, t2=90deg -> (1,1)
    r2 = two_link_forward_kinematics(l1=1.0, l2=1.0, theta1=0.0,
                                     theta2=math.pi / 2.0)
    assert abs(r2["x"] - 1.0) < 1e-12
    assert abs(r2["y"] - 1.0) < 1e-12


# 2. INVERSE KINEMATICS — angles reach the target, round-trip with FK.
#    KNOWN: a reachable (x,y) solved by geometric IK, then pushed back through
#    FK, returns the same (x,y) to machine precision (Spong, Robot Modeling).
def test_inverse_kinematics_roundtrip():
    target = (1.2, 0.8)
    ik = two_link_inverse_kinematics(l1=1.0, l2=1.0, x=target[0], y=target[1])
    assert ik["reachable"] is True
    assert ik["roundtrip_error"] < 1e-9
    fk = two_link_forward_kinematics(l1=1.0, l2=1.0,
                                     theta1=ik["theta1"], theta2=ik["theta2"])
    assert abs(fk["x"] - target[0]) < 1e-9
    assert abs(fk["y"] - target[1]) < 1e-9
    # unreachable target beyond max reach is flagged
    far = two_link_inverse_kinematics(l1=1.0, l2=1.0, x=5.0, y=0.0)
    assert far["reachable"] is False


# 3. JACOBIAN — det(J) = l1 l2 sin(t2); singularity at full extension.
#    KNOWN: t2=0 (arm fully extended) -> det(J)=0, singular
#    (Columbia CS4733 "Kinematic Singularities and Jacobians").
def test_jacobian_singularity_full_extension():
    sing = two_link_jacobian(l1=1.0, l2=1.0, theta1=0.3, theta2=0.0)
    assert abs(sing["determinant"]) < 1e-9
    assert sing["singular"] is True
    # non-singular elbow at 90deg -> det = l1 l2 sin(90) = 1
    nonsing = two_link_jacobian(l1=1.0, l2=1.0, theta1=0.3,
                                theta2=math.pi / 2.0)
    assert nonsing["singular"] is False
    assert abs(nonsing["determinant"] - 1.0) < 1e-9
    # numeric det matches closed form l1 l2 sin(t2)
    assert abs(nonsing["determinant"] - nonsing["determinant_closed_form"]) < 1e-9


# 4. PD CONTROL — stable PD loop converges to the setpoint.
#    KNOWN: with Kp,Kd>0 the 2nd-order joint loop is stable and reaches the
#    setpoint with zero steady-state error (Ogata, Modern Control Engineering).
def test_pd_control_converges_to_setpoint():
    r = pd_joint_control(inertia=1.0, kp=100.0, kd=20.0, setpoint=1.0,
                         theta0=0.0)
    assert r["stable"] is True
    assert r["converged"] is True
    assert abs(r["steady_state_error"]) < 1e-3
    assert r["settling_time_s"] is not None
    # Kd = 2 sqrt(Kp I) = 20 -> critically damped
    assert abs(r["damping_ratio"] - 1.0) < 1e-9


# 5. DIFF-DRIVE ODOMETRY — closed square returns to start.
#    KNOWN: drive a unit square (4 straight sides + 4 ninety-degree turns) and
#    the robot returns to its starting pose (Siegwart, Autonomous Mobile Robots).
def test_diff_drive_closed_square():
    # forward 1 m at 1 m/s for 1 s, then turn +90deg (pi/2 rad/s for 1 s); x4.
    turn = (0.0, math.pi / 2.0, 1.0)
    fwd = (1.0, 0.0, 1.0)
    commands = [fwd, turn, fwd, turn, fwd, turn, fwd, turn]
    r = differential_drive_odometry(commands=commands, x0=0.0, y0=0.0,
                                    theta0=0.0)
    assert abs(r["x"] - 0.0) < 1e-9
    assert abs(r["y"] - 0.0) < 1e-9
    assert abs(r["theta_wrapped"] - 0.0) < 1e-9
    assert abs(r["distance_traveled"] - 4.0) < 1e-9   # 4 sides of 1 m

    # pure straight-line drive: 2 m forward along +x
    line = differential_drive_odometry(commands=[(2.0, 0.0, 1.0)])
    assert abs(line["x"] - 2.0) < 1e-9
    assert abs(line["y"] - 0.0) < 1e-9


# 6. A* PATH PLANNING — open-grid shortest cost = Manhattan distance.
#    KNOWN: A* with admissible/consistent Manhattan heuristic is optimal; on an
#    obstacle-free 4-connected grid the cost = |dx|+|dy| (Hart/Nilsson/Raphael
#    1968; Russell & Norvig AIMA).
def test_astar_open_grid_manhattan():
    r = astar_grid_path(start=(0, 0), goal=(4, 4))   # default open 5x5 grid
    assert r["found"] is True
    assert abs(r["cost"] - 8.0) < 1e-9               # 4 + 4 Manhattan
    assert r["cost"] == r["manhattan_lower_bound"]
    assert r["num_nodes"] == 9                        # 8 steps -> 9 cells

    # wall forces a detour: longer than the Manhattan lower bound
    grid = [
        [0, 0, 0, 0, 0],
        [1, 1, 1, 1, 0],
        [0, 0, 0, 0, 0],
        [0, 1, 1, 1, 1],
        [0, 0, 0, 0, 0],
    ]
    w = astar_grid_path(grid=grid, start=(0, 0), goal=(4, 4))
    assert w["found"] is True
    assert w["cost"] > w["manhattan_lower_bound"]

    # fully blocked goal -> no path
    blocked = [[0, 1], [1, 1]]
    nb = astar_grid_path(grid=blocked, start=(0, 0), goal=(1, 1))
    assert nb["found"] is False


# 7. PROJECTILE — range maximised at 45deg; R(45) = v^2/g.
#    KNOWN: R = v^2 sin(2θ)/g, maximum at θ=45deg (Halliday/Resnick;
#    Wikipedia: Range of a projectile).
def test_projectile_max_range_at_45():
    opt = projectile_optimal_angle(speed=20.0)
    assert abs(opt["optimal_angle_deg"] - 45.0) < 0.05
    r45 = projectile_range(speed=20.0, angle_deg=45.0)
    assert abs(r45["range"] - 20.0 ** 2 / 9.80665) < 1e-6   # v^2/g
    # symmetry: 30deg and 60deg give equal range (sin(2θ) symmetric about 45)
    r30 = projectile_range(speed=20.0, angle_deg=30.0)
    r60 = projectile_range(speed=20.0, angle_deg=60.0)
    assert abs(r30["range"] - r60["range"]) < 1e-9
    assert r45["range"] > r30["range"]                       # 45 is the max


# 8. TRANSFORMS — Rot(90)+Rot(90) == Rot(180).
#    KNOWN: SO(2) rotation composition R(a)R(b)=R(a+b) (Wikipedia: Rotation
#    matrix; Craig, Introduction to Robotics).
def test_rotation_composition_90_plus_90():
    r = homogeneous_transform(angle1_deg=90.0, angle2_deg=90.0, point=(1.0, 0.0))
    assert r["rotation_matches_sum"] is True
    expected_180 = np.array([[-1.0, 0.0], [0.0, -1.0]])
    assert np.allclose(np.array(r["rotation_composed"]), expected_180, atol=1e-12)
    # (1,0) rotated by 180deg -> (-1,0)
    assert abs(r["rotated_point"][0] - (-1.0)) < 1e-12
    assert abs(r["rotated_point"][1] - 0.0) < 1e-12
    # valid rotation: orthonormal with determinant +1
    assert r["orthonormal"] is True
    assert abs(r["determinant"] - 1.0) < 1e-12
