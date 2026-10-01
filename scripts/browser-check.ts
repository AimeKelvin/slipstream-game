import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#loading.loaded', { timeout: 15000 }).catch(async (error) => {
    await page.screenshot({ path: 'artifacts/startup-failure.png' });
    console.error('Startup browser errors:', errors);
    throw error;
  });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: 'artifacts/01-title.png' });
  const read = () => page.evaluate(() => window.__SLIPSTREAM__!.diagnostics());
  console.log('Title:', JSON.stringify(await read()));
  await page.getByRole('button', { name: 'SOLO PRACTICE' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'artifacts/02-grid.png' });
  await page.keyboard.down('w');
  await page.waitForFunction(() => window.__SLIPSTREAM__!.diagnostics().state.speed > 28, {
    timeout: 12000,
  });
  const accelerated = await read();
  assert.ok(accelerated.state.speed > 28);
  await page.screenshot({ path: 'artifacts/03-driving.png' });
  await page.keyboard.up('w');
  await page.keyboard.down('s');
  await page.waitForTimeout(800);
  await page.keyboard.up('s');
  const braking = await read();
  assert.ok(braking.state.speed < accelerated.state.speed * 0.6);
  await page.keyboard.press('r');
  await page.waitForTimeout(100);
  assert.ok(Math.abs((await read()).state.speed) < 0.1);
  await page.keyboard.down('w');
  await page.waitForTimeout(900);
  const straight = await read();
  await page.keyboard.down('d');
  await page.waitForTimeout(650);
  await page.keyboard.up('d');
  await page.keyboard.up('w');
  const turning = await read();
  assert.ok(turning.state.heading < straight.state.heading - 0.1);
  await page.keyboard.press('Escape');
  const paused = await read();
  assert.equal(paused.mode, 'paused');
  await page.waitForTimeout(450);
  assert.equal((await read()).elapsed, paused.elapsed);
  await page.screenshot({ path: 'artifacts/04-pause.png' });
  for (const quality of ['low', 'high', 'medium']) {
    await page.selectOption('#quality', quality);
    assert.equal((await read()).quality, quality);
  }
  await page.click('#sound');
  assert.equal(await page.getAttribute('#sound', 'aria-pressed'), 'false');
  await page.click('#resume');
  await page.keyboard.press('r');
  await page.keyboard.down('s');
  await page.waitForTimeout(1600);
  await page.keyboard.up('s');
  assert.ok((await read()).state.speed < -4);
  await page.keyboard.press('r');
  await page.keyboard.press('c');
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'artifacts/05-close-camera.png' });
  // Drive deliberately into the wall, then verify recovery using the same input path.
  await page.keyboard.down('w');
  await page.waitForTimeout(1600);
  await page.keyboard.down('d');
  await page.waitForFunction(() => window.__SLIPSTREAM__!.diagnostics().state.impact > 0.15, null, {
    timeout: 12000,
  });
  await page.keyboard.up('w');
  await page.keyboard.up('d');
  const collision = await read();
  assert.ok(Number.isFinite(collision.state.x));
  await page.screenshot({ path: 'artifacts/07-barrier-contact.png' });
  await page.keyboard.press('r');
  await page.waitForTimeout(100);
  assert.equal((await read()).state.offroad, false);
  assert.ok(Math.abs((await read()).state.speed) < 0.1);
  // Losing focus must release throttle and freeze practice time.
  await page.keyboard.down('w');
  await page.waitForTimeout(250);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await read()).mode, 'paused');
  await page.keyboard.up('w');
  await page.click('#resume');
  const resumedSpeed = (await read()).state.speed;
  await page.waitForTimeout(250);
  assert.ok((await read()).state.speed <= resumedSpeed + 0.1);
  await page.keyboard.press('Escape');
  await page.click('#exit');
  assert.equal((await read()).mode, 'title');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'artifacts/06-small-layout.png' });
  assert.ok(await page.locator('#drive').isVisible());
  const final = await read();
  await writeFile(
    'artifacts/browser-report.json',
    JSON.stringify({ errors, accelerated, braking, turning, collision, final }, null, 2),
  );
  assert.deepEqual(errors, []);
  console.log('Browser checks passed. Screenshots and telemetry are in artifacts/.');
} finally {
  await browser.close();
}
