/**
 * Custom Next.js server with an attached WebSocket server.
 * Broadcasts newly translated Soroban events to all connected clients.
 *
 * Run with: npx ts-node --project tsconfig.server.json server.ts
 * (or via the `dev:ws` npm script)
 */
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";
import { MOCK_RAW_EVENTS } from "./lib/mock-data";
import { translateEvent } from "./lib/translator/registry";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss://* https://horizon-testnet.stellar.org https://soroban-testnet.stellar.org https://horizon.stellar.org https://mainnet.stellar.validationcloud.io; img-src 'self' data:; font-src 'self' data:;");
    const parsedUrl = parse(req.url ?? "/", true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ server: httpServer, path: "/ws/events" });

  wss.on("connection", (socket) => {
    console.log("[WS] Client connected");
    socket.on("close", () => console.log("[WS] Client disconnected"));
  });

  /** Broadcast a JSON payload to every connected client. */
  function broadcast(data: unknown): void {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  // Simulate a live indexer: emit one random translated event every 4 seconds.
  let cursor = 0;
  setInterval(() => {
    if (wss.clients.size === 0) return;

    const raw = { ...MOCK_RAW_EVENTS[cursor % MOCK_RAW_EVENTS.length] };
    // Give it a fresh id & timestamp so the client treats it as new.
    raw.id = `live-${Date.now()}-${cursor}`;
    raw.timestamp = Math.floor(Date.now() / 1000);
    raw.ledger += cursor;

    const translated = translateEvent(raw);
    broadcast(translated);
    cursor++;
  }, 4_000);

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
