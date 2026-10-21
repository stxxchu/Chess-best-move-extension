export const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const BRAVE = process.env.BRAVE_PATH || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe';

export const POSITIONS = {
  start: { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
  italian: { fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', last: 'f8c5' },
  middle: { fen: 'r2q1rk1/pp2bppp/2n1bn2/3p4/3P4/2NBBN2/PP3PPP/R2Q1RK1 w - - 4 11', last: 'c8e6' },
  promo: { fen: '8/1P4k1/8/3q4/8/2N5/5PPP/R3R1K1 w - - 0 40', last: 'd8d5' },
  endgame: { fen: '8/5pk1/6p1/8/3B4/1K6/8/7q b - - 0 50', last: 'c4b3' },
  queens: { fen: 'Q3k3/8/8/3q4/8/8/2Q5/4K2q w - - 0 60', last: 'h2h1' },
  crowded: { fen: 'r1b1kb1r/pp1n1ppp/1qn1p3/2ppP3/3P1P2/2P2N2/PP4PP/R1BQKBNR w KQkq - 1 8' },
};

export function placement(fen) {
  return fen.split(' ')[0].split('/').map(r => r.replace(/\d/g, d => '.'.repeat(+d))).join('');
}
