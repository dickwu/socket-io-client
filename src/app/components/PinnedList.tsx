'use client';

import { useEffect } from 'react';
import { Button, Tooltip, Empty, App } from 'antd';
import {
  DownOutlined,
  UpOutlined,
  SendOutlined,
  DeleteOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useSocketStore, useCurrentConnection } from '@/app/stores/socketStore';
import { listPinnedMessages, deletePinnedMessage } from '@/app/hooks/useTauri';

export default function PinnedList() {
  const { message, modal } = App.useApp();
  const showPinnedList = useSocketStore((state) => state.showPinnedList);
  const togglePinnedList = useSocketStore((state) => state.togglePinnedList);
  const pinnedMessages = useSocketStore((state) => state.pinnedMessages);
  const setPinnedMessages = useSocketStore((state) => state.setPinnedMessages);
  const openSendModal = useSocketStore((state) => state.openSendModal);

  const currentConnection = useCurrentConnection();

  // Load pinned messages when connection changes
  useEffect(() => {
    if (currentConnection) {
      loadPinnedMessages();
    } else {
      setPinnedMessages([]);
    }
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

  function handleEdit(eventName: string, payload: string) {
    // Open send modal for editing
    openSendModal(eventName, payload);
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
                  <Tooltip title="Edit & Send">
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => handleEdit(pinned.eventName, pinned.payload)}
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
    </div>
  );
}
