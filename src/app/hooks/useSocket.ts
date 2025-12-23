'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { createSocket, disconnectSocket, getSocket } from '@/app/lib/socket';
import {
  useSocketStore,
  useCurrentConnection,
  ReceivedEvent,
  ConnectionEvent,
} from '@/app/stores/socketStore';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  
  const currentConnection = useCurrentConnection();
  const connectionEvents = useSocketStore((state) => state.connectionEvents);
  const setConnectionStatus = useSocketStore((state) => state.setConnectionStatus);
  const setErrorMessage = useSocketStore((state) => state.setErrorMessage);
  const addReceivedEvent = useSocketStore((state) => state.addReceivedEvent);
  
  // Connect to socket
  const connect = useCallback(() => {
    if (!currentConnection) return;
    
    // Disconnect existing socket first
    disconnectSocket();
    
    setConnectionStatus('connecting');
    setErrorMessage(null);
    
    try {
      const options = currentConnection.options ? JSON.parse(currentConnection.options) : {};
      
      const socket = createSocket({
        url: currentConnection.url,
        namespace: currentConnection.namespace,
        authToken: currentConnection.authToken || undefined,
        options,
      });
      
      socketRef.current = socket;
      
      // Connection events
      socket.on('connect', () => {
        setConnectionStatus('connected');
        setErrorMessage(null);
        
        // Add connect event to received events
        addReceivedEvent({
          id: `${Date.now()}-connect`,
          eventName: 'connect',
          payload: JSON.stringify({ socketId: socket.id }),
          timestamp: new Date(),
          direction: 'in',
        });
      });
      
      socket.on('disconnect', (reason) => {
        setConnectionStatus('disconnected');
        
        addReceivedEvent({
          id: `${Date.now()}-disconnect`,
          eventName: 'disconnect',
          payload: JSON.stringify({ reason }),
          timestamp: new Date(),
          direction: 'in',
        });
      });
      
      socket.on('connect_error', (error) => {
        setConnectionStatus('error');
        setErrorMessage(error.message);
        
        addReceivedEvent({
          id: `${Date.now()}-connect_error`,
          eventName: 'connect_error',
          payload: JSON.stringify({ message: error.message }),
          timestamp: new Date(),
          direction: 'in',
        });
      });
      
      // Setup event listeners
      setupEventListeners(socket, connectionEvents, addReceivedEvent);
      
      socket.connect();
    } catch (error) {
      setConnectionStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
    }
  }, [currentConnection, connectionEvents, setConnectionStatus, setErrorMessage, addReceivedEvent]);
  
  // Disconnect from socket
  const disconnect = useCallback(() => {
    disconnectSocket();
    socketRef.current = null;
    setConnectionStatus('disconnected');
  }, [setConnectionStatus]);
  
  // Emit event
  const emit = useCallback((eventName: string, payload: unknown): boolean => {
    const socket = getSocket();
    if (!socket?.connected) return false;
    
    socket.emit(eventName, payload);
    
    addReceivedEvent({
      id: `${Date.now()}-emit-${eventName}`,
      eventName,
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
      timestamp: new Date(),
      direction: 'out',
    });
    
    return true;
  }, [addReceivedEvent]);
  
  // Update listeners when connectionEvents change
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    
    // Re-setup event listeners
    setupEventListeners(socket, connectionEvents, addReceivedEvent);
  }, [connectionEvents, addReceivedEvent]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, []);
  
  return {
    connect,
    disconnect,
    emit,
    socket: socketRef.current,
  };
}

function setupEventListeners(
  socket: Socket,
  events: ConnectionEvent[],
  addReceivedEvent: (event: ReceivedEvent) => void
) {
  // Remove all custom listeners first (keep system listeners)
  const systemEvents = ['connect', 'disconnect', 'connect_error', 'reconnect', 'reconnect_attempt'];
  
  // Get all event names and remove non-system listeners
  // socket.io-client doesn't expose a way to get all listener event names easily,
  // so we'll track them ourselves
  
  // Add listeners for each listening event
  events
    .filter((e) => e.isListening)
    .forEach((event) => {
      if (systemEvents.includes(event.eventName)) return;
      
      // Remove existing listener for this event
      socket.off(event.eventName);
      
      // Add new listener
      socket.on(event.eventName, (data: unknown) => {
        addReceivedEvent({
          id: `${Date.now()}-${event.eventName}`,
          eventName: event.eventName,
          payload: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
          timestamp: new Date(),
          direction: 'in',
        });
      });
    });
}

export default useSocket;
