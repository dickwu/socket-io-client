'use client';

import { useMemo, useState } from 'react';
import { Button, Tooltip, Empty, Radio } from 'antd';
import { SendOutlined, EditOutlined, PushpinOutlined, DeleteOutlined } from '@ant-design/icons';
import type { EmitLog } from '@/app/stores/socketStore';
import MessageCard from './MessageCard';

function truncatePayload(payload: string, maxLen = 80): string {
  if (payload.length <= maxLen) return payload;
  return payload.substring(0, maxLen) + '...';
}

function formatRelativeTime(dateStr: string): string {
  const sentAt = new Date(dateStr).getTime();
  const diff = Date.now() - sentAt;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

type GroupMode = 'recent' | 'event';

interface HistoryPanelProps {
  items: EmitLog[];
  isConnected: boolean;
  onSend: (item: EmitLog) => void;
  onEdit: (item: EmitLog) => void;
  onPin: (item: EmitLog) => void;
  onClear: () => void;
}

export default function HistoryPanel({
  items,
  isConnected,
  onSend,
  onEdit,
  onPin,
  onClear,
}: HistoryPanelProps) {
  const [groupMode, setGroupMode] = useState<GroupMode>('recent');

  const grouped = useMemo(() => {
    if (groupMode === 'recent') return null;
    return items.reduce<Record<string, EmitLog[]>>((acc, log) => {
      if (!acc[log.eventName]) acc[log.eventName] = [];
      acc[log.eventName].push(log);
      return acc;
    }, {});
  }, [groupMode, items]);

  if (items.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No emit history" />;
  }

  return (
    <div>
      <div className="history-panel-header">
        <Radio.Group
          value={groupMode}
          onChange={(e) => setGroupMode(e.target.value)}
          size="small"
          optionType="button"
          buttonStyle="solid"
        >
          <Radio.Button value="recent">Recent</Radio.Button>
          <Radio.Button value="event">By Event</Radio.Button>
        </Radio.Group>
        <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={onClear}>
          Clear
        </Button>
      </div>

      {groupMode === 'recent' ? (
        <div className="message-panel-grid">
          {items.map((log) => (
            <MessageCard
              key={log.id}
              title={log.eventName}
              payloadPreview={truncatePayload(log.payload)}
              payloadFull={log.payload}
              meta={formatRelativeTime(log.sentAt)}
              actions={
                <>
                  <Tooltip title={isConnected ? 'Send' : 'Not connected'}>
                    <Button
                      size="small"
                      type="primary"
                      icon={<SendOutlined />}
                      onClick={() => onSend(log)}
                      disabled={!isConnected}
                    />
                  </Tooltip>
                  <Tooltip title="Edit">
                    <Button
                      size="small"
                      type="text"
                      icon={<EditOutlined />}
                      onClick={() => onEdit(log)}
                    />
                  </Tooltip>
                  <Tooltip title="Pin">
                    <Button
                      size="small"
                      type="text"
                      icon={<PushpinOutlined />}
                      onClick={() => onPin(log)}
                    />
                  </Tooltip>
                </>
              }
            />
          ))}
        </div>
      ) : (
        <div className="history-group-list">
          {grouped &&
            Object.entries(grouped).map(([eventName, logs]) => (
              <div key={eventName} className="history-group">
                <div className="history-group-title">
                  <span>{eventName}</span>
                  <span className="history-group-count">{logs.length}</span>
                </div>
                <div className="message-panel-grid">
                  {logs.map((log) => (
                    <MessageCard
                      key={log.id}
                      title={log.eventName}
                      payloadPreview={truncatePayload(log.payload)}
                      payloadFull={log.payload}
                      meta={formatRelativeTime(log.sentAt)}
                      actions={
                        <>
                          <Tooltip title={isConnected ? 'Send' : 'Not connected'}>
                            <Button
                              size="small"
                              type="primary"
                              icon={<SendOutlined />}
                              onClick={() => onSend(log)}
                              disabled={!isConnected}
                            />
                          </Tooltip>
                          <Tooltip title="Edit">
                            <Button
                              size="small"
                              type="text"
                              icon={<EditOutlined />}
                              onClick={() => onEdit(log)}
                            />
                          </Tooltip>
                          <Tooltip title="Pin">
                            <Button
                              size="small"
                              type="text"
                              icon={<PushpinOutlined />}
                              onClick={() => onPin(log)}
                            />
                          </Tooltip>
                        </>
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
