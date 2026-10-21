# Chess Hints

[![Download](https://img.shields.io/badge/Download-chess--hints.zip-2ea44f?style=for-the-badge)](https://github.com/stxxchu/Chess-best-move-extension/releases/latest/download/chess-hints.zip) [![Latest version](https://img.shields.io/github/v/release/stxxchu/Chess-best-move-extension?style=for-the-badge&label=version&color=555)](https://github.com/stxxchu/Chess-best-move-extension/releases/latest)

[Polski](README.pl.md)

A browser extension for Brave, Chrome and Edge. It finds the chessboard on your screen, reads the position and suggests moves at the level you choose, from the best to the worst. Stockfish 19 runs locally in the browser; nothing is sent anywhere.

![Demo](docs/demo.gif)

## Features

- **Any site, any board theme.** The board is found on a screenshot of the tab, in either orientation, including boards drawn on a `<canvas>`.
- **Learns the pieces once per site.** Show it the starting position and it learns what the pieces look like. When you switch piece sets it notices and asks to recalibrate.
- **Suggestion levels:** Best, Excellent, Good, Average and Worst.
- **Move marks like on chess.com:** `!!` Brilliant, `!` Great, `★` Best, drawn in the corner of the target square. When all three suggestions carry such a mark, a fourth dashed arrow shows the best unmarked move.
- **Evaluation bar** next to the board.
- **Mate mode** (`M`): shows a forced mate with the whole line to it, or moves that attack the king when there is no mate yet.
- **Auto mode** follows the game: it knows whose turn it is, tracks castling rights and en passant, and waits while your opponent is thinking.
- **Fix a misread square** by clicking it on the small board. The correction is learned, so the next scans get it right.
- **Fast:** the first arrows appear about 0.1 s after the opponent's move and get refined as the engine searches deeper.
- English and Polish interface, dark and light theme, compact mode, keys `1`–`5` switch the level.

![Marks and the fourth arrow](docs/marks.png)

## Install

1. Click **Download** at the top of this page (or get **`chess-hints.zip`** from the [latest release](../../releases/latest)). Not “Source code”: that is the whole repository and the extension sits in its `extension` subfolder.
2. Unzip it. The folder you get has `manifest.json` directly inside.
3. Open `brave://extensions` (or `chrome://extensions`) and turn on **Developer mode**.
4. Click **Load unpacked** and pick that folder.

If you see “Manifest file is missing or unreadable”, you picked the wrong folder: choose the one that contains `manifest.json` (in the source code that is `extension`).

## Usage

1. Open a board in the starting position, click the Chess Hints icon (or press `Alt+Shift+C`) and then **Scan**. The first scan on a new site is the calibration.
2. Pick a level and turn on **Auto** to get new suggestions after every move.

| Key | Action |
|---|---|
| `Alt+Shift+C` | show / hide the panel |
| `Alt+Shift+S` | scan now |
| `1`–`5` | switch the level (while the panel is open) |
| `M` | mate mode on / off |

Shortcuts can be changed at `brave://extensions/shortcuts`.

## Levels

The engine evaluates the 12 best candidate moves. Each one is graded by how many winning chances it gives up compared with the best move, using the same scale as chess.com's game review.

| Level | Moves |
|---|---|
| Best | the strongest engine moves |
| Excellent | up to 2% loss |
| Good | 2–5% loss |
| Average | 5–10% loss |
| Worst | the weakest moves in the position (the engine checks every legal move) |

Switching levels is instant, except for going to and from Worst. If a position has fewer than three moves at a level, the list is filled with better moves, never worse ones, and a note says so. Mistakes and blunders are only ever shown on the Worst level, so in a position with a single saving move every other level shows just that move.

The `!!` and `!` marks are an approximation. chess.com does not publish its rules: here Brilliant means a piece sacrifice that is the best or nearly the best move, and Great means the only good move in the position.

## Mate mode

Turn it on with the **♚ Mate** switch or the `M` key; clicking a level turns it off again.

- **Forced mate found:** a "Mate in N" label above the board, an arrow for your next move and the whole line in the panel (your move, the reply, your move… until mate). In Auto mode it follows the game and counts down.
- **No forced mate yet:** up to three playable moves that put the most pressure on the enemy king (checks, taking away its squares, bringing pieces closer). Moves that lose material or the game are never shown.
- **The opponent has a forced mate:** a warning and the best defence.

## Speed

Measured from the opponent's move to the first arrows (`npm run bench`):

| Site setting | Time |
|---|---|
| piece animation off | about 90 ms |
| piece animation on | about 300 ms, of which about 200 ms is the animation itself |

Turn off piece animation in the site's settings for the fastest results. Chrome allows two tab screenshots per second, so during a very fast exchange a scan may wait for a free slot.

## How it works

| File | Role |
|---|---|
| `extension/vision.js` | Finds the 49 points where four squares meet and fits an 8×8 grid to them, then compares every square with the piece templates learned during calibration. |
| `extension/background.js` | Takes the screenshot, runs the recognition, stores calibrations per site. |
| `extension/engine.js`, `offscreen.js` | Stockfish 19 lite (WASM) in a Web Worker, MultiPV with live updates. |
| `extension/chessutil.js` | FEN, check detection, castling, en passant, move notation, move grading and marks. |
| `extension/content.js`, `i18n.js` | Panel, arrows, evaluation bar, Auto mode, translations. |

## Something wrong?

Open the panel settings and click **Report a problem**. It opens a GitHub issue with the version, browser, site, position and diagnostics already filled in, and copies an image of the board to the clipboard so you can paste it into the report.

## Development

```
cd tests
npm install
npm test
```

The tests drive Chrome and Brave through puppeteer-core. Set `CHROME_PATH` and `BRAVE_PATH` if the browsers are installed elsewhere.

| Script | What it does |
|---|---|
| `test:unit` | chess logic |
| `test:vision` | recognition of 98 board screenshots in 7 themes and sizes, both orientations |
| `test:e2e` | the whole extension loaded into Brave with a temporary profile |
| `bench` | latency measurement |
| `demo` | records `docs/demo.gif` |
| `pack` | builds `dist/chess-hints-<version>.zip` |

To publish a release, bump `version` in `extension/manifest.json`, then tag and push it (`git tag v1.3.0 && git push --tags`). GitHub Actions builds the ZIP and creates the release.

## Fair play

Using an engine in games against other people breaks the rules of chess.com and lichess and gets accounts banned. Chess Hints is meant for analysis, puzzles, games against bots and learning.

## License

GPL-3.0. `extension/engine/` contains Stockfish (GPL-3.0) as built by the stockfish.js project (Nathan Rugg, Chess.com). The pieces in the screenshots are the cburnett set (GPLv2+).
