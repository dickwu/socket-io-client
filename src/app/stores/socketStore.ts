import { create } from 'zustand';

// Types
export interface Connection {
  id: number;
  name: string;
  url: string;
  namespace: string;
  authToken: string | null;
  options: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionEvent {
  id: number;
  eventName: string;
  isListening: boolean;
}

export interface EmitLog {
  id: number;
  eventName: string;
  payload: string;
  sentAt: string;
}

export interface PinnedMessage {
  id: number;
  eventName: string;
  payload: string;
  label: string | null;
  sortOrder: number;
  autoSend?: boolean;
}

export interface AutoSendSettings {
  onConnect: boolean;
  onReconnect: boolean;
}

export interface ReceivedEvent {
  id: string;
  eventName: string;
  payload: string;
  timestamp: Date;
  direction: 'in' | 'out';
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface SocketStore {
  // Connection state
  connections: Connection[];
  currentConnectionId: number | null;
  connectionStatus: ConnectionStatus;
  errorMessage: string | null;

  // Events state
  connectionEvents: ConnectionEvent[];
  receivedEvents: ReceivedEvent[];
  filteredEventName: string | null;

  // Emit logs
  emitLogs: EmitLog[];

  // Pinned messages
  pinnedMessages: PinnedMessage[];

  // Auto-send settings per connection
  autoSendSettings: Record<number, AutoSendSettings>;

  // UI state
  isSettingsModalOpen: boolean;
  editingConnection: Connection | null;

  // Send message modal state
  isSendModalOpen: boolean;
  sendModalEventName: string;
  sendModalPayload: string;

  // Compose message modal state
  isComposeModalOpen: boolean;
  composeModalEventName: string;
  composeModalPayload: string;

  // Panel visibility
  showEmitLog: boolean;
  showPinnedList: boolean;
  sidebarCollapsed: boolean;

  // Actions - Connections
  setConnections: (connections: Connection[]) => void;
  setCurrentConnectionId: (id: number | null) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setErrorMessage: (message: string | null) => void;

  // Actions - Events
  setConnectionEvents: (events: ConnectionEvent[]) => void;
  addReceivedEvent: (event: ReceivedEvent) => void;
  clearReceivedEvents: () => void;
  setFilteredEventName: (eventName: string | null) => void;

  // Actions - Emit logs
  setEmitLogs: (logs: EmitLog[]) => void;
  addEmitLog: (log: EmitLog) => void;

  // Actions - Pinned messages
  setPinnedMessages: (messages: PinnedMessage[]) => void;

  // Actions - Auto-send settings
  setAutoSendSettings: (connectionId: number, settings: AutoSendSettings) => void;
  getAutoSendSettings: (connectionId: number) => AutoSendSettings;

  // Actions - UI
  openSettingsModal: (connection?: Connection) => void;
  closeSettingsModal: () => void;
  openSendModal: (eventName?: string, payload?: string) => void;
  closeSendModal: () => void;
  openComposeModal: (eventName?: string, payload?: string) => void;
  closeComposeModal: () => void;
  toggleEmitLog: () => void;
  togglePinnedList: () => void;
  toggleSidebar: () => void;
}

const AUTO_SEND_STORAGE_KEY = 'socket-io-client:auto-send-settings';

function loadAutoSendSettings(): Record<number, AutoSendSettings> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(AUTO_SEND_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<number, AutoSendSettings>;
  } catch {
    return {};
  }
}

function persistAutoSendSettings(settings: Record<number, AutoSendSettings>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUTO_SEND_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore persistence errors
  }
}

export const useSocketStore = create<SocketStore>((set, get) => ({
  // Initial state
  connections: [],
  currentConnectionId: null,
  connectionStatus: 'disconnected',
  errorMessage: null,

  connectionEvents: [],
  receivedEvents: [],
  filteredEventName: null,

  emitLogs: [],
  pinnedMessages: [],
  autoSendSettings: loadAutoSendSettings(),

  isSettingsModalOpen: false,
  editingConnection: null,

  isSendModalOpen: false,
  sendModalEventName: '',
  sendModalPayload: '{}',

  isComposeModalOpen: false,
  composeModalEventName: '',
  composeModalPayload: '{}',

  showEmitLog: true,
  showPinnedList: true,
  sidebarCollapsed: false,

  // Actions - Connections
  setConnections: (connections) => set({ connections }),
  setCurrentConnectionId: (id) => set({ currentConnectionId: id }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setErrorMessage: (message) => set({ errorMessage: message }),

  // Actions - Events
  setConnectionEvents: (events) => set({ connectionEvents: events }),
  addReceivedEvent: (event) =>
    set((state) => ({
      receivedEvents: [event, ...state.receivedEvents].slice(0, 1000), // Keep last 1000 events
    })),
  clearReceivedEvents: () => set({ receivedEvents: [] }),
  setFilteredEventName: (eventName) => set({ filteredEventName: eventName }),

  // Actions - Emit logs
  setEmitLogs: (logs) => set({ emitLogs: logs }),
  addEmitLog: (log) =>
    set((state) => ({
      emitLogs: [log, ...state.emitLogs].slice(0, 100),
    })),

  // Actions - Pinned messages
  setPinnedMessages: (messages) => set({ pinnedMessages: messages }),

  // Actions - Auto-send settings
  setAutoSendSettings: (connectionId, settings) =>
    set((state) => {
      const next = { ...state.autoSendSettings, [connectionId]: settings };
      persistAutoSendSettings(next);
      return { autoSendSettings: next };
    }),
  getAutoSendSettings: (connectionId) => {
    const existing = get().autoSendSettings[connectionId];
    return existing || { onConnect: false, onReconnect: false };
  },

  // Actions - UI
  openSettingsModal: (connection) =>
    set({
      isSettingsModalOpen: true,
      editingConnection: connection || null,
    }),
  closeSettingsModal: () =>
    set({
      isSettingsModalOpen: false,
      editingConnection: null,
    }),
  openSendModal: (eventName, payload) =>
    set({
      isSendModalOpen: true,
      sendModalEventName: eventName || '',
      sendModalPayload: payload || '{}',
    }),
  closeSendModal: () =>
    set({
      isSendModalOpen: false,
      sendModalEventName: '',
      sendModalPayload: '{}',
    }),
  openComposeModal: (eventName, payload) =>
    set({
      isComposeModalOpen: true,
      composeModalEventName: eventName || '',
      composeModalPayload: payload || '{}',
    }),
  closeComposeModal: () =>
    set({
      isComposeModalOpen: false,
      composeModalEventName: '',
      composeModalPayload: '{}',
    }),
  toggleEmitLog: () => set((state) => ({ showEmitLog: !state.showEmitLog })),
  togglePinnedList: () => set((state) => ({ showPinnedList: !state.showPinnedList })),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));

// Computed selectors
export const useCurrentConnection = () => {
  const connections = useSocketStore((state) => state.connections);
  const currentConnectionId = useSocketStore((state) => state.currentConnectionId);
  return connections.find((c) => c.id === currentConnectionId) || null;
};

export const useFilteredEvents = () => {
  const receivedEvents = useSocketStore((state) => state.receivedEvents);
  const filteredEventName = useSocketStore((state) => state.filteredEventName);

  if (!filteredEventName) return receivedEvents;
  return receivedEvents.filter((e) => e.eventName === filteredEventName);
};

export const useEventCounts = () => {
  const receivedEvents = useSocketStore((state) => state.receivedEvents);

  const counts: Record<string, number> = {};
  for (const event of receivedEvents) {
    counts[event.eventName] = (counts[event.eventName] || 0) + 1;
  }
  return counts;
};
