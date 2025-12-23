use serde::{Deserialize, Serialize};
use crate::db;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinnedMessage {
    pub id: i64,
    pub event_name: String,
    pub payload: String,
    pub label: Option<String>,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePinnedInput {
    pub connection_id: i64,
    pub event_name: String,
    pub payload: String,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatePinnedInput {
    pub id: i64,
    pub event_name: String,
    pub payload: String,
    pub label: Option<String>,
}

#[tauri::command]
pub fn add_pinned_message(input: CreatePinnedInput) -> Result<i64, String> {
    db::add_pinned_message(
        input.connection_id,
        &input.event_name,
        &input.payload,
        input.label.as_deref(),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_pinned_message(input: UpdatePinnedInput) -> Result<(), String> {
    db::update_pinned_message(
        input.id,
        &input.event_name,
        &input.payload,
        input.label.as_deref(),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_pinned_message(id: i64) -> Result<(), String> {
    db::delete_pinned_message(id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reorder_pinned_messages(ids: Vec<i64>) -> Result<(), String> {
    db::reorder_pinned_messages(&ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_pinned_messages(connection_id: i64) -> Result<Vec<PinnedMessage>, String> {
    let rows = db::list_pinned_messages(connection_id).map_err(|e| e.to_string())?;
    
    Ok(rows.into_iter().map(|(id, event_name, payload, label, sort_order)| {
        PinnedMessage {
            id,
            event_name,
            payload,
            label,
            sort_order,
        }
    }).collect())
}
