"""Local API for the AgentOS Console."""

from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .launcher import (
    LaunchError,
    LaunchResult,
    WorkspaceResult,
    launch_provider,
    validate_workspace,
)
from .providers import ProviderResult, detect_providers

app = FastAPI(title="AgentOS Console", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class LaunchRequest(BaseModel):
    provider_id: str
    workspace_path: str
    session_mode: Literal["new", "continue"]
    new_folder: str | None = None


class WorkspaceRequest(BaseModel):
    workspace_path: str


@app.get("/api/providers")
def providers() -> list[ProviderResult]:
    """Return fresh, server-controlled CLI discovery results."""

    return detect_providers()


@app.post("/api/workspaces/validate")
def validate(request: WorkspaceRequest) -> WorkspaceResult:
    """Validate and resolve a workspace without launching a process."""

    try:
        return validate_workspace(request.workspace_path)
    except LaunchError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc


@app.post("/api/launch")
def launch(request: LaunchRequest) -> LaunchResult:
    """Open a fixed provider command in a local Terminal.app window."""

    try:
        return launch_provider(
            request.provider_id,
            request.workspace_path,
            request.session_mode,
            request.new_folder,
        )
    except LaunchError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc
