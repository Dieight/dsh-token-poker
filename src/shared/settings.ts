/**
 * Settings namespace shared by the host and browser halves.
 *
 * The browser settings panel writes fields and the host reacts to changes by
 * hot-swapping the AI decider and (on the client) the per-session scope.
 * Kept dependency-free so both bundles can import it.
 */

export const POKER_SETTINGS_NS = "dsh-token-poker";

export interface PokerSettings {
  /** Route AI opponents through the LLM (off → all heuristics). */
  aiEnabled: boolean;
  /** Model provider key (must exist in DSH settings' llm provider registry). */
  provider: string;
  /** Model id used by AI opponents. */
  model: string;
  maxTokens: number;
  temperature: number;
  /** One table per conversation session instead of a shared default table. */
  isolateScope: boolean;
  /** Per-decision LLM timeout in milliseconds. */
  thinkTimeoutMs: number;
}

export const DEFAULT_POKER_SETTINGS: PokerSettings = {
  aiEnabled: true,
  provider: "scnet",
  model: "DeepSeek-V4-Flash-0731",
  maxTokens: 256,
  temperature: 1,
  isolateScope: false,
  thinkTimeoutMs: 30_000,
};

/** Roster shown in the model picker (mirrors settings.yaml llm-pi-ai.scnet). */
export const SCNET_MODELS: readonly string[] = [
  "DeepSeek-V4-Flash-0731",
  "DeepSeek-V4-Pro-0813",
  "Qwen3.8-Max",
  "Kimi-K3",
  "GLM-5.3",
];

/** One provider row from DSH's configurable-provider directory. */
export interface ProviderRow {
  /** Route id (matches DSH llm settings `providers.<id>`). */
  provider: string;
  /** Human display name from the directory. */
  displayName: string;
  /** Model ids configured for this provider. */
  models: string[];
}

export function isPokerSettings(value: unknown): value is PokerSettings {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PokerSettings).aiEnabled === "boolean"
  );
}
