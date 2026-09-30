// Datum och klockslag i svensk tid, alltid. Svarslöftet och uppföljningen är
// givna i svensk tid; en patient på resa ska se samma "senast tisdag 18:55"
// som vi lovade. Namnen står här i stället för att hämtas ur Intl: då blir
// texten densamma i varje webbläsare (och i testerna), och "okt" får ingen
// punkt som CLDR ibland ger.

const ZONE = "Europe/Stockholm";

const WEEKDAYS = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];
const WEEKDAYS_SHORT = ["sön", "mån", "tis", "ons", "tors", "fre", "lör"];
const MONTHS = [
  "januari",
  "februari",
  "mars",
  "april",
  "maj",
  "juni",
  "juli",
  "augusti",
  "september",
  "oktober",
  "november",
  "december",
];
const MONTHS_SHORT = ["jan", "feb", "mars", "apr", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"];

type Parts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Tidpunktens delar i svensk tid. */
export function swedishParts(iso: string | Date): Parts {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const get = (type: string) => Number(formatter.formatToParts(date).find((p) => p.type === type)?.value ?? 0);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return {
    year,
    month,
    day,
    hour: get("hour"),
    minute: get("minute"),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "18:55" */
export function timeOfDay(iso: string | Date): string {
  const p = swedishParts(iso);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "24 november" */
export function dateLong(iso: string | Date): string {
  const p = swedishParts(iso);
  return `${p.day} ${MONTHS[p.month - 1]}`;
}

/** "30 september 2026" */
export function dateWithYear(iso: string | Date): string {
  const p = swedishParts(iso);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** "tisdag 6 oktober" */
export function dateWithWeekday(iso: string | Date): string {
  const p = swedishParts(iso);
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]}`;
}

/** "tis 6 okt" */
export function shortDate(iso: string | Date): string {
  const p = swedishParts(iso);
  return `${WEEKDAYS_SHORT[p.weekday]} ${p.day} ${MONTHS_SHORT[p.month - 1]}`;
}

/** Antal svenska kalenderdagar från `from` till `to` (0 = samma dag). */
export function calendarDaysBetween(from: string | Date, to: string | Date): number {
  const a = swedishParts(from);
  const b = swedishParts(to);
  const dayA = Date.UTC(a.year, a.month - 1, a.day);
  const dayB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((dayB - dayA) / 86_400_000);
}

/** Året i svensk tid. */
export function yearOf(iso: string | Date): number {
  return swedishParts(iso).year;
}

/** "april" för 4. */
export function monthName(month: number): string {
  return MONTHS[month - 1] ?? "";
}
