const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5230';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname))
  throw Error('Local test data only');
const b = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
async function test(name, run) {
  try {
    await run();
    results.push({ name, pass: true });
    console.log('PASS', name);
  } catch (e) {
    results.push({ name, pass: false, error: e.message });
    console.log('FAIL', name, e.message.slice(0, 220));
  }
}
async function page(options = {}) {
  const c = await b.newContext(options);
  await c.addInitScript(() => localStorage.setItem('jamopop.age-confirmed.v1', '14+'));
  return c.newPage();
}
async function post(p, path, data) {
  const r = await p.request.post(base + path, { data, headers: { Origin: base } });
  const d = await r.json();
  if (!r.ok()) throw Error(JSON.stringify(d));
  return d;
}
async function room(p, width = 5) {
  return post(p, '/api/game', {
    action: 'create',
    roomName: '입력 QA ' + Date.now(),
    name: '테스터',
    avatar: '🐱',
    width,
    variant: 'normal',
    includeState: true,
  });
}
try {
  for (const width of [5, 6, 7])
    await test(`room ${width} direct keys/overflow/selection`, async () => {
      const p = await page();
      const d = await room(p, width);
      await p.goto(base + '/?r=' + d.roomId);
      const i = p.getByRole('textbox', { name: '단어 입력', exact: true });
      await i.waitFor({ state: 'attached' });
      await p.locator('.main-board').click();
      await p.keyboard.type('r'.repeat(width));
      assert.equal(await i.inputValue(), 'ㄱ'.repeat(width));
      await p.keyboard.type('r');
      assert.equal(await i.inputValue(), 'ㄱ'.repeat(width + 1));
      assert((await p.locator('#input-status').textContent()).includes('칸에 맞춰'));
      await p.keyboard.press('Meta+a');
      await p.keyboard.type('tkrhk');
      assert.equal(await i.inputValue(), 'ㅅㅏㄱㅗㅏ');
      await p.close();
    });
  for (const path of ['/daily', '/solo', '/'])
    await test(`${path} touch key then physical key`, async () => {
      const p = await page();
      if (path === '/solo') await p.request.get(base + '/api/solo');
      if (path === '/solo') await post(p, '/api/solo', { action: 'start', stage: 1 });
      await p.goto(base + path);
      if (path === '/') await p.getByRole('button', { name: '시작하기', exact: true }).click();
      if (path === '/solo' && !(await p.locator('.main-board').count()))
        console.log('SOLO TEXT', await p.locator('body').innerText());
      await p.locator('.main-board').waitFor();
      await p.locator('.keyboard button').filter({ hasText: /^ㄱ$/ }).first().click();
      await p.keyboard.type('k');
      assert.equal(await p.locator('.game-input-control input').inputValue(), 'ㄱㅏ');
      await p.close();
    });
  await test('room chat backtick + submit focus + resume', async () => {
    const p = await page();
    const d = await room(p);
    await p.goto(base + '/?r=' + d.roomId);
    await p.locator('.main-board').click();
    await p.keyboard.type('r');
    await p.keyboard.press('Backquote');
    await p.waitForTimeout(250);
    const chat = p.locator('textarea').last();
    await chat.fill('입력 테스트');
    await chat.press('Enter');
    await p.waitForTimeout(250);
    assert(await chat.evaluate((e) => e === document.activeElement));
    assert.equal(await p.locator('.game-input-control input').inputValue(), 'ㄱ');
    await p.keyboard.press('Backquote');
    await p.keyboard.type('k');
    assert.equal(await p.locator('.game-input-control input').inputValue(), 'ㄱㅏ');
    await p.close();
  });

  await test('room rejected word + IME commit + held Enter + draft recovery', async () => {
    const p = await page();
    const d = await room(p);
    await p.goto(base + '/?r=' + d.roomId);
    await p.locator('.main-board').click();
    const i = p.locator('.game-input-control input');
    let guesses = 0;
    p.on('request', (r) => {
      if (
        r.method() === 'POST' &&
        r.url().endsWith('/api/game') &&
        r.postDataJSON()?.action === 'guess'
      )
        guesses++;
    });
    await p.keyboard.type('rrrrr');
    await p.waitForTimeout(500);
    await p.keyboard.press('Enter');
    assert.equal(await i.inputValue(), 'ㄱㄱㄱㄱㄱ');
    assert.equal(guesses, 0);
    await p.keyboard.press('Meta+a');
    await p.keyboard.insertText('사과');
    await i.evaluate((el) =>
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })),
    );
    await p.keyboard.press('Enter');
    assert.equal(guesses, 0);
    await i.evaluate((el) => {
      el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    });
    assert.equal(guesses, 0);
    await p.waitForTimeout(300);
    await p.keyboard.down('Enter');
    await p.keyboard.down('Enter');
    await p.keyboard.up('Enter');
    await p.waitForTimeout(700);
    assert.equal(guesses, 1);
    assert.equal(
      await p
        .locator('.main-board .tile[data-letter]')
        .filter({ hasText: /[ㄱ-ㅣ]/ })
        .count(),
      5,
    );
    await p.locator('.main-board').click();
    await p.keyboard.type('rk');
    await p.reload();
    await i.waitFor({ state: 'attached' });
    assert.equal(await i.inputValue(), 'ㄱㅏ');
    await p.close();
  });
  await test('failed submission retains draft and delayed response keeps chat focus', async () => {
    const p = await page();
    const d = await room(p);
    await p.goto(base + '/?r=' + d.roomId);
    await p.locator('.main-board').click();
    const input = p.locator('.game-input-control input');
    await p.keyboard.type('tkrhk');
    await p.waitForTimeout(400);
    let reject = true;
    await p.route('**/api/game', async (route) => {
      if (
        route.request().method() === 'POST' &&
        route.request().postDataJSON()?.action === 'guess'
      ) {
        if (reject) {
          reject = false;
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'QA temporary failure' }),
          });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      await route.continue();
    });
    await p.keyboard.press('Enter');
    await p.waitForTimeout(600);
    assert.equal(await input.inputValue(), 'ㅅㅏㄱㅗㅏ');
    await p.keyboard.press('Enter');
    await p.keyboard.press('Backquote');
    const chat = p.locator('textarea').last();
    await chat.fill('keep focus');
    await p.waitForTimeout(1200);
    assert(await chat.evaluate((el) => el === document.activeElement));
    assert.equal(await chat.inputValue(), 'keep focus');
    await p.close();
  });
  await test('room settings does not capture typing', async () => {
    const p = await page();
    const d = await room(p);
    await p.goto(base + '/?r=' + d.roomId);
    await p.locator('.main-board').click();
    await p.keyboard.type('rk');
    await p.getByRole('button', { name: '방 설정', exact: true }).click();
    const dialog = p.getByRole('dialog');
    await dialog.waitFor();
    const field = dialog.locator('input[type="text"],input:not([type])').first();
    await field.fill('설정 입력 QA');
    assert.equal(await p.locator('.game-input-control input').inputValue(), 'ㄱㅏ');
    await p.close();
  });
  await test('first-play colors and complete walkthrough', async () => {
    const p = await page();
    await p.goto(base);
    await p.getByRole('button', { name: '시작하기', exact: true }).click();
    for (const word of ['qkfka', 'tkrhk', 'tnqkr']) {
      await p.locator('.main-board').click();
      await p.keyboard.type(word);
      await p.getByRole('button', { name: '제출하기', exact: true }).click();
      if (word === 'qkfka') {
        for (const color of ['green', 'yellow', 'gray'])
          assert((await p.locator('.keyboard .key.' + color).count()) > 0);
        await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
        await p.waitForTimeout(300);
        const colors = await p
          .locator('.keyboard .key.green,.keyboard .key.yellow,.keyboard .key.gray')
          .evaluateAll((keys) => keys.map((el) => getComputedStyle(el).background));
        assert(new Set(colors).size >= 3);
      }
    }
    await p.locator('.first-play-next').waitFor();
    await p.close();
  });
  await test('speed countdown and direct input', async () => {
    const p = await page();
    const d = await room(p);
    await post(p, '/api/speed', { action: 'start', room: d.roomId, theme: 'food' });
    await p.goto(base + '/speed?room=' + d.roomId);
    await p.waitForTimeout(3500);
    await p.locator('.main-board').click();
    await p.keyboard.type('rk');
    assert.equal(await p.locator('.game-input-control input').inputValue(), 'ㄱㅏ');
    await p.close();
  });
  for (const options of [
    { viewport: { width: 1280, height: 900 } },
    { viewport: { width: 768, height: 1024 } },
    { ...devices['iPhone 13'] },
    { viewport: { width: 600, height: 700 } },
  ])
    await test(`layout ${options.viewport.width} and keyboard activation`, async () => {
      const p = await page(options);
      const d = await room(p);
      await p.goto(base + '/?r=' + d.roomId);
      await p.locator('.keyboard').waitFor();
      const key = p.locator('.keyboard button').filter({ hasText: /^ㄱ$/ }).first();
      await key.click();
      assert.equal(await p.locator('.game-input-control input').inputValue(), 'ㄱ');
      assert(await p.locator('.keyboard').isVisible());
      const hidden = await p.locator('.game-input-control').boundingBox();
      assert(hidden.width <= 1);
      const overflow = await p.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      console.log('LAYOUT', overflow);
      assert(overflow.scroll <= Math.max(overflow.width, 620) + 1);
      if (options.isMobile) {
        assert.equal(
          await p.locator('.game-input-control input').getAttribute('inputmode'),
          'none',
        );
      } else {
        await key.focus();
        await p.keyboard.press('Enter');
        assert(await key.evaluate((el) => el === document.activeElement));
        assert.equal(await p.locator('.game-input-control input').inputValue(), 'ㄱㄱ');
      }
      await p.emulateMedia({ reducedMotion: 'reduce' });
      await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      assert(await p.locator('.keyboard').isVisible());
      await p.close();
    });
} finally {
  console.log(JSON.stringify(results, null, 2));
  await b.close();
  if (results.some((r) => !r.pass)) process.exitCode = 1;
}
