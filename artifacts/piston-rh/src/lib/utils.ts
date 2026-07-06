import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Alert status values (OK/Warning/Due/Overdue) are computed the same way everywhere,
 * but displayed with different wording depending on what's being described:
 * - "overhaul": the Unit (cylinder), or the main Fuel/Exhaust Valve component itself.
 * - "life": an individual component's own expected life (Piston Crown/Skirt, Fuel
 *   Nozzle, Spring, etc.).
 */
export function getStatusLabel(status: string, level: "overhaul" | "life"): string {
  if (status === "Due") return "Approaching";
  if (status === "Overdue") return level === "overhaul" ? "Overhaul Due" : "Life Exceeded";
  return status;
}
