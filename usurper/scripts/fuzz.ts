// Randomised self-play: thousands of games of legal moves, checking invariants after every move.
import {
  ACTIONS, ROLES, ActionType, GameState, Move, MoveError, applyMove, createGame, joinGame,
  viewFor, tick, isAlive, Role,
} from "../lib/engine";

function pick<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}

function checkCards(s: GameState, ctx: string) {
  const counts: Record<string, number> = {};
  const add = (r: Role) => (counts[r] = (counts[r] ?? 0) + 1);
  s.deck.forEach(add);
  s.players.forEach((p) => p.cards.forEach((c) => add(c.role)));
  if (s.pending?.pool) s.pending.pool.slice(-2).forEach(add);
  for (const r of ROLES) {
    if (counts[r] !== 3) { if (ctx === "leave") console.log((globalThis as any).snap, "\nAFTER", JSON.stringify({phase:s.phase,pending:s.pending,deck:s.deck.length})); throw new Error(`Card count broken (${r}=${counts[r]}) ${ctx}`); }
  }
  for (const p of s.players) if (p.coins < 0) throw new Error(`Negative coins ${ctx}`);
}

function legalMoves(s: GameState): { pid: string; move: Move }[] {
  const out: { pid: string; move: Move }[] = [];
  for (const p of s.players) {
    const v = viewFor(s, p.id);
    const o = v.options;
    if (o.canAct) {
      const targets = s.players.filter((x) => x.id !== p.id && isAlive(x)).map((x) => x.id);
      for (const a of Object.keys(ACTIONS) as ActionType[]) {
        const d = ACTIONS[a];
        if (o.mustCoup && a !== "coup") continue;
        if (p.coins < d.cost) continue;
        if (d.targeted) for (const t of targets) out.push({ pid: p.id, move: { type: "action", action: a, target: t } });
        else out.push({ pid: p.id, move: { type: "action", action: a } });
      }
    }
    if (o.canPass) {
      out.push({ pid: p.id, move: { type: "respond", response: "pass" } });
      out.push({ pid: p.id, move: { type: "respond", response: "pass" } });
    }
    if (o.canChallenge) out.push({ pid: p.id, move: { type: "respond", response: "challenge" } });
    for (const r of o.blockRoles) out.push({ pid: p.id, move: { type: "respond", response: "block", role: r } });
    if (o.mustLose) p.cards.forEach((c, i) => !c.revealed && out.push({ pid: p.id, move: { type: "lose", cardIndex: i } }));
    if (o.exchangePool) {
      const idx = o.exchangePool.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, o.keepCount);
      out.push({ pid: p.id, move: { type: "exchange", keep: idx } });
    }
  }
  return out;
}

let games = 0, totalMoves = 0, forfeits = 0;
const wins: Record<number, number> = {};
for (let g = 0; g < 4000; g++) {
  const n = 2 + (g % 5);
  const { state: s, playerId: host } = createGame("TEST", "P0");
  for (let i = 1; i < n; i++) joinGame(s, "P" + i);
  applyMove(s, host, { type: "start" });
  checkCards(s, "start");
  let steps = 0;
  while (s.phase !== "over") {
    if (++steps > 3000) throw new Error("Game did not terminate");
    // Occasionally simulate a timeout or a player leaving.
    if (Math.random() < 0.03 && s.deadline) {
      tick(s, s.deadline + 1);
      checkCards(s, "tick");
      continue;
    }
    if (Math.random() < 0.004) {
      const alive = s.players.filter((p) => isAlive(p));
      const leaver = pick(alive); const snap = JSON.stringify({phase: s.phase, pending: s.pending, q: s.lossQueue, deck: s.deck.length, leaver: leaver.id, players: s.players.map(p=>({id:p.id,cards:p.cards}))});
      (globalThis as any).snap = snap;
      applyMove(s, leaver.id, { type: "leave" });
      forfeits++;
      checkCards(s, "leave");
      continue;
    }
    const moves = legalMoves(s);
    if (!moves.length) throw new Error(`Stuck in phase ${s.phase} ${JSON.stringify(s.pending)} queue=${JSON.stringify(s.lossQueue)}`);
    const m = pick(moves);
    try {
      applyMove(s, m.pid, m.move);
    } catch (e) {
      if (e instanceof MoveError) throw new Error(`Legal move rejected: ${e.message} ${JSON.stringify(m)} phase=${s.phase}`);
      throw e;
    }
    totalMoves++;
    checkCards(s, `after ${JSON.stringify(m.move)}`);
    // Hidden info must never leak.
    for (const p of s.players) {
      const v = viewFor(s, p.id);
      if (s.phase !== "over") for (const op of v.players) if (op.id !== p.id) for (const c of op.cards) if (!c.revealed && c.role) throw new Error("Leak");
      if (JSON.stringify(v).includes(s.players.find((x) => x.id !== p.id)!.token)) throw new Error("Token leak");
    }
  }
  if (!s.winnerId && s.players.some(isAlive)) throw new Error("Over without winner");
  wins[n] = (wins[n] ?? 0) + 1;
  // Rematch path
  applyMove(s, s.hostId, { type: "rematch" });
  if (s.phase !== "lobby") throw new Error("Rematch failed");
  games++;
}
console.log(`OK: ${games} games, ${totalMoves} moves, ${forfeits} forfeits, by size`, wins);
