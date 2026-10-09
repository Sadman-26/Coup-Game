import { joinGame, viewFor } from "@/lib/engine";
import { mutate } from "@/lib/store";
import { fail, normCode, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

// Take a seat. Body: { name }
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const code = normCode((await params).code);
    const body = await req.json().catch(() => ({}));
    const { state, result } = await mutate(code, (s) => joinGame(s, body.name));
    return ok({ code, token: result.token, playerId: result.playerId, view: viewFor(state, result.playerId) });
  } catch (e) {
    return fail(e);
  }
}
