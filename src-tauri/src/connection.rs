use crate::db;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub id: i64,
    pub name: String,
    pub url: String,
    pub namespace: String,
    pub auth_token: Option<String>,
    pub options: String,
    pub created_at: String,
    pub updated_at: String,
    pub auto_send_on_connect: bool,
    pub auto_send_on_reconnect: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionEvent {
    pub id: i64,
    pub event_name: String,
    pub is_listening: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateConnectionInput {
    pub name: String,
    pub url: String,
    pub namespace: Option<String>,
    pub auth_token: Option<String>,
    pub options: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateConnectionInput {
    pub id: i64,
    pub name: String,
    pub url: String,
    pub namespace: Option<String>,
    pub auth_token: Option<String>,
    pub options: Option<String>,
}

#[tauri::command]
pub fn create_connection(input: CreateConnectionInput) -> Result<i64, String> {
    let namespace = input.namespace.unwrap_or_else(|| "/".to_string());
    let options = input.options.unwrap_or_else(|| "{}".to_string());

    db::create_connection(
        &input.name,
        &input.url,
        &namespace,
        input.auth_token.as_deref(),
        &options,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_connection(input: UpdateConnectionInput) -> Result<(), String> {
    let namespace = input.namespace.unwrap_or_else(|| "/".to_string());
    let options = input.options.unwrap_or_else(|| "{}".to_string());

    db::update_connection(
        input.id,
        &input.name,
        &input.url,
        &namespace,
        input.auth_token.as_deref(),
        &options,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_connection(id: i64) -> Result<(), String> {
    db::delete_connection(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_connections() -> Result<Vec<Connection>, String> {
    let rows = db::list_connections().map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(
            |(id, name, url, namespace, auth_token, options, created_at, updated_at, auto_send_on_connect, auto_send_on_reconnect)| Connection {
                id,
                name,
                url,
                namespace,
                auth_token,
                options,
                created_at,
                updated_at,
                auto_send_on_connect,
                auto_send_on_reconnect,
            },
        )
        .collect())
}

#[tauri::command]
pub fn get_connection(id: i64) -> Result<Option<Connection>, String> {
    let row = db::get_connection_by_id(id).map_err(|e| e.to_string())?;

    Ok(row.map(
        |(id, name, url, namespace, auth_token, options, created_at, updated_at, auto_send_on_connect, auto_send_on_reconnect)| Connection {
            id,
            name,
            url,
            namespace,
            auth_token,
            options,
            created_at,
            updated_at,
            auto_send_on_connect,
            auto_send_on_reconnect,
        },
    ))
}

#[tauri::command]
pub fn set_connection_auto_send(
    connection_id: i64,
    on_connect: bool,
    on_reconnect: bool,
) -> Result<(), String> {
    db::set_connection_auto_send(connection_id, on_connect, on_reconnect)
        .map_err(|e| e.to_string())
}

// Connection events commands
#[tauri::command]
pub fn add_connection_event(connection_id: i64, event_name: String) -> Result<i64, String> {
    db::add_connection_event(connection_id, &event_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_connection_event(id: i64) -> Result<(), String> {
    db::remove_connection_event(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_connection_event(id: i64, is_listening: bool) -> Result<(), String> {
    db::toggle_connection_event(id, is_listening).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_connection_events(connection_id: i64) -> Result<Vec<ConnectionEvent>, String> {
    let rows = db::list_connection_events(connection_id).map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|(id, event_name, is_listening)| ConnectionEvent {
            id,
            event_name,
            is_listening,
        })
        .collect())
}

// App state commands
#[tauri::command]
pub fn set_current_connection(connection_id: i64) -> Result<(), String> {
    db::set_app_state("current_connection", &connection_id.to_string()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_current_connection() -> Result<Option<i64>, String> {
    let value = db::get_app_state("current_connection").map_err(|e| e.to_string())?;
    Ok(value.and_then(|v| v.parse().ok()))
}
