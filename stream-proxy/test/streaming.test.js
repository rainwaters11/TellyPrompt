const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");
const { WebSocket, WebSocketServer } = require("ws");

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitForHealth(port) {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const body = await new Promise((resolve, reject) => http.get(`http://127.0.0.1:${port}/health`, response => {
        let value = "";
        response.on("data", chunk => value += chunk);
        response.on("end", () => resolve(value));
      }).on("error", reject));
      if (JSON.parse(body).ok) return;
    } catch (_) { /* The proxy has not started yet. */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Proxy did not become healthy");
}

function connect(port, origin, code) {
  return new WebSocket(`ws://127.0.0.1:${port}/transcribe`, ["tellyprompt", code], {
    origin
  });
}

test("proxy protects the key and forwards live audio and transcripts", async () => {
  const upstream = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise(resolve => upstream.once("listening", resolve));
  let upstreamAuthorization;
  upstream.on("connection", (socket, request) => {
    upstreamAuthorization = request.headers.authorization;
    socket.on("message", (data, isBinary) => {
      if (isBinary && data.equals(Buffer.from([1, 2, 3]))) {
        socket.send(JSON.stringify({ type: "Results", channel: { alternatives: [{ transcript: "hello world" }] } }));
      }
    });
  });
  const port = await freePort();
  const proxy = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DEEPGRAM_API_KEY: "test-provider-key",
      TELLYPROMPT_ACCESS_CODE: "test-access-code-1234",
      ALLOWED_ORIGIN: "https://prompt.example",
      DEEPGRAM_WS_URL: `ws://127.0.0.1:${upstream.address().port}`
    },
    stdio: "ignore"
  });
  try {
    await waitForHealth(port);
    for (const [origin, code] of [
      ["https://wrong.example", "test-access-code-1234"],
      ["https://prompt.example", "wrong-access-code-12"]
    ]) {
      const client = connect(port, origin, code);
      const status = await new Promise(resolve => {
        client.once("unexpected-response", (_, response) => resolve(response.statusCode));
        client.once("error", () => resolve(0));
      });
      assert.equal(status, 403);
      client.terminate();
    }
    const client = connect(port, "https://prompt.example", "test-access-code-1234");
    const messages = [];
    client.on("message", (data, isBinary) => {
      assert.equal(isBinary, false);
      messages.push(JSON.parse(data.toString()));
    });
    await new Promise((resolve, reject) => { client.once("open", resolve); client.once("error", reject); });
    for (let attempt = 0; !messages.some(message => message.type === "Ready") && attempt < 40; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert(messages.some(message => message.type === "Ready"));
    client.send(Buffer.from([1, 2, 3]), { binary: true });
    for (let attempt = 0; !messages.some(message => message.type === "Results") && attempt < 40; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(messages.find(message => message.type === "Results")?.channel.alternatives[0].transcript, "hello world");
    assert.equal(upstreamAuthorization, "Token test-provider-key");
    client.close();
  } finally {
    proxy.kill();
    await new Promise(resolve => upstream.close(resolve));
  }
});

test("proxy reports a rejected provider key", async () => {
  const upstream = http.createServer();
  upstream.on("upgrade", (_, socket) => {
    socket.end("HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
  });
  await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
  const port = await freePort();
  const proxy = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DEEPGRAM_API_KEY: "bad-key",
      TELLYPROMPT_ACCESS_CODE: "test-access-code-1234",
      ALLOWED_ORIGIN: "https://prompt.example",
      DEEPGRAM_WS_URL: `ws://127.0.0.1:${upstream.address().port}`
    },
    stdio: "ignore"
  });
  try {
    await waitForHealth(port);
    const client = connect(port, "https://prompt.example", "test-access-code-1234");
    const error = await new Promise((resolve, reject) => {
      client.on("message", data => {
        const message = JSON.parse(data.toString());
        if (message.type === "Error") resolve(message);
      });
      client.once("error", reject);
    });
    assert.equal(error.fatal, true);
    assert.match(error.message, /rejected the API key/);
    client.terminate();
  } finally {
    proxy.kill();
    await new Promise(resolve => upstream.close(resolve));
  }
});
