/**
 * Card face / back rendering with deal-in animations — React port of
 * token-poker's `src/ui/cards.tsx`. Class names are unchanged so the original
 * `poker.css` applies as-is.
 */
import React from "react";
import type { Card } from "../engine/cards";
import { RANK_CHARS, SUIT_CHARS } from "../engine/cards";

function cardStyle(index?: number): React.CSSProperties {
  return { "--tp-card-index": index ?? 0 } as React.CSSProperties;
}

/** Base classes only; deal/flip animations are applied via one-shot classes. */
export function CardFace(props: {
  card: Card;
  small?: boolean;
  index?: number;
  deal?: boolean;
  flip?: boolean;
  /** Highlight (e.g. a hole card used in the showdown's best five). */
  marked?: boolean;
}) {
  const { card, small, index, deal, flip, marked } = props;
  const red = card.suit === "h" || card.suit === "d";
  const cls = [
    "tp-card",
    small ? "tp-card--small" : "",
    red ? "tp-card--red" : "tp-card--black",
    deal ? "tp-card--deal" : "",
    flip ? "tp-card--flip" : "",
    marked ? "tp-card--marked" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span
      className={cls}
      style={cardStyle(index)}
      aria-label={`${RANK_CHARS[card.rank]}${SUIT_CHARS[card.suit]}`}
    >
      <span className="tp-card__rank">{RANK_CHARS[card.rank]}</span>
      <span className="tp-card__suit">{SUIT_CHARS[card.suit]}</span>
    </span>
  );
}

export function CardBack(props: {
  small?: boolean;
  index?: number;
  deal?: boolean;
}) {
  const { small, index, deal } = props;
  const cls = [
    "tp-card",
    "tp-card--back",
    small ? "tp-card--small" : "",
    deal ? "tp-card--deal" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} style={cardStyle(index)} aria-label="牌背" />
  );
}

/** Overlapping fan of two hole cards (opponents get face-down backs). */
export function HoleCards(props: {
  cards: Card[] | null;
  hidden: boolean;
  deal?: boolean;
}) {
  const { cards, hidden, deal } = props;
  const list = cards ?? [];
  return (
    <span className="tp-hole" aria-label="手牌">
      {hidden ? (
        <>
          <CardBack small deal={deal} index={0} />
          <CardBack small deal={deal} index={1} />
        </>
      ) : (
        list.map((card, i) => (
          <CardFace key={`${card.rank}${card.suit}`} card={card} small deal={deal} index={i} />
        ))
      )}
    </span>
  );
}

export function CommunityCards(props: { cards: Card[]; street: string }) {
  const { cards, street } = props;
  const slots = [0, 1, 2, 3, 4];
  return (
    <div className="tp-community" aria-label={`公共牌 ${street}`}>
      <div className="tp-community__row">
        {/* Explicit slot rendering: cards[i] exists → face, else a face-down
            placeholder, so newly dealt streets actually render. */}
        {slots.map((i) =>
          i < cards.length ? (
            <CardFace key={i} card={cards[i]} small index={i} flip />
          ) : (
            <span key={i} className="tp-community__placeholder" aria-label="未发牌">
              <CardBack small index={i} />
            </span>
          ),
        )}
      </div>
      <span className="tp-community__street">{street}</span>
    </div>
  );
}

/**
 * Ranked showdown row cards: the player's best five (hole cards used in the
 * combination are marked) rendered in the engine-provided best-first order.
 */
export function BestHandCards(props: { cards: Card[]; hole: Card[] }) {
  const { cards, hole } = props;
  const holeKeys = new Set(hole.map((c) => `${c.rank}${c.suit}`));
  return (
    <span className="tp-besthand" aria-label="最佳五张">
      {cards.map((card, i) => (
        <CardFace
          key={`${card.rank}${card.suit}`}
          card={card}
          small
          index={i}
          marked={holeKeys.has(`${card.rank}${card.suit}`)}
        />
      ))}
    </span>
  );
}
