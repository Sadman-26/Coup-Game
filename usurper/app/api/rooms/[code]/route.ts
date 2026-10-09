import { tick, viewFor } from "@/lib/engine";
import { NotFound, store } from "@/lib/store";
import { Forbidden, fail, normCode, ok, tokenFrom } from "@/lib/api";

export const dynamic = "force-dynamic";

// Poll the table. Header: x-player-token. Also enforces the response timer.
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const code = normCode((await params).code);
    const token = tokenFrom(req);
    for (let attempt = 0; attempt < 4; attempt++) {
      const row = await store.get(code);
      if (!row) throw new NotFound();
      const me = row.state.players.find((p) => p.token === token);
      if (!me) {
        return ok({
          seated: false,
          code,
          phase: row.state.phase,
          players: row.state.players.map((p) => p.name),
        });
      }
      const now = Date.now();
      if (tick(row.state, now)) {
        // Timer expired: persist the auto-passes. If someone beat us to it, just re-read.
        if (!(await store.update(code, row.state, row.version))) continue;
      }
      return ok({ seated: true, view: viewFor(row.state, me.id, now) });
    }
    throw new Forbidden();
  } catch (e) {
    return fail(e);
  }
}
