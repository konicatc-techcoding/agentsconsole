import {
  fetchProviders,
  launchProvider,
  validateWorkspace,
} from "../api";

import {
  readLocalWorkspacePreferences,
  writeLocalWorkspacePreferences,
} from "./preferences";
import type { RuntimeAdapter } from "./types";

export const webRuntime: RuntimeAdapter = {
  fetchProviders,
  launchProvider,
  validateWorkspace,
  async loadWorkspacePreferences() {
    return readLocalWorkspacePreferences();
  },
  async saveWorkspacePreferences(preferences, context) {
    if (!writeLocalWorkspacePreferences(preferences) && context === "default") {
      throw new Error("Default workspace could not be saved in this browser");
    }
    return {};
  },
};
