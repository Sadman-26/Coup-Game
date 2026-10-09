import { applyMove, Move, tick, viewFor } from "@/lib/engine";
import { mutate } from "@/lib/store";
import { Forbidden, fail, normCode, ok, tokenFrom } from "@/lib/api";

export const dynamic = "force-dynamic";

// Make a move. Header: x-player-token. Body: { move }
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const code = normCode((await params).code);
    const token = tokenFrom(req);
    const body = (await req.json().catch(() => ({}))) as { move?: Move };
    if (!body.move || typeof body.move !== "object") throw new Error("Missing move");
    const now = Date.now();
    const { state, result: playerId } = await mutate(code, (s) => {
      const me = s.players.find((p) => p.token === token);
      if (!me) throw new Forbidden();
      tick(s, now); // apply any expired timer before judging the move
      applyMove(s, me.id, body.move!, now);
      return me.id;
    });
    return ok({ view: viewFor(state, playerId, now) });
  } catch (e) {
    return fail(e);
  }
}
