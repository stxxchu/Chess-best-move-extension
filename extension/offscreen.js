const engine = new Engine('engine/stockfish-19-lite-single.js');

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'offscreen' || msg.type !== 'analyze') return;
  const onProgress = msg.tabId === undefined ? null : progress => {
    chrome.runtime.sendMessage({ target: 'bg', type: 'progress', tabId: msg.tabId, seq: msg.seq, ...progress }).catch(() => {});
  };
  engine.analyze(msg.fen, { movetime: msg.movetime, multipv: msg.multipv, onProgress })
    .then(res => sendResponse({ ok: true, ...res }))
    .catch(e => sendResponse({ ok: false, error: String(e && e.message || e) }));
  return true;
});
