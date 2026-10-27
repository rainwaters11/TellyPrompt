"use strict";

const http = require("node:http");
const crypto = require("node:crypto");
const { WebSocket, WebSocketServer } = require("ws");

const port = Number(process.env.PORT || 3000);
const apiKey = process.env.DEEPGRAM_API_KEY;
const accessCode = process.env.TELLYPROMPT_ACCESS_CODE;
const allowedOrigin = process.env.ALLOWED_ORIGIN?.replace(/\/$/, "");
const deepgramUrl = process.env.DEEPGRAM_WS_URL ||
  "wss://api.deepgram.com/v1/listen?model=nova-3&language=en-US&interim_results=true&punctuate=true&smart_format=true&endpointing=300";

if (!apiKey || !accessCode || !allowedOrigin) {
  console.error("Set DEEPGRAM_API_KEY, TELLYPROMPT_ACCESS_CODE, and ALLOWED_ORIGIN.");
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{16,128}$/.test(accessCode)) {
  console.error("TELLYPROMPT_ACCESS_CODE must be 16–128 letters, digits, underscores, or hyphens.");
  process.exit(1);
}

function sameSecret(a, b) {
  const left = Buffer.from(a || "");
  const right = Buffer.from(b || "");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ ok: true }));
  } else {
    response.writeHead(404);
    response.end();
  }
});
const clients = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

server.on("upgrade", (request, socket, head) => {
  const protocols = (request.headers["sec-websocket-protocol"] || "").split(",").map(value => value.trim());
  const valid = request.url === "/transcribe" && request.headers.origin === allowedOrigin &&
    protocols[0] === "tellyprompt" && sameSecret(protocols[1], accessCode);
  if (!valid) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  clients.handleUpgrade(request, socket, head, client => clients.emit("connection", client));
});

clients.on("connection", client => {
  const upstream = new WebSocket(deepgramUrl, {
    headers: { Authorization: `Token ${apiKey}` },
    handshakeTimeout: 10000
  });
  let ready = false;
  const send = payload => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(payload));
  };
  upstream.on("open", () => {
    ready = true;
    send({ type: "Ready" });
  });
  upstream.on("message", (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
  });
  upstream.on("unexpected-response", (_, response) => {
    const status = response.statusCode;
    response.resume();
    send({
      type: "Error",
      fatal: true,
      message: status === 401 || status === 403
        ? "Deepgram rejected the API key. Check DEEPGRAM_API_KEY in Railway."
        : `Deepgram rejected the connection (HTTP ${status}). Check the proxy configuration.`
    });
    if (client.readyState === WebSocket.OPEN) client.close(1008, "Provider configuration error");
  });
  upstream.on("error", () => send({ type: "Error", message: "Transcription service connection failed." }));
  upstream.on("close", () => {
    send({ type: "Error", message: "Transcription service disconnected." });
    if (client.readyState === WebSocket.OPEN) client.close(1011, "Transcription service disconnected");
  });
  client.on("message", (data, isBinary) => {
    if (!ready || !isBinary || upstream.readyState !== WebSocket.OPEN) return;
    if (upstream.bufferedAmount > 4 * 1024 * 1024) {
      client.close(1013, "Transcription service is too slow");
      return;
    }
    upstream.send(data, { binary: true });
  });
  client.on("close", () => {
    if (upstream.readyState === WebSocket.OPEN) upstream.close();
    else if (upstream.readyState === WebSocket.CONNECTING) upstream.terminate();
  });
  client.on("error", () => upstream.terminate());
});

server.listen(port, "0.0.0.0", () => console.log(`TellyPrompt transcription proxy listening on ${port}`));
