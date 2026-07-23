"""Local API for the AgentOS Console."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .providers import ProviderResult, detect_providers

app = FastAPI(title="AgentOS Console", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/providers")
def providers() -> list[ProviderResult]:
    """Return fresh, server-controlled CLI discovery results."""

    return detect_providers()
