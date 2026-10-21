import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROME } from './fixtures.mjs';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '../extension/icons');
const svg = size => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs><clipPath id="r"><rect width="128" height="128" rx="26"/></clipPath></defs>
  <g clip-path="url(#r)">
    <rect width="128" height="128" fill="#eeeed2"/>
    <rect width="64" height="64" fill="#769656"/><rect x="64" y="64" width="64" height="64" fill="#769656"/>
  </g>
  <path d="M30 98 L92 36" stroke="#f97316" stroke-width="12" stroke-linecap="round"/>
  <path d="M100 28 L70 36 L92 58 Z" fill="#f97316"/>
  <text x="58" y="110" font-size="78" text-anchor="middle" font-family="Segoe UI Symbol, DejaVu Sans" fill="#1d1e21" stroke="#fff" stroke-width="3" paint-order="stroke">♞</text>
</svg>`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size)}</body></html>`);
  await page.screenshot({ path: path.join(out, `icon${size}.png`), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log('icons written to', out);
