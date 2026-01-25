'use client';

import { useEffect, useState } from 'react';
import { Button, Tooltip, Empty, App } from 'antd';
import {
  DownOutlined,
  UpOutlined,
  SendOutlined,
  PushpinOutlined,
  DeleteOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useSocketStore, useCurrentConnection } from '@/app/stores/socketStore';
import {
  listEmitLogs,
  clearEmitLogs,
  addPinnedMessage,
  listPinnedMessages,
  findDuplicatePinnedMessage,
} from '@/app/hooks/useTauri';
import PinNameModal from './PinNameModal';

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function truncatePayload(payload: string, maxLen = 50): string {
  if (payload.length <= maxLen) return payload;
  return payload.substring(0, maxLen) + '...';
}

export default function EmitLogPanel() {
  const { message } = App.useApp();
  const showEmitLog = useSocketStore((state) => state.showEmitLog);
  const toggleEmitLog = useSocketStore((state) => state.toggleEmitLog);
  const emitLogs = useSocketStore((state) => state.emitLogs);
  const setEmitLogs = useSocketStore((state) => state.setEmitLogs);
  const setPinnedMessages = useSocketStore((state) => state.setPinnedMessages);
  const openComposeModal = useSocketStore((state) => state.openComposeModal);

  const currentConnection = useCurrentConnection();

  // Pin name modal state
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ eventName: string; payload: string } | null>(null);

  // Load emit logs when connection changes
  useEffect(() => {
    if (currentConnection) {
      loadEmitLogs();
    } else {
      setEmitLogs([]);
    }
  }, [currentConnection?.id]);

  async function loadEmitLogs() {
    if (!currentConnection) return;
    try {
      const logs = await listEmitLogs(currentConnection.id);
      setEmitLogs(logs);
    } catch {
      // Ignore errors
    }
  }

  async function handleClear() {
    if (!currentConnection) return;
    try {
      await clearEmitLogs(currentConnection.id);
      setEmitLogs([]);
      message.success('Emit logs cleared');
    } catch {
      message.error('Failed to clear logs');
    }
  }

  function handleResend(eventName: string, payload: string) {
    // Open compose modal with pre-filled data
    openComposeModal(eventName, payload);
  }

  function handleEdit(eventName: string, payload: string) {
    // Open compose modal for editing
    openComposeModal(eventName, payload);
  }

  async function handlePin(eventName: string, payload: string) {
    if (!currentConnection) return;

    // Check for duplicates
    try {
      const duplicateId = await findDuplicatePinnedMessage(
        currentConnection.id,
        eventName,
        payload
      );

      if (duplicateId) {
        message.warning('This message is already pinned');
        return;
      }

      // Open modal for custom name
      setPendingPin({ eventName, payload });
      setPinModalOpen(true);
    } catch {
      message.error('Failed to check duplicate');
    }
  }

  async function handlePinConfirm(customName: string) {
    if (!currentConnection || !pendingPin) return;

    try {
      await addPinnedMessage({
        connectionId: currentConnection.id,
        eventName: pendingPin.eventName,
        payload: pendingPin.payload,
        label: customName,
      });

      const pinnedList = await listPinnedMessages(currentConnection.id);
      setPinnedMessages(pinnedList);
      message.success('Message pinned');
    } catch {
      message.error('Failed to pin');
    } finally {
      setPinModalOpen(false);
      setPendingPin(null);
    }
  }

  function handlePinCancel() {
    setPinModalOpen(false);
    setPendingPin(null);
  }

  return (
    <div>
      <div className="collapsible-header" onClick={toggleEmitLog}>
        <span className="collapsible-title">Emit History ({emitLogs.length})</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {showEmitLog && emitLogs.length > 0 && (
            <Tooltip title="Clear history">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
              />
            </Tooltip>
          )}
          {showEmitLog ? <UpOutlined /> : <DownOutlined />}
        </div>
      </div>

      {showEmitLog && (
        <div className="emit-log">
          {emitLogs.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No emit history"
              style={{ padding: '20px 0' }}
            />
          ) : (
            emitLogs.map((log) => (
              <div key={log.id} className="emit-log-item">
                <span className="emit-log-event">{log.eventName}</span>
                <span className="emit-log-payload" title={log.payload}>
                  {truncatePayload(log.payload)}
                </span>
                <span className="emit-log-time">{formatTime(log.sentAt)}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <Tooltip title="Edit & Send">
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => handleEdit(log.eventName, log.payload)}
                    />
                  </Tooltip>
                  <Tooltip title="Re-send">
                    <Button
                      type="text"
                      size="small"
                      icon={<SendOutlined />}
                      onClick={() => handleResend(log.eventName, log.payload)}
                    />
                  </Tooltip>
                  <Tooltip title="Pin">
                    <Button
                      type="text"
                      size="small"
                      icon={<PushpinOutlined />}
                      onClick={() => handlePin(log.eventName, log.payload)}
                    />
                  </Tooltip>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Pin Name Modal */}
      <PinNameModal
        open={pinModalOpen}
        onOk={handlePinConfirm}
        onCancel={handlePinCancel}
        defaultName={pendingPin?.eventName || ''}
      />
    </div>
  );
}
