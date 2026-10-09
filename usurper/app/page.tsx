"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ROLES } from "@/lib/engine";
import { RoleCard } from "@/components/RoleCard";
import { RulesSheet } from "@/components/RulesSheet";
import { saveSeat } from "@/lib/client";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);

  useEffect(() => {
    try {
      setName(localStorage.getItem("usurper:name") ?? "");
    } catch {}
  }, []);

  function rememberName() {
    try {
      localStorage.setItem("usurper:name", name.trim());
    } catch {}
  }

  async function create() {
    setError("");
    if (!name.trim()) return setError("Enter your name first.");
    setBusy("create");
    rememberName();
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't create a room");
      saveSeat(data.code, { token: data.token, playerId: data.playerId });
      router.push(`/room/${data.code}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  function join() {
    setError("");
    const c = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (c.length < 4) return setError("Room codes are 4–5 letters.");
    if (name.trim()) rememberName();
    setBusy("join");
    router.push(`/room/${c}`);
  }

  return (
    <main className="home">
      <section className="hero">
        <p className="eyebrow">A game of bluffs for 2–6 players</p>
        <h1 className="wordmark">Usurper</h1>
        <p className="lede">
          Two hidden cards. A handful of coins. Claim any role you like — and hope nobody calls your bluff.
        </p>

        <div className="hero-cards" aria-hidden>
          {ROLES.map((r, i) => (
            <div key={r} className="fan-card" style={{ ["--i" as string]: i - 2 }}>
              <RoleCard role={r} size="md" />
            </div>
          ))}
        </div>
      </section>

      <section className="entry panel">
        <label className="field">
          <span>Your name</span>
          <input
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sion"
            autoComplete="nickname"
          />
        </label>

        <button className="btn btn-primary btn-block" onClick={create} disabled={!!busy}>
          {busy === "create" ? "Opening a room…" : "Create a room"}
        </button>

        <div className="divider"><span>or join a friend</span></div>

        <form
          className="join-row"
          onSubmit={(e) => {
            e.preventDefault();
            join();
          }}
        >
          <input
            className="code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            maxLength={6}
            aria-label="Room code"
            autoCapitalize="characters"
          />
          <button className="btn" type="submit" disabled={!!busy}>
            Join
          </button>
        </form>

        {error && <p className="error-text" role="alert">{error}</p>}

        <button className="link-btn" onClick={() => setRulesOpen(true)}>
          How to play
        </button>
      </section>

      <footer className="site-footer">
        An unofficial, fan-made way to play the rules of <em>Coup</em> online. If you enjoy it, buy the physical game.
      </footer>

      <RulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </main>
  );
}
