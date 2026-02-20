use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use chrono::Utc;
use rust_socketio::client::Client;
use rust_socketio::{ClientBuilder, Event, Payload, TransportType};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter};

use crate::db;

const SOCKET_STATUS_EVENT: &str = "socket:status";
const SOCKET_EVENT_EVENT: &str = "socket:event";
const SOCKET_ERROR_EVENT: &str = "socket:error";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SocketStatusPayload {
    connection_id: i64,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SocketErrorPayload {
    connection_id: i64,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SocketEventPayload {
    connection_id: i64,
    event_name: String,
    payload: String,
    timestamp: String,
    direction: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BufferedEvent {
    pub event_name: String,
    pub payload: String,
    pub timestamp: String,
    pub direction: String,
}

pub struct EventBuffer {
    events: VecDeque<BufferedEvent>,
    max_size: usize,
}

impl EventBuffer {
    pub fn new(max_size: usize) -> Self {
        Self {
            events: VecDeque::with_capacity(max_size),
            max_size,
        }
    }

    pub fn push(&mut self, event: BufferedEvent) {
        self.events.push_back(event);
        while self.events.len() > self.max_size {
            self.events.pop_front();
        }
    }

    pub fn list_recent(&self, limit: usize) -> Vec<BufferedEvent> {
        let limit = limit.min(self.events.len());
        self.events.iter().rev().take(limit).cloned().collect()
    }
}

struct ConnectionState {
    client: Option<Client>,
    listening_events: HashSet<String>,
    status: String,
    event_buffer: EventBuffer,
}

impl ConnectionState {
    fn new(listening_events: HashSet<String>) -> Self {
        Self {
            client: None,
            listening_events,
            status: "disconnected".to_string(),
            event_buffer: EventBuffer::new(100),
        }
    }
}

#[derive(Clone)]
pub struct SocketManager {
    connections: Arc<Mutex<HashMap<i64, ConnectionState>>>,
    active_connection_id: Arc<Mutex<Option<i64>>>,
    connecting: Arc<Mutex<HashSet<i64>>>,
    /// Tracks connections that have connected at least once (for reconnect detection)
    connected_once: Arc<Mutex<HashSet<i64>>>,
    app_handle: AppHandle,
}

impl SocketManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
            active_connection_id: Arc::new(Mutex::new(None)),
            connecting: Arc::new(Mutex::new(HashSet::new())),
            connected_once: Arc::new(Mutex::new(HashSet::new())),
            app_handle,
        }
    }

    /// Check if this connection has connected before (for reconnect detection)
    fn has_connected_before(&self, connection_id: i64) -> bool {
        if let Ok(guard) = self.connected_once.lock() {
            return guard.contains(&connection_id);
        }
        false
    }

    /// Mark connection as having connected at least once
    fn mark_connected(&self, connection_id: i64) {
        if let Ok(mut guard) = self.connected_once.lock() {
            guard.insert(connection_id);
        }
    }

    fn has_connection(&self, connection_id: i64) -> bool {
        if let Ok(guard) = self.connections.lock() {
            return guard.contains_key(&connection_id);
        }
        false
    }

    fn set_active_connection_internal(&self, connection_id: Option<i64>) {
        if let Ok(mut guard) = self.active_connection_id.lock() {
            *guard = connection_id;
        }
    }

    pub fn set_active_connection(&self, connection_id: i64) {
        self.set_active_connection_internal(Some(connection_id));
    }

    pub fn clear_active_connection(&self) {
        self.set_active_connection_internal(None);
    }

    fn set_client(&self, connection_id: i64, client: Option<Client>) {
        let old_client = if let Ok(mut guard) = self.connections.lock() {
            let state = guard
                .entry(connection_id)
                .or_insert_with(|| ConnectionState::new(HashSet::new()));
            let old_client = state.client.take();
            state.client = client;
            old_client
        } else {
            None
        };

        // Disconnect outside the connections mutex to avoid callback re-entrancy deadlocks.
        if let Some(old_client) = old_client {
            let _ = old_client.disconnect();
        }
    }

    fn set_listening_events(&self, connection_id: i64, events: impl IntoIterator<Item = String>) {
        if let Ok(mut guard) = self.connections.lock() {
            let state = guard
                .entry(connection_id)
                .or_insert_with(|| ConnectionState::new(HashSet::new()));
            state.listening_events.clear();
            state.listening_events.extend(events);
        }
    }

    fn set_status(&self, connection_id: i64, status: &str) {
        if let Ok(mut guard) = self.connections.lock()
            && let Some(state) = guard.get_mut(&connection_id)
        {
            state.status = status.to_string();
        }
    }

    pub fn get_status_for_connection(&self, connection_id: i64) -> String {
        if let Ok(guard) = self.connections.lock()
            && let Some(state) = guard.get(&connection_id)
        {
            return state.status.clone();
        }
        "disconnected".to_string()
    }

    pub fn get_status(&self) -> String {
        match self.get_current_connection_id() {
            Some(connection_id) => self.get_status_for_connection(connection_id),
            None => "disconnected".to_string(),
        }
    }

    pub fn get_all_statuses(&self) -> HashMap<i64, String> {
        if let Ok(guard) = self.connections.lock() {
            return guard
                .iter()
                .map(|(id, state)| (*id, state.status.clone()))
                .collect();
        }
        HashMap::new()
    }

    /// Perform auto-send for a connection
    fn do_auto_send(&self, connection_id: i64) {
        // Get auto-send messages from DB
        let messages = match db::list_auto_send_messages(connection_id) {
            Ok(msgs) => msgs,
            Err(e) => {
                log::error!("[AutoSend] Failed to fetch auto-send messages: {}", e);
                return;
            }
        };

        if messages.is_empty() {
            log::info!("[AutoSend] No auto-send messages configured");
            return;
        }

        log::info!("[AutoSend] Sending {} messages", messages.len());

        for (_, event_name, payload, _, _, _) in messages {
            // Small delay between messages
            thread::sleep(Duration::from_millis(50));

            // Check if still connected
            if self.get_status_for_connection(connection_id) != "connected" {
                log::warn!("[AutoSend] Connection lost, stopping auto-send");
                break;
            }

            log::info!("[AutoSend] Emitting: {}", event_name);
            if let Err(e) = self.emit_message(connection_id, &event_name, &payload) {
                log::error!("[AutoSend] Failed to emit {}: {}", event_name, e);
            } else {
                // Log to emit_logs
                let _ = db::add_emit_log(connection_id, &event_name, &payload);
            }
        }

        log::info!("[AutoSend] Completed");
    }

    pub fn connect(&self, connection_id: i64) -> Result<(), String> {
        {
            let mut connecting = self.connecting.lock().map_err(|_| "Lock error")?;
            if connecting.contains(&connection_id) {
                return Err("Connection already in progress for this connection".to_string());
            }
            connecting.insert(connection_id);
        }

        let result = do_connect(connection_id, self);

        if let Ok(mut connecting) = self.connecting.lock() {
            connecting.remove(&connection_id);
        }

        result
    }

    pub fn disconnect(&self, connection_id: i64, reason: &str) -> Result<(), String> {
        self.disconnect_inner(connection_id, reason)
    }

    pub fn emit_message(
        &self,
        connection_id: i64,
        event_name: &str,
        payload: &str,
    ) -> Result<(), String> {
        let client = match self.connections.lock() {
            Ok(guard) => guard
                .get(&connection_id)
                .and_then(|state| state.client.clone()),
            Err(_) => return Err("Failed to lock socket client".to_string()),
        };

        let client = client.ok_or_else(|| "Not connected".to_string())?;
        let payload_value =
            serde_json::from_str::<Value>(payload).unwrap_or(Value::String(payload.to_string()));

        // emit is blocking, so we do it directly here (called from sync context)
        // For async callers, use emit_message_async instead
        client
            .emit(event_name, payload_value)
            .map_err(|e| e.to_string())?;

        // Use emit_outgoing_event to both record to DB AND notify frontend via Tauri event
        self.emit_outgoing_event(connection_id, event_name, payload.to_string());
        Ok(())
    }

    pub async fn emit_message_async(
        &self,
        connection_id: i64,
        event_name: String,
        payload: String,
    ) -> Result<(), String> {
        let client = match self.connections.lock() {
            Ok(guard) => guard
                .get(&connection_id)
                .and_then(|state| state.client.clone()),
            Err(_) => return Err("Failed to lock socket client".to_string()),
        };

        let client = client.ok_or_else(|| "Not connected".to_string())?;
        let payload_value =
            serde_json::from_str::<Value>(&payload).unwrap_or(Value::String(payload.clone()));
        let event_name_clone = event_name.clone();

        // Run blocking emit on a separate thread to avoid blocking the async runtime
        // Convert error to String inside closure to avoid large Err-variant warning
        tokio::task::spawn_blocking(move || {
            client
                .emit(event_name_clone, payload_value)
                .map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| format!("Task join error: {}", e))??;

        // Record and emit to frontend so UI updates
        self.emit_outgoing_event(connection_id, &event_name, payload);
        Ok(())
    }

    pub fn get_current_connection_id(&self) -> Option<i64> {
        if let Ok(guard) = self.active_connection_id.lock() {
            return *guard;
        }
        None
    }

    pub fn add_listener(&self, connection_id: i64, event_name: &str) -> Result<(), String> {
        let trimmed = event_name.trim();
        if trimmed.is_empty() {
            return Err("Event name cannot be empty".to_string());
        }
        if let Ok(mut guard) = self.connections.lock() {
            let state = guard
                .entry(connection_id)
                .or_insert_with(|| ConnectionState::new(HashSet::new()));
            state.listening_events.insert(trimmed.to_string());
        }
        Ok(())
    }

    pub fn remove_listener(&self, connection_id: i64, event_name: &str) {
        if let Ok(mut guard) = self.connections.lock()
            && let Some(state) = guard.get_mut(&connection_id)
        {
            state.listening_events.remove(event_name);
        }
    }

    pub fn list_listeners(&self, connection_id: i64) -> Vec<String> {
        if let Ok(guard) = self.connections.lock()
            && let Some(state) = guard.get(&connection_id)
        {
            return state.listening_events.iter().cloned().collect();
        }
        Vec::new()
    }

    fn should_forward_event(&self, connection_id: i64, event_name: &str) -> bool {
        if let Ok(guard) = self.connections.lock()
            && let Some(state) = guard.get(&connection_id)
        {
            return state.listening_events.contains(event_name);
        }
        false
    }

    pub fn list_buffered_events(&self, connection_id: i64, limit: usize) -> Vec<BufferedEvent> {
        if let Ok(guard) = self.connections.lock()
            && let Some(state) = guard.get(&connection_id)
        {
            return state.event_buffer.list_recent(limit);
        }
        Vec::new()
    }

    fn record_event(
        &self,
        connection_id: i64,
        event_name: &str,
        payload: String,
        direction: &str,
        timestamp: String,
    ) {
        // Add to in-memory buffer
        let event = BufferedEvent {
            event_name: event_name.to_string(),
            payload: payload.clone(),
            timestamp: timestamp.clone(),
            direction: direction.to_string(),
        };
        if let Ok(mut guard) = self.connections.lock()
            && let Some(state) = guard.get_mut(&connection_id)
        {
            state.event_buffer.push(event);
        }

        // Persist to SQLite database
        if let Err(e) =
            db::add_event_history(connection_id, event_name, &payload, &timestamp, direction)
        {
            log::warn!("Failed to persist event to DB: {}", e);
        }
    }

    fn emit_status(&self, connection_id: i64, status: &str, message: Option<String>) {
        self.set_status(connection_id, status);
        let payload = SocketStatusPayload {
            connection_id,
            status: status.to_string(),
            message,
        };
        let _ = self.app_handle.emit(SOCKET_STATUS_EVENT, payload);
    }

    fn emit_error(&self, connection_id: i64, message: impl Into<String>) {
        let payload = SocketErrorPayload {
            connection_id,
            message: message.into(),
        };
        let _ = self.app_handle.emit(SOCKET_ERROR_EVENT, payload);
    }

    fn emit_event(&self, connection_id: i64, event_name: &str, payload: String) {
        let timestamp = Utc::now().to_rfc3339();
        self.record_event(
            connection_id,
            event_name,
            payload.clone(),
            "in",
            timestamp.clone(),
        );
        let event_payload = SocketEventPayload {
            connection_id,
            event_name: event_name.to_string(),
            payload,
            timestamp,
            direction: "in".to_string(),
        };
        let _ = self.app_handle.emit(SOCKET_EVENT_EVENT, event_payload);
    }

    /// Emit outgoing event to frontend (for MCP-sent messages to appear in UI)
    fn emit_outgoing_event(&self, connection_id: i64, event_name: &str, payload: String) {
        let timestamp = Utc::now().to_rfc3339();
        self.record_event(
            connection_id,
            event_name,
            payload.clone(),
            "out",
            timestamp.clone(),
        );
        let event_payload = SocketEventPayload {
            connection_id,
            event_name: event_name.to_string(),
            payload,
            timestamp,
            direction: "out".to_string(),
        };
        let _ = self.app_handle.emit(SOCKET_EVENT_EVENT, event_payload);
    }

    fn disconnect_inner(&self, connection_id: i64, reason: &str) -> Result<(), String> {
        // Reset connecting flag to allow new connections
        if let Ok(mut connecting) = self.connecting.lock() {
            connecting.remove(&connection_id);
        }

        let client = match self.connections.lock() {
            Ok(mut guard) => guard
                .remove(&connection_id)
                .and_then(|mut connection| connection.client.take()),
            Err(_) => return Err("Failed to lock socket manager".to_string()),
        };

        let status_payload = SocketStatusPayload {
            connection_id,
            status: "disconnected".to_string(),
            message: None,
        };
        let _ = self.app_handle.emit(SOCKET_STATUS_EVENT, status_payload);

        if client.is_some() {
            let timestamp = Utc::now().to_rfc3339();
            let payload = json!({ "reason": reason }).to_string();
            if let Err(e) =
                db::add_event_history(connection_id, "disconnect", &payload, &timestamp, "in")
            {
                log::warn!("Failed to persist disconnect event to DB: {}", e);
            }
            let event_payload = SocketEventPayload {
                connection_id,
                event_name: "disconnect".to_string(),
                payload,
                timestamp,
                direction: "in".to_string(),
            };
            let _ = self.app_handle.emit(SOCKET_EVENT_EVENT, event_payload);
        }

        if let Some(client) = client {
            client.disconnect().map_err(|e| e.to_string())?;
        }
        Ok(())
    }

}

#[tauri::command]
pub fn socket_connect(
    connection_id: i64,
    state: tauri::State<'_, SocketManager>,
) -> Result<(), String> {
    state.connect(connection_id)
}

fn do_connect(connection_id: i64, state: &SocketManager) -> Result<(), String> {
    let connection = db::get_connection_by_id(connection_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Connection not found".to_string())?;

    let (_, _name, url, namespace, auth_token, options, _created_at, _updated_at, _, _) = connection;

    let events = db::list_connection_events(connection_id).map_err(|e| e.to_string())?;
    let listening: Vec<String> = events
        .into_iter()
        .filter(|(_, _, is_listening)| *is_listening)
        .map(|(_, event_name, _)| event_name)
        .collect();
    state.set_listening_events(connection_id, listening.into_iter());
    state.set_client(connection_id, None);

    let options_value: Value = serde_json::from_str(&options).unwrap_or(Value::Null);
    let mut builder = ClientBuilder::new(url).namespace(namespace);

    if let Some(auth_token) = auth_token.as_deref() {
        builder = builder.auth(json!({ "token": auth_token }));
    } else if let Some(auth_value) = options_value.get("auth") {
        builder = builder.auth(auth_value.clone());
    }

    if let Some(reconnection) = options_value.get("reconnection").and_then(|v| v.as_bool()) {
        builder = builder.reconnect_on_disconnect(reconnection);
    } else {
        builder = builder.reconnect_on_disconnect(true);
    }

    if let Some(transports) = options_value.get("transports").and_then(|v| v.as_array())
        && transports.iter().any(|t| t.as_str() == Some("websocket"))
    {
        builder = builder.transport_type(TransportType::Websocket);
    }

    let status_state = state.clone();
    let auto_send_on_connect = options_value
        .get("autoSendOnConnect")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let auto_send_on_reconnect = options_value
        .get("autoSendOnReconnect")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    
    // Get auto-send settings from DB (these take priority over options)
    let (db_auto_connect, db_auto_reconnect) = db::get_connection_by_id(connection_id)
        .ok()
        .flatten()
        .map(|(_, _, _, _, _, _, _, _, on_connect, on_reconnect)| (on_connect, on_reconnect))
        .unwrap_or((auto_send_on_connect, auto_send_on_reconnect));

    builder = builder.on(Event::Connect, move |_payload, _| {
        if !status_state.has_connection(connection_id) {
            return;
        }
        status_state.emit_status(connection_id, "connected", None);
        status_state.emit_event(
            connection_id,
            "connect",
            json!({ "connectionId": connection_id }).to_string(),
        );

        // Determine if we should auto-send
        let was_connected_before = status_state.has_connected_before(connection_id);
        let should_auto_send = if was_connected_before {
            db_auto_reconnect
        } else {
            db_auto_connect
        };

        log::info!(
            "[AutoSend] connection_id={}, was_connected_before={}, auto_on_connect={}, auto_on_reconnect={}, should_auto_send={}",
            connection_id, was_connected_before, db_auto_connect, db_auto_reconnect, should_auto_send
        );

        // Mark as connected (for future reconnect detection)
        status_state.mark_connected(connection_id);

        if should_auto_send {
            // Run auto-send in a separate thread to not block the callback
            let auto_send_state = status_state.clone();
            thread::spawn(move || {
                // Small delay to ensure socket is fully ready
                thread::sleep(Duration::from_millis(100));
                auto_send_state.do_auto_send(connection_id);
            });
        }
    });

    let disconnect_state = state.clone();
    builder = builder.on(Event::Close, move |_payload, _| {
        if !disconnect_state.has_connection(connection_id) {
            return;
        }
        disconnect_state.emit_status(connection_id, "disconnected", None);
        disconnect_state.emit_event(
            connection_id,
            "disconnect",
            json!({ "reason": "server" }).to_string(),
        );
    });

    let error_state = state.clone();
    builder = builder.on(Event::Error, move |payload, _| {
        if !error_state.has_connection(connection_id) {
            return;
        }
        let message = payload_to_string(&payload);
        error_state.emit_status(connection_id, "error", Some(message.clone()));
        error_state.emit_event(
            connection_id,
            "connect_error",
            json!({ "message": message }).to_string(),
        );
        error_state.emit_error(connection_id, message);
    });

    let any_state = state.clone();
    builder = builder.on_any(move |event, payload, _| {
        if !any_state.has_connection(connection_id) {
            return;
        }
        let event_name = event.to_string();
        if !any_state.should_forward_event(connection_id, &event_name) {
            return;
        }
        let payload = payload_to_string(&payload);
        any_state.emit_event(connection_id, &event_name, payload);
    });

    // Emit connecting status before attempting connection
    state.emit_status(connection_id, "connecting", None);

    match builder.connect() {
        Ok(client) => {
            state.set_client(connection_id, Some(client));
            state.set_active_connection(connection_id);
            // The Event::Connect callback will emit "connected" when actually connected
            Ok(())
        }
        Err(err) => {
            let message = err.to_string();
            state.emit_status(connection_id, "error", Some(message.clone()));
            state.emit_event(
                connection_id,
                "connect_error",
                json!({ "message": message.clone() }).to_string(),
            );
            state.emit_error(connection_id, message.clone());
            Err(message)
        }
    }
}

#[tauri::command]
pub fn socket_set_active(
    connection_id: i64,
    state: tauri::State<'_, SocketManager>,
) -> Result<(), String> {
    state.set_active_connection(connection_id);
    Ok(())
}

#[tauri::command]
pub fn socket_clear_active(state: tauri::State<'_, SocketManager>) -> Result<(), String> {
    state.clear_active_connection();
    Ok(())
}

#[tauri::command]
pub fn socket_get_all_statuses(
    state: tauri::State<'_, SocketManager>,
) -> Result<HashMap<i64, String>, String> {
    Ok(state.get_all_statuses())
}

#[tauri::command]
pub fn socket_disconnect(
    connection_id: i64,
    state: tauri::State<'_, SocketManager>,
) -> Result<(), String> {
    state.disconnect(connection_id, "manual")
}

#[tauri::command]
pub fn socket_emit(
    connection_id: i64,
    event_name: String,
    payload: String,
    state: tauri::State<'_, SocketManager>,
) -> Result<(), String> {
    state.emit_message(connection_id, &event_name, &payload)
}

#[tauri::command]
pub fn socket_add_listener(
    connection_id: i64,
    event_name: String,
    state: tauri::State<'_, SocketManager>,
) -> Result<(), String> {
    state.add_listener(connection_id, &event_name)
}

#[tauri::command]
pub fn socket_remove_listener(
    connection_id: i64,
    event_name: String,
    state: tauri::State<'_, SocketManager>,
) -> Result<(), String> {
    state.remove_listener(connection_id, &event_name);
    Ok(())
}

#[allow(deprecated)]
fn payload_to_string(payload: &Payload) -> String {
    match payload {
        Payload::Binary(bytes) => format!("{:?}", bytes),
        Payload::Text(values) => {
            // Unwrap single-element arrays to avoid unnecessary [] wrapping
            match values.len() {
                0 => "null".to_string(),
                1 => serde_json::to_string(&values[0]).unwrap_or_else(|_| "null".to_string()),
                _ => serde_json::to_string(values).unwrap_or_else(|_| "[]".to_string()),
            }
        }
        Payload::String(value) => value.clone(),
    }
}
