import type {
  LaunchRequest,
  LaunchResponse,
  Provider,
  WorkspaceResponse,
} from "./types";

async function apiError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as {
    detail?: string | { message?: string };
  } | null;
  const detail = body?.detail;
  const message =
    typeof detail === "string"
      ? detail
      : detail?.message ?? `${fallback} (${response.status})`;
  return new Error(message);
}

export async function fetchProviders(): Promise<Provider[]> {
  const response = await fetch("/api/providers", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Provider discovery failed (${response.status})`);
  }
  return response.json() as Promise<Provider[]>;
}

export async function launchProvider(
  request: LaunchRequest,
): Promise<LaunchResponse> {
  const response = await fetch("/api/launch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw await apiError(response, "CLI launch failed");
  }
  return response.json() as Promise<LaunchResponse>;
}

export async function validateWorkspace(
  workspacePath: string,
): Promise<WorkspaceResponse> {
  const response = await fetch("/api/workspaces/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace_path: workspacePath }),
  });
  if (!response.ok) {
    throw await apiError(response, "Workspace validation failed");
  }
  return response.json() as Promise<WorkspaceResponse>;
}
