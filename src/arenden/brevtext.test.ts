import { describe, expect, test } from "vitest";
import { caseLine, followupSentence, letterDate, outcomeSentence, paragraphs, showsWayForward } from "./brevtext";

describe("paragraphs -- läkarens text, ordagrant", () => {
  test("stycken delas på tomrader; radbrytningar inom ett stycke står kvar", () => {
    expect(paragraphs("Hej,\n\nFörsta stycket\nfortsätter.\n\n\nAndra.")).toEqual(["Hej,", "Första stycket\nfortsätter.", "Andra."]);
  });

  test("windows-radbrytningar och blanksteg runt om", () => {
    expect(paragraphs("  Hej,\r\n\r\n  Text.  \r\n")).toEqual(["Hej,", "Text."]);
  });

  test("tom eller saknad text ger inga stycken", () => {
    expect(paragraphs("")).toEqual([]);
    expect(paragraphs("  \n\n ")).toEqual([]);
    expect(paragraphs(null)).toEqual([]);
  });
});

describe("outcomeSentence -- utfallet på egen rad", () => {
  test("i läkarens röst", () => {
    expect(outcomeSentence("lag")).toBe("Min bedömning: låg risk.");
    expect(outcomeSentence("mattlig")).toBe("Min bedömning: måttlig risk.");
    expect(outcomeSentence("forhojd")).toBe("Min bedömning: förhöjd risk.");
    expect(outcomeSentence("needs_in_person")).toBe("Min bedömning: fläcken bör undersökas på plats.");
  });

  test("utan utfall ingen rad", () => {
    expect(outcomeSentence(null)).toBeNull();
  });
});

describe("followupSentence -- läkarens uppföljningstid för just det här ärendet", () => {
  const reviewed = "2026-09-30T09:02:00Z";

  test("veckor och datum", () => {
    expect(followupSentence(8, "2026-11-25T09:02:00Z", reviewed)).toBe(
      "Ta ett nytt foto av fläcken om 8 veckor, omkring 25 november.",
    );
    expect(followupSentence(1, "2026-10-07T09:02:00Z", reviewed)).toBe(
      "Ta ett nytt foto av fläcken om 1 vecka, omkring 7 oktober.",
    );
  });

  test("uppföljning ett annat år skriver ut året", () => {
    expect(followupSentence(16, "2027-01-20T10:02:00Z", reviewed)).toBe(
      "Ta ett nytt foto av fläcken om 16 veckor, omkring 20 januari 2027.",
    );
  });

  test("noll veckor: aktivt valt, sägs i klartext", () => {
    expect(followupSentence(0, null, reviewed)).toBe("Ingen uppföljning behövs för den här fläcken.");
  });

  test("inte satt (ärenden före 28 september): ingen rad alls", () => {
    expect(followupSentence(null, null, reviewed)).toBeNull();
  });
});

describe("brevhuvudet", () => {
  test("datum med år", () => {
    expect(letterDate("2026-09-30T09:02:00Z")).toBe("30 september 2026");
  });

  test("fläcken och antalet foton", () => {
    expect(caseLine("Vänster underarm", 3)).toBe("Vänster underarm · 3 foton");
    expect(caseLine("Mage", 1)).toBe("Mage · 1 foto");
  });
});

describe("Så går du vidare", () => {
  test("visas vid förhöjd risk och bör undersökas på plats, inte annars", () => {
    expect(showsWayForward("forhojd")).toBe(true);
    expect(showsWayForward("needs_in_person")).toBe(true);
    expect(showsWayForward("lag")).toBe(false);
    expect(showsWayForward("mattlig")).toBe(false);
    expect(showsWayForward(null)).toBe(false);
  });
});
