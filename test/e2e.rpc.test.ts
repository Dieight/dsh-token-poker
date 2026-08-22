/**
 * End-to-end wire test: a real node:http server hosting the /token-poker
 * route, called through the client `createPokerApi` (fetch + DSH client-request
 * envelope). Proves the host and browser halves of the RPC protocol agree.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  registerTokenPokerRoutes,
  type HostWebServerView,
} from "../src/host/rpc";
import { createPokerApi, type ClientConnectionRpc } from "../src/client/api";
import { GameManager } from "../src/runtime/manager";
import { createMemoryStore } from "../src/runtime/file-store";
import type { TokenPokerService } from "../src/host/index";

function makeService(): TokenPokerService {
  const store = createMemoryStore();
  const manager = new GameManager({
    store,
    decide: async () => null,
    publish: () => {},
  });
  return {
    get: (scope) => manager.get(scope ?? "default"),
    join: (scope, name) => manager.join(scope ?? "default", name),
    action: (scope, input) => manager.action(scope ?? "default", input),
    newHand: (scope) => manager.newHand(scope ?? "default"),
    leave: (scope) => manager.leave(scope ?? "default"),
    stats: (scope) => manager.stats(scope ?? "default"),
    rebuy: (scope) => manager.rebuy(scope ?? "default"),
    subscribe: () => () => {},
  };
}

describe("RPC end-to-end over real HTTP", () => {
  let server: Server;
  let base: string;
  let api: ReturnType<typeof createPokerApi>;

  beforeAll(async () => {
    const service = makeService();
    const captureRoutes: HostWebServerView = {
      register: (route) => {
        server = createServer((req, res) =>
          (route.handler as (r: typeof req, s: typeof res) => void)(req, res),
        );
        return () => server.close();
      },
    };
    registerTokenPokerRoutes(captureRoutes, service);

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    base = `http://127.0.0.1:${port}`;

    // Client half: a ClientConnectionRpc that speaks the DSH wire protocol
    // over fetch — the exact shape `ctx.connection.rpc` provides in the browser.
    const rpc: ClientConnectionRpc = {
      call: async (channel, endpoint, payload) => {
        const res = await fetch(`${base}${channel}/${endpoint}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "client-request",
            rpcId: crypto.randomUUID(),
            method: endpoint,
            payload,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const full = (await res.json()) as { result: unknown };
        return full.result as Awaited<ReturnType<ClientConnectionRpc["call"]>>;
      },
    };
    api = createPokerApi(rpc);
  });

  afterAll(() => new Promise<void>((resolve) => server?.close(() => resolve())));

  test("join → get → action round-trip through the wire", async () => {
    const snap = await api.join();
    expect(snap.status).toBe("preflop");
    expect(snap.players[0].isBot).toBe(false);

    const stats = await api.stats();
    expect(typeof stats.hands).toBe("number");

    await api.leave();
  });

  test("client throws on host error results", async () => {
    // game/action with an invalid action type folds to bad-request upstream.
    await expect(
      api.action(undefined, { action: "banana" as never }),
    ).rejects.toThrow();
  });
});
