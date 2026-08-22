/**
 * Poker page: joins the table, polls the snapshot, renders table + action bar
 * — React port of token-poker's `src/ui/poker-page.tsx`. The Synergy event
 * subscription is replaced by a 5s poll (the original already kept a 5s poll
 * as a safety net; here it is the sole refresh driver).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { GameSnapshot } from "../engine/game";
import { formatChips } from "./format";
import { TableTop } from "./table-top";
import { ActionBar } from "./action-bar";
import type { PokerApi } from "./api";

export interface PokerPageProps {
  api: PokerApi;
  scope?: string;
}

export function PokerPage({ api, scope }: PokerPageProps) {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshInFlight = useRef(false);

  const applySnapshot = useCallback((snap: GameSnapshot) => {
    setSnapshot((prev) =>
      prev && prev.revision === snap.revision ? prev : snap,
    );
  }, []);

  /**
   * Fetch and apply the current snapshot. Revisions come from the server so
   * identical snapshots are dropped (stops the 1.5s flicker: every poll used
   * to replace the snapshot object and re-run entry animations). Also
   * suppresses the cascade of refresh() calls when one is already in flight —
   * the in-flight fetch runs after the state change and is already freshest.
   */
  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const snap = await api.get(scope);
      applySnapshot(snap);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      refreshInFlight.current = false;
    }
  }, [api, scope, applySnapshot]);

  // Join on mount; leave on unmount.
  useEffect(() => {
    let cancelled = false;
    void api
      .join(scope)
      .then((snap) => {
        if (cancelled) return;
        applySnapshot(snap);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .then(() => {
        if (!cancelled) return refresh();
      });
    return () => {
      cancelled = true;
      // Leaving avoids keeping the host AI loop (and LLM calls) running.
      void api.leave(scope).catch(() => {});
    };
  }, [api, scope, refresh, applySnapshot]);

  // Slow safety net (5s): covers the case where a command response was
  // dropped; keeps the table live while opponents act.
  useEffect(() => {
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const act = (
    action: "fold" | "call" | "bet" | "check",
    amount?: number,
  ) => {
    setBusy(true);
    // Fire-and-forget: do NOT await the command. The host drives the whole AI
    // loop inside the command response (tens of seconds), so awaiting it would
    // freeze the UI until the entire betting round is over. The polling refresh
    // loop keeps the table live while opponents act.
    void api
      .action(scope, { action, ...(amount === undefined ? {} : { amount }) })
      .then((snap) => {
        applySnapshot(snap);
        setBusy(false);
      })
      .catch(async (e) => {
        setError(e instanceof Error ? e.message : String(e));
        setBusy(false);
        await refresh();
      });
    // Kick the poll loop immediately so opponent actions stream in.
    void refresh();
  };

  const newHand = () => {
    setBusy(true);
    void api
      .newHand(scope)
      .then((snap) => {
        applySnapshot(snap);
        setBusy(false);
      })
      .catch(async (e) => {
        setError(e instanceof Error ? e.message : String(e));
        setBusy(false);
        await refresh();
      });
    void refresh();
  };

  const rebuy = () => {
    setBusy(true);
    void api
      .rebuy(scope)
      .then(() => {
        setBusy(false);
        newHand();
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setBusy(false);
      });
  };

  const heroBusted = () => {
    if (!snapshot) return false;
    const hero = snapshot.players.find((p) => p.seat === 0);
    return !!hero && hero.stack <= 0;
  };

  return (
    <section className="tp-page" aria-label="德州扑克牌桌">
      <header className="tp-header">
        <div className="tp-header__title">
          <span className="tp-header__name">No-Limit Inference</span>
          <span className="tp-header__blinds">500/1K · 6-max</span>
        </div>
        {snapshot && (
          <div className="tp-header__stats">
            <span>
              {snapshot.players[0]?.name ?? "你"} ·{" "}
              {formatChips(snapshot.players[0]?.stack ?? 0)}
            </span>
          </div>
        )}
      </header>

      {error && (
        <div className="tp-error" role="alert">
          {error}
        </div>
      )}

      {snapshot ? (
        <div className="tp-body">
          <TableTop snapshot={snapshot} />
          <ActionBar
            snapshot={snapshot}
            busy={busy}
            onAction={(action, amount) => void act(action, amount)}
          />
          {(snapshot.status === "handEnded" || snapshot.status === "waiting") && (
            <div className="tp-next">
              <button
                type="button"
                className="tp-btn tp-btn--primary"
                onClick={() => void newHand()}
                disabled={heroBusted() && snapshot.status === "waiting"}
              >
                下一手
              </button>
              {heroBusted() && (
                <button
                  type="button"
                  className="tp-btn tp-btn--ghost"
                  onClick={() => void rebuy()}
                >
                  重新买入
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="tp-loading">加入牌桌…</div>
      )}
    </section>
  );
}
