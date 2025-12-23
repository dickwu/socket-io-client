import { io, Socket, ManagerOptions, SocketOptions } from 'socket.io-client';

let socket: Socket | null = null;

export interface SocketConfig {
  url: string;
  namespace?: string;
  authToken?: string;
  transports?: ('websocket')[];
  options?: Partial<ManagerOptions & SocketOptions>;
}

export function createSocket(config: SocketConfig): Socket {
  const { url, namespace = '/', authToken, transports, options = {} } = config;
  
  const fullUrl = namespace === '/' ? url : `${url}${namespace}`;
  
  const socketOptions: Partial<ManagerOptions & SocketOptions> = {
    ...options,
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  };
  
  if (transports?.length) {
    socketOptions.transports = transports;
  }
  
  if (authToken) {
    socketOptions.auth = { token: authToken };
  }
  
  socket = io(fullUrl, socketOptions);
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function isConnected(): boolean {
  return socket?.connected ?? false;
}
