(function (root) {
  'use strict';

  const START = 'rnbqkbnrpppppppp' + '.'.repeat(32) + 'PPPPPPPPRNBQKBNR';
  const FILES = 'abcdefgh';
  const GLYPH = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const VALUE = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
  const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
  const KING = [[1, 1], [1, 0], [1, -1], [0, 1], [0, -1], [-1, 1], [-1, 0], [-1, -1]];
  const LINES = [[[1, 0], [-1, 0], [0, 1], [0, -1]], [[1, 1], [1, -1], [-1, 1], [-1, -1]]];

  const isWhite = p => p !== '.' && p === p.toUpperCase();
  const value = p => VALUE[p.toUpperCase()];
  const sqName = i => FILES[i & 7] + (8 - (i >> 3));
  const sqIndex = s => (8 - +s[1]) * 8 + FILES.indexOf(s[0]);
  const negate = s => (s.mate !== undefined ? { mate: -s.mate } : { cp: -s.cp });

  function fromFen(fen) {
    return fen.split(' ')[0].split('/').map(r => r.replace(/\d/g, d => '.'.repeat(+d))).join('').split('');
  }

  function placementFen(board) {
    let out = '';
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      for (let c = 0; c < 8; c++) {
        const p = board[r * 8 + c];
        if (p === '.') { empty++; continue; }
        if (empty) { out += empty; empty = 0; }
        out += p;
      }
      if (empty) out += empty;
      if (r < 7) out += '/';
    }
    return out;
  }

  const screenToBoard = (grid, whiteBottom) => (whiteBottom ? [...grid] : [...grid].reverse());
  const boardToScreen = (i, whiteBottom) => (whiteBottom ? i : 63 - i);

  function attackers(board, sq, byWhite) {
    const r = sq >> 3, c = sq & 7, out = [];
    const at = (rr, cc) => (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 ? board[rr * 8 + cc] : null);
    const own = p => (byWhite ? p : p.toLowerCase());
    const pr = byWhite ? r + 1 : r - 1;
    for (const dc of [-1, 1]) if (at(pr, c + dc) === own('P')) out.push(own('P'));
    for (const [dr, dc] of KNIGHT) if (at(r + dr, c + dc) === own('N')) out.push(own('N'));
    for (const [dr, dc] of KING) if (at(r + dr, c + dc) === own('K')) out.push(own('K'));
    LINES.forEach((dirs, diagonal) => {
      const sliders = [own(diagonal ? 'B' : 'R'), own('Q')];
      for (const [dr, dc] of dirs) {
        for (let rr = r + dr, cc = c + dc; ; rr += dr, cc += dc) {
          const p = at(rr, cc);
          if (p === null) break;
          if (p === '.') continue;
          if (sliders.includes(p)) out.push(p);
          break;
        }
      }
    });
    return out;
  }

  const attacked = (board, sq, byWhite) => attackers(board, sq, byWhite).length > 0;

  function inCheck(board, white) {
    const k = board.indexOf(white ? 'K' : 'k');
    return k >= 0 && attacked(board, k, !white);
  }

  function count(board) {
    const n = {};
    for (const p of board) if (p !== '.') n[p] = (n[p] || 0) + 1;
    return n;
  }

  function validate(board) {
    const n = count(board), errors = [];
    if (n.K !== 1) errors.push(['white_kings', n.K || 0]);
    if (n.k !== 1) errors.push(['black_kings', n.k || 0]);
    if ((n.P || 0) > 8 || (n.p || 0) > 8) errors.push(['too_many_pawns']);
    const side = up => Object.entries(n).filter(([p]) => isWhite(p) === up).reduce((a, [, v]) => a + v, 0);
    if (side(true) > 16 || side(false) > 16) errors.push(['too_many_pieces']);
    const promoted = c => ['Q', 'R', 'B', 'N'].reduce((a, p, i) => a + Math.max(0, (n[c(p)] || 0) - [1, 2, 2, 2][i]), 0);
    if (promoted(p => p) > 8 - (n.P || 0) || promoted(p => p.toLowerCase()) > 8 - (n.p || 0)) errors.push(['impossible_material']);
    for (let c = 0; c < 8; c++) {
      if ('Pp'.includes(board[c]) || 'Pp'.includes(board[56 + c])) { errors.push(['pawn_on_back_rank']); break; }
    }
    return { ok: errors.length === 0, errors };
  }

  const isStart = board => board.join('') === START;

  function inferMover(prev, cur) {
    let changed = 0, w = 0, b = 0;
    for (let i = 0; i < 64; i++) {
      if (prev[i] === cur[i]) continue;
      changed++;
      if (cur[i] !== '.') { if (isWhite(cur[i])) w++; else b++; }
    }
    if (changed < 2 || changed > 4) return null;
    if (w && !b) return 'w';
    if (b && !w) return 'b';
    return null;
  }

  function inferEnPassant(prev, cur, mover) {
    const [p, from, mid, to] = mover === 'w' ? ['P', 6, 5, 4] : ['p', 1, 2, 3];
    for (let c = 0; c < 8; c++) {
      if (prev[from * 8 + c] === p && cur[from * 8 + c] === '.' && cur[to * 8 + c] === p &&
          prev[to * 8 + c] === '.' && cur[mid * 8 + c] === '.' && prev[mid * 8 + c] === '.') {
        return sqName(mid * 8 + c);
      }
    }
    return '-';
  }

  function castling(board, lost) {
    const at = s => board[sqIndex(s)];
    if (at('e1') !== 'K') { lost.K = lost.Q = true; }
    if (at('h1') !== 'R') lost.K = true;
    if (at('a1') !== 'R') lost.Q = true;
    if (at('e8') !== 'k') { lost.k = lost.q = true; }
    if (at('h8') !== 'r') lost.k = true;
    if (at('a8') !== 'r') lost.q = true;
    return ['K', 'Q', 'k', 'q'].filter(k => !lost[k]).join('') || '-';
  }

  function guessWhiteBottom(grid) {
    const rows = p => [...grid].map((x, i) => (x === p ? i >> 3 : -1)).filter(r => r >= 0);
    const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
    const wp = rows('P'), bp = rows('p');
    if (wp.length && bp.length) {
      const d = mean(wp) - mean(bp);
      if (Math.abs(d) >= 1) return d > 0;
    }
    const wk = rows('K'), bk = rows('k');
    if (wk.length === 1 && bk.length === 1 && Math.abs(wk[0] - bk[0]) >= 4) return wk[0] > bk[0];
    return null;
  }

  function applyMove(board, uci) {
    const b = [...board];
    const from = sqIndex(uci.slice(0, 2)), to = sqIndex(uci.slice(2, 4));
    const p = b[from];
    const t = p.toUpperCase();
    if (t === 'P' && (from & 7) !== (to & 7) && b[to] === '.') b[(from & ~7) | (to & 7)] = '.';
    if (t === 'K' && Math.abs((from & 7) - (to & 7)) === 2) {
      const kingside = (to & 7) === 6;
      const rf = (from & ~7) | (kingside ? 7 : 0), rt = (from & ~7) | (kingside ? 5 : 3);
      b[rt] = b[rf]; b[rf] = '.';
    }
    b[to] = uci[4] ? (isWhite(p) ? uci[4].toUpperCase() : uci[4].toLowerCase()) : p;
    b[from] = '.';
    return b;
  }

  function formatMove(board, uci) {
    const from = sqIndex(uci.slice(0, 2)), to = sqIndex(uci.slice(2, 4));
    const p = board[from];
    if (!p || p === '.') return uci;
    const t = p.toUpperCase(), white = isWhite(p);
    let s;
    if (t === 'K' && Math.abs((from & 7) - (to & 7)) === 2) {
      s = (to & 7) === 6 ? 'O-O' : 'O-O-O';
    } else {
      const capture = board[to] !== '.' || (t === 'P' && (from & 7) !== (to & 7));
      s = (t === 'P' ? '' : GLYPH[p]) + uci.slice(0, 2) + (capture ? '×' : '–') + uci.slice(2, 4);
      if (uci[4]) s += '=' + GLYPH[white ? uci[4].toUpperCase() : uci[4]];
    }
    if (inCheck(applyMove(board, uci), !white)) s += '+';
    return s;
  }

  function formatLine(board, pv, max = 4) {
    const out = [];
    let b = board;
    for (const m of pv.slice(0, max)) {
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m) || b[sqIndex(m.slice(0, 2))] === '.') break;
      out.push(formatMove(b, m));
      b = applyMove(b, m);
    }
    return out;
  }

  function formatScore(score) {
    if (!score) return '';
    if (score.mate !== undefined) return score.mate > 0 ? `M${score.mate}` : `-M${-score.mate}`;
    const v = score.cp / 100;
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
  }

  const TIERS = [
    { id: 'best', max: 0.005, color: '#16a34a' },
    { id: 'excellent', max: 0.02, color: '#65a30d' },
    { id: 'good', max: 0.05, color: '#0d9488' },
    { id: 'inaccuracy', max: 0.10, color: '#ca8a04' },
    { id: 'mistake', max: 0.20, color: '#ea580c' },
    { id: 'blunder', max: Infinity, color: '#dc2626' },
  ];

  const MARKS = {
    brilliant: { symbol: '!!', color: '#1baca6' },
    great: { symbol: '!', color: '#5b8baf' },
    best: { symbol: '★', color: '#81b64c' },
  };

  const LEVELS = [
    { id: 'best' },
    { id: 'excellent', lo: 0.005, hi: 0.02 },
    { id: 'good', lo: 0.02, hi: 0.05 },
    { id: 'ok', lo: 0.05, hi: 0.10 },
    { id: 'worst', all: true },
  ];

  function expectedScore(score) {
    if (score.mate !== undefined) return score.mate > 0 ? 1 : 0;
    return 1 / (1 + Math.exp(-0.00368208 * score.cp));
  }

  const strength = s => (s.mate === undefined ? s.cp : s.mate > 0 ? 100000 - s.mate : -100000 - s.mate);

  function grade(lines) {
    if (!lines.length) return [];
    const best = Math.max(...lines.map(l => expectedScore(l.score)));
    const top = lines.reduce((a, l) => (strength(l.score) > strength(a.score) ? l : a)).score;
    const isTop = s => (s.mate !== undefined || top.mate !== undefined ? s.mate === top.mate : top.cp - s.cp <= 15);
    return lines.map(l => {
      const loss = Math.max(0, best - expectedScore(l.score));
      let tier = TIERS.findIndex(t => loss <= t.max);
      if (tier === 0 && !isTop(l.score)) tier = 1;
      return { ...l, loss, tier };
    });
  }

  function hanging(board, sq) {
    const p = board[sq];
    if (p === '.') return 0;
    const white = isWhite(p);
    const enemy = attackers(board, sq, !white);
    if (!enemy.length) return 0;
    if (!attackers(board, sq, white).length) return value(p);
    const takers = enemy.filter(a => a.toUpperCase() !== 'K');
    return takers.length ? Math.max(0, value(p) - Math.min(...takers.map(value))) : 0;
  }

  function isSacrifice(board, uci) {
    const from = sqIndex(uci.slice(0, 2)), to = sqIndex(uci.slice(2, 4));
    const p = board[from], white = isWhite(p);
    const after = applyMove(board, uci);
    const enPassant = p.toUpperCase() === 'P' && (from & 7) !== (to & 7) && board[to] === '.';
    const gained = board[to] !== '.' ? value(board[to]) : enPassant ? 1 : 0;
    if (!'PK'.includes(after[to].toUpperCase()) && hanging(after, to) - gained >= 2) return true;
    for (let i = 0; i < 64; i++) {
      const q = after[i];
      if (i === to || q === '.' || isWhite(q) !== white || 'PK'.includes(q.toUpperCase())) continue;
      if (hanging(after, i) >= 2 && hanging(board, i) < 2) return true;
    }
    return false;
  }

  function annotate(board, graded, lastTo = -1) {
    const ranked = [...graded].sort((a, b) => a.loss - b.loss);
    return graded.map(l => {
      const e = expectedScore(l.score);
      const alt = ranked.find(o => o !== l);
      const altE = alt ? expectedScore(alt.score) : 0;
      const to = sqIndex(l.move.slice(2, 4));
      const recapture = to === lastTo && board[to] !== '.';
      let mark = null;
      if (l.loss <= 0.02 && e >= 0.45 && altE < 0.95 && isSacrifice(board, l.move)) mark = 'brilliant';
      else if (l.tier === 0 && alt && e - altE >= 0.10 && altE < 0.75 && !recapture) mark = 'great';
      else if (l.tier === 0) mark = 'best';
      return { ...l, mark };
    });
  }

  function pickForLevel(graded, levelId, n = 3) {
    const level = LEVELS.find(l => l.id === levelId) || LEVELS[0];
    const byLoss = [...graded].sort((a, b) => a.loss - b.loss || strength(b.score) - strength(a.score));
    if (level.id === 'worst') return byLoss.reverse().slice(0, n);
    if (level.lo === undefined) return byLoss.slice(0, n);
    const inBand = byLoss.filter(l => l.loss > level.lo && l.loss <= level.hi);
    const better = byLoss.filter(l => l.loss <= level.lo).reverse();
    return [...inBand, ...better].slice(0, n);
  }

  function withAlternative(picks, graded) {
    if (!picks.length || !picks.every(l => l.mark)) return picks;
    const alt = [...graded].sort((a, b) => a.loss - b.loss).find(l => !l.mark && !picks.includes(l));
    return alt ? [...picks, { ...alt, extra: true }] : picks;
  }

  const api = {
    START, GLYPH, TIERS, MARKS, LEVELS, isWhite, sqName, sqIndex, fromFen, placementFen, screenToBoard, boardToScreen,
    attackers, attacked, inCheck, validate, isStart, inferMover, inferEnPassant, castling, guessWhiteBottom,
    applyMove, formatMove, formatLine, formatScore, expectedScore, negate, grade, hanging, isSacrifice, annotate,
    pickForLevel, withAlternative,
  };
  root.ChessUtil = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
