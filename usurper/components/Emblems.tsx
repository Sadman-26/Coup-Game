import type { Role } from "@/lib/engine";

// Original line-art emblems for each role.
export function Emblem({ role, size = 40 }: { role: Role; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 48 48",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (role) {
    case "duke":
      return (
        <svg {...common}>
          <path d="M8 34 V15 l8 8 8-12 8 12 8-8 V34 Z" />
          <path d="M8 39 H40" />
          <circle cx="24" cy="9" r="1.8" fill="currentColor" />
          <circle cx="8" cy="13" r="1.6" fill="currentColor" />
          <circle cx="40" cy="13" r="1.6" fill="currentColor" />
          <path d="M18 30 h12" opacity=".6" />
        </svg>
      );
    case "assassin":
      return (
        <svg {...common}>
          <path d="M24 4 L28.5 27 H19.5 Z" />
          <path d="M24 9 V23" opacity=".5" />
          <path d="M13 28 H35" />
          <path d="M24 29 V39" />
          <circle cx="24" cy="42" r="2.4" />
        </svg>
      );
    case "captain":
      return (
        <svg {...common}>
          <circle cx="24" cy="8.5" r="3.5" />
          <path d="M24 12 V42" />
          <path d="M16 19 H32" />
          <path d="M8 30 c2 8 9 12 16 12 s14-4 16-12" />
          <path d="M5 33 L8 29 L11.5 32" />
          <path d="M36.5 32 L40 29 L43 33" />
        </svg>
      );
    case "ambassador":
      return (
        <svg {...common}>
          <path d="M14 8 H35 a4 4 0 0 1 0 8 H33 V36 a4 4 0 0 1 -4 4 H12 a4 4 0 0 1 0 -8 H14 Z" />
          <path d="M14 32 V8" opacity=".5" />
          <path d="M19 19 H28" />
          <path d="M19 24.5 H28" />
          <circle cx="23.5" cy="31" r="2.4" fill="currentColor" />
        </svg>
      );
    case "contessa":
      return (
        <svg {...common}>
          <path d="M24 40 L6 22 A25.5 25.5 0 0 1 42 22 Z" />
          <path d="M24 40 L11 18" />
          <path d="M24 40 L24 14.5" />
          <path d="M24 40 L37 18" />
          <circle cx="24" cy="40" r="2" fill="currentColor" />
        </svg>
      );
  }
}

export function Coin({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden className="coin-icon">
      <circle cx="10" cy="10" r="8.5" fill="var(--brass)" />
      <circle cx="10" cy="10" r="5.6" fill="none" stroke="var(--brass-deep)" strokeWidth="1.4" />
    </svg>
  );
}
