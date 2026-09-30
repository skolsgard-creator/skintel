// Appskalet: menyn, Min hud, Kunskap och Profil i headless Chromium, med
// Supabase fejkat vid nätverksgränsen (samma grepp som prov-arende.mjs:
// en liten PostgREST som vägrar "*" och ai_-kolumner). Kör dev-servern
// först (`bun run dev`), sedan:
//
//   node scripts/prov-appskal.mjs
//
// Skärmbilder i prov/ (PROV_DIR). CHROMIUM_PATH pekar ut en egen Chromium
// när Playwrights egen inte är installerad. Prickarna på figuren träffas
// genom att räkna ut var kameran visar dem (samma kamera som figur-3d.ts:
// synfält 30°, mål på 0,96 m, avstånd 3,9 m, lutning 0,06).
import { chromium, devices } from "playwright";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

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
// Data. Kroppen är "kvinna"; fläckarnas punkter är fokuspunkter ur
// src/figur/figur-data.ts (magen från den neutrala kroppen, så att pricken
// måste läggas om på kvinnans yta).
// ---------------------------------------------------------------------------
const H = 3600_000;
const D = 24 * H;
const t = (ms) => new Date(Date.now() + ms).toISOString();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const P_MAGE = { p: [-0.0049, 1.194, 0.1551], n: [0.006, -0.027, 1.0] }; // neutral, mage
const P_RYGG = { p: [0.0, 1.5556, -0.0537], n: [0.023, -0.126, -0.992] }; // kvinna, övre rygg
const P_ARM = { p: [0.322, 1.2073, 0.1244], n: [-0.128, 0.511, 0.85] }; // kvinna, vänster underarm
const placed = (n, name, region, side, pt) => ({
  id: id(100 + n),
  user_id: UID,
  name,
  region_key: region,
  body_side: side,
  position_x: pt.p[0],
  position_y: pt.p[1],
  position_z: pt.p[2],
  normal_x: pt.n[0],
  normal_y: pt.n[1],
  normal_z: pt.n[2],
  created_at: t(-90 * D + n * H),
});
const unplaced = (n, name) => ({
  ...placed(n, name, "rygg", "mitten", { p: [0, 0, 0], n: [0, 0, 1] }),
  position_x: null,
  position_y: null,
  position_z: null,
  normal_x: null,
  normal_y: null,
  normal_z: null,
});
const spots = [
  placed(1, "Mage", "mage", "mitten", P_MAGE),
  placed(2, "Övre rygg", "rygg_ovre", "mitten", P_RYGG),
  placed(3, "Vänster underarm", "underarm", "vanster", P_ARM),
  unplaced(4, "Seed: äldre fläck"),
  unplaced(5, "Seed: utan kontroll"),
];
const kase = (n, spotN, status, created, extra = {}) => ({
  id: id(n),
  user_id: UID,
  spot_id: id(100 + spotN),
  status,
  created_at: created,
  response_due_at: t(2 * D),
  claimed_at: null,
  reviewed_at: null,
  dermatologist_outcome: null,
  dermatologist_verdict: null,
  followup_interval_weeks: null,
  followup_due_at: null,
  retake_reasons: null,
  ai_risk_level: "forhojd",
});
const cases = [
  // Magen: besvarad för tre dagar sedan, uppföljning om åtta veckor.
  {
    ...kase(1, 1, "reviewed", t(-5 * D)),
    reviewed_at: t(-3 * D),
    dermatologist_outcome: "lag",
    dermatologist_verdict: "Ett svar.",
    followup_interval_weeks: 8,
    followup_due_at: t(53 * D),
  },
  // Övre ryggen: väntar.
  { ...kase(2, 2, "pending", t(-2 * H)), response_due_at: t(2 * D) },
  // Underarmen: nya bilder behövs.
  { ...kase(3, 3, "insufficient_images", t(-4 * D)), claimed_at: t(-3 * D), retake_reasons: ["oskarp"] },
  // Den äldre fläcken: uppföljningen passerade för fem dagar sedan.
  {
    ...kase(4, 4, "reviewed", t(-70 * D)),
    reviewed_at: t(-61 * D),
    dermatologist_outcome: "mattlig",
    dermatologist_verdict: "Ett äldre svar.",
    followup_interval_weeks: 8,
    followup_due_at: t(-5 * D),
  },
];
const profile = {
  id: UID,
  email: "anvandare@skintel.test",
  first_name: "Test",
  last_name: "Patient",
  birth_year: 1986,
  birth_month: 4,
  skin_type: "III",
  figure_variant: "kvinna",
};
const tables = {
  lesion_reviews: cases,
  spots,
  profiles: [profile],
  review_images: cases.map((c) => ({
    id: `${c.id.slice(0, -2)}11`,
    lesion_review_id: c.id,
    user_id: UID,
    kind: "narbild",
    position: 1,
    storage_path: `${UID}/${c.id}.jpg`,
  })),
  case_reviewer: [],
  terms_acceptances: [{ user_id: UID }],
};

// ---------------------------------------------------------------------------
// Fejk-PostgREST
// ---------------------------------------------------------------------------
const violations = [];
const patches = [];
const signed = [];
// Ett riktigt JPEG ur prov-ny-kontroll (scripts/falsk-kamera.py); utan det
// visar alla rader sin reserv.
const jpeg = existsSync(`${out}/galleri-skarp.jpg`) ? readFileSync(`${out}/galleri-skarp.jpg`) : null;
function matches(row, url) {
  for (const [key, value] of url.searchParams) {
    if (["select", "order", "limit", "offset"].includes(key)) continue;
    const list = /^in\.\((.*)\)$/.exec(value);
    if (list) {
      if (!list[1].split(",").map((v) => v.replace(/^"|"$/g, "")).includes(String(row[key]))) return false;
      continue;
    }
    const m = /^(eq|neq)\.(.*)$/.exec(value);
    if (!m) continue;
    const cell = String(row[key]);
    if (m[1] === "eq" && cell !== m[2]) return false;
    if (m[1] === "neq" && cell === m[2]) return false;
  }
  return true;
}
function pick(rows, select) {
  const cols = select.split(",").map((s) => s.trim());
  return rows.map((row) => Object.fromEntries(cols.map((c) => [c, row[c] ?? null])));
}
function query(table, url) {
  const select = url.searchParams.get("select") ?? "*";
  if (select === "*" || /\bai_/.test(select)) violations.push(`${table}: select=${select}`);
  let result = (tables[table] ?? []).filter((row) => matches(row, url));
  const order = url.searchParams.get("order");
  if (order) {
    const [col, dir] = order.split(".");
    result = [...result].sort((a, b) => (dir === "desc" ? -1 : 1) * String(a[col]).localeCompare(String(b[col])));
  }
  const limit = url.searchParams.get("limit");
  if (limit) result = result.slice(0, Number(limit));
  return pick(result, select);
}

function fakeJwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 86400;
  return { token: `${b64({ alg: "HS256" })}.${b64({ sub: UID, aud: "authenticated", role: "authenticated", aal: "aal1", exp })}.sig`, exp };
}
const { token, exp } = fakeJwt();
const user = { id: UID, aud: "authenticated", role: "authenticated", email: profile.email, app_metadata: {}, user_metadata: {} };
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
  if (p === "/auth/v1/logout") return route.fulfill({ status: 204, body: "" });
  if (p.startsWith("/auth/v1/factors")) return json({ all: [], totp: [] });
  if (p.startsWith("/rest/v1/dermatologists") || p.startsWith("/rest/v1/organization_members") || p.startsWith("/rest/v1/user_roles"))
    return json([]);
  if (p === "/rest/v1/rpc/my_submission_entitlement") return json("organisation");
  if (p === "/storage/v1/object/sign/skin-photos") {
    const body = req.postDataJSON();
    signed.push(...body.paths);
    return json(body.paths.map((path) => ({ path, signedURL: `/object/sign/skin-photos/${path}?token=x`, error: null })));
  }
  if (p.startsWith("/storage/v1/object/sign/skin-photos/")) {
    // Den äldre fläckens foto finns inte (som seedens platshållare): raden
    // ska visa sin reserv.
    if (!jpeg || p.includes(id(4))) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ status: 200, contentType: "image/jpeg", body: jpeg });
  }
  const table = /^\/rest\/v1\/([a-z_]+)$/.exec(p)?.[1];
  // Fotoraderna svarar långsamt, som på mobilnät: en flik som visas igen ska
  // ha fotona direkt, inte vänta på dem (useCloseUps).
  if (table === "review_images") await new Promise((r) => setTimeout(r, 700));
  if (table && tables[table]) {
    if (req.method() === "PATCH") {
      const body = req.postDataJSON();
      patches.push({ table, body });
      // Databasens åldersspärr (enforce_minimum_age), fejkad så att appens
      // väg för ett nej från databasen provas: 2008 släpps av formuläret
      // (fyllt 18 i september) men nekas här.
      if (table === "profiles" && body.birth_year >= 2008) {
        return json({ code: "P0001", message: "under_18", details: null, hint: null }, 400);
      }
      const hit = tables[table].filter((row) => matches(row, url));
      for (const row of hit) Object.assign(row, body);
      return json(pick(hit, url.searchParams.get("select") ?? "id"));
    }
    const rows = query(table, url);
    const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object+json");
    return json(single ? rows[0] ?? null : rows);
  }
  return json([]);
});

const page = await ctx.newPage();
const errors = [];
// Det enda väntade felet: den fejkade åldersspärren svarar 400 på
// profilens PATCH, och webbläsaren loggar det.
const EXPECTED_400 = /status of 400.*\/rest\/v1\/profiles\?id=eq\./;
// ...och den äldre fläckens foto, som med flit saknas (raden visar reserven).
const EXPECTED_404 = new RegExp(`status of 404.*/storage/v1/object/sign/skin-photos/.*${id(4)}\\.jpg`);
page.on("console", (m) => {
  const line = `${m.text()} @ ${m.location().url}`;
  if (m.type() === "error" && !EXPECTED_400.test(line) && !EXPECTED_404.test(line)) errors.push(line);
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
const path = () => new URL(page.url()).pathname + new URL(page.url()).search;
const text = async (sel) => ((await page.locator(sel).first().innerText()) ?? "").replace(/\s+/g, " ").trim();
const nav = () => page.locator("nav[aria-label=Huvudmeny]");
const activeTab = async () => {
  const current = nav().locator("a[aria-current=page]");
  const n = await current.count();
  return n === 1 ? (await current.innerText()).trim() : `${n} aktiva`;
};

// Kameran i figur-3d.ts, för att räkna ut var en punkt på kroppen syns.
function project(pt, yaw, box) {
  const pitch = 0.06, dist = 3.9, ty = 0.96, fov = (30 * Math.PI) / 180;
  const cam = [Math.sin(yaw) * Math.cos(pitch) * dist, ty + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist];
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const norm = (a) => a.map((v) => v / Math.hypot(...a));
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const f = norm(sub([0, ty, 0], cam));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const v = sub(pt, cam);
  const depth = dot(v, f);
  const tan = Math.tan(fov / 2);
  const ndcX = dot(v, r) / depth / (tan * (box.width / box.height));
  const ndcY = dot(v, u) / depth / tan;
  return { x: box.x + ((ndcX + 1) / 2) * box.width, y: box.y + ((1 - ndcY) / 2) * box.height };
}

// 1. Inloggning till Min hud
log("1 inloggning till Min hud");
await page.goto(`${base}/app`, { waitUntil: "networkidle" });
expect(path().startsWith("/logga-in"), `till inloggningen (${path()})`);
await page.getByLabel("E-postadress").fill(profile.email);
await page.getByRole("button", { name: "Skicka kod" }).click();
await page.getByLabel("Kod från mejlet").fill("123456");
await page.getByRole("button", { name: "Logga in" }).click();
await page.waitForURL((u) => u.pathname === "/app", { timeout: 20000 });
await page.waitForSelector("text=Min hud");

// 2. Menyn
log("2 menyn");
expect(await nav().isVisible(), "menyn syns i underkant");
const tabs = (await nav().locator("a").allInnerTexts()).map((s) => s.trim());
expect(tabs.join("|") === "Min hud|Ärenden|Ny kontroll|Kunskap|Profil", `flikarna i ordning (${tabs.join("|")})`);
expect((await activeTab()) === "Min hud", `Min hud är aktiv (${await activeTab()})`);

// 3. Just nu
log("3 just nu");
const card = page.getByRole("region", { name: "Just nu" });
const rows = (await card.locator("li").allInnerTexts()).map((r) => r.replace(/\s+/g, " ").trim());
log("   " + rows.join(" | "));
expect(rows.length === 3, "tre rader");
expect(rows[0]?.startsWith("Vänster underarm") && rows[0]?.includes("Nya bilder behövs"), "nya bilder först");
expect(rows[1]?.startsWith("Övre rygg") && /Svar (i dag|i morgon|senast)/.test(rows[1] ?? ""), "den väntande med klockan");
expect(rows[2]?.startsWith("Seed: äldre fläck") && rows[2]?.includes("Dags för nytt foto"), "uppföljningen som passerat");
// Fotona: närbilden i en ring med lägets färg; den äldre fläckens foto finns
// inte och raden visar reserven.
await page.waitForFunction(() => document.querySelectorAll("[aria-label='Just nu'] li img").length >= 2, null, { timeout: 10000 }).catch(() => undefined);
await page.waitForTimeout(500);
const avatars = await card.locator("li [data-slot=avatar]").evaluateAll((els) =>
  els.map((el) => ({
    tone: el.getAttribute("data-tone"),
    photo: [...el.querySelectorAll("img")].some((i) => i.complete && i.naturalWidth > 0),
    fallback: el.querySelector("svg") !== null,
  })),
);
log("   " + JSON.stringify(avatars));
expect(avatars.map((a) => a.tone).join(",") === "amber,primary,amber", "ringarnas färger följer läget");
if (jpeg) {
  expect(avatars[0]?.photo && avatars[1]?.photo, "närbilderna syns i de två första raderna");
  expect(avatars[2]?.fallback && !avatars[2]?.photo, "raden utan foto visar reserven");
  expect(signed.every((path) => path.endsWith(".jpg")) && signed.length >= 3, `närbilderna signeras (${signed.length})`);
} else {
  log("   (inget JPEG i prov/ -- kör prov-ny-kontroll.mjs först för att prova fotona)");
}
expect(await card.getByRole("link", { name: "En till under Ärenden" }).isVisible(), "den fjärde (svaret) under Ärenden");
const followHref = await card.locator("li").nth(2).locator("a").getAttribute("href");
expect(followHref === `/app/ny-kontroll?flack=${id(104)}`, `uppföljningsraden leder till en ny kontroll av fläcken (${followHref})`);
expect((await text("main")).includes("En fläck utan plats finns under Ärenden."), "fläcken utan plats nämns");

// 4. Figuren och prickarna
log("4 figuren");
const turnButton = page.getByRole("button", { name: "Vänd figuren" });
await turnButton.waitFor();
// Vändknappen är en liten ikon med namnet i aria-label; den blir tryckbar
// när figuren är uppe.
await page.waitForFunction(() => {
  const b = document.querySelector("button[aria-label='Vänd figuren']");
  return b && !b.disabled;
}, null, { timeout: 20000 });
const turnBox = await turnButton.boundingBox();
expect(Boolean(turnBox && turnBox.width <= 48 && turnBox.height <= 48), `vändknappen är liten (${turnBox ? Math.round(turnBox.width) : "?"} px)`);
await page.waitForTimeout(800);
const box = await page.locator("main canvas").boundingBox();
expect(Boolean(box && box.height > 250), `figuren har plats (${box ? Math.round(box.height) : 0} px hög)`);
await page.screenshot({ path: `${out}/appskal-min-hud.png`, fullPage: true });

const mage = project(P_MAGE.p, 0, box);
await page.touchscreen.tap(mage.x, mage.y);
const chosen = page.getByRole("region", { name: /^Vald fläck/ });
await chosen.waitFor({ timeout: 3000 }).catch(() => undefined);
expect(await chosen.isVisible(), "ett tryck på magens prick väljer fläcken");
if (await chosen.isVisible()) {
  const c = await text("section[aria-label^='Vald fläck']");
  expect(c.startsWith("Mage") && c.includes("Låg risk") && c.includes("Besvarad"), `fläcken, statusen och när (${c})`);
  // Kortet står ovanför menyn, och figuren behåller sin storlek när man trycker.
  const chosenBox = await chosen.boundingBox();
  const navBox = await nav().boundingBox();
  const raised = await nav().getByRole("link", { name: "Ny kontroll" }).boundingBox();
  const cardBottom = chosenBox ? chosenBox.y + chosenBox.height : Infinity;
  expect(Boolean(navBox && raised && cardBottom <= navBox.y && cardBottom < raised.y), "kortet syns ovanför menyn och mittknappen");
  const boxAfter = await page.locator("main canvas").boundingBox();
  expect(Boolean(boxAfter && box && Math.abs(boxAfter.height - box.height) < 1), "figuren ändrar inte storlek när kortet visas");
  expect(await chosen.getByRole("link", { name: "Ny kontroll av fläcken" }).isVisible(), "ny kontroll av en besvarad fläck går");
  expect((await chosen.locator("[data-slot=avatar]").getAttribute("data-tone")) === "primary", "den valda fläckens foto har sin färg");
  await page.screenshot({ path: `${out}/appskal-vald.png`, fullPage: true });
}

// Ryggens prick sitter på baksidan: ett tryck där den skulle synas framifrån
// träffar kroppen, inte pricken, och valet släpps.
const ryggFram = project(P_RYGG.p, 0, box);
await page.touchscreen.tap(ryggFram.x, ryggFram.y);
await page.waitForTimeout(300);
expect(!(await chosen.isVisible()), "en prick på baksidan går inte att träffa framifrån");

// Ett tryck bredvid kroppen stänger kortet för den valda fläcken. Trycket
// går i figurens övre del: kortet svävar över den nedre.
await page.touchscreen.tap(mage.x, mage.y);
await chosen.waitFor({ timeout: 3000 }).catch(() => undefined);
await page.touchscreen.tap(box.x + 12, box.y + box.height * 0.3);
await page.waitForTimeout(300);
expect(!(await chosen.isVisible()), "ett tryck bredvid figuren stänger kortet");

await turnButton.click();
await page.waitForTimeout(1500);
const ryggBak = project(P_RYGG.p, Math.PI, box);
await page.touchscreen.tap(ryggBak.x, ryggBak.y);
await chosen.waitFor({ timeout: 3000 }).catch(() => undefined);
const back = (await chosen.isVisible()) ? await text("section[aria-label^='Vald fläck']") : "";
expect(back.startsWith("Övre rygg") && back.includes("Väntar på hudläkare"), `bakifrån träffas ryggens prick (${back})`);
expect(!(await chosen.getByRole("link", { name: "Ny kontroll av fläcken" }).isVisible().catch(() => false)), "ingen ny kontroll medan en är öppen");
// Vriden för hand tillbaka mot framsidan (ett halvt varv åt gången är
// 0,7 bredder): knappen vänder då till baksidan, inte "tillbaka".
await chosen.getByRole("button", { name: "Stäng" }).click();
const dragY = box.y + box.height * 0.5;
await page.mouse.move(box.x + box.width * 0.85, dragY);
await page.mouse.down();
for (let i = 1; i <= 14; i++) await page.mouse.move(box.x + box.width * (0.85 - (0.7 * i) / 14), dragY);
// Stilla en stund före släppet: annars fortsätter figuren att svänga.
await page.waitForTimeout(200);
await page.mouse.up();
await page.waitForTimeout(1500);
await page.touchscreen.tap(mage.x, mage.y);
await chosen.waitFor({ timeout: 3000 }).catch(() => undefined);
expect((await chosen.isVisible()) && (await text("section[aria-label^='Vald fläck']")).startsWith("Mage"), "vriden för hand syns framsidan igen");
await chosen.getByRole("button", { name: "Stäng" }).click();
await turnButton.click();
await page.waitForTimeout(1500);
await page.touchscreen.tap(ryggBak.x, ryggBak.y);
await chosen.waitFor({ timeout: 3000 }).catch(() => undefined);
expect((await chosen.isVisible()) && (await text("section[aria-label^='Vald fläck']")).startsWith("Övre rygg"), "Vänd figuren går till baksidan efter en vridning för hand");

const srList = (await page.locator("ul[aria-label='Fläckarna på figuren'] li").allInnerTexts()).map((x) => x.trim());
expect(srList.length === 3 && srList.includes("Mage, Låg risk"), `prickarna som länkar för skärmläsare (${srList.join(" | ")})`);

await chosen.getByRole("link", { name: "Öppna" }).click();
await page.waitForURL((u) => u.pathname === `/app/arende/${id(2)}`, { timeout: 10000 });
expect((await activeTab()) === "Ärenden", `ärendet hör till fliken Ärenden (${await activeTab()})`);

// 5. Utskrift: menyn skrivs inte ut
log("5 utskrift");
await page.emulateMedia({ media: "print" });
expect(await nav().evaluate((el) => getComputedStyle(el).display === "none"), "menyn göms vid utskrift");
await page.emulateMedia({ media: "screen" });

// 6. Flikarna
log("6 flikarna");
await nav().getByRole("link", { name: "Ärenden" }).click();
await page.waitForURL((u) => u.pathname === "/app/arenden");
await page.getByRole("heading", { name: "Ärenden", level: 1 }).waitFor();
// Samma fläckar som på Min hud: fotona finns redan, fast fotoraderna svarar
// långsamt -- ingen reserv som blinkar till.
const photosAtOnce = await page.locator("main ul li [data-slot=avatar] img").count();
expect(photosAtOnce >= 3, `fotona syns direkt när fliken byts (${photosAtOnce})`);
expect((await activeTab()) === "Ärenden", "Ärenden aktiv i listan");
await page.waitForSelector("main ul li [data-slot=avatar]", { timeout: 5000 }).catch(() => undefined);
const listTones = await page.locator("main ul li [data-slot=avatar]").evaluateAll((els) => els.map((el) => el.getAttribute("data-tone")));
expect(listTones.length === 4 && listTones.includes("amber") && listTones.includes("primary"), `listan har samma runda foton (${listTones.join(",")})`);
const listRows = (await page.locator("main ul li").allInnerTexts()).map((r) => r.replace(/\s+/g, " ").trim());
log("   " + listRows.join(" | "));
const followRow = listRows.find((r) => r.startsWith("Seed: äldre fläck")) ?? "";
expect(followRow.includes("Måttlig risk") && followRow.includes("Dags för nytt foto"), `uppföljningen står i ord, inte bara i ringens färg (${followRow})`);
expect(!(await page.getByRole("link", { name: "Till appen" }).isVisible().catch(() => false)), "ingen 'Till appen' i listan");
await nav().getByRole("link", { name: "Kunskap" }).click();
await page.getByRole("heading", { name: "Kunskap", level: 1 }).waitFor();
expect((await activeTab()) === "Kunskap", "Kunskap aktiv");

// 7. Kunskap
log("7 kunskap");
const articles = (await page.locator("main ul li").allInnerTexts()).map((r) => r.replace(/\s+/g, " ").trim());
expect(articles.length === 2 && articles[0].startsWith("Så tar du bra bilder") && articles[1].startsWith("Så går en kontroll till"), `två texter (${articles.join(" | ")})`);
await page.screenshot({ path: `${out}/appskal-kunskap.png`, fullPage: true });
await page.getByRole("link", { name: /Så tar du bra bilder/ }).click();
await page.getByRole("heading", { name: "Så tar du bra bilder", level: 1 }).waitFor();
expect(path() === "/app/kunskap/bra-bilder", `textens adress (${path()})`);
const photos = await text("main");
expect(photos.includes("Närbild") && photos.includes("10–15 cm rakt uppifrån") && photos.includes("Dagsljus, inte blixt"), "fotoguidens texter");
expect((await activeTab()) === "Kunskap", "Kunskap aktiv i texten");
await page.screenshot({ path: `${out}/appskal-bra-bilder.png`, fullPage: true });
await page.getByRole("link", { name: "Kunskap", exact: true }).first().click();
await page.goto(`${base}/app/kunskap/finns-inte`, { waitUntil: "networkidle" });
expect(await page.locator("text=Texten finns inte.").isVisible(), "okänd text");

// 8. Profil
log("8 profil");
await nav().getByRole("link", { name: "Profil" }).click();
await page.waitForURL((u) => u.pathname === "/app/profil");
await page.waitForSelector("text=Uppgifter som hudläkaren ser");
const prof = await text("main");
expect(prof.includes("Test Patient") && prof.includes(profile.email), "namn och e-post");
expect(prof.includes("april 1986") && prof.includes("Typ III · Ljusmedel"), "födelsen och hudtypen");
expect(prof.includes("Via din arbetsgivare."), "vem som betalar");
expect(!(await page.getByRole("link", { name: "Lös in kod" }).isVisible().catch(() => false)), "ingen inlösen när arbetsgivaren betalar");
expect(!prof.includes("Dina andra vyer"), "inga andra vyer för en patient");
await page.screenshot({ path: `${out}/appskal-profil.png`, fullPage: true });

await page.getByRole("button", { name: "Kvinna" }).waitFor();
expect((await page.getByRole("button", { name: "Kvinna" }).getAttribute("aria-pressed")) === "true", "den valda kroppen");
await page.getByRole("button", { name: "Man" }).click();
await page.waitForTimeout(300);
expect(patches.some((x) => x.table === "profiles" && x.body.figure_variant === "man"), "kroppsvalet sparas");
expect((await page.getByRole("button", { name: "Man" }).getAttribute("aria-pressed")) === "true", "det nya valet syns");

await page.getByRole("button", { name: "Ändra" }).click();
const form = page.getByRole("form", { name: "Ändra uppgifter" });
await form.getByLabel("Födelseår").fill("2015");
await form.getByRole("button", { name: "Spara" }).click();
expect((await text("form")).includes("Tjänsten är för dig som har fyllt 18 år."), "formuläret stoppar den som är under 18");
expect(!patches.some((x) => x.body.birth_year === 2015), "ingenting skickas då");
await form.getByLabel("Födelseår").fill("2008");
await form.getByLabel("Födelsemånad").selectOption("9");
await form.getByRole("button", { name: "Spara" }).click();
await page.waitForTimeout(400);
expect((await text("form")).includes("Tjänsten är för dig som har fyllt 18 år."), "databasens nej visas vid födelseåret");
await form.getByLabel("Födelseår").fill("1990");
await form.getByLabel("Födelsemånad").selectOption("6");
await form.getByText("Typ IV · Olivton").click();
await page.screenshot({ path: `${out}/appskal-profil-andra.png`, fullPage: true });
await form.getByRole("button", { name: "Spara" }).click();
await page.waitForSelector("text=juni 1990", { timeout: 5000 }).catch(() => undefined);
const saved = await text("main");
expect(saved.includes("juni 1990") && saved.includes("Typ IV · Olivton"), "de nya uppgifterna visas");
const last = patches.filter((x) => x.table === "profiles" && "birth_year" in x.body).at(-1)?.body;
expect(JSON.stringify(last) === JSON.stringify({ birth_year: 1990, birth_month: 6, skin_type: "IV" }), `det som sparas (${JSON.stringify(last)})`);

// 9. Ny kontroll: helskärm, och vägen till Profil när uppgifter saknas
log("9 ny kontroll");
profile.birth_year = null;
await nav().getByRole("link", { name: "Ny kontroll" }).click();
await page.waitForURL((u) => u.pathname === "/app/ny-kontroll");
await page.waitForSelector("text=Profilen behöver fyllas i först.");
expect((await nav().count()) === 0, "ingen meny i Ny kontroll");
await page.screenshot({ path: `${out}/appskal-spark.png`, fullPage: true });
await page.getByRole("link", { name: "Till Profil" }).click();
await page.waitForURL((u) => u.pathname === "/app/profil");
await page.waitForSelector("dd:text('Saknas')", { timeout: 5000 }).catch(() => undefined);
expect((await text("main")).includes("Saknas"), "det som saknas syns i profilen");
profile.birth_year = 1990;
await page.goto(`${base}/app/ny-kontroll?flack=${id(101)}`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Steg 2 av 4", { timeout: 10000 }).catch(() => undefined);
// Versaler via CSS: innerText ger "STEG 2 AV 4".
expect((await text("body")).toLowerCase().includes("steg 2 av 4 · foton"), "en ny kontroll av en fläck börjar med fotona");
await page.getByRole("link", { name: "Stäng" }).click();
await page.waitForURL((u) => u.pathname === "/app");
await nav().waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
expect(await nav().isVisible(), "menyn tillbaka efter Stäng");

// Ett påbörjat utkast för något annat skrivs inte över utan en fråga.
log("9b påbörjat utkast");
await page.evaluate(
  () =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open("skintel", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("utkast");
      req.onsuccess = () => {
        const tx = req.result.transaction("utkast", "readwrite");
        tx.objectStore("utkast").put(
          {
            version: 1,
            startedAt: new Date().toISOString(),
            step: 3,
            spotId: null,
            plats: null,
            foton: [],
            svar: { duration: "over_ett_ar", has_changed: null, change_description: "", itching_burning_pain: null, bleeding_oozing: null, healed_and_returned: null, ugly_duckling: null },
            note: "påbörjad",
          },
          "ny-kontroll",
        );
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      };
    }),
);
await page.goto(`${base}/app/ny-kontroll?flack=${id(101)}`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Du har en påbörjad kontroll.", { timeout: 10000 }).catch(() => undefined);
expect(await page.locator("text=Du har en påbörjad kontroll.").isVisible(), "frågan om det påbörjade utkastet");
await page.getByRole("link", { name: "Fortsätt den påbörjade" }).click();
await page.waitForSelector("text=Fortsätter där du var.", { timeout: 10000 }).catch(() => undefined);
expect(path() === "/app/ny-kontroll" && (await text("body")).toLowerCase().includes("steg 3 av 4"), `det påbörjade fortsätter (${path()})`);
await page.goto(`${base}/app/ny-kontroll?flack=${id(101)}`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Börja om med fläcken" }).click();
await page.waitForSelector("text=Steg 2 av 4", { timeout: 10000 }).catch(() => undefined);
expect((await text("body")).toLowerCase().includes("steg 2 av 4 · foton"), "börja om med fläcken går till fotona");
const leftover = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const req = indexedDB.open("skintel", 1);
      req.onsuccess = () => {
        const get = req.result.transaction("utkast").objectStore("utkast").get("ny-kontroll");
        get.onsuccess = () => resolve(get.result ? get.result.note : null);
      };
    }),
);
expect(leftover !== "påbörjad", `det påbörjade är borta efter Börja om (${leftover})`);
await page.getByRole("link", { name: "Stäng" }).click();
await page.waitForURL((u) => u.pathname === "/app");

// 10. Logga ut
log("10 logga ut");
await nav().getByRole("link", { name: "Profil" }).click();
await page.getByRole("button", { name: "Logga ut" }).click();
await page.waitForURL((u) => u.pathname === "/logga-in", { timeout: 10000 });
expect(path().startsWith("/logga-in"), "utloggad till inloggningen");

log("\nfrågor som bad om * eller ai_:", violations.length ? violations : "inga");
log("konsolfel:", errors.length ? errors : "inga");
if (violations.length) fails.push("otillåten select");
if (errors.length) fails.push("konsolfel");
log(fails.length ? `\n${fails.length} FEL: ${fails.join("; ")}` : "\nallt OK");
await browser.close();
process.exit(fails.length ? 1 : 0);
