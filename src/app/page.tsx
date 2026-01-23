'use client';

import { useEffect, useCallback, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { Button, Tooltip, App, Badge } from 'antd';
import {
  ApiOutlined,
  DisconnectOutlined,
  SunOutlined,
  MoonOutlined,
  SendOutlined,
  CloudSyncOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useTheme } from './providers';
import { useSocketStore, useCurrentConnection } from './stores/socketStore';
import { useMcpStore, useMcpStatusColor } from './stores/mcpStore';
import {
  listConnections,
  getCurrentConnection,
  listConnectionEvents,
  listEmitLogs,
  listPinnedMessages,
  getMcpStatus,
} from './hooks/useTauri';
import useSocket from './hooks/useSocket';
import Sidebar from './components/Sidebar';
import EventTags from './components/EventTags';
import EventList from './components/EventList';
import ConnectionModal from './components/ConnectionModal';
import SendMessageModal from './components/SendMessageModal';
import McpModal from './components/McpModal';

export default function Home() {
  const { message, modal } = App.useApp();
  const { theme, toggleTheme } = useTheme();

  const [appVersion, setAppVersion] = useState<string>('');
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string; body?: string } | null>(
    null
  );
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const currentConnection = useCurrentConnection();
  const connectionStatus = useSocketStore((state) => state.connectionStatus);
  const setConnections = useSocketStore((state) => state.setConnections);
  const setCurrentConnectionId = useSocketStore((state) => state.setCurrentConnectionId);
  const setConnectionEvents = useSocketStore((state) => state.setConnectionEvents);
  const setEmitLogs = useSocketStore((state) => state.setEmitLogs);
  const setPinnedMessages = useSocketStore((state) => state.setPinnedMessages);
  const errorMessage = useSocketStore((state) => state.errorMessage);

  // MCP state
  const mcpStatus = useMcpStore((state) => state.status);
  const setMcpStatus = useMcpStore((state) => state.setStatus);
  const setMcpPort = useMcpStore((state) => state.setPort);
  const openMcpModal = useMcpStore((state) => state.openModal);
  const mcpStatusColor = useMcpStatusColor();

  // Send modal state
  const isSendModalOpen = useSocketStore((state) => state.isSendModalOpen);
  const sendModalEventName = useSocketStore((state) => state.sendModalEventName);
  const sendModalPayload = useSocketStore((state) => state.sendModalPayload);
  const openSendModal = useSocketStore((state) => state.openSendModal);
  const closeSendModal = useSocketStore((state) => state.closeSendModal);

  const { connect, disconnect } = useSocket();

  const initializeApp = useCallback(async () => {
    try {
      const conns = await listConnections();
      setConnections(conns);
      const currentId = await getCurrentConnection();
      if (currentId && conns.find((c) => c.id === currentId)) {
        setCurrentConnectionId(currentId);
      }
    } catch {
      console.log('Running in browser mode');
    }
  }, [setConnections, setCurrentConnectionId]);

  const loadVersion = useCallback(async () => {
    try {
      const version = await getVersion();
      setAppVersion(version);
    } catch {
      // Running in browser mode
    }
  }, []);

  const loadMcpStatus = useCallback(async () => {
    try {
      const status = await getMcpStatus();
      setMcpStatus(status.status);
      setMcpPort(status.port ?? null);
    } catch {
      // Running in browser mode
    }
  }, [setMcpPort, setMcpStatus]);

  const checkForUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    try {
      const update = await check();
      if (update) {
        setUpdateAvailable({ version: update.version, body: update.body ?? undefined });
        modal.confirm({
          title: `Update Available: v${update.version}`,
          content: update.body || 'A new version is available. Would you like to update now?',
          okText: 'Update Now',
          cancelText: 'Later',
          onOk: async () => {
            message.loading({ content: 'Downloading update...', key: 'update', duration: 0 });
            await update.downloadAndInstall();
            message.success({ content: 'Update installed! Restarting...', key: 'update' });
            await relaunch();
          },
        });
      } else {
        message.success("You're on the latest version!");
        setUpdateAvailable(null);
      }
    } catch {
      message.error('Failed to check for updates');
    } finally {
      setCheckingUpdate(false);
    }
  }, [message, modal]);

  const loadConnectionData = useCallback(
    async (connectionId: number) => {
      try {
        const [events, logs, pinned] = await Promise.all([
          listConnectionEvents(connectionId),
          listEmitLogs(connectionId),
          listPinnedMessages(connectionId),
        ]);
        setConnectionEvents(events);
        setEmitLogs(logs);
        setPinnedMessages(pinned);
      } catch {
        // Ignore errors
      }
    },
    [setConnectionEvents, setEmitLogs, setPinnedMessages]
  );

  useEffect(() => {
    initializeApp();
    loadVersion();
    loadMcpStatus();
  }, [initializeApp, loadMcpStatus, loadVersion]);

  useEffect(() => {
    if (currentConnection) {
      loadConnectionData(currentConnection.id);
    }
  }, [currentConnection, loadConnectionData]);

  function handleConnect() {
    if (connectionStatus === 'connected') {
      disconnect();
      message.info('Disconnected');
    } else {
      if (!currentConnection) {
        message.warning('Please select a connection first');
        return;
      }
      connect();
    }
  }

  function getStatusText() {
    switch (connectionStatus) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return `Error: ${errorMessage || 'Unknown error'}`;
      default:
        return 'Disconnected';
    }
  }

  function getStatusColor() {
    switch (connectionStatus) {
      case 'connected':
        return '#10b981';
      case 'connecting':
        return '#f59e0b';
      case 'error':
        return '#ef4444';
      default:
        return '#9ca3af';
    }
  }

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        {/* Toolbar */}
        <div className="toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {currentConnection ? (
              <>
                <Button
                  type={connectionStatus === 'connected' ? 'default' : 'primary'}
                  icon={connectionStatus === 'connected' ? <DisconnectOutlined /> : <ApiOutlined />}
                  onClick={handleConnect}
                  loading={connectionStatus === 'connecting'}
                >
                  {connectionStatus === 'connected' ? 'Disconnect' : 'Connect'}
                </Button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: getStatusColor(),
                      boxShadow:
                        connectionStatus === 'connected'
                          ? '0 0 8px rgba(16, 185, 129, 0.5)'
                          : 'none',
                    }}
                  />
                  <span style={{ fontSize: 13, color: '#6b7280' }}>{getStatusText()}</span>
                </div>
              </>
            ) : (
              <span style={{ color: '#9ca3af', fontSize: 13 }}>
                Select a connection to get started
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={() => openSendModal()}
              disabled={connectionStatus !== 'connected'}
            >
              Send
            </Button>
            <Tooltip title="MCP Server Settings">
              <Button
                type="text"
                icon={<SettingOutlined />}
                onClick={openMcpModal}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: mcpStatusColor,
                    boxShadow: mcpStatus === 'running' ? `0 0 6px ${mcpStatusColor}` : 'none',
                  }}
                />
                <span style={{ fontSize: 12 }}>MCP</span>
              </Button>
            </Tooltip>
            <Tooltip title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
              <Button
                type="text"
                icon={theme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggleTheme}
              />
            </Tooltip>
          </div>
        </div>

        {/* Event Tags */}
        <EventTags />

        {/* Event List */}
        <EventList />

        {/* Status Bar */}
        <div className="status-bar">
          <span>{currentConnection ? currentConnection.url : 'No connection selected'}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>
              {currentConnection?.namespace !== '/'
                ? `Namespace: ${currentConnection?.namespace}`
                : ''}
            </span>
            <Tooltip title="Check for updates">
              <Badge dot={!!updateAvailable} offset={[-2, 2]}>
                <Button
                  type="text"
                  size="small"
                  icon={<CloudSyncOutlined spin={checkingUpdate} />}
                  onClick={checkForUpdate}
                  loading={checkingUpdate}
                  style={{ fontSize: 12, padding: '0 4px' }}
                >
                  v{appVersion || '...'}
                </Button>
              </Badge>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Connection Modal */}
      <ConnectionModal />

      {/* Send Message Modal */}
      <SendMessageModal
        open={isSendModalOpen}
        onClose={closeSendModal}
        initialEventName={sendModalEventName}
        initialPayload={sendModalPayload}
      />

      {/* MCP Modal */}
      <McpModal />
    </div>
  );
}
