/**
 * Poker table page: seats, community cards, pot, dealer button, result
 * overlay — React port of token-poker's `src/ui/table-top.tsx`.
 */
import React, { useEffect, useMemo, useState } from "react";
import type { GameSnapshot, PlayerActionType } from "../engine/game";
import { formatChips } from "./format";
import { BestHandCards, CardFace, CommunityCards, HoleCards } from "./cards";

export interface TableTopProps {
  snapshot: GameSnapshot;
}

/** Deterministic avatar tone per seat; hero is monochrome slate. */
const AVATAR_TONES = [
  "slate", // 0: hero — monochrome
  "cyan", // 1
  "purple", // 2
  "orange", // 3
  "pink", // 4
  "lime", // 5
] as const;

/**
 * Seat anchor points for the stadium table (rounded ends left/right, straight
 * edges top/bottom): three seats on each straight edge. Percentages of the
 * table container; seats glide between anchors via CSS left/top transitions.
 */
const SEAT_POSITIONS: { x: number; y: number }[] = [
  { x: 50, y: 94 }, // 0: bottom center (user)
  { x: 28, y: 94 }, // 1: bottom left
  { x: 28, y: 6 }, // 2: top left
  { x: 50, y: 6 }, // 3: top center
  { x: 72, y: 6 }, // 4: top right
  { x: 72, y: 94 }, // 5: bottom right
];

const STREET_LABELS: Record<string, string> = {
  waiting: "等待",
  preflop: "翻牌前",
  flop: "翻牌",
  turn: "转牌",
  river: "河牌",
  showdown: "摊牌",
  handEnded: "本局结束",
};

/** Per-seat action bubble anchored at the acting seat. */
interface SeatBubble {
  key: string;
  seat: number;
  text: string;
  action: PlayerActionType;
}

export function TableTop({ snapshot }: TableTopProps) {
  const players = snapshot.players;
  const [bubble, setBubble] = useState<SeatBubble | null>(null);

  const seatStyle = (seat: number): React.CSSProperties => {
    const pos = SEAT_POSITIONS[seat % SEAT_POSITIONS.length];
    return {
      "--tp-seat-x": `${pos.x}%`,
      "--tp-seat-y": `${pos.y}%`,
    } as React.CSSProperties;
  };

  // Show a per-seat bubble for every distinct action. Keyed on the engine's
  // monotonic seq (not text) so identical consecutive actions re-trigger. The
  // hide timer is tracked manually so a newer action replaces the old one.
  const bubbleKey = useMemo(() => {
    const la = snapshot.lastAction;
    if (!la || la.seq === undefined) return null;
    return `${snapshot.handId}:${la.seat}:${la.seq}`;
  }, [snapshot.handId, snapshot.lastAction]);

  useEffect(() => {
    if (!bubbleKey) return;
    const la = snapshot.lastAction;
    if (!la || la.seq === undefined) return;
    const myKey = bubbleKey;
    setBubble({ key: myKey, seat: la.seat, text: la.text, action: la.action });
    const timer = setTimeout(() => {
      setBubble((cur) => (cur && cur.key === myKey ? null : cur));
    }, 1700);
    return () => clearTimeout(timer);
  }, [bubbleKey, snapshot]);

  const heroName = players.find((p) => p.seat === 0)?.name;

  // Hole cards animate in only during the preflop street of each hand.
  const dealing = snapshot.status === "preflop";
  const street = STREET_LABELS[snapshot.status] ?? snapshot.status;

  return (
    <div className="tp-table-wrap">
      <div className="tp-table" role="group" aria-label="牌桌">
        {/* felt center */}
        <div className="tp-table__center">
          <div className="tp-pot" aria-live="polite">
            <span className="tp-pot__label">Pot</span>
            <span className="tp-pot__value">{formatChips(snapshot.pot)}</span>
          </div>
          <CommunityCards cards={snapshot.communityCards} street={street} />
        </div>

        {/* seats: keyed by identity so poll refreshes never rebuild nodes */}
        {players.map((p) => {
          const isTurn =
            snapshot.currentTurn === p.seat && snapshot.status !== "handEnded";
          const isDealer = snapshot.dealerSeat === p.seat;
          const isWinner =
            snapshot.status === "handEnded" &&
            (snapshot.lastResult?.winnerSeats.includes(p.seat) ?? false);
          const isLoser =
            snapshot.status === "handEnded" &&
            !p.folded &&
            !isWinner &&
            (snapshot.lastResult?.showdown?.some((s) => s.seat === p.seat) ??
              false);
          // Busted only after the hand settles; during play an all-in player
          // keeps the ALL-IN tag instead of a dead overlay.
          const settled =
            snapshot.status === "handEnded" || snapshot.status === "waiting";
          const isBusted = settled && p.stack <= 0;
          const myBubble = bubble && bubble.seat === p.seat ? bubble : null;

          const cls = [
            "tp-seat",
            p.folded ? "tp-seat--folded" : "",
            isTurn ? "tp-seat--turn" : "",
            p.allIn ? "tp-seat--allin" : "",
            isWinner ? "tp-seat--winner" : "",
            isBusted ? "tp-seat--busted" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div key={p.seat} className={cls} style={seatStyle(p.seat)}>
              {/* action bubble anchored at this seat */}
              {myBubble && (
                <div
                  className={`tp-bubble tp-bubble--${myBubble.action}`}
                  role="status"
                >
                  {myBubble.text}
                </div>
              )}
              {/* Hole cards peek out from behind the pill; the pill paints
                  over their lower half (body comes later in DOM). */}
              {!p.folded && (
                <HoleCards cards={p.holeCards} hidden={p.isBot} deal={dealing} />
              )}
              {/* The flat pill: avatar + name + stack in a row. */}
              <div className="tp-seat__body">
                {isDealer && (
                  <span className="tp-seat__dealer" title="庄家">
                    D
                  </span>
                )}
                <div
                  className="tp-seat__avatar"
                  data-tone={AVATAR_TONES[p.seat % AVATAR_TONES.length]}
                >
                  {p.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="tp-seat__meta">
                  <span className="tp-seat__name">{p.name}</span>
                  <span className="tp-seat__stack">{formatChips(p.stack)}</span>
                </div>
                {isTurn && p.isBot && (
                  <div
                    className="tp-seat__thinking"
                    role="status"
                    aria-label="思考中"
                  >
                    <span className="tp-seat__thinking-dot" />
                    <span className="tp-seat__thinking-dot" />
                    <span className="tp-seat__thinking-dot" />
                  </div>
                )}
                {isTurn && p.seat === 0 && (
                  <span className="tp-seat__yourturn">轮到你</span>
                )}
                {p.allIn && !isBusted && (
                  <span className="tp-seat__allin">ALL-IN</span>
                )}
                {p.folded && !isBusted && (
                  <span className="tp-seat__folded-tag">已弃牌</span>
                )}
                {isWinner && <span className="tp-seat__win">WIN</span>}
                {isLoser && <span className="tp-seat__lose-tag">落败</span>}
              </div>
              {isBusted && <span className="tp-seat__busted-tag">已出局</span>}
            </div>
          );
        })}
      </div>

      {snapshot.status === "handEnded" && snapshot.lastResult && (
        <ResultOverlay snapshot={snapshot} heroName={heroName} />
      )}
    </div>
  );
}

function ResultOverlay(props: { snapshot: GameSnapshot; heroName?: string }) {
  const { snapshot } = props;
  const result = snapshot.lastResult!;
  const winners = result.winnerSeats
    .map(
      (seat) =>
        snapshot.players.find((p) => p.seat === seat)?.name ?? `座位 ${seat}`,
    )
    .join("、");
  const userWon = result.winnerSeats.includes(0);
  const hero = snapshot.players.find((p) => p.seat === 0);
  const userPlayed = hero ? !hero.folded : false;
  const heroAmount =
    result.winnerSeats.indexOf(0) >= 0
      ? (result.winningAmounts[result.winnerSeats.indexOf(0)] ?? 0)
      : 0;

  // Ranked rows: the engine's showdown list is already sorted strongest
  // first. Each row shows the player's best five (hole cards highlighted).
  const rows = useMemo(() => {
    const showdown = result.showdown ?? [];
    return showdown.map((s, rank) => {
      const player = snapshot.players.find((p) => p.seat === s.seat);
      const isWinner = result.winnerSeats.includes(s.seat);
      const winIdx = result.winnerSeats.indexOf(s.seat);
      const won = isWinner ? (result.winningAmounts[winIdx] ?? 0) : 0;
      return {
        rank,
        seat: s.seat,
        name: player?.name ?? `座位 ${s.seat}`,
        handName: s.handName,
        bestHand: s.bestHand,
        hole: s.cards,
        isWinner,
        won,
        isHero: s.seat === 0,
      };
    });
  }, [snapshot, result]);

  // Folded players (no showdown entry) render as one collapsed line.
  const foldedNames = snapshot.players
    .filter((p) => p.folded && p.seat !== 0)
    .map((p) => p.name)
    .join("、");

  // Animated count-up for the hero's winnings (900ms ease-out cubic).
  const [displayAmount, setDisplayAmount] = useState(0);
  useEffect(() => {
    if (!userWon) {
      setDisplayAmount(0);
      return;
    }
    const target = heroAmount;
    const start = performance.now();
    const duration = 900;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayAmount(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [userWon, heroAmount]);

  const title = (() => {
    if (userWon) return "你赢了！";
    if (userPlayed) return "你输了";
    return `${winners} 获胜`;
  })();

  return (
    <div
      className={`tp-result ${userWon ? "tp-result--win" : "tp-result--lose"}`}
      role="status"
      aria-live="polite"
    >
      <div className="tp-result__spotlight" aria-hidden="true" />
      <div className="tp-result__title">{title}</div>
      {userWon && <div className="tp-result__amount">+{formatChips(displayAmount)}</div>}
      {!userWon && !userPlayed && (
        <div className="tp-result__subtitle">
          {winners} 赢得 {formatChips(snapshot.pot)}
        </div>
      )}
      {snapshot.communityCards.length > 0 && (
        <div className="tp-result__board" aria-label="公共牌">
          {snapshot.communityCards.map((c, i) => (
            <CardFace key={`${c.rank}${c.suit}`} card={c} small index={i} />
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <div className="tp-result__ranked" aria-label="摊牌牌型排行">
          {rows.map((row) => (
            <div
              key={row.seat}
              className={`tp-result__row ${
                row.isWinner ? "tp-result__row--winner" : ""
              } ${row.isHero ? "tp-result__row--hero" : ""}`}
            >
              <span className="tp-result__rank">{row.rank + 1}</span>
              <span className="tp-result__row-name">{row.name}</span>
              <BestHandCards cards={row.bestHand} hole={row.hole} />
              <span className="tp-result__row-hand">{row.handName}</span>
              {row.isWinner && (
                <span className="tp-result__row-win">+{formatChips(row.won)}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {foldedNames.length > 0 && (
        <div className="tp-result__folded">已弃牌：{foldedNames}</div>
      )}
    </div>
  );
}
