import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import * as V from '../extension/vision.js';
import { placement } from './fixtures.mjs';

const dir = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const load = f => { const p = PNG.sync.read(fs.readFileSync(path.join(dir, f))); return { data: new Uint8ClampedArray(p.data.buffer, p.data.byteOffset, p.data.length), width: p.width, height: p.height }; };

const PAIRS = [['cg_560', 'cg_680'], ['cg_680', 'cg_560']];
let bad = 0;
for (const [from, to] of PAIRS) {
  const img0 = load(`${from}_start.png`);
  const cal = V.calibrate(V.analyzeSquares(img0, V.detectBoard(img0)));
  const tpl = V.loadTemplates(cal.templates);
  for (const m of manifest.filter(m => m.file.startsWith(to + '_'))) {
    const img = load(m.file);
    const res = V.classify(V.analyzeSquares(img, V.detectBoard(img)), tpl);
    const truth = placement(m.fen);
    const st = m.whiteBottom ? truth : [...truth].reverse().join('');
    const wrong = [...st].filter((p, i) => res.grid[i] !== p).length;
    bad += wrong ? 1 : 0;
    console.log(`${wrong ? 'FAIL' : 'ok  '} ${from} -> ${m.file} wrong=${wrong} minConf=${Math.min(...res.conf).toFixed(2)}`);
  }
}
process.exitCode = bad ? 1 : 0;
