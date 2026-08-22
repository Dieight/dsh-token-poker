/**
 * dsh-token-poker — host half (Cordis plugin, Node side).
 *
 * Wires the platform-neutral GameManager into DSH:
 *   - persistence  -> JSON files under $DSH_HOME/data/dsh-token-poker
 *   - AI decisions -> ctx.llm.stream (when llm.provider/model configured),
 *                     otherwise deterministic heuristic fallback
 *   - state events -> service-level subscribe() (client RPC wires in later)
 *
 * The provided `tokenPoker` service is the host-side surface the browser half
 * (and other plugins) call.
 */
import { z } from "zod";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import {
  GameManager,
  type DecideFn,
  type StateChangedPayload,
} from "../runtime/manager";
import type { PlayerAction, GameSnapshot } from "../engine/game";
import type { StoredState } from "../runtime/persistence";
import { createFileStore } from "../runtime/file-store";
import {
  createLlmDecider,
  isLlmRouteConfigured,
  type LlmRoute,
} from "../runtime/llm";
import {
  registerTokenPokerRoutes,
  type HostWebServerView,
} from "./rpc";
import {
  installPokerSettings,
  settingsBaseFromConfig,
} from "./settings";

export const name = "dsh-token-poker";

export const inject = ["webServer"];

// Like other DSH bundles, tolerate a missing patch entry `config`: the loader
// validates the plugin config with the StandardSchema protocol, and a bare
// entry (no `config:` key) resolves to `undefined` — preprocess it to {} so
// the zod object schema accepts it (same pattern as dsh-context's Config).
export const Config = z.preprocess(
  (v) => v ?? {},
  z
    .object({
      llm: z
        .object({
          provider: z.string(),
          model: z.string(),
          maxTokens: z.number().int().positive().optional(),
          temperature: z.number().min(0).max(2).optional(),
        })
        .optional(),
      /** Override the JSON state directory (default: $DSH_HOME/data/dsh-token-poker). */
      stateDir: z.string().optional(),
      /** Default game scope; callers may pass their own per-session scope. */
      scope: z.string().optional(),
    })
    .partial(),
);

export type Config = z.infer<typeof Config>;

/** Host service surface exposed to the browser half and other plugins. */
export interface TokenPokerService {
  get(scope?: string): Promise<GameSnapshot>;
  join(scope?: string, name?: string): Promise<GameSnapshot>;
  action(scope: string | undefined, input: PlayerAction): Promise<GameSnapshot>;
  newHand(scope?: string): Promise<GameSnapshot>;
  leave(scope?: string): Promise<void>;
  stats(scope?: string): Promise<StoredState["stats"]>;
  rebuy(scope?: string): Promise<void>;
  subscribe(listener: (payload: StateChangedPayload) => void): () => void;
}

export function apply(ctx: Context, config: Config): (() => void) | void {
  const cfg = Config.parse(config ?? {});
  const stateDir = cfg.stateDir ?? defaultStateDir();
  const store = createFileStore(stateDir);

  const listeners = new Set<(payload: StateChangedPayload) => void>();

  let route: LlmRoute | undefined;
  if (cfg.llm && isLlmRouteConfigured(cfg.llm)) {
    route = {
      provider: cfg.llm.provider,
      model: cfg.llm.model,
      maxTokens: cfg.llm.maxTokens,
      temperature: cfg.llm.temperature,
    };
    console.info(
      `[dsh-token-poker] AI 对手已配置模型路由 ${cfg.llm.provider}/${cfg.llm.model}`,
    );
  } else {
    console.warn(
      "[dsh-token-poker] 未配置 llm.provider/model，AI 对手将全部使用启发式策略",
    );
  }

  // Mutable AI decider: the settings namespace can hot-swap it at runtime.
  const decideRef: { current: DecideFn } = {
    current: route ? createLlmDecider(ctx, route) : async () => null,
  };

  const manager = new GameManager({
    store,
    decide: (prompt, opts) => decideRef.current(prompt, opts),
    publish: (payload) => {
      for (const listener of listeners) listener(payload);
    },
  });

  // Per-session isolation is driven from the client (it knows the session id);
  // the host just keeps a scope base for callers without an explicit scope.
  const scopeBase = cfg.scope ?? "default";
  const resolveScope = (scope?: string) => scope ?? scopeBase;

  const service: TokenPokerService = {
    get: (scope) => manager.get(resolveScope(scope)),
    join: (scope, joinName) => manager.join(resolveScope(scope), joinName),
    action: (scope, input) => manager.action(resolveScope(scope), input),
    newHand: (scope) => manager.newHand(resolveScope(scope)),
    leave: (scope) => manager.leave(resolveScope(scope)),
    stats: (scope) => manager.stats(resolveScope(scope)),
    rebuy: (scope) => manager.rebuy(resolveScope(scope)),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  // Compose cleanup: service registration + RPC route.
  const cleanups: Array<() => void> = [ctx.provide("tokenPoker", service)];

  // Expose the service to the browser half by registering the `/token-poker`
  // prefix route on the host webServer (the same pattern dshmarket uses; DSH's
  // generic Connection RPC channel only exists on the client half). The route
  // implements DSH's Connection RPC wire protocol so the client's
  // `rpc.call("/token-poker", ...)` works unchanged. `webServer` comes from
  // `inject`; the guard keeps the plugin loadable in headless compositions.
  const webServer = ctx.get("webServer", false) as HostWebServerView | undefined;
  if (webServer?.register) {
    cleanups.push(registerTokenPokerRoutes(webServer, service));
  } else {
    console.warn(
      "[dsh-token-poker] webServer 服务不可用，浏览器调用通道未注册（仅 host 服务可用）",
    );
  }

  // Settings namespace drives the AI decider at runtime (browser panel edits
  // land here through DSH's settings transport + watcher).
  installPokerSettings(ctx, settingsBaseFromConfig(cfg.llm), (settings) => {
    const next = settings.aiEnabled && settings.provider && settings.model;
    if (next) {
      route = {
        provider: settings.provider,
        model: settings.model,
        maxTokens: settings.maxTokens,
        temperature: settings.temperature,
      };
      decideRef.current = createLlmDecider(ctx, {
        ...route,
        thinkTimeoutMs: settings.thinkTimeoutMs,
      });
    } else {
      route = undefined;
      decideRef.current = async () => null;
    }
    console.info(
      `[dsh-token-poker] 设置已应用: AI=${route ? `on (${route.provider}/${route.model})` : "off"} isolateScope=${settings.isolateScope ? "on" : "off"}`,
    );
  });

  return () => {
    for (const dispose of cleanups) dispose();
  };
}

function defaultStateDir(): string {
  const home = process.env.DSH_HOME || join(homedir(), ".dsh");
  return join(home, "data", "dsh-token-poker");
}
