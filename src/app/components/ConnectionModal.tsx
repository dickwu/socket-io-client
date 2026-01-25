'use client';

import { useEffect, useState } from 'react';
import { Modal, Form, Input, Button, Divider, Switch, Space, Tag, App } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useSocketStore, ConnectionEvent } from '@/app/stores/socketStore';
import {
  createConnection,
  updateConnection,
  listConnections,
  listConnectionEvents,
  addConnectionEvent,
  removeConnectionEvent,
  toggleConnectionEvent,
} from '@/app/hooks/useTauri';

const { TextArea } = Input;

interface FormValues {
  name: string;
  url: string;
  namespace: string;
  authToken: string;
  options: string;
}

export default function ConnectionModal() {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<ConnectionEvent[]>([]);
  const [newEventName, setNewEventName] = useState('');
  const [autoSendOnConnect, setAutoSendOnConnect] = useState(false);
  const [autoSendOnReconnect, setAutoSendOnReconnect] = useState(false);

  const isOpen = useSocketStore((state) => state.isSettingsModalOpen);
  const editingConnection = useSocketStore((state) => state.editingConnection);
  const closeSettingsModal = useSocketStore((state) => state.closeSettingsModal);
  const setConnections = useSocketStore((state) => state.setConnections);
  const setConnectionEvents = useSocketStore((state) => state.setConnectionEvents);
  const setAutoSendSettings = useSocketStore((state) => state.setAutoSendSettings);
  const getAutoSendSettings = useSocketStore((state) => state.getAutoSendSettings);

  const isEditing = !!editingConnection;

  // Load form data when editing
  useEffect(() => {
    if (!isOpen) {
      // Modal is closed - Form is destroyed, don't call form methods
      setEvents([]);
      return;
    }

    if (editingConnection) {
      form.setFieldsValue({
        name: editingConnection.name,
        url: editingConnection.url,
        namespace: editingConnection.namespace || '/',
        authToken: editingConnection.authToken || '',
        options: editingConnection.options || '{}',
      });

      // Load events
      loadEvents(editingConnection.id);

      const settings = getAutoSendSettings(editingConnection.id);
      setAutoSendOnConnect(settings.onConnect);
      setAutoSendOnReconnect(settings.onReconnect);
    } else {
      form.resetFields();
      setEvents([]);
      setAutoSendOnConnect(false);
      setAutoSendOnReconnect(false);
    }
  }, [isOpen, editingConnection, form, getAutoSendSettings]);

  async function loadEvents(connectionId: number) {
    try {
      const evts = await listConnectionEvents(connectionId);
      setEvents(evts);
    } catch {
      // Ignore errors
    }
  }

  async function handleSubmit(values: FormValues) {
    setLoading(true);

    try {
      // Validate JSON options
      try {
        JSON.parse(values.options || '{}');
      } catch {
        message.error('Invalid JSON in options');
        setLoading(false);
        return;
      }

      if (isEditing && editingConnection) {
        await updateConnection({
          id: editingConnection.id,
          name: values.name,
          url: values.url,
          namespace: values.namespace || '/',
          authToken: values.authToken || undefined,
          options: values.options || '{}',
        });
        message.success('Connection updated');
      } else {
        await createConnection({
          name: values.name,
          url: values.url,
          namespace: values.namespace || '/',
          authToken: values.authToken || undefined,
          options: values.options || '{}',
        });
        message.success('Connection created');
      }

      // Refresh connections list
      const conns = await listConnections();
      setConnections(conns);

      closeSettingsModal();
    } catch {
      message.error('Failed to save connection');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddEvent() {
    if (!newEventName.trim()) {
      message.warning('Please enter an event name');
      return;
    }

    if (!editingConnection) {
      message.warning('Please save the connection first');
      return;
    }

    try {
      await addConnectionEvent(editingConnection.id, newEventName.trim());
      await loadEvents(editingConnection.id);
      setNewEventName('');

      // Update global state
      const evts = await listConnectionEvents(editingConnection.id);
      setConnectionEvents(evts);
    } catch {
      message.error('Failed to add event');
    }
  }

  async function handleRemoveEvent(id: number) {
    if (!editingConnection) return;

    try {
      await removeConnectionEvent(id);
      await loadEvents(editingConnection.id);

      // Update global state
      const evts = await listConnectionEvents(editingConnection.id);
      setConnectionEvents(evts);
    } catch {
      message.error('Failed to remove event');
    }
  }

  async function handleToggleEvent(id: number, isListening: boolean) {
    if (!editingConnection) return;

    try {
      await toggleConnectionEvent(id, isListening);
      await loadEvents(editingConnection.id);

      // Update global state
      const evts = await listConnectionEvents(editingConnection.id);
      setConnectionEvents(evts);
    } catch {
      message.error('Failed to toggle event');
    }
  }

  return (
    <Modal
      title={isEditing ? 'Edit Connection' : 'New Connection'}
      open={isOpen}
      onCancel={closeSettingsModal}
      footer={null}
      width={600}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          namespace: '/',
          options: '{}',
        }}
      >
        <div className="modal-section">
          <div className="modal-section-title">Connection Settings</div>

          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Please enter a name' }]}
          >
            <Input placeholder="My Server" />
          </Form.Item>

          <Form.Item
            name="url"
            label="Server URL"
            rules={[{ required: true, message: 'Please enter the server URL' }]}
          >
            <Input placeholder="http://localhost:3000" />
          </Form.Item>

          <Form.Item name="namespace" label="Namespace">
            <Input placeholder="/" />
          </Form.Item>

          <Form.Item name="authToken" label="Auth Token">
            <Input.Password placeholder="Optional authentication token" />
          </Form.Item>

          <Form.Item
            name="options"
            label="Advanced Options (JSON)"
            extra="Socket.IO connection options in JSON format"
          >
            <TextArea className="json-editor" rows={3} placeholder='{"reconnectionAttempts": 5}' />
          </Form.Item>
        </div>

        {isEditing && (
          <>
            <Divider />

            <div className="modal-section">
              <div className="modal-section-title">Event Listeners</div>
              <p style={{ color: '#9ca3af', fontSize: 12, marginBottom: 12 }}>
                Configure which events to listen for on this connection.
              </p>

              <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
                <Input
                  placeholder="Event name (e.g., message)"
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  onPressEnter={handleAddEvent}
                />
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddEvent}>
                  Add
                </Button>
              </Space.Compact>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {events.map((event) => (
                  <Tag
                    key={event.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 8px',
                    }}
                  >
                    <Switch
                      size="small"
                      checked={event.isListening}
                      onChange={(checked) => handleToggleEvent(event.id, checked)}
                    />
                    <span style={{ opacity: event.isListening ? 1 : 0.5 }}>{event.eventName}</span>
                    <DeleteOutlined
                      style={{ cursor: 'pointer', color: '#ff4d4f' }}
                      onClick={() => handleRemoveEvent(event.id)}
                    />
                  </Tag>
                ))}
                {events.length === 0 && (
                  <span style={{ color: '#9ca3af', fontSize: 12 }}>
                    No event listeners configured
                  </span>
                )}
              </div>
            </div>

            <Divider />

            <div className="modal-section">
              <div className="modal-section-title">Auto Send</div>
              <p style={{ color: '#9ca3af', fontSize: 12, marginBottom: 12 }}>
                Automatically send pinned messages marked for auto-send when this connection goes
                online.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Switch
                    size="small"
                    checked={autoSendOnConnect}
                    onChange={(checked) => {
                      setAutoSendOnConnect(checked);
                      if (editingConnection) {
                        setAutoSendSettings(editingConnection.id, {
                          onConnect: checked,
                          onReconnect: autoSendOnReconnect,
                        });
                      }
                    }}
                  />
                  <span style={{ fontSize: 13 }}>Auto-send on connect</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Switch
                    size="small"
                    checked={autoSendOnReconnect}
                    onChange={(checked) => {
                      setAutoSendOnReconnect(checked);
                      if (editingConnection) {
                        setAutoSendSettings(editingConnection.id, {
                          onConnect: autoSendOnConnect,
                          onReconnect: checked,
                        });
                      }
                    }}
                  />
                  <span style={{ fontSize: 13 }}>Auto-send on reconnect</span>
                </div>
              </div>
            </div>
          </>
        )}

        <Divider />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={closeSettingsModal}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={loading}>
            {isEditing ? 'Save Changes' : 'Create Connection'}
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
