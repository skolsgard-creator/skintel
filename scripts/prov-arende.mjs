// Steg 3.4: ärendesidorna och brevet i headless Chromium, med Supabase
// fejkat vid nätverksgränsen -- en liten PostgREST som förstår eq/neq/order/
// limit och vägrar allt som efterfrågar "*" eller en ai_-kolumn. Kör
// dev-servern först (`bun run dev`), sedan:
//
//   node scripts/prov-arende.mjs
//
// Skärmbilder i prov/ (PROV_DIR). CHROMIUM_PATH pekar ut en egen Chromium
// när Playwrights egen inte är installerad. Det skarpa provet är telefonen
// mot riktiga databasen, med scripts/besvara-testarende.sql.
import { chromium, devices } from "playwright";
import { mkdirSync, readFileSync, existsSync } from "node:fs";

const out = process.env.PROV_DIR ?? "prov";
mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:8080";
const SUPA = "https://npaktlkeqsugckubccbn.supabase.co";
const UID = "8b9ac238-bfe4-4e67-9206-b865b2440c51";
const log = (...a) => console.log(...a);
const fails = [];
const expect = (ok, what) => {
  if (!ok) fails.push(what);
  log(`   ${ok ? "ok " : "FEL"} ${what}`);
};

// ---------------------------------------------------------------------------
// Data: sju fläckar i alla lägen, tider relativt nu.
// ---------------------------------------------------------------------------
const H = 3600_000;
const D = 24 * H;
const t = (ms) => new Date(Date.now() + ms).toISOString();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const spot = (n, name) => ({ id: id(100 + n), name, user_id: UID });
const spots = [
  spot(1, "Vänster underarm"),
  spot(2, "Mage"),
  spot(3, "Rygg"),
  spot(4, "Höger kind"),
  spot(5, "Nacke"),
  spot(6, "Seed: underlag räcker inte"),
  spot(7, "Bröst"),
];
const VERDICT =
  "Hej,\n\nTack för dina bilder. Jag har tittat på alla foton och på dina svar.\n\nFläcken har en jämn kant och en färg.";
const base_ = {
  user_id: UID,
  claimed_at: null,
  reviewed_at: null,
  dermatologist_outcome: null,
  dermatologist_verdict: null,
  followup_interval_weeks: null,
  followup_due_at: null,
  retake_reasons: null,
  duration: "over_ett_ar",
  has_changed: "ja",
  change_description: "Blivit större",
  itching_burning_pain: "nej",
  bleeding_oozing: null,
  healed_and_returned: null,
  ugly_duckling: "vet_ej",
  note: "Sitter där klockarmbandet skaver.",
  // Finns i tabellen men är INTE grantade: fejken vägrar om de efterfrågas.
  ai_risk_level: "forhojd",
  ai_reasoning: "får aldrig synas",
};
const kase = (n, spotN, status, created, extra = {}) => ({
  ...base_,
  id: id(n),
  spot_id: id(100 + spotN),
  status,
  created_at: created,
  response_due_at: t(-Date.now() + Date.parse(created) + 5 * D),
  ...extra,
});
const reviewed = (n, spotN, outcome, weeks, extra = {}) =>
  kase(n, spotN, "reviewed", t(-3 * D), {
    claimed_at: t(-2 * D),
    reviewed_at: t(-2 * D + H),
    dermatologist_outcome: outcome,
    dermatologist_verdict: VERDICT,
    followup_interval_weeks: weeks,
    followup_due_at: weeks > 0 ? t(-2 * D + H + weeks * 7 * D) : null,
    ...extra,
  });
const cases = [
  kase(1, 1, "reviewed", t(-60 * D), {
    reviewed_at: t(-59 * D),
    dermatologist_outcome: "lag",
    dermatologist_verdict: "Ett äldre svar, från före uppföljningstiden.",
  }),
  kase(2, 1, "pending", t(-2 * H)),
  kase(3, 2, "in_review", t(-1 * D), { claimed_at: t(-3 * H) }),
  reviewed(4, 3, "mattlig", 0),
  reviewed(5, 4, "forhojd", 4),
  reviewed(6, 5, "needs_in_person", 0),
  kase(7, 6, "insufficient_images", t(-4 * D), { claimed_at: t(-3 * D), retake_reasons: ["oskarp", "behover_skala"] }),
  reviewed(8, 7, "lag", 8),
];
const images = cases.flatMap((c) =>
  ["oversikt", "narbild", "skala"].map((kind, i) => ({
    id: `${c.id.slice(0, -2)}${i}${i}`,
    lesion_review_id: c.id,
    user_id: UID,
    kind,
    position: i + 1,
    storage_path: `${UID}/${c.id}-${kind}.jpg`,
  })),
);
const reviewers = cases
  .filter((c) => c.status === "reviewed" || c.status === "insufficient_images")
  .map((c) => ({ lesion_review_id: c.id, name: "Ingrid Synnerstad", title: "Legitimerad läkare, specialist i hudsjukdomar" }));
const tables = { lesion_reviews: cases, spots, review_images: images, case_reviewer: reviewers };

// ---------------------------------------------------------------------------
// Fejk-PostgREST
// ---------------------------------------------------------------------------
const violations = [];
function query(table, url) {
  const rows = tables[table] ?? [];
  const select = url.searchParams.get("select") ?? "*";
  if (select === "*" || /\bai_/.test(select)) violations.push(`${table}: select=${select}`);
  let result = rows.filter((row) => {
    for (const [key, value] of url.searchParams) {
      if (["select", "order", "limit", "offset"].includes(key)) continue;
      const m = /^(eq|neq)\.(.*)$/.exec(value);
      if (!m) continue;
      const cell = String(row[key]);
      if (m[1] === "eq" && cell !== m[2]) return false;
      if (m[1] === "neq" && cell === m[2]) return false;
    }
    return true;
  });
  const order = url.searchParams.get("order");
  if (order) {
    const [col, dir] = order.split(".");
    result = [...result].sort((a, b) => (dir === "desc" ? -1 : 1) * String(a[col]).localeCompare(String(b[col])));
  }
  const limit = url.searchParams.get("limit");
  if (limit) result = result.slice(0, Number(limit));
  const cols = select.split(",").map((s) => s.trim());
  return result.map((row) => Object.fromEntries(cols.map((c) => [c, row[c] ?? null])));
}

const jpeg = existsSync(`${out}/galleri-skarp.jpg`) ? readFileSync(`${out}/galleri-skarp.jpg`) : null;

function fakeJwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 86400;
  return { token: `${b64({ alg: "HS256" })}.${b64({ sub: UID, aud: "authenticated", role: "authenticated", aal: "aal1", exp })}.sig`, exp };
}
const { token, exp } = fakeJwt();
const user = { id: UID, aud: "authenticated", role: "authenticated", email: "anvandare@skintel.test", app_metadata: {}, user_metadata: {} };
const session = { access_token: token, token_type: "bearer", expires_in: 86400, expires_at: exp, refresh_token: "r1", user };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: devices["iPhone 13"].userAgent,
});
await ctx.route(`${SUPA}/**`, async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname;
  const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (p === "/auth/v1/otp") return json({});
  if (p === "/auth/v1/verify") return json(session);
  if (p === "/auth/v1/user") return json(user);
  if (p === "/auth/v1/token") return json(session);
  if (p === "/auth/v1/factors" || p.startsWith("/auth/v1/factors")) return json({ all: [], totp: [] });
  if (p.startsWith("/rest/v1/dermatologists") || p.startsWith("/rest/v1/organization_members") || p.startsWith("/rest/v1/user_roles"))
    return json([]);
  const table = /^\/rest\/v1\/([a-z_]+)$/.exec(p)?.[1];
  if (table && tables[table]) {
    const rows = query(table, url);
    const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object+json");
    return json(single ? rows[0] ?? null : rows);
  }
  if (p === "/storage/v1/object/sign/skin-photos") {
    const body = req.postDataJSON();
    return json(body.paths.map((path) => ({ path, signedURL: `/object/sign/skin-photos/${path}?token=x`, error: null })));
  }
  if (p.startsWith("/storage/v1/object/sign/skin-photos/")) {
    if (!jpeg) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ status: 200, contentType: "image/jpeg", body: jpeg });
  }
  return json([]);
});

const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`${m.text()} @ ${m.location().url}`);
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
const path = () => new URL(page.url()).pathname + new URL(page.url()).search;
// innerText, inte textContent: <br> ska bli ett blanksteg, som det läses.
const text = async (sel) => ((await page.locator(sel).first().innerText()) ?? "").replace(/\s+/g, " ").trim();

// 1. Notislänken utloggad: /flack/<fläck> → inloggning → senaste kontrollen
log("1 notislänken, utloggad");
await page.goto(`${base}/flack/${id(107)}`, { waitUntil: "networkidle" });
expect(path().startsWith("/logga-in?till=%2Fapp%2Fflack%2F") || path().startsWith("/logga-in?till=/app/flack/"), `till inloggningen med vägen kvar (${path()})`);
await page.getByLabel("E-postadress").fill("anvandare@skintel.test");
await page.getByRole("button", { name: "Skicka kod" }).click();
await page.getByLabel("Kod från mejlet").fill("123456");
await page.getByRole("button", { name: "Logga in" }).click();
await page.waitForURL((u) => u.pathname.startsWith("/app/arende/"), { timeout: 20000 });
expect(path() === `/app/arende/${id(8)}`, `efter koden: brevet för fläckens senaste kontroll (${path()})`);
await page.waitForSelector("[data-slot=letter]");
await page.screenshot({ path: `${out}/arende-brev-lag.png`, fullPage: true });

// 2. Brevet, låg risk med uppföljning
log("2 brevet, låg risk, åtta veckor");
const letter = await text("[data-slot=letter]");
expect(letter.toLowerCase().includes("brev från din hudläkare"), "brevhuvudet"); // versaler via CSS
expect(letter.includes("Bröst · 3 foton"), "fläcken och antalet foton");
expect(letter.includes("Min bedömning: låg risk."), "utfallet på egen rad");
expect(/Ta ett nytt foto av fläcken om 8 veckor, omkring \d+ \w+\./.test(letter), "uppföljningen med datum");
expect(letter.includes("Vänliga hälsningar, Ingrid Synnerstad"), "underskriften");
expect(!letter.includes("Så går du vidare"), "inget 'Så går du vidare' vid låg risk");
expect(!letter.includes("påminner"), "ingen påminnelse lovad (3.6)");
const font = await page.locator("[data-slot=letter] .font-letter").evaluate((el) => getComputedStyle(el).fontFamily);
expect(font.includes("Source Serif 4"), `brevets typsnitt (${font})`);
await page.evaluate(() => document.fonts.ready);
expect(await page.evaluate(() => document.fonts.check('19px "Source Serif 4 Variable"')), "serifen är laddad");

// 3. Utskrift: bara brevet
log("3 utskrift");
await page.emulateMedia({ media: "print" });
const printVisible = await page.evaluate(() =>
  [...document.querySelectorAll("main > *")].filter((el) => getComputedStyle(el).display !== "none").map((el) => el.getAttribute("data-slot") ?? el.tagName),
);
expect(printVisible.length === 1 && printVisible[0] === "letter", `bara brevet syns vid utskrift (${printVisible.join(", ")})`);
expect(await page.locator("text=Skriv ut brevet").isHidden(), "utskriftsknappen skrivs inte ut");
await page.screenshot({ path: `${out}/arende-utskrift.png`, fullPage: true });
await page.emulateMedia({ media: "screen" });

// 4. Ärendelistan
log("4 ärendelistan");
await page.goto(`${base}/app/arenden`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Ärenden");
const rows = await page.locator("main ul li").allTextContents();
const clean = rows.map((r) => r.replace(/\s+/g, " ").trim());
log("   " + clean.join(" | "));
expect(clean.length === 7, "en rad per fläck (7)");
expect(clean[0].startsWith("Vänster underarm") && clean[0].includes("Väntar på hudläkare") && clean[0].includes("2 kontroller"), "öppet ärende först, med antal kontroller");
expect(clean.slice(0, 3).every((r) => /Väntar|tittar|Nya bilder/.test(r)), "de tre öppna först");
expect(clean.some((r) => r.startsWith("Höger kind") && r.includes("Förhöjd risk")), "utfallet i listan");
await page.screenshot({ path: `${out}/arende-lista.png`, fullPage: true });

// 5. Väntande: klockan
log("5 väntande kontroll");
await page.locator("main ul li a").first().click();
await page.waitForURL((u) => u.pathname === `/app/arende/${id(2)}`);
await page.waitForSelector("text=Väntar på en hudläkare");
const waiting = await text("main");
expect(/Svar senast \S+ \d+ \w+ kl\. \d\d:\d\d · om \d+ dagar/.test(waiting), "klockan med dagar kvar");
expect(waiting.includes("Tidigare kontroller av fläcken"), "tidigare kontroller av samma fläck");
expect(await page.locator("ol[aria-label='Vad som har hänt'] li[aria-current=step]").count() === 1, "ett nuvarande steg i tidslinjen");
await page.screenshot({ path: `${out}/arende-vantar.png`, fullPage: true });

// 6. Tidigare kontroll: gammalt svar utan uppföljningsvärde
await page.getByRole("link", { name: /Skickad/ }).first().click();
await page.waitForURL((u) => u.pathname === `/app/arende/${id(1)}`);
await page.waitForSelector("[data-slot=letter]");
const old = await text("[data-slot=letter]");
expect(!old.includes("Ta ett nytt foto") && !old.includes("Ingen uppföljning behövs"), "äldre svar: ingen uppföljningsrad");

// 7. Antaget: inget namn
log("7 antagen kontroll");
await page.goto(`${base}/app/arende/${id(3)}`, { waitUntil: "networkidle" });
await page.waitForSelector("text=En hudläkare tittar på dina foton");
expect(!(await text("main")).includes("Ingrid"), "inget namn medan ärendet är antaget");

// 8. De andra utfallen
for (const [n, name, checks] of [
  [4, "måttlig, ingen uppföljning", ["Min bedömning: måttlig risk.", "Ingen uppföljning behövs för den här fläcken."]],
  [5, "förhöjd risk", ["Min bedömning: förhöjd risk.", "Så går du vidare", "undersökas med dermatoskop", "1177"]],
  [6, "på plats", ["Min bedömning: fläcken bör undersökas på plats.", "Så går du vidare"]],
]) {
  log(`8 ${name}`);
  await page.goto(`${base}/app/arende/${id(n)}`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-slot=letter]");
  const body = await text("main");
  for (const c of checks) expect(body.includes(c), `"${c}"`);
  await page.screenshot({ path: `${out}/arende-${n}.png`, fullPage: true });
}

// 9. Nya bilder behövs
log("9 nya bilder behövs");
await page.goto(`${base}/app/arende/${id(7)}`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Hudläkaren behöver nya bilder");
const retake = await text("main");
expect(retake.includes("Bilden var oskarp") && retake.includes("Lägg ett mynt"), "orsakerna som instruktioner");
await page.screenshot({ path: `${out}/arende-omtag.png`, fullPage: true });

// 10. Fotona och visaren
log("10 foton");
await page.waitForFunction(() => [...document.querySelectorAll("main ul img")].some((i) => i.complete && i.naturalWidth > 0), null, {
  timeout: 10000,
}).catch(() => undefined);
const loaded = await page.evaluate(() => [...document.querySelectorAll("main ul img")].filter((i) => i.naturalWidth > 0).length);
expect(loaded === 3 || !jpeg, `tre miniatyrer laddade (${loaded})`);
await page.getByRole("button", { name: /Visa närbild i full storlek/ }).click();
await page.waitForSelector("dialog[open]");
expect(await page.locator("dialog[open]").isVisible(), "visaren öppnas");
await page.screenshot({ path: `${out}/arende-foto.png` });
await page.keyboard.press("Escape");
await page.waitForSelector("dialog[open]", { state: "detached", timeout: 3000 }).catch(() => undefined);
expect((await page.locator("dialog[open]").count()) === 0, "Esc stänger visaren");

// 11. Finns inte, och /hem
log("11 finns inte, /hem");
await page.goto(`${base}/app/arende/${id(999)}`, { waitUntil: "networkidle" });
expect(await page.locator("text=Det här ärendet finns inte.").isVisible(), "okänt ärende");
await page.goto(`${base}/hem`, { waitUntil: "networkidle" });
expect(path() === "/app", `/hem leder till appen (${path()})`);

// 12. Samma notislänk med ett seed-konto: dev-panelen följer också vägen tillbaka
log("12 notislänken via dev-panelen");
await page.evaluate(() => localStorage.clear());
await page.goto(`${base}/flack/${id(107)}`, { waitUntil: "networkidle" });
const panel = page.getByRole("button", { name: "Patient", exact: true });
if (await panel.isEnabled().catch(() => false)) {
  await panel.click();
  await page.waitForURL((u) => u.pathname.startsWith("/app/arende/"), { timeout: 20000 }).catch(() => undefined);
  expect(path() === `/app/arende/${id(8)}`, `dev-panelen tillbaka till brevet (${path()})`);
} else {
  log("   (dev-panelen avstängd: VITE_DEV_PASSWORD saknas -- hoppar över)");
}

log("\nfrågor som bad om * eller ai_:", violations.length ? violations : "inga");
log("konsolfel:", errors.length ? errors : "inga");
if (violations.length) fails.push("otillåten select");
if (errors.length) fails.push("konsolfel");
log(fails.length ? `\n${fails.length} FEL: ${fails.join("; ")}` : "\nallt OK");
await browser.close();
process.exit(fails.length ? 1 : 0);
