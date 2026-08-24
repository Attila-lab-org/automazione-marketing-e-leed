/**
 * Screenshots for Safe Live Email Test Mode UI fixtures.
 * BASE_URL=http://localhost:3456 node scripts/qa-test-mode-screenshots.mjs
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'docs', 'qa');
const base = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

mkdirSync(outDir, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1100, height: 800 });

  await page.goto(`${base}/demo/qa-test-mode/create`, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: join(outDir, 'test-mode-create-campaign.png'),
    fullPage: true,
  });
  console.log('wrote test-mode-create-campaign.png');

  await page.goto(`${base}/demo/qa-test-mode/review`, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: join(outDir, 'test-mode-review.png'),
    fullPage: true,
  });
  console.log('wrote test-mode-review.png');

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
