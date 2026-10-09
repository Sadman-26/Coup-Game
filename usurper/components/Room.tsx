"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ACTIONS, ActionType, GameView, Move, PublicPlayer, Role, ROLE_NAMES } from "@/lib/engine";
import { clearSeat, loadSeat, saveSeat, Seat } from "@/lib/client";
import { RoleCard } from "./RoleCard";
import { Coin } from "./Emblems";
import { RulesSheet } from "./RulesSheet";

type Unseated = { phase: string; players: string[] };

const ACTION_ORDER: ActionType[] = ["income", "foreign_aid", "tax", "steal", "assassinate", "exchange", "coup"];
const ACTION_HINT: Record<ActionType, string> = {
  income: "+1 coin",
  foreign_aid: "+2 coins",
  tax: "+3 coins",
  steal: "Take 2",
  assassinate: "Pay 3",
  exchange: "Swap cards",
  coup: "Pay 7",
};

export function Room({ code }: { code: string }) {
  const router = useRouter();
  const [seat, setSeat] = useState<Seat | null | undefined>(undefined);
  const [view, setView] = useState<GameView | null>(null);
  const [unseated, setUnseated] = useState<Unseated | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const offset = useRef(0); // serverNow - clientNow
  const seq = useRef(0);
  const applied = useRef(0);

  useEffect(() => setSeat(loadSeat(code)), [code]);

  const apply = useCallback((id: number, v: GameView) => {
    if (id < applied.current) return;
    applied.current = id;
    offset.current = v.serverNow - Date.now();
    setView(v);
  }, []);

  const poll = useCallback(async () => {
    const id = ++seq.current;
    try {
      const res = await fetch(`/api/rooms/${code}`, {
        headers: { "x-player-token": seat?.token ?? "" },
        cache: "no-store",
      });
      const data = await res.json();
      if (res.status === 404) return setNotFound(true);
      if (!res.ok) return;
      if (data.seated) {
        setUnseated(null);
        apply(id, data.view);
      } else {
        setUnseated({ phase: data.phase, players: data.players });
      }
    } catch {
      /* network blip — next poll will retry */
    }
  }, [code, seat, apply]);

  useEffect(() => {
    if (seat === undefined) return;
    poll();
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      const delay = document.hidden ? 4000 : 1000;
      timer = setTimeout(async () => {
        await poll();
        loop();
      }, delay);
    };
    loop();
    const onVis = () => !document.hidden && poll();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [seat, poll]);

  const send = useCallback(
    async (move: Move) => {
      if (!seat) return;
      const id = ++seq.current;
      setBusy(true);
      try {
        const res = await fetch(`/api/rooms/${code}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-player-token": seat.token },
          body: JSON.stringify({ move }),
        });
        const data = await res.json();
        if (!res.ok) {
          setToast(data.error ?? "That didn't work");
          poll();
          return false;
        }
        apply(id, data.view);
        return true;
      } catch {
        setToast("Connection problem — try again");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [seat, code, apply, poll],
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Tab title nudges you when it's your move.
  const needsMe = !!view && (view.options.canAct || view.options.canPass || view.options.mustLose || !!view.options.exchangePool);
  useEffect(() => {
    document.title = needsMe ? "● Your move — Usurper" : `Room ${code} — Usurper`;
  }, [needsMe, code]);

  async function leave() {
    const inGame = view && view.phase !== "lobby" && view.phase !== "over";
    if (inGame && !confirm("Leave the game? You'll forfeit and your cards will be revealed.")) return;
    await send({ type: "leave" });
    clearSeat(code);
    router.push("/");
  }

  if (notFound) {
    return (
      <main className="center-page">
        <div className="panel narrow">
          <h1 className="title-sm">No room called {code}</h1>
          <p className="muted">Check the code, or the room may have expired.</p>
          <Link className="btn btn-primary" href="/">Back home</Link>
        </div>
      </main>
    );
  }

  if (seat === undefined || (!view && !unseated)) {
    return (
      <main className="center-page">
        <p className="muted">Finding the table…</p>
      </main>
    );
  }

  if (!view && unseated) {
    return (
      <JoinForm
        code={code}
        info={unseated}
        onJoined={(s, v) => {
          saveSeat(code, s);
          setSeat(s);
          setUnseated(null);
          apply(++seq.current, v);
        }}
      />
    );
  }

  const v = view!;
  return (
    <main className="room">
      <header className="topbar">
        <Link href="/" className="brand-sm">Usurper</Link>
        <RoomCode code={code} />
        <div className="topbar-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setRulesOpen(true)}>Rules</button>
          <button className="btn btn-ghost btn-sm" onClick={leave}>Leave</button>
        </div>
      </header>

      {v.phase === "lobby" ? (
        <Lobby v={v} send={send} busy={busy} code={code} />
      ) : (
        <Table v={v} send={send} busy={busy} offset={offset} />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
      <RulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </main>
  );
}

// ---------------------------------------------------------------------------

function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="room-code"
      title="Copy invite link"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${location.origin}/room/${code}`);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }}
    >
      <span className="muted small">Room</span> <strong>{code}</strong>
      <span className="small muted">{copied ? "link copied" : "copy link"}</span>
    </button>
  );
}

function JoinForm({ code, info, onJoined }: { code: string; info: Unseated; onJoined: (s: Seat, v: GameView) => void }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      setName(localStorage.getItem("usurper:name") ?? "");
    } catch {}
  }, []);

  const started = info.phase !== "lobby";

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      localStorage.setItem("usurper:name", name.trim());
    } catch {}
    try {
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't join");
      onJoined({ token: data.token, playerId: data.playerId }, data.view);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="center-page">
      <div className="panel narrow">
        <p className="eyebrow">Room {code}</p>
        {started ? (
          <>
            <h1 className="title-sm">This game is already underway</h1>
            <p className="muted">Seated: {info.players.join(", ")}. Ask the host for a rematch, or start your own room.</p>
            <Link className="btn btn-primary" href="/">Start a new room</Link>
          </>
        ) : (
          <form onSubmit={join} className="stack">
            <h1 className="title-sm">Take a seat</h1>
            {info.players.length > 0 && <p className="muted">Already here: {info.players.join(", ")}</p>}
            <label className="field">
              <span>Your name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoFocus />
            </label>
            <button className="btn btn-primary btn-block" disabled={busy || !name.trim()}>
              {busy ? "Joining…" : "Join the table"}
            </button>
            {err && <p className="error-text" role="alert">{err}</p>}
          </form>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------

type Send = (m: Move) => Promise<boolean | undefined>;

function Lobby({ v, send, busy, code }: { v: GameView; send: Send; busy: boolean; code: string }) {
  const isHost = v.you === v.hostId;
  const enough = v.players.length >= 2;
  return (
    <section className="lobby">
      <div className="panel">
        <p className="eyebrow">Waiting room</p>
        <h1 className="title-sm">{v.players.length} of 6 seats taken</h1>
        <p className="muted">
          Share the code <strong className="mono">{code}</strong> or the invite link. Anyone with it can join until the game starts.
        </p>

        <ul className="seat-list">
          {v.players.map((p) => (
            <li key={p.id}>
              <span className="seat-name">
                {p.name}
                {p.id === v.you && <span className="tag">you</span>}
                {p.isHost && <span className="tag tag-brass">host</span>}
              </span>
              {isHost && p.id !== v.you && (
                <button className="link-btn small" disabled={busy} onClick={() => send({ type: "kick", playerId: p.id })}>
                  remove
                </button>
              )}
            </li>
          ))}
          {Array.from({ length: Math.max(0, 6 - v.players.length) }).map((_, i) => (
            <li key={`e${i}`} className="seat-empty">Empty seat</li>
          ))}
        </ul>

        <div className="lobby-settings">
          <label className="field-inline">
            <span>Time to challenge or block</span>
            <select
              value={v.settings.responseSeconds}
              disabled={!isHost || busy}
              onChange={(e) => send({ type: "settings", responseSeconds: Number(e.target.value) })}
            >
              {[10, 20, 30, 60].map((s) => (
                <option key={s} value={s}>{s} seconds</option>
              ))}
            </select>
          </label>
        </div>

        {isHost ? (
          <button className="btn btn-primary btn-block" disabled={!enough || busy} onClick={() => send({ type: "start" })}>
            {enough ? `Deal the cards (${v.players.length} players)` : "Need at least 2 players"}
          </button>
        ) : (
          <p className="waiting-note">Waiting for the host to start…</p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function Table({ v, send, busy, offset }: { v: GameView; send: Send; busy: boolean; offset: React.MutableRefObject<number> }) {
  const me = v.players.find((p) => p.id === v.you)!;
  const myIndex = v.players.findIndex((p) => p.id === v.you);
  // Opponents in seat order, starting after you.
  const opponents = useMemo(
    () => [...v.players.slice(myIndex + 1), ...v.players.slice(0, myIndex)],
    [v.players, myIndex],
  );
  const nameOf = (id: string | null | undefined) => (id === v.you ? "You" : v.players.find((p) => p.id === id)?.name ?? "?");
  const isHost = v.you === v.hostId;

  const [chosen, setChosen] = useState<ActionType | null>(null);
  const [loseSel, setLoseSel] = useState<number | null>(null);
  useEffect(() => {
    if (!v.options.canAct) setChosen(null);
    if (!v.options.mustLose) setLoseSel(null);
  }, [v.options.canAct, v.options.mustLose]);

  async function act(action: ActionType, target?: string) {
    const ok = await send({ type: "action", action, target: target ?? null });
    if (ok) setChosen(null);
  }

  return (
    <section className="table-layout">
      <div className="table-main">
        <div className="opponents">
          {opponents.map((p) => (
            <OpponentSeat
              key={p.id}
              p={p}
              v={v}
              targetable={!!chosen && ACTIONS[chosen].targeted && p.alive}
              onTarget={() => chosen && act(chosen, p.id)}
              canKick={isHost && !p.forfeited && v.phase !== "over"}
              onKick={() => confirm(`Remove ${p.name} from the game? Their cards will be revealed.`) && send({ type: "kick", playerId: p.id })}
            />
          ))}
        </div>

        <Stage v={v} nameOf={nameOf} send={send} busy={busy} offset={offset} />

        <div className={`my-area ${v.turnPlayerId === v.you ? "is-turn" : ""} ${!me.alive ? "is-out" : ""}`}>
          <div className="my-head">
            <span className="my-name">
              {me.name} <span className="muted small">(you)</span>
            </span>
            <span className="coins-lg">
              <Coin size={20} /> {me.coins}
            </span>
          </div>

          <div className="my-cards">
            {me.cards.map((c, i) => (
              <RoleCard
                key={i}
                role={c.role}
                revealed={c.revealed}
                size="lg"
                showBlurb
                selectable={v.options.mustLose && !c.revealed}
                selected={loseSel === i}
                onClick={() => setLoseSel(i)}
              />
            ))}
          </div>

          {v.options.mustLose && (
            <div className="prompt-row">
              <span>
                {v.loser?.reason === "coup" || v.loser?.reason === "assassinated"
                  ? "You've been hit. "
                  : "You lost the challenge. "}
                Pick a card to give up.
              </span>
              <button
                className="btn btn-danger"
                disabled={loseSel === null || busy}
                onClick={() => loseSel !== null && send({ type: "lose", cardIndex: loseSel })}
              >
                Reveal this card
              </button>
            </div>
          )}

          {v.options.canAct && (
            <ActionBar
              coins={me.coins}
              mustCoup={v.options.mustCoup}
              chosen={chosen}
              busy={busy}
              onChoose={(a) => (ACTIONS[a].targeted ? setChosen(chosen === a ? null : a) : act(a))}
              targets={opponents.filter((p) => p.alive)}
              onTarget={(id) => chosen && act(chosen, id)}
            />
          )}

          {!me.alive && v.phase !== "over" && <p className="out-note">You&apos;re out — stick around and watch the bluffs unfold.</p>}
        </div>
      </div>

      <GameLog v={v} />
    </section>
  );
}

function OpponentSeat({
  p, v, targetable, onTarget, canKick, onKick,
}: { p: PublicPlayer; v: GameView; targetable: boolean; onTarget: () => void; canKick: boolean; onKick: () => void }) {
  const isTurn = v.turnPlayerId === p.id;
  const waiting = v.waitingOn.includes(p.id) || v.loser?.playerId === p.id || (v.phase === "exchange" && v.pending?.actor === p.id);
  const cls = ["seat", isTurn && "is-turn", !p.alive && "is-out", targetable && "is-targetable", v.winnerId === p.id && "is-winner"]
    .filter(Boolean)
    .join(" ");
  const body = (
    <>
      <div className="seat-head">
        <span className="seat-title">
          {p.name}
          {p.isHost && <span className="tag tag-brass">host</span>}
        </span>
        <span className="coins"><Coin size={14} /> {p.coins}</span>
      </div>
      <div className="seat-cards">
        {p.cards.map((c, i) => (
          <RoleCard key={i} role={c.role} revealed={c.revealed} size="sm" />
        ))}
      </div>
      <div className="seat-status">
        {v.winnerId === p.id ? "Winner" : !p.alive ? (p.forfeited ? "Left" : "Out") : isTurn ? "Their turn" : waiting ? "Deciding…" : " "}
      </div>
    </>
  );
  return (
    <div className="seat-wrap">
      {targetable ? (
        <button className={cls} onClick={onTarget} aria-label={`Target ${p.name}`}>{body}</button>
      ) : (
        <div className={cls}>{body}</div>
      )}
      {canKick && (
        <button className="kick-btn" onClick={onKick} title={`Remove ${p.name}`}>remove</button>
      )}
    </div>
  );
}

function ActionBar({
  coins, mustCoup, chosen, busy, onChoose, targets, onTarget,
}: {
  coins: number; mustCoup: boolean; chosen: ActionType | null; busy: boolean;
  onChoose: (a: ActionType) => void; targets: PublicPlayer[]; onTarget: (id: string) => void;
}) {
  return (
    <div className="action-bar">
      <p className="action-title">
        {mustCoup ? "You have 10+ coins — you must launch a Coup." : "Your turn. Choose an action:"}
      </p>
      <div className="action-grid">
        {ACTION_ORDER.map((a) => {
          const d = ACTIONS[a];
          const disabled = busy || coins < d.cost || (mustCoup && a !== "coup");
          return (
            <button
              key={a}
              className={`action-btn ${d.claim ? `claim-${d.claim}` : "claim-none"} ${chosen === a ? "is-chosen" : ""}`}
              disabled={disabled}
              onClick={() => onChoose(a)}
            >
              <span className="action-name">{d.label}</span>
              <span className="action-meta">
                {ACTION_HINT[a]}
                {d.claim && <em> · claim {ROLE_NAMES[d.claim]}</em>}
              </span>
            </button>
          );
        })}
      </div>
      {chosen && (
        <div className="target-row">
          <span>{ACTIONS[chosen].label} who?</span>
          {targets.map((t) => (
            <button key={t.id} className="btn btn-sm" disabled={busy} onClick={() => onTarget(t.id)}>
              {t.name} <span className="muted small">({t.coins}c)</span>
            </button>
          ))}
          <span className="muted small">…or tap their seat above.</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function verbFor(action: ActionType, target: string): string {
  switch (action) {
    case "tax": return "collect Tax (+3)";
    case "steal": return `steal from ${target}`;
    case "assassinate": return `assassinate ${target}`;
    case "exchange": return "exchange cards with the court";
    default: return ACTIONS[action].label;
  }
}

function Stage({
  v, nameOf, send, busy, offset,
}: { v: GameView; nameOf: (id: string | null | undefined) => string; send: Send; busy: boolean; offset: React.MutableRefObject<number> }) {
  const pd = v.pending;
  const timed = (v.phase === "respond" || v.phase === "block_respond") && v.deadline !== null;
  const now = useNow(timed) + offset.current;
  const total = v.settings.responseSeconds * 1000;
  const remaining = timed ? Math.max(0, v.deadline! - now) : 0;
  const o = v.options;

  let headline: React.ReactNode = null;
  let sub: React.ReactNode = null;
  let claim: Role | null = null;

  if (v.phase === "over") {
    const w = v.players.find((p) => p.id === v.winnerId);
    headline = w ? (w.id === v.you ? "You win the throne!" : `${w.name} wins the throne.`) : "Game over";
    sub = "All hands are revealed.";
  } else if (v.phase === "action") {
    headline = v.turnPlayerId === v.you ? "Your move." : `${nameOf(v.turnPlayerId)} is choosing an action…`;
  } else if (pd && v.phase === "respond") {
    const d = ACTIONS[pd.action];
    claim = d.claim ?? null;
    const target = nameOf(pd.target);
    headline =
      pd.action === "foreign_aid"
        ? `${nameOf(pd.actor)} ${pd.actor === v.you ? "ask" : "asks"} for Foreign Aid (+2).`
        : `${nameOf(pd.actor)} ${pd.actor === v.you ? "claim" : "claims"} ${ROLE_NAMES[d.claim!]} to ${verbFor(pd.action, target === "You" ? "you" : target)}.`;
    if (pd.actor === v.you) sub = "Waiting to see if anyone challenges or blocks…";
    else if (!pd.challengeOpen) sub = `The claim was proven. ${pd.target === v.you ? "You may still block." : "Waiting on a possible block…"}`;
  } else if (pd?.block && v.phase === "block_respond") {
    claim = pd.block.role;
    headline = `${nameOf(pd.block.by)} ${pd.block.by === v.you ? "block" : "blocks"} ${pd.actor === v.you ? "your" : `${nameOf(pd.actor)}'s`} ${ACTIONS[pd.action].label} with ${ROLE_NAMES[pd.block.role]}.`;
    sub = pd.block.by === v.you ? "Waiting to see if anyone challenges your block…" : null;
  } else if (v.phase === "lose" && v.loser) {
    headline = v.loser.playerId === v.you ? "Choose a card to lose." : `${nameOf(v.loser.playerId)} must give up a card…`;
  } else if (v.phase === "exchange" && pd) {
    headline = pd.actor === v.you ? "Choose which cards to keep." : `${nameOf(pd.actor)} is exchanging with the court…`;
  }

  const waitingNames = v.waitingOn.filter((id) => id !== v.you).map((id) => nameOf(id));

  return (
    <div className={`stage ${claim ? `stage-${claim}` : ""} ${v.phase === "over" ? "stage-over" : ""}`}>
      <div className="stage-text">
        <p className="stage-headline">{headline}</p>
        {sub && <p className="stage-sub">{sub}</p>}
        {timed && waitingNames.length > 0 && (
          <p className="stage-sub small">Waiting on {waitingNames.join(", ")}</p>
        )}
      </div>

      {timed && (
        <div className="timer" aria-label={`${Math.ceil(remaining / 1000)} seconds left`}>
          <div className="timer-fill" style={{ width: `${(remaining / total) * 100}%` }} />
          <span className="timer-label">{Math.ceil(remaining / 1000)}s</span>
        </div>
      )}

      {o.canPass && (
        <div className="response-row">
          {o.canChallenge && (
            <button className="btn btn-danger" disabled={busy} onClick={() => send({ type: "respond", response: "challenge" })}>
              Challenge{claim ? ` the ${ROLE_NAMES[claim]}` : ""}
            </button>
          )}
          {o.blockRoles.map((r) => (
            <button key={r} className={`btn btn-role role-btn-${r}`} disabled={busy} onClick={() => send({ type: "respond", response: "block", role: r })}>
              Block as {ROLE_NAMES[r]}
            </button>
          ))}
          <button className="btn" disabled={busy} onClick={() => send({ type: "respond", response: "pass" })}>
            {v.phase === "block_respond" ? "Accept the block" : "Allow it"}
          </button>
        </div>
      )}

      {o.exchangePool && <ExchangePicker pool={o.exchangePool} keep={o.keepCount} busy={busy} send={send} />}

      {v.phase === "over" && (
        <div className="response-row">
          {v.you === v.hostId ? (
            <button className="btn btn-primary" disabled={busy} onClick={() => send({ type: "rematch" })}>
              Rematch with this table
            </button>
          ) : (
            <span className="muted">Waiting for the host to call a rematch…</span>
          )}
        </div>
      )}
    </div>
  );
}

function ExchangePicker({ pool, keep, busy, send }: { pool: Role[]; keep: number; busy: boolean; send: Send }) {
  const [sel, setSel] = useState<number[]>([]);
  const toggle = (i: number) =>
    setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : s.length < keep ? [...s, i] : [...s.slice(1), i]));
  return (
    <div className="exchange">
      <p className="small muted">Tap {keep} card{keep > 1 ? "s" : ""} to keep. The rest go back to the court.</p>
      <div className="exchange-cards">
        {pool.map((r, i) => (
          <RoleCard key={i} role={r} size="md" selectable selected={sel.includes(i)} onClick={() => toggle(i)} />
        ))}
      </div>
      <button className="btn btn-primary" disabled={sel.length !== keep || busy} onClick={() => send({ type: "exchange", keep: sel })}>
        Keep {sel.length}/{keep}
      </button>
    </div>
  );
}

function GameLog({ v }: { v: GameView }) {
  const ref = useRef<HTMLOListElement>(null);
  const last = v.log[v.log.length - 1]?.n;
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [last]);
  return (
    <aside className="log panel">
      <h2 className="log-title">Chronicle</h2>
      <ol ref={ref} className="log-list">
        {v.log.map((e) => (
          <li key={e.n} className={`log-${e.kind ?? "info"}`}>{e.text}</li>
        ))}
      </ol>
      <p className="small muted log-foot">Court deck: {v.deckCount} cards</p>
    </aside>
  );
}
