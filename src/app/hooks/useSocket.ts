'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import type { ConnectionStatus } from '@/app/stores/socketStore';
import { useSocketStore, useCurrentConnection } from '@/app/stores/socketStore';
import {
  socketConnect,
  socketDisconnect,
  socketEmit,
  socketAddListener,
  socketRemoveListener,
  listAutoSendMessages,
  addEmitLog,
  listEmitLogs,
} from '@/app/hooks/useTauri';

const isTauriAvailable = typeof window !== 'undefined' && isTauri();

const autoSendState = {
  lastStatus: null as ConnectionStatus | null,
  connectedOnce: new Set<number>(),
  inFlight: false,
};

export function useSocket() {
  const currentConnection = useCurrentConnection();
  const connectionEvents = useSocketStore((state) => state.connectionEvents);
  const connectionStatus = useSocketStore((state) => state.connectionStatus);
  const setEmitLogs = useSocketStore((state) => state.setEmitLogs);

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

  const emit = useCallback(
    (eventName: string, payload: unknown): boolean => {
      if (connectionStatus !== 'connected') return false;

      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

      if (isTauriAvailable) {
        void socketEmit(eventName, payloadString).catch((error) => {
          // Emit errors should NOT change connection status - the socket may still be connected
          // even if a single message fails to send. Log for debugging purposes.
          const msg = error instanceof Error ? error.message : 'Failed to emit event';
          console.error('Socket emit error:', msg);
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

  useEffect(() => {
    if (!isTauriAvailable || !currentConnection) {
      autoSendState.lastStatus = connectionStatus;
      return;
    }

    if (connectionStatus !== 'connected' || autoSendState.lastStatus === 'connected') {
      autoSendState.lastStatus = connectionStatus;
      return;
    }

    if (autoSendState.inFlight) {
      autoSendState.lastStatus = connectionStatus;
      return;
    }

    const connectionId = currentConnection.id;
    const wasConnectedBefore = autoSendState.connectedOnce.has(connectionId);
    const settings = useSocketStore.getState().getAutoSendSettings(connectionId);
    const shouldAutoSend = wasConnectedBefore ? settings.onReconnect : settings.onConnect;

    autoSendState.connectedOnce.add(connectionId);
    autoSendState.lastStatus = connectionStatus;

    if (!shouldAutoSend) return;

    autoSendState.inFlight = true;

    const runAutoSend = async () => {
      try {
        const messages = await listAutoSendMessages(connectionId);
        for (const msg of messages) {
          if (useSocketStore.getState().connectionStatus !== 'connected') break;
          let parsed: unknown;
          try {
            parsed = JSON.parse(msg.payload);
          } catch {
            parsed = msg.payload;
          }
          const success = emit(msg.eventName, parsed);
          if (success) {
            try {
              await addEmitLog(connectionId, msg.eventName, msg.payload);
            } catch {
              // Ignore log errors
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        try {
          const logs = await listEmitLogs(connectionId);
          setEmitLogs(logs);
        } catch {
          // Ignore log refresh errors
        }
      } finally {
        autoSendState.inFlight = false;
      }
    };

    void runAutoSend();
  }, [connectionStatus, currentConnection, emit, setEmitLogs]);

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

  return {
    connect,
    disconnect,
    emit,
    socket: null,
  };
}

export default useSocket;
