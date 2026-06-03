"""Real robotics & kinematics simulation methods.

Eight named, real robotics methods, each computed from its canonical published
formula / algorithm and each verified in the test suite against a KNOWN value:

  1. two_link_forward_kinematics  — planar 2R arm FK; end-effector position
                                     x = l1 cos t1 + l2 cos(t1+t2),
                                     y = l1 sin t1 + l2 sin(t1+t2).
                                     KNOWN: l1=l2=1, t1=t2=0 -> (2, 0).
  2. two_link_inverse_kinematics  — planar 2R arm IK (geometric / law of cosines);
                                     verify the solved angles reach the target and
                                     round-trip through FK back to the target.
  3. two_link_jacobian            — velocity Jacobian J; det(J) = l1 l2 sin(t2);
                                     KNOWN singularity at full extension (t2 = 0).
  4. pd_joint_control             — PD setpoint regulation of a 2nd-order joint;
                                     KNOWN: a stable PD loop converges to the
                                     setpoint (zero steady-state error, no gravity).
  5. differential_drive_odometry  — exact unicycle / diff-drive dead reckoning;
                                     KNOWN: drive a closed square -> return to start.
  6. astar_grid_path              — A* (Manhattan heuristic) shortest path on a
                                     4-connected grid; KNOWN path length on an open
                                     grid = Manhattan distance |dx| + |dy|.
  7. projectile_range             — ballistic trajectory R = v^2 sin(2θ)/g;
                                     KNOWN: range is maximised at θ = 45°.
  8. homogeneous_transform        — SO(2)/SE(2) rotation & homogeneous transforms;
                                     KNOWN: Rot(90°) . Rot(90°) = Rot(180°).

Sources (verified):
  - 2R planar FK x=l1 cos t1 + l2 cos(t1+t2), y=l1 sin t1 + l2 sin(t1+t2)
    (MIT 2.12 Intro to Robotics, ch.4; Clemson "Forward Kinematics").
  - 2R Jacobian det(J) = l1 l2 sin(t2); singular when sin(t2)=0 (t2=0 full
    extension, t2=pi folded) (Columbia CS4733 "Kinematic Singularities and
    Jacobians"; Stanford CS223A).
  - PD/PID setpoint regulation: stable closed loop settles to setpoint
    (Ogata, Modern Control Engineering; Spong, Robot Modeling & Control).
  - Exact diff-drive odometry / unicycle integration (Siegwart, Intro to
    Autonomous Mobile Robots; Columbia "Differential Drive Robots").
  - A* optimal on consistent (Manhattan) heuristic; open-grid cost = Manhattan
    distance (Hart, Nilsson & Raphael 1968; Russell & Norvig AIMA).
  - Projectile range R = v^2 sin(2θ)/g, maximum at θ=45° (Halliday/Resnick;
    Wikipedia: Range of a projectile).
  - SO(2) rotation composition Rot(a) Rot(b) = Rot(a+b) (Wikipedia: Rotation
    matrix; Craig, Introduction to Robotics).
"""
from __future__ import annotations

import heapq

import numpy as np


# 1. FORWARD KINEMATICS — PLANAR 2R ARM --------------------------------------
def two_link_forward_kinematics(*, l1: float = 1.0, l2: float = 1.0,
                                theta1: float = 0.0, theta2: float = 0.0) -> dict:
    """Forward kinematics of a planar two-link (2R) revolute arm.

        x = l1 cos(t1) + l2 cos(t1 + t2)
        y = l1 sin(t1) + l2 sin(t1 + t2)

    The elbow (joint-2) position is the end of link 1, and the end-effector is
    the end of link 2. The end-effector orientation is t1 + t2.

    Known check: l1=l2=1, t1=t2=0 -> end-effector at (2, 0); reach = l1+l2.
    """
    elbow = np.array([l1 * np.cos(theta1), l1 * np.sin(theta1)])
    ee = np.array([
        l1 * np.cos(theta1) + l2 * np.cos(theta1 + theta2),
        l1 * np.sin(theta1) + l2 * np.sin(theta1 + theta2),
    ])
    return {
        "x": float(ee[0]),
        "y": float(ee[1]),
        "elbow_x": float(elbow[0]),
        "elbow_y": float(elbow[1]),
        "orientation_rad": float(theta1 + theta2),
        "max_reach": float(l1 + l2),
        "distance_from_base": float(np.hypot(ee[0], ee[1])),
    }


# 2. INVERSE KINEMATICS — PLANAR 2R ARM --------------------------------------
def two_link_inverse_kinematics(*, l1: float = 1.0, l2: float = 1.0,
                                x: float = 1.0, y: float = 1.0,
                                elbow_up: bool = True) -> dict:
    """Geometric inverse kinematics of a planar 2R arm (law of cosines).

        cos(t2) = (x^2 + y^2 - l1^2 - l2^2) / (2 l1 l2)
        t2 = +/- acos(...)              (elbow-down / elbow-up)
        t1 = atan2(y, x) - atan2(l2 sin t2, l1 + l2 cos t2)

    A target is reachable iff |l1 - l2| <= sqrt(x^2+y^2) <= l1 + l2.

    Known check: the solved (t1, t2) fed through forward kinematics reproduce
    the requested (x, y) target (FK/IK round-trip closes to machine precision).
    """
    r2 = x * x + y * y
    r = np.sqrt(r2)
    reachable = bool(abs(l1 - l2) - 1e-12 <= r <= l1 + l2 + 1e-12)
    cos_t2 = (r2 - l1 * l1 - l2 * l2) / (2.0 * l1 * l2)
    cos_t2 = float(np.clip(cos_t2, -1.0, 1.0))
    sin_t2 = np.sqrt(max(0.0, 1.0 - cos_t2 * cos_t2))
    if elbow_up:
        sin_t2 = -sin_t2          # elbow-up branch (t2 < 0)
    theta2 = float(np.arctan2(sin_t2, cos_t2))
    theta1 = float(np.arctan2(y, x)
                   - np.arctan2(l2 * np.sin(theta2), l1 + l2 * np.cos(theta2)))
    # round-trip through forward kinematics to verify
    fk = two_link_forward_kinematics(l1=l1, l2=l2, theta1=theta1, theta2=theta2)
    err = float(np.hypot(fk["x"] - x, fk["y"] - y))
    return {
        "theta1": theta1,
        "theta2": theta2,
        "reachable": reachable,
        "fk_x": fk["x"],
        "fk_y": fk["y"],
        "roundtrip_error": err,
    }


# 3. JACOBIAN — VELOCITY MAPPING & SINGULARITY -------------------------------
def two_link_jacobian(*, l1: float = 1.0, l2: float = 1.0,
                      theta1: float = 0.0, theta2: float = 0.0) -> dict:
    """Velocity Jacobian of a planar 2R arm and its singularity analysis.

        J = [[-l1 s1 - l2 s12,  -l2 s12],
             [ l1 c1 + l2 c12,   l2 c12]]
        det(J) = l1 l2 sin(t2)

    The arm is at a singularity (loses an instantaneous Cartesian DOF) when
    det(J) = 0, i.e. sin(t2) = 0 -> t2 = 0 (fully extended) or t2 = pi (folded).

    Known check: t2 = 0 (full extension) -> det(J) = 0, singular = True.
    """
    s1, c1 = np.sin(theta1), np.cos(theta1)
    s12, c12 = np.sin(theta1 + theta2), np.cos(theta1 + theta2)
    J = np.array([
        [-l1 * s1 - l2 * s12, -l2 * s12],
        [l1 * c1 + l2 * c12, l2 * c12],
    ])
    det = float(np.linalg.det(J))
    det_closed_form = float(l1 * l2 * np.sin(theta2))
    singular = bool(abs(det) < 1e-9)
    # map a unit joint velocity to end-effector (Cartesian) velocity
    qdot = np.array([1.0, 1.0])
    cart_vel = J @ qdot
    return {
        "jacobian": J.tolist(),
        "determinant": det,
        "determinant_closed_form": det_closed_form,
        "singular": singular,
        "manipulability": float(abs(det)),
        "end_effector_velocity": cart_vel.tolist(),
    }


# 4. PD JOINT CONTROL — SETPOINT REGULATION ----------------------------------
def pd_joint_control(*, inertia: float = 1.0, kp: float = 100.0, kd: float = 20.0,
                     setpoint: float = 1.0, theta0: float = 0.0,
                     dt: float = 1e-3, t_end: float = 5.0) -> dict:
    """PD setpoint regulation of a single 2nd-order joint (no gravity load).

        I * theta_ddot = -Kp (theta - setpoint) - Kd theta_dot          (torque)

    The closed loop is  I s^2 + Kd s + Kp = 0; with Kp,Kd > 0 it is stable, so
    theta -> setpoint with zero steady-state error. Critical damping at
    Kd = 2 sqrt(Kp I). Integrated here with semi-implicit (symplectic) Euler.

    Known check: stable PD loop converges to the setpoint
    (|theta_final - setpoint| ~ 0) and settles within the 2% band.
    """
    n = int(round(t_end / dt))
    theta = float(theta0)
    omega = 0.0
    band = 0.02 * abs(setpoint - theta0) if setpoint != theta0 else 0.02
    settle_time = None
    traj = np.empty(n + 1)
    traj[0] = theta
    for i in range(n):
        torque = -kp * (theta - setpoint) - kd * omega
        alpha = torque / inertia
        omega += alpha * dt
        theta += omega * dt           # semi-implicit Euler
        traj[i + 1] = theta
        if settle_time is None and abs(theta - setpoint) <= band:
            settle_time = (i + 1) * dt
    damping_ratio = kd / (2.0 * np.sqrt(kp * inertia))
    return {
        "final_angle": float(theta),
        "setpoint": float(setpoint),
        "steady_state_error": float(setpoint - theta),
        "settling_time_s": settle_time,
        "damping_ratio": float(damping_ratio),
        "stable": bool(kp > 0 and kd > 0),
        "converged": bool(abs(setpoint - theta) < 1e-3),
    }


# 5. DIFFERENTIAL-DRIVE ODOMETRY ---------------------------------------------
def differential_drive_odometry(*, commands=None, wheel_base: float = 0.5,
                                x0: float = 0.0, y0: float = 0.0,
                                theta0: float = 0.0, dt: float = 0.01) -> dict:
    """Exact dead-reckoning odometry for a differential-drive (unicycle) robot.

    Each command is (v, omega, duration): forward speed v (m/s) and turn rate
    omega (rad/s) held for `duration` seconds. Exact integration of the
    unicycle model:
        if omega ~ 0:  straight line of length v*dt
        else:          arc, dtheta = omega*dt,
                       x += (v/omega)(sin(th+dth) - sin th)
                       y += -(v/omega)(cos(th+dth) - cos th)

    Known check: a closed square path (4 sides + 4 ninety-degree turns) returns
    the robot to its start pose (x,y,theta back to the origin, mod 2pi).
    """
    if commands is None:
        commands = []
    x, y, th = float(x0), float(y0), float(theta0)
    path = [(x, y, th)]
    total_distance = 0.0
    for v, omega, duration in commands:
        steps = max(1, int(round(duration / dt)))
        h = duration / steps
        for _ in range(steps):
            if abs(omega) < 1e-9:
                x += v * np.cos(th) * h
                y += v * np.sin(th) * h
            else:
                dth = omega * h
                x += (v / omega) * (np.sin(th + dth) - np.sin(th))
                y += -(v / omega) * (np.cos(th + dth) - np.cos(th))
                th += dth
            total_distance += abs(v) * h
            path.append((x, y, th))
    th_wrapped = float((th + np.pi) % (2.0 * np.pi) - np.pi)
    return {
        "x": float(x),
        "y": float(y),
        "theta": float(th),
        "theta_wrapped": th_wrapped,
        "distance_traveled": float(total_distance),
        "path_length_points": len(path),
    }


# 6. A* / DIJKSTRA GRID PATH PLANNING ----------------------------------------
def astar_grid_path(*, grid=None, start=(0, 0), goal=None,
                    allow_diagonal: bool = False) -> dict:
    """A* shortest path on a 4-connected occupancy grid (Manhattan heuristic).

    `grid` is a 2D array of 0 (free) / 1 (obstacle). Moves cost 1. The Manhattan
    heuristic is admissible & consistent for 4-connected grids, so A* returns an
    optimal path. On an obstacle-free grid the optimal cost equals the Manhattan
    distance |dx| + |dy| between start and goal.

    Known check: open 5x5 grid, (0,0)->(4,4) -> path length (cost) = 8 = 4 + 4.
    """
    if grid is None:
        grid = [[0] * 5 for _ in range(5)]
    g = np.asarray(grid, dtype=int)
    rows, cols = g.shape
    if goal is None:
        goal = (rows - 1, cols - 1)
    start = tuple(start)
    goal = tuple(goal)

    if allow_diagonal:
        moves = [(-1, 0), (1, 0), (0, -1), (0, 1),
                 (-1, -1), (-1, 1), (1, -1), (1, 1)]

        def h(a, b):  # Chebyshev (admissible for diagonal moves of unit cost)
            return max(abs(a[0] - b[0]), abs(a[1] - b[1]))

        def step_cost(dr, dc):
            return np.sqrt(2.0) if dr and dc else 1.0
    else:
        moves = [(-1, 0), (1, 0), (0, -1), (0, 1)]

        def h(a, b):  # Manhattan (admissible & consistent for 4-connected)
            return abs(a[0] - b[0]) + abs(a[1] - b[1])

        def step_cost(dr, dc):
            return 1.0

    open_heap = [(h(start, goal), 0.0, start)]
    g_score = {start: 0.0}
    came_from: dict = {}
    visited = set()
    while open_heap:
        _, cost, node = heapq.heappop(open_heap)
        if node in visited:
            continue
        visited.add(node)
        if node == goal:
            # reconstruct
            path = [node]
            while node in came_from:
                node = came_from[node]
                path.append(node)
            path.reverse()
            return {
                "found": True,
                "cost": float(cost),
                "path": [list(p) for p in path],
                "num_nodes": len(path),
                "nodes_expanded": len(visited),
                "manhattan_lower_bound": int(h(start, goal)),
            }
        r, c = node
        for dr, dc in moves:
            nr, nc = r + dr, c + dc
            if not (0 <= nr < rows and 0 <= nc < cols):
                continue
            if g[nr, nc] == 1:
                continue
            tentative = cost + step_cost(dr, dc)
            nxt = (nr, nc)
            if tentative < g_score.get(nxt, float("inf")):
                g_score[nxt] = tentative
                came_from[nxt] = node
                heapq.heappush(open_heap, (tentative + h(nxt, goal), tentative, nxt))
    return {
        "found": False,
        "cost": float("inf"),
        "path": [],
        "num_nodes": 0,
        "nodes_expanded": len(visited),
        "manhattan_lower_bound": int(h(start, goal)),
    }


# 7. PROJECTILE / TRAJECTORY -------------------------------------------------
def projectile_range(*, speed: float = 20.0, angle_deg: float = 45.0,
                     g: float = 9.80665, height0: float = 0.0) -> dict:
    """Ballistic projectile launched over flat ground (no drag).

        Range (level ground)    R = v^2 sin(2θ) / g
        Time of flight          T = 2 v sin θ / g
        Max height              H = (v sin θ)^2 / (2 g)

    For launch from ground level the range is maximised at θ = 45°, where
    sin(2θ) = 1. (With initial height > 0 the optimum angle is below 45°.)

    Known check: θ = 45° maximises range; R(45°) = v^2/g.
    """
    th = np.radians(angle_deg)
    vx = speed * np.cos(th)
    vy = speed * np.sin(th)
    if height0 <= 0.0:
        flight_time = 2.0 * vy / g
        rng = speed * speed * np.sin(2.0 * th) / g
    else:
        # solve height0 + vy t - 0.5 g t^2 = 0 for positive t
        flight_time = (vy + np.sqrt(vy * vy + 2.0 * g * height0)) / g
        rng = vx * flight_time
    max_height = height0 + vy * vy / (2.0 * g)
    return {
        "range": float(rng),
        "flight_time": float(flight_time),
        "max_height": float(max_height),
        "vx": float(vx),
        "vy": float(vy),
        "angle_deg": float(angle_deg),
    }


def projectile_optimal_angle(*, speed: float = 20.0, g: float = 9.80665,
                             height0: float = 0.0) -> dict:
    """Scan launch angles and report the one that maximises range.

    Known check: for ground-level launch the maximum-range angle is 45°.
    """
    angles = np.linspace(1.0, 89.0, 8801)
    ranges = np.array([projectile_range(speed=speed, angle_deg=a, g=g,
                                        height0=height0)["range"] for a in angles])
    idx = int(np.argmax(ranges))
    return {
        "optimal_angle_deg": float(angles[idx]),
        "max_range": float(ranges[idx]),
    }


# 8. ROTATION / HOMOGENEOUS TRANSFORM COMPOSITION ----------------------------
def _rot2(angle_rad: float) -> np.ndarray:
    c, s = np.cos(angle_rad), np.sin(angle_rad)
    return np.array([[c, -s], [s, c]])


def _homog2(angle_rad: float, tx: float, ty: float) -> np.ndarray:
    c, s = np.cos(angle_rad), np.sin(angle_rad)
    return np.array([[c, -s, tx], [s, c, ty], [0.0, 0.0, 1.0]])


def homogeneous_transform(*, angle1_deg: float = 90.0, angle2_deg: float = 90.0,
                          t1=(0.0, 0.0), t2=(0.0, 0.0),
                          point=(1.0, 0.0)) -> dict:
    """SO(2) rotation and SE(2) homogeneous-transform composition.

    A planar rotation matrix R(a) and homogeneous transform T(a, t) compose by
    matrix multiplication. For pure rotations R(a) R(b) = R(a+b), so two 90°
    rotations equal one 180° rotation.

    Known check: Rot(90°) . Rot(90°) == Rot(180°)  (and applied to (1,0)
    yields (-1,0)); composed homogeneous transforms equal T(a+b, ...).
    """
    a1, a2 = np.radians(angle1_deg), np.radians(angle2_deg)
    R1, R2 = _rot2(a1), _rot2(a2)
    R_comp = R1 @ R2
    R_sum = _rot2(a1 + a2)
    rotation_matches_sum = bool(np.allclose(R_comp, R_sum))

    T1 = _homog2(a1, t1[0], t1[1])
    T2 = _homog2(a2, t2[0], t2[1])
    T_comp = T1 @ T2

    p = np.array([point[0], point[1], 1.0])
    transformed = T_comp @ p
    rotated_point = R_comp @ np.array(point)

    # orthonormality: a rotation matrix satisfies R R^T = I, det = +1
    orthonormal = bool(np.allclose(R_comp @ R_comp.T, np.eye(2)))
    determinant = float(np.linalg.det(R_comp))
    return {
        "rotation_composed": R_comp.tolist(),
        "rotation_sum": R_sum.tolist(),
        "rotation_matches_sum": rotation_matches_sum,
        "composed_angle_deg": float(angle1_deg + angle2_deg),
        "rotated_point": rotated_point.tolist(),
        "transformed_point": transformed[:2].tolist(),
        "orthonormal": orthonormal,
        "determinant": determinant,
    }
