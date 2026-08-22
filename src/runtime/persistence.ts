/**
 * Persistence for dsh-token-poker — platform-neutral port of token-poker's
 * settings-backed storage. The GameManager talks to a `StateStore` interface;
 * concrete backends (file, memory) live in this package and the host wires one in.
 */
import type { GameSnapshot } from "../engine/game";

export const SCHEMA_VERSION = 1;

export interface StoredState {
  schemaVersion: number;
  user: { name: string };
  balance: number;
  stats: { hands: number; won: number; net: number };
  recovery: GameSnapshot | null;
  ai: { frequency: "all" | "low" | "off"; modelRole: "nano" | "mini" };
  roster: Record<string, string>;
}

export function defaultState(): StoredState {
  return {
    schemaVersion: SCHEMA_VERSION,
    user: { name: "你" },
    balance: 100_000,
    stats: { hands: 0, won: 0, net: 0 },
    recovery: null,
    ai: { frequency: "all", modelRole: "mini" },
    roster: {},
  };
}

/** A place to read/write one game scope's persisted state. */
export interface StateStore {
  read(scope: string): Promise<unknown>;
  write(scope: string, state: StoredState): Promise<void>;
}

/** Merge raw stored JSON over defaults, normalizing nested objects. */
export function normalizeState(raw: unknown): StoredState {
  const merged = {
    ...defaultState(),
    ...(raw && typeof raw === "object" ? (raw as Partial<StoredState>) : {}),
  };
  return {
    ...merged,
    schemaVersion: SCHEMA_VERSION,
    user: { ...defaultState().user, ...(merged.user ?? {}) },
    stats: { ...defaultState().stats, ...(merged.stats ?? {}) },
    ai: { ...defaultState().ai, ...(merged.ai ?? {}) },
    roster: { ...(merged.roster ?? {}) },
  };
}

export async function loadState(
  store: StateStore,
  scope: string,
): Promise<StoredState> {
  return normalizeState(await store.read(scope));
}

export async function saveState(
  store: StateStore,
  scope: string,
  state: StoredState,
): Promise<void> {
  await store.write(scope, state);
}
