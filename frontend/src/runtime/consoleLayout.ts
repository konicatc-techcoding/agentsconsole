import type {
  ConsoleLayout,
  ConsoleProviderId,
  ConsoleSlotId,
} from "../types";

export const CONSOLE_PROVIDERS: ReadonlyArray<{
  id: ConsoleProviderId;
  displayName: string;
  command: string;
}> = [
  { id: "hermes", displayName: "Hermes CLI", command: "hermes" },
  { id: "codex", displayName: "Codex CLI", command: "codex" },
  { id: "claude", displayName: "Claude CLI", command: "claude" },
  {
    id: "antigravity",
    displayName: "Antigravity CLI",
    command: "agy",
  },
];

const SLOT_IDS: ConsoleSlotId[] = [
  "slot-1",
  "slot-2",
  "slot-3",
  "slot-4",
];

export function defaultConsoleLayout(): ConsoleLayout {
  return {
    version: 1,
    slots: SLOT_IDS.map((slotId, index) => ({
      slotId,
      providerId: CONSOLE_PROVIDERS[index].id,
    })),
  };
}

export function consoleLayoutsEqual(
  first: ConsoleLayout | null,
  second: ConsoleLayout,
): boolean {
  return (
    first !== null &&
    first.version === second.version &&
    first.slots.every(
      (slot, index) =>
        slot.slotId === second.slots[index]?.slotId &&
        slot.providerId === second.slots[index]?.providerId,
    )
  );
}
