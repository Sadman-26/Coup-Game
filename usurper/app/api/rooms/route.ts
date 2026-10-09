import { createGame } from "@/lib/engine";
import { store } from "@/lib/store";
import { fail, newCode, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

// Create a room. Body: { name }
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = newCode(attempt < 6 ? 4 : 5);
      const { state, token, playerId } = createGame(code, body.name);
      if (await store.create(code, state)) return ok({ code, token, playerId });
    }
    throw new Error("Couldn't allocate a room code, please retry");
  } catch (e) {
    return fail(e);
  }
}
