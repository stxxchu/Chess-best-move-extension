import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { BRAVE } from './fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const extPath = path.resolve(here, '../extension');
const shotDir = process.argv[2] || here;
const exe = process.argv[3] || BRAVE;
fs.mkdirSync(shotDir, { recursive: true });

const server = await startServer(8766);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chess-hints-e2e-'));
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: 'new',
  pipe: true,
  enableExtensions: [extPath],
  userDataDir: profile,
  args: ['--no-first-run', '--no-default-browser-check', '--lang=en-US', '--window-size=1366,900'],
  defaultViewport: { width: 1366, height: 768 },
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (cond, msg) => { console.log(cond ? 'ok  ' : 'FAIL', msg); if (!cond) failures++; };
const TIER_ORDER = ['Best', 'Excellent', 'Good', 'Inaccuracy', 'Mistake', 'Blunder'];
const tierOf = tag => (tag.includes('Brilliant') ? 1 : tag.includes('Great') ? 0 : TIER_ORDER.findIndex(t => tag.endsWith(t)));

const readUi = p => p.evaluate(() => {
  const root = document.querySelector('chess-hints-panel')?.shadowRoot;
  if (!root) return null;
  const items = [...root.querySelectorAll('.js-moves li')];
  const bar = root.querySelector('.evalbar');
  return {
    status: root.querySelector('.js-status').textContent,
    notice: root.querySelector('.js-notice').hidden ? '' : root.querySelector('.js-notice').textContent,
    sequence: root.querySelector('.js-sequence').hidden ? '' : root.querySelector('.js-sequence').textContent,
    banner: root.querySelector('.mate-banner').hidden ? '' : root.querySelector('.mate-banner').textContent,
    mateOn: root.querySelector('.js-mate').checked,
    moves: items.map(li => li.querySelector('.mv').firstChild.textContent + ' ' + li.querySelector('.ev').textContent),
    tags: items.map(li => li.querySelector('.tag').textContent),
    extra: items.map(li => li.classList.contains('extra')),
    arrows: root.querySelectorAll('svg.arrows polygon').length,
    marks: root.querySelectorAll('svg.arrows circle[r="0.17"]').length,
    fen: root.querySelector('.js-fen code').textContent,
    level: root.querySelector('.js-levels .on')?.dataset.level,
    levelNames: [...root.querySelectorAll('.js-levels button')].map(b => b.textContent),
    onboard: !root.querySelector('.js-onboard').hidden,
    compact: root.querySelector('.panel').classList.contains('compact'),
    light: root.querySelector('.panel').classList.contains('light'),
    miniVisible: root.querySelector('.js-mini-wrap').getBoundingClientRect().height > 0,
    evalBar: bar.hidden ? null : { fill: parseFloat(bar.querySelector('.fill').style.height), label: bar.querySelector('.val').textContent, left: bar.getBoundingClientRect().left },
  };
});

const waitFor = async (p, pred, timeout = 20000) => {
  const t0 = Date.now();
  let s;
  while (Date.now() - t0 < timeout) {
    s = await readUi(p);
    if (s && pred(s)) return s;
    await sleep(100);
  }
  console.log('   last state:', JSON.stringify(s && { ...s, levelNames: undefined }));
  return null;
};

const final = s => /scan \d+ ms|skan \d+ ms/.test(s.status);
const panelDo = (p, action, arg) => p.evaluate((action, arg) => {
  const root = document.querySelector('chess-hints-panel').shadowRoot;
  const q = sel => root.querySelector(sel);
  if (action === 'click') q(arg).click();
  if (action === 'clickAll') root.querySelectorAll(arg.sel)[arg.index].click();
  if (action === 'select') { q(arg.sel).value = arg.value; q(arg.sel).dispatchEvent(new Event('change')); }
  if (action === 'check') { q(arg).checked = true; q(arg).dispatchEvent(new Event('change')); }
}, action, arg);
const clickLevel = (p, id) => panelDo(p, 'click', `.js-levels [data-level="${id}"]`);

try {
  const swTarget = await browser.waitForTarget(t => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'), { timeout: 15000 });
  const sw = await swTarget.worker();

  const trigger = type => sw.evaluate(async type => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    try { await chrome.tabs.sendMessage(tab.id, { type: 'ping' }); }
    catch { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['chessutil.js', 'i18n.js', 'content.js'] }); }
    await chrome.tabs.sendMessage(tab.id, { type });
  }, type);

  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8766/board.html?lib=cg&size=560', { waitUntil: 'networkidle0' });
  await page.bringToFront();

  await trigger('scan-now');
  let s = await waitFor(page, s => s.moves.length >= 3 && final(s));
  check(!!s, 'start position: auto-calibrated, suggestions shown');
  if (s) console.log('   ', s.moves.join(' | '), '|', s.status);
  check(s && s.levelNames.join() === 'Best,Excellent,Good,Average,Worst', 'English UI with an English browser');
  check(s && s.onboard, 'getting started card is shown on first use');
  check(s && s.fen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq'), 'start FEN recognised');
  check(s && s.arrows === s.moves.length, 'one arrow per suggestion');
  check(s && s.evalBar && s.evalBar.fill > 45 && s.evalBar.fill < 65 && s.evalBar.left < 40, 'eval bar next to the board, about equal: ' + JSON.stringify(s && s.evalBar));
  await page.screenshot({ path: path.join(shotDir, 'e2e_start.png') });

  await panelDo(page, 'click', '.js-onboard-ok');
  s = await readUi(page);
  check(s && !s.onboard, 'getting started card can be dismissed');

  const MAX_TIER = { best: 5, excellent: 1, good: 2, ok: 3 };
  for (const level of ['best', 'excellent', 'good', 'ok']) {
    await clickLevel(page, level);
    const st = await readUi(page);
    const shown = st.tags.filter((_, i) => !st.extra[i]);
    const worst = Math.max(...shown.map(tierOf));
    console.log(`    ${level.padEnd(9)} ${st.moves.map((m, i) => `${m} [${st.tags[i]}${st.extra[i] ? ', extra' : ''}]`).join(' | ')}`);
    check(shown.length >= 1 && final(st) && worst <= MAX_TIER[level], `level ${level}: instant, nothing worse than the level`);
  }

  await page.keyboard.press('1');
  s = await readUi(page);
  check(s && s.level === 'best', 'key 1 selects Best');
  await page.keyboard.press('3');
  s = await readUi(page);
  check(s && s.level === 'good', 'key 3 selects Good');

  await panelDo(page, 'select', { sel: '.js-lang', value: 'pl' });
  s = await readUi(page);
  check(s && s.levelNames[0] === 'Najlepsze' && /skan \d+ ms/.test(s.status), 'switching to Polish translates the panel and the status: ' + (s && s.status));
  await panelDo(page, 'select', { sel: '.js-lang', value: 'en' });
  await panelDo(page, 'select', { sel: '.js-theme', value: 'light' });
  s = await readUi(page);
  check(s && s.light, 'light theme');
  await page.screenshot({ path: path.join(shotDir, 'e2e_light.png') });
  await panelDo(page, 'select', { sel: '.js-theme', value: 'dark' });

  await panelDo(page, 'click', '.js-compact');
  s = await readUi(page);
  check(s && s.compact && !s.miniVisible && s.moves.length >= 3, 'compact mode hides the extras and keeps the moves');
  await page.screenshot({ path: path.join(shotDir, 'e2e_compact.png') });
  await panelDo(page, 'click', '.js-compact');

  await clickLevel(page, 'worst');
  s = await waitFor(page, s => s.moves.length === 3 && final(s) && /Worst/.test(s.status));
  check(s && s.moves[0].startsWith('g2–g4') && s.tags.map(tierOf).every((t, i, a) => i === 0 || t <= a[i - 1]), 'worst level analyses all 20 moves, g4 first: ' + (s && s.moves.map((m, i) => `${m} [${s.tags[i]}]`).join(' | ')));
  check(s && !s.extra.some(Boolean), 'no extra arrow in the worst mode');
  await clickLevel(page, 'best');
  s = await waitFor(page, s => final(s) && /Best/.test(s.status));
  check(!!s, 'back from worst to best re-analyses with the normal search');

  const eng = await sw.evaluate(async () => {
    const ask = (fen, movetime = 300, multipv = 3) => chrome.runtime.sendMessage({ target: 'offscreen', type: 'analyze', fen, movetime, multipv });
    const burst = await Promise.all([
      ask('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 3000),
      ask('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', 3000),
      ask('r1bqkbnr/pppppppp/2n5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2', 500),
    ]);
    return {
      burst: burst.map(r => (r.cancelled ? 'cancelled' : r.lines.map(l => l.move).join(','))),
      mate: await ask('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1'),
      stalemate: await ask('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'),
      single: await ask('7k/8/8/8/8/8/8/K5R1 b - - 0 1'),
      scholar: await ask('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', 1000),
      wide: await ask('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', 2000, 12),
      all: await ask('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', 1000, 256),
      broken: await ask('rnbqkbbr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b - - 0 1'),
      recovered: await ask('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
    };
  });
  check(eng.burst[0] === 'cancelled' && eng.burst[1] === 'cancelled' && eng.burst[2].split(',').length === 3, 'newest request wins: ' + eng.burst.join(' / '));
  check(eng.mate.gameOver === 'checkmate', 'checkmate detected');
  check(eng.stalemate.gameOver === 'stalemate', 'stalemate detected');
  check(eng.single.lines.length === 1 && eng.single.lines[0].move === 'h8h7', 'single legal move');
  check(eng.scholar.lines[0].move === 'h5f7' && eng.scholar.lines[0].score.mate === 1, 'mate in one found');
  check(eng.wide.lines.length === 12 && new Set(eng.wide.lines.map(l => l.move)).size === 12, `12 distinct candidates, depth ${eng.wide.depth}`);
  check(!eng.broken.ok && /Too many pieces/.test(eng.broken.error), 'impossible position gives an error instead of a fake result: ' + eng.broken.error);
  check(eng.recovered.ok && eng.recovered.lines.length === 3, 'engine restarts and works after that');
  check(eng.all.lines.length === 20 && new Set(eng.all.lines.map(l => l.move)).size === 20, `all 20 legal moves, depth ${eng.all.depth}`);

  await panelDo(page, 'check', '.js-auto');
  await page.evaluate(() => window.cg.move('e2', 'e4'));
  s = await waitFor(page, s => /Waiting for their move/.test(s.status));
  check(!!s, 'after 1.e4 (my move) it waits for the opponent');
  check(s && s.fen.includes(' b KQkq e3 '), 'black to move with en passant square: ' + (s && s.fen));

  const latency = await page.evaluate(() => new Promise(resolve => {
    const root = document.querySelector('chess-hints-panel').shadowRoot;
    const t0 = performance.now();
    let first = 0;
    window.cg.move('c7', 'c5');
    const tick = () => {
      const ready = root.querySelector('.js-fen code').textContent.startsWith('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w') && root.querySelectorAll('svg.arrows polygon').length > 0;
      if (ready && !first) first = performance.now() - t0;
      if (first && /scan \d+ ms/.test(root.querySelector('.js-status').textContent)) {
        resolve({ first: Math.round(first), final: Math.round(performance.now() - t0) });
        return;
      }
      if (performance.now() - t0 > 15000) { resolve({ first: Math.round(first), final: -1 }); return; }
      requestAnimationFrame(tick);
    };
    tick();
  }));
  console.log(`    opponent move -> first arrows ${latency.first} ms, final ${latency.final} ms`);
  check(latency.first > 0 && latency.first < 1000, 'arrows appear quickly after the opponent moves');
  await page.screenshot({ path: path.join(shotDir, 'e2e_sicilian.png') });

  await page.evaluate(() => window.cg.set({ fen: '6k1/5ppp/8/8/8/8/8/RRR3K1', lastMove: undefined }));
  s = await waitFor(page, s => final(s) && s.fen.startsWith('6k1/5ppp/8/8/8/8/8/RRR3K1'));
  console.log('   ', s && s.moves.map((m, i) => `${m} [${s.tags[i]}${s.extra[i] ? ', extra' : ''}]`).join(' | '));
  check(s && s.moves.length === 4 && s.extra[3] && s.tags.slice(0, 3).every(t => t.includes('★')), 'three equal mates are all marked, so a 4th unmarked arrow is added');
  check(s && s.arrows === 4 && s.marks === 3, 'four arrows on the board, three with a mark');
  check(s && s.evalBar && s.evalBar.fill > 90 && s.evalBar.label === 'M1', 'eval bar shows the mate: ' + JSON.stringify(s && s.evalBar));
  await page.screenshot({ path: path.join(shotDir, 'e2e_fourth.png') });

  await clickLevel(page, 'good');
  await page.evaluate(() => window.cg.set({ fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1', lastMove: undefined }));
  s = await waitFor(page, s => final(s) && s.fen.startsWith('6k1/5ppp/8/8/8/8/5PPP/3R2K1'));
  check(s && s.moves[0].startsWith('♖d1–d8#') && /M1/.test(s.moves[0]), 'only sensible move (mate in one) shown on the Good level');

  await page.evaluate(() => window.cg.set({ fen: '3k4/8/8/8/8/8/3q4/R3K3', lastMove: undefined }));
  s = await waitFor(page, s => final(s) && s.fen.startsWith('3k4/8/8/8/8/8/3q4/R3K3'));
  for (const level of ['best', 'excellent', 'good', 'ok']) {
    await clickLevel(page, level);
    const st = await readUi(page);
    check(st.moves.length === 1 && st.moves[0].startsWith('♔e1×d2') && /only one sensible move/i.test(st.notice) && !st.tags.some(t => /Mistake|Blunder/.test(t)),
      `forced position, level ${level}: only the saving move, a notice explains it, no blunder suggested: ${st.moves.join(" ")} [${st.tags.join(", ")}] ${st.notice}`);
  }
  await clickLevel(page, 'worst');
  s = await waitFor(page, s => final(s) && /Worst/.test(s.status));
  check(s && s.tags[0] === 'Blunder' && !s.notice, 'the blunder shows up on the Worst level only');
  await clickLevel(page, 'good');

  await page.keyboard.press('m');
  await page.evaluate(() => window.cg.set({ fen: '3r2k1/5ppp/8/8/8/8/4QPPP/4R1K1', lastMove: undefined }));
  s = await waitFor(page, s => final(s) && s.fen.startsWith('3r2k1/5ppp/8/8/8/8/4QPPP/4R1K1'));
  console.log('   ', s && JSON.stringify({ moves: s.moves, tags: s.tags, banner: s.banner, sequence: s.sequence, status: s.status }));
  check(s && s.mateOn && s.moves[0].startsWith('♕e2–e8+') && s.tags[0] === 'Mate in 2', 'mate mode (key M): the mating move comes first, tagged Mate in 2');
  check(s && s.banner === 'Mate in 2' && s.sequence === 'Line to mate: 1. ♕e2–e8+ ♜d8×e8 2. ♖e1×e8#', 'banner over the board and the full line to mate in the panel');
  check(s && s.arrows >= 1, 'arrow for the mating move');
  check(s && s.moves[0] && /then: ♜d8×e8\s+♖e1×e8#/.test(await page.evaluate(() => document.querySelector('chess-hints-panel').shadowRoot.querySelector('.js-moves li .pv').textContent)), 'the continuation ends with #');
  const bannerBox = await page.evaluate(() => { const b = document.querySelector('chess-hints-panel').shadowRoot.querySelector('.mate-banner').getBoundingClientRect(); return { bottom: b.bottom, top: b.top }; });
  check(bannerBox.bottom <= 80, 'the banner sits above the board, not over the pieces: ' + JSON.stringify(bannerBox));
  await page.screenshot({ path: path.join(shotDir, 'e2e_mate_mode.png') });

  await page.evaluate(() => window.cg.move('e2', 'e8'));
  s = await waitFor(page, s => /Waiting/.test(s.status) && s.fen.startsWith('3rQ1k1/'));
  check(s && !s.banner, 'after my move it waits for the reply and hides the banner');
  await page.evaluate(() => window.cg.move('d8', 'e8'));
  s = await waitFor(page, s => final(s) && s.fen.startsWith('4r1k1/'));
  check(s && s.moves[0].startsWith('♖e1×e8#') && s.banner === 'Mate in 1', 'Auto follows the line: now mate in 1');

  await page.evaluate(() => window.cg.set({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', lastMove: undefined }));
  s = await waitFor(page, s => final(s) && s.fen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w'));
  check(s && /No forced mate/.test(s.notice) && s.tags.length >= 1 && s.tags.every(t => t === '⚔ Attack') && !s.banner, 'no mate: attacking moves with a note: ' + (s && s.moves.join(' | ')));

  await page.evaluate(() => window.cg.set({ fen: '6k1/8/8/8/8/6q1/8/6K1', lastMove: undefined }));
  s = await waitFor(page, s => final(s) && s.fen.startsWith('6k1/8/8/8/8/6q1/8/6K1'));
  check(s && /forced mate in \d+/.test(s.notice) && !s.banner, 'opponent has a forced mate: warning and best defence: ' + (s && s.notice));

  await clickLevel(page, 'good');
  s = await readUi(page);
  check(s && !s.mateOn && /Good/.test(s.status), 'clicking a level leaves mate mode');

  await page.goto('http://127.0.0.1:8766/board.html?lib=' + encodeURIComponent('cm+green+staunty') + '&size=600&fen=' +
    encodeURIComponent('r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'), { waitUntil: 'networkidle0' });
  await trigger('scan-now');
  s = await waitFor(page, s => /look different/.test(s.status));
  check(!!s, 'changed piece set is detected and recalibration is suggested');

  const page2 = await browser.newPage();
  await page2.goto('http://localhost:8766/board.html?lib=' + encodeURIComponent('cm+green+staunty') + '&size=600&light=1&black=1&fen=' +
    encodeURIComponent('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'), { waitUntil: 'networkidle0' });
  await page2.bringToFront();
  await page.close();
  await trigger('scan-now');
  s = await waitFor(page2, s => /First time|depth|Calibrated/.test(s.status));
  check(s && /First time/.test(s.status), 'new site, not the starting position: asks for calibration');

  await page2.evaluate(() => window.cb.setPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', false));
  await sleep(300);
  await trigger('scan-now');
  s = await waitFor(page2, s => /Waiting|depth/.test(s.status));
  check(s && /Waiting/.test(s.status), 'calibrated with black at the bottom, white to move: waiting');
  await page2.evaluate(() => window.cb.setPosition('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR', false));
  await sleep(300);
  await trigger('scan-now');
  s = await waitFor(page2, s => s.moves.length >= 3 && final(s));
  check(s && s.fen.startsWith('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3'), 'black to move, suggestions shown: ' + (s && s.moves.join(' | ')));

  await panelDo(page2, 'clickAll', { sel: '.js-mini div', index: 57 });
  await panelDo(page2, 'click', '.js-picker [data-piece="."]');
  s = await waitFor(page2, s => s.fen.startsWith('rnbqkb1r/') && final(s));
  check(!!s, 'clicking g8 on the small board and marking it empty fixes the position: ' + (s && s.fen));
  await page2.screenshot({ path: path.join(shotDir, 'e2e_corrected.png') });
  await sleep(1200);
  await trigger('scan-now');
  await sleep(1500);
  s = await waitFor(page2, s => final(s));
  check(s && s.fen.startsWith('rnbqkb1r/'), 'the correction is learned: a fresh scan reads g8 as empty');
  await page2.screenshot({ path: path.join(shotDir, 'e2e_black.png') });
} catch (e) {
  console.log('FAIL exception', e);
  failures++;
} finally {
  await browser.close();
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
console.log(failures ? `${failures} failure(s)` : 'all e2e checks passed');
process.exitCode = failures ? 1 : 0;
