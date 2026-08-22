/**
 * Host-side settings namespace registration for dsh-token-poker.
 *
 * Registers the namespace into DSH's settings document (settings.yaml) with a
 * schemastery schema. The browser settings panel writes through the client
 * settings transport (`connection.api.settings.mutate`), and the host reacts
 * through the namespace watcher, hot-swapping the AI decider without a reload.
 *
 * DSH's host `settings` service is optional: when absent (headless/minimal
 * compositions) the plugin keeps working with the entry defaults.
 */
import type { Context } from "@deepseek-ai/cordis";
import Schema from "@deepseek-ai/schemastery";
import {
  DEFAULT_POKER_SETTINGS,
  POKER_SETTINGS_NS,
  type PokerSettings,
} from "../shared/settings";

/** schemastery schema resolving the namespace's value (UI metadata included). */
export const pokerSettingsSchema = Schema.object({
  aiEnabled: Schema.boolean()
    .default(DEFAULT_POKER_SETTINGS.aiEnabled)
    .description("真实 AI 对手（关闭则全部启发式）"),
  provider: Schema.string()
    .default(DEFAULT_POKER_SETTINGS.provider)
    .description("模型供应商（须存在于 DSH 设置的 llm 路由）"),
  model: Schema.string()
    .default(DEFAULT_POKER_SETTINGS.model)
    .description("AI 对手使用的模型"),
  maxTokens: Schema.natural()
    .default(DEFAULT_POKER_SETTINGS.maxTokens)
    .min(16)
    .max(4096),
  temperature: Schema.number()
    .default(DEFAULT_POKER_SETTINGS.temperature)
    .min(0)
    .max(2),
  isolateScope: Schema.boolean()
    .default(DEFAULT_POKER_SETTINGS.isolateScope)
    .description("会话隔离：每个会话一张独立牌桌"),
  thinkTimeoutMs: Schema.natural()
    .default(DEFAULT_POKER_SETTINGS.thinkTimeoutMs)
    .min(1_000)
    .max(120_000),
});

/** Minimal structural view of DSH's host `settings` service. */
export interface SettingsServiceView {
  register(
    ns: string,
    schema: unknown,
    options?: { base?: unknown; validate?: (value: unknown) => void },
  ): {
    get(): unknown;
    watch(callback: () => void): () => void;
    update(patch: unknown): Promise<unknown>;
    replace(section: unknown): Promise<unknown>;
  };
}

/** Seed the namespace from a legacy patch `llm` block, if any. */
export function settingsBaseFromConfig(llm?: {
  provider: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}): Partial<PokerSettings> {
  if (!llm) return {};
  return {
    aiEnabled: true,
    provider: llm.provider,
    model: llm.model,
    maxTokens: llm.maxTokens ?? DEFAULT_POKER_SETTINGS.maxTokens,
    temperature: llm.temperature ?? DEFAULT_POKER_SETTINGS.temperature,
  };
}

/**
 * Register the namespace (when a settings service exists) and drive
 * `applySettings` once on registration and on every subsequent change.
 */
export function installPokerSettings(
  ctx: Context,
  base: Partial<PokerSettings> | undefined,
  applySettings: (settings: PokerSettings) => void,
): void {
  const entry = { ...DEFAULT_POKER_SETTINGS, ...base };
  ctx.inject(
    ["settings"] as never,
    (sctx: Context & { settings?: SettingsServiceView }) => {
      const service = sctx.settings;
      if (!service?.register) return;
      const scope = service.register(POKER_SETTINGS_NS, pokerSettingsSchema, {
        base: entry,
      });
      const read = (): PokerSettings =>
        (scope.get() as PokerSettings | undefined) ?? entry;
      applySettings(read());
      sctx.effect(() => scope.watch(() => applySettings(read())));
    },
  );
}
