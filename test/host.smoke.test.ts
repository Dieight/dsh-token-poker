import { describe, expect, test } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply, Config, name, type TokenPokerService } from "../src/host/index";

/** Minimal llm service whose stream always yields a legal "check". */
function makeFakeLlm() {
  return {
    stream: (_options: unknown) =>
      (async function* () {
        yield { type: "text-delta", index: 0, text: '{"action":"' };
        yield { type: "text-delta", index: 0, text: 'check"}' };
        yield { type: "finish", reason: { kind: "stop" } };
      })(),
  };
}

describe("host plugin (cordis integration)", () => {
  test("loads and serves tokenPoker end-to-end with a fake llm", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-token-poker-smoke-"));
    try {
      const app = new Context();
      app.provide("llm", makeFakeLlm() as never);

      await app.plugin(
        { apply },
        { llm: { provider: "fake", model: "fake-model" }, stateDir: dir },
      );

      const service = app.get("tokenPoker") as TokenPokerService;
      expect(service).toBeDefined();

      const snap = await service.join();
      expect(snap.status).toBe("preflop");
      expect(snap.players[0].isBot).toBe(false);

      const stats = await service.stats();
      expect(typeof stats.hands).toBe("number");

      await service.leave();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("falls back to heuristics when no llm route is configured", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-token-poker-smoke-"));
    try {
      const app = new Context();
      await app.plugin({ apply }, { stateDir: dir });

      const service = app.get("tokenPoker") as TokenPokerService;
      const snap = await service.join();
      expect(snap.status).toBe("preflop");

      // user (SB) acts; with no llm the bots still play via heuristics.
      await service.action(undefined, { action: "call" });
      const stats = await service.stats();
      expect(stats.hands).toBeGreaterThanOrEqual(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("registers the /token-poker RPC route when webServer is present", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-token-poker-smoke-"));
    try {
      const registered: Array<{
        kind: string;
        path: string;
        handler: unknown;
      }> = [];
      const app = new Context();
      app.provide("webServer", {
        register: (
          route: { kind: string; path: string; handler: unknown },
        ) => {
          registered.push(route);
          return () => {};
        },
      } as never);

      await app.plugin({ apply, inject: ["webServer"] }, { stateDir: dir });

      expect(registered.length).toBe(1);
      expect(registered[0]).toMatchObject({
        kind: "prefix",
        path: "/token-poker",
      });
      expect(typeof registered[0].handler).toBe("function");

      // Service is still reachable through the cordis context.
      const service = app.get("tokenPoker") as TokenPokerService;
      expect(service).toBeDefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("loads with no config (loader passes undefined)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-token-poker-smoke-"));
    try {
      const app = new Context();
      // cordis resolves the plugin config through the StandardSchema protocol
      // (`Config["~standard"].validate(config)`); with no patch `config:` key
      // the loader passes `undefined`. The preprocess step must accept it.
      await app.plugin({ apply, name, Config } as never, undefined as never);

      const service = app.get("tokenPoker") as TokenPokerService;
      expect(service).toBeDefined();
      const snap = await service.join();
      expect(snap.status).toBe("preflop");
      await service.leave();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
