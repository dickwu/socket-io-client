'use client';

import { useEffect, useCallback } from 'react';
import { Button, Tooltip, App } from 'antd';
import {
  PlusOutlined,
  ApiOutlined,
  SettingOutlined,
  DeleteOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { useSocketStore, Connection, ConnectionStatus } from '@/app/stores/socketStore';
import {
  listConnections,
  deleteConnection,
  setCurrentConnection,
  socketDisconnect,
} from '@/app/hooks/useTauri';

export default function Sidebar() {
  const { message, modal } = App.useApp();
  const connections = useSocketStore((state) => state.connections);
  const setConnections = useSocketStore((state) => state.setConnections);
  const currentConnectionId = useSocketStore((state) => state.currentConnectionId);
  const connectionStatuses = useSocketStore((state) => state.connectionStatuses);
  const setCurrentConnectionId = useSocketStore((state) => state.setCurrentConnectionId);
  const removeConnectionStatus = useSocketStore((state) => state.removeConnectionStatus);
  const openSettingsModal = useSocketStore((state) => state.openSettingsModal);
  const sidebarCollapsed = useSocketStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useSocketStore((state) => state.toggleSidebar);

  const loadConnections = useCallback(async () => {
    try {
      const conns = await listConnections();
      setConnections(conns);
    } catch {
      // Tauri might not be available in browser
      console.log('Running outside Tauri');
    }
  }, [setConnections]);

  // Load connections on mount
  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  async function handleSelectConnection(conn: Connection) {
    if (conn.id === currentConnectionId) return;

    setCurrentConnectionId(conn.id);
    try {
      await setCurrentConnection(conn.id);
    } catch {
      // Ignore error
    }
  }

  async function handleDeleteConnection(conn: Connection, e: React.MouseEvent) {
    e.stopPropagation();

    modal.confirm({
      title: 'Delete Connection',
      content: `Are you sure you want to delete "${conn.name}"?`,
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          // Ensure runtime socket state is cleaned up before deleting persisted config.
          await socketDisconnect(conn.id).catch(() => {});
          await deleteConnection(conn.id);
          await loadConnections();

          if (conn.id === currentConnectionId) {
            setCurrentConnectionId(null);
          }
          removeConnectionStatus(conn.id);

          message.success('Connection deleted');
        } catch {
          message.error('Failed to delete connection');
        }
      },
    });
  }

  function handleEditConnection(conn: Connection, e: React.MouseEvent) {
    e.stopPropagation();
    openSettingsModal(conn);
  }

  function getStatusClass(status: ConnectionStatus | undefined) {
    switch (status) {
      case 'connected':
        return 'connected';
      case 'connecting':
        return 'connecting';
      case 'error':
        return 'error';
      case 'disconnected':
        return 'disconnected';
      case undefined:
        return 'disconnected';
      default:
        {
          const _exhaustive: never = status;
          void _exhaustive;
        }
        return 'disconnected';
    }
  }

  return (
    <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {!sidebarCollapsed && (
          <div className="sidebar-header-title">
            <ApiOutlined style={{ color: '#10b981' }} />
            <span>Connections</span>
          </div>
        )}
        <div
          style={{
            display: 'flex',
            gap: 4,
            marginLeft: sidebarCollapsed ? 'auto' : undefined,
            marginRight: sidebarCollapsed ? 'auto' : undefined,
          }}
        >
          {!sidebarCollapsed && (
            <Tooltip title="New Connection">
              <Button type="text" icon={<PlusOutlined />} onClick={() => openSettingsModal()} />
            </Tooltip>
          )}
          <Tooltip title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <Button
              type="text"
              icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={toggleSidebar}
            />
          </Tooltip>
        </div>
      </div>

      <div className="sidebar-content">
        {sidebarCollapsed ? (
          <div className="sidebar-collapsed-items">
            {connections.map((conn) => (
              <Tooltip key={conn.id} title={conn.name} placement="right">
                <div
                  className={`connection-item-collapsed ${conn.id === currentConnectionId ? 'active' : ''}`}
                  onClick={() => handleSelectConnection(conn)}
                >
                  <div
                    className={`connection-item-status ${getStatusClass(
                      connectionStatuses[conn.id]
                    )}`}
                  />
                </div>
              </Tooltip>
            ))}
            <Tooltip title="New Connection" placement="right">
              <div
                className="connection-item-collapsed add-new"
                onClick={() => openSettingsModal()}
              >
                <PlusOutlined style={{ fontSize: 14, color: '#10b981' }} />
              </div>
            </Tooltip>
          </div>
        ) : connections.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px 20px' }}>
            <ApiOutlined className="empty-state-icon" />
            <div className="empty-state-text">No connections yet</div>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openSettingsModal()}
              style={{ marginTop: 16 }}
            >
              Add Connection
            </Button>
          </div>
        ) : (
          connections.map((conn) => (
            <div
              key={conn.id}
              className={`connection-item ${conn.id === currentConnectionId ? 'active' : ''}`}
              onClick={() => handleSelectConnection(conn)}
            >
              <div
                className={`connection-item-status ${getStatusClass(connectionStatuses[conn.id])}`}
              />
              <div className="connection-item-info">
                <div className="connection-item-name">{conn.name}</div>
                <div className="connection-item-url">{conn.url}</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <Tooltip title="Settings">
                  <Button
                    type="text"
                    size="small"
                    icon={<SettingOutlined />}
                    onClick={(e) => handleEditConnection(conn, e)}
                  />
                </Tooltip>
                <Tooltip title="Delete">
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={(e) => handleDeleteConnection(conn, e)}
                  />
                </Tooltip>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
