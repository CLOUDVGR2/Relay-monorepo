/** Authenticated Socket.IO lifecycle for native presence and message events. */
import { io, type Socket } from 'socket.io-client';
import { API_ORIGIN } from './api';

let socket: Socket | null = null;

export function connectRealtime(token: string) {
  if (socket) {
    socket.auth = { token };
    if (!socket.connected) socket.connect();
    return socket;
  }

  socket = io(API_ORIGIN, {
    auth: { token },
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 10_000,
    timeout: 10_000,
    transports: ['polling'],
  });

  socket.on('connect', () => {
    if (__DEV__) console.log('[Relay realtime] Connected:', socket?.id);
  });

  socket.on('connect_error', (error) => {
    if (__DEV__) {
      const details = error as Error & {
        description?: unknown;
        context?: unknown;
      };

      console.warn('[Relay realtime] Connection failed:', {
        message: details.message,
        description: details.description,
        context: details.context,
        origin: API_ORIGIN,
        transport: socket?.io.engine?.transport?.name,
      });
    }
  });

  socket.on('disconnect', (reason) => {
    if (__DEV__) console.warn('[Relay realtime] Disconnected:', reason);
  });

  socket.connect();
  return socket;
}

export function getRealtimeSocket() {
  return socket;
}

export function disconnectRealtime() {
  if (!socket) return;

  // Disconnect the transport; each screen owns cleanup of its event handlers.
  socket.disconnect();
  socket = null;
}
