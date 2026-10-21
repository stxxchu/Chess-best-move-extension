import * as V from './vision.js';

const CONTENT_FILES = ['chessutil.js', 'i18n.js', 'content.js'];
const templateCache = new Map();
const lastSquares = new Map();
const quota = { windowStart: 0, used: 0 };
let creatingOffscreen = null;

chrome.action.onClicked.addListener(tab => openPanel(tab, 'toggle'));

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'scan-now' && tab) openPanel(tab, 'scan-now');
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== 'bg') return;
  const handler = { scan, analyze, progress, teach, resetCalibration }[msg.type];
  if (!handler) return;
  handler(msg, sender).then(sendResponse, e => sendResponse({ ok: false, error: String(e && e.message || e) }));
  return true;
});

async function openPanel(tab, type) {
  try {
    await ensureInjected(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type });
  } catch {
    chrome.action.setBadgeText({ tabId: tab.id, text: '✕' });
    chrome.action.setTitle({ tabId: tab.id, title: chrome.i18n.getMessage('unsupportedPage') });
  }
}

async function ensureInjected(tabId) {
  try {
    const r = await chrome.tabs.sendMessage(tabId, { type: 'ping' });
    if (r && r.pong) return;
  } catch {}
  await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function takeCaptureSlot() {
  let now = Date.now();
  if (now - quota.windowStart >= 1000) { quota.windowStart = now; quota.used = 0; }
  if (quota.used >= 2) {
    await sleep(quota.windowStart + 1030 - now);
    now = Date.now();
    quota.windowStart = now;
    quota.used = 0;
  }
  quota.used++;
}

async function captureTab(tab) {
  const current = await chrome.tabs.get(tab.id);
  if (!current.active) throw new Error('tab-hidden');
  let dataUrl;
  for (let attempt = 0; !dataUrl; attempt++) {
    await takeCaptureSlot();
    try {
      dataUrl = await chrome.tabs.captureVisibleTab(current.windowId, { format: 'png' });
    } catch (e) {
      if (attempt > 1 || !/MAX_CAPTURE/.test(e.message)) throw e;
      quota.used = 2;
    }
  }
  const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: id.data, width: id.width, height: id.height };
}

async function getTemplates(host) {
  if (templateCache.has(host)) return templateCache.get(host);
  const key = 'tpl:' + host;
  const raw = (await chrome.storage.local.get(key))[key];
  const entry = raw ? { raw, items: V.loadTemplates(raw) } : null;
  if (entry && !entry.items) return null;
  templateCache.set(host, entry);
  return entry;
}

async function saveTemplates(host, raw) {
  await chrome.storage.local.set({ ['tpl:' + host]: raw });
  const entry = { raw, items: V.loadTemplates(raw) };
  templateCache.set(host, entry);
  return entry;
}

const scaleRect = (r, k) => r && { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k };
const isStartGrid = grid => grid === V.START || grid === [...V.START].reverse().join('');

async function scan(msg, sender) {
  const t0 = performance.now();
  const img = await captureTab(sender.tab);
  const k = img.width / msg.viewport.w;
  const toCss = r => ({ x: r.x / k, y: r.y / k, w: r.w / k, h: r.h / k });

  let rect = null;
  if (msg.manualRect) {
    const hint = scaleRect(msg.manualRect, k);
    rect = V.detectBoard(img, hint) || hint;
  } else {
    const last = scaleRect(msg.lastRect, k);
    rect = last && V.verifyBoard(img, last) >= 20 ? last : V.detectBoard(img);
  }
  if (!rect) return { ok: false, error: 'no-board' };
  if (rect.partial) return { ok: false, error: 'partial', rect: toCss(rect) };

  const sq = V.analyzeSquares(img, rect);
  const base = { rect: toCss(rect), colors: sq.colors };
  let tpl = await getTemplates(msg.host);
  let calibrated = false;

  if (msg.calibrate || !tpl) {
    const cal = V.calibrate(sq);
    if (!cal.ok) return { ok: false, error: tpl ? 'not-start' : 'needs-calibration', ...base };
    tpl = await saveTemplates(msg.host, cal.templates);
    calibrated = true;
  }

  let res = V.classify(sq, tpl.items);
  if (!calibrated && V.looksLikeStart(sq) && (!isStartGrid(res.grid) || res.mismatch > V.MISMATCH)) {
    const cal = V.calibrate(sq);
    if (cal.ok) {
      tpl = await saveTemplates(msg.host, cal.templates);
      res = V.classify(sq, tpl.items);
      calibrated = true;
    }
  }
  if (res.mismatch > V.MISMATCH) return { ok: false, error: 'mismatch', ...base };
  lastSquares.set(sender.tab.id, { host: msg.host, sq });
  return { ok: true, ...base, grid: res.grid, conf: res.conf, calibrated, ms: Math.round(performance.now() - t0) };
}

async function teach(msg, sender) {
  const last = lastSquares.get(sender.tab.id);
  const tpl = last && last.host === msg.host && await getTemplates(msg.host);
  if (!tpl) return { ok: false };
  await saveTemplates(msg.host, V.teach(tpl.raw, last.sq, msg.index, msg.piece));
  return { ok: true };
}

async function resetCalibration(msg) {
  templateCache.delete(msg.host);
  await chrome.storage.local.remove('tpl:' + msg.host);
  return { ok: true };
}

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS'],
      justification: 'Stockfish runs in a Web Worker',
    }).finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

async function analyze(msg, sender) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({
    target: 'offscreen', type: 'analyze', fen: msg.fen, movetime: msg.movetime, multipv: msg.multipv || 3,
    tabId: sender.tab && sender.tab.id, seq: msg.seq,
  });
}

async function progress(msg) {
  await chrome.tabs.sendMessage(msg.tabId, { type: 'progress', seq: msg.seq, lines: msg.lines, depth: msg.depth }).catch(() => {});
  return { ok: true };
}
