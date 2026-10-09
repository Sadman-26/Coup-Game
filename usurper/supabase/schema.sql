-- Run this once in your Supabase project (SQL Editor → New query → Run).
create table if not exists public.usurper_games (
  code        text primary key,
  state       jsonb       not null,
  version     integer     not null default 1,
  updated_at  timestamptz not null default now()
);

create index if not exists usurper_games_updated_at_idx on public.usurper_games (updated_at);

-- Lock the table down: only the server (using the service-role / secret key) can read or write.
-- No policies are created, so the public anon key gets nothing — players can't peek at hidden cards.
alter table public.usurper_games enable row level security;
revoke all on table public.usurper_games from anon, authenticated;
