'use client';

import { useState, useCallback, useEffect } from 'react';
import { Modal, Input, Button, App, Tooltip, Radio, Space, Tabs, Empty } from 'antd';
import {
  SendOutlined,
  PushpinOutlined,
  FormatPainterOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import Editor, { loader } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
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
} from '@/app/hooks/useTauri';
import PinNameModal from './PinNameModal';

// Configure Monaco to load from CDN
loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs',
  },
});

type PayloadType = 'json' | 'string';

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function truncatePayload(payload: string, maxLen = 40): string {
  if (payload.length <= maxLen) return payload;
  return payload.substring(0, maxLen) + '...';
}

interface SendMessageModalProps {
  open: boolean;
  onClose: () => void;
  initialEventName?: string;
  initialPayload?: string;
}

export default function SendMessageModal({
  open,
  onClose,
  initialEventName = '',
  initialPayload = '{}',
}: SendMessageModalProps) {
  const { message } = App.useApp();
  const [eventName, setEventName] = useState(initialEventName);
  const [payload, setPayload] = useState(initialPayload);
  const [payloadType, setPayloadType] = useState<PayloadType>('json');
  const [sending, setSending] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'vs-dark' | 'light'>('vs-dark');

  // Pin name modal state
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ eventName: string; payload: string } | null>(null);

  const connectionStatus = useSocketStore((state) => state.connectionStatus);
  const currentConnection = useCurrentConnection();
  const emitLogs = useSocketStore((state) => state.emitLogs);
  const setEmitLogs = useSocketStore((state) => state.setEmitLogs);
  const pinnedMessages = useSocketStore((state) => state.pinnedMessages);
  const setPinnedMessages = useSocketStore((state) => state.setPinnedMessages);

  const { emit } = useSocket();

  const isConnected = connectionStatus === 'connected';

  // Reset form when modal opens with initial values
  useEffect(() => {
    if (open) {
      setEventName(initialEventName);
      setPayload(initialPayload);
      setJsonError(null);

      // Auto-detect payload type
      try {
        JSON.parse(initialPayload);
        setPayloadType('json');
      } catch {
        setPayloadType('string');
      }
    }
  }, [open, initialEventName, initialPayload]);

  // Detect system theme
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'vs-dark' : 'light');
  }, [open]);

  // Validate JSON when payload changes
  useEffect(() => {
    if (payloadType === 'json') {
      try {
        JSON.parse(payload);
        setJsonError(null);
      } catch (e) {
        setJsonError(e instanceof Error ? e.message : 'Invalid JSON');
      }
    } else {
      setJsonError(null);
    }
  }, [payload, payloadType]);

  const handleFormatJson = useCallback(() => {
    if (payloadType !== 'json') {
      message.warning('Can only format JSON payloads');
      return;
    }

    try {
      const parsed = JSON.parse(payload);
      const formatted = JSON.stringify(parsed, null, 2);
      setPayload(formatted);
      setJsonError(null);
      message.success('JSON formatted');
    } catch {
      message.error('Invalid JSON - cannot format');
    }
  }, [payload, payloadType, message]);

  const handleMinifyJson = useCallback(() => {
    if (payloadType !== 'json') {
      message.warning('Can only minify JSON payloads');
      return;
    }

    try {
      const parsed = JSON.parse(payload);
      const minified = JSON.stringify(parsed);
      setPayload(minified);
      setJsonError(null);
      message.success('JSON minified');
    } catch {
      message.error('Invalid JSON - cannot minify');
    }
  }, [payload, payloadType, message]);

  const handleCopyPayload = useCallback(() => {
    navigator.clipboard.writeText(payload);
    message.success('Copied to clipboard');
  }, [payload, message]);

  const handleSend = useCallback(async () => {
    if (!eventName.trim()) {
      message.warning('Please enter an event name');
      return;
    }

    if (!isConnected) {
      message.warning('Not connected to server');
      return;
    }

    try {
      let parsedPayload: unknown;

      if (payloadType === 'json') {
        try {
          parsedPayload = JSON.parse(payload);
        } catch {
          message.error('Invalid JSON payload');
          return;
        }
      } else {
        // Send as raw string
        parsedPayload = payload;
      }

      setSending(true);

      // Emit the event
      const success = emit(eventName, parsedPayload);

      if (success) {
        // Log to emit history
        if (currentConnection) {
          try {
            const logPayload = payloadType === 'json' ? payload : JSON.stringify(payload);
            await addEmitLog(currentConnection.id, eventName, logPayload);
            const logs = await listEmitLogs(currentConnection.id);
            setEmitLogs(logs);
          } catch {
            // Ignore Tauri errors
          }
        }

        message.success('Message sent');
        onClose();
      } else {
        message.error('Failed to send message');
      }
    } finally {
      setSending(false);
    }
  }, [
    eventName,
    payload,
    payloadType,
    isConnected,
    emit,
    currentConnection,
    message,
    setEmitLogs,
    onClose,
  ]);

  const handlePin = useCallback(async () => {
    if (!eventName.trim()) {
      message.warning('Please enter an event name');
      return;
    }

    if (!currentConnection) {
      message.warning('No connection selected');
      return;
    }

    try {
      const pinPayload = payloadType === 'json' ? payload : JSON.stringify(payload);

      // Check for duplicates
      const duplicateId = await findDuplicatePinnedMessage(
        currentConnection.id,
        eventName,
        pinPayload
      );

      if (duplicateId) {
        message.warning('This message is already pinned');
        return;
      }

      // Open modal for custom name
      setPendingPin({ eventName, payload: pinPayload });
      setPinModalOpen(true);
    } catch {
      message.error('Failed to check duplicate');
    }
  }, [eventName, payload, payloadType, currentConnection, message]);

  // Load item into editor
  const loadIntoEditor = useCallback((name: string, payloadStr: string) => {
    setEventName(name);
    setPayload(payloadStr);
    try {
      JSON.parse(payloadStr);
      setPayloadType('json');
    } catch {
      setPayloadType('string');
    }
  }, []);

  // Delete pinned message
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

  // Pin from emit log
  const handlePinFromLog = useCallback(
    async (name: string, payloadStr: string) => {
      if (!currentConnection) return;
      try {
        // Check for duplicates
        const duplicateId = await findDuplicatePinnedMessage(
          currentConnection.id,
          name,
          payloadStr
        );

        if (duplicateId) {
          message.warning('This message is already pinned');
          return;
        }

        // Open modal for custom name
        setPendingPin({ eventName: name, payload: payloadStr });
        setPinModalOpen(true);
      } catch {
        message.error('Failed to check duplicate');
      }
    },
    [currentConnection, message]
  );

  // Confirm pin with custom name
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

  function handlePinCancel() {
    setPinModalOpen(false);
    setPendingPin(null);
  }

  // Clear emit logs
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

  // Send directly from pinned/history
  const handleSendDirect = useCallback(
    async (name: string, payloadStr: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(payloadStr);
      } catch {
        parsed = payloadStr;
      }
      const success = emit(name, parsed);
      if (success) {
        if (currentConnection) {
          try {
            await addEmitLog(currentConnection.id, name, payloadStr);
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

  // Handle Cmd/Ctrl+Enter to send (for event name input)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle Monaco Editor mount to register keyboard shortcuts
  const handleEditorMount = (editor: editor.IStandaloneCodeEditor) => {
    // Register Cmd/Ctrl+Enter to send
    editor.addCommand(
      // Monaco.KeyMod.CtrlCmd | Monaco.KeyCode.Enter
      2048 | 3, // CtrlCmd + Enter
      () => {
        handleSend();
      }
    );
  };

  return (
    <Modal
      title="Send Message"
      open={open}
      onCancel={onClose}
      width={600}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', display: 'flex', alignItems: 'center' }}>
            Press{' '}
            <kbd
              style={{
                padding: '2px 6px',
                background: '#f3f4f6',
                borderRadius: 4,
                margin: '0 4px',
                fontSize: 10,
              }}
            >
              ⌘
            </kbd>
            +
            <kbd
              style={{
                padding: '2px 6px',
                background: '#f3f4f6',
                borderRadius: 4,
                margin: '0 4px',
                fontSize: 10,
              }}
            >
              Enter
            </kbd>
            to send
          </div>
          <Space>
            <Button onClick={onClose}>Cancel</Button>
            <Tooltip title="Pin this message">
              <Button icon={<PushpinOutlined />} onClick={handlePin} disabled={!currentConnection}>
                Pin
              </Button>
            </Tooltip>
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={sending}
              disabled={!isConnected || (payloadType === 'json' && !!jsonError)}
            >
              Send
            </Button>
          </Space>
        </div>
      }
    >
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Event Name</label>
        <Input
          placeholder="Event name (e.g., message, chat)"
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
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
            onChange={(e) => setPayloadType(e.target.value)}
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
            height: 240,
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
            onChange={(value) => setPayload(value || '')}
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
              // Enable autocomplete
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

        {payloadType === 'json' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Tooltip title="Format JSON (prettify)">
              <Button size="small" icon={<FormatPainterOutlined />} onClick={handleFormatJson}>
                Format
              </Button>
            </Tooltip>
            <Tooltip title="Minify JSON">
              <Button size="small" onClick={handleMinifyJson}>
                Minify
              </Button>
            </Tooltip>
            <Tooltip title="Copy payload">
              <Button size="small" icon={<CopyOutlined />} onClick={handleCopyPayload}>
                Copy
              </Button>
            </Tooltip>
          </div>
        )}

        {payloadType === 'string' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Tooltip title="Copy payload">
              <Button size="small" icon={<CopyOutlined />} onClick={handleCopyPayload}>
                Copy
              </Button>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Pinned & History Tabs */}
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
              <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                {pinnedMessages.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No pinned messages" />
                ) : (
                  pinnedMessages.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 8px',
                        borderRadius: 4,
                        background: 'var(--bg-secondary)',
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ flex: 1, fontWeight: 500, fontSize: 12 }}>{p.eventName}</span>
                      <span
                        style={{
                          flex: 2,
                          fontSize: 11,
                          color: '#888',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={p.payload}
                      >
                        {truncatePayload(p.payload)}
                      </span>
                      <Space size={2}>
                        <Tooltip
                          title={connectionStatus === 'connected' ? 'Send' : 'Not connected'}
                        >
                          <Button
                            size="small"
                            type="primary"
                            icon={<SendOutlined />}
                            onClick={() => handleSendDirect(p.eventName, p.payload)}
                            disabled={connectionStatus !== 'connected'}
                          />
                        </Tooltip>
                        <Tooltip title="Load">
                          <Button
                            size="small"
                            type="text"
                            icon={<EditOutlined />}
                            onClick={() => loadIntoEditor(p.eventName, p.payload)}
                          />
                        </Tooltip>
                        <Tooltip title="Delete">
                          <Button
                            size="small"
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => handleDeletePinned(p.id)}
                          />
                        </Tooltip>
                      </Space>
                    </div>
                  ))
                )}
              </div>
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
              <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                {emitLogs.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No emit history" />
                ) : (
                  <>
                    <div style={{ textAlign: 'right', marginBottom: 4 }}>
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={handleClearLogs}
                      >
                        Clear
                      </Button>
                    </div>
                    {emitLogs.map((log) => (
                      <div
                        key={log.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 8px',
                          borderRadius: 4,
                          background: 'var(--bg-secondary)',
                          marginBottom: 4,
                        }}
                      >
                        <span style={{ fontWeight: 500, fontSize: 12, minWidth: 80 }}>
                          {log.eventName}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            fontSize: 11,
                            color: '#888',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={log.payload}
                        >
                          {truncatePayload(log.payload)}
                        </span>
                        <span style={{ fontSize: 10, color: '#aaa' }}>
                          {formatTime(log.sentAt)}
                        </span>
                        <Space size={2}>
                          <Tooltip
                            title={connectionStatus === 'connected' ? 'Send' : 'Not connected'}
                          >
                            <Button
                              size="small"
                              type="primary"
                              icon={<SendOutlined />}
                              onClick={() => handleSendDirect(log.eventName, log.payload)}
                              disabled={connectionStatus !== 'connected'}
                            />
                          </Tooltip>
                          <Tooltip title="Load">
                            <Button
                              size="small"
                              type="text"
                              icon={<EditOutlined />}
                              onClick={() => loadIntoEditor(log.eventName, log.payload)}
                            />
                          </Tooltip>
                          <Tooltip title="Pin">
                            <Button
                              size="small"
                              type="text"
                              icon={<PushpinOutlined />}
                              onClick={() => handlePinFromLog(log.eventName, log.payload)}
                            />
                          </Tooltip>
                        </Space>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ),
          },
        ]}
      />

      {!isConnected && (
        <div
          style={{
            background: '#fef3c7',
            border: '1px solid #fcd34d',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 13,
            color: '#92400e',
          }}
        >
          Not connected to server. Please connect first.
        </div>
      )}

      {/* Pin Name Modal */}
      <PinNameModal
        open={pinModalOpen}
        onOk={handlePinConfirm}
        onCancel={handlePinCancel}
        defaultName={pendingPin?.eventName || ''}
      />
    </Modal>
  );
}
