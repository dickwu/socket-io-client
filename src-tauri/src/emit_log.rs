use serde::{Deserialize, Serialize};
use crate::db;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmitLog {
    pub id: i64,
    pub event_name: String,
    pub payload: String,
    pub sent_at: String,
}

#[tauri::command]
pub fn add_emit_log(connection_id: i64, event_name: String, payload: String) -> Result<i64, String> {
    db::add_emit_log(connection_id, &event_name, &payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_emit_logs(connection_id: i64, limit: Option<i64>) -> Result<Vec<EmitLog>, String> {
    let limit = limit.unwrap_or(100);
    let rows = db::list_emit_logs(connection_id, limit).map_err(|e| e.to_string())?;
    
    Ok(rows.into_iter().map(|(id, event_name, payload, sent_at)| {
        EmitLog {
            id,
            event_name,
            payload,
            sent_at,
        }
    }).collect())
}

#[tauri::command]
pub fn clear_emit_logs(connection_id: i64) -> Result<(), String> {
    db::clear_emit_logs(connection_id).map_err(|e| e.to_string())
}
