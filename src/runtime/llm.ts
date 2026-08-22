/**
 * DSH LLM adapter: wraps `ctx.llm.stream(...)` into the GameManager's
 * `DecideFn`. Missing route / service / failure all degrade to `null` so the
 * manager falls back to its deterministic heuristic (the game never stalls).
 *
 * Types are structural and local (no `@deepseek-ai/*` runtime imports): the
 * user message is built with a structure-equivalent helper so this package
 * never pulls the DSH package tree into its bundle.
 */
import type { Context } from "@deepseek-ai/cordis";
import type { DecideFn } from "./manager";

export interface LlmRoute {
  provider: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  /** Per-decision timeout; defaults to the caller-provided value. */
  thinkTimeoutMs?: number;
}

/** Structural twin of `createUserMessage` from `@deepseek-ai/dsh-llm`. */
export function createUserMessage(input: {
  content: Array<{ type: "text"; text: string }>;
  source: { kind: string; plugin: string };
}): {
  id: string;
  role: "user";
  content: Array<{ type: "text"; text: string }>;
  source: { kind: string; plugin: string };
} {
  return Object.freeze({
    id: crypto.randomUUID(),
    role: "user",
    content: input.content,
    source: input.source,
  });
}

/** True when a usable model route was configured. */
export function isLlmRouteConfigured(route: unknown): route is LlmRoute {
  return (
    typeof route === "object" &&
    route !== null &&
    typeof (route as LlmRoute).provider === "string" &&
    typeof (route as LlmRoute).model === "string"
  );
}

export function createLlmDecider(ctx: Context, route: LlmRoute): DecideFn {
  return async (prompt, opts) => {
    const llm = ctx.get("llm");
    if (!llm) return null;

    let text = "";
    const ac = new AbortController();
    const timeoutMs = route.thinkTimeoutMs ?? opts.timeoutMs;
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      for await (const chunk of llm.stream({
        provider: route.provider,
        model: route.model,
        messages: [
          createUserMessage({
            content: [{ type: "text", text: prompt }],
            source: { kind: "plugin", plugin: "dsh-token-poker" },
          }),
        ],
        temperature: route.temperature,
        maxTokens: route.maxTokens ?? 256,
        signal: ac.signal,
      })) {
        if (chunk.type === "text-delta") {
          text += chunk.text;
        } else if (chunk.type === "finish") {
          if (
            chunk.reason.kind === "error" ||
            chunk.reason.kind === "aborted"
          ) {
            return null;
          }
        }
      }
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }

    const trimmed = text.trim();
    return trimmed ? trimmed.slice(0, opts.maxOutputChars) : null;
  };
}
