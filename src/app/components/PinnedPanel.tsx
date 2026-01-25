'use client';

import { useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { Button, Tooltip, Empty } from 'antd';
import {
  SendOutlined,
  EditOutlined,
  DeleteOutlined,
  ThunderboltOutlined,
  HolderOutlined,
} from '@ant-design/icons';
import type { PinnedMessage } from '@/app/stores/socketStore';
import MessageCard from './MessageCard';

function truncatePayload(payload: string, maxLen = 80): string {
  if (payload.length <= maxLen) return payload;
  return payload.substring(0, maxLen) + '...';
}

interface PinnedPanelProps {
  items: PinnedMessage[];
  isConnected: boolean;
  onSend: (item: PinnedMessage) => void;
  onEdit: (item: PinnedMessage) => void;
  onDelete: (id: number) => void;
  onToggleAutoSend: (id: number, enabled: boolean) => void;
  onReorder: (ids: number[]) => void;
}

export default function PinnedPanel({
  items,
  isConnected,
  onSend,
  onEdit,
  onDelete,
  onToggleAutoSend,
  onReorder,
}: PinnedPanelProps) {
  const [draggingId, setDraggingId] = useState<number | null>(null);

  const orderedIds = useMemo(() => items.map((item) => item.id), [items]);

  const handleDragStart = (id: number) => (event: DragEvent<HTMLDivElement>) => {
    setDraggingId(id);
    event.dataTransfer.setData('text/plain', String(id));
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (_id: number) => (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDrop = (targetId: number) => (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggingId || draggingId === targetId) return;
    const nextIds = [...orderedIds];
    const fromIndex = nextIds.indexOf(draggingId);
    const toIndex = nextIds.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    nextIds.splice(fromIndex, 1);
    nextIds.splice(toIndex, 0, draggingId);
    setDraggingId(null);
    onReorder(nextIds);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
  };

  if (items.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No pinned messages" />;
  }

  return (
    <div className="message-panel-grid">
      {items.map((item) => {
        const autoSendEnabled = item.autoSend ?? false;
        const title = item.label || item.eventName;
        const subtitle = item.label ? item.eventName : null;
        return (
          <MessageCard
            key={item.id}
            title={title}
            subtitle={subtitle}
            payloadPreview={truncatePayload(item.payload)}
            payloadFull={item.payload}
            draggable
            isDragging={draggingId === item.id}
            onDragStart={handleDragStart(item.id)}
            onDragOver={handleDragOver(item.id)}
            onDrop={handleDrop(item.id)}
            onDragEnd={handleDragEnd}
            actions={
              <>
                <Tooltip title="Drag to reorder">
                  <span className="message-card-drag">
                    <HolderOutlined />
                  </span>
                </Tooltip>
                <Tooltip title={autoSendEnabled ? 'Disable auto-send' : 'Auto-send on connect'}>
                  <Button
                    size="small"
                    type={autoSendEnabled ? 'primary' : 'text'}
                    icon={<ThunderboltOutlined />}
                    onClick={() => onToggleAutoSend(item.id, !autoSendEnabled)}
                  />
                </Tooltip>
                <Tooltip title={isConnected ? 'Send' : 'Not connected'}>
                  <Button
                    size="small"
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={() => onSend(item)}
                    disabled={!isConnected}
                  />
                </Tooltip>
                <Tooltip title="Edit">
                  <Button
                    size="small"
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => onEdit(item)}
                  />
                </Tooltip>
                <Tooltip title="Delete">
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => onDelete(item.id)}
                  />
                </Tooltip>
              </>
            }
          />
        );
      })}
    </div>
  );
}
