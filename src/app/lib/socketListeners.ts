'use client';

import { listen } from '@tauri-apps/api/event';
import { isTauri } from '@tauri-apps/api/core';
import { useSocketStore, ConnectionStatus } from '@/app/stores/socketStore';

interface SocketStatusPayload {
  connectionId: number;
  status: ConnectionStatus;
  message?: string;
}

interface SocketEventPayload {
  connectionId: number;
  eventName: string;
  payload: string;
  timestamp?: string;
  direction?: 'in' | 'out';
}

interface SocketErrorPayload {
  connectionId: number;
  message: string;
}

let listenersInitialized = false;

export async function initSocketListeners(): Promise<void> {
  // Only initialize once
  if (listenersInitialized) return;

  // Only in Tauri environment
  if (typeof window === 'undefined' || !isTauri()) return;

  listenersInitialized = true;

  const { setConnectionStatusForId } = useSocketStore.getState();

  try {
    // Listen for connection status changes
    await listen<SocketStatusPayload>('socket:status', ({ payload }) => {
      const store = useSocketStore.getState();
      setConnectionStatusForId(payload.connectionId, payload.status);

      if (store.currentConnectionId === payload.connectionId) {
        if (payload.status === 'error') {
          store.setErrorMessage(payload.message ?? 'Unknown error');
        } else {
          store.setErrorMessage(null);
        }
      }
    });

    // Listen for socket events (both incoming and outgoing)
    await listen<SocketEventPayload>('socket:event', ({ payload }) => {
      const store = useSocketStore.getState();
      if (store.currentConnectionId !== payload.connectionId) {
        return;
      }

      store.addReceivedEvent({
        id: crypto.randomUUID(),
        eventName: payload.eventName,
        payload: payload.payload ?? '',
        timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
        direction: payload.direction ?? 'in',
      });
    });

    // Listen for socket errors
    await listen<SocketErrorPayload>('socket:error', ({ payload }) => {
      const store = useSocketStore.getState();
      setConnectionStatusForId(payload.connectionId, 'error');
      if (store.currentConnectionId === payload.connectionId) {
        store.setErrorMessage(payload.message ?? 'Unknown error');
      }
    });

    console.log('Socket listeners initialized');
  } catch (err) {
    console.error('Failed to initialize socket listeners:', err);
  }
}

// Check if listeners are ready
export function areListenersInitialized(): boolean {
  return listenersInitialized;
}
