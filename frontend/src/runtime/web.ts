import {
  fetchProviders,
  launchProvider,
  validateWorkspace,
} from "../api";

import type { RuntimeAdapter } from "./types";

export const webRuntime: RuntimeAdapter = {
  fetchProviders,
  launchProvider,
  validateWorkspace,
};
