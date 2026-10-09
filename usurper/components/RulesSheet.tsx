"use client";

import { useEffect } from "react";
import { ROLES } from "@/lib/engine";
import { RoleCard, ROLE_BLURB } from "./RoleCard";

export function RulesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <aside className="sheet" role="dialog" aria-modal="true" aria-label="How to play" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h2>How to play</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <p>
          Everyone starts with <strong>2 hidden cards</strong> (your influence) and <strong>2 coins</strong>. Lose both
          cards and you&apos;re out. The last player with a hidden card wins.
        </p>

        <h3>On your turn, take one action</h3>
        <table className="rules-table">
          <tbody>
            <tr><td>Income</td><td>Take 1 coin. Can&apos;t be stopped.</td></tr>
            <tr><td>Foreign Aid</td><td>Take 2 coins. Anyone claiming Duke can block.</td></tr>
            <tr><td>Coup</td><td>Pay 7: a player loses a card. Can&apos;t be stopped. Mandatory at 10+ coins.</td></tr>
            <tr><td>Tax <small>Duke</small></td><td>Take 3 coins.</td></tr>
            <tr><td>Assassinate <small>Assassin</small></td><td>Pay 3: a player loses a card. Contessa blocks.</td></tr>
            <tr><td>Steal <small>Captain</small></td><td>Take up to 2 coins from a player. Captain or Ambassador blocks.</td></tr>
            <tr><td>Exchange <small>Ambassador</small></td><td>Draw 2, keep any 2 of your cards, return the rest.</td></tr>
          </tbody>
        </table>

        <h3>You can claim any role — even ones you don&apos;t hold</h3>
        <p>
          When someone claims a role (to act or to block), any other player may <strong>challenge</strong>. If the
          claimer can&apos;t show that card, they lose a card and the action fails (any coins paid are returned). If
          they can, the challenger loses a card, and the claimer shuffles the shown card back and draws a new one.
        </p>
        <p>
          If nobody responds before the timer runs out, the claim is accepted. Blocks can be challenged too — a failed
          Contessa bluff against an Assassin costs you both cards.
        </p>

        <h3>The roles</h3>
        <div className="rules-roles">
          {ROLES.map((r) => (
            <div key={r} className="rules-role">
              <RoleCard role={r} size="sm" />
              <span>{ROLE_BLURB[r]}</span>
            </div>
          ))}
        </div>
        <p className="muted small">The deck has 3 of each role. In a 2-player game, the first player starts with 1 coin.</p>
      </aside>
    </div>
  );
}
