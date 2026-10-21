import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './server.mjs';
import { POSITIONS, CHROME } from './fixtures.mjs';

const outDir = process.argv[2];
fs.mkdirSync(outDir, { recursive: true });

const CONFIGS = [
  { lib: 'cg', vw: 1366, vh: 768, dpr: 1, size: 560 },
  { lib: 'cg', vw: 1600, vh: 900, dpr: 1.25, size: 680, last: true },
  { lib: 'cm+green+staunty', vw: 1366, vh: 768, dpr: 1, size: 600, light: true },
  { lib: 'cm+blue+standard', vw: 1280, vh: 720, dpr: 1.5, size: 480 },
  { lib: 'cm+default+standard', vw: 1920, vh: 1080, dpr: 1, size: 760 },
  { lib: 'cm+chess-club+staunty', vw: 1366, vh: 768, dpr: 1, size: 400 },
  { lib: 'cm+chessboard-js+standard', vw: 1024, vh: 700, dpr: 1, size: 320 },
];

const server = await startServer(8765);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run'] });
const manifest = [];
try {
  for (const cfg of CONFIGS) {
    const page = await browser.newPage();
    await page.setViewport({ width: cfg.vw, height: cfg.vh, deviceScaleFactor: cfg.dpr });
    for (const [name, pos] of Object.entries(POSITIONS)) {
      for (const black of [false, true]) {
        const q = new URLSearchParams({ lib: cfg.lib, fen: pos.fen, size: cfg.size, black: black ? 1 : 0 });
        if (cfg.light) q.set('light', '1');
        if (cfg.last && pos.last) q.set('last', pos.last);
        await page.goto('http://127.0.0.1:8765/board.html?' + q, { waitUntil: 'networkidle0' });
        await page.waitForFunction('window.boardReady === true');
        await new Promise(r => setTimeout(r, 400));
        const file = `${cfg.lib}_${cfg.size}_${name}${black ? '_black' : ''}.png`;
        await page.screenshot({ path: path.join(outDir, file) });
        manifest.push({ file, fen: pos.fen, whiteBottom: !black, lib: cfg.lib, viewport: { w: cfg.vw, h: cfg.vh } });
      }
    }
    await page.close();
    console.log('done', cfg.lib, cfg.size);
  }
} finally {
  await browser.close();
  server.close();
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(manifest.length, 'screenshots');
