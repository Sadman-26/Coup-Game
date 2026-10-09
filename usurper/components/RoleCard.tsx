import type { Role } from "@/lib/engine";
import { ROLE_NAMES } from "@/lib/engine";
import { Emblem } from "./Emblems";

export const ROLE_BLURB: Record<Role, string> = {
  duke: "Tax: take 3 coins. Blocks Foreign Aid.",
  assassin: "Pay 3 coins to force a player to lose a card.",
  captain: "Steal 2 coins. Blocks stealing.",
  ambassador: "Swap cards with the court. Blocks stealing.",
  contessa: "Blocks assassination.",
};

interface Props {
  role: Role | null;
  revealed?: boolean;
  size?: "sm" | "md" | "lg";
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
  showBlurb?: boolean;
  label?: string;
}

export function RoleCard({ role, revealed, size = "md", selectable, selected, onClick, showBlurb, label }: Props) {
  const cls = [
    "card",
    `card-${size}`,
    role ? `role-${role}` : "card-back",
    revealed ? "card-dead" : "",
    selectable ? "card-selectable" : "",
    selected ? "card-selected" : "",
  ].join(" ");

  const inner = role ? (
    <>
      <span className="card-emblem">
        <Emblem role={role} size={size === "sm" ? 22 : size === "lg" ? 52 : 38} />
      </span>
      <span className="card-name">{ROLE_NAMES[role]}</span>
      {showBlurb && size !== "sm" && <span className="card-blurb">{ROLE_BLURB[role]}</span>}
      {revealed && <span className="card-fallen">Lost</span>}
    </>
  ) : (
    <span className="card-back-mark" aria-label="Hidden card" />
  );

  if (selectable) {
    return (
      <button type="button" className={cls} onClick={onClick} aria-pressed={selected} aria-label={label ?? (role ? ROLE_NAMES[role] : "card")}>
        {inner}
      </button>
    );
  }
  return (
    <div className={cls} aria-label={label ?? (role ? `${ROLE_NAMES[role]}${revealed ? " (lost)" : ""}` : "Hidden card")}>
      {inner}
    </div>
  );
}
