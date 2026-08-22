/**
 * dsh-token-poker — client half (browser Cordis plugin).
 *
 * Builds the typed `PokerApi` over the host's `/token-poker` RPC channel
 * (`ctx.connection.rpc`), injects the table styles, mounts the React poker
 * table as a `conversation.view` tab, and adds a Poker section to DSH's
 * Settings page (`settings.section` slot) that edits the `dsh-token-poker`
 * settings namespace. The provider/model pickers read DSH's configured
 * provider directory (`connection.api.llm.providers` + the settings describe
 * mirror), so they always match what DSH has configured locally.
 */
import React from "react";
import type { Context } from "@deepseek-ai/cordis";
import { createPokerApi, type ClientConnectionRpc } from "./api";
import { PokerPage } from "./poker-page";
import { PokerSettingsPanel } from "./settings-panel";
import pokerCss from "./poker.css";
import {
  POKER_SETTINGS_NS,
  type PokerSettings,
  type ProviderRow,
} from "../shared/settings";

export const name = "dsh-token-poker";
export const inject = ["connection", "slots", "locale", "settingsScope", "sessions"];

/** Client-side service surface consumed by the React UI. */
export interface TokenPokerClient {
  readonly api: ReturnType<typeof createPokerApi>;
}

/** Minimal view of the client settings scope (`settingsScope.bind`). */
interface SettingsScopeView {
  store: unknown;
  getSnapshot(): {
    status: string;
    value?: unknown;
    writable?: boolean;
  };
  set(field: string, value: unknown): Promise<void>;
}

/** Minimal view of the client settings scope service. */
interface SettingsScopeServiceView {
  bind(spec: { namespace: string }): SettingsScopeView;
  describe?(): {
    ensure?(): Promise<unknown>;
    getSnapshot(): {
      view?: { namespaces?: Array<{ ns: string; value?: unknown }> };
    };
  };
}

/** Minimal view of `connection.api` (DSH apiProxy face). */
interface DshApiView {
  llm?: {
    providers(
      input: unknown,
    ): Promise<{
      result: {
        ok: boolean;
        value?: { providers?: unknown[] };
        error?: { message?: string };
      };
    }>;
  };
}

function getPath(obj: unknown, path: string[]): unknown {
  let cursor: unknown = obj;
  for (const key of path) {
    if (typeof cursor !== "object" || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

const settingsZh = {
  nav: "Poker 设置",
  description: "配置德州扑克插件：AI 对手、模型与牌桌隔离。",
  aiEnabled: "真实 AI 对手",
  provider: "模型供应商",
  model: "AI 模型",
  maxTokens: "最大 Token",
  temperature: "温度",
  isolateScope: "会话隔离（每会话独立牌桌）",
  thinkTimeoutMs: "AI 思考超时 (ms)",
  providersError: "供应商目录加载失败",
};

const settingsEn = {
  nav: "Poker Settings",
  description:
    "Configure the poker plugin: AI opponents, model, and table isolation.",
  aiEnabled: "Real AI opponents",
  provider: "Provider",
  model: "Model",
  maxTokens: "Max tokens",
  temperature: "Temperature",
  isolateScope: "Isolate tables per session",
  thinkTimeoutMs: "AI think timeout (ms)",
  providersError: "Failed to load provider directory",
};

export function apply(ctx: Context): void {
  // Table styles as a managed <style> tag (removed on fiber dispose).
  ctx.effect(() => {
    const tag = document.createElement("style");
    tag.setAttribute("data-plugin", "dsh-token-poker");
    tag.textContent = pokerCss;
    document.head.appendChild(tag);
    return () => {
      if (tag.parentNode !== null) tag.parentNode.removeChild(tag);
    };
  }, "dsh-token-poker: styles");

  // Typed game API over the host RPC channel + DSH's apiProxy face.
  const connection = ctx.get("connection") as {
    rpc: ClientConnectionRpc;
    api?: DshApiView;
  };
  const api = createPokerApi(connection.rpc);
  ctx.provide("tokenPokerClient", { api });

  const slots = ctx.get("slots", false) as
    | { inject(name: string, factory: () => unknown): void }
    | undefined;
  const locale = ctx.get("locale", false) as
    | {
        register(ns: string, dicts: Record<string, unknown>): () => void;
        bind(ns: string): (key: string) => string;
      }
    | undefined;
  const settingsScopeSvc = ctx.get("settingsScope", false) as
    | SettingsScopeServiceView
    | undefined;

  const settingsScope = settingsScopeSvc?.bind({ namespace: POKER_SETTINGS_NS });
  const t = locale?.bind("settings.tokenPoker") ?? ((key: string) => key);

  // Locale dictionaries for the settings section.
  if (locale) {
    ctx.effect(
      () =>
        locale.register("settings.tokenPoker", { zh: settingsZh, en: settingsEn }),
      "dsh-token-poker: settings locales",
    );
  }

  // Resolve DSH's configured provider directory: routes from
  // `connection.api.llm.providers`, model lists from the settings describe
  // mirror at the provider's settingsPath.
  async function loadProviders(): Promise<ProviderRow[]> {
    const apiProxy = connection.api;
    if (!apiProxy?.llm?.providers) return [];
    const response = await apiProxy.llm.providers({});
    if (!response.result.ok) {
      throw new Error(response.result.error?.message ?? "llm providers failed");
    }
    const entries = (response.result.value?.providers ?? []) as Array<{
      provider?: string;
      displayName?: string;
      settingsNs?: string;
      settingsPath?: string[];
      active?: boolean;
    }>;
    const face = settingsScopeSvc?.describe?.();
    await face?.ensure?.();
    const view = face?.getSnapshot()?.view;
    const namespaces = new Map(
      (view?.namespaces ?? []).map((ns) => [ns.ns, ns.value]),
    );
    return entries
      .filter((entry) => entry.provider && entry.active !== false)
      .map((entry) => {
        const nsValue = namespaces.get(entry.settingsNs ?? "");
        const profile: unknown = entry.settingsPath?.length
          ? getPath(nsValue, entry.settingsPath)
          : undefined;
        const profileRecord =
          typeof profile === "object" && profile !== null
            ? (profile as Record<string, unknown>)
            : undefined;
        const models = Array.isArray(profileRecord?.models)
          ? (profileRecord.models as unknown[])
              .map((model) =>
                typeof model === "string"
                  ? model
                  : (model as { id?: string } | null)?.id,
              )
              .filter((id): id is string => typeof id === "string")
          : [];
        return {
          provider: entry.provider as string,
          displayName: entry.displayName || (entry.provider as string),
          models,
        };
      });
  }

  // Mount the poker table as a conversation view tab (right of Context).
  if (slots?.inject) {
    slots.inject("conversation.view", () =>
      ctx
        .get("slots")
        .register(
          {
            name: "conversation.view",
            id: "poker",
            order: 20,
            label: () => "Poker",
          },
          (props: unknown) => {
            // Session isolation: when enabled, each session gets its own table
            // keyed by the current conversation id.
            const snap = settingsScope?.getSnapshot();
            const isolated = !!(
              (snap?.value as Partial<PokerSettings> | undefined)?.isolateScope
            );
            const sessions = ctx.get("sessions", false) as
              | { list?: { getSnapshot(): { current?: string } } }
              | undefined;
            const current = sessions?.list?.getSnapshot?.().current;
            const scope = isolated && current ? `session:${current}` : undefined;
            return React.createElement(PokerPage, {
              ...(props as Record<string, unknown>),
              api,
              scope,
            });
          },
        ),
    );

    // Settings section (sidebar nav + full panel).
    if (settingsScope) {
      slots.inject("settings.section", () =>
        ctx
          .get("slots")
          .register(
            {
              name: "settings.section",
              id: "dsh-token-poker",
              order: 30,
              label: () => t("nav"),
              locale: "settings.tokenPoker",
              inject: () => ({
                hooks: { pokerSettings: settingsScope.store },
                setField: (field: string, value: unknown) =>
                  void settingsScope.set(field, value),
                loadProviders,
              }),
            },
            (props: unknown) =>
              React.createElement(
                PokerSettingsPanel,
                props as React.ComponentProps<typeof PokerSettingsPanel>,
              ),
          ),
      );
    }
  }
}
