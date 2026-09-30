import { describe, expect, it } from "vitest";
import { closeUpPaths, createUrlCache, type ImageRow } from "./narbild";

const row = (caseId: string, kind: string, position: number): ImageRow => ({
  lesion_review_id: caseId,
  kind,
  position,
  storage_path: `u/${caseId}-${kind}.jpg`,
});

describe("closeUpPaths -- vilket foto en rad visar", () => {
  it("tar närbilden, och annars ärendets första foto", () => {
    const paths = closeUpPaths([
      row("a", "oversikt", 1),
      row("a", "narbild", 2),
      row("a", "skala", 3),
      row("b", "skala", 2),
      row("b", "oversikt", 1),
    ]);
    expect(Object.fromEntries(paths)).toEqual({ a: "u/a-narbild.jpg", b: "u/b-oversikt.jpg" });
  });

  it("ger ingenting för ärenden utan foton", () => {
    expect(closeUpPaths([]).size).toBe(0);
  });
});

describe("createUrlCache -- länkar som lever under besöket", () => {
  function fakeSigner() {
    const calls: string[][] = [];
    const signer = async (paths: string[]) => {
      calls.push([...paths]);
      return new Map(paths.map((p) => [p, `https://lank/${p}?t=${calls.length}`]));
    };
    return { calls, signer };
  }

  it("signerar bara det som saknas, och ger samma länk igen inom giltighetstiden", async () => {
    const { calls, signer } = fakeSigner();
    const cache = createUrlCache(signer, 3600);
    const first = await cache.urls(["x.jpg", "y.jpg"], 0);
    const second = await cache.urls(["x.jpg", "z.jpg"], 60_000);
    expect(calls).toEqual([["x.jpg", "y.jpg"], ["z.jpg"]]);
    // Samma länk för x: webbläsarens cache träffar i stället för att hämta om.
    expect(second.get("x.jpg")).toBe(first.get("x.jpg"));
    expect(second.get("z.jpg")).toBe("https://lank/z.jpg?t=2");
  });

  it("signerar om en länk som snart går ut", async () => {
    const { calls, signer } = fakeSigner();
    const cache = createUrlCache(signer, 3600);
    await cache.urls(["x.jpg"], 0);
    // Fem minuter före utgången räknas länken som gammal.
    await cache.urls(["x.jpg"], (3600 - 299) * 1000);
    expect(calls).toEqual([["x.jpg"], ["x.jpg"]]);
  });

  it("glömmer länkarna vid utloggning", async () => {
    const { calls, signer } = fakeSigner();
    const cache = createUrlCache(signer, 3600);
    await cache.urls(["x.jpg"], 0);
    cache.clear();
    await cache.urls(["x.jpg"], 1000);
    expect(calls).toEqual([["x.jpg"], ["x.jpg"]]);
  });

  it("ger det den har när signeringen misslyckas, så att raden visar sin reserv", async () => {
    let fail = false;
    const cache = createUrlCache(async (paths) => {
      if (fail) throw new Error("nät");
      return new Map(paths.map((p) => [p, `https://lank/${p}`]));
    }, 3600);
    await cache.urls(["x.jpg"], 0);
    fail = true;
    const result = await cache.urls(["x.jpg", "y.jpg"], 1000);
    expect(Object.fromEntries(result)).toEqual({ "x.jpg": "https://lank/x.jpg" });
  });
});
