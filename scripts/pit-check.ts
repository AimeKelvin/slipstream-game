import { chromium, type Page } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript('window.__name = value => value');
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
const read = (p: Page = page) => p.evaluate(() => window.__SLIPSTREAM__!.diagnostics());
async function stop(earlyBy: number) {
  await page.keyboard.press('p');
  await page.waitForFunction(() => window.__SLIPSTREAM__!.diagnostics().state.pitPhase === 1);
  await page.keyboard.down('w');
  await page.evaluate(
    (early) =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Pit approach timed out')), 20000);
        const check = () => {
          const s = window.__SLIPSTREAM__!.diagnostics().state;
          const remaining = 85 + s.pitSlot * 20 - s.pitDistance;
          if (remaining <= (s.speed * s.speed) / (2 * 24.3) + early) {
            window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', bubbles: true }));
            clearTimeout(timer);
            resolve();
          } else {
            window.dispatchEvent(
              new KeyboardEvent(s.speed < 11.5 ? 'keydown' : 'keyup', {
                code: 'KeyW',
                bubbles: true,
                repeat: true,
              }),
            );
            requestAnimationFrame(check);
          }
        };
        check();
      }),
    earlyBy,
  );
  await page.waitForFunction(() => window.__SLIPSTREAM__!.diagnostics().state.pitPhase === 2);
  await page.keyboard.up('w');
  await page.keyboard.up('s');
  return read();
}
try {
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('#loading.loaded').waitFor();
  await page.click('#drive');
  assert.ok((await read()).trackLength > 3000);
  await page.screenshot({ path: 'artifacts/stint-hud.png' });
  const perfect = await stop(0.25);
  assert.equal(perfect.state.pitRating, 1);
  assert.equal(perfect.state.pitStopDuration, 2.4);
  await page.keyboard.press('r');
  assert.equal((await read()).state.pitPhase, 2);
  await page.screenshot({ path: 'artifacts/pit-perfect.png' });
  await page.waitForFunction(() => window.__SLIPSTREAM__!.diagnostics().state.pitPhase === 3);
  assert.equal((await read()).state.tyres, 1);
  await page.keyboard.down('w');
  await page.waitForFunction(() => window.__SLIPSTREAM__!.diagnostics().state.pitPhase === 0);
  await page.keyboard.up('w');
  await page.screenshot({ path: 'artifacts/pit-exit.png' });
  await page.keyboard.press('Escape');
  await page.click('#restart');
  const missed = await stop(9);
  assert.equal(missed.state.pitRating, 3);
  assert.equal(missed.state.pitStopDuration, 4.5);
  await page.screenshot({ path: 'artifacts/pit-missed.png' });
  // The exact same challenge in an authoritative room, with reload during service.
  await page.keyboard.press('Escape');
  await page.click('#exit');
  await page.click('#play-online');
  await page.fill('#driver-name', 'Pit Tester');
  await page.click('#create-room');
  await page.locator('#lobby-screen:visible').waitFor();
  await page.click('#ready-button');
  await page.click('#start-race');
  await page.waitForFunction(
    () => window.__SLIPSTREAM__!.diagnostics().network.latest?.phase === 'racing',
  );
  const online = await stop(0.25);
  assert.ok(online.state.pitRating <= 2);
  const tokenOwner = online.network.room!.seats[0].playerId;
  await page.reload();
  await page.waitForFunction(
    () => window.__SLIPSTREAM__?.diagnostics().network.status === 'online',
  );
  assert.equal((await read()).network.room!.seats[0].playerId, tokenOwner);
  await page.waitForFunction(() => window.__SLIPSTREAM__!.diagnostics().state.pitStops >= 1);
  assert.ok((await read()).state.tyres > 0.99);
  assert.deepEqual(errors, []);
  await writeFile(
    'artifacts/pit-report.json',
    JSON.stringify({ perfect, missed, online, restored: await read(), errors }, null, 2),
  );
  console.log(
    'Real-browser precise/missed stops, fresh tyres, pit exit and online service reconnect passed.',
  );
} catch (error) {
  await page.screenshot({ path: 'artifacts/pit-failure.png' });
  console.error(JSON.stringify(await read()));
  throw error;
} finally {
  await browser.close();
}
