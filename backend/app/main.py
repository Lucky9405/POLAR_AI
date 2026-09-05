from __future__ import annotations
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import app_config
from app.database.db import init_db
from app.api.routes import router

app = FastAPI(
    title="POLAR-AI",
    description="AI-Driven Smart Energy Management System for Indian Antarctic Research Stations "
                "(Maitri & Bharati) — software-only simulation for Smart India Hackathon.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=app_config.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()
    # Touch the station manager so both stations seed their history on boot.
    from app.services.station_registry import manager  # noqa: F401


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "detail": str(exc), "path": str(request.url.path)},
    )


@app.get("/health")
def health():
    return {"status": "ok", "service": "POLAR-AI backend"}


app.include_router(router, prefix="/api")
