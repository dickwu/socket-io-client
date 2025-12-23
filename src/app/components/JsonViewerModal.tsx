'use client';

import { useState, useCallback, useEffect } from 'react';
import { Modal, Button, Tooltip, App, Space, Segmented } from 'antd';
import {
  CopyOutlined,
  FormatPainterOutlined,
  CompressOutlined,
  ExpandAltOutlined,
  ColumnWidthOutlined,
  CodeOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';
import JsonEditorView from './JsonEditorView';
import JsonTreeView from './JsonTreeView';

interface JsonViewerModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  eventName?: string;
  payload: string;
  direction?: 'in' | 'out';
  timestamp?: Date;
}

type ViewMode = 'editor' | 'tree';

export default function JsonViewerModal({
  open,
  onClose,
  title,
  eventName,
  payload,
  direction,
  timestamp,
}: JsonViewerModalProps) {
  const { message } = App.useApp();
  const [content, setContent] = useState(payload);
  const [wordWrap, setWordWrap] = useState<'on' | 'off'>('on');
  const [theme, setTheme] = useState<'vs-dark' | 'light'>('vs-dark');
  const [viewMode, setViewMode] = useState<ViewMode>('tree');

  // Check if payload is valid JSON
  const isValidJson = (() => {
    try {
      JSON.parse(payload);
      return true;
    } catch {
      return false;
    }
  })();

  // Reset content when payload changes
  useEffect(() => {
    setContent(payload);
  }, [payload]);

  // Detect system theme
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'vs-dark' : 'light');
  }, [open]);

  const handleFormat = useCallback(() => {
    try {
      const parsed = JSON.parse(content);
      const formatted = JSON.stringify(parsed, null, 2);
      setContent(formatted);
      message.success('JSON formatted');
    } catch {
      message.error('Invalid JSON - cannot format');
    }
  }, [content, message]);

  const handleMinify = useCallback(() => {
    try {
      const parsed = JSON.parse(content);
      const minified = JSON.stringify(parsed);
      setContent(minified);
      message.success('JSON minified');
    } catch {
      message.error('Invalid JSON - cannot minify');
    }
  }, [content, message]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
    message.success('Copied to clipboard');
  }, [content, message]);


  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    } as Intl.DateTimeFormatOptions);
  };

  const modalTitle = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span>{title || 'JSON Viewer'}</span>
        {eventName && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: direction === 'out' ? '#f59e0b' : '#10b981',
              background: direction === 'out' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              padding: '2px 8px',
              borderRadius: 4,
            }}
          >
            {eventName}
          </span>
        )}
        {timestamp && (
          <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>
            {formatTime(timestamp)}
          </span>
        )}
        {!isValidJson && (
          <span
            style={{
              fontSize: 11,
              color: '#ef4444',
              background: 'rgba(239, 68, 68, 0.1)',
              padding: '2px 8px',
              borderRadius: 4,
            }}
          >
            Not JSON
          </span>
        )}
      </div>
      {isValidJson && (
        <Segmented
          style={{ marginRight: '30px' }}
          size="small"
          value={viewMode}
          onChange={(v) => setViewMode(v as ViewMode)}
          options={[
            { label: <><ApartmentOutlined /> Tree</>, value: 'tree' },
            { label: <><CodeOutlined /> Editor</>, value: 'editor' },
          ]}
        />
      )}
    </div>
  );

  return (
    <Modal
      title={modalTitle}
      open={open}
      onCancel={onClose}
      width={'90%'}
      centered
      styles={{
        body: { padding: 0, top: '5%' },
      }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            {viewMode === 'editor' && (
              <Segmented
                size="small"
                value={wordWrap}
                onChange={(v) => setWordWrap(v as 'on' | 'off')}
                options={[
                  { label: <ColumnWidthOutlined />, value: 'on' },
                  { label: <ExpandAltOutlined />, value: 'off' },
                ]}
              />
            )}
          </Space>
          <Space>
            {isValidJson && viewMode === 'editor' && (
              <>
                <Tooltip title="Format JSON">
                  <Button size="small" icon={<FormatPainterOutlined />} onClick={handleFormat}>
                    Format
                  </Button>
                </Tooltip>
                <Tooltip title="Minify JSON">
                  <Button size="small" icon={<CompressOutlined />} onClick={handleMinify}>
                    Minify
                  </Button>
                </Tooltip>
              </>
            )}
            <Tooltip title="Copy to clipboard">
              <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>
                Copy
              </Button>
            </Tooltip>
            <Button onClick={onClose}>Close</Button>
          </Space>
        </div>
      }
    >
      <div style={{ height: '80vh', borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
        {viewMode === 'editor' ? (
          <JsonEditorView
            content={content}
            isValidJson={isValidJson}
            wordWrap={wordWrap}
            theme={theme}
            onChange={setContent}
          />
        ) : (
          <JsonTreeView
            content={content}
            isValidJson={isValidJson}
          />
        )}
      </div>
    </Modal>
  );
}
