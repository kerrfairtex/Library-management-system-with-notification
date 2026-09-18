// Polyfill for Node 20 which lacks native WebSocket support.
// Required by @supabase/realtime-js when using createClient() in Node.
import { WebSocket } from 'ws';
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WebSocket;
}
