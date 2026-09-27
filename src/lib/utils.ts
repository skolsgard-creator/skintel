import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Slår ihop klassnamn och låter den sista Tailwind-klassen vinna vid
// konflikt ("p-4" + "p-2" blir "p-2"). Samma hjälpare som shadcn/ui
// förutsätter under aliaset @/lib/utils.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
