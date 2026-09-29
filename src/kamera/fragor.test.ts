import { describe, expect, test } from "vitest";
import { answerLabel, DURATION_OPTIONS, TRI_OPTIONS } from "./fragor";

describe("answerLabel", () => {
  test("svaret i ord", () => {
    expect(answerLabel(TRI_OPTIONS, "vet_ej")).toBe("Vet ej");
    expect(answerLabel(DURATION_OPTIONS, "over_ett_ar")).toBe("Mer än ett år");
  });

  test("tom fråga är obesvarad, inte ett nej", () => {
    expect(answerLabel(TRI_OPTIONS, null)).toBe("Inte besvarat");
  });

  test("ett värde från en äldre uppsättning visas inte som ett svar det inte var", () => {
    expect(answerLabel(TRI_OPTIONS, "osaker")).toBe("Inte besvarat");
  });
});
