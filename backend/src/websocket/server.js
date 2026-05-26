/**
 * WebSocket Server
 * Uses the 'ws' npm package — no socket.io.
 * Attaches to the existing HTTP server so WS and REST share port 3001.
 */

const { WebSocketServer } = require('ws');

/** @type {WebSocketServer|null} */
let wss = null;

/**
 * Initialise the WebSocket server, attaching it to an existing http.Server.
 * @param {import('http').Server} httpServer
 */
function initWebSocket(httpServer) {
  wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress || 'unknown';
    console.log(`[ws] Client connected from ${ip}  (total: ${wss.clients.size})`);

    ws.on('error', (err) => {
      console.error('[ws] Client error:', err.message);
    });

    ws.on('close', () => {
      console.log(`[ws] Client disconnected (remaining: ${wss.clients.size})`);
    });

    // Immediately send a connected confirmation so the frontend can show the green dot
    ws.send(JSON.stringify({ type: 'CONNECTED', ts: new Date().toISOString() }));
  });

  wss.on('error', (err) => {
    console.error('[ws] Server error:', err.message);
  });

  console.log('[ws] WebSocket server initialised on shared HTTP port');
}

/**
 * Return the active WebSocketServer instance (null before initWebSocket runs).
 * @returns {WebSocketServer|null}
 */
function getWSS() {
  return wss;
}

module.exports = { initWebSocket, getWSS };
