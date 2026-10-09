// Server-authoritative rules engine. Pure functions over a JSON-serialisable state.
// Clients never see this state directly — see viewFor() for what each player is shown.

export type Role = "duke" | "assassin" | "captain" | "ambassador" | "contessa";
export const ROLES: Role[] = ["duke", "assassin", "captain", "ambassador", "contessa"];

export type ActionType =
  | "income"
  | "foreign_aid"
  | "coup"
  | "tax"
  | "assassinate"
  | "steal"
  | "exchange";

export interface ActionDef {
  label: string;
  claim?: Role;
  cost: number;
  targeted: boolean;
  blockedBy: Role[];
  /** If true, anyone may block (foreign aid); otherwise only the target. */
  anyoneBlocks?: boolean;
}

export const ACTIONS: Record<ActionType, ActionDef> = {
  income: { label: "Income", cost: 0, targeted: false, blockedBy: [] },
  foreign_aid: { label: "Foreign Aid", cost: 0, targeted: false, blockedBy: ["duke"], anyoneBlocks: true },
  coup: { label: "Coup", cost: 7, targeted: true, blockedBy: [] },
  tax: { label: "Tax", claim: "duke", cost: 0, targeted: false, blockedBy: [] },
  assassinate: { label: "Assassinate", claim: "assassin", cost: 3, targeted: true, blockedBy: ["contessa"] },
  steal: { label: "Steal", claim: "captain", cost: 0, targeted: true, blockedBy: ["captain", "ambassador"] },
  exchange: { label: "Exchange", claim: "ambassador", cost: 0, targeted: false, blockedBy: [] },
};

export const ROLE_NAMES: Record<Role, string> = {
  duke: "Duke",
  assassin: "Assassin",
  captain: "Captain",
  ambassador: "Ambassador",
  contessa: "Contessa",
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
const LOG_LIMIT = 120;

export interface Card {
  role: Role;
  revealed: boolean;
}

export interface Player {
  id: string;
  token: string;
  name: string;
  coins: number;
  cards: Card[];
  forfeited?: boolean;
}

export type Stage = "respond" | "block_respond" | "resolve" | "exchange" | "done";

export interface Pending {
  actor: string;
  action: ActionType;
  target: string | null;
  stage: Stage;
  challengeOpen: boolean;
  blockOpen: boolean;
  block: { by: string; role: Role } | null;
  passes: string[];
  /** Exchange pool: the actor's hidden cards plus the two drawn. */
  pool: Role[] | null;
}

export type Phase = "lobby" | "action" | "respond" | "block_respond" | "lose" | "exchange" | "over";

export interface LogEntry {
  n: number;
  text: string;
  kind?: "info" | "action" | "challenge" | "loss" | "win";
}

export interface GameState {
  code: string;
  hostId: string;
  phase: Phase;
  players: Player[];
  deck: Role[];
  turn: number;
  pending: Pending | null;
  lossQueue: { playerId: string; reason: string }[];
  winnerId: string | null;
  log: LogEntry[];
  logSeq: number;
  settings: { responseSeconds: number };
  deadline: number | null;
  round: number;
}

export class MoveError extends Error {}

export type Move =
  | { type: "start" }
  | { type: "settings"; responseSeconds: number }
  | { type: "action"; action: ActionType; target?: string | null }
  | { type: "respond"; response: "pass" | "challenge" | "block"; role?: Role }
  | { type: "lose"; cardIndex: number }
  | { type: "exchange"; keep: number[] }
  | { type: "leave" }
  | { type: "kick"; playerId: string }
  | { type: "rematch" };

// ---------- helpers ----------

function rand(n: number): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] % n;
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function randomId(len = 16): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[rand(chars.length)];
  return s;
}

export function isAlive(p: Player): boolean {
  return p.cards.some((c) => !c.revealed);
}

export function influence(p: Player): number {
  return p.cards.filter((c) => !c.revealed).length;
}

function hasRole(p: Player, role: Role): boolean {
  return p.cards.some((c) => !c.revealed && c.role === role);
}

function player(s: GameState, id: string): Player {
  const p = s.players.find((x) => x.id === id);
  if (!p) throw new MoveError("Player not found");
  return p;
}

function name(s: GameState, id: string): string {
  return s.players.find((x) => x.id === id)?.name ?? "?";
}

function log(s: GameState, text: string, kind: LogEntry["kind"] = "info") {
  s.logSeq += 1;
  s.log.push({ n: s.logSeq, text, kind });
  if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT);
}

function draw(s: GameState): Role {
  const r = s.deck.pop();
  if (!r) throw new Error("Deck empty");
  return r;
}

/** Return the shown card to the court, shuffle, and draw a replacement. */
function swapRevealedClaim(s: GameState, p: Player, role: Role) {
  const idx = p.cards.findIndex((c) => !c.revealed && c.role === role);
  s.deck.push(role);
  shuffle(s.deck);
  p.cards[idx] = { role: draw(s), revealed: false };
}

// ---------- creation / lobby ----------

export function createGame(code: string, hostName: string): { state: GameState; token: string; playerId: string } {
  const host = newPlayer(hostName);
  const state: GameState = {
    code,
    hostId: host.id,
    phase: "lobby",
    players: [host],
    deck: [],
    turn: 0,
    pending: null,
    lossQueue: [],
    winnerId: null,
    log: [],
    logSeq: 0,
    settings: { responseSeconds: 20 },
    deadline: null,
    round: 0,
  };
  log(state, `${host.name} opened the court.`);
  return { state, token: host.token, playerId: host.id };
}

function newPlayer(rawName: string): Player {
  return { id: randomId(8), token: randomId(24), name: cleanName(rawName), coins: 0, cards: [] };
}

export function cleanName(raw: string): string {
  const n = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 20);
  if (!n) throw new MoveError("Please enter a name");
  return n;
}

export function joinGame(s: GameState, rawName: string): { token: string; playerId: string } {
  if (s.phase !== "lobby") throw new MoveError("This game has already started");
  if (s.players.length >= MAX_PLAYERS) throw new MoveError("This room is full (6 players max)");
  const p = newPlayer(rawName);
  if (s.players.some((x) => x.name.toLowerCase() === p.name.toLowerCase())) {
    throw new MoveError("Someone in the room already has that name");
  }
  s.players.push(p);
  log(s, `${p.name} joined.`);
  return { token: p.token, playerId: p.id };
}

function startGame(s: GameState) {
  if (s.players.length < MIN_PLAYERS) throw new MoveError("Need at least 2 players");
  s.deck = shuffle(ROLES.flatMap((r) => [r, r, r]));
  s.turn = rand(s.players.length);
  for (const p of s.players) {
    p.cards = [
      { role: draw(s), revealed: false },
      { role: draw(s), revealed: false },
    ];
    p.coins = 2;
    p.forfeited = false;
  }
  // Two-player variant: the starting player begins with 1 coin.
  if (s.players.length === 2) s.players[s.turn].coins = 1;
  s.pending = null;
  s.lossQueue = [];
  s.winnerId = null;
  s.round += 1;
  s.phase = "action";
  s.deadline = null;
  log(s, `The game begins. ${s.players[s.turn].name} goes first.`, "win");
}

// ---------- eligibility ----------

/** Players who still owe a response in the current respond/block_respond window. */
export function waitingOn(s: GameState): string[] {
  const pd = s.pending;
  if (!pd) return [];
  if (s.phase === "respond") {
    return s.players
      .filter((p) => isAlive(p) && p.id !== pd.actor && !pd.passes.includes(p.id))
      .filter((p) => canChallengeAction(s, p.id) || blockRolesFor(s, p.id).length > 0)
      .map((p) => p.id);
  }
  if (s.phase === "block_respond" && pd.block) {
    return s.players
      .filter((p) => isAlive(p) && p.id !== pd.block!.by && !pd.passes.includes(p.id))
      .map((p) => p.id);
  }
  return [];
}

function canChallengeAction(s: GameState, id: string): boolean {
  const pd = s.pending;
  return !!pd && s.phase === "respond" && pd.challengeOpen && !!ACTIONS[pd.action].claim && id !== pd.actor;
}

export function blockRolesFor(s: GameState, id: string): Role[] {
  const pd = s.pending;
  if (!pd || s.phase !== "respond" || !pd.blockOpen || id === pd.actor) return [];
  const def = ACTIONS[pd.action];
  if (!def.blockedBy.length) return [];
  if (!def.anyoneBlocks && pd.target !== id) return [];
  return def.blockedBy;
}

// ---------- the state machine ----------

function checkWinner(s: GameState): boolean {
  const alive = s.players.filter(isAlive);
  if (alive.length <= 1 && s.phase !== "lobby") {
    if (s.pending?.pool) s.deck.push(...s.pending.pool.slice(-2)); // return any cards drawn for an exchange
    s.phase = "over";
    s.pending = null;
    s.lossQueue = [];
    s.deadline = null;
    s.winnerId = alive[0]?.id ?? null;
    if (alive[0]) log(s, `${alive[0].name} wins the game!`, "win");
    return true;
  }
  return false;
}

function nextTurn(s: GameState) {
  s.pending = null;
  s.deadline = null;
  if (checkWinner(s)) return;
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (s.turn + i) % n;
    if (isAlive(s.players[idx])) {
      s.turn = idx;
      break;
    }
  }
  s.phase = "action";
}

function setDeadline(s: GameState, now: number) {
  s.deadline = now + s.settings.responseSeconds * 1000;
}

/** Run the machine forward until it needs input from someone. */
function advance(s: GameState, now: number) {
  for (let guard = 0; guard < 50; guard++) {
    if (s.phase === "over" || s.phase === "lobby") return;
    if (checkWinner(s)) return;

    // Pending influence losses come first.
    while (s.lossQueue.length) {
      const { playerId } = s.lossQueue[0];
      const p = player(s, playerId);
      const left = influence(p);
      if (left === 0) {
        s.lossQueue.shift();
        continue;
      }
      if (left === 1) {
        const c = p.cards.find((x) => !x.revealed)!;
        c.revealed = true;
        s.lossQueue.shift();
        log(s, `${p.name} reveals their last card, a ${ROLE_NAMES[c.role]}, and is out.`, "loss");
        if (checkWinner(s)) return;
        continue;
      }
      s.phase = "lose";
      s.deadline = null;
      return;
    }

    const pd = s.pending;
    if (!pd) {
      if (s.phase !== "action") nextTurn(s);
      return;
    }

    switch (pd.stage) {
      case "respond":
      case "block_respond": {
        s.phase = pd.stage;
        if (waitingOn(s).length === 0) {
          if (pd.stage === "respond") {
            pd.stage = "resolve";
          } else {
            log(s, `The block stands. ${name(s, pd.actor)}'s ${ACTIONS[pd.action].label} fails.`, "action");
            pd.stage = "done";
          }
          s.deadline = null;
          continue;
        }
        if (s.deadline === null) setDeadline(s, now);
        return;
      }
      case "resolve": {
        resolveAction(s);
        continue;
      }
      case "exchange": {
        s.phase = "exchange";
        s.deadline = null;
        return;
      }
      case "done": {
        nextTurn(s);
        return;
      }
    }
  }
}

function resolveAction(s: GameState) {
  const pd = s.pending!;
  const actor = player(s, pd.actor);
  if (!isAlive(actor)) {
    pd.stage = "done";
    return;
  }
  switch (pd.action) {
    case "tax":
      actor.coins += 3;
      log(s, `${actor.name} collects 3 coins in Tax.`, "action");
      pd.stage = "done";
      break;
    case "foreign_aid":
      actor.coins += 2;
      log(s, `${actor.name} takes 2 coins of Foreign Aid.`, "action");
      pd.stage = "done";
      break;
    case "steal": {
      const t = player(s, pd.target!);
      const amt = Math.min(2, t.coins);
      t.coins -= amt;
      actor.coins += amt;
      log(s, `${actor.name} steals ${amt} coin${amt === 1 ? "" : "s"} from ${t.name}.`, "action");
      pd.stage = "done";
      break;
    }
    case "assassinate": {
      const t = player(s, pd.target!);
      if (isAlive(t)) {
        log(s, `The assassination of ${t.name} succeeds.`, "action");
        s.lossQueue.push({ playerId: t.id, reason: "assassinated" });
      }
      pd.stage = "done";
      break;
    }
    case "exchange": {
      const hidden = actor.cards.filter((c) => !c.revealed).map((c) => c.role);
      const drawn = [draw(s), draw(s)];
      pd.pool = [...hidden, ...drawn];
      log(s, `${actor.name} draws two cards from the court to exchange.`, "action");
      pd.stage = "exchange";
      break;
    }
    default:
      pd.stage = "done";
  }
}

// ---------- moves ----------

export function applyMove(s: GameState, playerId: string, move: Move, now = Date.now()): void {
  const me = player(s, playerId);

  switch (move.type) {
    case "start": {
      if (s.phase !== "lobby") throw new MoveError("Game already started");
      if (playerId !== s.hostId) throw new MoveError("Only the host can start the game");
      startGame(s);
      return;
    }

    case "settings": {
      if (playerId !== s.hostId) throw new MoveError("Only the host can change settings");
      if (s.phase !== "lobby") throw new MoveError("Settings can only be changed in the lobby");
      const secs = Number(move.responseSeconds);
      if (![10, 20, 30, 60].includes(secs)) throw new MoveError("Invalid timer");
      s.settings.responseSeconds = secs;
      return;
    }

    case "action": {
      if (s.phase !== "action") throw new MoveError("Not the time to take an action");
      if (s.players[s.turn].id !== playerId) throw new MoveError("It's not your turn");
      const def = ACTIONS[move.action];
      if (!def) throw new MoveError("Unknown action");
      if (me.coins >= 10 && move.action !== "coup") throw new MoveError("With 10 or more coins you must Coup");
      if (me.coins < def.cost) throw new MoveError(`${def.label} costs ${def.cost} coins`);
      let target: Player | null = null;
      if (def.targeted) {
        if (!move.target) throw new MoveError("Choose a target");
        target = player(s, move.target);
        if (target.id === me.id) throw new MoveError("You can't target yourself");
        if (!isAlive(target)) throw new MoveError("That player is out");
      }
      me.coins -= def.cost;

      if (move.action === "income") {
        me.coins += 1;
        log(s, `${me.name} takes 1 coin of Income.`, "action");
        s.pending = null;
        nextTurn(s);
        return;
      }
      if (move.action === "coup") {
        log(s, `${me.name} launches a Coup against ${target!.name}!`, "action");
        s.pending = {
          actor: me.id, action: "coup", target: target!.id, stage: "done",
          challengeOpen: false, blockOpen: false, block: null, passes: [], pool: null,
        };
        s.lossQueue.push({ playerId: target!.id, reason: "coup" });
        advance(s, now);
        return;
      }

      s.pending = {
        actor: me.id,
        action: move.action,
        target: target?.id ?? null,
        stage: "respond",
        challengeOpen: !!def.claim,
        blockOpen: def.blockedBy.length > 0,
        block: null,
        passes: [],
        pool: null,
      };
      s.phase = "respond";
      s.deadline = null;
      log(s, describeDeclaration(s, me, move.action, target), "action");
      advance(s, now);
      return;
    }

    case "respond": {
      const pd = s.pending;
      if (!pd || (s.phase !== "respond" && s.phase !== "block_respond")) throw new MoveError("Nothing to respond to");
      if (!waitingOn(s).includes(playerId)) throw new MoveError("You've already responded");

      if (move.response === "pass") {
        pd.passes.push(playerId);
        advance(s, now);
        return;
      }

      if (move.response === "challenge") {
        if (s.phase === "respond") {
          if (!canChallengeAction(s, playerId)) throw new MoveError("This action can't be challenged");
          challengeAction(s, me);
        } else {
          challengeBlock(s, me);
        }
        advance(s, now);
        return;
      }

      if (move.response === "block") {
        const roles = blockRolesFor(s, playerId);
        if (!move.role || !roles.includes(move.role)) throw new MoveError("You can't block this with that role");
        pd.block = { by: playerId, role: move.role };
        pd.passes = [];
        pd.stage = "block_respond";
        s.phase = "block_respond";
        s.deadline = null;
        log(s, `${me.name} claims ${ROLE_NAMES[move.role]} to block ${name(s, pd.actor)}'s ${ACTIONS[pd.action].label}.`, "challenge");
        advance(s, now);
        return;
      }
      throw new MoveError("Unknown response");
    }

    case "lose": {
      if (s.phase !== "lose" || s.lossQueue[0]?.playerId !== playerId) throw new MoveError("You don't need to lose a card");
      const c = me.cards[move.cardIndex];
      if (!c || c.revealed) throw new MoveError("Choose one of your hidden cards");
      c.revealed = true;
      s.lossQueue.shift();
      log(s, `${me.name} reveals a ${ROLE_NAMES[c.role]}.`, "loss");
      advance(s, now);
      return;
    }

    case "exchange": {
      const pd = s.pending;
      if (s.phase !== "exchange" || !pd || pd.actor !== playerId || !pd.pool) throw new MoveError("Not exchanging right now");
      const keepCount = influence(me);
      const keep = [...new Set(move.keep.map(Number))];
      if (keep.length !== keepCount || keep.some((i) => !(i >= 0 && i < pd.pool!.length))) {
        throw new MoveError(`Choose exactly ${keepCount} card${keepCount === 1 ? "" : "s"} to keep`);
      }
      const kept = keep.map((i) => pd.pool![i]);
      const returned = pd.pool.filter((_, i) => !keep.includes(i));
      let k = 0;
      for (const c of me.cards) if (!c.revealed) c.role = kept[k++];
      s.deck.push(...returned);
      shuffle(s.deck);
      pd.pool = null;
      pd.stage = "done";
      log(s, `${me.name} returns two cards to the court.`, "action");
      advance(s, now);
      return;
    }

    case "leave": {
      removeOrForfeit(s, playerId, `${me.name} left the game.`, now);
      return;
    }

    case "kick": {
      if (playerId !== s.hostId) throw new MoveError("Only the host can remove players");
      if (move.playerId === playerId) throw new MoveError("Use Leave instead");
      const t = player(s, move.playerId);
      removeOrForfeit(s, t.id, `${t.name} was removed by the host.`, now);
      return;
    }

    case "rematch": {
      if (s.phase !== "over") throw new MoveError("The game isn't over");
      if (playerId !== s.hostId) throw new MoveError("Only the host can start a rematch");
      s.players = s.players.filter((p) => !p.forfeited);
      for (const p of s.players) {
        p.cards = [];
        p.coins = 0;
      }
      s.phase = "lobby";
      s.pending = null;
      s.lossQueue = [];
      s.winnerId = null;
      s.deadline = null;
      log(s, "Back to the lobby for a rematch.");
      return;
    }
  }
  throw new MoveError("Unknown move");
}

function describeDeclaration(s: GameState, me: Player, action: ActionType, target: Player | null): string {
  switch (action) {
    case "foreign_aid": return `${me.name} asks for Foreign Aid.`;
    case "tax": return `${me.name} claims Duke to collect Tax.`;
    case "assassinate": return `${me.name} pays 3 coins and claims Assassin to assassinate ${target!.name}.`;
    case "steal": return `${me.name} claims Captain to steal from ${target!.name}.`;
    case "exchange": return `${me.name} claims Ambassador to exchange cards.`;
    default: return `${me.name} acts.`;
  }
}

function challengeAction(s: GameState, challenger: Player) {
  const pd = s.pending!;
  const actor = player(s, pd.actor);
  const role = ACTIONS[pd.action].claim!;
  log(s, `${challenger.name} challenges ${actor.name}'s ${ROLE_NAMES[role]}!`, "challenge");
  if (hasRole(actor, role)) {
    log(s, `${actor.name} shows a ${ROLE_NAMES[role]} — the challenge fails. ${actor.name} shuffles it back and draws a new card.`, "challenge");
    swapRevealedClaim(s, actor, role);
    s.lossQueue.push({ playerId: challenger.id, reason: "lost a challenge" });
    pd.challengeOpen = false;
    pd.passes = [];
    pd.stage = "respond"; // block window (if any) stays open for eligible blockers
    s.deadline = null;
  } else {
    log(s, `${actor.name} was bluffing — no ${ROLE_NAMES[role]}! The action fails.`, "challenge");
    actor.coins += ACTIONS[pd.action].cost; // costs are refunded on a successful challenge
    s.lossQueue.push({ playerId: actor.id, reason: "caught bluffing" });
    pd.stage = "done";
  }
}

function challengeBlock(s: GameState, challenger: Player) {
  const pd = s.pending!;
  const blk = pd.block!;
  const blocker = player(s, blk.by);
  log(s, `${challenger.name} challenges ${blocker.name}'s ${ROLE_NAMES[blk.role]}!`, "challenge");
  if (hasRole(blocker, blk.role)) {
    log(s, `${blocker.name} shows a ${ROLE_NAMES[blk.role]} — the block holds. ${blocker.name} draws a new card.`, "challenge");
    swapRevealedClaim(s, blocker, blk.role);
    s.lossQueue.push({ playerId: challenger.id, reason: "lost a challenge" });
    log(s, `${name(s, pd.actor)}'s ${ACTIONS[pd.action].label} is blocked.`, "action");
    pd.stage = "done";
  } else {
    log(s, `${blocker.name} was bluffing — no ${ROLE_NAMES[blk.role]}! The block fails.`, "challenge");
    s.lossQueue.push({ playerId: blocker.id, reason: "caught bluffing" });
    pd.stage = "resolve";
  }
  s.deadline = null;
}

function removeOrForfeit(s: GameState, id: string, msg: string, now: number) {
  const p = player(s, id);
  if (s.phase === "lobby") {
    s.players = s.players.filter((x) => x.id !== id);
    log(s, msg);
    if (s.hostId === id && s.players[0]) {
      s.hostId = s.players[0].id;
      log(s, `${s.players[0].name} is now the host.`);
    }
    return;
  }
  if (s.phase === "over") {
    p.forfeited = true;
    log(s, msg);
    if (s.hostId === id) reassignHost(s);
    return;
  }
  const wasTheirTurn = s.players[s.turn]?.id === id;
  for (const c of p.cards) c.revealed = true;
  p.forfeited = true;
  log(s, msg, "loss");
  s.lossQueue = s.lossQueue.filter((l) => l.playerId !== id);
  const pd = s.pending;
  if (pd) {
    if (pd.actor === id) {
      if (pd.pool) {
        // Return the two drawn cards; the actor's own (now revealed) cards stay on the table.
        const hiddenCount = pd.pool.length - 2;
        s.deck.push(...pd.pool.slice(hiddenCount));
        shuffle(s.deck);
        pd.pool = null;
      }
      pd.stage = "done";
    } else if (pd.block?.by === id && pd.stage === "block_respond") {
      // A block from a departed player lapses; the action goes through.
      pd.stage = "resolve";
    }
  } else if (wasTheirTurn && s.phase === "action") {
    nextTurn(s);
  }
  if (s.hostId === id) reassignHost(s);
  advance(s, now);
}

function reassignHost(s: GameState) {
  const next = s.players.find((p) => !p.forfeited);
  if (next) {
    s.hostId = next.id;
    log(s, `${next.name} is now the host.`);
  }
}

/** Auto-pass anyone who hasn't responded once the response timer runs out. Returns true if state changed. */
export function tick(s: GameState, now = Date.now()): boolean {
  if ((s.phase === "respond" || s.phase === "block_respond") && s.deadline !== null && now >= s.deadline && s.pending) {
    const waiting = waitingOn(s);
    if (!waiting.length) return false;
    s.pending.passes.push(...waiting);
    advance(s, now);
    return true;
  }
  return false;
}

// ---------- per-player view ----------

export interface PublicPlayer {
  id: string;
  name: string;
  coins: number;
  cards: { role: Role | null; revealed: boolean }[];
  alive: boolean;
  forfeited: boolean;
  isHost: boolean;
}

export interface GameView {
  code: string;
  you: string;
  hostId: string;
  phase: Phase;
  players: PublicPlayer[];
  deckCount: number;
  turnPlayerId: string | null;
  pending: Omit<Pending, "pool" | "passes" | "stage"> | null;
  waitingOn: string[];
  loser: { playerId: string; reason: string } | null;
  winnerId: string | null;
  log: LogEntry[];
  settings: { responseSeconds: number };
  deadline: number | null;
  serverNow: number;
  options: {
    canAct: boolean;
    mustCoup: boolean;
    canChallenge: boolean;
    blockRoles: Role[];
    canPass: boolean;
    mustLose: boolean;
    exchangePool: Role[] | null;
    keepCount: number;
  };
}

export function viewFor(s: GameState, youId: string, now = Date.now()): GameView {
  const me = s.players.find((p) => p.id === youId);
  const waiting = waitingOn(s);
  const pd = s.pending;
  const reveal = s.phase === "over";
  return {
    code: s.code,
    you: youId,
    hostId: s.hostId,
    phase: s.phase,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      coins: p.coins,
      cards: p.cards.map((c) => ({
        role: c.revealed || p.id === youId || reveal ? c.role : null,
        revealed: c.revealed,
      })),
      alive: s.phase === "lobby" ? true : isAlive(p),
      forfeited: !!p.forfeited,
      isHost: p.id === s.hostId,
    })),
    deckCount: s.deck.length,
    turnPlayerId: s.phase === "lobby" || s.phase === "over" ? null : s.players[s.turn]?.id ?? null,
    pending: pd
      ? { actor: pd.actor, action: pd.action, target: pd.target, challengeOpen: pd.challengeOpen, blockOpen: pd.blockOpen, block: pd.block }
      : null,
    waitingOn: waiting,
    loser: s.phase === "lose" ? s.lossQueue[0] ?? null : null,
    winnerId: s.winnerId,
    log: s.log.slice(-60),
    settings: s.settings,
    deadline: s.deadline,
    serverNow: now,
    options: {
      canAct: s.phase === "action" && s.players[s.turn]?.id === youId,
      mustCoup: !!me && me.coins >= 10,
      canChallenge:
        waiting.includes(youId) &&
        ((s.phase === "respond" && canChallengeAction(s, youId)) || s.phase === "block_respond"),
      blockRoles: waiting.includes(youId) ? blockRolesFor(s, youId) : [],
      canPass: waiting.includes(youId),
      mustLose: s.phase === "lose" && s.lossQueue[0]?.playerId === youId,
      exchangePool: s.phase === "exchange" && pd?.actor === youId ? pd.pool : null,
      keepCount: me ? influence(me) : 0,
    },
  };
}
