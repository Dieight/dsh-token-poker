/**
 * StateStore backends: in-memory (tests / headless) and JSON-file (web host).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { StoredState, StateStore } from "./persistence";

/** Non-persistent store; seed with an initial value per scope. */
export function createMemoryStore(
  seed?: (scope: string) => unknown,
): StateStore {
  const data = new Map<string, unknown>();
  return {
    async read(scope) {
      if (!data.has(scope)) data.set(scope, seed?.(scope) ?? null);
      return data.get(scope);
    },
    async write(scope, state) {
      data.set(scope, state);
    },
  };
}

/**
 * One JSON file per scope under `dir`. Sanitizes scope ids into safe file
 * names; state writes are atomic-ish (write temp then rename is avoided on
 * purpose for simplicity — poker state is low-frequency and small).
 */
export function createFileStore(dir: string): StateStore {
  return {
    async read(scope) {
      const file = fileFor(dir, scope);
      try {
        const raw = await readFile(file, "utf8");
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    },
    async write(scope, state) {
      const file = fileFor(dir, scope);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(state, null, 2), "utf8");
    },
  };
}

function fileFor(dir: string, scope: string): string {
  const safe = scope.replace(/[^A-Za-z0-9_-]/g, "_") || "default";
  return join(dir, `state-${safe}.json`);
}

/** Drop a scope's persisted state (used by rebuy/reset paths if needed). */
export async function removeFileStoreState(
  dir: string,
  scope: string,
): Promise<void> {
  const file = fileFor(dir, scope);
  try {
    await writeFile(file, JSON.stringify(undefined), "utf8");
  } catch {
    // best-effort
  }
}

// Re-export so host code can type-store directly.
export type { StoredState };
