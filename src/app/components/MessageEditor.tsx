'use client';

import { useEffect, useState, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { Input, Radio, Button, Tooltip } from 'antd';
import { FormatPainterOutlined, CopyOutlined } from '@ant-design/icons';
import Editor, { loader } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

export type PayloadType = 'json' | 'string';

// Configure Monaco to load from CDN
loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs',
  },
});

interface MessageEditorProps {
  eventName: string;
  payload: string;
  payloadType: PayloadType;
  jsonError: string | null;
  onEventNameChange: (value: string) => void;
  onPayloadChange: (value: string) => void;
  onPayloadTypeChange: (value: PayloadType) => void;
  onFormatJson: () => void;
  onMinifyJson: () => void;
  onCopyPayload: () => void;
  onSendShortcut: () => void;
  open: boolean;
}

export default function MessageEditor({
  eventName,
  payload,
  payloadType,
  jsonError,
  onEventNameChange,
  onPayloadChange,
  onPayloadTypeChange,
  onFormatJson,
  onMinifyJson,
  onCopyPayload,
  onSendShortcut,
  open,
}: MessageEditorProps) {
  const [theme, setTheme] = useState<'vs-dark' | 'light'>('vs-dark');

  useEffect(() => {
    if (!open) return;
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'vs-dark' : 'light');
  }, [open]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        onSendShortcut();
      }
    },
    [onSendShortcut]
  );

  const handleEditorMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor) => {
      editorInstance.addCommand(
        // Monaco.KeyMod.CtrlCmd | Monaco.KeyCode.Enter
        2048 | 3,
        () => {
          onSendShortcut();
        }
      );
    },
    [onSendShortcut]
  );

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Event Name</label>
        <Input
          placeholder="Event name (e.g., message, chat)"
          value={eventName}
          onChange={(e) => onEventNameChange(e.target.value)}
          onKeyDown={handleKeyDown}
          size="large"
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <label style={{ fontWeight: 500 }}>Payload</label>
          <Radio.Group
            value={payloadType}
            onChange={(e) => onPayloadTypeChange(e.target.value)}
            size="small"
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button value="json">JSON</Radio.Button>
            <Radio.Button value="string">String</Radio.Button>
          </Radio.Group>
        </div>

        <div
          style={{
            height: 280,
            border:
              payloadType === 'json' && jsonError
                ? '1px solid #ef4444'
                : '1px solid var(--border-color, #d9d9d9)',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <Editor
            height="100%"
            language={payloadType === 'json' ? 'json' : 'plaintext'}
            value={payload}
            onChange={(value) => onPayloadChange(value || '')}
            onMount={handleEditorMount}
            theme={theme}
            options={{
              readOnly: false,
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
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
              quickSuggestions: true,
              suggestOnTriggerCharacters: true,
              acceptSuggestionOnEnter: 'on',
              tabCompletion: 'on',
              wordBasedSuggestions: 'matchingDocuments',
              suggest: {
                showKeywords: true,
                showSnippets: true,
                showWords: true,
              },
            }}
          />
        </div>

        {payloadType === 'json' && jsonError && (
          <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{jsonError}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {payloadType === 'json' && (
            <>
              <Tooltip title="Format JSON (prettify)">
                <Button size="small" icon={<FormatPainterOutlined />} onClick={onFormatJson}>
                  Format
                </Button>
              </Tooltip>
              <Tooltip title="Minify JSON">
                <Button size="small" onClick={onMinifyJson}>
                  Minify
                </Button>
              </Tooltip>
            </>
          )}
          <Tooltip title="Copy payload">
            <Button size="small" icon={<CopyOutlined />} onClick={onCopyPayload}>
              Copy
            </Button>
          </Tooltip>
        </div>
      </div>
    </>
  );
}
