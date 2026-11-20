import type { ReactNode } from "react";
import type { Tone } from "@/lib/status-tone";

/** Status pill. Tones come from src/lib/status-tone.ts so a state looks the same everywhere. */
export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`badge tone-${tone}${className ? ` ${className}` : ""}`}>{children}</span>;
}
