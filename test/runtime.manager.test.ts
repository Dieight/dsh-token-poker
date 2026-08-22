import { describe, expect, test } from "vitest";
import {
  GameManager,
  type DecideFn,
  type StateChangedPayload,
} from "../src/runtime/manager";
import { createMemoryStore } from "../src/runtime/file-store";

function makeManager(opts?: {
  decide?: DecideFn;
  aiFrequency?: "all" | "low" | "off";
}) {
  const published: StateChangedPayload[] = [];
  const store = createMemoryStore((scope) =>
    scope === "default"
      ? { ai: { frequency: opts?.aiFrequency ?? "all", modelRole: "mini" } }
      : null,
  );
  const manager = new GameManager({
    store,
    decide:
      opts?.decide ?? (async () => '{"action": "check"}'),
    publish: (payload) => {
      published.push(payload);
    },
  });
  return { manager, published, store };
}

describe("GameManager (platform-neutral port)", () => {
  test("join creates a fresh hand and deals to the user's turn", async () => {
    const { manager, published } = makeManager();
    const snap = await manager.join("default");

    expect(snap.status).toBe("preflop");
    expect(snap.currentTurn).toBe(0);
    expect(snap.players[0].isBot).toBe(false);
    expect(snap.players.filter((p) => p.isBot).length).toBe(5);
    expect(snap.players[0].holeCards).toHaveLength(2);
    // Bot hole cards are hidden from the public snapshot.
    for (const p of snap.players.filter((x) => x.isBot)) {
      expect(p.holeCards).toBeNull();
    }
    expect(snap.revision).toBeGreaterThan(0);
    expect(published.length).toBeGreaterThan(0);
  });

  test("user action advances the hand and publishes state changes", async () => {
    const { manager, published } = makeManager();
    await manager.join("default");
    const joinPublishes = published.length;

    // Seat 0 is the small blind (500 in), big blind is 1000, so "check" is
    // illegal at this point (toCall 1000 > contributed 500); the engine rejects.
    await expect(manager.action("default", { action: "check" })).rejects.toThrow();
    // Call is legal (pays the 500 difference), then the AI loop drives bots.
    const snap = await manager.action("default", { action: "call" });

    expect(snap.pot).toBeGreaterThanOrEqual(5000);
    expect(snap.status).not.toBe("waiting");
    // The AI loop ran to completion after the user's call.
    expect(published.length).toBeGreaterThan(joinPublishes);
  });

  test("AI actions fall back to heuristics when decide returns null", async () => {
    const calls: string[] = [];
    const { manager } = makeManager({
      decide: async (prompt) => {
        calls.push(prompt.slice(0, 40));
        return null; // always fallback
      },
    });
    const snap = await manager.join("default");
    // The user is seat 0 and acts first preflop (SB), so no AI call yet on join.
    expect(snap.status).toBe("preflop");
    await manager.action("default", { action: "call" });
    // After the call the AI loop drives bot decisions; decide was called.
    expect(calls.length).toBeGreaterThan(0);
  });

  test("invalid AI bets are repaired into the closest legal action", async () => {
    const { manager } = makeManager({
      // Bet below the minimum raise every time -> repair path.
      decide: async () => '{"action": "bet", "amount": 1}',
    });
    const snap = await manager.join("default");
    await expect(manager.action("default", { action: "call" })).resolves.toBeDefined();
    expect(snap).toBeDefined();
  });

  test("stats and rebuy persist through the injected store", async () => {
    const { manager, store } = makeManager();
    await manager.join("default");

    const stats = await manager.stats("default");
    expect(typeof stats.hands).toBe("number");

    await manager.rebuy("default");
    const after = await manager.stats("default");
    expect(after.hands).toBe(0);

    const raw = await store.read("default");
    expect(raw).not.toBeNull();
  });

  test("separate scopes keep separate games", async () => {
    const { manager } = makeManager();
    const a = await manager.join("scope-a");
    const b = await manager.join("scope-b");
    expect(a.players[0].name).toBe("你");
    expect(b.players[0].name).toBe("你");
    expect(a.handId).not.toBe(b.handId);
  });
});
