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
 */

export interface Env {
  ROOMS: DurableObjectNamespace;
}

function roomFromUrl(url: URL): string {
  // /ws?room=CODE  or  /room/CODE
  const q = url.searchParams.get('room');
  if (q) return q.slice(0, 24);
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'room' && parts[1]) return parts[1].slice(0, 24);
  return 'lobby';
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
      const room = roomFromUrl(url);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
      return stub.fetch(request);
    }

    return new Response('not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

/** One Durable Object per room; broadcasts each message to the other peers. */
export class Room implements DurableObject {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(_request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    // hibernation-aware accept — the DO can evict from memory between messages
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
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
