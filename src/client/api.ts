/**
 * Browser-side client for the host's `/token-poker` RPC channel.
 *
 * Pure logic: takes any object matching the minimal `ClientConnectionRpc`
 * shape (structurally `ctx.connection.rpc` from DSH's client-connection) and
 * returns a typed `PokerApi`. UI code consumes `PokerApi` directly.
 *
 * Types are declared structurally so this package stays portable — the DSH
 * packages are not consistently published to the public registry.
 */
import type { GameSnapshot, PlayerAction } from "../engine/game";
import type { StoredState } from "../runtime/persistence";

/** Minimal structural view of DSH's client Connection RPC caller. */
export interface ClientConnectionRpc {
  call(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<
    | { ok: true; value: unknown }
    | { ok: false; error: { code: string; message: string } }
  >;
}

/** Typed view of the host tokenPoker service, as seen from the browser. */
export interface PokerApi {
  get(scope?: string): Promise<GameSnapshot>;
  join(scope?: string, name?: string): Promise<GameSnapshot>;
  action(scope: string | undefined, input: PlayerAction): Promise<GameSnapshot>;
  newHand(scope?: string): Promise<GameSnapshot>;
  leave(scope?: string): Promise<void>;
  stats(scope?: string): Promise<StoredState["stats"]>;
  rebuy(scope?: string): Promise<void>;
}

/** Logical channel registered by the host half. */
export const TOKEN_POKER_CHANNEL = "/token-poker";

export function createPokerApi(rpc: ClientConnectionRpc): PokerApi {
  const call = async (endpoint: string, payload: unknown): Promise<unknown> => {
    const result = await rpc.call(TOKEN_POKER_CHANNEL, endpoint, payload);
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  };

  return {
    get: (scope) => call("game/get", { scope }) as Promise<GameSnapshot>,
    join: (scope, name) =>
      call("game/join", { scope, name }) as Promise<GameSnapshot>,
    action: (scope, input) =>
      call("game/action", {
        scope,
        action: input.action,
        ...(input.amount === undefined ? {} : { amount: input.amount }),
      }) as Promise<GameSnapshot>,
    newHand: (scope) =>
      call("game/newHand", { scope }) as Promise<GameSnapshot>,
    leave: async (scope) => {
      await call("game/leave", { scope });
    },
    stats: (scope) =>
      call("game/stats", { scope }) as Promise<StoredState["stats"]>,
    rebuy: async (scope) => {
      await call("game/rebuy", { scope });
    },
  };
}
