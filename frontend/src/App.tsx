import { useCallback, useEffect, useRef, useState } from "react";

import { defaultRuntime } from "./runtime";
import {
  CONSOLE_PROVIDERS,
  consoleLayoutsEqual,
  defaultConsoleLayout,
} from "./runtime/consoleLayout";
import { RECENT_WORKSPACE_LIMIT } from "./runtime/preferences";
import type { RuntimeAdapter } from "./runtime/types";
import TerminalSlot, {
  DEFAULT_FONT_SIZE,
  type TerminalPhase,
} from "./TerminalSlot";
import type {
  ConsoleLayout,
  ConsoleProviderId,
  ConsoleSlotId,
  Provider,
  PtyExitEvent,
  PtySession,
  SessionMode,
  WorkspacePreferences,
} from "./types";

function isAvailable(provider: Provider): boolean {
  return provider.installed && provider.error === null;
}

interface AppProps {
  runtime?: RuntimeAdapter;
}

type EmbeddedSlotId = "slot-1" | "slot-2" | "slot-3" | "slot-4";
type LaunchDestination = "external" | EmbeddedSlotId;
type WindowAction = "close" | "reload";
type VisibleSlotQueue = EmbeddedSlotId[] | null;
type HandoffPhase = "idle" | "queued" | "sent" | "failed";
type SlotAttention = "none" | "output" | "terminated";
const EMBEDDED_SLOT_IDS: EmbeddedSlotId[] = [
  "slot-1",
  "slot-2",
  "slot-3",
  "slot-4",
];
const SESSION_NAME_LIMIT = 48;
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 20;
const STATUS_HANDOFF_PROMPT =
  "請在目前 workspace 新增或更新 status.md，記錄已完成項目、未完成項目、驗證結果與下一步。不要 commit 或 push；完成後回覆 STATUS_READY。\r";
const textEncoder = new TextEncoder();

interface TerminalState {
  phase: TerminalPhase;
  session: PtySession | null;
  exitEvent: PtyExitEvent | null;
  error: string | null;
  displayName: string | null;
  pendingWorkspace: string | null;
}

interface HandoffDelivery {
  phase: HandoffPhase;
  error: string | null;
}

const IDLE_TERMINAL: TerminalState = {
  phase: "idle",
  session: null,
  exitEvent: null,
  error: null,
  displayName: null,
  pendingWorkspace: null,
};

function initialTerminalStates(): Record<EmbeddedSlotId, TerminalState> {
  return {
    "slot-1": { ...IDLE_TERMINAL },
    "slot-2": { ...IDLE_TERMINAL },
    "slot-3": { ...IDLE_TERMINAL },
    "slot-4": { ...IDLE_TERMINAL },
  };
}

function initialTerminalSizes() {
  return {
    "slot-1": { rows: 24, columns: 80 },
    "slot-2": { rows: 24, columns: 80 },
    "slot-3": { rows: 24, columns: 80 },
    "slot-4": { rows: 24, columns: 80 },
  };
}

function initialSlotSelection(value: boolean) {
  return {
    "slot-1": value,
    "slot-2": value,
    "slot-3": value,
    "slot-4": value,
  };
}

function initialSlotAttention(): Record<EmbeddedSlotId, SlotAttention> {
  return {
    "slot-1": "none",
    "slot-2": "none",
    "slot-3": "none",
    "slot-4": "none",
  };
}

function initialSlotPhases(): Record<EmbeddedSlotId, TerminalPhase> {
  return {
    "slot-1": "idle",
    "slot-2": "idle",
    "slot-3": "idle",
    "slot-4": "idle",
  };
}

function initialHandoffDeliveries(): Record<EmbeddedSlotId, HandoffDelivery> {
  return {
    "slot-1": { phase: "idle", error: null },
    "slot-2": { phase: "idle", error: null },
    "slot-3": { phase: "idle", error: null },
    "slot-4": { phase: "idle", error: null },
  };
}

function isEmbeddedSlot(
  slotId: ConsoleSlotId | LaunchDestination,
): slotId is EmbeddedSlotId {
  return (
    slotId === "slot-1" ||
    slotId === "slot-2" ||
    slotId === "slot-3" ||
    slotId === "slot-4"
  );
}

function isActiveTerminal(state: TerminalState): boolean {
  return (
    state.phase === "starting" ||
    state.phase === "running" ||
    state.phase === "stopping"
  );
}

function readPendingExit(
  pending: Record<EmbeddedSlotId, PtyExitEvent | null>,
  slotId: EmbeddedSlotId,
): PtyExitEvent | null {
  return pending[slotId];
}

function slotLabel(slotId: EmbeddedSlotId): string {
  return slotId.replace("slot-", "Slot ");
}

function slotIsVisible(
  queue: VisibleSlotQueue,
  slotId: EmbeddedSlotId,
): boolean {
  return queue === null || queue.includes(slotId);
}

function attentionLabel(attention: SlotAttention): string {
  return attention === "output" ? "New output" : "Session ended";
}

function phaseLabel(phase: TerminalPhase | HandoffPhase): string {
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

function workspaceBasename(workspace: string): string {
  const normalized = workspace.replace(/\/+$/, "");
  return normalized.split("/").pop() || normalized;
}

function requestedWorkspace(
  workspace: string,
  mode: SessionMode,
  folder: string,
): string {
  return mode === "new" && folder
    ? `${workspace.replace(/\/+$/, "")}/${folder}`
    : workspace;
}

function defaultSessionName(provider: Provider, workspace: string): string {
  return `${provider.display_name} · ${workspaceBasename(workspace)}`;
}

function sessionNameValidationError(value: string): string | null {
  const trimmed = value.trim();
  if (Array.from(trimmed).length > SESSION_NAME_LIMIT) {
    return `Session name must be ${SESSION_NAME_LIMIT} characters or fewer`;
  }
  if (/[\u0000-\u001f\u007f]/u.test(trimmed)) {
    return "Session name cannot contain line breaks or control characters";
  }
  return null;
}

function displayLabel(
  slotId: EmbeddedSlotId,
  state: TerminalState,
): string {
  const label = slotLabel(slotId);
  return state.displayName ? `${label} · ${state.displayName}` : label;
}

function terminalWorkspace(state: TerminalState): string {
  return state.session?.workspacePath ?? state.pendingWorkspace ?? "";
}

export default function App({ runtime = defaultRuntime }: AppProps) {
  const isTauri = runtime.kind === "tauri";
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [visibleSlotQueue, setVisibleSlotQueue] =
    useState<VisibleSlotQueue>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [launchTarget, setLaunchTarget] = useState<Provider | null>(null);
  const [launchDestination, setLaunchDestination] =
    useState<LaunchDestination>("external");
  const [workspacePath, setWorkspacePath] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [sessionNameInput, setSessionNameInput] = useState("");
  const [workspacePreferences, setWorkspacePreferences] =
    useState<WorkspacePreferences>({});
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [sessionMode, setSessionMode] = useState<SessionMode>("new");
  const [launching, setLaunching] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [launchNotice, setLaunchNotice] = useState<string | null>(null);
  const [launchWarning, setLaunchWarning] = useState<string | null>(null);
  const [savedConsoleLayout, setSavedConsoleLayout] =
    useState<ConsoleLayout | null>(null);
  const [consoleLayout, setConsoleLayout] =
    useState<ConsoleLayout>(defaultConsoleLayout);
  const [layoutReady, setLayoutReady] = useState(!isTauri);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [savingLayout, setSavingLayout] = useState(false);
  const [terminalStates, setTerminalStates] = useState(initialTerminalStates);
  const [terminalResetTokens, setTerminalResetTokens] = useState({
    "slot-1": 0,
    "slot-2": 0,
    "slot-3": 0,
    "slot-4": 0,
  });
  const [terminalSizes, setTerminalSizes] = useState(initialTerminalSizes);
  const [terminalFontSize, setTerminalFontSize] = useState(DEFAULT_FONT_SIZE);
  const [slotAttention, setSlotAttention] = useState(initialSlotAttention);
  const [focusedSlotId, setFocusedSlotId] = useState<EmbeddedSlotId | null>(
    null,
  );
  const [sessionControlSlots, setSessionControlSlots] = useState<
    EmbeddedSlotId[] | null
  >(null);
  const [handoffSelection, setHandoffSelection] = useState(() =>
    initialSlotSelection(false),
  );
  const [handoffDeliveries, setHandoffDeliveries] = useState(
    initialHandoffDeliveries,
  );
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [stopAllBusy, setStopAllBusy] = useState(false);
  const [stopAllFailures, setStopAllFailures] = useState<EmbeddedSlotId[]>([]);
  const [windowAction, setWindowAction] = useState<WindowAction | null>(null);
  const [windowActionError, setWindowActionError] = useState<string | null>(
    null,
  );
  const terminalStatesRef = useRef(terminalStates);
  const focusedSlotIdRef = useRef(focusedSlotId);
  const visibleSlotQueueRef = useRef(visibleSlotQueue);
  const slotPhasesRef = useRef(initialSlotPhases());
  const pendingExitRefs = useRef<Record<EmbeddedSlotId, PtyExitEvent | null>>({
    "slot-1": null,
    "slot-2": null,
    "slot-3": null,
    "slot-4": null,
  });
  const pendingStartRefs = useRef<
    Record<EmbeddedSlotId, Promise<PtySession> | null>
  >({
    "slot-1": null,
    "slot-2": null,
    "slot-3": null,
    "slot-4": null,
  });
  const pendingStopRefs = useRef<
    Record<EmbeddedSlotId, Promise<void> | null>
  >({
    "slot-1": null,
    "slot-2": null,
    "slot-3": null,
    "slot-4": null,
  });
  const retryHandoffRefs = useRef<Record<EmbeddedSlotId, boolean>>(
    initialSlotSelection(false),
  );

  const updateTerminalState = useCallback(
    (slotId: EmbeddedSlotId, next: TerminalState) => {
      const updated = { ...terminalStatesRef.current, [slotId]: next };
      terminalStatesRef.current = updated;
      setTerminalStates(updated);
    },
    [],
  );

  focusedSlotIdRef.current = focusedSlotId;
  visibleSlotQueueRef.current = visibleSlotQueue;

  const markSlotAttention = useCallback(
    (slotId: EmbeddedSlotId, attention: Exclude<SlotAttention, "none">) => {
      const attended =
        focusedSlotIdRef.current === slotId &&
        slotIsVisible(visibleSlotQueueRef.current, slotId);
      if (attended) {
        return;
      }
      setSlotAttention((current) => {
        const existing = current[slotId];
        if (
          existing === attention ||
          (attention === "output" && existing === "terminated")
        ) {
          return current;
        }
        return { ...current, [slotId]: attention };
      });
    },
    [],
  );

  const clearSlotAttention = useCallback((slotId: EmbeddedSlotId) => {
    setSlotAttention((current) =>
      current[slotId] === "none" ? current : { ...current, [slotId]: "none" },
    );
  }, []);

  const handleTerminalFocusChange = useCallback(
    (slotId: EmbeddedSlotId, focused: boolean) => {
      setFocusedSlotId((current) => {
        if (focused) {
          return slotId;
        }
        return current === slotId ? null : current;
      });
    },
    [],
  );

  useEffect(() => {
    if (!focusedSlotId || !slotIsVisible(visibleSlotQueue, focusedSlotId)) {
      return;
    }
    clearSlotAttention(focusedSlotId);
  }, [clearSlotAttention, focusedSlotId, visibleSlotQueue]);

  useEffect(() => {
    for (const slotId of EMBEDDED_SLOT_IDS) {
      const phase = terminalStates[slotId].phase;
      const previous = slotPhasesRef.current[slotId];
      slotPhasesRef.current[slotId] = phase;
      if (phase !== previous && (phase === "exited" || phase === "error")) {
        markSlotAttention(slotId, "terminated");
      }
    }
  }, [markSlotAttention, terminalStates]);

  const layoutDirty =
    isTauri && layoutReady
      ? !consoleLayoutsEqual(savedConsoleLayout, consoleLayout)
      : false;

  const slotStartDisabled = useCallback(
    (provider: Provider | null | undefined) =>
      !layoutReady ||
      Boolean(layoutError) ||
      !storageReady ||
      !provider ||
      !isAvailable(provider) ||
      !runtime.startPtySession,
    [layoutError, layoutReady, runtime.startPtySession, storageReady],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    setStorageReady(false);
    setStorageError(null);
    if (isTauri) {
      setLayoutReady(false);
      setLayoutError(null);
    }
    const providerTask = runtime
      .fetchProviders()
      .then((discovered) => {
        setProviders(discovered);
        setSelectedId((current) => {
          const selected = discovered.find(
            (provider) => provider.id === current,
          );
          return selected && isAvailable(selected) ? current : null;
        });
      })
      .catch((error: unknown) => {
        setPageError(
          error instanceof Error ? error.message : "Provider discovery failed",
        );
      });
    const preferenceTask = runtime
      .loadWorkspacePreferences()
      .then((preferences) => {
        setWorkspacePreferences(preferences);
        setStorageReady(true);
      })
      .catch((error: unknown) => {
        setStorageError(
          error instanceof Error
            ? error.message
            : "Workspace preferences could not be loaded",
        );
      });
    const layoutTask =
      isTauri && runtime.loadConsoleLayout
        ? runtime
            .loadConsoleLayout()
            .then((layout) => {
              setSavedConsoleLayout(layout);
              setConsoleLayout(layout);
              setLayoutReady(true);
            })
            .catch((error: unknown) => {
              setSavedConsoleLayout(null);
              setConsoleLayout(defaultConsoleLayout());
              setLayoutError(
                error instanceof Error
                  ? error.message
                  : "Console layout could not be loaded",
              );
            })
        : Promise.resolve();
    await Promise.all([providerTask, preferenceTask, layoutTask]);
    setLoading(false);
  }, [isTauri, runtime]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openLaunch = (
    provider: Provider,
    destination: LaunchDestination = "external",
  ) => {
    const preference = workspacePreferences[provider.id];
    setSelectedId(provider.id);
    setLaunchTarget(provider);
    setLaunchDestination(destination);
    setWorkspacePath(preference?.defaultWorkspace ?? "");
    setNewFolder("");
    setSessionNameInput(
      isEmbeddedSlot(destination)
        ? terminalStatesRef.current[destination].displayName ?? ""
        : "",
    );
    setSessionMode("new");
    setLaunchError(null);
    setSaveNotice(null);
  };

  const selectSessionMode = (mode: SessionMode) => {
    setSessionMode(mode);
    setNewFolder("");
    if (!launchTarget) {
      return;
    }
    const preference = workspacePreferences[launchTarget.id];
    const recentWorkspaces = preference?.recentWorkspaces ?? [];
    setWorkspacePath(
      mode === "continue"
        ? recentWorkspaces[0] || preference?.defaultWorkspace || ""
        : preference?.defaultWorkspace || "",
    );
    setLaunchError(null);
    setSaveNotice(null);
  };

  const closeLaunch = () => {
    if (!launching && !savingDefault) {
      if (isEmbeddedSlot(launchDestination)) {
        retryHandoffRefs.current[launchDestination] = false;
      }
      setLaunchTarget(null);
      setLaunchError(null);
      setSaveNotice(null);
    }
  };

  const updateConsoleSlot = (
    slotId: ConsoleLayout["slots"][number]["slotId"],
    providerId: ConsoleProviderId,
  ) => {
    const currentProvider = consoleLayout.slots.find(
      (slot) => slot.slotId === slotId,
    )?.providerId;
    if (isEmbeddedSlot(slotId)) {
      const terminalState = terminalStatesRef.current[slotId];
      if (
        !isActiveTerminal(terminalState) &&
        currentProvider !== providerId
      ) {
        updateTerminalState(slotId, { ...IDLE_TERMINAL });
        setTerminalResetTokens((current) => ({
          ...current,
          [slotId]: current[slotId] + 1,
        }));
      }
    }
    setConsoleLayout((current) => ({
      ...current,
      slots: current.slots.map((slot) =>
        slot.slotId === slotId ? { ...slot, providerId } : slot,
      ),
    }));
    setLayoutError(null);
  };

  const saveConsoleLayout = async () => {
    if (
      !isTauri ||
      !runtime.saveConsoleLayout ||
      !layoutReady ||
      !layoutDirty ||
      savingLayout
    ) {
      return;
    }

    setSavingLayout(true);
    setLayoutError(null);
    try {
      const saved = await runtime.saveConsoleLayout(consoleLayout);
      setSavedConsoleLayout(saved);
      setConsoleLayout(saved);
    } catch (error) {
      setLayoutError(
        error instanceof Error
          ? error.message
          : "Console layout could not be saved",
      );
    } finally {
      setSavingLayout(false);
    }
  };

  const saveDefaultWorkspace = async () => {
    if (!launchTarget || launching || savingDefault) {
      return;
    }

    setSavingDefault(true);
    setLaunchError(null);
    setSaveNotice(null);
    try {
      const result = await runtime.validateWorkspace(workspacePath);
      const previous = workspacePreferences[launchTarget.id];
      const next = {
        ...workspacePreferences,
        [launchTarget.id]: {
          defaultWorkspace: result.workspace_path,
          recentWorkspaces: previous?.recentWorkspaces ?? [],
        },
      };
      await runtime.saveWorkspacePreferences(next, "default");
      setWorkspacePreferences(next);
      setWorkspacePath(result.workspace_path);
      setSaveNotice("Default workspace saved");
    } catch (error) {
      setLaunchError(
        error instanceof Error ? error.message : "Workspace validation failed",
      );
    } finally {
      setSavingDefault(false);
    }
  };

  const persistRecentWorkspace = async (
    provider: Provider,
    resolvedWorkspace: string,
  ) => {
    const previous = workspacePreferences[provider.id];
    const next = {
      ...workspacePreferences,
      [provider.id]: {
        defaultWorkspace: previous?.defaultWorkspace ?? "",
        recentWorkspaces: [
          resolvedWorkspace,
          ...(previous?.recentWorkspaces ?? []).filter(
            (path) => path !== resolvedWorkspace,
          ),
        ].slice(0, RECENT_WORKSPACE_LIMIT),
      },
    };
    let warning: string | undefined;
    try {
      ({ warning } = await runtime.saveWorkspacePreferences(next, "history"));
    } catch {
      warning = "CLI launched, but history was not saved";
    }
    setWorkspacePreferences(next);
    setLaunchWarning(warning ?? null);
  };

  const sendHandoffInput = async (
    slotId: EmbeddedSlotId,
    session: PtySession,
  ) => {
    const setDelivery = (delivery: HandoffDelivery) => {
      setHandoffDeliveries((current) => ({
        ...current,
        [slotId]: delivery,
      }));
    };
    if (!runtime.writePtyInput) {
      setDelivery({
        phase: "failed",
        error: "Terminal input is unavailable",
      });
      return;
    }
    try {
      await runtime.writePtyInput({
        slotId,
        sessionId: session.sessionId,
        data: Array.from(textEncoder.encode(STATUS_HANDOFF_PROMPT)),
      });
      setDelivery({ phase: "sent", error: null });
    } catch (error) {
      setDelivery({
        phase: "failed",
        error:
          error instanceof Error
            ? error.message
            : "Handoff prompt could not be sent",
      });
    }
  };

  const submitLaunch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!launchTarget || launching || savingDefault || !workspacePath) {
      return;
    }
    const embeddedSlot = isEmbeddedSlot(launchDestination)
      ? launchDestination
      : null;
    const nameError = embeddedSlot
      ? sessionNameValidationError(sessionNameInput)
      : null;
    if (
      embeddedSlot &&
      (nameError ||
        slotStartDisabled(
          providers.find((provider) => provider.id === launchTarget.id),
        ))
    ) {
      setLaunchError(nameError);
      return;
    }

    setLaunching(true);
    setLaunchError(null);
    setLaunchNotice(null);
    setLaunchWarning(null);
    try {
      if (embeddedSlot && runtime.startPtySession) {
        const targetWorkspace = requestedWorkspace(
          workspacePath,
          sessionMode,
          newFolder,
        );
        const customName = sessionNameInput.trim();
        pendingExitRefs.current[embeddedSlot] = null;
        updateTerminalState(embeddedSlot, {
          phase: "starting",
          session: null,
          exitEvent: null,
          error: null,
          displayName:
            customName || defaultSessionName(launchTarget, targetWorkspace),
          pendingWorkspace: targetWorkspace,
        });
        const startPromise = runtime.startPtySession({
          slotId: embeddedSlot,
          providerId: launchTarget.id as ConsoleProviderId,
          workspacePath,
          sessionMode,
          ...(sessionMode === "new" && newFolder ? { newFolder } : {}),
          rows: terminalSizes[embeddedSlot].rows,
          columns: terminalSizes[embeddedSlot].columns,
        });
        pendingStartRefs.current[embeddedSlot] = startPromise;
        const session = await startPromise;
        pendingStartRefs.current[embeddedSlot] = null;
        const observedExit = readPendingExit(
          pendingExitRefs.current,
          embeddedSlot,
        );
        const earlyExit =
          observedExit?.sessionId === session.sessionId ? observedExit : null;
        updateTerminalState(embeddedSlot, {
          phase: earlyExit ? "exited" : "running",
          session,
          exitEvent: earlyExit,
          error: null,
          displayName:
            customName ||
            defaultSessionName(launchTarget, session.workspacePath),
          pendingWorkspace: null,
        });
        await persistRecentWorkspace(launchTarget, session.workspacePath);
        setLaunchTarget(null);
        if (retryHandoffRefs.current[embeddedSlot]) {
          retryHandoffRefs.current[embeddedSlot] = false;
          setSessionControlSlots([embeddedSlot]);
          setHandoffSelection({
            ...initialSlotSelection(false),
            [embeddedSlot]: true,
          });
          setHandoffDeliveries((current) => ({
            ...current,
            [embeddedSlot]: { phase: "queued", error: null },
          }));
          await sendHandoffInput(embeddedSlot, session);
        }
      } else {
        const result = await runtime.launchProvider({
          provider_id: launchTarget.id,
          workspace_path: workspacePath,
          session_mode: sessionMode,
          ...(sessionMode === "new" && newFolder
            ? { new_folder: newFolder }
            : {}),
        });
        await persistRecentWorkspace(launchTarget, result.workspace_path);
        setLaunchTarget(null);
        setLaunchNotice(
          `${launchTarget.display_name} launched in ${result.workspace_path}`,
        );
      }
    } catch (error) {
      if (embeddedSlot) {
        pendingStartRefs.current[embeddedSlot] = null;
        updateTerminalState(embeddedSlot, {
          ...terminalStatesRef.current[embeddedSlot],
          phase: "error",
          session: null,
          exitEvent: null,
          error: error instanceof Error ? error.message : "PTY start failed",
          pendingWorkspace: null,
        });
      }
      setLaunchError(
        error instanceof Error
          ? error.message
          : embeddedSlot
            ? "PTY start failed"
            : "CLI launch failed",
      );
    } finally {
      setLaunching(false);
    }
  };

  const handleTerminalExit = useCallback(
    (event: PtyExitEvent) => {
      if (!isEmbeddedSlot(event.slotId)) {
        return;
      }
      const current = terminalStatesRef.current[event.slotId];
      if (current.phase === "starting") {
        pendingExitRefs.current[event.slotId] = event;
        return;
      }
      if (current.session?.sessionId !== event.sessionId) {
        return;
      }
      updateTerminalState(event.slotId, {
        ...current,
        phase:
          current.phase === "stopping" || event.reason === "stopped"
            ? "stopped"
            : "exited",
        exitEvent: event,
        error: null,
        pendingWorkspace: null,
      });
    },
    [updateTerminalState],
  );

  const stopTerminal = useCallback(
    (slotId: EmbeddedSlotId): Promise<void> => {
      const existingStop = pendingStopRefs.current[slotId];
      if (existingStop) {
        return existingStop;
      }
      const current = terminalStatesRef.current[slotId];
      if (!current.session || !runtime.stopPtySession) {
        return Promise.resolve();
      }
      const session = current.session;
      const stopPtySession = runtime.stopPtySession;
      const stopPromise = (async () => {
        updateTerminalState(slotId, {
          ...current,
          phase: "stopping",
          error: null,
        });
        try {
          await stopPtySession({
            slotId,
            sessionId: session.sessionId,
          });
          const latest = terminalStatesRef.current[slotId];
          updateTerminalState(slotId, {
            ...latest,
            phase: "stopped",
            session,
            error: null,
            pendingWorkspace: null,
          });
        } catch (error) {
          updateTerminalState(slotId, {
            ...current,
            phase: "running",
            error:
              error instanceof Error
                ? error.message
                : "PTY process tree could not be terminated",
          });
          throw error;
        } finally {
          pendingStopRefs.current[slotId] = null;
        }
      })();
      pendingStopRefs.current[slotId] = stopPromise;
      return stopPromise;
    },
    [runtime, updateTerminalState],
  );

  const terminalIsActive = useCallback(
    () =>
      EMBEDDED_SLOT_IDS.some((slotId) =>
        isActiveTerminal(terminalStatesRef.current[slotId]),
      ),
    [],
  );

  const requestWindowAction = useCallback(
    (action: WindowAction): boolean => {
      if (!terminalIsActive()) {
        return false;
      }
      setWindowActionError(null);
      setWindowAction(action);
      return true;
    },
    [terminalIsActive],
  );

  useEffect(() => {
    if (!isTauri || !runtime.onCloseRequested) {
      return;
    }
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void runtime
      .onCloseRequested(() => requestWindowAction("close"))
      .then((cleanup) => {
        if (disposed) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [isTauri, requestWindowAction, runtime]);

  useEffect(() => {
    if (!isTauri) {
      return;
    }
    const interceptReload = (event: KeyboardEvent) => {
      if (
        event.metaKey &&
        event.key.toLowerCase() === "r" &&
        requestWindowAction("reload")
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", interceptReload);
    return () => window.removeEventListener("keydown", interceptReload);
  }, [isTauri, requestWindowAction]);

  useEffect(
    () => () => {
      for (const slotId of EMBEDDED_SLOT_IDS) {
        const current = terminalStatesRef.current[slotId];
        if (
          current.session &&
          (current.phase === "running" || current.phase === "stopping") &&
          runtime.stopPtySession
        ) {
          void runtime.stopPtySession({
            slotId,
            sessionId: current.session.sessionId,
          });
        }
      }
    },
    [runtime],
  );

  const confirmWindowAction = async () => {
    const action = windowAction;
    if (!action) {
      return;
    }
    setWindowActionError(null);
    const pendingStarts = EMBEDDED_SLOT_IDS.map(
      (slotId) => pendingStartRefs.current[slotId],
    ).filter((pending): pending is Promise<PtySession> => pending !== null);
    await Promise.allSettled(pendingStarts);
    const activeSlots = EMBEDDED_SLOT_IDS.filter((slotId) =>
      isActiveTerminal(terminalStatesRef.current[slotId]),
    );
    const stopResults = await Promise.allSettled(
      activeSlots.map((slotId) => stopTerminal(slotId)),
    );
    const failedSlots = activeSlots.filter(
      (_, index) => stopResults[index].status === "rejected",
    );
    if (failedSlots.length > 0) {
      setWindowActionError(
        `${failedSlots.map((slotId) => slotId.replace("slot-", "Slot ")).join(", ")} could not be stopped`,
      );
      return;
    }
    try {
      if (action === "close") {
        await runtime.closeWindow?.();
      } else {
        await runtime.reloadWindow?.();
      }
      setWindowAction(null);
    } catch (error) {
      setWindowActionError(
        error instanceof Error
          ? error.message
          : "The App window action could not be completed",
      );
    }
  };

  const activePreference = launchTarget
    ? workspacePreferences[launchTarget.id]
    : undefined;
  const continueWorkspaces = activePreference?.recentWorkspaces.length
    ? activePreference.recentWorkspaces
    : activePreference?.defaultWorkspace
      ? [activePreference.defaultWorkspace]
      : [];
  const modalBusy = launching || savingDefault;
  const embeddedLaunchDisabled =
    isEmbeddedSlot(launchDestination) &&
    slotStartDisabled(
      providers.find((provider) => provider.id === launchTarget?.id),
    );
  const sessionNameError = isEmbeddedSlot(launchDestination)
    ? sessionNameValidationError(sessionNameInput)
    : null;
  const activeTerminalSlots = EMBEDDED_SLOT_IDS.filter((slotId) =>
    isActiveTerminal(terminalStates[slotId]),
  );
  const updateHandoffDelivery = (
    slotId: EmbeddedSlotId,
    delivery: HandoffDelivery,
  ) => {
    setHandoffDeliveries((current) => ({
      ...current,
      [slotId]: delivery,
    }));
  };
  const openSessionControl = () => {
    const activeSlots = EMBEDDED_SLOT_IDS.filter((slotId) =>
      isActiveTerminal(terminalStatesRef.current[slotId]),
    );
    setSessionControlSlots(activeSlots);
    setHandoffSelection({
      "slot-1":
        terminalStatesRef.current["slot-1"].phase === "starting" ||
        terminalStatesRef.current["slot-1"].phase === "running",
      "slot-2":
        terminalStatesRef.current["slot-2"].phase === "starting" ||
        terminalStatesRef.current["slot-2"].phase === "running",
      "slot-3":
        terminalStatesRef.current["slot-3"].phase === "starting" ||
        terminalStatesRef.current["slot-3"].phase === "running",
      "slot-4":
        terminalStatesRef.current["slot-4"].phase === "starting" ||
        terminalStatesRef.current["slot-4"].phase === "running",
    });
    setHandoffDeliveries(initialHandoffDeliveries());
    setStopAllFailures([]);
  };
  const closeSessionControl = () => {
    if (!stopAllBusy && !handoffBusy) {
      setSessionControlSlots(null);
      setStopAllFailures([]);
    }
  };
  const queueHandoff = async (slotId: EmbeddedSlotId) => {
    const current = terminalStatesRef.current[slotId];
    updateHandoffDelivery(slotId, { phase: "queued", error: null });
    if (current.phase === "starting") {
      const pending = pendingStartRefs.current[slotId];
      if (!pending) {
        updateHandoffDelivery(slotId, {
          phase: "failed",
          error: "Starting session is unavailable",
        });
        return;
      }
      void pending
        .then((session) => sendHandoffInput(slotId, session))
        .catch((error: unknown) => {
          updateHandoffDelivery(slotId, {
            phase: "failed",
            error:
              error instanceof Error
                ? error.message
                : "Session could not start",
          });
        });
      return;
    }
    if (current.phase !== "running" || !current.session) {
      updateHandoffDelivery(slotId, {
        phase: "failed",
        error: "Session is not accepting input",
      });
      return;
    }
    await sendHandoffInput(slotId, current.session);
  };
  const sendSelectedHandoffs = async () => {
    if (!sessionControlSlots || handoffBusy) {
      return;
    }
    const selectedSlots = sessionControlSlots.filter(
      (slotId) =>
        handoffSelection[slotId] &&
        handoffDeliveries[slotId].phase !== "sent" &&
        handoffDeliveries[slotId].phase !== "queued",
    );
    if (selectedSlots.length === 0) {
      return;
    }
    setHandoffBusy(true);
    await Promise.all(selectedSlots.map((slotId) => queueHandoff(slotId)));
    setHandoffBusy(false);
  };
  const stopAllSessions = async () => {
    if (stopAllBusy) {
      return;
    }
    setStopAllBusy(true);
    setStopAllFailures([]);
    const pendingStarts = EMBEDDED_SLOT_IDS.map(
      (slotId) => pendingStartRefs.current[slotId],
    ).filter((pending): pending is Promise<PtySession> => pending !== null);
    await Promise.allSettled(pendingStarts);
    const slotsToStop = EMBEDDED_SLOT_IDS.filter((slotId) =>
      isActiveTerminal(terminalStatesRef.current[slotId]),
    );
    const results = await Promise.allSettled(
      slotsToStop.map((slotId) => stopTerminal(slotId)),
    );
    const failures = slotsToStop.filter(
      (_, index) => results[index].status === "rejected",
    );
    setStopAllFailures(failures);
    setStopAllBusy(false);
    if (failures.length === 0) {
      setSessionControlSlots(null);
    }
  };
  const selectedHandoffSlots = (sessionControlSlots ?? []).filter(
    (slotId) =>
      handoffSelection[slotId] &&
      (terminalStates[slotId].phase === "starting" ||
        terminalStates[slotId].phase === "running"),
  );
  const duplicateWorkspaceGroups = Array.from(
    selectedHandoffSlots.reduce((groups, slotId) => {
      const workspace = terminalWorkspace(terminalStates[slotId]);
      if (!workspace) {
        return groups;
      }
      const slots = groups.get(workspace) ?? [];
      slots.push(slotId);
      groups.set(workspace, slots);
      return groups;
    }, new Map<string, EmbeddedSlotId[]>()),
  ).filter(([, slots]) => slots.length > 1);
  const visibleSlotIds = visibleSlotQueue ?? EMBEDDED_SLOT_IDS;
  const visibleSlotSet = new Set(visibleSlotIds);
  const displayedSlotIds =
    visibleSlotIds.length === EMBEDDED_SLOT_IDS.length
      ? EMBEDDED_SLOT_IDS
      : visibleSlotIds;
  const orderedSlotIds = [
    ...displayedSlotIds,
    ...EMBEDDED_SLOT_IDS.filter((slotId) => !visibleSlotSet.has(slotId)),
  ];
  const slotsById = new Map(
    consoleLayout.slots.map((slot) => [slot.slotId, slot]),
  );
  const showAllSlots = () => {
    setVisibleSlotQueue(null);
  };
  const toggleVisibleSlot = (slotId: EmbeddedSlotId) => {
    setVisibleSlotQueue((current) => {
      if (current === null) {
        return [slotId];
      }
      if (!current.includes(slotId)) {
        return [...current, slotId];
      }
      if (current.length === 1) {
        return current;
      }
      return current.filter((visibleSlotId) => visibleSlotId !== slotId);
    });
  };
  const providersById = new Map(
    providers.map((provider) => [provider.id, provider]),
  );
  const providerForConsole = (providerId: ConsoleProviderId): Provider => {
    const option = CONSOLE_PROVIDERS.find(
      (provider) => provider.id === providerId,
    )!;
    return (
      providersById.get(providerId) ?? {
        id: option.id,
        display_name: option.displayName,
        command: option.command,
        installed: false,
        path: null,
        version: null,
        error: loading
          ? "Provider discovery in progress"
          : "Provider discovery unavailable",
      }
    );
  };

  return (
    <main className={isTauri ? "tauri-shell" : "shell"}>
      {isTauri ? (
        <>
          <header className="tauri-header">
            <div className="tauri-header-brand">
              <button
                className="sidebar-toggle"
                type="button"
                aria-label={
                  sidebarExpanded
                    ? "Hide provider sidebar"
                    : "Show provider sidebar"
                }
                onClick={() => setSidebarExpanded((current) => !current)}
              >
                <span aria-hidden="true">{sidebarExpanded ? "‹" : "›"}</span>
              </button>
              <h1>AI Agent Console</h1>
            </div>
            <div className="tauri-header-controls">
              <div
                className="global-session-controls"
                aria-label="Global session controls"
              >
                <span>Sessions · {activeTerminalSlots.length} active</span>
                <button
                  type="button"
                  disabled={activeTerminalSlots.length === 0}
                  aria-label={`Stop all ${activeTerminalSlots.length} active sessions`}
                  onClick={openSessionControl}
                >
                  Stop All ({activeTerminalSlots.length})
                </button>
              </div>
              <div
                className="terminal-font-controls"
                aria-label="Terminal font size"
              >
                <button
                  type="button"
                  aria-label="Decrease terminal font size"
                  disabled={terminalFontSize <= MIN_FONT_SIZE}
                  onClick={() =>
                    setTerminalFontSize((current) =>
                      Math.max(MIN_FONT_SIZE, current - 1),
                    )
                  }
                >
                  <span aria-hidden="true">−</span>
                </button>
                <span>{terminalFontSize}px</span>
                <button
                  type="button"
                  aria-label="Increase terminal font size"
                  disabled={terminalFontSize >= MAX_FONT_SIZE}
                  onClick={() =>
                    setTerminalFontSize((current) =>
                      Math.min(MAX_FONT_SIZE, current + 1),
                    )
                  }
                >
                  <span aria-hidden="true">+</span>
                </button>
              </div>
              <nav
                className="slot-view-controls"
                aria-label="Visible terminals"
              >
                <button
                  className="slot-view-button"
                  type="button"
                  aria-pressed={visibleSlotQueue === null}
                  onClick={showAllSlots}
                >
                  All
                </button>
                {EMBEDDED_SLOT_IDS.map((slotId) => {
                  const state = terminalStates[slotId];
                  const label = displayLabel(slotId, state);
                  const attention = slotAttention[slotId];
                  const buttonLabel =
                    attention === "none"
                      ? `${label} — ${phaseLabel(state.phase)}`
                      : `${label} — ${phaseLabel(state.phase)} — ${attentionLabel(
                          attention,
                        )}`;
                  return (
                    <button
                      className="slot-view-button"
                      type="button"
                      key={slotId}
                      aria-label={buttonLabel}
                      aria-pressed={
                        visibleSlotQueue?.includes(slotId) ?? false
                      }
                      onClick={() => toggleVisibleSlot(slotId)}
                      title={buttonLabel}
                    >
                      <span>{label}</span>
                      {attention !== "none" && (
                        <span
                          className={`slot-view-attention slot-view-attention-${attention}`}
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className={`slot-view-phase terminal-phase-${state.phase}`}
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </nav>
            </div>
          </header>

          <div
            className={`tauri-body ${
              sidebarExpanded ? "" : "sidebar-collapsed"
            }`}
          >
            {sidebarExpanded && (
              <aside className="provider-sidebar" aria-label="CLI providers">
                <div className="sidebar-discovery">
                  <button
                    className="refresh-button"
                    type="button"
                    onClick={() => void refresh()}
                    disabled={loading || savingLayout || layoutDirty}
                  >
                    <span aria-hidden="true">↻</span>
                    {loading ? "Discovering…" : "Refresh"}
                  </button>
                  <div className="read-only-badge">
                    <span className="status-dot" />
                    Read-only discovery
                  </div>
                </div>

                <div className="sidebar-provider-list">
                  {CONSOLE_PROVIDERS.map((option) => {
                    const provider = providerForConsole(option.id);
                    const available = isAvailable(provider);
                    return (
                      <article
                        className={`sidebar-provider ${
                          available ? "" : "unavailable"
                        }`}
                        key={option.id}
                      >
                        <div className="sidebar-provider-heading">
                          <span className="sidebar-provider-name">
                            {provider.display_name}
                          </span>
                          <span
                            className={`availability ${
                              available ? "available" : ""
                            }`}
                          >
                            <span className="status-dot" />
                            {available ? "Available" : "Unavailable"}
                          </span>
                        </div>
                        <span className="sidebar-provider-version">
                          {provider.version ?? "Version unavailable"}
                        </span>
                        {provider.error && (
                          <span className="sidebar-provider-error">
                            {provider.error}
                          </span>
                        )}
                        <details className="sidebar-provider-path">
                          <summary>Executable path</summary>
                          <code>{provider.path ?? "Not found in PATH"}</code>
                        </details>
                        <button
                          className="sidebar-launch-button"
                          type="button"
                          aria-label={`Launch ${provider.display_name}`}
                          disabled={!available || !storageReady}
                          onClick={() => openLaunch(provider)}
                        >
                          Launch
                        </button>
                      </article>
                    );
                  })}
                </div>

                <div className="layout-save-panel">
                  <span
                    className={`layout-save-status ${
                      layoutDirty ? "unsaved" : ""
                    }`}
                    role="status"
                  >
                    {savingLayout
                      ? "Saving…"
                      : layoutDirty
                        ? "Unsaved changes"
                        : layoutReady
                          ? "Saved"
                          : "Layout unavailable"}
                  </span>
                  <button
                    className="save-layout-button"
                    type="button"
                    onClick={() => void saveConsoleLayout()}
                    disabled={!layoutReady || !layoutDirty || savingLayout}
                  >
                    {savingLayout ? "Saving…" : "Save Layout"}
                  </button>
                </div>
              </aside>
            )}

            <section className="console-main" aria-label="Console layout">
              <div className="console-alerts">
                {pageError && (
                  <div className="page-error" role="alert">
                    <strong>Discovery unavailable.</strong> {pageError}
                  </div>
                )}
                {storageError && (
                  <div className="page-error" role="alert">
                    <strong>Workspace storage unavailable.</strong>{" "}
                    {storageError}
                  </div>
                )}
                {layoutError && (
                  <div className="page-error" role="alert">
                    <strong>Console layout unavailable.</strong> {layoutError}
                  </div>
                )}
                {launchNotice && (
                  <div className="launch-notice" role="status">
                    {launchNotice}
                  </div>
                )}
                {launchWarning && (
                  <div className="page-error" role="alert">
                    {launchWarning}
                  </div>
                )}
              </div>

              <div
                className={`console-grid console-grid-${visibleSlotIds.length}`}
              >
                {orderedSlotIds.map((slotId, visibleIndex) => {
                  const slot = slotsById.get(slotId)!;
                  const provider = providerForConsole(slot.providerId);
                  const embeddedSlotId = slot.slotId;
                  const visible = visibleSlotSet.has(embeddedSlotId);
                  const label = displayLabel(
                    embeddedSlotId,
                    terminalStates[embeddedSlotId],
                  );
                  const slotOnlyLabel = slotLabel(embeddedSlotId);
                  const attention = slotAttention[embeddedSlotId];
                  return (
                    <article
                      className={`console-slot ${
                        visible ? "" : "console-slot-hidden"
                      } ${
                        visible &&
                        visibleSlotIds.length === 3 &&
                        visibleIndex === 0
                          ? "console-slot-primary"
                          : ""
                      } ${
                        visible && attention !== "none"
                          ? `console-slot-attention console-slot-attention-${attention}`
                          : ""
                      }`}
                      aria-hidden={!visible}
                      data-slot-id={slot.slotId}
                      key={slot.slotId}
                    >
                      <header
                        className="console-slot-header"
                        data-provider-id={slot.providerId}
                      >
                        <span>{label}</span>
                        <label>
                          <span className="sr-only">
                            {slotOnlyLabel} provider
                          </span>
                          <select
                            aria-label={`${slotOnlyLabel} provider`}
                            value={slot.providerId}
                            disabled={
                              !layoutReady ||
                              savingLayout ||
                              isActiveTerminal(terminalStates[slot.slotId])
                            }
                            onChange={(event) =>
                              updateConsoleSlot(
                                slot.slotId,
                                event.target.value as ConsoleProviderId,
                              )
                            }
                          >
                            {CONSOLE_PROVIDERS.map((option) => (
                              <option value={option.id} key={option.id}>
                                {option.displayName}
                              </option>
                            ))}
                          </select>
                        </label>
                      </header>
                      <TerminalSlot
                        slotId={embeddedSlotId}
                        provider={provider}
                        phase={terminalStates[embeddedSlotId].phase}
                        session={terminalStates[embeddedSlotId].session}
                        exitEvent={terminalStates[embeddedSlotId].exitEvent}
                        error={terminalStates[embeddedSlotId].error}
                        resetToken={terminalResetTokens[embeddedSlotId]}
                        displayName={
                          terminalStates[embeddedSlotId].displayName
                        }
                        visible={visible}
                        fontSize={terminalFontSize}
                        startDisabled={slotStartDisabled(provider)}
                        runtime={runtime}
                        onStart={() => openLaunch(provider, embeddedSlotId)}
                        onStop={() => {
                          void stopTerminal(embeddedSlotId).catch(() => {});
                        }}
                        onExit={handleTerminalExit}
                        onOutput={() =>
                          markSlotAttention(embeddedSlotId, "output")
                        }
                        onFocusChange={(focused) =>
                          handleTerminalFocusChange(embeddedSlotId, focused)
                        }
                        onSize={(rows, columns) => {
                          setTerminalSizes((current) => ({
                            ...current,
                            [embeddedSlotId]: { rows, columns },
                          }));
                        }}
                      />
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        </>
      ) : (
        <>
          <section className="intro" aria-labelledby="provider-heading">
            <div>
              <p className="section-label">CLI PROVIDERS</p>
              <h1 id="provider-heading">AI Agent Console</h1>
              <p>
                Discover the AI command-line tools available on this Mac.
                Workspace preferences stay local to this device.
              </p>
            </div>
            <div className="intro-actions">
              <button
                className="refresh-button"
                type="button"
                onClick={() => void refresh()}
                disabled={loading}
              >
                <span aria-hidden="true">↻</span>
                {loading ? "Discovering…" : "Refresh"}
              </button>
              <div className="read-only-badge">
                <span className="status-dot" />
                Read-only discovery
              </div>
            </div>
          </section>

          {pageError && (
            <div className="page-error" role="alert">
              <strong>Discovery unavailable.</strong> {pageError}
            </div>
          )}

          {storageError && (
            <div className="page-error" role="alert">
              <strong>Workspace storage unavailable.</strong> {storageError}
            </div>
          )}

          {launchNotice && (
            <div className="launch-notice" role="status">
              {launchNotice}
            </div>
          )}

          {launchWarning && (
            <div className="page-error" role="alert">
              {launchWarning}
            </div>
          )}

          <section className="provider-grid" aria-live="polite">
            {providers.map((provider, index) => {
              const available = isAvailable(provider);
              const selectedProvider = selectedId === provider.id;
              return (
                <article
                  className={`provider-card ${
                    selectedProvider ? "selected" : ""
                  } ${available ? "" : "unavailable"}`}
                  key={provider.id}
                >
                  <button
                    className="provider-select"
                    type="button"
                    aria-pressed={selectedProvider}
                    aria-label={`${provider.display_name} — ${
                      available ? "Available" : "Unavailable"
                    }`}
                    disabled={!available}
                    onClick={() => setSelectedId(provider.id)}
                  >
                    <span className="provider-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={`availability ${
                        available ? "available" : ""
                      }`}
                    >
                      <span className="status-dot" />
                      {available ? "Available" : "Unavailable"}
                    </span>
                    <span className="provider-name">
                      {provider.display_name}
                    </span>
                    <span className="provider-command">
                      <code>{provider.command}</code>
                    </span>
                    <span className="provider-version">
                      {provider.version ?? "Version unavailable"}
                    </span>
                    {provider.error && (
                      <span className="provider-error">{provider.error}</span>
                    )}
                  </button>
                  <div className="provider-footer">
                    <details>
                      <summary>Executable path</summary>
                      <code>{provider.path ?? "Not found in PATH"}</code>
                    </details>
                    <button
                      className="launch-button"
                      type="button"
                      aria-label={`Launch ${provider.display_name}`}
                      disabled={!available || !storageReady}
                      onClick={() => openLaunch(provider)}
                    >
                      Launch
                    </button>
                  </div>
                </article>
              );
            })}
            {loading && providers.length === 0 && (
              <p className="loading-message">
                Scanning local CLI providers…
              </p>
            )}
          </section>
        </>
      )}

      {launchTarget && (
        <div className="modal-backdrop">
          <section
            className="launch-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="launch-heading"
          >
            <p className="section-label">
              {isEmbeddedSlot(launchDestination)
                ? "EMBEDDED TERMINAL"
                : "LAUNCH CLI"}
            </p>
            <h2 id="launch-heading">{launchTarget.display_name}</h2>
            <p className="modal-copy">
              Choose how this CLI session should start and where it should run.
            </p>

            <form onSubmit={(event) => void submitLaunch(event)}>
              {isEmbeddedSlot(launchDestination) && (
                <label className="workspace-field session-name-field">
                  <span>Session name (optional)</span>
                  <input
                    type="text"
                    value={sessionNameInput}
                    onChange={(event) => {
                      setSessionNameInput(event.target.value);
                      setLaunchError(null);
                    }}
                    maxLength={SESSION_NAME_LIMIT}
                    placeholder="Provider · workspace"
                    disabled={modalBusy}
                    aria-describedby="session-name-hint"
                  />
                  <span className="workspace-hint" id="session-name-hint">
                    Blank uses Provider and workspace folder.{" "}
                    {Array.from(sessionNameInput.trim()).length}/
                    {SESSION_NAME_LIMIT}
                  </span>
                  {sessionNameError && (
                    <span className="field-error" role="alert">
                      {sessionNameError}
                    </span>
                  )}
                </label>
              )}

              <fieldset disabled={modalBusy}>
                <legend>Session</legend>
                <label>
                  <input
                    type="radio"
                    name="session-mode"
                    value="new"
                    checked={sessionMode === "new"}
                    onChange={() => selectSessionMode("new")}
                  />
                  New session
                </label>
                <label>
                  <input
                    type="radio"
                    name="session-mode"
                    value="continue"
                    checked={sessionMode === "continue"}
                    onChange={() => selectSessionMode("continue")}
                  />
                  Continue session
                </label>
              </fieldset>

              {sessionMode === "new" ? (
                <>
                  <div className="workspace-field">
                    <label htmlFor="default-workspace">
                      Default workspace path
                    </label>
                    <div className="workspace-save-row">
                      <input
                        id="default-workspace"
                        type="text"
                        value={workspacePath}
                        onChange={(event) => {
                          setWorkspacePath(event.target.value);
                          setSaveNotice(null);
                        }}
                        placeholder="/Users/name/project"
                        autoFocus
                        disabled={modalBusy}
                        required
                      />
                      <button
                        className="save-workspace-button"
                        type="button"
                        onClick={() => void saveDefaultWorkspace()}
                        disabled={modalBusy || !workspacePath}
                      >
                        {savingDefault ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                  <p className="workspace-hint">
                    Save validates this path without starting a CLI.
                  </p>
                  <label className="workspace-field">
                    <span>New folder (optional)</span>
                    <input
                      type="text"
                      value={newFolder}
                      onChange={(event) => setNewFolder(event.target.value)}
                      placeholder="project-folder"
                      disabled={modalBusy}
                    />
                  </label>
                  {newFolder && (
                    <p className="workspace-preview">
                      Start in:{" "}
                      <code>
                        {workspacePath.replace(/\/+$/, "")}/{newFolder}
                      </code>
                    </p>
                  )}
                </>
              ) : (
                <>
                  <label className="workspace-field">
                    <span>Recent workspace</span>
                    <select
                      value={workspacePath}
                      onChange={(event) => setWorkspacePath(event.target.value)}
                      autoFocus
                      disabled={modalBusy || continueWorkspaces.length === 0}
                      required
                    >
                      {continueWorkspaces.length === 0 ? (
                        <option value="">No recent workspace available</option>
                      ) : (
                        continueWorkspaces.map((path) => (
                          <option value={path} key={path}>
                            {path}
                          </option>
                        ))
                      )}
                    </select>
                  </label>
                  <p className="workspace-hint">
                    Shows up to five workspaces previously started for this
                    provider.
                  </p>
                </>
              )}

              {saveNotice && (
                <div className="modal-success" role="status">
                  {saveNotice}
                </div>
              )}

              {launchError && (
                <div className="modal-error" role="alert">
                  {launchError}
                </div>
              )}

              <div className="modal-actions">
                <button
                  className="cancel-button"
                  type="button"
                  onClick={closeLaunch}
                  disabled={modalBusy}
                >
                  Cancel
                </button>
                <button
                  className="modal-launch-button"
                  type="submit"
                  disabled={
                    modalBusy ||
                    !workspacePath ||
                    embeddedLaunchDisabled ||
                    Boolean(sessionNameError)
                  }
                >
                  {launching
                    ? "Starting…"
                    : isEmbeddedSlot(launchDestination)
                      ? `Start in ${launchDestination.replace("slot-", "Slot ")}`
                      : "Start"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {sessionControlSlots && (
        <div className="modal-backdrop">
          <section
            className="launch-modal session-control-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="session-control-heading"
          >
            <p className="section-label">GLOBAL SESSIONS</p>
            <h2 id="session-control-heading">Stop all active sessions</h2>
            <p className="modal-copy">
              Stop every embedded session, or request a status.md handoff
              without stopping any session.
            </p>

            <div className="session-control-list">
              {sessionControlSlots.map((slotId) => {
                const state = terminalStates[slotId];
                const slot = consoleLayout.slots.find(
                  (item) => item.slotId === slotId,
                )!;
                const provider = providerForConsole(slot.providerId);
                const label = displayLabel(slotId, state);
                const selectable =
                  state.phase === "starting" || state.phase === "running";
                const delivery = handoffDeliveries[slotId];
                return (
                  <article className="session-control-row" key={slotId}>
                    <label>
                      <input
                        type="checkbox"
                        checked={handoffSelection[slotId]}
                        disabled={!selectable || handoffBusy || stopAllBusy}
                        aria-label={`Send status handoff to ${label}`}
                        onChange={(event) => {
                          setHandoffSelection((current) => ({
                            ...current,
                            [slotId]: event.target.checked,
                          }));
                          if (!event.target.checked) {
                            updateHandoffDelivery(slotId, {
                              phase: "idle",
                              error: null,
                            });
                          }
                        }}
                      />
                      <span title={label}>{label}</span>
                    </label>
                    <span>{provider.display_name}</span>
                    <span title={terminalWorkspace(state)}>
                      {terminalWorkspace(state)}
                    </span>
                    <span
                      className={`handoff-phase terminal-phase-${state.phase}`}
                    >
                      {phaseLabel(state.phase)}
                    </span>
                    {delivery.phase !== "idle" && (
                      <div className="handoff-delivery" role="status">
                        <span
                          className={`handoff-delivery-${delivery.phase}`}
                        >
                          {phaseLabel(delivery.phase)}
                        </span>
                        {delivery.error && <span>{delivery.error}</span>}
                        {delivery.phase === "failed" && (
                          <button
                            type="button"
                            onClick={() => {
                              if (state.phase === "error") {
                                retryHandoffRefs.current[slotId] = true;
                                setSessionControlSlots(null);
                              } else {
                                void queueHandoff(slotId);
                              }
                            }}
                          >
                            {state.phase === "error"
                              ? "Retry session"
                              : "Retry"}
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            {duplicateWorkspaceGroups.length > 0 && (
              <div className="workspace-conflict-warning" role="alert">
                <strong>Shared workspace warning.</strong>
                {duplicateWorkspaceGroups.map(([workspace, slots]) => (
                  <span key={workspace}>
                    {workspace}:{" "}
                    {slots
                      .map((slotId) =>
                        displayLabel(slotId, terminalStates[slotId]),
                      )
                      .join(", ")}
                  </span>
                ))}
              </div>
            )}

            {stopAllFailures.length > 0 && (
              <div className="modal-error" role="alert">
                Could not stop:{" "}
                {stopAllFailures
                  .map((slotId) =>
                    displayLabel(slotId, terminalStates[slotId]),
                  )
                  .join(", ")}
              </div>
            )}

            {Object.values(handoffDeliveries).some(
              (delivery) => delivery.phase !== "idle",
            ) && (
              <p className="handoff-note">
                Sent only confirms terminal delivery. Wait for STATUS_READY
                before stopping finished work.
              </p>
            )}

            <div className="modal-actions session-control-actions">
              <button
                className="cancel-button"
                type="button"
                onClick={closeSessionControl}
                disabled={stopAllBusy || handoffBusy}
              >
                {Object.values(handoffDeliveries).some(
                  (delivery) => delivery.phase !== "idle",
                )
                  ? "Done"
                  : "Cancel"}
              </button>
              <button
                className="handoff-button"
                type="button"
                onClick={() => void sendSelectedHandoffs()}
                disabled={
                  handoffBusy ||
                  stopAllBusy ||
                  selectedHandoffSlots.length === 0 ||
                  selectedHandoffSlots.every((slotId) =>
                    ["queued", "sent"].includes(
                      handoffDeliveries[slotId].phase,
                    ),
                  )
                }
              >
                {handoffBusy
                  ? "Sending…"
                  : "未完成 — 先更新 status.md"}
              </button>
              <button
                className="modal-launch-button"
                type="button"
                onClick={() => void stopAllSessions()}
                disabled={stopAllBusy || handoffBusy}
              >
                {stopAllBusy ? "Stopping all…" : "已完成 — Stop All"}
              </button>
            </div>
          </section>
        </div>
      )}

      {windowAction && (
        <div className="modal-backdrop">
          <section
            className="launch-modal close-confirmation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-confirmation-heading"
          >
            <p className="section-label">ACTIVE TERMINALS</p>
            <h2 id="close-confirmation-heading">
              {activeTerminalSlots
                .map((slotId) => slotId.replace("slot-", "Slot "))
                .join(", ")}{" "}
              {activeTerminalSlots.length === 1 ? "is" : "are"} running
            </h2>
            <p className="modal-copy">
              Stop all active process trees before{" "}
              {windowAction === "close" ? "closing" : "reloading"} the App.
            </p>
            {windowActionError && (
              <div className="modal-error" role="alert">
                {windowActionError}
              </div>
            )}
            <div className="modal-actions">
              <button
                className="cancel-button"
                type="button"
                onClick={() => {
                  setWindowAction(null);
                  setWindowActionError(null);
                }}
              >
                Cancel
              </button>
              <button
                className="modal-launch-button"
                type="button"
                onClick={() => void confirmWindowAction()}
              >
                Stop and {windowAction === "close" ? "Close" : "Reload"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
