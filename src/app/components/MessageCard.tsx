'use client';

import type { DragEvent, ReactNode } from 'react';
import { Space } from 'antd';

interface MessageCardProps {
  title: string;
  subtitle?: string | null;
  payloadPreview: string;
  payloadFull?: string;
  meta?: string;
  actions?: ReactNode;
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLDivElement>) => void;
}

export default function MessageCard({
  title,
  subtitle,
  payloadPreview,
  payloadFull,
  meta,
  actions,
  draggable,
  isDragging,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: MessageCardProps) {
  return (
    <div
      className={`message-card ${isDragging ? 'message-card-dragging' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="message-card-header">
        <div className="message-card-title" title={title}>
          {title}
        </div>
        {subtitle ? (
          <div className="message-card-subtitle" title={subtitle}>
            {subtitle}
          </div>
        ) : null}
      </div>
      <div className="message-card-payload" title={payloadFull || payloadPreview}>
        {payloadPreview}
      </div>
      <div className="message-card-footer">
        {meta ? <div className="message-card-meta">{meta}</div> : <div />}
        {actions ? (
          <Space size={4} className="message-card-actions">
            {actions}
          </Space>
        ) : null}
      </div>
    </div>
  );
}
