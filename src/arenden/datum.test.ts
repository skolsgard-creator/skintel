import { describe, expect, test } from "vitest";
import { calendarDaysBetween, dateLong, dateWithWeekday, dateWithYear, shortDate, timeOfDay } from "./datum";

// Allt räknas i svensk tid, oavsett var telefonen eller testet körs.
// September–oktober 2026 är sommartid (UTC+2) till 25 oktober.

describe("datum i svensk tid", () => {
  test("klockslag", () => {
    expect(timeOfDay("2026-10-06T16:55:52Z")).toBe("18:55");
    expect(timeOfDay("2026-12-01T07:05:00Z")).toBe("08:05");
  });

  test("veckodag och datum", () => {
    expect(dateWithWeekday("2026-10-06T16:55:52Z")).toBe("tisdag 6 oktober");
  });

  test("datum utan och med år", () => {
    expect(dateLong("2026-11-24T10:00:00Z")).toBe("24 november");
    expect(dateWithYear("2026-09-30T13:32:00Z")).toBe("30 september 2026");
  });

  test("kort datum för listan", () => {
    expect(shortDate("2026-10-06T16:55:52Z")).toBe("tis 6 okt");
  });

  test("midnatt är svensk midnatt, inte UTC:s", () => {
    // 23:30 UTC den 29:e är 01:30 den 30:e i Sverige.
    expect(dateLong("2026-09-29T23:30:00Z")).toBe("30 september");
  });

  test("kalenderdagar mellan två tidpunkter", () => {
    const now = "2026-09-29T10:00:00Z";
    expect(calendarDaysBetween(now, "2026-09-29T21:00:00Z")).toBe(0);
    expect(calendarDaysBetween(now, "2026-09-29T22:30:00Z")).toBe(1); // 00:30 svensk tid
    expect(calendarDaysBetween(now, "2026-10-06T16:55:52Z")).toBe(7);
  });
});
