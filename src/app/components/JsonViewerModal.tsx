'use client';

import { useState, useCallback, useEffect } from 'react';
import { Modal, Button, Tooltip, App, Space, Segmented } from 'antd';
import {
  CopyOutlined,
  FormatPainterOutlined,
  CompressOutlined,
  ExpandAltOutlined,
  ColumnWidthOutlined,
} from '@ant-design/icons';
import Editor, { loader } from '@monaco-editor/react';

// Configure Monaco to load from CDN
loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs',
  },
});

interface JsonViewerModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  eventName?: string;
  payload: string;
  direction?: 'in' | 'out';
  timestamp?: Date;
}

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
  const [isValidJson, setIsValidJson] = useState(false);
  const [wordWrap, setWordWrap] = useState<'on' | 'off'>('on');
  const [theme, setTheme] = useState<'vs-dark' | 'light'>('vs-dark');

  // Reset content when payload changes
  useEffect(() => {
    setContent(payload);
    try {
      JSON.parse(payload);
      setIsValidJson(true);
    } catch {
      setIsValidJson(false);
    }
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

  const handleExpandAll = useCallback(() => {
    // Format with full indentation to show all expanded
    try {
      const parsed = JSON.parse(content);
      const expanded = JSON.stringify(parsed, null, 2);
      setContent(expanded);
    } catch {
      // Do nothing if invalid
    }
  }, [content]);

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
  );

  return (
    <Modal
      title={modalTitle}
      open={open}
      onCancel={onClose}
      width={800}
      centered
      styles={{
        body: { padding: 0 },
      }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Segmented
              size="small"
              value={wordWrap}
              onChange={(v) => setWordWrap(v as 'on' | 'off')}
              options={[
                { label: <ColumnWidthOutlined />, value: 'on' },
                { label: <ExpandAltOutlined />, value: 'off' },
              ]}
            />
          </Space>
          <Space>
            {isValidJson && (
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
      <div style={{ height: 500, borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
        <Editor
          height="100%"
          language={isValidJson ? 'json' : 'plaintext'}
          value={content}
          onChange={(value) => setContent(value || '')}
          theme={theme}
          options={{
            readOnly: false,
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: wordWrap,
            automaticLayout: true,
            folding: true,
            foldingStrategy: 'indentation',
            formatOnPaste: true,
            tabSize: 2,
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: 'line',
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
          }}
        />
      </div>
    </Modal>
  );
}
