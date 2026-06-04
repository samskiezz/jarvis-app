from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS
from .routes import auth as auth_routes
from .routes import entities as entities_routes
from .routes import functions as functions_routes
from .routes import predict as predict_routes
from .routes import streams as streams_routes


def create_app() -> FastAPI:
    app = FastAPI(title="Jarvis Backend", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_routes.router)
    app.include_router(functions_routes.router)
    app.include_router(predict_routes.router)
    app.include_router(entities_routes.router)
    app.include_router(streams_routes.router)

    @app.get("/")
    async def root():
        return {"service": "jarvis-backend", "status": "ok"}

    return app


app = create_app()
