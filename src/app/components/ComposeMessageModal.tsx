'use client';

import { useState, useCallback, useEffect } from 'react';
import { Modal, Button, Space, Tooltip, App } from 'antd';
import { SendOutlined, PushpinOutlined } from '@ant-design/icons';
import { useSocketStore, useCurrentConnection } from '@/app/stores/socketStore';
import useSocket from '@/app/hooks/useSocket';
import {
  addEmitLog,
  addPinnedMessage,
  listEmitLogs,
  listPinnedMessages,
  findDuplicatePinnedMessage,
} from '@/app/hooks/useTauri';
import MessageEditor, { PayloadType } from './MessageEditor';
import PinNameModal from './PinNameModal';

interface ComposeMessageModalProps {
  open: boolean;
  onClose: () => void;
  initialEventName?: string;
  initialPayload?: string;
}

export default function ComposeMessageModal({
  open,
  onClose,
  initialEventName = '',
  initialPayload = '{}',
}: ComposeMessageModalProps) {
  const { message } = App.useApp();
  const [eventName, setEventName] = useState(initialEventName);
  const [payload, setPayload] = useState(initialPayload);
  const [payloadType, setPayloadType] = useState<PayloadType>('json');
  const [sending, setSending] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Pin name modal state
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ eventName: string; payload: string } | null>(null);

  const connectionStatus = useSocketStore((state) => state.connectionStatus);
  const setEmitLogs = useSocketStore((state) => state.setEmitLogs);
  const setPinnedMessages = useSocketStore((state) => state.setPinnedMessages);
  const currentConnection = useCurrentConnection();
  const { emit } = useSocket();

  const isConnected = connectionStatus === 'connected';

  // Reset form when modal opens with initial values
  useEffect(() => {
    if (!open) return;
    setEventName(initialEventName);
    setPayload(initialPayload);
    setJsonError(null);

    try {
      JSON.parse(initialPayload);
      setPayloadType('json');
    } catch {
      setPayloadType('string');
    }
  }, [open, initialEventName, initialPayload]);

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
        parsedPayload = payload;
      }

      setSending(true);

      const success = emit(eventName, parsedPayload);
      if (success) {
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
      const duplicateId = await findDuplicatePinnedMessage(
        currentConnection.id,
        eventName,
        pinPayload
      );

      if (duplicateId) {
        message.warning('This message is already pinned');
        return;
      }

      setPendingPin({ eventName, payload: pinPayload });
      setPinModalOpen(true);
    } catch {
      message.error('Failed to check duplicate');
    }
  }, [eventName, payload, payloadType, currentConnection, message]);

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
      title="Compose Message"
      open={open}
      onCancel={onClose}
      width={700}
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
              Cmd
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
      <MessageEditor
        open={open}
        eventName={eventName}
        payload={payload}
        payloadType={payloadType}
        jsonError={jsonError}
        onEventNameChange={setEventName}
        onPayloadChange={setPayload}
        onPayloadTypeChange={setPayloadType}
        onFormatJson={handleFormatJson}
        onMinifyJson={handleMinifyJson}
        onCopyPayload={handleCopyPayload}
        onSendShortcut={handleSend}
      />

      <PinNameModal
        open={pinModalOpen}
        onOk={handlePinConfirm}
        onCancel={handlePinCancel}
        defaultName={pendingPin?.eventName || ''}
      />
    </Modal>
  );
}
