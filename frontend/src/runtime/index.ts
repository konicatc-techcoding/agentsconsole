import { isTauri } from "@tauri-apps/api/core";

import type { RuntimeAdapter } from "./types";
import { tauriRuntime } from "./tauri";
import { webRuntime } from "./web";

export function selectRuntime(tauri = isTauri()): RuntimeAdapter {
  return tauri ? tauriRuntime : webRuntime;
}

export const defaultRuntime = selectRuntime();

export type { RuntimeAdapter } from "./types";
