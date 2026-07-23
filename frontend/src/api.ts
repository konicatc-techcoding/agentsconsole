import type { Provider } from "./types";

export async function fetchProviders(): Promise<Provider[]> {
  const response = await fetch("/api/providers", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Provider discovery failed (${response.status})`);
  }
  return response.json() as Promise<Provider[]>;
}
