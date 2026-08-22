/**
 * Action bar: bet slider + Fold / Call / Bet buttons — React port of
 * token-poker's `src/ui/action-bar.tsx`.
 */
import React, { useEffect, useMemo, useState } from "react";
import type { GameSnapshot } from "../engine/game";
import { formatChips } from "./format";

export interface ActionBarProps {
  snapshot: GameSnapshot;
  busy: boolean;
  onAction: (
    action: "fold" | "call" | "bet" | "check",
    amount?: number,
  ) => void;
}

const PRESETS = [0.25, 0.33, 0.75, 1.33];

export function ActionBar({ snapshot, busy, onAction }: ActionBarProps) {
  const me = useMemo(
    () => snapshot.players.find((p) => p.seat === 0)!,
    [snapshot],
  );
  const myTurn =
    snapshot.status !== "waiting" &&
    snapshot.status !== "handEnded" &&
    snapshot.currentTurn === 0 &&
    !busy;
  const toCall = useMemo(() => {
    if (!me) return 0;
    return Math.min(snapshot.toCall - me.contributed, me.stack);
  }, [snapshot, me]);
  const minRaise = snapshot.minRaise;
  const maxBet = me?.stack ?? 0;

  const [betAmount, setBetAmount] = useState<number>(0);
  const potSized = Math.min(maxBet, snapshot.pot + toCall);
  const [selectedPreset, setSelectedPreset] = useState<number>(-1);

  // Reset the bet input when a new hand begins so last hand's raise never
  // carries into the next one.
  useEffect(() => {
    setBetAmount(0);
    setSelectedPreset(-1);
  }, [snapshot.handId]);

  const applyPreset = (preset: number, index: number) => {
    setSelectedPreset(index);
    setBetAmount(Math.min(maxBet, Math.floor(snapshot.pot * preset)));
  };

  const canBet = myTurn && maxBet > 0;
  const canCheck = myTurn && toCall <= 0;
  const canCall = myTurn && toCall > 0;

  const effectiveAmount = (() => {
    if (betAmount <= 0) return potSized;
    return Math.min(maxBet, Math.max(betAmount, toCall + minRaise));
  })();

  return (
    <div className="tp-actionbar" role="group" aria-label="行动区">
      {myTurn && (
        <div className="tp-actionbar__slider-row">
          <div className="tp-actionbar__presets">
            {PRESETS.map((p, i) => (
              <button
                key={p}
                type="button"
                className={`tp-btn tp-btn--preset ${
                  selectedPreset === i ? "tp-btn--preset-active" : ""
                }`}
                onClick={() => applyPreset(p, i)}
              >
                {Math.round(p * 100)}%
              </button>
            ))}
          </div>
          <div className="tp-actionbar__slider">
            <input
              type="range"
              min={0}
              max={maxBet}
              step={100}
              value={betAmount || potSized}
              aria-label="下注金额"
              onChange={(e) => {
                setSelectedPreset(-1);
                setBetAmount(Number((e.target as HTMLInputElement).value));
              }}
            />
            <span className="tp-actionbar__amount">
              {formatChips(effectiveAmount)}
            </span>
          </div>
        </div>
      )}

      <div className="tp-actionbar__buttons">
        {canCheck && (
          <button
            type="button"
            className="tp-btn tp-btn--secondary"
            onClick={() => onAction("check")}
          >
            过牌
          </button>
        )}
        {canCall && (
          <button
            type="button"
            className="tp-btn tp-btn--secondary"
            onClick={() => onAction("call")}
          >
            跟注 {formatChips(toCall)}
          </button>
        )}
        {!myTurn && (
          <span className="tp-actionbar__status" aria-live="polite">
            {snapshot.status === "handEnded" || snapshot.status === "waiting"
              ? "等待下一手"
              : busy
                ? "对手思考中…"
                : "等待对手行动"}
          </span>
        )}
        {canBet && (
          <>
            <button
              type="button"
              className="tp-btn tp-btn--primary"
              onClick={() => onAction("bet", effectiveAmount)}
            >
              下注 {formatChips(effectiveAmount)}
            </button>
            <button
              type="button"
              className="tp-btn tp-btn--ghost"
              onClick={() => onAction("fold")}
            >
              弃牌
            </button>
          </>
        )}
      </div>
    </div>
  );
}
