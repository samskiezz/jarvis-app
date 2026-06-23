"""Assign tracked players to home/away teams by dominant jersey colour."""
from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.cluster import KMeans


class TeamAssigner:
    """K-means on torso-colour histograms to split players into two teams."""

    def __init__(self, n_clusters: int = 2) -> None:
        self.n_clusters = n_clusters
        self._kmeans: KMeans | None = None
        self._team_labels: dict[int, str] = {}  # tracker_id -> "home"/"away"/"keeper"
        self._gk_ids: set[int] = set()

    @staticmethod
    def _torso_colour(frame: np.ndarray, box: np.ndarray) -> np.ndarray:
        """Extract dominant HSV colour from the upper-central torso region."""
        x1, y1, x2, y2 = box.astype(int)
        h = max(1, y2 - y1)
        w = max(1, x2 - x1)
        # central torso slice
        y1t = y1 + int(h * 0.2)
        y2t = y1 + int(h * 0.5)
        x1t = x1 + int(w * 0.25)
        x2t = x2 - int(w * 0.25)
        if x2t <= x1t or y2t <= y1t:
            x1t, x2t = x1, x2
            y1t, y2t = y1, y2
        patch = frame[y1t:y2t, x1t:x2t]
        if patch.size == 0:
            return np.zeros(3)
        # Convert BGR -> HSV and take mean.
        import cv2
        hsv = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)
        return np.mean(hsv.reshape(-1, 3), axis=0)

    def fit(self, frames: list[np.ndarray], tracks: list[Any]) -> None:
        """Collect torso colours over a window and cluster into two teams."""
        colours: list[np.ndarray] = []
        ids: list[int] = []
        for frame, ft in zip(frames, tracks):
            if len(ft.player_ids) == 0:
                continue
            for pid, box in zip(ft.player_ids, ft.player_boxes):
                colours.append(self._torso_colour(frame, box))
                ids.append(int(pid))
        if len(colours) < self.n_clusters * 4:
            # Not enough data — fallback to left/right heuristic.
            return
        X = np.vstack(colours)
        # Use robust mini-batch kmeans if many samples.
        if len(X) > 5000:
            from sklearn.cluster import MiniBatchKMeans
            self._kmeans = MiniBatchKMeans(n_clusters=self.n_clusters, n_init=3, random_state=0).fit(X)
        else:
            self._kmeans = KMeans(n_clusters=self.n_clusters, n_init=10, random_state=0).fit(X)

        # Assign cluster 0 -> home, cluster 1 -> away by jersey brightness heuristic.
        centres = self._kmeans.cluster_centers_
        # Brighter (higher Value channel on average) -> home (often light kit).
        bright_order = np.argsort(centres[:, 2])[::-1]
        self._label_map = {int(bright_order[0]): "home", int(bright_order[1]): "away"}

        # Keeper = player who is often alone near goal areas (simplified: tallest box).
        self._gk_ids = self._detect_keepers(tracks)

    def _detect_keepers(self, tracks: list[Any]) -> set[int]:
        """Heuristic: the tallest player in each team is likely the keeper."""
        heights: dict[int, list[float]] = {}
        for ft in tracks:
            for pid, box in zip(ft.player_ids, ft.player_boxes):
                heights.setdefault(int(pid), []).append(float(box[3] - box[1]))
        if not heights:
            return set()
        avg_h = {pid: np.mean(vals) for pid, vals in heights.items()}
        # Keep top 2 tallest distinct players.
        sorted_ids = sorted(avg_h, key=avg_h.get, reverse=True)[:2]
        return set(sorted_ids)

    def predict(self, frame: np.ndarray, tracker_id: int, box: np.ndarray) -> str:
        if tracker_id in self._gk_ids:
            return "keeper"
        if self._kmeans is None:
            # Fallback: left half of frame = home.
            cx = (box[0] + box[2]) / 2.0
            return "home" if cx < frame.shape[1] / 2 else "away"
        colour = self._torso_colour(frame, box).reshape(1, -1)
        cluster = int(self._kmeans.predict(colour)[0])
        return self._label_map.get(cluster, "unknown")
