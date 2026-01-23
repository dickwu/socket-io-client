use std::collections::HashSet;
use std::sync::{Arc, Mutex, RwLock};

use chrono::Utc;
use rust_socketio::client::Client;
use rust_socketio::{ClientBuilder, Event, Payload, TransportType};
use serde::Serialize;
use serde_json::{json, Value};
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
}

#[derive(Clone)]
pub struct SocketManager {
    client: Arc<Mutex<Option<Client>>>,
    listening_events: Arc<RwLock<HashSet<String>>>,
    current_connection_id: Arc<Mutex<Option<i64>>>,
    connecting: Arc<Mutex<bool>>,
    app_handle: AppHandle,
}

impl SocketManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            client: Arc::new(Mutex::new(None)),
            listening_events: Arc::new(RwLock::new(HashSet::new())),
            current_connection_id: Arc::new(Mutex::new(None)),
            connecting: Arc::new(Mutex::new(false)),
            app_handle,
        }
    }

    fn set_current_connection(&self, connection_id: Option<i64>) {
        if let Ok(mut guard) = self.current_connection_id.lock() {
            *guard = connection_id;
        }
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

    fn add_listener(&self, event_name: &str) -> Result<(), String> {
        let trimmed = event_name.trim();
        if trimmed.is_empty() {
            return Err("Event name cannot be empty".to_string());
        }
        if let Ok(mut guard) = self.listening_events.write() {
            guard.insert(trimmed.to_string());
        }
        Ok(())
    }

    fn remove_listener(&self, event_name: &str) {
        if let Ok(mut guard) = self.listening_events.write() {
            guard.remove(event_name);
        }
    }

    fn should_forward_event(&self, event_name: &str) -> bool {
        if let Ok(guard) = self.listening_events.read() {
            return guard.contains(event_name);
        }
        false
    }

    fn emit_status(&self, status: &str, message: Option<String>) {
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
        let payload = SocketEventPayload {
            event_name: event_name.to_string(),
            payload,
            timestamp: Utc::now().to_rfc3339(),
        };
        let _ = self.app_handle.emit(SOCKET_EVENT_EVENT, payload);
    }

    fn disconnect_inner(&self, reason: &str) -> Result<(), String> {
        let client = match self.client.lock() {
            Ok(mut guard) => guard.take(),
            Err(_) => return Err("Failed to lock socket client".to_string()),
        };

        self.set_current_connection(None);
        if client.is_some() {
            self.emit_status("disconnected", None);
            self.emit_event("disconnect", json!({ "reason": reason }).to_string());
        }

        if let Some(client) = client {
            client.disconnect().map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

#[tauri::command]
pub fn socket_connect(connection_id: i64, state: tauri::State<'_, SocketManager>) -> Result<(), String> {
    // Guard against concurrent connect calls
    {
        let mut connecting = state.connecting.lock().map_err(|_| "Lock error")?;
        if *connecting {
            return Err("Connection already in progress".to_string());
        }
        *connecting = true;
    }

    // Inner function to do the actual connection work
    let result = do_connect(connection_id, &state);

    // Always reset connecting flag
    if let Ok(mut connecting) = state.connecting.lock() {
        *connecting = false;
    }

    result
}

fn do_connect(connection_id: i64, state: &SocketManager) -> Result<(), String> {
    // Disconnect existing connection first
    state.disconnect_inner("reconnect")?;

    let connection = db::get_connection_by_id(connection_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Connection not found".to_string())?;

    let (_, _name, url, namespace, auth_token, options) = connection;

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

    if let Some(transports) = options_value.get("transports").and_then(|v| v.as_array()) {
        if transports.iter().any(|t| t.as_str() == Some("websocket")) {
            builder = builder.transport_type(TransportType::Websocket);
        }
    }

    let status_state = state.clone();
    builder = builder.on(Event::Connect, move |_payload, _| {
        status_state.emit_status("connected", None);
        status_state.emit_event("connect", json!({ "connectionId": connection_id }).to_string());
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
            state.emit_event("connect_error", json!({ "message": message.clone() }).to_string());
            state.emit_error(message.clone());
            Err(message)
        }
    }
}

#[tauri::command]
pub fn socket_disconnect(state: tauri::State<'_, SocketManager>) -> Result<(), String> {
    state.disconnect_inner("manual")
}

#[tauri::command]
pub fn socket_emit(
    event_name: String,
    payload: String,
    state: tauri::State<'_, SocketManager>,
) -> Result<(), String> {
    let client = match state.client.lock() {
        Ok(guard) => guard.clone(),
        Err(_) => return Err("Failed to lock socket client".to_string()),
    };

    let client = client.ok_or_else(|| "Not connected".to_string())?;
    let payload_value = serde_json::from_str::<Value>(&payload).unwrap_or(Value::String(payload));
    client.emit(event_name, payload_value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn socket_add_listener(event_name: String, state: tauri::State<'_, SocketManager>) -> Result<(), String> {
    state.add_listener(&event_name)
}

#[tauri::command]
pub fn socket_remove_listener(event_name: String, state: tauri::State<'_, SocketManager>) -> Result<(), String> {
    state.remove_listener(&event_name);
    Ok(())
}

#[allow(deprecated)]
fn payload_to_string(payload: &Payload) -> String {
    match payload {
        Payload::Binary(bytes) => format!("{:?}", bytes),
        Payload::Text(values) => serde_json::to_string(values).unwrap_or_else(|_| "[]".to_string()),
        Payload::String(value) => value.clone(),
    }
}
