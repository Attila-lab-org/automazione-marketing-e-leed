/**
 * Restaurant Premium V3 visual QA — reveal-safe full-page screenshots.
 *
 * Usage (dev server running):
 *   node scripts/qa-v3-screenshots.mjs
 *
 * Or:
 *   BASE_URL=http://localhost:3000 node scripts/qa-v3-screenshots.mjs
 *
 * Uses Playwright (npx) + ?qa=1 / data-qa-reveal so sections are visible.
 * Progressive scroll before full-page capture.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'docs', 'qa');
const base = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

mkdirSync(outDir, { recursive: true });

async function progressiveScroll(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = await page.evaluate(() => window.innerHeight);
  const step = Math.max(Math.floor(vh * 0.75), 200);
  for (let y = 0; y < height; y += step) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
}

async function shoot(page, { url, width, height, file, full }) {
  await page.setViewportSize({ width, height });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  // Force reveal visible (belt + suspenders with qa-v3 script)
  await page.evaluate(() => {
    document.documentElement.dataset.qaReveal = '1';
    document.querySelectorAll('[data-reveal]').forEach((n) => {
      n.style.opacity = '1';
      n.style.transform = 'none';
    });
  });
  if (full) {
    await progressiveScroll(page);
    await page.screenshot({
      path: join(outDir, file),
      fullPage: true,
    });
  } else {
    await page.screenshot({
      path: join(outDir, file),
      fullPage: false,
    });
  }
  console.log('wrote', file);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const demo = `${base}/demo/qa-v3?qa=1`;
  const email = `${base}/demo/qa-v3/email-preview`;

  await shoot(page, {
    url: demo,
    width: 1440,
    height: 900,
    file: 'v3-desktop-1440-first.png',
    full: false,
  });
  await shoot(page, {
    url: demo,
    width: 1440,
    height: 900,
    file: 'v3-desktop-1440-full.png',
    full: true,
  });
  await shoot(page, {
    url: demo,
    width: 390,
    height: 844,
    file: 'v3-mobile-390-first.png',
    full: false,
  });
  await shoot(page, {
    url: demo,
    width: 390,
    height: 844,
    file: 'v3-mobile-390-full.png',
    full: true,
  });
  await shoot(page, {
    url: demo,
    width: 430,
    height: 932,
    file: 'v3-mobile-430-first.png',
    full: false,
  });
  await shoot(page, {
    url: email,
    width: 600,
    height: 900,
    file: 'v3-email-preview.png',
    full: true,
  });

  await browser.close();
  console.log('QA screenshots complete →', outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
