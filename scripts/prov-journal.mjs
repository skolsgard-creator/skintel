// Steg 3.4b: journalen som PDF i headless Chromium, med Supabase fejkat vid
// nätverksgränsen -- en liten PostgREST som vägrar "*" och ai_-kolumner,
// my_journal_access() och lagringen. PDF:erna läses med poppler
// (pdftotext, pdfimages, pdfinfo) och jämförs med ärendesidans text.
// Kör dev-servern först (`bun run dev`), sedan:
//
//   node scripts/prov-journal.mjs
//
// PDF:er och sidbilder hamnar i prov/ (PROV_DIR). CHROMIUM_PATH pekar ut en
// egen Chromium när Playwrights egen inte är installerad. Kräver poppler.
// Det skarpa provet är telefonen mot riktiga databasen.
import { chromium, devices } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

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
const squash = (s) => s.replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------
// Foton: en JPEG (24 × 18), samma JPEG med EXIF-orientering 6 (ska ritas om
// till 18 × 24 innan den bäddas in) och en PNG (2 × 3).
// ---------------------------------------------------------------------------
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAASABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0OuXvPHGi2eqNZTSzbkLLJKIiURgSCp7k5HYEcjmuoryC8+HerLqjQ2ghazYsUneXhVycBhjO7AHQEc15p6rPX6KgsbZLKxt7WIsY4I1iUt1IUYGffiigZPRRRQAUUUUAf//Z",
  "base64",
);
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAFElEQVR4nGPkEpFjYGBgYmBgQFAABLQAQr8+USQAAAAASUVORK5CYII=",
  "base64",
);
/** JPEG:en med ett APP1-segment direkt efter SOI: EXIF, orientering 6. */
function withOrientation6(jpeg) {
  const tiff = Buffer.from([
    0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0,
  ]);
  const body = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const length = body.length + 2;
  return Buffer.concat([
    jpeg.subarray(0, 2),
    Buffer.from([0xff, 0xe1, length >> 8, length & 0xff]),
    body,
    jpeg.subarray(2),
  ]);
}
const JPEG_ROTATED = withOrientation6(JPEG);

// ---------------------------------------------------------------------------
// Data: två fläckar, tre kontroller, åtkomst i två av dem.
// ---------------------------------------------------------------------------
const H = 3600_000;
const D = 24 * H;
const t = (ms) => new Date(Date.now() + ms).toISOString();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const VERDICT =
  "Hej Anna,\n\nTack för dina bilder. Jag har tittat på alla tre fotona och på dina svar.\n\nFläcken har en ojämn kant och två färgnyanser, och du skriver att den har blivit större. Jag vill att den undersöks med dermatoskop.";
const profile = {
  id: UID,
  email: "anna@skintel.test",
  first_name: "Anna",
  last_name: "Andersson",
  birth_year: 1979,
  birth_month: 4,
  skin_type: "II",
  figure_variant: "kvinna",
};
const spots = [
  { id: id(101), name: "Vänster underarm", user_id: UID },
  { id: id(102), name: "Rygg", user_id: UID },
];
const common = {
  user_id: UID,
  retake_reasons: null,
  duration: "over_ett_ar",
  has_changed: "ja",
  change_description: "Blivit större sedan i våras",
  itching_burning_pain: "nej",
  bleeding_oozing: null,
  healed_and_returned: null,
  ugly_duckling: "vet_ej",
  note: "Sitter där klockarmbandet skaver.",
  anamnesis: {
    skin_type: "II",
    age: 47,
    previous_skin_cancer: "nej",
    family_history: "ja",
    mole_count: "20_till_50",
  },
  anamnesis_version: "2026-09-07.2",
  symptom_version: "2026-09-28.1",
  assessed_skin_type: "II",
  // Finns i tabellen men är INTE grantade: fejken vägrar om de efterfrågas.
  ai_risk_level: "forhojd",
  ai_reasoning: "får aldrig synas",
};
const cases = [
  {
    ...common,
    id: id(1),
    spot_id: id(101),
    status: "reviewed",
    created_at: t(-6 * D),
    response_due_at: t(-5 * D),
    claimed_at: t(-6 * D + 2 * H),
    reviewed_at: t(-6 * D + 3 * H),
    dermatologist_outcome: "forhojd",
    dermatologist_verdict: VERDICT,
    followup_interval_weeks: 0,
    followup_due_at: null,
  },
  {
    ...common,
    id: id(2),
    spot_id: id(101),
    status: "reviewed",
    created_at: t(-60 * D),
    response_due_at: t(-59 * D),
    claimed_at: t(-60 * D + H),
    reviewed_at: t(-60 * D + 2 * H),
    dermatologist_outcome: "lag",
    dermatologist_verdict: "Hej,\n\nFläcken ser ut som ett vanligt födelsemärke.",
    followup_interval_weeks: 8,
    followup_due_at: t(-60 * D + 2 * H + 56 * D),
    anamnesis: null,
    anamnesis_version: null,
    symptom_version: null,
  },
  {
    ...common,
    id: id(3),
    spot_id: id(102),
    status: "pending",
    created_at: t(-2 * H),
    response_due_at: t(22 * H),
    claimed_at: null,
    reviewed_at: null,
    dermatologist_outcome: null,
    dermatologist_verdict: null,
    followup_interval_weeks: null,
    followup_due_at: null,
    assessed_skin_type: null,
  },
];
const photo = (caseN, k, kind, position, file) => ({
  id: id(1000 + caseN * 10 + k),
  lesion_review_id: id(caseN),
  user_id: UID,
  kind,
  position,
  storage_path: `${UID}/${id(caseN)}-${kind}-${file}`,
  taken_at: t(-6 * D - 10 * 60_000 + k * 60_000),
  created_at: t(-6 * D),
});
const review_images = [
  photo(1, 1, "oversikt", 1, "a.jpg"),
  photo(1, 2, "narbild", 2, "roterad.jpg"),
  photo(1, 3, "skala", 3, "c.png"),
  photo(2, 1, "narbild", 1, "a.jpg"),
  photo(3, 1, "oversikt", 1, "a.jpg"),
  photo(3, 2, "narbild", 2, "a.jpg"),
];
const REVIEWER = { name: "Ingrid Synnerstad", title: "Specialistläkare i hudsjukdomar" };
const case_reviewer = [
  { lesion_review_id: id(1), ...REVIEWER },
  { lesion_review_id: id(2), ...REVIEWER },
];
const access = [
  {
    lesion_review_id: id(1),
    viewed_at: t(-6 * D + 2 * H + 60_000),
    viewer_name: REVIEWER.name,
    viewer_title: REVIEWER.title,
    viewer_removed: false,
  },
  {
    lesion_review_id: id(1),
    viewed_at: t(-6 * D + 2 * H + 120_000),
    viewer_name: REVIEWER.name,
    viewer_title: REVIEWER.title,
    viewer_removed: false,
  },
  {
    lesion_review_id: id(1),
    viewed_at: t(-6 * D + 2 * H + 300_000),
    viewer_name: REVIEWER.name,
    viewer_title: REVIEWER.title,
    viewer_removed: false,
  },
  {
    lesion_review_id: id(2),
    viewed_at: t(-60 * D + H + 60_000),
    viewer_name: null,
    viewer_title: null,
    viewer_removed: true,
  },
];
const tables = { lesion_reviews: cases, spots, review_images, case_reviewer, profiles: [profile] };

// ---------------------------------------------------------------------------
// Fejk-PostgREST och lagring
// ---------------------------------------------------------------------------
const violations = [];
const rpcCalls = [];
let failPhoto = null;
function matches(row, url) {
  for (const [key, value] of url.searchParams) {
    if (["select", "order", "limit", "offset"].includes(key)) continue;
    const m = /^(eq|neq)\.(.*)$/.exec(value);
    if (!m) continue;
    const cell = String(row[key]);
    if (m[1] === "eq" && cell !== m[2]) return false;
    if (m[1] === "neq" && cell === m[2]) return false;
  }
  return true;
}
function query(table, url) {
  const select = url.searchParams.get("select") ?? "*";
  if (select === "*" || /\bai_/.test(select)) violations.push(`${table}: select=${select}`);
  let result = (tables[table] ?? []).filter((row) => matches(row, url));
  const order = url.searchParams.get("order");
  if (order) {
    const [col, dir] = order.split(".");
    result = [...result].sort(
      (a, b) => (dir === "desc" ? -1 : 1) * String(a[col]).localeCompare(String(b[col])),
    );
  }
  const cols = select.split(",").map((s) => s.trim());
  return result.map((row) => Object.fromEntries(cols.map((c) => [c, row[c] ?? null])));
}

function fakeJwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 86400;
  return {
    token: `${b64({ alg: "HS256" })}.${b64({ sub: UID, aud: "authenticated", role: "authenticated", aal: "aal1", exp })}.sig`,
    exp,
  };
}
const { token, exp } = fakeJwt();
const user = {
  id: UID,
  aud: "authenticated",
  role: "authenticated",
  email: profile.email,
  app_metadata: {},
  user_metadata: {},
};
const session = {
  access_token: token,
  token_type: "bearer",
  expires_in: 86400,
  expires_at: exp,
  refresh_token: "r1",
  user,
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: devices["iPhone 13"].userAgent,
  acceptDownloads: true,
});
await ctx.route(`${SUPA}/**`, async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname;
  const json = (body, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (p === "/auth/v1/otp") return json({});
  if (p === "/auth/v1/verify") return json(session);
  if (p === "/auth/v1/user") return json(user);
  if (p === "/auth/v1/token") return json(session);
  if (p.startsWith("/auth/v1/factors")) return json({ all: [], totp: [] });
  if (
    p.startsWith("/rest/v1/dermatologists") ||
    p.startsWith("/rest/v1/organization_members") ||
    p.startsWith("/rest/v1/user_roles")
  )
    return json([]);
  if (p === "/rest/v1/rpc/my_submission_entitlement") return json("organisation");
  if (p === "/rest/v1/rpc/my_journal_access") {
    rpcCalls.push(p);
    return json(access);
  }
  if (p === "/storage/v1/object/sign/skin-photos") {
    const body = req.postDataJSON();
    return json(
      body.paths.map((path) => ({
        path,
        signedURL: `/object/sign/skin-photos/${path}?token=x`,
        error: null,
      })),
    );
  }
  if (p.startsWith("/storage/v1/object/sign/skin-photos/")) {
    if (failPhoto && p.includes(failPhoto)) return route.fulfill({ status: 500, body: "" });
    if (p.endsWith(".png"))
      return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    if (p.endsWith("roterad.jpg"))
      return route.fulfill({ status: 200, contentType: "image/jpeg", body: JPEG_ROTATED });
    return route.fulfill({ status: 200, contentType: "image/jpeg", body: JPEG });
  }
  const table = /^\/rest\/v1\/([a-z_]+)$/.exec(p)?.[1];
  if (table && tables[table]) {
    const rows = query(table, url);
    const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object+json");
    return json(single ? (rows[0] ?? null) : rows);
  }
  return json([]);
});

const page = await ctx.newPage();
const errors = [];
// Väntat: fotot som provet med flit låter misslyckas (steg 5).
const EXPECTED_500 = /status of 500/;
page.on("console", (m) => {
  const line = `${m.text()} @ ${m.location().url}`;
  if (m.type() === "error" && !EXPECTED_500.test(line)) errors.push(line);
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
const pdfLoaded = () =>
  page.evaluate(() => performance.getEntriesByType("resource").some((r) => /jspdf/i.test(r.name)));
const poppler = (tool, args) => execFileSync(tool, args, { encoding: "utf8" });

async function download(buttonName, file) {
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.getByRole("button", { name: buttonName }).click(),
  ]);
  const target = `${out}/${file}`;
  await dl.saveAs(target);
  return { name: dl.suggestedFilename(), target };
}

// 1. Inloggning, ärendesidan, och att jsPDF inte hämtats än
log("1 ärendesidan med journalknappen");
await page.goto(`${base}/app/arende/${id(1)}`, { waitUntil: "networkidle" });
await page.getByLabel("E-postadress").fill(profile.email);
await page.getByRole("button", { name: "Skicka kod" }).click();
await page.getByLabel("Kod från mejlet").fill("123456");
await page.getByRole("button", { name: "Logga in" }).click();
await page.waitForURL((u) => u.pathname === `/app/arende/${id(1)}`, { timeout: 20000 });
await page.waitForSelector("[data-slot=letter]");
const journal = page.getByRole("region", { name: "Journal" });
expect(await journal.isVisible(), "avsnittet Journal finns på ärendesidan");
expect(!(await pdfLoaded()), "jsPDF är inte hämtad innan någon trycker");
await journal.scrollIntoViewIfNeeded();
await page.screenshot({ path: `${out}/journal-knapp.png`, fullPage: true });

// 2. En kontroll som PDF
log("2 en kontroll som PDF");
const one = await download("Ladda ner som PDF", "journal-kontroll.pdf");
expect(
  /^skintel-vanster-underarm-\d{4}-\d{2}-\d{2}\.pdf$/.test(one.name),
  `filnamnet (${one.name})`,
);
expect(await pdfLoaded(), "jsPDF hämtades vid trycket");
await page.waitForSelector("text=Sparad som skintel-vanster-underarm");
expect(true, "knappen säger var filen sparades");
const pdfText = squash(poppler("pdftotext", ["-layout", one.target, "-"]));

// Det som står på sidan står i PDF:en.
const letter = squash(await page.locator("[data-slot=letter] .font-letter").innerText());
for (const sentence of letter.split(/(?<=[.,])\s+/).filter((s) => s.length > 12)) {
  expect(pdfText.includes(sentence), `brevets mening finns i PDF:en: "${sentence.slice(0, 40)}…"`);
}
expect(pdfText.includes("Min bedömning: förhöjd risk."), "utfallet");
expect(pdfText.includes("Så går du vidare"), "vägen vidare vid förhöjd risk");
const answers = await page
  .getByRole("region", { name: "Dina svar" })
  .locator("dl > div")
  .evaluateAll((rows) =>
    rows.map((r) => [
      r.querySelector("dt")?.textContent ?? "",
      r.querySelector("dd")?.textContent ?? "",
    ]),
  );
expect(answers.length >= 6, `ärendesidans svar lästes (${answers.length})`);
for (const [label, value] of answers) {
  expect(
    pdfText.includes(squash(value)),
    `svaret finns i PDF:en: ${label.slice(0, 30)} → ${value.slice(0, 30)}`,
  );
}
expect(pdfText.includes("Hälsouppgifter när kontrollen skickades"), "hälsouppgifterna");
expect(pdfText.includes("Finns hudcancer i din familj?"), "en hälsofråga i hud-kolls ord");
expect(pdfText.includes("Frågorna i version 2026-09-07.2."), "anamnesversionen");
expect(
  /3 gånger mellan kl\. \d\d:\d\d och \d\d:\d\d/.test(pdfText),
  "åtkomsten: tre öppningar samma dag blir en rad",
);
expect(pdfText.includes("Andra kontroller av fläcken"), "den andra kontrollen av fläcken");
expect(!pdfText.includes("Rygg"), "inget från den andra fläcken");
expect(!/får aldrig synas|forhojd/.test(pdfText), "inga AI-värden");
const images = poppler("pdfimages", ["-list", one.target])
  .split("\n")
  .slice(2)
  .filter(Boolean)
  .map((l) => l.trim().split(/\s+/))
  .filter((c) => c[2] === "image")
  .map((c) => `${c[3]}x${c[4]}`);
expect(images.length === 3, `tre foton i PDF:en (${images.join(", ")})`);
expect(images.includes("24x18"), "JPEG:en i sin storlek");
expect(images.includes("18x24"), "fotot med EXIF-orientering är vänt rätt");
expect(images.includes("2x3"), "PNG:en");
poppler("pdftoppm", ["-r", "60", "-png", one.target, `${out}/journal-kontroll`]);

// 3. Hela journalen från Profil
log("3 hela journalen");
await page.getByRole("link", { name: "Profil" }).click();
await page.waitForURL((u) => u.pathname === "/app/profil");
const section = page.getByRole("region", { name: "Din journal" });
await section.waitFor({ timeout: 10000 }).catch(() => {});
expect(await section.isVisible(), "Din journal i Profil");
await section.scrollIntoViewIfNeeded();
await page.screenshot({ path: `${out}/journal-profil.png`, fullPage: true });
const all = await download("Ladda ner hela journalen", "journal-hel.pdf");
expect(/^skintel-journal-\d{4}-\d{2}-\d{2}\.pdf$/.test(all.name), `filnamnet (${all.name})`);
const allText = squash(poppler("pdftotext", ["-layout", all.target, "-"]));
expect(allText.includes("Innehåll"), "innehållet på första sidan");
expect(
  /Rygg\s+1 kontroll/.test(allText) && /Vänster underarm\s+2 kontroller/.test(allText),
  "båda fläckarna i innehållet",
);
expect(allText.includes("Väntar på en hudläkare"), "den väntande kontrollen");
expect(allText.includes("Ett konto som har tagits bort"), "ett borttaget konto i åtkomsten");
expect(
  allText.includes("Inga hälsouppgifter sparades med kontrollen."),
  "kontrollen utan frysta hälsouppgifter",
);
const pagesAll = Number(/Pages:\s+(\d+)/.exec(poppler("pdfinfo", [all.target]))?.[1]);
expect(pagesAll >= 4, `flera sidor (${pagesAll})`);
expect(allText.includes(`Sida ${pagesAll} av ${pagesAll}`), "sidfoten räknar sidorna");
const allImages = poppler("pdfimages", ["-list", all.target])
  .split("\n")
  .filter((l) => / image /.test(l)).length;
expect(allImages === review_images.length, `alla foton (${allImages} av ${review_images.length})`);
poppler("pdftoppm", ["-r", "60", "-png", "-f", "1", "-l", "2", all.target, `${out}/journal-hel`]);

// 4. Ett foto som inte går att hämta: ingen journal, och orsaken i ord
log("4 ett foto som inte går att hämta");
failPhoto = "roterad.jpg";
await page.reload({ waitUntil: "networkidle" });
let downloaded = false;
page.on("download", () => (downloaded = true));
await page.getByRole("button", { name: "Ladda ner hela journalen" }).click();
const alert = page.getByRole("alert").filter({ hasText: "Ett av fotona kunde inte hämtas" });
await alert.waitFor({ timeout: 20000 });
expect(true, "felet säger att ett foto inte kunde hämtas");
expect(
  await page.getByRole("button", { name: "Försök igen" }).isVisible(),
  "knappen säger Försök igen",
);
await page.waitForTimeout(500);
expect(!downloaded, "ingen halv journal laddades ner");
failPhoto = null;
const again = await download("Försök igen", "journal-igen.pdf");
expect(again.name.startsWith("skintel-journal-"), "andra försöket ger journalen");

expect(rpcCalls.length >= 2, `my_journal_access frågades (${rpcCalls.length} gånger)`);
expect(violations.length === 0, `inga "*" eller ai_-kolumner (${violations.join("; ") || "inga"})`);
expect(errors.length === 0, `inga fel i konsolen (${errors.slice(0, 3).join(" | ") || "inga"})`);

await browser.close();
log(fails.length ? `\n${fails.length} FEL:\n - ${fails.join("\n - ")}` : "\nAllt gick igenom.");
process.exit(fails.length ? 1 : 0);
