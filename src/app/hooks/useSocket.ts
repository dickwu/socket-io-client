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
    if (!isTauriAvailable) return;

    const currentSet = new Set(listeningEvents);
    const previousSet = previousListenersRef.current;

    for (const eventName of currentSet) {
      if (!previousSet.has(eventName)) {
        void socketAddListener(eventName).catch(() => {});
      }
    }

    for (const eventName of previousSet) {
      if (!currentSet.has(eventName)) {
        void socketRemoveListener(eventName).catch(() => {});
      }
    }

    previousListenersRef.current = currentSet;
  }, [listeningEvents, currentConnection?.id]);

  const connect = useCallback(() => {
    if (!currentConnection) return;

    const { setConnectionStatus, setErrorMessage } = useSocketStore.getState();

    if (!isTauriAvailable) {
      setConnectionStatus('error');
      setErrorMessage('Tauri runtime not available');
      return;
    }

    // Status will be set by Tauri event from Rust
    void socketConnect(currentConnection.id).catch((error) => {
      const msg = error instanceof Error ? error.message : 'Connection failed';
      useSocketStore.getState().setConnectionStatus('error');
      useSocketStore.getState().setErrorMessage(msg);
    });
  }, [currentConnection]);

  const disconnect = useCallback(() => {
    const { setConnectionStatus, setErrorMessage } = useSocketStore.getState();

    if (!isTauriAvailable) {
      setConnectionStatus('disconnected');
      setErrorMessage(null);
      return;
    }

    void socketDisconnect().catch(() => {});
    setConnectionStatus('disconnected');
    setErrorMessage(null);
  }, []);

  const emit = useCallback(
    (eventName: string, payload: unknown): boolean => {
      if (connectionStatus !== 'connected') return false;

      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

      if (isTauriAvailable) {
        void socketEmit(eventName, payloadString).catch((error) => {
          const msg = error instanceof Error ? error.message : 'Failed to emit event';
          useSocketStore.getState().setConnectionStatus('error');
          useSocketStore.getState().setErrorMessage(msg);
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
    [connectionStatus]
  );

  return {
    connect,
    disconnect,
    emit,
    socket: null,
  };
}

export default useSocket;
