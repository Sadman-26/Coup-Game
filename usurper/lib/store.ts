// Game persistence. On Vercel, serverless functions don't share memory, so state lives in
// Supabase (Postgres). Every write is guarded by a version number (optimistic locking) so two
// players acting at the same instant can't overwrite each other.
//
// Without SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY set, an in-memory store is used — fine for
// `npm run dev` on one machine, NOT for a Vercel deployment.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { GameState } from "./engine";

export interface Stored {
  state: GameState;
  version: number;
}

interface Store {
  get(code: string): Promise<Stored | null>;
  /** Returns false if the code is taken. */
  create(code: string, state: GameState): Promise<boolean>;
  /** Returns false if someone else wrote first (version mismatch). */
  update(code: string, state: GameState, expectedVersion: number): Promise<boolean>;
}

// ---------- in-memory (local dev) ----------

const g = globalThis as unknown as { __usurperGames?: Map<string, { json: string; version: number }> };
const mem = (g.__usurperGames ??= new Map());

const memoryStore: Store = {
  async get(code) {
    const row = mem.get(code);
    return row ? { state: JSON.parse(row.json), version: row.version } : null;
  },
  async create(code, state) {
    if (mem.has(code)) return false;
    mem.set(code, { json: JSON.stringify(state), version: 1 });
    return true;
  },
  async update(code, state, expectedVersion) {
    const row = mem.get(code);
    if (!row || row.version !== expectedVersion) return false;
    mem.set(code, { json: JSON.stringify(state), version: expectedVersion + 1 });
    return true;
  },
};

// ---------- Supabase ----------

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL!;
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)!;
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

const TABLE = "usurper_games";

const supabaseStore: Store = {
  async get(code) {
    const { data, error } = await sb().from(TABLE).select("state, version").eq("code", code).maybeSingle();
    if (error) throw new Error(`Database error: ${error.message}`);
    return data ? { state: data.state as GameState, version: data.version as number } : null;
  },
  async create(code, state) {
    const { error } = await sb().from(TABLE).insert({ code, state, version: 1 });
    if (error) {
      if (error.code === "23505") return false; // duplicate key
      throw new Error(`Database error: ${error.message}`);
    }
    // Opportunistic cleanup of rooms idle for more than 2 days.
    if (Math.random() < 0.1) {
      const cutoff = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
      await sb().from(TABLE).delete().lt("updated_at", cutoff);
    }
    return true;
  },
  async update(code, state, expectedVersion) {
    const { data, error } = await sb()
      .from(TABLE)
      .update({ state, version: expectedVersion + 1, updated_at: new Date().toISOString() })
      .eq("code", code)
      .eq("version", expectedVersion)
      .select("version");
    if (error) throw new Error(`Database error: ${error.message}`);
    return (data?.length ?? 0) > 0;
  },
};

export const usingDatabase = !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY));
export const store: Store = usingDatabase ? supabaseStore : memoryStore;

/** Load, mutate, save — retrying on concurrent writes. */
export async function mutate<T>(code: string, fn: (s: GameState) => T): Promise<{ state: GameState; result: T }> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const row = await store.get(code);
    if (!row) throw new NotFound();
    const result = fn(row.state); // may throw MoveError
    if (await store.update(code, row.state, row.version)) return { state: row.state, result };
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 40));
  }
  throw new Error("The table is busy — please try again");
}

export class NotFound extends Error {
  constructor() {
    super("Room not found. It may have expired.");
  }
}
