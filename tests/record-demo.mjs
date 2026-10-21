import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import gifenc from 'gifenc';
import { startServer } from './server.mjs';
import { BRAVE } from './fixtures.mjs';

const { GIFEncoder, quantize, applyPalette } = gifenc;
const here = path.dirname(fileURLToPath(import.meta.url));
const docs = path.resolve(here, '../docs');
const SCALE = 0.75;
const TOP = 56;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = await startServer(8769);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chess-hints-demo-'));
const browser = await puppeteer.launch({
  executablePath: BRAVE, headless: 'new', pipe: true, userDataDir: profile,
  enableExtensions: [path.resolve(here, '../extension')],
  args: ['--no-first-run', '--lang=en-US'],
  defaultViewport: { width: 1280, height: 760, deviceScaleFactor: SCALE },
});

const frames = [];
let recording = false;

async function record(page) {
  while (recording) {
    const t = Date.now();
    frames.push({ t, png: await page.screenshot({ type: 'png', captureBeyondViewport: false }) });
    const wait = 100 - (Date.now() - t);
    if (wait > 0) await sleep(wait);
  }
}

try {
  const sw = await (await browser.waitForTarget(t => t.type() === 'service_worker')).worker();
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8769/board.html?lib=cg&size=520', { waitUntil: 'networkidle0' });
  await page.bringToFront();
  await sw.evaluate(() => chrome.storage.local.set({ settings: { onboarded: true, level: 'best', lang: 'en', theme: 'dark', movetime: 1000, arrows: true, evalBar: true } }));

  const status = () => page.evaluate(() => document.querySelector('chess-hints-panel')?.shadowRoot.querySelector('.js-status').textContent || '');
  const waitStatus = async re => { for (let i = 0; i < 200 && !re.test(await status()); i++) await sleep(50); };
  const panel = (action, arg) => page.evaluate((action, arg) => {
    const root = document.querySelector('chess-hints-panel').shadowRoot;
    const el = root.querySelector(arg);
    if (action === 'check') { el.checked = true; el.dispatchEvent(new Event('change')); } else el.click();
  }, action, arg);

  recording = true;
  const recorder = record(page);
  await sleep(800);
  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['chessutil.js', 'i18n.js', 'content.js'] });
    await chrome.tabs.sendMessage(tab.id, { type: 'scan-now' });
  });
  await waitStatus(/scan \d+ ms/);
  await sleep(1200);
  await panel('check', '.js-auto');

  for (const [from, to] of [['e2', 'e4'], ['c7', 'c5'], ['g1', 'f3'], ['d7', 'd6'], ['d2', 'd4'], ['c5', 'd4'], ['f3', 'd4'], ['g8', 'f6']]) {
    await page.evaluate((a, b) => window.cg.move(a, b), from, to);
    await sleep(300);
    await waitStatus(/Waiting|scan \d+ ms/);
    await sleep(700);
  }

  for (const level of ['excellent', 'good', 'worst', 'best']) {
    await panel('click', `.js-levels [data-level="${level}"]`);
    await waitStatus(/scan \d+ ms/);
    await sleep(1100);
  }

  await page.evaluate(() => window.cg.set({ fen: '6k1/5ppp/8/8/8/8/8/RRR3K1', lastMove: undefined }));
  await sleep(300);
  await waitStatus(/scan \d+ ms/);
  await sleep(1800);
  const still = crop(await page.screenshot({ type: 'png', captureBeyondViewport: false }));
  const out = new PNG({ width: still.width, height: still.height });
  out.data.set(still.data);
  fs.writeFileSync(path.join(docs, 'marks.png'), PNG.sync.write(out));
  recording = false;
  await recorder;
} finally {
  await browser.close();
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
}

function crop(png) {
  const img = PNG.sync.read(png);
  const top = Math.round(TOP * SCALE), height = img.height - top;
  return { width: img.width, height, data: new Uint8Array(img.data.subarray(top * img.width * 4)) };
}

const decoded = frames.map(f => ({ t: f.t, img: crop(f.png) }));
const { width, height } = decoded[0].img;
const sample = new Uint8Array(width * height * 4 * 3);
[0, decoded.length >> 1, decoded.length - 1].forEach((k, i) => sample.set(decoded[k].img.data, i * width * height * 4));
const palette = quantize(sample, 255);
const TRANSPARENT = palette.length;
palette.push([255, 0, 255]);

const gif = GIFEncoder();
let prev = null;
for (let k = 0; k < decoded.length; k++) {
  const index = applyPalette(decoded[k].img.data, palette);
  const delay = k + 1 < decoded.length ? decoded[k + 1].t - decoded[k].t : 2500;
  if (prev && index.every((v, i) => v === prev[i])) {
    gif.writeFrame(new Uint8Array(index.length).fill(TRANSPARENT), width, height, { delay, transparent: true, transparentIndex: TRANSPARENT, dispose: 1 });
    continue;
  }
  const frame = prev ? index.map((v, i) => (v === prev[i] ? TRANSPARENT : v)) : index;
  gif.writeFrame(frame, width, height, { palette: k === 0 ? palette : undefined, delay, transparent: k > 0, transparentIndex: TRANSPARENT, dispose: 1 });
  prev = index;
}
gif.finish();
fs.writeFileSync(path.join(docs, 'demo.gif'), gif.bytes());
console.log(`docs/demo.gif: ${decoded.length} frames, ${width}x${height}, ${(fs.statSync(path.join(docs, 'demo.gif')).size / 1024 / 1024).toFixed(1)} MB, ${((decoded.at(-1).t - decoded[0].t) / 1000).toFixed(1)} s`);
