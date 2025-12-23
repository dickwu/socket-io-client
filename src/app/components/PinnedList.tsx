'use client';

import { useEffect, useState } from 'react';
import { Button, Tooltip, Empty, App } from 'antd';
import {
  DownOutlined,
  UpOutlined,
  SendOutlined,
  DeleteOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useSocketStore, useCurrentConnection } from '@/app/stores/socketStore';
import { listPinnedMessages, deletePinnedMessage, updatePinnedMessage } from '@/app/hooks/useTauri';
import PinNameModal from './PinNameModal';

export default function PinnedList() {
  const { message, modal } = App.useApp();
  const showPinnedList = useSocketStore((state) => state.showPinnedList);
  const togglePinnedList = useSocketStore((state) => state.togglePinnedList);
  const pinnedMessages = useSocketStore((state) => state.pinnedMessages);
  const setPinnedMessages = useSocketStore((state) => state.setPinnedMessages);
  const openSendModal = useSocketStore((state) => state.openSendModal);

  const currentConnection = useCurrentConnection();

  // Rename modal state
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [editingPin, setEditingPin] = useState<{ id: number; eventName: string; payload: string; currentLabel: string } | null>(null);

  // Load pinned messages when connection changes
  useEffect(() => {
    if (currentConnection) {
      loadPinnedMessages();
    } else {
      setPinnedMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentConnection?.id]);

  async function loadPinnedMessages() {
    if (!currentConnection) return;
    try {
      const pinned = await listPinnedMessages(currentConnection.id);
      setPinnedMessages(pinned);
    } catch {
      // Ignore errors
    }
  }

  function handleSend(eventName: string, payload: string) {
    // Open send modal with pre-filled data
    openSendModal(eventName, payload);
  }

  function handleEdit(id: number, eventName: string, payload: string, currentLabel: string) {
    // Open rename modal
    setEditingPin({ id, eventName, payload, currentLabel });
    setRenameModalOpen(true);
  }

  async function handleRenameConfirm(newLabel: string) {
    if (!editingPin) return;

    try {
      await updatePinnedMessage({
        id: editingPin.id,
        eventName: editingPin.eventName,
        payload: editingPin.payload,
        label: newLabel,
      });

      await loadPinnedMessages();
      message.success('Pinned message renamed');
    } catch {
      message.error('Failed to rename');
    } finally {
      setRenameModalOpen(false);
      setEditingPin(null);
    }
  }

  function handleRenameCancel() {
    setRenameModalOpen(false);
    setEditingPin(null);
  }

  async function handleDelete(id: number) {
    modal.confirm({
      title: 'Delete Pinned Message',
      content: 'Are you sure you want to delete this pinned message?',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deletePinnedMessage(id);
          await loadPinnedMessages();
          message.success('Pinned message deleted');
        } catch {
          message.error('Failed to delete');
        }
      },
    });
  }

  return (
    <div>
      <div className="collapsible-header" onClick={togglePinnedList}>
        <span className="collapsible-title">Pinned Messages ({pinnedMessages.length})</span>
        {showPinnedList ? <UpOutlined /> : <DownOutlined />}
      </div>

      {showPinnedList && (
        <div className="pinned-list">
          {pinnedMessages.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No pinned messages"
              style={{ padding: '20px 0' }}
            />
          ) : (
            pinnedMessages.map((pinned) => (
              <div key={pinned.id} className="pinned-item">
                <span className="pinned-item-label">{pinned.label || pinned.eventName}</span>
                <span className="pinned-item-event">{pinned.eventName}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <Tooltip title="Send">
                    <Button
                      type="primary"
                      size="small"
                      icon={<SendOutlined />}
                      onClick={() => handleSend(pinned.eventName, pinned.payload)}
                    />
                  </Tooltip>
                  <Tooltip title="Rename">
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => handleEdit(pinned.id, pinned.eventName, pinned.payload, pinned.label || pinned.eventName)}
                    />
                  </Tooltip>
                  <Tooltip title="Delete">
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleDelete(pinned.id)}
                    />
                  </Tooltip>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Rename Modal */}
      <PinNameModal
        open={renameModalOpen}
        onOk={handleRenameConfirm}
        onCancel={handleRenameCancel}
        defaultName={editingPin?.currentLabel || ''}
        title="Rename Pinned Message"
      />
    </div>
  );
}
