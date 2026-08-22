import { describe, expect, test } from "vitest";
import {
  createPokerApi,
  TOKEN_POKER_CHANNEL,
  type ClientConnectionRpc,
} from "../src/client/api";
import type { GameSnapshot } from "../src/engine/game";

function fakeSnapshot(): GameSnapshot {
  return {
    handId: "h-abc",
    status: "preflop",
    dealerSeat: 4,
    communityCards: [],
    pot: 1500,
    toCall: 1000,
    minRaise: 1000,
    currentTurn: 0,
    lastAction: null,
    blinds: { small: 500, big: 1000 },
    players: [],
    lastResult: null,
  };
}

function makeRpc() {
  const calls: Array<{ channel: string; endpoint: string; payload: unknown }> =
    [];
  const rpc: ClientConnectionRpc = {
    call: async (channel, endpoint, payload) => {
      calls.push({ channel, endpoint, payload });
      return { ok: true, value: fakeSnapshot() };
    },
  };
  return { rpc, calls };
}

describe("createPokerApi", () => {
  test("calls the token-poker channel with typed endpoints", async () => {
    const { rpc, calls } = makeRpc();
    const api = createPokerApi(rpc);

    await api.join("s1", "阿宝");
    expect(calls[0]).toMatchObject({
      channel: TOKEN_POKER_CHANNEL,
      endpoint: "game/join",
      payload: { scope: "s1", name: "阿宝" },
    });

    await api.action("s1", { action: "bet", amount: 2000 });
    expect(calls[1].endpoint).toBe("game/action");
    expect(calls[1].payload).toMatchObject({ scope: "s1", action: "bet", amount: 2000 });

    await api.get();
    expect(calls[2].endpoint).toBe("game/get");

    await api.leave();
    await api.stats();
    await api.rebuy();
    await api.newHand();
  });

  test("throws on error results", async () => {
    const rpc: ClientConnectionRpc = {
      call: async () => ({
        ok: false as const,
        error: { code: "bad-request", message: "非法行动" },
      }),
    };
    const api = createPokerApi(rpc);
    await expect(api.action(undefined, { action: "fold" })).rejects.toThrow(
      "非法行动",
    );
  });

  test("action without amount omits the field", async () => {
    const { rpc, calls } = makeRpc();
    const api = createPokerApi(rpc);
    await api.action(undefined, { action: "check" });
    expect(calls[0].payload).toMatchObject({ action: "check" });
    expect(calls[0].payload).not.toHaveProperty("amount");
  });
});
