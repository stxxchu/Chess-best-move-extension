import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const CU = createRequire(import.meta.url)('../extension/chessutil.js');

const B = fen => CU.fromFen(fen);
const start = B('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
const t = (name, fn) => { try { fn(); console.log('ok  ', name); } catch (e) { console.log('FAIL', name, '\n', e.message); process.exitCode = 1; } };
const lines = (...pairs) => pairs.map(([move, score]) => ({ move, score: typeof score === 'number' ? { cp: score } : score, pv: [move] }));

t('placement round-trip', () => {
  const fen = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R';
  assert.equal(CU.placementFen(B(fen)), fen);
});

t('start position', () => { assert.ok(CU.isStart(start)); assert.ok(CU.validate(start).ok); });

t('formatMove', () => {
  assert.equal(CU.formatMove(start, 'g1f3'), '♘g1–f3');
  assert.equal(CU.formatMove(start, 'e2e4'), 'e2–e4');
  const it = B('r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R');
  assert.equal(CU.formatMove(it, 'e1g1'), 'O-O');
  assert.equal(CU.formatMove(it, 'c4f7'), '♗c4×f7+');
  assert.equal(CU.formatMove(B('8/1P4k1/8/3q4/8/2N5/5PPP/R3R1K1'), 'b7b8q'), 'b7–b8=♕');
  assert.equal(CU.formatMove(B('4k3/8/8/3pP3/8/8/8/4K3'), 'e5d6'), 'e5×d6');
});

t('applyMove: castling, en passant, promotion', () => {
  const it = B('r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R');
  assert.equal(CU.placementFen(CU.applyMove(it, 'e1g1')), 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1');
  assert.equal(CU.placementFen(CU.applyMove(B('4k3/8/8/3pP3/8/8/8/4K3'), 'e5d6')), '4k3/8/3P4/8/8/8/8/4K3');
  assert.equal(CU.placementFen(CU.applyMove(B('8/1P4k1/8/8/8/8/8/6K1'), 'b7b8q')), '1Q6/6k1/8/8/8/8/8/6K1');
  assert.equal(CU.placementFen(CU.applyMove(B('6k1/8/8/8/8/8/1p6/6K1'), 'b2b1n')), '6k1/8/8/8/8/8/8/1n4K1');
});

t('check detection', () => {
  assert.ok(CU.inCheck(B('4k3/8/8/8/8/8/8/4R1K1'), false));
  assert.ok(!CU.inCheck(B('4k3/8/8/8/8/8/4P3/4R1K1'), false));
  assert.ok(CU.inCheck(B('4k3/3P4/8/8/8/8/8/6K1'), false));
  assert.ok(CU.inCheck(B('4k3/8/3N4/8/8/8/8/6K1'), false));
  assert.ok(CU.inCheck(B('4k3/8/8/b7/8/8/8/4K3'), true));
  assert.ok(!CU.inCheck(B('4k3/8/8/8/b7/8/8/4K3'), true));
  assert.ok(!CU.inCheck(B('4k3/8/8/8/8/8/3p4/4K3'), false));
  assert.ok(CU.inCheck(B('4k3/8/8/8/8/8/3p4/4K3'), true));
});

t('attackers', () => {
  const b = B('4k3/8/8/3p4/4N3/8/1B6/R3K3');
  assert.deepEqual(CU.attackers(b, CU.sqIndex('c5'), true).sort(), ['N']);
  assert.deepEqual(CU.attackers(b, CU.sqIndex('d5'), true), []);
  assert.deepEqual(CU.attackers(b, CU.sqIndex('a8'), true).sort(), ['R']);
  assert.deepEqual(CU.attackers(b, CU.sqIndex('e4'), false), ['p']);
});

t('validate', () => {
  assert.deepEqual(CU.validate(B('8/8/8/8/8/8/8/4K3')).errors, [['black_kings', 0]]);
  assert.ok(!CU.validate(B('8/8/8/8/8/8/8/4K3')).ok);
  assert.ok(!CU.validate(B('P3k3/8/8/8/8/8/8/4K3')).ok);
  assert.ok(!CU.validate(B('4k3/8/8/8/8/8/8/3KK3')).ok);
  assert.deepEqual(CU.validate(B('rnbqkbbr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR')).errors, [['impossible_material']]);
  assert.ok(CU.validate(B('4k3/8/8/8/8/8/PPPPPP2/QQQK4')).ok);
  assert.ok(!CU.validate(B('4k3/8/8/8/8/8/PPPPPPP1/QQQK4')).ok);
});

t('inferMover and en passant', () => {
  const after = CU.applyMove(start, 'e2e4');
  assert.equal(CU.inferMover(start, after), 'w');
  assert.equal(CU.inferEnPassant(start, after, 'w'), 'e3');
  const after2 = CU.applyMove(after, 'c7c5');
  assert.equal(CU.inferMover(after, after2), 'b');
  assert.equal(CU.inferEnPassant(after, after2, 'b'), 'c6');
  assert.equal(CU.inferEnPassant(after2, CU.applyMove(after2, 'g1f3'), 'w'), '-');
  const it = B('r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R');
  assert.equal(CU.inferMover(it, CU.applyMove(it, 'e1g1')), 'w');
  assert.equal(CU.inferMover(start, start), null);
  assert.equal(CU.inferMover(start, CU.applyMove(CU.applyMove(start, 'e2e4'), 'e7e5')), null);
});

t('castling rights', () => {
  const lost = {};
  assert.equal(CU.castling(start, lost), 'KQkq');
  assert.equal(CU.castling(B('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBR1'), lost), 'Qkq');
  assert.equal(CU.castling(start, lost), 'Qkq');
});

t('orientation guess', () => {
  const grid = start.join('');
  assert.equal(CU.guessWhiteBottom(grid), true);
  assert.equal(CU.guessWhiteBottom([...grid].reverse().join('')), false);
  assert.equal(CU.guessWhiteBottom(B('4k3/8/8/8/8/8/8/4K3').join('')), true);
  assert.equal(CU.guessWhiteBottom(B('8/8/3k4/8/3K4/8/8/8').join('')), null);
});

t('quality tiers', () => {
  const g = CU.grade(lines(['a', 50], ['b', 45], ['c', 30], ['d', 0], ['e', -40], ['f', -120], ['g', -300]));
  assert.deepEqual(g.map(l => CU.TIERS[l.tier].id), ['best', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder']);
  assert.equal(CU.grade(lines(['m', { mate: 2 }], ['x', 900], ['y', { mate: -1 }]))[2].tier, 5);
  assert.deepEqual(CU.grade(lines(['m', { mate: 1 }], ['n', { mate: 1 }], ['x', 2000], ['z', { mate: 3 }])).map(l => l.tier), [0, 0, 1, 1]);
  assert.ok(CU.expectedScore({ cp: 0 }) === 0.5 && CU.expectedScore({ mate: 3 }) === 1 && CU.expectedScore({ mate: -3 }) === 0);
});

t('levels', () => {
  const g = CU.grade(lines(['a', 50], ['b', 45], ['c', 30], ['d', 0], ['e', -40], ['f', -300]));
  const ids = lv => CU.pickForLevel(g, lv).map(l => l.move).join('');
  assert.equal(ids('best'), 'abc');
  assert.equal(ids('excellent'), 'cba');
  assert.equal(ids('good'), 'dcb');
  assert.equal(ids('ok'), 'edc');
  assert.equal(ids('worst'), 'fed');
  const forced = CU.grade(lines(['x', 20], ['y', -500], ['z', -700]));
  for (const lv of ['excellent', 'good', 'ok']) assert.equal(CU.pickForLevel(forced, lv).map(l => l.move).join(''), 'x');
  const mates = CU.grade(lines(['a', 10], ['b', { mate: -3 }], ['c', -900], ['d', { mate: -1 }]));
  assert.equal(CU.pickForLevel(mates, 'worst').map(l => l.move).join(''), 'dbc');
});

t('sacrifices', () => {
  const italian = B('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R');
  assert.ok(CU.isSacrifice(italian, 'c4f7'));
  const supported = B('r1bqkbnr/pppp1ppp/2n5/4p1N1/2B1P3/8/PPPP1PPP/RNBQK2R');
  assert.ok(!CU.isSacrifice(supported, 'c4f7'));
  const legal = B('rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R');
  assert.ok(CU.isSacrifice(legal, 'f3e5'));
  assert.ok(!CU.isSacrifice(start, 'e2e4'));
  assert.ok(!CU.isSacrifice(B('3qk3/8/8/8/8/8/8/3QK3'), 'd1d8'));
});

t('chess.com style marks', () => {
  const only = CU.annotate(start, CU.grade(lines(['e2e4', 0], ['d2d4', -150], ['g1f3', -160])));
  assert.deepEqual(only.map(l => l.mark), ['great', null, null]);
  const many = CU.annotate(start, CU.grade(lines(['e2e4', 30], ['d2d4', 28], ['g1f3', 10])));
  assert.deepEqual(many.map(l => l.mark), ['best', 'best', null]);
  const recapture = B('rnb1kbnr/pppp1ppp/8/8/3q4/8/PPPQ1PPP/RNB1KBNR');
  const rc = CU.annotate(recapture, CU.grade(lines(['d2d4', 0], ['e1e2', -400])), CU.sqIndex('d4'));
  assert.equal(rc[0].mark, 'best');
  const italian = B('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R');
  const sac = CU.annotate(italian, CU.grade(lines(['c4f7', 60], ['e1g1', 50])));
  assert.equal(sac[0].mark, 'brilliant');
});

t('fourth arrow when every pick is marked', () => {
  const g = CU.annotate(start, CU.grade(lines(['e2e4', 30], ['d2d4', 29], ['c2c4', 28], ['g1f3', 0], ['b1c3', -20])));
  const picks = CU.pickForLevel(g, 'best');
  assert.ok(picks.every(l => l.mark));
  const shown = CU.withAlternative(picks, g);
  assert.equal(shown.length, 4);
  assert.equal(shown[3].move, 'g1f3');
  assert.ok(shown[3].extra && !shown[3].mark);
  const mixed = CU.pickForLevel(CU.annotate(start, CU.grade(lines(['e2e4', 30], ['d2d4', 0], ['c2c4', -10]))), 'best');
  assert.equal(CU.withAlternative(mixed, mixed).length, 3);
});

t('negate', () => {
  assert.deepEqual(CU.negate({ cp: 35 }), { cp: -35 });
  assert.deepEqual(CU.negate({ mate: 2 }), { mate: -2 });
});

t('mistakes and blunders are only suggested on the worst level', () => {
  const g = CU.annotate(start, CU.grade(lines(['e2e4', { mate: 1 }], ['d2d4', -300], ['c2c4', -400])));
  assert.deepEqual(CU.pickForLevel(g, 'best').map(l => l.move), ['e2e4']);
  for (const lv of ['excellent', 'good', 'ok']) {
    assert.deepEqual(CU.withAlternative(CU.pickForLevel(g, lv), g).map(l => l.move), ['e2e4'], lv);
  }
  assert.deepEqual(CU.pickForLevel(g, 'worst').map(l => l.move), ['c2c4', 'd2d4', 'e2e4']);
});

t('fourth arrow needs three marked picks and a playable alternative', () => {
  const g = CU.annotate(start, CU.grade(lines(['e2e4', 30], ['d2d4', 29], ['c2c4', 28], ['g1f3', -300])));
  const picks = CU.pickForLevel(g, 'best');
  assert.ok(picks.length === 3 && picks.every(l => l.mark));
  assert.equal(CU.withAlternative(picks, g).length, 3);
});

t('attack score prefers checks and squeezing the king', () => {
  const b = B('4k3/8/8/8/8/8/8/R3K3');
  const order = ['e1d2', 'a1a7', 'a1a8'].sort((x, y) => CU.attackScore(b, y) - CU.attackScore(b, x));
  assert.deepEqual(order, ['a1a8', 'a1a7', 'e1d2']);
});

t('mate mode: forced mate first, shortest first', () => {
  const b = B('6k1/5ppp/8/8/8/8/2Q2PPP/2R3K1');
  const g = CU.grade(lines(['c2f5', { mate: 4 }], ['c2c8', { mate: 1 }], ['c2a2', { mate: 4 }], ['h2h3', 900]));
  const res = CU.pickMateMode(g, b);
  assert.equal(res.kind, 'mate');
  assert.equal(res.mateIn, 1);
  assert.deepEqual(res.picks.map(l => l.move), ['c2c8', 'c2f5', 'c2a2']);
});

t('mate mode: attacking moves when there is no mate, never losing ones', () => {
  const b = B('4k3/8/8/8/8/8/8/R3K3');
  const g = CU.grade(lines(['e1d2', 880], ['a1a7', 890], ['a1a8', 900], ['a1b1', 100]));
  const res = CU.pickMateMode(g, b);
  assert.equal(res.kind, 'attack');
  assert.deepEqual(res.picks.map(l => l.move), ['a1a8', 'a1a7', 'e1d2']);
});

t('mate mode: defend when the opponent has a forced mate', () => {
  const b = B('6k1/8/8/8/8/6q1/8/6K1');
  const g = CU.grade(lines(['g1f1', { mate: -7 }], ['g1h1', { mate: -6 }]));
  const res = CU.pickMateMode(g, b);
  assert.equal(res.kind, 'defend');
  assert.equal(res.mateIn, 7);
  assert.equal(res.picks[0].move, 'g1f1');
});

t('line to mate is numbered and ends with #', () => {
  const b = B('3r2k1/5ppp/8/8/8/8/4QPPP/4R1K1');
  assert.equal(CU.formatSequence(b, ['e2e8', 'd8e8', 'e1e8'], 2), '1. ♕e2–e8+ ♜d8×e8 2. ♖e1×e8#');
  assert.equal(CU.formatSequence(B('6k1/5ppp/8/8/8/8/5PPP/1R4K1'), ['b1b8'], 1), '1. ♖b1–b8#');
});

t('formatLine and formatScore', () => {
  assert.deepEqual(CU.formatLine(start, ['e2e4', 'e7e5', 'g1f3', 'b8c6']), ['e2–e4', 'e7–e5', '♘g1–f3', '♞b8–c6']);
  assert.equal(CU.formatScore({ cp: 35 }), '+0.35');
  assert.equal(CU.formatScore({ cp: -120 }), '−1.20');
  assert.equal(CU.formatScore({ mate: 3 }), 'M3');
  assert.equal(CU.formatScore({ mate: -2 }), '-M2');
});
