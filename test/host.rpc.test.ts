import { describe, expect, test } from "vitest";
import { EventEmitter } from "node:events";
import {
  createTokenPokerRpcHandler,
  registerTokenPokerRoutes,
} from "../src/host/rpc";
import type { TokenPokerService } from "../src/host/index";
import type { GameSnapshot } from "../src/engine/game";

function fakeSnapshot(): GameSnapshot {
  return {
    handId: "h-abc",
    status: "waiting",
    dealerSeat: 4,
    communityCards: [],
    pot: 0,
    toCall: 0,
    minRaise: 1000,
    currentTurn: null,
    lastAction: null,
    blinds: { small: 500, big: 1000 },
    players: [
      {
        seat: 0,
        name: "你",
        stack: 100_000,
        holeCards: null,
        folded: false,
        allIn: false,
        contributed: 0,
        isBot: false,
      },
    ],
    lastResult: null,
  };
}

function makeService() {
  const calls: string[] = [];
  const service: TokenPokerService = {
    get: async (scope) => {
      calls.push(`get:${scope ?? ""}`);
      return fakeSnapshot();
    },
    join: async (scope, name) => {
      calls.push(`join:${scope ?? ""}:${name ?? ""}`);
      return fakeSnapshot();
    },
    action: async (scope, input) => {
      calls.push(`action:${scope ?? ""}:${input.action}`);
      return fakeSnapshot();
    },
    newHand: async (scope) => {
      calls.push(`newHand:${scope ?? ""}`);
      return fakeSnapshot();
    },
    leave: async (scope) => {
      calls.push(`leave:${scope ?? ""}`);
    },
    stats: async (scope) => {
      calls.push(`stats:${scope ?? ""}`);
      return { hands: 3, won: 1, net: 500 };
    },
    rebuy: async (scope) => {
      calls.push(`rebuy:${scope ?? ""}`);
    },
    subscribe: () => () => {},
  };
  return { service, calls };
}

const signal = new AbortController().signal;

describe("createTokenPokerRpcHandler", () => {
  test("dispatches known endpoints to the service", async () => {
    const { service, calls } = makeService();
    const handler = createTokenPokerRpcHandler(service);

    const get = await handler("game/get", {}, signal);
    expect(get).toMatchObject({ ok: true });
    expect(calls).toContain("get:");

    const join = await handler("game/join", { scope: "s1", name: "阿宝" }, signal);
    expect(join.ok).toBe(true);
    expect(calls).toContain("join:s1:阿宝");

    const action = await handler(
      "game/action",
      { scope: "s1", action: "bet", amount: 2000 },
      signal,
    );
    expect(action.ok).toBe(true);
    expect(calls).toContain("action:s1:bet");

    const stats = await handler("game/stats", { scope: "s1" }, signal);
    expect(stats.ok && stats.value).toMatchObject({ hands: 3 });

    const leave = await handler("game/leave", {}, signal);
    expect(leave.ok).toBe(true);

    const rebuy = await handler("game/rebuy", {}, signal);
    expect(rebuy.ok).toBe(true);
  });

  test("rejects invalid payloads with bad-request", async () => {
    const { service } = makeService();
    const handler = createTokenPokerRpcHandler(service);

    const badAction = await handler(
      "game/action",
      { action: "banana" },
      signal,
    );
    expect(badAction.ok).toBe(false);
    if (!badAction.ok) expect(badAction.error.code).toBe("bad-request");

    const longName = await handler(
      "game/join",
      { name: "x".repeat(21) },
      signal,
    );
    expect(longName.ok).toBe(false);
  });

  test("unknown endpoints fold into bad-request", async () => {
    const { service } = makeService();
    const handler = createTokenPokerRpcHandler(service);
    const result = await handler("game/hack", {}, signal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("bad-request");
  });

  test("service failures fold into internal errors", async () => {
    const service: TokenPokerService = {
      get: async () => {
        throw new Error("boom");
      },
      join: async () => fakeSnapshot(),
      action: async () => fakeSnapshot(),
      newHand: async () => fakeSnapshot(),
      leave: async () => {},
      stats: async () => ({ hands: 0, won: 0, net: 0 }),
      rebuy: async () => {},
      subscribe: () => () => {},
    };
    const handler = createTokenPokerRpcHandler(service);
    const result = await handler("game/get", {}, signal);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("internal");
      expect(result.error.message).toContain("boom");
    }
  });
});

describe("registerTokenPokerRoutes (webServer wire protocol)", () => {
  function makeReq(method: string, url: string, body?: unknown) {
    const req = new EventEmitter() as EventEmitter & {
      method: string;
      url: string;
      destroy: () => void;
    };
    req.method = method;
    req.url = url;
    req.destroy = () => {};
    const raw = body === undefined ? "" : JSON.stringify(body);
    process.nextTick(() => {
      if (raw) req.emit("data", Buffer.from(raw));
      req.emit("end");
    });
    return req;
  }

  function makeRes() {
    let status = 0;
    let bodyText = "";
    const res = {
      writeHead(s: number, h?: Record<string, string>) {
        status = s;
        void h;
      },
      end(b?: string) {
        bodyText = b ?? "";
      },
    };
    return {
      res,
      status: () => status,
      body: () => {
        try {
          return JSON.parse(bodyText) as Record<string, unknown>;
        } catch {
          return bodyText;
        }
      },
    };
  }

  async function callRoute(
    handler: (r: unknown, s: unknown) => void,
    method: string,
    url: string,
    body?: unknown,
  ) {
    const { res, status, body: bodyGet } = makeRes();
    handler(makeReq(method, url, body), res);
    // handler is async via `void handleRpcRequest`; wait a tick for body stream.
    await new Promise((r) => setTimeout(r, 5));
    return { status: status(), body: bodyGet() };
  }

  test("serves the DSH Connection RPC protocol on /token-poker", async () => {
    const { service } = makeService();
    const routes: Array<{ kind: string; path: string; handler: unknown }> = [];
    const webServer = {
      register: (route: { kind: string; path: string; handler: unknown }) => {
        routes.push(route);
        return () => {};
      },
    };
    const disposer = registerTokenPokerRoutes(webServer as never, service);
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ kind: "prefix", path: "/token-poker" });

    const route = routes[0] as unknown as {
      handler: (r: unknown, s: unknown) => void;
    };
    const { status, body } = await callRoute(
      route.handler,
      "POST",
      "/token-poker/game/join",
      {
        type: "client-request",
        rpcId: "rpc-1",
        method: "game/join",
        payload: { scope: "s1", name: "阿宝" },
      },
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({
      type: "server-response",
      rpcId: "rpc-1",
      result: { ok: true },
    });

    disposer();
  });

  test("rejects non-POST, unknown endpoints, and envelope mismatches", async () => {
    const { service } = makeService();
    const captured: Array<{ handler: (r: unknown, s: unknown) => void }> = [];
    registerTokenPokerRoutes(
      {
        register: (r: unknown) => {
          captured.push(r as { handler: (r: unknown, s: unknown) => void });
          return () => {};
        },
      } as never,
      service,
    );
    const routeHandler = captured[0].handler;

    const wrongMethod = await callRoute(
      routeHandler,
      "GET",
      "/token-poker/game/get",
    );
    expect(wrongMethod.status).toBe(405);

    const unknown = await callRoute(
      routeHandler,
      "POST",
      "/other/game/get",
    );
    expect(unknown.status).toBe(404);

    const mismatch = await callRoute(
      routeHandler,
      "POST",
      "/token-poker/game/get",
      {
        type: "client-request",
        rpcId: "rpc-2",
        method: "game/join",
        payload: {},
      },
    );
    expect(mismatch.status).toBe(200);
    expect(
      (mismatch.body as { result: { ok: boolean } }).result.ok,
    ).toBe(false);
  });
});
