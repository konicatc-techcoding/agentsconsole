import type { LaunchRequest, LaunchResponse, Provider } from "./types";

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
    const body = (await response.json().catch(() => null)) as {
      detail?: string | { message?: string };
    } | null;
    const detail = body?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail?.message ?? `CLI launch failed (${response.status})`;
    throw new Error(message);
  }
  return response.json() as Promise<LaunchResponse>;
}
