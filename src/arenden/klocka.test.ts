import { describe, expect, test } from "vitest";
import { dueLine, dueShort } from "./klocka";

// Tisdag 29 september 2026, 12:00 svensk tid.
const now = new Date("2026-09-29T10:00:00Z");

describe("dueLine -- klockan i ärendet", () => {
  test("samma dag: i dag med klockslag", () => {
    expect(dueLine("2026-09-29T14:55:00Z", now)).toBe("Svar senast i dag kl. 16:55");
  });

  test("nästa dag: i morgon", () => {
    expect(dueLine("2026-09-30T08:00:00Z", now)).toBe("Svar senast i morgon kl. 10:00");
  });

  test("längre fram: veckodag, datum och hur många dagar", () => {
    expect(dueLine("2026-10-06T16:55:52Z", now)).toBe("Svar senast tisdag 6 oktober kl. 18:55 · om 7 dagar");
  });

  test("dagsgränsen går vid svensk midnatt", () => {
    const late = new Date("2026-09-29T21:30:00Z"); // 23:30 svensk tid
    expect(dueLine("2026-09-29T22:30:00Z", late)).toBe("Svar senast i morgon kl. 00:30");
  });

  test("passerad tid: svaret dröjer, aldrig en negativ tid", () => {
    const line = dueLine("2026-09-28T10:00:00Z", now);
    expect(line).toMatch(/^Svaret dröjer/);
    expect(line).not.toMatch(/-\d|sedan/);
  });
});

describe("dueShort -- klockan i listan", () => {
  test("i dag, i morgon, datum, försenat", () => {
    expect(dueShort("2026-09-29T14:55:00Z", now)).toBe("svar i dag 16:55");
    expect(dueShort("2026-09-30T08:00:00Z", now)).toBe("svar i morgon");
    expect(dueShort("2026-10-06T16:55:52Z", now)).toBe("svar senast tis 6 okt");
    expect(dueShort("2026-09-28T10:00:00Z", now)).toBe("svaret dröjer");
  });
});
