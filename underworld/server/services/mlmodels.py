"""In-world trainable ML models (doc I.58).

The app gives Minions ML tooling, but a model is useless until trained on their
own data. Accuracy rises with the number of training samples following a learning
curve that saturates at a ceiling set by the trainer's computing skill — a weak
engineer never reaches the accuracy a master can. Trained models can then classify
(used probabilistically elsewhere in the sim).
"""

from __future__ import annotations

import math
import random

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import MLModel

SAMPLE_SCALE = 200.0    # samples needed to approach the ceiling
FLOOR = 0.5             # a coin-flip baseline before any learning


def ceiling_for_skill(skill_level: float) -> float:
    """Best achievable accuracy given a computing skill level (0..10)."""
    return round(FLOOR + 0.045 * max(0.0, min(10.0, skill_level)), 4)   # 0.5 → 0.95


def accuracy_for(samples: int, skill_level: float) -> float:
    ceiling = ceiling_for_skill(skill_level)
    learned = 1.0 - math.exp(-max(0, samples) / SAMPLE_SCALE)
    return round(FLOOR + (ceiling - FLOOR) * learned, 4)


async def train(
    session: AsyncSession, minion_id: str, task: str, *,
    new_samples: int, skill_level: float, tick: int,
) -> MLModel:
    model = (await session.execute(
        select(MLModel).where(MLModel.minion_id == minion_id, MLModel.task == task)
    )).scalars().first()
    if model is None:
        model = MLModel(minion_id=minion_id, task=task, samples=0, accuracy=0.0, updated_tick=tick)
        session.add(model)
    model.samples += max(0, new_samples)
    model.accuracy = accuracy_for(model.samples, skill_level)
    model.updated_tick = tick
    return model


def classify(model: MLModel, rng: random.Random) -> bool:
    """Return whether the model classifies a sample correctly this time."""
    return rng.random() < (model.accuracy or 0.0)


async def models_for(session: AsyncSession, minion_id: str) -> list[MLModel]:
    return list((await session.execute(
        select(MLModel).where(MLModel.minion_id == minion_id)
        .order_by(MLModel.accuracy.desc())
    )).scalars().all())
