(function (root) {
  'use strict';

  const OPENINGS = [
    {
      id: 'alien',
      name: 'Alien Gambit',
      side: 'w',
      about: 'Caro-Kann: a knight sacrifice on f7 for a fast attack on the king.',
      lines: [
        'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Ng5 h6 Nxf7 Kxf7 Nf3 Bg4 Ne5+ Ke8',
        'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Ng5 h6 Nxf7 Kxf7 Nf3 Bf5 Ne5 Ke8',
        'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Ng5 h6 Nxf7 Kxf7 Nf3 e6 Ne5+ Ke7',
        'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Qe2 Ngf6 Nd6#',
      ],
    },
    {
      id: 'fried-liver',
      name: 'Fried Liver Attack',
      side: 'w',
      about: 'Italian Game: after 5...Nxd5, the knight sacrifice on f7 drags the king out.',
      lines: [
        'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+ Ke6 Nc3',
      ],
    },
    {
      id: 'scholar',
      name: "Scholar's Mate",
      side: 'w',
      about: 'Queen and bishop hit f7. Mates in four moves if Black is careless.',
      lines: [
        'e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#',
        'e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#',
        'e4 e5 Bc4 Bc5 Qh5 Nf6 Qxf7#',
      ],
    },
    {
      id: 'legal',
      name: "Légal's Mate",
      side: 'w',
      about: 'White gives up the queen: after ...Bxd1, Bxf7+ and Nd5 is mate.',
      lines: [
        'e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1 Bxf7+ Ke7 Nd5#',
      ],
    },
    {
      id: 'fools',
      name: "Fool's Mate",
      side: 'b',
      about: 'If White weakens the king with f3 or f4 and g4, Qh4 is mate.',
      lines: [
        'f3 e5 g4 Qh4#',
        'g4 e5 f3 Qh4#',
        'f4 e5 g4 Qh4#',
        'g4 e5 f4 Qh4#',
      ],
    },
    {
      id: 'stafford',
      name: 'Stafford Gambit',
      side: 'b',
      about: 'Petrov with a pawn given up for fast development and traps.',
      lines: [
        'e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 d3 Bc5 Bg5 Nxe4 Bxd8 Bxf2+ Ke2 Bg4#',
        'e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 Nc3 Bc5',
        'e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 e5 Ne4',
      ],
    },
    {
      id: 'englund',
      name: 'Englund Gambit',
      side: 'b',
      about: 'Against 1.d4: a pawn for a queen raid that ends in a back-rank mate.',
      lines: [
        'd4 e5 dxe5 Nc6 Nf3 Qe7 Bf4 Qb4+ Bd2 Qxb2 Bc3 Bb4 Qd2 Bxc3 Qxc3 Qc1#',
      ],
    },
    {
      id: 'blackburne',
      name: 'Blackburne Shilling Gambit',
      side: 'b',
      about: 'Italian Game: 3...Nd4 invites Nxe5, then the queen and knight mate.',
      lines: [
        'e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5 Nxf7 Qxg2 Rf1 Qxe4+ Be2 Nf3#',
      ],
    },
  ];

  root.ChessHintsOpenings = OPENINGS;
  if (typeof module === 'object' && module.exports) module.exports = OPENINGS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
