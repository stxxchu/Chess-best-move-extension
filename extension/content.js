(() => {
  if (window.__chessHints) return;
  window.__chessHints = true;
  const CU = globalThis.ChessUtil;
  const I18N = globalThis.ChessHintsI18n;

  const CANDIDATES = 12;
  const ALL_MOVES = 256;
  const SCAN_ERRORS = ['no-board', 'partial', 'needs-calibration', 'not-start', 'mismatch'];
  const settings = {
    side: 'bottom', orient: 'auto', movetime: 2000, arrows: true, evalBar: true, auto: false, pos: null,
    min: false, compact: false, level: 'good', mate: false, lang: 'auto', theme: 'dark', onboarded: false,
  };
  const game = { prev: null, lost: {}, stm: null, stmKnown: false, ep: '-', whiteBottom: true, fen: null, lastTo: -1, oneOff: 0 };
  const view = {
    rect: null, manualRect: null, grid: null, conf: null, board: null, colors: null, lines: null, analysis: null, job: null,
    status: null, done: null, notice: null, noticeKind: 'warn', mate: null, busy: false, pending: null, lastScan: 0, scanMs: 0, evalScore: null, evalFresh: false, picking: -1,
  };
  let palette = ['#16a34a', '#2563eb', '#f97316', '#7c3aed'];
  let seq = 0;
  let alive = true;
  let t = I18N.translator(I18N.pick(settings.lang, chrome.i18n.getUILanguage()));

  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .panel {
    --sq-light: #eeeed2; --sq-dark: #769656; --accent: #769656; --accent-ink: #fff;
    --bg: #1d1e21; --fg: #e7e7ea; --strong: #fff; --muted: #9a9ea8; --soft: #b9bcc4; --faint: #8b8f99;
    --card: #26282d; --card-alt: #222428; --btn: #2b2d33; --btn-hover: #33363d; --hover: #2f3238;
    --line: #34363c; --line-strong: #3a3d44; --chip-bg: #1b1c20;
    --pos: #86efac; --neg: #fca5a5; --ok: #86efac; --warn: #fbbf24; --err: #f87171; --link: #93c5fd;
    position: fixed; top: 72px; right: 16px; width: 320px; max-height: calc(100vh - 32px); overflow: auto;
    background: var(--bg); color: var(--fg); border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.45);
    font: 13px/1.4 system-ui, "Segoe UI", Roboto, sans-serif; border: 1px solid var(--line); user-select: none;
  }
  .panel.light {
    --bg: #fff; --fg: #1f2328; --strong: #111827; --muted: #6b7280; --soft: #4b5563; --faint: #6b7280;
    --card: #f3f4f6; --card-alt: #f9fafb; --btn: #f3f4f6; --btn-hover: #e5e7eb; --hover: #e5e7eb;
    --line: #e5e7eb; --line-strong: #d1d5db; --chip-bg: #e5e7eb;
    --pos: #15803d; --neg: #b91c1c; --ok: #15803d; --warn: #b45309; --err: #b91c1c; --link: #1d4ed8;
    box-shadow: 0 12px 40px rgba(0,0,0,.18);
  }
  .head { display: flex; align-items: center; gap: 6px; padding: 9px 10px 9px 12px; cursor: move;
    background: var(--accent); color: var(--accent-ink); border-radius: 11px 11px 0 0; }
  .panel.min .head { border-radius: 11px; }
  .head b { flex: 1; font-size: 13px; letter-spacing: .2px; }
  .logo { font-size: 18px; line-height: 1; }
  .icon { all: unset; cursor: pointer; width: 22px; height: 22px; border-radius: 6px; text-align: center; line-height: 22px; font-size: 15px; color: inherit; }
  .icon:hover { background: rgba(0,0,0,.18); }
  .body { padding: 10px 12px 12px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .panel.min .body { display: none; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  button.btn { all: unset; cursor: pointer; padding: 7px 10px; border-radius: 8px; background: var(--btn); color: var(--fg); font-size: 12px; border: 1px solid var(--line-strong); }
  button.btn:hover { background: var(--btn-hover); }
  button.primary { background: var(--accent); color: var(--accent-ink); border-color: transparent; font-weight: 600; flex: 1; text-align: center; }
  button.primary:hover { filter: brightness(1.08); background: var(--accent); }
  kbd { font: 10px ui-monospace, monospace; opacity: .75; margin-left: 4px; }
  .switch { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 12px; }
  .switch input { accent-color: var(--accent); width: 15px; height: 15px; margin: 0; }
  .onboard { background: var(--card); border-radius: 8px; padding: 10px 12px; border-left: 4px solid var(--accent); font-size: 12px; }
  .onboard ol { margin: 6px 0 8px 18px; padding: 0; }
  .onboard li { margin: 3px 0; }
  .lvl-title { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .6px; margin-bottom: -4px; }
  .levels { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; background: var(--card); padding: 3px; border-radius: 9px; }
  .levels button { all: unset; cursor: pointer; text-align: center; padding: 6px 0; border-radius: 7px; font-size: 11px; color: var(--soft); }
  .levels button:hover { background: var(--hover); color: var(--strong); }
  .levels button.on { background: var(--accent); color: var(--accent-ink); font-weight: 650; }
  .levels button[data-level="worst"].on { background: #b91c1c; color: #fff; }
  .lvl-hint { font-size: 11px; color: var(--faint); margin-top: -4px; }
  .tag { font: 600 10px system-ui, sans-serif; padding: 2px 6px; border-radius: 10px; color: #fff; background: var(--t); margin-left: 6px; vertical-align: 3px; letter-spacing: .2px; white-space: nowrap; }
  .status { font-size: 12px; color: var(--soft); min-height: 17px; }
  .status.warn { color: var(--warn); } .status.err { color: var(--err); } .status.ok { color: var(--ok); }
  .notice { font-size: 12px; color: var(--warn); background: rgba(245,158,11,.12); border-radius: 8px; padding: 6px 9px; }
  .notice.info { color: var(--soft); background: var(--card); }
  .sequence { font-size: 12px; background: var(--card); border-radius: 8px; padding: 7px 9px; color: var(--fg); line-height: 1.5; border-left: 4px solid #be123c; }
  .levels.dimmed { opacity: .45; }
  .mate-banner { position: fixed; transform: translateX(-50%); background: rgba(190,18,60,.92); color: #fff; font: 800 18px system-ui, sans-serif; padding: 6px 14px; border-radius: 999px; box-shadow: 0 6px 20px rgba(0,0,0,.35); pointer-events: none; z-index: 2147483646; letter-spacing: .3px; white-space: nowrap; }
  .moves { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .moves li { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; grid-template-rows: auto auto; column-gap: 8px; align-items: center;
    background: var(--card); border-radius: 8px; padding: 7px 9px; border-left: 4px solid var(--c); }
  .moves li.extra { border-left-style: dashed; background: var(--card-alt); }
  .badge { width: 22px; height: 22px; border-radius: 50%; background: var(--c); color: #fff; font-weight: 700; display: grid; place-items: center; font-size: 12px; grid-row: span 2; }
  .mv { font-size: 16px; font-weight: 650; color: var(--strong); }
  .ev { font: 600 12px ui-monospace, Consolas, monospace; padding: 2px 6px; border-radius: 6px; background: var(--chip-bg); }
  .ev.pos { color: var(--pos); } .ev.neg { color: var(--neg); }
  .pv { grid-column: 2 / 4; font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mini-wrap { display: grid; justify-items: center; gap: 6px; }
  .mini { display: grid; grid-template-columns: repeat(8, 1fr); grid-template-rows: repeat(8, 1fr); width: 208px; height: 208px; border-radius: 6px; overflow: hidden; border: 1px solid var(--line-strong); }
  .mini div { display: grid; place-items: center; font-size: 20px; line-height: 1; position: relative; cursor: pointer; font-family: "Segoe UI Symbol", "DejaVu Sans", sans-serif; }
  .mini .l { background: var(--sq-light); } .mini .d { background: var(--sq-dark); }
  .mini .w, .pick.w { color: #fff; text-shadow: 0 0 1px #000, 0 0 1px #000, 0 0 2px #000; }
  .mini .b, .pick.b { color: #111; text-shadow: 0 0 1px #fff8; }
  .mini .unsure::after { content: ''; position: absolute; inset: 1px; border: 2px dashed #ef4444; border-radius: 3px; }
  .mini .from, .mini .to { box-shadow: inset 0 0 0 3px var(--c1); }
  .mini .picking { box-shadow: inset 0 0 0 3px #f59e0b; }
  .mini div:hover { filter: brightness(1.12); }
  .picker { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; width: 208px; }
  .pick { all: unset; cursor: pointer; height: 26px; display: grid; place-items: center; border-radius: 5px; background: var(--btn); border: 1px solid var(--line-strong); font: 18px "Segoe UI Symbol", "DejaVu Sans", sans-serif; }
  .pick:hover { background: var(--btn-hover); }
  .pick.on { border-color: #f59e0b; }
  .pick.none { color: var(--muted); font: 600 14px system-ui, sans-serif; }
  .fen { display: flex; gap: 6px; align-items: center; }
  .fen code { flex: 1; min-width: 0; font: 10px ui-monospace, Consolas, monospace; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; user-select: text; }
  .fen a { color: var(--link); font-size: 12px; text-decoration: none; }
  details { border-top: 1px solid var(--line); padding-top: 8px; }
  summary { cursor: pointer; color: var(--soft); font-size: 12px; }
  .settings { display: grid; gap: 8px; margin-top: 8px; }
  .settings label { display: grid; gap: 3px; font-size: 12px; color: var(--soft); }
  .settings label.switch { display: flex; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  select, input[type=range] { width: 100%; accent-color: var(--accent); }
  select { background: var(--btn); color: var(--fg); border: 1px solid var(--line-strong); border-radius: 6px; padding: 4px; font-size: 12px; }
  .colors { display: flex; gap: 6px; align-items: center; font-size: 11px; color: var(--muted); }
  .chip { width: 14px; height: 14px; border-radius: 3px; border: 1px solid #0006; }
  .note { font-size: 11px; color: var(--faint); }
  .panel.compact { width: 270px; }
  .panel.compact .lvl-title, .panel.compact .lvl-hint, .panel.compact .mini-wrap, .panel.compact .fen,
  .panel.compact details, .panel.compact .pv, .panel.compact .onboard, .panel.compact kbd { display: none !important; }
  .panel.compact .body { gap: 8px; padding: 8px 10px 10px; }
  .panel.compact .moves li { padding: 5px 8px; grid-template-rows: auto; }
  .panel.compact .badge { grid-row: auto; width: 20px; height: 20px; font-size: 11px; }
  .panel.compact .mv { font-size: 14px; }
  .panel.compact .levels button { font-size: 10px; padding: 5px 0; }
  svg.arrows { position: fixed; pointer-events: none; overflow: visible; z-index: 2147483646; }
  .evalbar { position: fixed; width: 16px; border-radius: 4px; overflow: hidden; background: #403d39; box-shadow: 0 0 0 1px rgba(0,0,0,.35); z-index: 2147483646; pointer-events: none; transition: opacity .2s; }
  .evalbar .fill { position: absolute; left: 0; right: 0; bottom: 0; background: #f0f0f0; transition: height .35s ease; }
  .evalbar.flipped .fill { bottom: auto; top: 0; }
  .evalbar .val { position: absolute; left: 0; right: 0; text-align: center; font: 700 9px system-ui, sans-serif; }
  .evalbar.stale { opacity: .55; }
  .selector { position: fixed; inset: 0; cursor: crosshair; background: rgba(0,0,0,.25); z-index: 2147483647; }
  .selector .box { position: fixed; border: 2px dashed #22c55e; background: rgba(34,197,94,.12); }
  .selector .hint { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); background: #1d1e21; color: #fff; padding: 8px 14px; border-radius: 8px; font: 13px system-ui, sans-serif; }
  [hidden] { display: none !important; }
  `;

  const host = document.createElement('chess-hints-panel');
  host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    shadow.adoptedStyleSheets = [sheet];
  } catch {
    const style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);
  }

  const wrap = document.createElement('div');
  wrap.innerHTML = `
  <svg class="arrows" viewBox="0 0 8 8" preserveAspectRatio="none"></svg>
  <div class="evalbar" hidden><div class="fill"></div><span class="val"></span></div>
  <div class="mate-banner" hidden></div>
  <div class="panel" hidden>
    <div class="head"><span class="logo">♞</span><b>Chess Hints</b>
      <button class="icon js-compact" data-i18n-title="compact">▤</button>
      <button class="icon js-min" data-i18n-title="collapse">–</button>
      <button class="icon js-close" data-i18n-title="close">×</button></div>
    <div class="body">
      <div class="onboard js-onboard" hidden>
        <b data-i18n="onboard_title"></b>
        <ol><li data-i18n="onboard_1"></li><li data-i18n="onboard_2"></li><li data-i18n="onboard_3"></li></ol>
        <button class="btn js-onboard-ok" data-i18n="onboard_ok"></button>
      </div>
      <div class="row">
        <button class="btn primary js-scan"><span data-i18n="scan"></span> <kbd>Alt+Shift+S</kbd></button>
        <label class="switch" data-i18n-title="auto_title"><input type="checkbox" class="js-auto"> <span data-i18n="auto"></span></label>
        <label class="switch" data-i18n-title="mate_title"><input type="checkbox" class="js-mate"> <span data-i18n="mate"></span></label>
      </div>
      <div class="lvl-title" data-i18n="level_title"></div>
      <div class="levels js-levels"></div>
      <div class="lvl-hint js-lvl-hint"></div>
      <div class="status js-status"></div>
      <div class="notice js-notice" hidden></div>
      <div class="sequence js-sequence" hidden></div>
      <ol class="moves js-moves"></ol>
      <div class="mini-wrap js-mini-wrap" hidden>
        <div class="mini js-mini"></div>
        <div class="picker js-picker" hidden></div>
      </div>
      <div class="fen js-fen" hidden><code></code><button class="btn js-copy" data-i18n-title="copy_fen">⧉</button><a class="js-lichess" target="_blank" rel="noopener">Lichess ↗</a></div>
      <details>
        <summary data-i18n="settings"></summary>
        <div class="settings">
          <label><span data-i18n="side"></span>
            <select class="js-side">
              <option value="bottom" data-i18n="side_bottom"></option>
              <option value="w" data-i18n="side_w"></option>
              <option value="b" data-i18n="side_b"></option>
              <option value="turn" data-i18n="side_turn"></option>
            </select></label>
          <label><span data-i18n="orient"></span>
            <select class="js-orient">
              <option value="auto" data-i18n="orient_auto"></option>
              <option value="white" data-i18n="orient_white"></option>
              <option value="black" data-i18n="orient_black"></option>
            </select></label>
          <label><span><span data-i18n="movetime"></span> <span class="js-mt"></span></span>
            <input type="range" class="js-movetime" min="100" max="5000" step="100"></label>
          <label class="switch"><input type="checkbox" class="js-arrows"> <span data-i18n="arrows"></span></label>
          <label class="switch"><input type="checkbox" class="js-evalbar"> <span data-i18n="eval_bar"></span></label>
          <div class="pair">
            <label><span data-i18n="language"></span>
              <select class="js-lang"><option value="auto" data-i18n="lang_auto"></option><option value="en">English</option><option value="pl">Polski</option></select></label>
            <label><span data-i18n="theme"></span>
              <select class="js-theme"><option value="dark" data-i18n="theme_dark"></option><option value="light" data-i18n="theme_light"></option><option value="auto" data-i18n="theme_auto"></option></select></label>
          </div>
          <div class="row">
            <button class="btn js-select"></button>
            <button class="btn js-calibrate" data-i18n="calibrate"></button>
          </div>
          <div class="row">
            <button class="btn js-newgame" data-i18n="new_game"></button>
            <button class="btn js-forget" data-i18n="forget"></button>
          </div>
          <div class="row">
            <button class="btn js-report" data-i18n="report"></button>
          </div>
          <div class="colors js-colors"></div>
          <div class="note" data-i18n="note_calibration"></div>
          <div class="note" data-i18n="note_keys"></div>
        </div>
      </details>
    </div>
  </div>
  <div class="selector" hidden><div class="hint" data-i18n="select_hint"></div><div class="box" hidden></div></div>`;
  while (wrap.firstElementChild) shadow.appendChild(wrap.firstElementChild);
  document.documentElement.appendChild(host);

  const $ = sel => shadow.querySelector(sel);
  const panel = $('.panel'), svg = $('svg.arrows'), selector = $('.selector'), evalBar = $('.evalbar'), banner = $('.mate-banner');
  const els = {
    status: $('.js-status'), notice: $('.js-notice'), sequence: $('.js-sequence'), mate: $('.js-mate'), moves: $('.js-moves'), miniWrap: $('.js-mini-wrap'), mini: $('.js-mini'), picker: $('.js-picker'),
    fen: $('.js-fen'), auto: $('.js-auto'), side: $('.js-side'), orient: $('.js-orient'), movetime: $('.js-movetime'),
    mt: $('.js-mt'), arrows: $('.js-arrows'), evalBar: $('.js-evalbar'), lang: $('.js-lang'), theme: $('.js-theme'),
    colors: $('.js-colors'), select: $('.js-select'), levels: $('.js-levels'), lvlHint: $('.js-lvl-hint'), onboard: $('.js-onboard'),
  };

  for (const lv of CU.LEVELS) {
    const b = document.createElement('button');
    b.dataset.level = lv.id;
    b.onclick = () => setLevel(lv.id);
    els.levels.appendChild(b);
  }

  const send = msg => chrome.runtime.sendMessage({ target: 'bg', ...msg });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const overlaps = (a, b) => a && b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const sideName = s => t(s === 'w' ? 'white' : 'black');
  const currentLevel = () => CU.LEVELS.find(l => l.id === settings.level) || CU.LEVELS[2];
  const wantsAll = () => !settings.mate && !!currentLevel().all;
  const darkScheme = matchMedia('(prefers-color-scheme: dark)');

  chrome.storage.local.get('settings').then(({ settings: s }) => {
    Object.assign(settings, s || {}, { auto: false });
    if (!CU.LEVELS.some(l => l.id === settings.level)) settings.level = 'good';
    syncControls();
    if (settings.pos) placePanel(settings.pos.x, settings.pos.y);
  });

  function saveSettings() {
    const { auto, ...rest } = settings;
    chrome.storage.local.set({ settings: rest }).catch(() => {});
  }

  function syncControls() {
    els.side.value = settings.side;
    els.orient.value = settings.orient;
    els.movetime.value = settings.movetime;
    els.mt.textContent = (settings.movetime / 1000).toFixed(1) + ' s';
    els.arrows.checked = settings.arrows;
    els.evalBar.checked = settings.evalBar;
    els.auto.checked = settings.auto;
    els.mate.checked = settings.mate;
    els.levels.classList.toggle('dimmed', settings.mate);
    els.lang.value = settings.lang;
    els.theme.value = settings.theme;
    els.onboard.hidden = settings.onboarded;
    panel.classList.toggle('min', settings.min);
    panel.classList.toggle('compact', settings.compact);
    for (const b of els.levels.children) b.classList.toggle('on', b.dataset.level === settings.level);
    applyTheme();
    translate();
  }

  function translate() {
    t = I18N.translator(I18N.pick(settings.lang, chrome.i18n.getUILanguage()));
    for (const el of shadow.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of shadow.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
    for (const b of els.levels.children) {
      b.textContent = t('level_' + b.dataset.level);
      b.title = t('level_' + b.dataset.level + '_hint');
    }
    els.lvlHint.textContent = t(settings.mate ? 'mate_hint' : 'level_' + settings.level + '_hint');
    els.select.textContent = t(view.manualRect ? 'auto_detect' : 'select_board');
    if (!view.status) view.status = { kind: '', fn: () => t('idle') };
    renderStatus();
    renderColors();
    renderMoves();
    renderMini();
    renderBanner();
  }

  function applyTheme() {
    panel.classList.toggle('light', settings.theme === 'light' || (settings.theme === 'auto' && !darkScheme.matches));
  }
  darkScheme.addEventListener('change', applyTheme);

  function setLevel(id) {
    settings.level = id;
    settings.mate = false;
    applyMode();
  }

  function toggleMate() {
    settings.mate = !settings.mate;
    applyMode();
  }

  function applyMode() {
    saveSettings();
    syncControls();
    const job = view.job;
    if (!job) return;
    if (wantsAll() !== job.all) rerun();
    else showLevel();
  }

  els.side.onchange = () => { settings.side = els.side.value; saveSettings(); rescan(); };
  els.orient.onchange = () => { settings.orient = els.orient.value; saveSettings(); game.prev = null; game.fen = null; scan(); };
  els.movetime.oninput = () => { settings.movetime = +els.movetime.value; els.mt.textContent = (settings.movetime / 1000).toFixed(1) + ' s'; };
  els.movetime.onchange = () => { saveSettings(); rerun(); };
  els.arrows.onchange = () => { settings.arrows = els.arrows.checked; saveSettings(); drawArrows(); };
  els.evalBar.onchange = () => { settings.evalBar = els.evalBar.checked; saveSettings(); renderEvalBar(); };
  els.auto.onchange = () => { settings.auto = els.auto.checked; if (settings.auto) scan(); };
  els.mate.onchange = () => { if (els.mate.checked !== settings.mate) toggleMate(); };
  els.lang.onchange = () => { settings.lang = els.lang.value; saveSettings(); translate(); };
  els.theme.onchange = () => { settings.theme = els.theme.value; saveSettings(); applyTheme(); };

  $('.js-scan').onclick = () => scan();
  $('.js-calibrate').onclick = () => scan({ calibrate: true });
  $('.js-close').onclick = () => hidePanel();
  $('.js-min').onclick = () => { settings.min = !settings.min; saveSettings(); syncControls(); };
  $('.js-compact').onclick = () => { settings.compact = !settings.compact; saveSettings(); syncControls(); };
  $('.js-onboard-ok').onclick = () => { settings.onboarded = true; saveSettings(); syncControls(); };
  $('.js-newgame').onclick = () => { resetGame(); say('ok', () => t('tracking_reset')); scan(); };
  $('.js-forget').onclick = async () => {
    await send({ type: 'resetCalibration', host: location.host });
    resetGame();
    say('warn', () => t('forgotten'));
  };
  els.select.onclick = () => {
    if (!view.manualRect) { startSelect(); return; }
    view.manualRect = null;
    view.rect = null;
    translate();
    scan();
  };
  $('.js-report').onclick = () => report();
  $('.js-copy').onclick = () => { if (game.fen) navigator.clipboard.writeText(game.fen).then(() => say('ok', () => t('copied'))); };

  async function report() {
    const manifest = chrome.runtime.getManifest();
    const brands = navigator.userAgentData
      ? navigator.userAgentData.brands.filter(b => !/not.a.brand/i.test(b.brand)).map(b => `${b.brand} ${b.version}`).join(', ')
      : navigator.userAgent;
    const r = view.rect, c = view.colors;
    const unsure = view.conf ? view.conf.map((v, i) => (v < 0.25 ? CU.sqName(CU.boardToScreen(i, game.whiteBottom)) : null)).filter(Boolean) : [];
    const diagnostics = [
      `version: ${manifest.version}`,
      `browser: ${brands}`,
      `user agent: ${navigator.userAgent}`,
      `site: ${location.host}`,
      `viewport: ${innerWidth}x${innerHeight} @${devicePixelRatio}`,
      `board: ${r ? [r.x, r.y, r.w, r.h].map(Math.round).join(', ') : 'not found'}`,
      `colours: ${c ? `light ${c.light} / dark ${c.dark}` : '-'}`,
      `level: ${settings.mate ? 'mate' : settings.level}, side: ${settings.side}, orientation: ${settings.orient}, white at the bottom: ${game.whiteBottom}`,
      `status: ${els.status.textContent}`,
      `fen: ${game.fen || '-'}`,
      `uncertain squares: ${view.conf ? unsure.join(' ') || 'none' : '-'}`,
    ].join('\n');
    const url = new URL(manifest.homepage_url + '/issues/new');
    url.searchParams.set('template', 'bug_report.yml');
    url.searchParams.set('version', manifest.version);
    url.searchParams.set('browser', brands);
    url.searchParams.set('site', location.host);
    if (game.fen) url.searchParams.set('fen', game.fen);
    url.searchParams.set('diagnostics', diagnostics);
    let copied = false;
    try {
      const shot = await send({ type: 'snapshot' });
      if (shot && shot.ok) {
        const bytes = Uint8Array.from(atob(shot.png), ch => ch.charCodeAt(0));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]);
        copied = true;
      }
    } catch {}
    await send({ type: 'openIssue', url: url.toString() });
    say('ok', () => t(copied ? 'report_ready' : 'report_no_image'));
  }

  function showPanel() { panel.hidden = false; drawArrows(); renderEvalBar(); }

  function hidePanel() {
    panel.hidden = true;
    settings.auto = false;
    els.auto.checked = false;
    clearArrows();
    evalBar.hidden = true;
  }

  function togglePanel() { if (panel.hidden) showPanel(); else hidePanel(); }

  function placePanel(x, y) {
    const w = panel.offsetWidth || 320;
    x = Math.max(0, Math.min(innerWidth - w, x));
    y = Math.max(0, Math.min(innerHeight - 40, y));
    Object.assign(panel.style, { left: x + 'px', top: y + 'px', right: 'auto' });
  }

  $('.head').addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    const r = panel.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = ev => placePanel(ev.clientX - dx, ev.clientY - dy);
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      const p = panel.getBoundingClientRect();
      settings.pos = { x: p.left, y: p.top };
      saveSettings();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  });

  function say(kind, fn) {
    view.status = { kind, fn };
    renderStatus();
  }

  function finish(kind, fn) {
    view.done = { kind, fn };
    say(kind, fn);
  }

  function renderStatus() {
    els.status.textContent = view.status.fn();
    els.status.className = 'status js-status ' + view.status.kind;
  }

  function applyColors(colors) {
    if (!colors) return;
    view.colors = colors;
    const rgb = c => `rgb(${c.join(',')})`;
    const lum = c => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
    panel.style.setProperty('--sq-light', rgb(colors.light));
    panel.style.setProperty('--sq-dark', rgb(colors.dark));
    panel.style.setProperty('--accent', rgb(colors.dark));
    panel.style.setProperty('--accent-ink', lum(colors.dark) > 0.6 ? '#111' : '#fff');
    const candidates = ['#16a34a', '#2563eb', '#f97316', '#7c3aed', '#db2777', '#0891b2', '#dc2626', '#ca8a04'];
    const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const contrast = c => Math.min(dist(hex(c), colors.light), dist(hex(c), colors.dark));
    const good = candidates.filter(c => contrast(c) > 110);
    palette = (good.length >= 4 ? good : [...candidates].sort((a, b) => contrast(b) - contrast(a))).slice(0, 4);
    renderColors();
  }

  function renderColors() {
    const c = view.colors;
    if (!c) { els.colors.textContent = ''; return; }
    const chip = color => `<span class="chip" style="background:${color}"></span>`;
    els.colors.innerHTML = `<span></span>${chip(`rgb(${c.light})`)}${chip(`rgb(${c.dark})`)}&nbsp;<span></span>${palette.map(chip).join('')}`;
    const [a, b] = els.colors.querySelectorAll('span:not(.chip)');
    a.textContent = t('board_colors');
    b.textContent = t('arrow_colors');
  }

  function animationsDone() {
    const r = view.rect;
    if (!r || !document.getAnimations) return Promise.resolve();
    const running = document.getAnimations().filter(a => {
      const el = a.effect && a.effect.target;
      if (!el || typeof el.getBoundingClientRect !== 'function' || a.playState !== 'running') return false;
      if (!isFinite(a.effect.getComputedTiming().endTime)) return false;
      const b = el.getBoundingClientRect();
      return b.left < r.x + r.w && b.right > r.x && b.top < r.y + r.h && b.bottom > r.y;
    });
    if (!running.length) return Promise.resolve();
    return Promise.race([Promise.all(running.map(a => a.finished.catch(() => {}))), sleep(600)]);
  }

  async function scan(opts = {}) {
    if (!alive) return;
    if (view.busy) { view.pending = opts.calibrate ? opts : view.pending || opts; return; }
    view.busy = true;
    view.lastScan = Date.now();
    try {
      if (opts.auto) await animationsDone();
      const t0 = performance.now();
      const pr = panel.getBoundingClientRect();
      const hidePanelToo = !panel.hidden && overlaps({ x: pr.left, y: pr.top, w: pr.width, h: pr.height }, view.manualRect || view.rect);
      const overlayShown = (svg.style.display !== 'none' && svg.childElementCount > 0) || !banner.hidden;
      if (overlayShown) { svg.style.visibility = 'hidden'; banner.style.visibility = 'hidden'; }
      if (hidePanelToo) panel.style.visibility = 'hidden';
      if (overlayShown || hidePanelToo) await nextFrame();
      let res;
      try {
        res = await send({
          type: 'scan', host: location.host, calibrate: !!opts.calibrate,
          viewport: { w: innerWidth, h: innerHeight }, lastRect: view.rect, manualRect: view.manualRect,
        });
      } finally {
        svg.style.visibility = '';
        banner.style.visibility = '';
        panel.style.visibility = '';
      }
      view.scanMs = Math.round(performance.now() - t0);
      onScan(res);
    } catch (e) {
      handleError(e);
    } finally {
      view.busy = false;
      if (view.pending) { const p = view.pending; view.pending = null; scan(p); }
    }
  }

  function handleError(e) {
    const m = String(e && e.message || e);
    if (/context invalidated/i.test(m)) { teardown(); return; }
    say('err', () => t('error', m));
  }

  function onScan(res) {
    if (!res) return;
    if (!res.ok) {
      if (res.error === 'tab-hidden') return;
      if (res.colors) applyColors(res.colors);
      view.rect = res.rect && res.error !== 'partial' ? res.rect : null;
      say('warn', () => (SCAN_ERRORS.includes(res.error) ? t(res.error) : t('error', res.error)));
      clearArrows();
      evalBar.hidden = true;
      return;
    }
    view.rect = res.rect;
    applyColors(res.colors);
    if (res.calibrated) say('ok', () => t('calibrated'));
    processGrid(res.grid, res.conf, { calibrated: res.calibrated });
  }

  function processGrid(grid, conf, { calibrated = false, manual = false } = {}) {
    const diff = (a, b) => a.reduce((n, p, i) => n + (p !== b[i]), 0);
    let wb = settings.orient === 'white' ? true : settings.orient === 'black' ? false : null;
    if (wb === null) {
      const continuing = manual || (game.prev && diff(CU.screenToBoard(grid, game.whiteBottom), game.prev) <= 4);
      wb = continuing ? game.whiteBottom : CU.guessWhiteBottom(grid);
      if (wb === null) wb = game.whiteBottom;
    }
    game.whiteBottom = wb;
    const board = CU.screenToBoard(grid, wb);
    view.grid = grid;
    view.conf = conf;
    view.board = board;
    renderMini();

    const v = CU.validate(board);
    if (!v.ok) {
      say('warn', () => t('invalid', v.errors.map(([code, n]) => t('err_' + code, n)).join(', ')));
      clearArrows();
      clearMoves();
      return;
    }

    const prev = game.prev;
    const changed = prev ? diff(board, prev) : 0;
    if (!manual) {
      if (changed === 1 && ++game.oneOff < 3) { setTimeout(() => scan(), 150); return; }
      game.oneOff = 0;
      if (CU.isStart(board)) {
        Object.assign(game, { lost: {}, stm: 'w', stmKnown: true, ep: '-', lastTo: -1 });
      } else if (!prev) {
        Object.assign(game, { stm: null, stmKnown: false, ep: '-', lastTo: -1 });
      } else if (changed) {
        const mover = CU.inferMover(prev, board);
        if (mover) {
          const lastTo = board.findIndex((p, i) => p !== prev[i] && p !== '.' && (CU.isWhite(p) ? 'w' : 'b') === mover);
          Object.assign(game, { stm: mover === 'w' ? 'b' : 'w', stmKnown: true, ep: CU.inferEnPassant(prev, board, mover), lastTo });
        } else {
          Object.assign(game, { stm: null, stmKnown: false, ep: '-', lastTo: -1 });
        }
      }
    }
    game.prev = board;

    const bottom = wb ? 'w' : 'b';
    const mine = settings.side === 'w' || settings.side === 'b' ? settings.side : settings.side === 'turn' ? game.stm || bottom : bottom;
    let stm = game.stm || mine;
    const other = stm === 'w' ? 'b' : 'w';
    if (CU.inCheck(board, other === 'w')) {
      if (CU.inCheck(board, stm === 'w')) { say('warn', () => t('both_in_check')); clearArrows(); return; }
      stm = other;
      game.stm = stm;
      game.stmKnown = true;
    }

    const fen = `${CU.placementFen(board)} ${stm} ${CU.castling(board, game.lost)} ${game.ep} 0 1`;
    renderFen(fen);
    if (fen === game.fen) {
      if (view.lines) { renderMoves(); drawArrows(); renderMini(); }
      renderEvalBar();
      if (view.done && !calibrated) say(view.done.kind, view.done.fn);
      return;
    }
    game.fen = fen;
    Object.assign(view, { job: null, lines: null, analysis: null, done: null, evalFresh: false });
    renderEvalBar();

    if (stm !== mine && settings.side !== 'turn') {
      clearArrows();
      clearMoves();
      finish('', () => t('waiting', sideName(stm)));
      return;
    }
    analyze(fen, board, stm);
  }

  async function analyze(fen, board, stm) {
    const job = { seq: ++seq, fen, board, stm, all: wantsAll(), final: false };
    Object.assign(view, { job, analysis: null, lines: null, done: null, mate: null });
    clearArrows();
    clearMoves();
    say('', () => t('thinking', sideName(stm)));
    let res;
    try {
      res = await send({ type: 'analyze', fen, seq: job.seq, movetime: settings.movetime, multipv: job.all ? ALL_MOVES : CANDIDATES });
    } catch (e) {
      if (view.job === job) game.fen = null;
      handleError(e);
      return;
    }
    if (view.job !== job || !res || res.cancelled) return;
    if (!res.ok) { game.fen = null; say('err', () => t('engine_error', res.error)); return; }
    job.final = true;
    if (res.gameOver) {
      clearArrows();
      clearMoves();
      view.evalScore = null;
      renderEvalBar();
      finish('ok', () => t(res.gameOver));
      return;
    }
    present(job, res.lines, res.depth);
  }

  function onProgress(msg) {
    const job = view.job;
    if (!job || job.final || msg.seq !== job.seq) return;
    present(job, msg.lines, msg.depth);
  }

  function moveText(board, line) {
    const text = CU.formatMove(board, line.move);
    return line.score.mate === 1 ? text.replace(/\+$/, '') + '#' : text;
  }

  function continuation(board, line) {
    const moves = CU.formatLine(CU.applyMove(board, line.move), line.pv.slice(1), 5);
    const mateEnd = line.score.mate > 0 && line.pv.length === 2 * line.score.mate - 1 && moves.length === line.pv.length - 1;
    if (mateEnd && moves.length) moves[moves.length - 1] = moves[moves.length - 1].replace(/\+?$/, '#');
    return moves.join('  ');
  }

  function present(job, lines, depth) {
    if (!lines.length) return;
    const all = CU.annotate(job.board, CU.grade(lines), game.lastTo).map(l => ({
      ...l,
      text: moveText(job.board, l),
      cont: continuation(job.board, l),
      eval: CU.formatScore(l.score),
    }));
    view.analysis = { job, all, depth };
    view.evalScore = job.stm === 'w' ? lines[0].score : CU.negate(lines[0].score);
    view.evalFresh = true;
    showLevel();
  }

  function showLevel() {
    const a = view.analysis;
    if (!a) return;
    if (wantsAll() !== a.job.all) { rerun(); return; }
    if (settings.mate) { showMate(a); return; }
    const level = currentLevel();
    view.mate = null;
    view.noticeKind = 'warn';
    let picks = CU.pickForLevel(a.all, level.id, 3);
    if (!level.all) picks = CU.withAlternative(picks, a.all);
    view.lines = picks;
    const name = () => t('level_' + level.id);
    const own = picks.some(l => !l.extra && CU.inLevel(l, level.id));
    view.notice = level.all ? null : picks.length === 1 ? () => t('only_move') : !own ? () => t('level_none', name()) : null;
    renderMoves();
    drawArrows();
    renderMini();
    renderEvalBar();
    if (!a.job.final) { say('', () => t('thinking_more', name(), a.depth)); return; }
    const assumed = !game.stmKnown;
    const filled = !view.notice && level.lo !== undefined && picks.some(l => !l.extra && l.loss <= level.lo);
    const scanMs = view.scanMs;
    finish('ok', () => [
      name(), t('depth', a.depth), t('to_move', sideName(a.job.stm)) + (assumed ? t('assumed') : ''), t('scan_ms', scanMs),
      ...(filled ? [t('filled')] : []),
    ].join(' · '));
  }

  function showMate(a) {
    const res = CU.pickMateMode(a.all, a.job.board);
    view.lines = res.picks.map(l => ({ ...l, kind: res.kind }));
    view.mate = res.kind === 'mate' ? { mateIn: res.mateIn, sequence: CU.formatSequence(a.job.board, res.picks[0].pv, res.mateIn) } : null;
    view.notice = res.kind === 'attack' ? () => t('no_mate') : res.kind === 'defend' ? () => t('mate_threat', res.mateIn) : null;
    view.noticeKind = res.kind === 'attack' ? 'info' : 'warn';
    renderMoves();
    drawArrows();
    renderMini();
    renderEvalBar();
    if (!a.job.final) { say('', () => t('thinking_more', t('mate'), a.depth)); return; }
    const assumed = !game.stmKnown;
    const scanMs = view.scanMs;
    finish(res.kind === 'defend' ? 'warn' : 'ok', () => [
      res.kind === 'mate' ? t('mate_in', res.mateIn) : t('mate'), t('depth', a.depth),
      t('to_move', sideName(a.job.stm)) + (assumed ? t('assumed') : ''), t('scan_ms', scanMs),
    ].join(' · '));
  }

  function rerun() {
    const job = view.job;
    if (job) analyze(job.fen, job.board, job.stm);
  }

  function rescan() {
    if (!view.board) return;
    game.fen = null;
    view.job = null;
    scan();
  }

  function resetGame() {
    Object.assign(game, { prev: null, lost: {}, stm: null, stmKnown: false, ep: '-', fen: null, lastTo: -1, oneOff: 0 });
    Object.assign(view, { job: null, lines: null, analysis: null, done: null, evalScore: null, mate: null });
    clearArrows();
    clearMoves();
    renderEvalBar();
  }

  function correct(i, piece) {
    if (!view.grid) return;
    const grid = view.grid.slice(0, i) + piece + view.grid.slice(i + 1);
    const conf = [...view.conf];
    conf[i] = 1;
    view.picking = -1;
    els.picker.hidden = true;
    send({ type: 'teach', host: location.host, index: i, piece }).catch(() => {});
    const square = CU.sqName(CU.boardToScreen(i, game.whiteBottom));
    say('ok', () => t('corrected', square, piece === '.' ? t('empty') : CU.GLYPH[piece]));
    processGrid(grid, conf, { manual: true });
  }

  function openPicker(i) {
    if (view.picking === i) { view.picking = -1; els.picker.hidden = true; renderMini(); return; }
    view.picking = i;
    els.picker.textContent = '';
    for (const p of ['K', 'Q', 'R', 'B', 'N', 'P', '.', 'k', 'q', 'r', 'b', 'n', 'p']) {
      const b = document.createElement('button');
      b.className = 'pick ' + (p === '.' ? 'none' : CU.isWhite(p) ? 'w' : 'b') + (view.grid[i] === p ? ' on' : '');
      b.textContent = p === '.' ? '×' : CU.GLYPH[p.toLowerCase()] + '︎';
      b.title = p === '.' ? t('empty') : CU.GLYPH[p];
      b.dataset.piece = p;
      b.onclick = () => correct(i, p);
      els.picker.appendChild(b);
    }
    els.picker.hidden = false;
    renderMini();
  }

  function clearMoves() {
    els.moves.textContent = '';
    view.notice = null;
    view.mate = null;
    els.notice.hidden = true;
    els.sequence.hidden = true;
  }

  function renderMoves() {
    els.moves.textContent = '';
    els.notice.hidden = !view.notice;
    els.notice.className = 'notice js-notice ' + view.noticeKind;
    if (view.notice) els.notice.textContent = view.notice();
    els.sequence.hidden = !view.mate;
    if (view.mate) els.sequence.textContent = t('sequence') + ' ' + view.mate.sequence;
    (view.lines || []).forEach((l, k) => {
      const li = document.createElement('li');
      li.style.setProperty('--c', palette[k]);
      if (l.extra) li.classList.add('extra');
      const sign = l.score.mate !== undefined ? Math.sign(l.score.mate) : Math.sign(l.score.cp);
      li.innerHTML = `<span class="badge">${k + 1}</span><span class="mv"></span><span class="ev ${sign > 0 ? 'pos' : sign < 0 ? 'neg' : ''}"></span><span class="pv"></span>`;
      const mv = li.querySelector('.mv');
      mv.textContent = l.text;
      const mark = l.mark && CU.MARKS[l.mark];
      const tier = CU.TIERS[l.tier];
      const tag = document.createElement('span');
      tag.className = 'tag';
      const [color, label] = l.kind === 'mate' ? ['#be123c', t('mate_in', l.score.mate)]
        : l.kind === 'attack' ? ['#c2410c', '⚔ ' + t('attack')]
        : mark ? [mark.color, `${mark.symbol} ${t('mark_' + l.mark)}`]
        : [tier.color, t('tier_' + tier.id)];
      tag.style.setProperty('--t', color);
      tag.textContent = label;
      tag.title = t('loss', (l.loss * 100).toFixed(1));
      mv.appendChild(tag);
      li.querySelector('.ev').textContent = l.eval;
      li.querySelector('.ev').title = t('eval_title');
      const cont = l.cont ? t('then') + l.cont : '';
      li.querySelector('.pv').textContent = l.extra ? t('extra') + (cont ? ' · ' + cont : '') : cont;
      els.moves.appendChild(li);
    });
  }

  function renderMini() {
    if (!view.grid) return;
    const marks = {};
    if (view.lines && view.lines[0]) {
      const m = view.lines[0].move;
      marks[CU.boardToScreen(CU.sqIndex(m.slice(0, 2)), game.whiteBottom)] = 'from';
      marks[CU.boardToScreen(CU.sqIndex(m.slice(2, 4)), game.whiteBottom)] = 'to';
    }
    els.mini.style.setProperty('--c1', palette[0]);
    els.mini.title = t('mini_title');
    els.mini.textContent = '';
    for (let i = 0; i < 64; i++) {
      const d = document.createElement('div');
      const p = view.grid[i];
      d.className = (((i >> 3) + (i & 7)) % 2 ? 'd' : 'l') + (marks[i] ? ' ' + marks[i] : '') + (view.picking === i ? ' picking' : '');
      if (p !== '.') {
        d.textContent = CU.GLYPH[p.toLowerCase()] + '︎';
        d.classList.add(CU.isWhite(p) ? 'w' : 'b');
      }
      if (view.conf && view.conf[i] < 0.25) { d.classList.add('unsure'); d.title = t('unsure'); }
      d.onclick = () => openPicker(i);
      els.mini.appendChild(d);
    }
    els.miniWrap.hidden = false;
  }

  function renderFen(fen) {
    els.fen.hidden = false;
    els.fen.querySelector('code').textContent = fen;
    els.fen.querySelector('code').title = fen;
    $('.js-lichess').href = 'https://lichess.org/analysis/standard/' + fen.replace(/ /g, '_');
  }

  function renderEvalBar() {
    const r = view.rect, s = view.evalScore;
    if (!settings.evalBar || !r || !s || panel.hidden) { evalBar.hidden = true; return; }
    const w = 16, gap = 6;
    const left = r.x >= w + gap + 2 ? r.x - w - gap : r.x + r.w + gap;
    Object.assign(evalBar.style, { left: left + 'px', top: r.y + 'px', height: r.h + 'px' });
    const share = s.mate !== undefined ? (s.mate > 0 ? 1 : 0) : 1 / (1 + Math.exp(-0.004 * s.cp));
    const whiteBetter = s.mate !== undefined ? s.mate > 0 : s.cp >= 0;
    const fill = evalBar.querySelector('.fill'), val = evalBar.querySelector('.val');
    fill.style.height = Math.max(3, Math.min(97, share * 100)) + '%';
    evalBar.classList.toggle('flipped', !game.whiteBottom);
    evalBar.classList.toggle('stale', !view.evalFresh);
    val.textContent = s.mate !== undefined ? 'M' + Math.abs(s.mate) : (Math.abs(s.cp) / 100).toFixed(1);
    const atBottom = whiteBetter === game.whiteBottom;
    Object.assign(val.style, { top: atBottom ? 'auto' : '4px', bottom: atBottom ? '4px' : 'auto', color: whiteBetter ? '#403d39' : '#f0f0f0' });
    evalBar.hidden = false;
  }

  const NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  function svgText(x, y, text, size) {
    const el = svgEl('text', { x, y, 'text-anchor': 'middle', 'font-size': size, 'font-weight': 700, fill: '#fff', 'font-family': 'system-ui, sans-serif' });
    el.textContent = text;
    return el;
  }

  function clearArrows() {
    svg.textContent = '';
    svg.style.display = 'none';
    banner.hidden = true;
  }

  function renderBanner() {
    const r = view.rect;
    if (!view.mate || !r || panel.hidden) { banner.hidden = true; return; }
    banner.textContent = t('mate_in', view.mate.mateIn);
    const above = r.y - 44, below = r.y + r.h + 8;
    const top = above >= 4 ? above : below + 36 <= innerHeight ? below : r.y + 8;
    Object.assign(banner.style, { left: r.x + r.w / 2 + 'px', top: top + 'px' });
    banner.hidden = false;
  }

  function drawArrows() {
    renderBanner();
    svg.textContent = '';
    const lines = view.lines;
    if (!settings.arrows || !lines || !lines.length || !view.rect || panel.hidden) { svg.style.display = 'none'; return; }
    const r = view.rect;
    Object.assign(svg.style, { display: 'block', left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    const center = sq => {
      const i = CU.boardToScreen(CU.sqIndex(sq), game.whiteBottom);
      return [(i & 7) + 0.5, (i >> 3) + 0.5];
    };
    const widths = [0.2, 0.16, 0.13, 0.11];
    lines.map((l, k) => [l, k]).reverse().forEach(([l, k]) => {
      const [x1, y1] = center(l.move.slice(0, 2)), [x2, y2] = center(l.move.slice(2, 4));
      const shared = lines.slice(0, k).filter(o => o.move.slice(0, 2) === l.move.slice(0, 2)).length;
      const len = Math.hypot(x2 - x1, y2 - y1);
      const bx = x1 - ((y2 - y1) / len) * 0.4 * shared, by = y1 + ((x2 - x1) / len) * 0.4 * shared;
      const g = svgEl('g', { opacity: l.extra ? 0.8 : k === 0 ? 0.9 : 0.8 });
      g.append(
        svgEl('polygon', {
          points: arrowPoints(x1, y1, x2, y2, widths[k]), fill: palette[k],
          stroke: l.extra ? '#fff' : 'rgba(0,0,0,.35)', 'stroke-width': l.extra ? 0.03 : 0.02,
          'stroke-dasharray': l.extra ? '0.09 0.06' : 'none', 'fill-opacity': l.extra ? 0.6 : 1,
        }),
        svgEl('circle', { cx: bx, cy: by, r: 0.2, fill: palette[k], stroke: '#fff', 'stroke-width': 0.04 }),
        svgText(bx, by + 0.085, k + 1, 0.25),
      );
      svg.appendChild(g);
    });
    const perSquare = {};
    for (const l of lines) {
      const mark = l.mark && CU.MARKS[l.mark];
      if (!mark) continue;
      const to = l.move.slice(2, 4);
      const n = perSquare[to] = (perSquare[to] || 0) + 1;
      const [cx, cy] = center(to);
      const mx = cx + (n % 2 ? 0.3 : -0.3), my = cy - 0.3 + (n > 2 ? 0.6 : 0);
      const star = mark.symbol === '★';
      const g = svgEl('g', {});
      g.append(
        svgEl('circle', { cx: mx, cy: my, r: 0.17, fill: mark.color, stroke: '#fff', 'stroke-width': 0.035 }),
        svgText(mx, my + (star ? 0.075 : 0.068), mark.symbol, star ? 0.21 : 0.19),
      );
      svg.appendChild(g);
    }
  }

  function arrowPoints(x1, y1, x2, y2, w) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    const head = Math.min(0.45, len * 0.45), hw = w * 1.9;
    const sx = x1 + ux * 0.2, sy = y1 + uy * 0.2;
    const ex = x2 - ux * 0.1, ey = y2 - uy * 0.1;
    const bx = ex - ux * head, by = ey - uy * head;
    const p = [
      [sx + nx * w / 2, sy + ny * w / 2], [bx + nx * w / 2, by + ny * w / 2], [bx + nx * hw, by + ny * hw],
      [ex, ey], [bx - nx * hw, by - ny * hw], [bx - nx * w / 2, by - ny * w / 2], [sx - nx * w / 2, sy - ny * w / 2],
    ];
    return p.map(([x, y]) => x.toFixed(3) + ',' + y.toFixed(3)).join(' ');
  }

  function startSelect() {
    selector.hidden = false;
    clearArrows();
    const box = selector.querySelector('.box');
    let start = null;
    const move = e => {
      if (!start) return;
      const x = Math.min(start.x, e.clientX), y = Math.min(start.y, e.clientY);
      Object.assign(box.style, { left: x + 'px', top: y + 'px', width: Math.abs(e.clientX - start.x) + 'px', height: Math.abs(e.clientY - start.y) + 'px' });
    };
    const down = e => { start = { x: e.clientX, y: e.clientY }; box.hidden = false; move(e); };
    const done = rect => {
      selector.hidden = true;
      box.hidden = true;
      selector.removeEventListener('pointerdown', down);
      selector.removeEventListener('pointermove', move);
      selector.removeEventListener('pointerup', up);
      removeEventListener('keydown', key, true);
      if (!rect) return;
      view.manualRect = rect;
      view.rect = null;
      translate();
      resetGame();
      scan();
    };
    const up = e => {
      if (!start) return;
      const w = Math.abs(e.clientX - start.x), h = Math.abs(e.clientY - start.y);
      done(w > 40 && h > 40 ? { x: Math.min(start.x, e.clientX), y: Math.min(start.y, e.clientY), w, h } : null);
    };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
    selector.addEventListener('pointerdown', down);
    selector.addEventListener('pointermove', move);
    selector.addEventListener('pointerup', up);
    addEventListener('keydown', key, true);
  }

  let settleTimer = 0, firstActivity = 0;
  const observer = new MutationObserver(records => {
    if (!settings.auto || !view.rect || panel.hidden) return;
    const r = view.rect;
    for (const rec of records) {
      const el = rec.target.nodeType === 1 ? rec.target : rec.target.parentElement;
      if (!el || el === host) continue;
      const b = el.getBoundingClientRect();
      if (b.width > r.w * 3 || b.height > r.h * 3) continue;
      if (b.left < r.x + r.w && b.right > r.x && b.top < r.y + r.h && b.bottom > r.y) {
        boardActivity();
        return;
      }
    }
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });

  function boardActivity() {
    const now = performance.now();
    if (!firstActivity) firstActivity = now;
    clearTimeout(settleTimer);
    const wait = now - firstActivity > 600 ? 0 : 40;
    settleTimer = setTimeout(() => { firstActivity = 0; scan({ auto: true }); }, wait);
  }

  function canvasBoard() {
    const r = view.rect;
    const el = document.elementFromPoint(r.x + r.w / 2, r.y + r.h / 2);
    return !!el && el.tagName === 'CANVAS';
  }

  const poll = setInterval(() => {
    if (!settings.auto || panel.hidden || document.hidden || view.busy) return;
    const every = !view.rect ? 2000 : canvasBoard() ? 1000 : 8000;
    if (Date.now() - view.lastScan > every) scan({ auto: true });
  }, 250);

  let moved = 0;
  const onViewportChange = () => {
    if (!view.rect) return;
    clearArrows();
    evalBar.hidden = true;
    clearTimeout(moved);
    moved = setTimeout(() => {
      if (settings.auto) scan();
      else if (view.lines) say('warn', () => t('scrolled'));
    }, 300);
  };
  addEventListener('scroll', onViewportChange, { passive: true });
  addEventListener('resize', onViewportChange, { passive: true });

  const onKey = e => {
    if (panel.hidden || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const el = e.composedPath()[0];
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    if (e.key === 'm' || e.key === 'M') { toggleMate(); return; }
    const n = '12345'.indexOf(e.key);
    if (n >= 0 && e.key.length === 1) setLevel(CU.LEVELS[n].id);
  };
  addEventListener('keydown', onKey, true);

  function teardown() {
    alive = false;
    observer.disconnect();
    clearInterval(poll);
    removeEventListener('scroll', onViewportChange);
    removeEventListener('resize', onViewportChange);
    removeEventListener('keydown', onKey, true);
    darkScheme.removeEventListener('change', applyTheme);
    host.remove();
    window.__chessHints = false;
  }

  syncControls();

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'ping') sendResponse({ pong: true });
    else if (msg.type === 'toggle') { togglePanel(); sendResponse({}); }
    else if (msg.type === 'scan-now') { showPanel(); scan(); sendResponse({}); }
    else if (msg.type === 'progress') onProgress(msg);
  });
})();
