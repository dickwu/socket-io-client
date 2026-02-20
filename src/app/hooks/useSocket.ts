'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { useSocketStore, useCurrentConnection } from '@/app/stores/socketStore';
import {
  socketConnect,
  socketDisconnect,
  socketEmit,
  socketAddListener,
  socketRemoveListener,
} from '@/app/hooks/useTauri';

const isTauriAvailable = typeof window !== 'undefined' && isTauri();

export function useSocket() {
  const currentConnection = useCurrentConnection();
  const currentConnectionId = currentConnection?.id;
  const connectionEvents = useSocketStore((state) => state.connectionEvents);
  const connectionStatus = useSocketStore((state) => state.connectionStatus);

  const previousListenersRef = useRef<Set<string>>(new Set());

  const listeningEvents = useMemo(
    () =>
      connectionEvents
        .filter((event) => event.isListening)
        .map((event) => event.eventName)
        .sort(),
    [connectionEvents]
  );

  // Reset listeners when connection changes
  useEffect(() => {
    previousListenersRef.current = new Set();
  }, [currentConnection?.id]);

  // Sync event listeners with Rust backend
  useEffect(() => {
    if (!isTauriAvailable || !currentConnectionId) return;

    const currentSet = new Set(listeningEvents);
    const previousSet = previousListenersRef.current;

    for (const eventName of currentSet) {
      if (!previousSet.has(eventName)) {
        void socketAddListener(currentConnectionId, eventName).catch(() => {});
      }
    }

    for (const eventName of previousSet) {
      if (!currentSet.has(eventName)) {
        void socketRemoveListener(currentConnectionId, eventName).catch(() => {});
      }
    }

    previousListenersRef.current = currentSet;
  }, [listeningEvents, currentConnectionId]);

  const emit = useCallback(
    (eventName: string, payload: unknown): boolean => {
      if (!currentConnectionId || connectionStatus !== 'connected') return false;

      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

      if (isTauriAvailable) {
        void socketEmit(currentConnectionId, eventName, payloadString).catch((error) => {
          // Emit errors should NOT change connection status - the socket may still be connected
          // even if a single message fails to send. Log for debugging purposes.
          // Tauri invoke errors are strings, not Error objects
          const msg = error instanceof Error ? error.message : String(error);
          console.error('Socket emit error:', msg, error);
        });
      }

      useSocketStore.getState().addReceivedEvent({
        id: crypto.randomUUID(),
        eventName,
        payload: payloadString,
        timestamp: new Date(),
        direction: 'out',
      });

      return true;
    },
    [connectionStatus, currentConnectionId]
  );

  // Note: Auto-send is now handled entirely on the Rust side in socket_client.rs
  // This avoids race conditions between "connected" status and socket readiness

  const connect = useCallback(() => {
    if (!currentConnection) return;

    const { setConnectionStatus, setErrorMessage } = useSocketStore.getState();

    if (!isTauriAvailable) {
      setConnectionStatus('error');
      setErrorMessage('Tauri runtime not available');
      return;
    }

    const connectingId = currentConnection.id;
    // Status will be set by Tauri event from Rust
    void socketConnect(connectingId).catch((error) => {
      const msg = error instanceof Error ? error.message : 'Connection failed';
      const store = useSocketStore.getState();
      store.setConnectionStatusForId(connectingId, 'error');
      if (store.currentConnectionId === connectingId) {
        store.setErrorMessage(msg);
      }
    });
  }, [currentConnection]);

  const disconnect = useCallback(() => {
    if (!currentConnectionId) return;

    const { setConnectionStatus, setErrorMessage } = useSocketStore.getState();

    if (!isTauriAvailable) {
      setConnectionStatus('disconnected');
      setErrorMessage(null);
      return;
    }

    void socketDisconnect(currentConnectionId).catch(() => {});
    setConnectionStatus('disconnected');
    setErrorMessage(null);
  }, [currentConnectionId]);

  return {
    connect,
    disconnect,
    emit,
    socket: null,
  };
}

export default useSocket;
