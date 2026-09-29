import { calendarDaysBetween, dateWithWeekday, shortDate, timeOfDay } from "./datum";

// Klockan: svarslöftet (lesion_reviews.response_due_at) i ord. Löftet räknas
// en gång vid inskicket och rörs aldrig av en återlämning (20260905120000),
// så det här är samma tid som kvittot och mejlet visade. Passerar tiden står
// det lugnt att svaret dröjer -- aldrig en negativ tid, aldrig en larmfärg.

export function dueLine(dueIso: string, now: Date = new Date()): string {
  if (new Date(dueIso).getTime() <= now.getTime()) {
    return "Svaret dröjer. Du får det så snart en hudläkare har bedömt dina foton.";
  }
  const days = calendarDaysBetween(now, dueIso);
  const time = timeOfDay(dueIso);
  if (days === 0) return `Svar senast i dag kl. ${time}`;
  if (days === 1) return `Svar senast i morgon kl. ${time}`;
  return `Svar senast ${dateWithWeekday(dueIso)} kl. ${time} · om ${days} dagar`;
}

/** Den korta formen i ärendelistan. */
export function dueShort(dueIso: string, now: Date = new Date()): string {
  if (new Date(dueIso).getTime() <= now.getTime()) return "svaret dröjer";
  const days = calendarDaysBetween(now, dueIso);
  if (days === 0) return `svar i dag ${timeOfDay(dueIso)}`;
  if (days === 1) return "svar i morgon";
  return `svar senast ${shortDate(dueIso)}`;
}
