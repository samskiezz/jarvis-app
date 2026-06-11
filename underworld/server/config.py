"""Underworld configuration loaded from environment.

Pydantic-settings handles validation. Defaults are suitable for `python -m
uvicorn underworld.server.main:app --reload` with no env at all.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


_DATA_DIR = Path(__file__).resolve().parent.parent / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="UNDERWORLD_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Auth
    api_key: str = Field(default="dev-key", description="Bearer token required on protected routes")

    # CORS
    cors_origins: list[str] = Field(
        default=[
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
        ],
    )

    # Database
    db_path: Path = Field(default=_DATA_DIR / "underworld.db")

    # LLM (Kimi K2)
    kimi_base_url: str = "https://api.moonshot.ai/v1"
    kimi_api_key: str = ""
    # moonshot-v1-32k is a non-reasoning chat model that emits content
    # directly (not via reasoning_content) and accepts the agent's prompt
    # format + temperature=0.7. The k2.x reasoning models leave content
    # empty until they finish reasoning, which blows our 512-token budget.
    kimi_model: str = "moonshot-v1-32k"
    kimi_temperature: float = 0.7
    kimi_max_tokens: int = 1024

    # Generic OpenAI-compatible LLM provider. Set these to run on a FREE Llama:
    #   Groq      → base_url=https://api.groq.com/openai/v1, model=llama-3.1-8b-instant
    #   OpenRouter→ base_url=https://openrouter.ai/api/v1, model=meta-llama/llama-3.1-8b-instruct:free
    #   Ollama    → base_url=http://localhost:11434/v1, model=llama3.1 (api_key any non-empty)
    # When llm_api_key is set these override the Kimi settings above. With NO key,
    # minions still act every tick via the fast heuristic + per-minion neural net —
    # the simulation runs fully automatically without any paid/online model.
    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = ""
    # Efficiency: cap how many minions consult the LLM per tick (the rest use the
    # free heuristic+neural path), so a free Llama tier stays fast + in rate limits.
    llm_max_minions_per_tick: int = 6

    # Patent APIs
    patentsview_base_url: str = "https://search.patentsview.org/api/v1"
    patentsview_api_key: str = ""  # PatentsView now requires a free key
    epo_ops_base_url: str = "https://ops.epo.org/3.2/rest-services"
    epo_consumer_key: str = ""
    epo_consumer_secret: str = ""

    # Safety
    allowed_cpc_sections: list[str] = Field(
        default=["F", "G", "H", "E", "B"],
        description=(
            "CPC sections the system is allowed to ingest and reason about. "
            "F=mechanical, G=physics/computing, H=electricity, E=civil/buildings/mining, "
            "B=performing operations/transport. A (human necessities, includes medical) "
            "and C (chemistry) are blocked by default per the doc's safety rules."
        ),
    )
    blocked_cpc_prefixes: list[str] = Field(
        default=["A61", "A62D", "C07", "C12N", "F41", "F42", "G21"],
        description="Hard-blocked CPC prefixes: medicinals, chem warfare, organic chem, genetic engineering, weapons, nuclear",
    )

    # Simulation
    sim_max_ticks_per_request: int = 100
    sim_sync_ticks_limit: int = Field(
        default=3,
        ge=1,
        le=20,
        description=(
            "Maximum ticks an HTTP request may run inline before the remainder "
            "is handed to the scheduler queue. Keeps API workers responsive."
        ),
    )
    sim_default_tick_seconds: float = 0.0
    sim_max_minions: int = 64
    runtime_role: str = Field(
        default="api",
        description=(
            "Underworld process role: api, worker, or all. API serves HTTP only; "
            "worker/all may run scheduler, cognition, movement, feedback, and GPU upkeep."
        ),
    )
    # The background auto-advance scheduler holds a session and re-runs
    # every tick_resolution_s. In tests we run it on a single shared sqlite
    # file across many TestClients, which causes "database is locked"
    # contention with the request handlers. Set False from conftest.
    scheduler_enabled: bool = True
    # On startup, flip every existing world to auto-advance so the whole system
    # runs in the background with zero manual ticking.
    scheduler_autostart_all: bool = False
    sim_population_floor_pct: float = Field(
        default=0.10,
        description=(
            "Fraction of population_cap to maintain as a hard floor. When alive "
            "drops below floor = max(8, cap * pct), free souls are reincarnated "
            "(or new ones created) to keep the world from collapsing to extinction."
        ),
    )

    @property
    def database_url(self) -> str:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite+aiosqlite:///{self.db_path}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
