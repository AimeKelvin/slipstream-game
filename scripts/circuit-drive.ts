import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Circuit } from '../src/track/Circuit';
import { angleDelta } from '../src/core/math';

// Browser-only test driver. This exercises real keyboard input, not the game's simulation directly.
await mkdir('artifacts', { recursive: true });
const circuit = new Circuit();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
const pressed = new Set<string>();
async function key(code: string, down: boolean) {
  if (pressed.has(code) === down) return;
  if (down) {
    await page.keyboard.down(code);
    pressed.add(code);
  } else {
    await page.keyboard.up(code);
    pressed.delete(code);
  }
}
try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#loading.loaded', { timeout: 15000 });
  await page.click('#drive');
  let progress = 0,
    previousIndex = 12,
    worstOffset = 0,
    impacts = 0,
    frames = 0,
    lowestFps = 120;
  const captured = new Set<number>();
  const started = Date.now();
  while (Date.now() - started < 240000 && progress < circuit.samples.length + 10) {
    const report = await page.evaluate(() => window.__SLIPSTREAM__!.diagnostics());
    assert.equal(report.mode, 'driving');
    const s = report.state;
    const target = circuit.at(s.contactIndex + 11);
    const delta = angleDelta(s.heading, Math.atan2(target.x - s.x, target.z - s.z));
    await key('a', delta > 0.065);
    await key('d', delta < -0.065);
    await key('w', s.speed < 19);
    await key('s', s.speed > 21);
    const advance = ((s.contactIndex - previousIndex + circuit.samples.length * 1.5) % circuit.samples.length) - circuit.samples.length / 2;
    progress += advance;
    previousIndex = s.contactIndex;
    worstOffset = Math.max(worstOffset, circuit.nearest(s.x, s.z, s.contactIndex).distance);
    if (s.impact > 0.1) impacts++;
    lowestFps = Math.min(lowestFps, report.fps);
    frames++;
    const sector = Math.floor(progress / (circuit.samples.length / 3));
    if (sector > 0 && !captured.has(sector)) {
      captured.add(sector);
      await page.screenshot({ path: `artifacts/circuit-sector-${sector}.png` });
      console.log(
        `Circuit progress ${Math.round(progress / circuit.samples.length * 100)}%, ${Math.round(s.speed * 3.6)} km/h, ${report.fps} FPS, offset ${worstOffset.toFixed(2)} m`,
      );
    }
    await page.waitForTimeout(100);
  }
  for (const code of [...pressed]) await key(code, false);
  const summary = { progress, worstOffset, impacts, lowestFps, samples: frames, errors };
  await writeFile('artifacts/circuit-drive-report.json', JSON.stringify(summary, null, 2));
  assert.ok(progress >= circuit.samples.length, `Incomplete circuit: ${progress}/${circuit.samples.length}`);
  const lap = await page.evaluate(() => window.__SLIPSTREAM__!.diagnostics().practice);
  assert.equal(lap.laps, 1); assert.ok(lap.bestLap !== null && lap.bestLap > 100);
  assert.equal(impacts, 0);
  assert.ok(worstOffset < 6.5, `Left the asphalt: ${worstOffset}`);
  assert.deepEqual(errors, []);
  console.log('Full keyboard-driven circuit passed:', summary);
} finally {
  await browser.close();
}
