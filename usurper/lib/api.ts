import { NextResponse } from "next/server";
import { MoveError } from "./engine";
import { NotFound } from "./store";

export function ok(data: unknown) {
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export function fail(e: unknown) {
  if (e instanceof MoveError) return NextResponse.json({ error: e.message }, { status: 400 });
  if (e instanceof NotFound) return NextResponse.json({ error: e.message, notFound: true }, { status: 404 });
  if (e instanceof Forbidden) return NextResponse.json({ error: e.message, needJoin: true }, { status: 403 });
  console.error(e);
  return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
}

export class Forbidden extends Error {
  constructor() {
    super("You're not seated at this table");
  }
}

export function normCode(raw: string): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

const CODE_CHARS = "BCDFGHJKLMNPQRSTVWXZ";
export function newCode(len = 4): string {
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => CODE_CHARS[n % CODE_CHARS.length]).join("");
}

export function tokenFrom(req: Request): string {
  return req.headers.get("x-player-token") ?? "";
}
