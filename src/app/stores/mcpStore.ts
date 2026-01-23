import { create } from 'zustand';

export type McpServerStatus = 'stopped' | 'running' | 'error';

interface McpStore {
  // State
  status: McpServerStatus;
  port: number | null;
  loading: boolean;
  isModalOpen: boolean;

  // Actions
  setStatus: (status: McpServerStatus) => void;
  setPort: (port: number | null) => void;
  setLoading: (loading: boolean) => void;
  openModal: () => void;
  closeModal: () => void;
}

export const useMcpStore = create<McpStore>((set) => ({
  // Initial state
  status: 'stopped',
  port: null,
  loading: false,
  isModalOpen: false,

  // Actions
  setStatus: (status) => set({ status }),
  setPort: (port) => set({ port }),
  setLoading: (loading) => set({ loading }),
  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),
}));

// Helper selectors
export const useMcpStatusText = () => {
  const status = useMcpStore((state) => state.status);
  const port = useMcpStore((state) => state.port);

  switch (status) {
    case 'running':
      return `Running${port ? ` (${port})` : ''}`;
    case 'error':
      return 'Error';
    default:
      return 'Stopped';
  }
};

export const useMcpStatusColor = () => {
  const status = useMcpStore((state) => state.status);

  switch (status) {
    case 'running':
      return '#10b981';
    case 'error':
      return '#ef4444';
    default:
      return '#9ca3af';
  }
};
