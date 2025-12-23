'use client';

import { invoke } from '@tauri-apps/api/core';
import { Connection, ConnectionEvent, EmitLog, PinnedMessage } from '@/app/stores/socketStore';

// Convert snake_case to camelCase
function toCamelCase<T>(obj: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = obj[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[camelKey] = toCamelCase(value as Record<string, unknown>);
    } else {
      result[camelKey] = value;
    }
  }
  return result as T;
}

// Connection commands
export async function listConnections(): Promise<Connection[]> {
  const result = await invoke<Array<Record<string, unknown>>>('list_connections');
  return result.map((c) => toCamelCase<Connection>(c));
}

export async function createConnection(input: {
  name: string;
  url: string;
  namespace?: string;
  authToken?: string;
  options?: string;
}): Promise<number> {
  return await invoke('create_connection', {
    input: {
      name: input.name,
      url: input.url,
      namespace: input.namespace,
      auth_token: input.authToken,
      options: input.options,
    },
  });
}

export async function updateConnection(input: {
  id: number;
  name: string;
  url: string;
  namespace?: string;
  authToken?: string;
  options?: string;
}): Promise<void> {
  await invoke('update_connection', {
    input: {
      id: input.id,
      name: input.name,
      url: input.url,
      namespace: input.namespace,
      auth_token: input.authToken,
      options: input.options,
    },
  });
}

export async function deleteConnection(id: number): Promise<void> {
  await invoke('delete_connection', { id });
}

export async function getConnection(id: number): Promise<Connection | null> {
  const result = await invoke<Record<string, unknown> | null>('get_connection', { id });
  return result ? toCamelCase<Connection>(result) : null;
}

// Connection events commands
export async function listConnectionEvents(connectionId: number): Promise<ConnectionEvent[]> {
  const result = await invoke<Array<Record<string, unknown>>>('list_connection_events', {
    connectionId,
  });
  return result.map((e) => toCamelCase<ConnectionEvent>(e));
}

export async function addConnectionEvent(connectionId: number, eventName: string): Promise<number> {
  return await invoke('add_connection_event', { connectionId, eventName });
}

export async function removeConnectionEvent(id: number): Promise<void> {
  await invoke('remove_connection_event', { id });
}

export async function toggleConnectionEvent(id: number, isListening: boolean): Promise<void> {
  await invoke('toggle_connection_event', { id, isListening });
}

// Current connection state
export async function setCurrentConnection(connectionId: number): Promise<void> {
  await invoke('set_current_connection', { connectionId });
}

export async function getCurrentConnection(): Promise<number | null> {
  return await invoke('get_current_connection');
}

// Emit log commands
export async function listEmitLogs(connectionId: number, limit?: number): Promise<EmitLog[]> {
  const result = await invoke<Array<Record<string, unknown>>>('list_emit_logs', {
    connectionId,
    limit,
  });
  return result.map((e) => toCamelCase<EmitLog>(e));
}

export async function addEmitLog(
  connectionId: number,
  eventName: string,
  payload: string
): Promise<number> {
  return await invoke('add_emit_log', { connectionId, eventName, payload });
}

export async function clearEmitLogs(connectionId: number): Promise<void> {
  await invoke('clear_emit_logs', { connectionId });
}

// Pinned messages commands
export async function listPinnedMessages(connectionId: number): Promise<PinnedMessage[]> {
  const result = await invoke<Array<Record<string, unknown>>>('list_pinned_messages', {
    connectionId,
  });
  return result.map((p) => toCamelCase<PinnedMessage>(p));
}

export async function addPinnedMessage(input: {
  connectionId: number;
  eventName: string;
  payload: string;
  label?: string;
}): Promise<number> {
  return await invoke('add_pinned_message', {
    input: {
      connection_id: input.connectionId,
      event_name: input.eventName,
      payload: input.payload,
      label: input.label,
    },
  });
}

export async function updatePinnedMessage(input: {
  id: number;
  eventName: string;
  payload: string;
  label?: string;
}): Promise<void> {
  await invoke('update_pinned_message', {
    input: {
      id: input.id,
      event_name: input.eventName,
      payload: input.payload,
      label: input.label,
    },
  });
}

export async function deletePinnedMessage(id: number): Promise<void> {
  await invoke('delete_pinned_message', { id });
}

export async function reorderPinnedMessages(ids: number[]): Promise<void> {
  await invoke('reorder_pinned_messages', { ids });
}
