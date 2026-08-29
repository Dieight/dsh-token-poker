/**
 * Render smoke tests for the React UI port. Uses `react-dom/server` so the
 * components render synchronously (effects like the bubble timer and count-up
 * don't run in SSR) — exactly the right granularity to prove the markup is
 * structurally correct without a DOM/jsdom dependency.
 */
import React from "react";
import { describe, expect, test } from "vitest";
import { renderToString } from "react-dom/server";
import type { GameSnapshot, PlayerState } from "../src/engine/game";
import { ActionBar } from "../src/client/action-bar";
import { TableTop } from "../src/client/table-top";
import { PokerPage } from "../src/client/poker-page";
import { PokerSettingsPanel } from "../src/client/settings-panel";
import { DEFAULT_POKER_SETTINGS } from "../src/shared/settings";
import type { PokerApi } from "../src/client/api";

function player(over: Partial<PlayerState>): PlayerState {
  return {
    seat: 0,
    name: "阿宝",
    stack: 100_000,
    holeCards: null,
    folded: false,
    allIn: false,
    contributed: 0,
    isBot: false,
    ...over,
  };
}

function snapshot(over: Partial<GameSnapshot>): GameSnapshot {
  return {
    handId: "h-1",
    status: "preflop",
    dealerSeat: 4,
    communityCards: [],
    pot: 1500,
    toCall: 1000,
    minRaise: 1000,
    currentTurn: 0,
    lastAction: null,
    blinds: { small: 500, big: 1000 },
    players: [
      player({ seat: 0, name: "阿宝" }),
      player({ seat: 1, name: "小蓝", isBot: true, contributed: 500 }),
      player({ seat: 4, name: "阿紫", isBot: true, contributed: 1000 }),
    ],
    lastResult: null,
    ...over,
  };
}

describe("ActionBar", () => {
  test("my turn preflop shows call/bet/fold + slider", () => {
    const html = renderToString(
      <ActionBar
        snapshot={snapshot({})}
        busy={false}
        onAction={() => {}}
      />,
    );
    expect(html).toContain("跟注");
    expect(html).toContain("下注");
    expect(html).toContain("弃牌");
    expect(html).toContain("type=\"range\"");
  });

  test("waiting on opponents hides my buttons", () => {
    const html = renderToString(
      <ActionBar
        snapshot={snapshot({ currentTurn: 1 })}
        busy={false}
        onAction={() => {}}
      />,
    );
    expect(html).toContain("等待对手行动");
    expect(html).not.toContain("跟注");
    expect(html).not.toContain("下注");
  });
});

describe("TableTop", () => {
  test("renders seats, pot, dealer, hidden bot hole cards", () => {
    const html = renderToString(<TableTop snapshot={snapshot({})} />);
    expect(html).toContain("阿宝");
    expect(html).toContain("小蓝");
    expect(html).toContain("Pot");
    expect(html).toContain("庄家");
    expect(html).toContain("牌背"); // bot hole cards face down
    expect(html).toContain("轮到你");
  });

  test("handEnded with result renders the result overlay", () => {
    const html = renderToString(
      <TableTop
        snapshot={snapshot({
          status: "handEnded",
          toCall: 0,
          communityCards: [
            { rank: 14, suit: "h" },
            { rank: 13, suit: "h" },
            { rank: 12, suit: "h" },
          ],
          pot: 3000,
          lastResult: {
            winnerSeats: [0],
            winningAmounts: [3000],
            potSplits: [{ seat: 0, amount: 3000 }],
            showdown: [
              {
                seat: 0,
                cards: [
                  { rank: 14, suit: "h" },
                  { rank: 13, suit: "h" },
                ],
                handName: "皇家同花顺",
                bestHand: [
                  { rank: 14, suit: "h" },
                  { rank: 13, suit: "h" },
                  { rank: 12, suit: "h" },
                  { rank: 11, suit: "h" },
                  { rank: 10, suit: "h" },
                ],
              },
            ],
          },
        })}
      />,
    );
    expect(html).toContain("你赢了！");
    expect(html).toContain("皇家同花顺");
    expect(html).toContain("摊牌牌型排行");
  });
});

describe("PokerPage", () => {
  test("shows joining placeholder before snapshot arrives", () => {
    const api: PokerApi = {
      get: async () => snapshot({}),
      join: async () => snapshot({}),
      action: async () => snapshot({}),
      newHand: async () => snapshot({}),
      leave: async () => {},
      stats: async () => ({ hands: 0, won: 0, net: 0 }),
      rebuy: async () => {},
    };
    const html = renderToString(<PokerPage api={api} />);
    expect(html).toContain("No-Limit Inference");
    expect(html).toContain("加入牌桌…");
  });
});

describe("PokerSettingsPanel", () => {
  test("renders controls from the settings snapshot", () => {
    const html = renderToString(
      <PokerSettingsPanel
        usePokerSettings={(select) =>
          select({
            status: "ready",
            writable: true,
            value: { ...DEFAULT_POKER_SETTINGS },
          })
        }
        setField={() => {}}
        loadProviders={async () => []}
        loadProviderModels={async () => []}
        t={(key) => key}
      />,
    );
    expect(html).toContain("aiEnabled");
    expect(html).toContain("isolateScope");
    expect(html).toContain("thinkTimeoutMs");
    expect(html).toContain("type=\"checkbox\"");
    expect(html).toContain("type=\"range\"");
    // Provider + model pickers. Directory data loads in an effect (not run in
    // SSR), so the selects render with only the current-value option.
    const selects = html.match(/<select/g) ?? [];
    expect(selects.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("DeepSeek-V4-Flash-0731");
  });

  test("renders nothing when the host settings are unavailable", () => {
    const html = renderToString(
      <PokerSettingsPanel
        usePokerSettings={(select) => select({ status: "unavailable" })}
        setField={() => {}}
        loadProviders={async () => []}
        loadProviderModels={async () => []}
        t={(key) => key}
      />,
    );
    expect(html).toBe("");
  });
});
