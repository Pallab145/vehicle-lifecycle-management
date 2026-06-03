// Stub for the Node.js 'ws' module.
// In the browser, the native WebSocket API is used instead.
// This file exists solely to satisfy Turbopack's module resolution during SSR.

export const WebSocket = globalThis.WebSocket ?? class WebSocket {
  constructor() {
    throw new Error('WebSocket is not available in this environment');
  }
};

export default WebSocket;
