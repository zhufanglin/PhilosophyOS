"""HTTP entry point for the PhilosophyOS API."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.routes.dialogue import router as dialogue_router
from app.routes.knowledge import router as knowledge_router


class HealthResponse(BaseModel):
    """Health-check response returned to local clients."""

    status: str
    service: str
    version: str


app = FastAPI(
    title="PhilosophyOS API",
    summary="Local-first API for philosophical learning and reflection.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(dialogue_router)
app.include_router(knowledge_router)


@app.get("/health", response_model=HealthResponse, tags=["system"])
async def health() -> HealthResponse:
    """Return the API process health without accessing user data."""

    return HealthResponse(status="ok", service="philosophyos-api", version=app.version)
