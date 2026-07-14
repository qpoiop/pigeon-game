/**
 * pigeonoid-worker — WebSocket relay for PIGEON PROTOCOL online play.
 *
 * A drop-in replacement for the public demo relay: clients connect per room
 * and every message is broadcast to the other members of that room (the game
 * tags messages with the room and ignores its own by id, so plain broadcast is
 * enough — presence updates and WebRTC voice signalling both ride this).
 *
 * Rooms are backed by a Durable Object (one instance per room code) using the
 * hibernatable WebSocket API, which is available on the Workers free plan with
 * the SQLite storage backend (see wrangler.toml migrations).
 *
 * Abuse / cost guards (all tunable via wrangler.toml [vars]):
 *   - ALLOWED_ORIGINS  origin whitelist for the WS upgrade (CSV; empty = allow all)
 *   - MAX_PEERS        max concurrent sockets per room (가용량)
 *   - MSG_RATE         sustained messages/sec per socket (token-bucket rate limit)
 *   - MSG_BURST        burst bucket size per socket
 *   - MAX_MSG_BYTES    max size of a single relayed message
 */

export interface Env {
  ROOMS: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
  MAX_PEERS?: string;
  MSG_RATE?: string;
  MSG_BURST?: string;
  MAX_MSG_BYTES?: string;
}

// Fallback defaults — used when the matching [vars] entry is absent.
const DEFAULTS = {
  MAX_PEERS: 8,
  MSG_RATE: 40, // messages/sec sustained
  MSG_BURST: 80, // bucket capacity
  MAX_MSG_BYTES: 16 * 1024, // 16 KiB
};

function num(v: string | undefined, fallback: number): number {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function roomFromUrl(url: URL): string {
  // /ws?room=CODE  or  /room/CODE
  const q = url.searchParams.get('room');
  if (q) return q.slice(0, 24);
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'room' && parts[1]) return parts[1].slice(0, 24);
  return 'lobby';
}

/** Empty/unset whitelist => allow all (local dev). Otherwise Origin must match. */
function originAllowed(origin: string | null, allowed: string | undefined): boolean {
  const list = (allowed ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return true;
  if (!origin) return false;
  return list.includes(origin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('pigeonoid-worker: websocket relay ok', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    if (url.pathname === '/ws' || url.pathname.startsWith('/room')) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket upgrade', { status: 426 });
      }
      // Origin whitelist — reject upgrades from pages we don't serve.
      if (!originAllowed(request.headers.get('Origin'), env.ALLOWED_ORIGINS)) {
        return new Response('origin not allowed', { status: 403 });
      }
      const room = roomFromUrl(url);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
      return stub.fetch(request);
    }

    return new Response('not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

/** Per-socket token-bucket state, persisted across DO hibernation via attachment. */
interface Bucket {
  tokens: number;
  ts: number; // ms of last refill
}

/** One Durable Object per room; broadcasts each message to the other peers. */
export class Room implements DurableObject {
  private state: DurableObjectState;
  private maxPeers: number;
  private rate: number;
  private burst: number;
  private maxBytes: number;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.maxPeers = num(env.MAX_PEERS, DEFAULTS.MAX_PEERS);
    this.rate = num(env.MSG_RATE, DEFAULTS.MSG_RATE);
    this.burst = num(env.MSG_BURST, DEFAULTS.MSG_BURST);
    this.maxBytes = num(env.MAX_MSG_BYTES, DEFAULTS.MAX_MSG_BYTES);
  }

  async fetch(_request: Request): Promise<Response> {
    // Capacity guard (가용량): reject once the room is full.
    if (this.state.getWebSockets().length >= this.maxPeers) {
      return new Response('room full', { status: 503 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    // hibernation-aware accept — the DO can evict from memory between messages
    this.state.acceptWebSocket(server);
    // seed a full rate-limit bucket for this socket
    server.serializeAttachment({ tokens: this.burst, ts: Date.now() } satisfies Bucket);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Refill + spend one token; returns false when the socket is over its rate. */
  private allow(ws: WebSocket): boolean {
    const now = Date.now();
    const prev = (ws.deserializeAttachment() as Bucket | null) ?? { tokens: this.burst, ts: now };
    const refilled = Math.min(this.burst, prev.tokens + ((now - prev.ts) / 1000) * this.rate);
    if (refilled < 1) {
      ws.serializeAttachment({ tokens: refilled, ts: now } satisfies Bucket);
      return false;
    }
    ws.serializeAttachment({ tokens: refilled - 1, ts: now } satisfies Bucket);
    return true;
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const size = typeof message === 'string' ? message.length : message.byteLength;
    if (size > this.maxBytes) {
      try {
        ws.close(1009, 'message too big');
      } catch {
        /* already closing */
      }
      return;
    }
    // Rate limit (레이트리밋): drop the message when the bucket is empty.
    if (!this.allow(ws)) return;

    for (const peer of this.state.getWebSockets()) {
      if (peer === ws) continue;
      try {
        peer.send(message);
      } catch {
        /* peer went away between getWebSockets() and send() */
      }
    }
  }

  webSocketClose(ws: WebSocket, code: number): void {
    try {
      ws.close(code === 1006 ? 1000 : code);
    } catch {
      /* already closing */
    }
  }

  webSocketError(ws: WebSocket): void {
    try {
      ws.close(1011);
    } catch {
      /* already closed */
    }
  }
}
