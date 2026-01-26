'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Input, Button, App, Tabs } from 'antd';
import { PushpinOutlined, HistoryOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useSocketStore, useCurrentConnection } from '@/app/stores/socketStore';
import useSocket from '@/app/hooks/useSocket';
import {
  addEmitLog,
  addPinnedMessage,
  listEmitLogs,
  listPinnedMessages,
  deletePinnedMessage,
  clearEmitLogs,
  findDuplicatePinnedMessage,
  reorderPinnedMessages,
  togglePinnedAutoSend,
} from '@/app/hooks/useTauri';
import PinNameModal from './PinNameModal';
import PinnedPanel from './PinnedPanel';
import HistoryPanel from './HistoryPanel';

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

interface SendMessageModalProps {
  open: boolean;
  onClose: () => void;
  initialEventName?: string;
  initialPayload?: string;
}

export default function SendMessageModal({ open, onClose }: SendMessageModalProps) {
  const { message } = App.useApp();
  const [searchValue, setSearchValue] = useState('');
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ eventName: string; payload: string } | null>(null);

  const connectionStatus = useSocketStore((state) => state.connectionStatus);
  const emitLogs = useSocketStore((state) => state.emitLogs);
  const setEmitLogs = useSocketStore((state) => state.setEmitLogs);
  const pinnedMessages = useSocketStore((state) => state.pinnedMessages);
  const setPinnedMessages = useSocketStore((state) => state.setPinnedMessages);
  const openComposeModal = useSocketStore((state) => state.openComposeModal);

  const currentConnection = useCurrentConnection();
  const { emit } = useSocket();

  const isConnected = connectionStatus === 'connected';
  const search = normalizeSearch(searchValue);

  // Check if there are auto-send messages but the feature is disabled
  const hasAutoSendMessages = pinnedMessages.some((msg) => msg.autoSend);
  const autoSendFeatureDisabled = currentConnection
    ? hasAutoSendMessages && !currentConnection.autoSendOnConnect && !currentConnection.autoSendOnReconnect
    : false;

  // Load emit logs and reset search when modal opens
  useEffect(() => {
    if (open) {
      setSearchValue('');
      // Refresh emit logs when modal opens
      if (currentConnection) {
        listEmitLogs(currentConnection.id)
          .then((logs) => setEmitLogs(logs))
          .catch(() => {
            // Ignore errors
          });
      }
    }
  }, [open, currentConnection, setEmitLogs]);

  const filteredPinned = useMemo(() => {
    if (!search) return pinnedMessages;
    return pinnedMessages.filter((item) => {
      const label = item.label || '';
      return (
        item.eventName.toLowerCase().includes(search) ||
        label.toLowerCase().includes(search) ||
        item.payload.toLowerCase().includes(search)
      );
    });
  }, [pinnedMessages, search]);

  const filteredHistory = useMemo(() => {
    if (!search) return emitLogs;
    return emitLogs.filter(
      (log) =>
        log.eventName.toLowerCase().includes(search) ||
        log.payload.toLowerCase().includes(search)
    );
  }, [emitLogs, search]);

  const handleSendDirect = useCallback(
    async (eventName: string, payloadStr: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(payloadStr);
      } catch {
        parsed = payloadStr;
      }
      const success = emit(eventName, parsed);
      if (success) {
        if (currentConnection) {
          try {
            await addEmitLog(currentConnection.id, eventName, payloadStr);
            const logs = await listEmitLogs(currentConnection.id);
            setEmitLogs(logs);
          } catch {
            // Ignore
          }
        }
        message.success('Sent');
      } else {
        message.warning('Not connected');
      }
    },
    [emit, currentConnection, setEmitLogs, message]
  );

  const handleDeletePinned = useCallback(
    async (id: number) => {
      if (!currentConnection) return;
      try {
        await deletePinnedMessage(id);
        const pinnedList = await listPinnedMessages(currentConnection.id);
        setPinnedMessages(pinnedList);
        message.success('Deleted');
      } catch {
        message.error('Failed to delete');
      }
    },
    [currentConnection, setPinnedMessages, message]
  );

  const handleToggleAutoSend = useCallback(
    async (id: number, enabled: boolean) => {
      if (!currentConnection) return;
      try {
        await togglePinnedAutoSend(id, enabled);
        const pinnedList = await listPinnedMessages(currentConnection.id);
        setPinnedMessages(pinnedList);
        message.success(enabled ? 'Auto-send enabled' : 'Auto-send disabled');
      } catch {
        message.error('Failed to update auto-send');
      }
    },
    [currentConnection, setPinnedMessages, message]
  );

  const handleReorderPinned = useCallback(
    async (ids: number[]) => {
      if (!currentConnection) return;
      const previous = pinnedMessages;
      const next = ids
        .map((id) => previous.find((msg) => msg.id === id))
        .filter(Boolean);
      setPinnedMessages(next as typeof pinnedMessages);
      try {
        await reorderPinnedMessages(ids);
      } catch {
        setPinnedMessages(previous);
        message.error('Failed to reorder');
      }
    },
    [currentConnection, pinnedMessages, setPinnedMessages, message]
  );

  const handleClearLogs = useCallback(async () => {
    if (!currentConnection) return;
    try {
      await clearEmitLogs(currentConnection.id);
      setEmitLogs([]);
      message.success('History cleared');
    } catch {
      message.error('Failed to clear');
    }
  }, [currentConnection, setEmitLogs, message]);

  const handlePinFromHistory = useCallback(
    async (eventName: string, payloadStr: string) => {
      if (!currentConnection) return;
      try {
        const duplicateId = await findDuplicatePinnedMessage(
          currentConnection.id,
          eventName,
          payloadStr
        );

        if (duplicateId) {
          message.warning('This message is already pinned');
          return;
        }

        setPendingPin({ eventName, payload: payloadStr });
        setPinModalOpen(true);
      } catch {
        message.error('Failed to check duplicate');
      }
    },
    [currentConnection, message]
  );

  const handlePinConfirm = useCallback(
    async (customName: string) => {
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
    },
    [currentConnection, pendingPin, setPinnedMessages, message]
  );

  const handlePinCancel = useCallback(() => {
    setPinModalOpen(false);
    setPendingPin(null);
  }, []);

  return (
    <Modal
      title={
        <div className="flex items-center justify-between w-[calc(100%-24px)]">
          <span>Message Library</span>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openComposeModal()}>
            Compose
          </Button>
        </div>
      }
      open={open}
      onCancel={onClose}
      width={840}
      footer={null}
    >
      <div className="message-library-toolbar">
        <Input
          placeholder="Search event, label, or payload"
          prefix={<SearchOutlined />}
          allowClear
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />
      </div>

      <Tabs
        size="small"
        items={[
          {
            key: 'pinned',
            label: (
              <span>
                <PushpinOutlined /> Pinned ({pinnedMessages.length})
              </span>
            ),
            children: (
              <PinnedPanel
                items={filteredPinned}
                isConnected={isConnected}
                onSend={(item) => handleSendDirect(item.eventName, item.payload)}
                onEdit={(item) => openComposeModal(item.eventName, item.payload)}
                onDelete={(id) => handleDeletePinned(id)}
                onToggleAutoSend={handleToggleAutoSend}
                onReorder={handleReorderPinned}
              />
            ),
          },
          {
            key: 'history',
            label: (
              <span>
                <HistoryOutlined /> History ({emitLogs.length})
              </span>
            ),
            children: (
              <HistoryPanel
                items={filteredHistory}
                isConnected={isConnected}
                onSend={(item) => handleSendDirect(item.eventName, item.payload)}
                onEdit={(item) => openComposeModal(item.eventName, item.payload)}
                onPin={(item) => handlePinFromHistory(item.eventName, item.payload)}
                onClear={handleClearLogs}
              />
            ),
          },
        ]}
      />

      {!isConnected && (
        <div className="message-library-warning">
          Not connected to server. You can still browse, but sending is disabled.
        </div>
      )}

      {autoSendFeatureDisabled && (
        <div className="message-library-warning" style={{ background: '#fef3cd', color: '#856404' }}>
          You have messages marked for auto-send, but &quot;Auto-send on connect&quot; is disabled.
          Enable it in Connection Settings (gear icon) for auto-send to work.
        </div>
      )}

      <PinNameModal
        open={pinModalOpen}
        onOk={handlePinConfirm}
        onCancel={handlePinCancel}
        defaultName={pendingPin?.eventName || ''}
      />
    </Modal>
  );
}
