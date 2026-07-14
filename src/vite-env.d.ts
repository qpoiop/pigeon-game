/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WebSocket relay base URL (e.g. wss://pigeonoid-worker.<sub>.workers.dev/ws). */
  readonly VITE_RELAY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
