// Steg 3.3: hela Ny kontroll-flödet i headless Chromium med en falsk kamera
// (y4m-fil från scripts/falsk-kamera.py) och Supabase fejkat vid
// nätverksgränsen -- ingen databas, ingen riktig kamera. Kör dev-servern
// först (`bun run dev`), sedan:
//
//   python3 scripts/falsk-kamera.py prov/     # en gång: skarp, suddig, mörk
//   node scripts/prov-ny-kontroll.mjs skarp   # eller suddig / mork
//
// Skärmbilder hamnar i prov/. Kräver `bunx playwright install chromium`.
// Det skarpa provet är fortfarande telefonen mot riktiga databasen.
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const out = process.env.PROV_DIR ?? "prov";
mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:8080";
const SUPA = "https://npaktlkeqsugckubccbn.supabase.co";
const UID = "8b9ac238-bfe4-4e67-9206-b865b2440c51";
const SPOT = "4a1c3b2e-7d1f-4b0a-9c1e-2f3a4b5c6d7e";
const clip = process.argv[2] ?? "skarp";
const log = (...a) => console.log(...a);

function fakeJwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
  return {
    token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, aud: "authenticated", role: "authenticated", email: "anvandare@skintel.test", aal: "aal1", exp, iat: exp - 86400, session_id: "s1" })}.sig`,
    exp,
  };
}
const { token, exp } = fakeJwt();
const user = { id: UID, aud: "authenticated", role: "authenticated", email: "anvandare@skintel.test", app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-08-31T00:00:00Z" };
const session = { access_token: token, token_type: "bearer", expires_in: 86400, expires_at: exp, refresh_token: "r1", user };

const browser = await chromium.launch({
  // CHROMIUM_PATH pekar ut en egen Chromium när Playwrights egen inte är installerad.
  executablePath: process.env.CHROMIUM_PATH,
  args: [
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-video-capture=${out}/kamera-${clip}.y4m`,
    "--use-fake-ui-for-media-stream",
  ],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: devices["Pixel 7"].userAgent,
  permissions: ["camera"],
});
await ctx.addInitScript(
  ([key, value]) => {
    window.localStorage.setItem(key, value);
  },
  ["sb-npaktlkeqsugckubccbn-auth-token", JSON.stringify(session)],
);

// Allt som går mot Supabase fångas här.
const seen = { uploads: [], submit: null, profilePatch: null, spotInsert: null, other: [] };
await ctx.route(`${SUPA}/**`, async (route) => {
  const req = route.request();
  const u = new URL(req.url());
  const p = u.pathname;
  const m = req.method();
  const json = (body, status = 200, headers = {}) =>
    route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(body) });
  if (p === "/auth/v1/user") return json(user);
  if (p === "/auth/v1/token") return json(session);
  if (p === "/rest/v1/rpc/my_submission_entitlement") return json("organisation");
  if (p === "/rest/v1/rpc/submit_lesion_review") {
    seen.submit = req.postDataJSON();
    return json([{ outcome: "ok", review_id: "9b2d0c1e-1111-4222-8333-444444444444", due_at: "2026-09-30T13:32:00+00:00" }]);
  }
  if (p.startsWith("/rest/v1/terms_acceptances")) return json([{ user_id: UID }]);
  if (p.startsWith("/rest/v1/profiles")) {
    if (m === "PATCH") {
      seen.profilePatch = req.postDataJSON();
      return json([]);
    }
    return json([{ birth_year: 1986, birth_month: 4, skin_type: "III", figure_variant: null }]);
  }
  if (p.startsWith("/rest/v1/spots")) {
    if (m === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" });
    if (m === "POST") {
      seen.spotInsert = req.postDataJSON();
      // PostgREST svarar med ett objekt när klienten begär .single().
      const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object+json");
      return json(single ? { id: SPOT } : [{ id: SPOT }], 201);
    }
    return json([{ name: "Vänster underarm" }]);
  }
  if (p.startsWith("/storage/v1/object/skin-photos/")) {
    const path = p.replace("/storage/v1/object/skin-photos/", "");
    seen.uploads.push({ path, bytes: req.postDataBuffer()?.length ?? 0, type: req.headers()["content-type"] });
    return json({ Key: `skin-photos/${path}` });
  }
  if (p.startsWith("/rest/v1/dermatologists") || p.startsWith("/rest/v1/organization_members") || p.startsWith("/rest/v1/user_roles")) return json([]);
  seen.other.push(`${m} ${p}`);
  return json([]);
});

const page = await ctx.newPage();
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`${msg.text()} @ ${msg.location().url}:${msg.location().lineNumber}`);
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

async function step() {
  return (await page.locator("[data-slot=eyebrow]").first().textContent())?.trim();
}
async function shoot(name) {
  await page.getByRole("button", { name: "Ta bilden" }).waitFor({ state: "visible" });
  // Vänta tills mätaren gett ett omdöme.
  await page.waitForFunction(() => {
    const t = document.querySelector('[role="status"]')?.textContent ?? "";
    return /Skarp|Oskarp/.test(t) && /ljus|mörkt/.test(t);
  }, null, { timeout: 15000 });
  const ind = (await page.locator('[role="status"]').textContent()).replace(/\s+/g, " ").trim();
  await page.screenshot({ path: `${out}/e2e-kamera-${clip}-sokare-${name}.png` });
  await page.getByRole("button", { name: "Ta bilden" }).click();
  await page.waitForSelector("text=/Använd fotot|Använd ändå/", { timeout: 20000 });
  const pills = (await page.locator("[data-slot=pill]").allTextContents()).join(", ");
  const accept = await page.getByRole("button", { name: /Använd fotot|Använd ändå/ }).textContent();
  await page.screenshot({ path: `${out}/e2e-kamera-${clip}-granska-${name}.png` });
  log(`   ${name}: sökaren [${ind}] → granskning [${pills}] → "${accept.trim()}"`);
  await page.getByRole("button", { name: /Använd fotot|Använd ändå/ }).click();
}

// 1. Steg 1: plats
await page.goto(`${base}/app/ny-kontroll`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Steg 1 av 4", { timeout: 20000 });
log("1 steg:", await step(), "| Fortsätt spärrad utan kropp:", await page.getByRole("button", { name: "Fortsätt" }).isDisabled());
await page.getByRole("button", { name: "Kvinna" }).click();
await page.selectOption("#region", "underarm");
await page.getByRole("button", { name: "Vänster", exact: true }).click();
const visa = page.getByRole("button", { name: /^Visa / });
await visa.waitFor();
await page.waitForFunction(() => !document.querySelector('button[disabled]')?.textContent?.startsWith("Visa"), null, { timeout: 30000 });
await visa.click();
await page.waitForSelector("text=Vänster underarm", { timeout: 10000 });
await page.screenshot({ path: `${out}/e2e-kamera-${clip}-plats.png` });
log("   kropp sparad på profilen:", JSON.stringify(seen.profilePatch), "| vald plats:", await page.locator("section[aria-label='Vald plats'] p.font-medium").textContent());
await page.getByRole("button", { name: "Fortsätt" }).click();

// 2. Steg 2: guide, tre foton (tredje hoppas över)
await page.waitForSelector("text=Innan du fotograferar");
log("2 steg:", await step(), "| guide:", (await page.locator("ol li p.font-medium").allTextContents()).join(" / "));
await page.screenshot({ path: `${out}/e2e-kamera-${clip}-guide.png` });
await page.getByRole("button", { name: "Öppna kameran" }).click();
await shoot("oversikt");
await shoot("narbild");
if (clip === "skarp") {
  // Tredje fotot ur galleriet: samma mätning på en färdig fil (2560 px, skalas till 1600).
  await page.getByRole("button", { name: "Ta bilden" }).waitFor({ state: "visible" });
  const galleri = page.locator('input[type=file]:not([capture])');
  await galleri.setInputFiles(`${out}/galleri-skarp.jpg`);
  await page.waitForSelector("text=/Använd fotot|Använd ändå/", { timeout: 20000 });
  const pills = (await page.locator("[data-slot=pill]").allTextContents()).join(", ");
  log(`   skala ur galleriet: granskning [${pills}]`);
  await page.getByRole("button", { name: /Använd fotot|Använd ändå/ }).click();
} else {
  await page.getByRole("button", { name: "Hoppa över" }).click();
}
await page.waitForSelector("text=Närbilden behövs");
const rows = await page.locator("ul li").allTextContents();
log("   listan:", rows.map((r) => r.replace(/\s+/g, " ").trim()).join(" | "));
await page.screenshot({ path: `${out}/e2e-kamera-${clip}-foton.png` });

// 2b. Utkastet överlever en omladdning
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("text=Fortsätter där du var", { timeout: 20000 });
const rowsAfter = await page.locator("ul li").count();
log("   efter omladdning:", await step(), "| foton i listan:", rowsAfter, "| miniatyrer:", await page.locator("ul li img").count());
await page.getByRole("button", { name: /^Fortsätt/ }).click();

// 3. Steg 3: frågorna
await page.waitForSelector("text=Om fläcken");
log("3 steg:", await step(), "| Fortsätt spärrad före svar:", await page.getByRole("button", { name: "Fortsätt" }).isDisabled());
await page.getByRole("button", { name: "Mer än ett år" }).click();
const q = page.locator("fieldset");
await q.nth(1).getByRole("button", { name: "Ja", exact: true }).click();
await page.getByLabel("Hur har den förändrats?").fill("Blivit större");
await q.nth(2).getByRole("button", { name: "Nej", exact: true }).click();
await q.nth(5).getByRole("button", { name: "Vet ej", exact: true }).click();
await page.getByLabel(/Något mer läkaren bör veta/).fill("Sitter där klockarmbandet skaver.");
await page.screenshot({ path: `${out}/e2e-kamera-${clip}-fragor.png`, fullPage: true });
await page.getByRole("button", { name: "Fortsätt" }).click();

// 4. Steg 4: skicka
await page.waitForSelector("text=Skicka till hudläkare");
const summary = (await page.locator("section[aria-label=Sammanfattning]").textContent()).replace(/\s+/g, " ").trim();
log("4 steg:", await step(), "| sammanfattning:", summary.slice(0, 220), "…");
await page.screenshot({ path: `${out}/e2e-kamera-${clip}-skicka.png`, fullPage: true });
await page.getByRole("button", { name: "Skicka", exact: true }).click();
await page.waitForSelector("text=En hudläkare tittar på dina foton.", { timeout: 20000 });
log("5 kvitto:", (await page.locator("[data-slot=lede]").textContent()).trim());
await page.screenshot({ path: `${out}/e2e-kamera-${clip}-kvitto.png` });

// Vad som faktiskt gick över nätet
log("   fläck:", JSON.stringify(seen.spotInsert));
log("   uppladdningar:", seen.uploads.map((u) => `${u.path.slice(0, 8)}…${u.path.slice(-4)} ${u.bytes} B ${u.type}`).join(" | "));
log("   inskick:", JSON.stringify(seen.submit));
const draftLeft = await page.evaluate(async () => {
  const mod = await import("/src/kamera/utkast.ts");
  return await mod.loadDraft();
});
log("   utkast kvar efter kvittot:", draftLeft === null ? "nej" : "JA (fel)");
log("   övriga anrop:", seen.other.join(", ") || "inga");
log("konsolfel:", errors.length ? errors : "inga");
await browser.close();
