import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { BRAVE } from './fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const runs = +(process.argv[2] || 5);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const median = a => [...a].sort((x, y) => x - y)[a.length >> 1];

const server = await startServer(8768);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chess-hints-latency-'));
const browser = await puppeteer.launch({
  executablePath: BRAVE, headless: 'new', pipe: true, userDataDir: profile,
  enableExtensions: [path.resolve(here, '../extension')], args: ['--no-first-run'],
  defaultViewport: { width: 1366, height: 768 },
});

try {
  const sw = await (await browser.waitForTarget(t => t.type() === 'service_worker')).worker();
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8768/board.html?lib=cg&size=560', { waitUntil: 'networkidle0' });
  await page.bringToFront();
  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['chessutil.js', 'i18n.js', 'content.js'] });
    await chrome.tabs.sendMessage(tab.id, { type: 'scan-now' });
  });
  const status = () => page.evaluate(() => document.querySelector('chess-hints-panel').shadowRoot.querySelector('.js-status').textContent);
  for (let i = 0; i < 100 && !/scan \d+ ms|skan \d+ ms/.test(await status()); i++) await sleep(100);
  await page.evaluate(() => {
    const cb = document.querySelector('chess-hints-panel').shadowRoot.querySelector('.js-auto');
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
  });

  for (const animate of [true, false]) {
    const times = [];
    for (let i = 0; i < runs; i++) {
      await page.evaluate(animate => window.cg.set({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', animation: { enabled: animate } }), animate);
      for (let j = 0; j < 100 && !/scan \d+ ms|skan \d+ ms/.test(await status()); j++) await sleep(50);
      await page.evaluate(() => window.cg.move('e2', 'e4'));
      for (let j = 0; j < 100 && !/Waiting|Czekam/.test(await status()); j++) await sleep(50);
      await sleep(1100);
      times.push(await page.evaluate(() => new Promise(resolve => {
        const root = document.querySelector('chess-hints-panel').shadowRoot;
        const t0 = performance.now();
        window.cg.move('c7', 'c5');
        const tick = () => {
          const ready = root.querySelector('.js-fen code').textContent.includes('/2p5/') && root.querySelectorAll('svg.arrows polygon').length;
          if (ready) resolve(Math.round(performance.now() - t0));
          else if (performance.now() - t0 > 10000) resolve(-1);
          else requestAnimationFrame(tick);
        };
        tick();
      })));
    }
    console.log(`${animate ? 'site animation on ' : 'site animation off'}: opponent move -> first arrows, median ${median(times)} ms (${times.join(', ')})`);
  }
} finally {
  await browser.close();
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
