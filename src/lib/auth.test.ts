import { describe, expect, it } from "vitest";
import { isRateLimited, normalizeEmail, outcomeFromError, RATE_LIMITED } from "./auth-outcome";

describe("outcomeFromError", () => {
  it("inget fel är ok", () => {
    expect(outcomeFromError(null, "x")).toEqual({ ok: true });
  });

  it("rate limiting är det enda felet som får synas som sig självt", () => {
    expect(outcomeFromError({ status: 429 }, "x")).toEqual({ ok: false, message: RATE_LIMITED });
    expect(outcomeFromError({ code: "over_request_rate_limit" }, "x")).toEqual({
      ok: false,
      message: RATE_LIMITED,
    });
  });

  it("alla andra fel blir det generiska beskedet -- aldrig Supabase egen text", () => {
    expect(outcomeFromError({ code: "invalid_credentials" }, "Generiskt")).toEqual({
      ok: false,
      message: "Generiskt",
    });
    expect(outcomeFromError({ code: "email_not_confirmed" }, "Generiskt")).toEqual({
      ok: false,
      message: "Generiskt",
    });
  });

  it("otp_disabled (adressen saknar konto) svaras ok när anroparen ber om det", () => {
    expect(outcomeFromError({ code: "otp_disabled" }, "x", ["otp_disabled"])).toEqual({
      ok: true,
    });
    // ... men bara då.
    expect(outcomeFromError({ code: "otp_disabled" }, "x")).toEqual({ ok: false, message: "x" });
  });
});

describe("isRateLimited", () => {
  it("känner igen både status och kod", () => {
    expect(isRateLimited({ status: 429 })).toBe(true);
    expect(isRateLimited({ code: "over_request_rate_limit" })).toBe(true);
    expect(isRateLimited({ status: 400, code: "otp_disabled" })).toBe(false);
    expect(isRateLimited(null)).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("trimmar och gör gemener, så att inbjudans adress matchar oavsett hur den skrevs", () => {
    expect(normalizeEmail("  Anna.Svensson@Foretag.SE ")).toBe("anna.svensson@foretag.se");
  });
});
