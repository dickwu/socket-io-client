use std::collections::{HashSet, VecDeque};
use std::sync::{Arc, Mutex, RwLock};

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
struct SocketStatusPayload {
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Clone, Serialize)]
struct SocketErrorPayload {
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SocketEventPayload {
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

#[derive(Clone)]
pub struct SocketManager {
    client: Arc<Mutex<Option<Client>>>,
    listening_events: Arc<RwLock<HashSet<String>>>,
    current_connection_id: Arc<Mutex<Option<i64>>>,
    connecting: Arc<Mutex<bool>>,
    connection_status: Arc<Mutex<String>>,
    event_buffer: Arc<Mutex<EventBuffer>>,
    app_handle: AppHandle,
}

impl SocketManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            client: Arc::new(Mutex::new(None)),
            listening_events: Arc::new(RwLock::new(HashSet::new())),
            current_connection_id: Arc::new(Mutex::new(None)),
            connecting: Arc::new(Mutex::new(false)),
            connection_status: Arc::new(Mutex::new("disconnected".to_string())),
            event_buffer: Arc::new(Mutex::new(EventBuffer::new(100))),
            app_handle,
        }
    }

    pub fn connect(&self, connection_id: i64) -> Result<(), String> {
        {
            let mut connecting = self.connecting.lock().map_err(|_| "Lock error")?;
            if *connecting {
                return Err("Connection already in progress".to_string());
            }
            *connecting = true;
        }

        let result = do_connect(connection_id, self);

        if let Ok(mut connecting) = self.connecting.lock() {
            *connecting = false;
        }

        result
    }

    pub fn disconnect(&self, reason: &str) -> Result<(), String> {
        self.disconnect_inner(reason)
    }

    pub fn emit_message(&self, event_name: &str, payload: &str) -> Result<(), String> {
        let client = match self.client.lock() {
            Ok(guard) => guard.clone(),
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

        let timestamp = Utc::now().to_rfc3339();
        self.record_event(event_name, payload.to_string(), "out", timestamp);
        Ok(())
    }

    pub async fn emit_message_async(
        &self,
        event_name: String,
        payload: String,
    ) -> Result<(), String> {
        let client = match self.client.lock() {
            Ok(guard) => guard.clone(),
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
        self.emit_outgoing_event(&event_name, payload);
        Ok(())
    }

    fn set_current_connection(&self, connection_id: Option<i64>) {
        if let Ok(mut guard) = self.current_connection_id.lock() {
            *guard = connection_id;
        }
    }

    pub fn get_current_connection_id(&self) -> Option<i64> {
        if let Ok(guard) = self.current_connection_id.lock() {
            return *guard;
        }
        None
    }

    fn set_client(&self, client: Option<Client>) {
        if let Ok(mut guard) = self.client.lock() {
            // Disconnect existing client before replacing
            if let Some(old_client) = guard.take() {
                let _ = old_client.disconnect();
            }
            *guard = client;
        }
    }

    fn set_listening_events(&self, events: impl IntoIterator<Item = String>) {
        if let Ok(mut guard) = self.listening_events.write() {
            guard.clear();
            guard.extend(events);
        }
    }

    pub fn add_listener(&self, event_name: &str) -> Result<(), String> {
        let trimmed = event_name.trim();
        if trimmed.is_empty() {
            return Err("Event name cannot be empty".to_string());
        }
        if let Ok(mut guard) = self.listening_events.write() {
            guard.insert(trimmed.to_string());
        }
        Ok(())
    }

    pub fn remove_listener(&self, event_name: &str) {
        if let Ok(mut guard) = self.listening_events.write() {
            guard.remove(event_name);
        }
    }

    pub fn list_listeners(&self) -> Vec<String> {
        if let Ok(guard) = self.listening_events.read() {
            return guard.iter().cloned().collect();
        }
        Vec::new()
    }

    fn should_forward_event(&self, event_name: &str) -> bool {
        if let Ok(guard) = self.listening_events.read() {
            return guard.contains(event_name);
        }
        false
    }

    fn set_status(&self, status: &str) {
        if let Ok(mut guard) = self.connection_status.lock() {
            *guard = status.to_string();
        }
    }

    pub fn get_status(&self) -> String {
        if let Ok(guard) = self.connection_status.lock() {
            return guard.clone();
        }
        "unknown".to_string()
    }

    pub fn list_buffered_events(&self, limit: usize) -> Vec<BufferedEvent> {
        if let Ok(guard) = self.event_buffer.lock() {
            return guard.list_recent(limit);
        }
        Vec::new()
    }

    fn record_event(&self, event_name: &str, payload: String, direction: &str, timestamp: String) {
        let event = BufferedEvent {
            event_name: event_name.to_string(),
            payload,
            timestamp,
            direction: direction.to_string(),
        };
        if let Ok(mut guard) = self.event_buffer.lock() {
            guard.push(event);
        }
    }

    fn emit_status(&self, status: &str, message: Option<String>) {
        self.set_status(status);
        let payload = SocketStatusPayload {
            status: status.to_string(),
            message,
        };
        let _ = self.app_handle.emit(SOCKET_STATUS_EVENT, payload);
    }

    fn emit_error(&self, message: impl Into<String>) {
        let payload = SocketErrorPayload {
            message: message.into(),
        };
        let _ = self.app_handle.emit(SOCKET_ERROR_EVENT, payload);
    }

    fn emit_event(&self, event_name: &str, payload: String) {
        let timestamp = Utc::now().to_rfc3339();
        self.record_event(event_name, payload.clone(), "in", timestamp.clone());
        let event_payload = SocketEventPayload {
            event_name: event_name.to_string(),
            payload,
            timestamp,
            direction: "in".to_string(),
        };
        let _ = self.app_handle.emit(SOCKET_EVENT_EVENT, event_payload);
    }

    /// Emit outgoing event to frontend (for MCP-sent messages to appear in UI)
    fn emit_outgoing_event(&self, event_name: &str, payload: String) {
        let timestamp = Utc::now().to_rfc3339();
        self.record_event(event_name, payload.clone(), "out", timestamp.clone());
        let event_payload = SocketEventPayload {
            event_name: event_name.to_string(),
            payload,
            timestamp,
            direction: "out".to_string(),
        };
        let _ = self.app_handle.emit(SOCKET_EVENT_EVENT, event_payload);
    }

    fn disconnect_inner(&self, reason: &str) -> Result<(), String> {
        // Reset connecting flag to allow new connections
        if let Ok(mut connecting) = self.connecting.lock() {
            *connecting = false;
        }

        let client = match self.client.lock() {
            Ok(mut guard) => guard.take(),
            Err(_) => return Err("Failed to lock socket client".to_string()),
        };

        self.set_current_connection(None);
        self.set_status("disconnected");
        if client.is_some() {
            self.emit_status("disconnected", None);
            self.emit_event("disconnect", json!({ "reason": reason }).to_string());
        }

        if let Some(client) = client {
            client.disconnect().map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// Force reset the connecting flag (for recovery from stuck state)
    pub fn reset_connecting_flag(&self) {
        if let Ok(mut connecting) = self.connecting.lock() {
            *connecting = false;
        }
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
    // Disconnect existing connection first
    state.disconnect_inner("reconnect")?;

    let connection = db::get_connection_by_id(connection_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Connection not found".to_string())?;

    let (_, _name, url, namespace, auth_token, options, _created_at, _updated_at) = connection;

    let events = db::list_connection_events(connection_id).map_err(|e| e.to_string())?;
    let listening: Vec<String> = events
        .into_iter()
        .filter(|(_, _, is_listening)| *is_listening)
        .map(|(_, event_name, _)| event_name)
        .collect();
    state.set_listening_events(listening);

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
    builder = builder.on(Event::Connect, move |_payload, _| {
        status_state.emit_status("connected", None);
        status_state.emit_event(
            "connect",
            json!({ "connectionId": connection_id }).to_string(),
        );
    });

    let disconnect_state = state.clone();
    builder = builder.on(Event::Close, move |_payload, _| {
        disconnect_state.emit_status("disconnected", None);
        disconnect_state.emit_event("disconnect", json!({ "reason": "server" }).to_string());
    });

    let error_state = state.clone();
    builder = builder.on(Event::Error, move |payload, _| {
        let message = payload_to_string(&payload);
        error_state.emit_status("error", Some(message.clone()));
        error_state.emit_event("connect_error", json!({ "message": message }).to_string());
        error_state.emit_error(message);
    });

    let any_state = state.clone();
    builder = builder.on_any(move |event, payload, _| {
        let event_name = event.to_string();
        if !any_state.should_forward_event(&event_name) {
            return;
        }
        let payload = payload_to_string(&payload);
        any_state.emit_event(&event_name, payload);
    });

    // Emit connecting status before attempting connection
    state.emit_status("connecting", None);

    match builder.connect() {
        Ok(client) => {
            state.set_client(Some(client));
            state.set_current_connection(Some(connection_id));
            // The Event::Connect callback will emit "connected" when actually connected
            Ok(())
        }
        Err(err) => {
            let message = err.to_string();
            state.emit_status("error", Some(message.clone()));
            state.emit_event(
                "connect_error",
                json!({ "message": message.clone() }).to_string(),
            );
            state.emit_error(message.clone());
            Err(message)
        }
    }
}

#[tauri::command]
pub fn socket_disconnect(state: tauri::State<'_, SocketManager>) -> Result<(), String> {
    state.disconnect("manual")
}

#[tauri::command]
pub fn socket_emit(
    event_name: String,
    payload: String,
    state: tauri::State<'_, SocketManager>,
) -> Result<(), String> {
    state.emit_message(&event_name, &payload)
}

#[tauri::command]
pub fn socket_add_listener(
    event_name: String,
    state: tauri::State<'_, SocketManager>,
) -> Result<(), String> {
    state.add_listener(&event_name)
}

#[tauri::command]
pub fn socket_remove_listener(
    event_name: String,
    state: tauri::State<'_, SocketManager>,
) -> Result<(), String> {
    state.remove_listener(&event_name);
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
