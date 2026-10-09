// Browser-side helpers: remember which seat this browser holds in each room.
export interface Seat {
  token: string;
  playerId: string;
}

const key = (code: string) => `usurper:seat:${code.toUpperCase()}`;

export function loadSeat(code: string): Seat | null {
  try {
    const raw = localStorage.getItem(key(code));
    return raw ? (JSON.parse(raw) as Seat) : null;
  } catch {
    return null;
  }
}

export function saveSeat(code: string, seat: Seat) {
  try {
    localStorage.setItem(key(code), JSON.stringify(seat));
  } catch {}
}

export function clearSeat(code: string) {
  try {
    localStorage.removeItem(key(code));
  } catch {}
}
