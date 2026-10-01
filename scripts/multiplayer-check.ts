import { chromium, type Page, type WebSocketRoute } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors: string[] = [];
const read = (page: Page) => page.evaluate(() => window.__SLIPSTREAM__!.diagnostics());
const contexts = await Promise.all(
  [0, 1].map(() => browser.newContext({ viewport: { width: 1280, height: 800 } })),
);
try {
  const [host, guest] = await Promise.all(contexts.map((context) => context.newPage()));
  for (const page of [host, guest]) page.on('pageerror', (error) => errors.push(error.message));
  await host.goto('http://localhost:5173/');
  await host.locator('#loading.loaded').waitFor();
  await host.click('#play-online');
  await host.fill('#driver-name', 'Coast Captain');
  await host.getByRole('button', { name: 'Coral red', exact: true }).click();
  await host.screenshot({ path: 'artifacts/online-driver.png' });
  await host.click('#create-room');
  await host.locator('#lobby-screen:visible').waitFor();
  const code = (await read(host)).network.room!.code;
  let guestSocket: WebSocketRoute | undefined;
  await guest.routeWebSocket('**/ws', (route) => {
    guestSocket = route;
    route.connectToServer();
  });
  await guest.goto(`http://localhost:5173/?room=${code}`);
  await guest.locator('#loading.loaded').waitFor();
  assert.equal(await guest.inputValue('#room-code'), code);
  await guest.fill('#driver-name', '<Rival & Co>');
  await guest.getByRole('button', { name: 'Lagoon blue', exact: true }).click();
  await guest.click('#join-room');
  await guest.locator('#lobby-screen:visible').waitFor();
  await host.waitForFunction(
    () => window.__SLIPSTREAM__!.diagnostics().network.room?.seats[1].name === '<Rival & Co>',
  );
  assert.deepEqual((await read(host)).carColors.slice(0, 2), ['#f2748f', '#70dbe0']);
  assert.ok((await host.locator('#seat-list').textContent())!.includes('<Rival & Co>'));
  await guest.click('#ready-button');
  await guest.click('#edit-driver summary');
  await guest.fill('#lobby-name', 'Lagoon Racer');
  await guest.locator('#lobby-colors').getByRole('button', { name: 'Orchid purple' }).click();
  await guest.locator('#profile-form button[type=submit]').click();
  await host.waitForFunction(
    () => window.__SLIPSTREAM__!.diagnostics().network.room?.seats[1].color === '#bca0f1',
  );
  assert.equal((await read(host)).network.room!.seats[1].ready, false);
  assert.equal((await read(host)).carColors[1], '#bca0f1');
  await host.screenshot({ path: 'artifacts/online-lobby.png' });
  await guest.click('#ready-button');
  await host.click('#ready-button');
  await host.click('#start-race');
  await host.waitForFunction(
    () => window.__SLIPSTREAM__!.diagnostics().network.latest?.phase === 'racing',
  );
  await guest.waitForFunction(
    () => window.__SLIPSTREAM__!.diagnostics().network.latest?.phase === 'racing',
  );
  // Separate contexts are independent players; real key events drive the local car.
  await host.bringToFront();
  if ((await read(host)).mode === 'paused') await host.click('#resume');
  await host.keyboard.down('w');
  await host.waitForFunction(() => window.__SLIPSTREAM__!.diagnostics().state.speed > 12);
  await host.keyboard.up('w');
  const driving = await read(host);
  assert.equal(driving.audio.loaded, true);
  assert.equal(driving.audio.context, 'running');
  assert.ok(driving.audio.gain > 0);
  await host.screenshot({ path: 'artifacts/online-race.png' });
  await host.keyboard.press('Escape');
  await host.locator('#engine-volume').fill('20');
  assert.equal((await read(host)).audio.volume, 0.2);
  await host.click('#sound');
  await host.waitForTimeout(300);
  assert.ok((await read(host)).audio.gain < 0.005);
  await host.click('#resume');
  // Force a real connection drop and verify the same car/name/colour returns.
  const identity = (await read(guest)).network.room!.seats[1].playerId;
  await guestSocket!.close({ code: 1012, reason: 'Connection recovery test' });
  await guest.waitForFunction(
    () => window.__SLIPSTREAM__!.diagnostics().network.status === 'reconnecting',
    null,
    { timeout: 15000 },
  );
  await guest.waitForFunction(
    () => window.__SLIPSTREAM__!.diagnostics().network.status === 'online',
    null,
    { timeout: 15000 },
  );
  const restored = await read(guest);
  assert.equal(restored.network.room!.seats[1].playerId, identity);
  assert.equal(restored.network.room!.seats[1].name, 'Lagoon Racer');
  assert.equal(restored.carColors[1], '#bca0f1');
  // Reload restores the session from tab storage and retains custom paint.
  await guest.reload();
  await guest.waitForFunction(
    () => window.__SLIPSTREAM__?.diagnostics().network.status === 'online',
  );
  assert.equal((await read(guest)).carColors[1], '#bca0f1');
  await guest.keyboard.press('Escape');
  if ((await read(guest)).mode !== 'paused') await guest.click('#pause');
  await guest.click('#exit');
  await guest.click('#play-online');
  assert.equal(await guest.inputValue('#driver-name'), 'Lagoon Racer');
  assert.equal(
    await guest.locator('#driver-colors [aria-pressed=true]').getAttribute('data-color'),
    '#bca0f1',
  );
  await guest.setViewportSize({ width: 390, height: 667 });
  await guest.screenshot({ path: 'artifacts/online-small.png' });
  await guest.click('#create-room');
  await guest.locator('#lobby-screen:visible').waitFor();
  await guest.screenshot({ path: 'artifacts/lobby-small.png' });
  await guest.click('#leave-lobby');
  assert.deepEqual(errors, []);
  await writeFile(
    'artifacts/multiplayer-report.json',
    JSON.stringify({ errors, driving, restored }, null, 2),
  );
  console.log(
    'Two-browser multiplayer, customisation, engine audio, reconnect and reload checks passed.',
  );
} finally {
  await browser.close();
}
