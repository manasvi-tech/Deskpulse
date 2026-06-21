/**
 * WebSocket Server
 * Uses the 'ws' npm package — no socket.io.
 * Attaches to the existing HTTP server so WS and REST share port 3001.
 */

const { WebSocketServer } = require('ws');
const logger              = require('../utils/logger');

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
    logger.info({ ip, total: wss.clients.size }, '[ws] Client connected');

    ws.on('error', (err) => {
      logger.warn({ err: err.message }, '[ws] Client error');
    });

    ws.on('close', () => {
      logger.info({ remaining: wss.clients.size }, '[ws] Client disconnected');
    });

    // Immediately send a connected confirmation so the frontend can show the green dot
    ws.send(JSON.stringify({ type: 'CONNECTED', ts: new Date().toISOString() }));
  });

  wss.on('error', (err) => {
    logger.error({ err: err.message }, '[ws] Server error');
  });

  logger.info('[ws] WebSocket server initialised on shared HTTP port');
}

/**
 * Return the active WebSocketServer instance (null before initWebSocket runs).
 * @returns {WebSocketServer|null}
 */
function getWSS() {
  return wss;
}

module.exports = { initWebSocket, getWSS };
