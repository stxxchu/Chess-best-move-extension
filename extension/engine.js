class Engine {
  constructor(url) {
    this.url = url;
    this.ticket = 0;
    this.running = null;
    this.start();
  }

  start() {
    this.listeners = new Set();
    this.pending = new Set();
    this.worker = new Worker(this.url);
    this.worker.onmessage = e => { for (const f of [...this.listeners]) f(String(e.data)); };
    this.worker.onerror = e => this.fail(e.message || 'worker error');
    this.crashed = false;
    this.multipv = 1;
    this.ready = this.init();
  }

  send(cmd) { this.worker.postMessage(cmd); }

  fail(reason) {
    this.crashed = true;
    for (const reject of [...this.pending]) reject(new Error(reason));
  }

  waitFor(pred, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const done = () => { clearTimeout(timer); this.listeners.delete(f); this.pending.delete(abort); };
      const abort = err => { done(); reject(err); };
      const timer = setTimeout(() => abort(new Error('engine timeout')), timeoutMs);
      const f = line => {
        if (line.includes('CRITICAL ERROR')) { this.fail(line.replace(/^info string /, '')); return; }
        if (!pred(line)) return;
        done();
        resolve(line);
      };
      this.listeners.add(f);
      this.pending.add(abort);
    });
  }

  async init() {
    this.send('uci');
    await this.waitFor(l => l === 'uciok');
    this.send('setoption name Hash value 32');
    this.send('isready');
    await this.waitFor(l => l === 'readyok');
  }

  async analyze(fen, { movetime = 1500, multipv = 3, onProgress = null } = {}) {
    const ticket = ++this.ticket;
    if (this.crashed) { this.worker.terminate(); this.start(); }
    if (this.running) { this.send('stop'); await this.running.catch(() => {}); }
    if (ticket !== this.ticket) return { cancelled: true };
    await this.ready;
    this.running = this.search(fen, movetime, multipv, onProgress);
    try {
      const res = await this.running;
      return ticket === this.ticket ? res : { cancelled: true };
    } finally {
      if (ticket === this.ticket) this.running = null;
    }
  }

  async search(fen, movetime, multipv, onProgress) {
    if (multipv !== this.multipv) { this.send(`setoption name MultiPV value ${multipv}`); this.multipv = multipv; }
    this.send('isready');
    await this.waitFor(l => l === 'readyok');

    const snapshots = [];
    let full = 0, mated = null, emitted = null, lastEmit = 0;
    const unique = snap => {
      const seen = new Set();
      return snap.lines.filter(l => !seen.has(l.move) && seen.add(l.move));
    };
    const emit = snap => {
      if (!onProgress || !snap || snap === emitted || snap.dirty || snap.lines[0].depth < 6) return;
      const now = performance.now();
      if (now - lastEmit < 60) return;
      lastEmit = now;
      emitted = snap;
      onProgress({ lines: unique(snap), depth: snap.lines[0].depth });
    };
    const onInfo = line => {
      if (!line.startsWith('info ')) return;
      const t = line.split(' ');
      const get = k => { const i = t.indexOf(k); return i >= 0 ? t[i + 1] : undefined; };
      const si = t.indexOf('score');
      if (si >= 0 && t.indexOf('pv') < 0 && get('depth') === '0') {
        mated = t[si + 1] === 'mate' ? 'checkmate' : 'stalemate';
        return;
      }
      if (si < 0 || t.indexOf('pv') < 0) return;
      const k = +(get('multipv') || 1);
      if (k === 1 || !snapshots.length) {
        const prev = snapshots[snapshots.length - 1];
        if (prev && prev.lines.length === full) emit(prev);
        snapshots.push({ lines: [], dirty: false });
      }
      const snap = snapshots[snapshots.length - 1];
      if (t.includes('lowerbound') || t.includes('upperbound')) snap.dirty = true;
      const pv = t.slice(t.indexOf('pv') + 1);
      const score = t[si + 1] === 'mate' ? { mate: +t[si + 2] } : { cp: +t[si + 2] };
      snap.lines.push({ multipv: k, depth: +get('depth'), score, pv, move: pv[0] });
      full = Math.max(full, snap.lines.length);
      if (snap.lines.length === multipv) emit(snap);
    };

    this.listeners.add(onInfo);
    this.send(`position fen ${fen}`);
    this.send(`go movetime ${movetime}`);
    let best;
    try {
      best = await this.waitFor(l => l.startsWith('bestmove'), movetime + 15000);
    } finally {
      this.listeners.delete(onInfo);
    }
    const bestmove = best.split(' ')[1];
    if (bestmove === '(none)') return { lines: [], depth: 0, gameOver: mated || 'checkmate' };
    const done = snapshots.filter(s => s.lines.length === full);
    const snap = [...done].reverse().find(s => !s.dirty) || done[done.length - 1];
    if (!snap) return { lines: [], depth: 0, bestmove };
    const lines = unique(snap);
    return { lines, depth: lines[0].depth, bestmove };
  }
}

if (typeof module === 'object' && module.exports) module.exports = Engine;
