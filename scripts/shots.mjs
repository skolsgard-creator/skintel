// Renderar designsystemets sidor till PNG så att en ändring går att
// jämföra bild mot bild: /, /dev/ui (ljust och mörkt) och /dev/identitet
// i 390 px (iPhone) och 360 px (Android).
//
//   bun run shots
//
// Första gången: bunx playwright install chromium (laddar ner webbläsaren).
// Skriver till shots/ (ignoreras av git). Förra körningen flyttas till
// shots/forra/ först, så att före och efter ligger bredvid varandra.
// Startar en egen dev-server på port 8081 och stänger den efteråt.

import { spawn } from "node:child_process";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const PORT = 8081;
const BASE = `http://localhost:${PORT}`;
const OUT = new URL("../shots/", import.meta.url).pathname;
const PREV = `${OUT}forra/`;

const pages = [
  { path: "/", name: "start" },
  { path: "/dev/ui", name: "ui" },
  { path: "/dev/ui", name: "ui-morkt", theme: "dark" },
  { path: "/dev/identitet", name: "identitet" },
];
const widths = [390, 360];

async function rotate() {
  await mkdir(OUT, { recursive: true });
  await rm(PREV, { recursive: true, force: true });
  const old = (await readdir(OUT)).filter((f) => f.endsWith(".png"));
  if (old.length) {
    await mkdir(PREV, { recursive: true });
    for (const f of old) await rename(`${OUT}${f}`, `${PREV}${f}`);
  }
}

function startServer() {
  const proc = spawn("bunx", ["vite", "--port", String(PORT), "--strictPort"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("dev-servern startade inte inom 30 s")), 30000);
    proc.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Local:")) {
        clearTimeout(t);
        resolve(proc);
      }
    });
    proc.on("exit", (code) => reject(new Error(`dev-servern avslutades (${code})`)));
  });
}

await rotate();
const server = await startServer();
const browser = await chromium.launch();
let fel = 0;
try {
  for (const width of widths) {
    const ctx = await browser.newContext({
      viewport: { width, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => {
      fel++;
      console.error(`  fel på sidan: ${e.message}`);
    });
    for (const p of pages) {
      await page.goto(`${BASE}${p.path}`, { waitUntil: "networkidle" });
      if (p.theme) {
        await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), p.theme);
      }
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      const file = `${OUT}${p.name}-${width}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log(`  ${p.name}-${width}.png`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(
  existsSync(PREV)
    ? `Klart. Nya bilder i shots/, förra körningen i shots/forra/.`
    : `Klart. Bilder i shots/.`,
);
if (fel) {
  console.error(`${fel} fel på sidorna -- se ovan.`);
  process.exit(1);
}
