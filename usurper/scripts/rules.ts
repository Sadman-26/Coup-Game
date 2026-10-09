// Deterministic checks of specific rulings, using rigged hands.
import { createGame, joinGame, applyMove, GameState, Role, influence, tick } from "../lib/engine";

let failures = 0;
function expect(cond: boolean, msg: string) {
  if (!cond) { failures++; console.log("FAIL:", msg); } else console.log("ok  ", msg);
}

function setup(hands: Role[][], coins: number[] = []): { s: GameState; ids: string[] } {
  const { state: s, playerId } = createGame("T", "A");
  for (let i = 1; i < hands.length; i++) joinGame(s, String.fromCharCode(65 + i));
  applyMove(s, playerId, { type: "start" });
  s.turn = 0;
  s.players.forEach((p, i) => {
    // put the dealt cards back, then deal the rigged hand from the deck
    s.deck.push(...p.cards.map((c) => c.role));
    p.cards = hands[i].map((r) => {
      s.deck.splice(s.deck.indexOf(r), 1);
      return { role: r, revealed: false };
    });
    p.coins = coins[i] ?? 2;
  });
  return { s, ids: s.players.map((p) => p.id) };
}

// 1. Assassin bluff caught: coins refunded, actor loses influence.
{
  const { s, ids: [a, b] } = setup([["duke", "captain"], ["duke", "captain"]], [3, 2]);
  applyMove(s, a, { type: "action", action: "assassinate", target: b });
  applyMove(s, b, { type: "respond", response: "challenge" });
  expect(s.players[0].coins === 3, "failed Assassin claim refunds the 3 coins");
  expect(s.phase === "lose" && s.lossQueue[0].playerId === a, "bluffing assassin must lose a card");
}

// 2. Contessa block that stands: coins stay spent.
{
  const { s, ids: [a, b] } = setup([["assassin", "duke"], ["contessa", "duke"]], [3, 2]);
  applyMove(s, a, { type: "action", action: "assassinate", target: b });
  applyMove(s, b, { type: "respond", response: "block", role: "contessa" });
  applyMove(s, a, { type: "respond", response: "pass" });
  expect(s.players[0].coins === 0, "blocked assassination keeps coins spent");
  expect(influence(s.players[1]) === 2, "blocked target keeps both cards");
  expect(s.phase === "action" && s.turn === 1, "turn passes to next player");
}

// 3. Bluffed Contessa challenged: target loses both cards (challenge + assassination).
{
  const { s, ids: [a, b, c] } = setup([["assassin", "duke"], ["captain", "duke"], ["duke", "captain"]], [3, 2, 2]);
  applyMove(s, a, { type: "action", action: "assassinate", target: b });
  applyMove(s, b, { type: "respond", response: "block", role: "contessa" });
  applyMove(s, a, { type: "respond", response: "challenge" });
  expect(s.phase === "lose" && s.lossQueue.length === 1, "bluffing blocker must choose a card to lose first");
  applyMove(s, b, { type: "lose", cardIndex: 0 });
  expect(influence(s.players[1]) === 0, "then the assassination takes the last card");
  expect(s.phase === "action" && s.turn === 2, "dead player is skipped");
  void c;
}

// 4. Wrong challenge on an Assassin: challenger (target) loses one, may still block.
{
  const { s, ids: [a, b] } = setup([["assassin", "duke"], ["contessa", "duke"], ["captain", "captain"]], [3, 2, 2]);
  applyMove(s, a, { type: "action", action: "assassinate", target: b });
  applyMove(s, b, { type: "respond", response: "challenge" });
  expect(s.players[0].cards.every((c) => !c.revealed), "proven actor keeps both cards (swapped one)");
  applyMove(s, b, { type: "lose", cardIndex: 1 });
  expect(s.phase === "respond", "block window re-opens after the failed challenge");
  applyMove(s, b, { type: "respond", response: "block", role: "contessa" });
  expect(s.phase === "block_respond", "target can still block with Contessa");
}

// 5. Steal blocked by Ambassador; steal from a 1-coin player takes 1.
{
  const { s, ids: [a, b] } = setup([["captain", "duke"], ["captain", "duke"]], [2, 1]);
  applyMove(s, a, { type: "action", action: "steal", target: b });
  applyMove(s, b, { type: "respond", response: "pass" });
  expect(s.players[0].coins === 3 && s.players[1].coins === 0, "steal takes only what the target has");
}

// 6. 10 coins forces a Coup.
{
  const { s, ids: [a, b] } = setup([["duke", "duke"], ["captain", "captain"]], [10, 2]);
  let threw = false;
  try { applyMove(s, a, { type: "action", action: "income" }); } catch { threw = true; }
  expect(threw, "income refused at 10 coins");
  applyMove(s, a, { type: "action", action: "coup", target: b });
  expect(s.players[0].coins === 3 && s.phase === "lose", "coup costs 7 and target must choose a card");
}

// 7. Foreign aid: anyone can block with Duke; timer auto-passes.
{
  const { s, ids: [a, , c] } = setup([["duke", "captain"], ["captain", "captain"], ["contessa", "contessa"]]);
  applyMove(s, a, { type: "action", action: "foreign_aid" });
  applyMove(s, c, { type: "respond", response: "block", role: "duke" });
  expect(s.phase === "block_respond", "non-target can block Foreign Aid");
  tick(s, s.deadline! + 1);
  expect(s.players[0].coins === 2 && s.phase === "action", "unchallenged block stands after the timer");
}

// 8. Exchange keeps hand size and returns 2 cards.
{
  const { s, ids: [a, b] } = setup([["ambassador", "duke"], ["captain", "captain"]]);
  applyMove(s, a, { type: "action", action: "exchange" });
  applyMove(s, b, { type: "respond", response: "pass" });
  expect(s.phase === "exchange" && s.pending!.pool!.length === 4, "exchange shows 4 cards");
  const deckBefore = s.deck.length;
  applyMove(s, a, { type: "exchange", keep: [2, 3] });
  expect(s.players[0].cards.length === 2 && s.deck.length === deckBefore + 2, "kept 2, returned 2");
}

console.log(failures ? `\n${failures} FAILED` : "\nAll rule checks passed");
process.exit(failures ? 1 : 0);
