import { describe, expect, test } from "vitest";
import { pokerSettingsSchema } from "../src/host/settings";
import { DEFAULT_POKER_SETTINGS } from "../src/shared/settings";

describe("poker settings schema (schemastery)", () => {
  test("resolves defaults with no input", () => {
    const value = pokerSettingsSchema(undefined);
    expect(value).toMatchObject({
      aiEnabled: DEFAULT_POKER_SETTINGS.aiEnabled,
      provider: DEFAULT_POKER_SETTINGS.provider,
      model: DEFAULT_POKER_SETTINGS.model,
      maxTokens: DEFAULT_POKER_SETTINGS.maxTokens,
      temperature: DEFAULT_POKER_SETTINGS.temperature,
      isolateScope: DEFAULT_POKER_SETTINGS.isolateScope,
      thinkTimeoutMs: DEFAULT_POKER_SETTINGS.thinkTimeoutMs,
    });
  });

  test("merges partial overrides onto defaults", () => {
    const value = pokerSettingsSchema({
      model: "Kimi-K3",
      temperature: 0.5,
      isolateScope: true,
    });
    expect(value.model).toBe("Kimi-K3");
    expect(value.temperature).toBe(0.5);
    expect(value.isolateScope).toBe(true);
    expect(value.aiEnabled).toBe(true);
    expect(value.maxTokens).toBe(256);
  });

  test("rejects out-of-range values", () => {
    expect(() => pokerSettingsSchema({ temperature: 5 })).toThrow();
  });
});
