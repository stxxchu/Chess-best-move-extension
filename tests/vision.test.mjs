import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import * as V from '../extension/vision.js';
import { placement } from './fixtures.mjs';

const dir = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const load = f => { const p = PNG.sync.read(fs.readFileSync(path.join(dir, f))); return { data: new Uint8ClampedArray(p.data.buffer, p.data.byteOffset, p.data.length), width: p.width, height: p.height }; };

const groups = {};
for (const m of manifest) (groups[m.file.split('_').slice(0, 2).join('_')] ??= []).push(m);

let total = 0, perfect = 0, squaresWrong = 0;
for (const [g, items] of Object.entries(groups)) {
  const startItem = items.find(m => m.file.endsWith('_start.png'));
  const img0 = load(startItem.file);
  let t = performance.now();
  const rect0 = V.detectBoard(img0);
  const tDetect = performance.now() - t;
  if (!rect0) { console.log(g, 'NO BOARD in start'); continue; }
  const cal = V.calibrate(V.analyzeSquares(img0, rect0));
  if (!cal.ok) { console.log(g, 'calibration failed', cal.error, rect0); continue; }
  const tpl = V.loadTemplates(JSON.parse(JSON.stringify(cal.templates)));
  console.log(`\n${g}: rect ${rect0.x.toFixed(1)},${rect0.y.toFixed(1)} ${rect0.w.toFixed(1)}x${rect0.h.toFixed(1)} hits=${rect0.hits} detect=${tDetect.toFixed(0)}ms whiteBottom=${cal.templates.whiteBottom} colors=${JSON.stringify(cal.templates.colors)}`);
  for (const m of items) {
    const img = load(m.file);
    t = performance.now();
    const rect = V.detectBoard(img);
    const t1 = performance.now();
    if (!rect) { console.log('  ', m.file, 'NO BOARD'); total++; continue; }
    const sq = V.analyzeSquares(img, rect);
    const res = V.classify(sq, tpl);
    const t2 = performance.now();
    const truth = placement(m.fen);
    const screenTruth = m.whiteBottom ? truth : [...truth].reverse().join('');
    const wrong = [];
    for (let i = 0; i < 64; i++) if (res.grid[i] !== screenTruth[i]) wrong.push(`${i}:${screenTruth[i]}->${res.grid[i]}`);
    total++; if (!wrong.length) perfect++; squaresWrong += wrong.length;
    const minConf = Math.min(...res.conf).toFixed(2);
    const verify = V.verifyBoard(img, rect);
    console.log(`   ${wrong.length ? 'FAIL' : 'ok  '} ${m.file.padEnd(44)} hits=${rect.hits} verify=${verify} detect=${(t1 - t).toFixed(0)}ms classify=${(t2 - t1).toFixed(0)}ms minConf=${minConf} ${wrong.join(' ')}`);
  }
}
console.log(`\n${perfect}/${total} positions perfect, ${squaresWrong} wrong squares`);
process.exitCode = perfect === total ? 0 : 1;
