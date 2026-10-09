# Usurper

A real-time, browser-based bluffing game for 2–6 players that follows the rules of *Coup*. Create a room, share the 4-letter code, and play from any phone or laptop. No accounts needed.

This is an unofficial fan project with its own name and artwork. If you enjoy it, buy the physical game.

## How it works

- **Next.js 16** (App Router) app, deployed on **Vercel**.
- The rules engine (`lib/engine.ts`) runs **only on the server**. Each player receives a filtered view, so nobody can read another player's hidden cards from the network tab.
- Game state is stored in **Supabase Postgres**, one row per room. Every write is version-checked, so simultaneous challenges can't clobber each other.
- Browsers poll once per second (every 4 seconds when the tab is hidden). The challenge/block timer is enforced on the server.
- Players are identified by a random token kept in `localStorage`. Refreshing the page keeps your seat.

## Deploy to Vercel (about 10 minutes)

### 1. Create the database

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. Go to **Project Settings → API** and copy:
   - the **Project URL**
   - the **service_role** key (or a **secret key** starting with `sb_secret_`)

The table has row-level security on and no policies. Only the server, using the secret key, can read it.

### 2. Push the code to GitHub

```bash
cd usurper
git init && git add -A && git commit -m "Usurper"
gh repo create usurper --private --source=. --push   # or create the repo on github.com and push
```

### 3. Import into Vercel

1. On [vercel.com/new](https://vercel.com/new), import the repo. The framework is auto-detected as Next.js.
2. Add these **Environment Variables**:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | `https://<your-project>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | your service_role / secret key |

3. Click **Deploy**.

> If you skip the env vars, the app falls back to an in-memory store. That works locally, but on Vercel players will see "Room not found" errors, because each serverless instance has its own memory.

You can deploy from the command line instead with `npx vercel` and add the variables with `npx vercel env add`.

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000, in-memory store, no setup needed
```

To test against Supabase locally, copy `.env.example` to `.env.local` and fill it in.

Open the room in two browser profiles (or one normal and one private window) to play against yourself.

## Tests

```bash
npm test
```

- `scripts/rules.ts`: deterministic checks of specific rulings (refunds on failed Assassin claims, double loss from a bluffed Contessa, blocking after a failed challenge, forced Coup at 10 coins, and so on).
- `scripts/fuzz.ts`: 4,000 random games with 2–6 players, including timeouts and players leaving mid-game. After every move it checks that the deck always holds exactly 3 of each role, that no game gets stuck, and that no hidden card or token leaks into another player's view.

## Rules implemented

- Income, Foreign Aid, Coup (mandatory at 10+ coins), Tax, Assassinate, Steal, Exchange.
- Any claim, whether an action or a block, can be challenged by any other player. When a claim is proven, the card is shuffled back and replaced.
- Successfully challenged actions refund their cost. A blocked assassination does not.
- After a failed challenge, the target can still block (for example, Contessa after challenging an Assassin and losing).
- Two-player variant: the starting player begins with 1 coin.
- Response timer (host picks 10/20/30/60 s). Silence counts as allowing the claim.
- The host can remove an AFK player (their cards are revealed). Players can leave (forfeit). Rematch keeps the table together.

## Project layout

```
app/
  page.tsx                  home: create or join a room
  room/[code]/page.tsx      the table
  api/rooms/...             create · poll · join · move
components/                 Room (lobby, table, stage, actions, log), cards, emblems, rules sheet
lib/engine.ts               rules engine and per-player view
lib/store.ts                Supabase / in-memory storage with optimistic locking
supabase/schema.sql         one table
scripts/                    rules + fuzz tests
```

## Costs

On free tiers this costs nothing. Each connected player makes about 1 request per second while the tab is open. Vercel's Hobby plan and Supabase's free tier handle casual games with friends easily. Rooms idle for more than 2 days are cleaned up automatically.
