use lazy_static::lazy_static;
use rusqlite::{Connection, Result, params};
use std::path::PathBuf;
use std::sync::Mutex;

lazy_static! {
    static ref DB_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);
}

pub fn init_db(path: &PathBuf) -> Result<()> {
    {
        let mut db_path = DB_PATH.lock().unwrap();
        *db_path = Some(path.clone());
    }
    
    let conn = get_connection()?;
    
    // Create connections table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS connections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            namespace TEXT DEFAULT '/',
            auth_token TEXT,
            options TEXT DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    
    // Create connection_events table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS connection_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            connection_id INTEGER NOT NULL,
            event_name TEXT NOT NULL,
            is_listening INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
        )",
        [],
    )?;
    
    // Create emit_logs table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS emit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            connection_id INTEGER NOT NULL,
            event_name TEXT NOT NULL,
            payload TEXT DEFAULT '{}',
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
        )",
        [],
    )?;
    
    // Create pinned_messages table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS pinned_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            connection_id INTEGER NOT NULL,
            event_name TEXT NOT NULL,
            payload TEXT DEFAULT '{}',
            label TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
        )",
        [],
    )?;
    
    // Create app_state table for persisting current selection
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_state (
            key TEXT PRIMARY KEY,
            value TEXT
        )",
        [],
    )?;
    
    log::info!("Database initialized at {:?}", path);
    Ok(())
}

pub fn get_connection() -> Result<Connection> {
    let db_path = DB_PATH.lock().unwrap();
    let path = db_path.as_ref().expect("Database not initialized");
    Connection::open(path)
}

// Connection operations
pub fn create_connection(name: &str, url: &str, namespace: &str, auth_token: Option<&str>, options: &str) -> Result<i64> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT INTO connections (name, url, namespace, auth_token, options) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![name, url, namespace, auth_token, options],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_connection(id: i64, name: &str, url: &str, namespace: &str, auth_token: Option<&str>, options: &str) -> Result<()> {
    let conn = get_connection()?;
    conn.execute(
        "UPDATE connections SET name = ?1, url = ?2, namespace = ?3, auth_token = ?4, options = ?5, updated_at = CURRENT_TIMESTAMP WHERE id = ?6",
        params![name, url, namespace, auth_token, options, id],
    )?;
    Ok(())
}

pub fn delete_connection(id: i64) -> Result<()> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM connections WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn list_connections() -> Result<Vec<(i64, String, String, String, Option<String>, String, String, String)>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, url, namespace, auth_token, options, created_at, updated_at FROM connections ORDER BY updated_at DESC"
    )?;
    
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get(0)?,
            row.get(1)?,
            row.get(2)?,
            row.get(3)?,
            row.get(4)?,
            row.get(5)?,
            row.get(6)?,
            row.get(7)?,
        ))
    })?;
    
    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

pub fn get_connection_by_id(id: i64) -> Result<Option<(i64, String, String, String, Option<String>, String)>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, url, namespace, auth_token, options FROM connections WHERE id = ?1"
    )?;
    
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some((
            row.get(0)?,
            row.get(1)?,
            row.get(2)?,
            row.get(3)?,
            row.get(4)?,
            row.get(5)?,
        )))
    } else {
        Ok(None)
    }
}

// Connection events operations
pub fn add_connection_event(connection_id: i64, event_name: &str) -> Result<i64> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT INTO connection_events (connection_id, event_name) VALUES (?1, ?2)",
        params![connection_id, event_name],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn remove_connection_event(id: i64) -> Result<()> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM connection_events WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn toggle_connection_event(id: i64, is_listening: bool) -> Result<()> {
    let conn = get_connection()?;
    conn.execute(
        "UPDATE connection_events SET is_listening = ?1 WHERE id = ?2",
        params![is_listening as i32, id],
    )?;
    Ok(())
}

pub fn list_connection_events(connection_id: i64) -> Result<Vec<(i64, String, bool)>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, event_name, is_listening FROM connection_events WHERE connection_id = ?1 ORDER BY created_at"
    )?;
    
    let rows = stmt.query_map(params![connection_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get::<_, i32>(2)? != 0))
    })?;
    
    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

// Emit log operations
pub fn add_emit_log(connection_id: i64, event_name: &str, payload: &str) -> Result<i64> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT INTO emit_logs (connection_id, event_name, payload) VALUES (?1, ?2, ?3)",
        params![connection_id, event_name, payload],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_emit_logs(connection_id: i64, limit: i64) -> Result<Vec<(i64, String, String, String)>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, event_name, payload, sent_at FROM emit_logs WHERE connection_id = ?1 ORDER BY sent_at DESC LIMIT ?2"
    )?;
    
    let rows = stmt.query_map(params![connection_id, limit], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
    })?;
    
    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

pub fn clear_emit_logs(connection_id: i64) -> Result<()> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM emit_logs WHERE connection_id = ?1", params![connection_id])?;
    Ok(())
}

// Pinned messages operations
pub fn add_pinned_message(connection_id: i64, event_name: &str, payload: &str, label: Option<&str>) -> Result<i64> {
    let conn = get_connection()?;
    
    // Get max sort_order
    let max_order: i64 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), 0) FROM pinned_messages WHERE connection_id = ?1",
        params![connection_id],
        |row| row.get(0),
    ).unwrap_or(0);
    
    conn.execute(
        "INSERT INTO pinned_messages (connection_id, event_name, payload, label, sort_order) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![connection_id, event_name, payload, label, max_order + 1],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_pinned_message(id: i64, event_name: &str, payload: &str, label: Option<&str>) -> Result<()> {
    let conn = get_connection()?;
    conn.execute(
        "UPDATE pinned_messages SET event_name = ?1, payload = ?2, label = ?3 WHERE id = ?4",
        params![event_name, payload, label, id],
    )?;
    Ok(())
}

pub fn delete_pinned_message(id: i64) -> Result<()> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM pinned_messages WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn reorder_pinned_messages(ids: &[i64]) -> Result<()> {
    let conn = get_connection()?;
    for (index, id) in ids.iter().enumerate() {
        conn.execute(
            "UPDATE pinned_messages SET sort_order = ?1 WHERE id = ?2",
            params![index as i64, id],
        )?;
    }
    Ok(())
}

pub fn list_pinned_messages(connection_id: i64) -> Result<Vec<(i64, String, String, Option<String>, i64)>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, event_name, payload, label, sort_order FROM pinned_messages WHERE connection_id = ?1 ORDER BY sort_order"
    )?;
    
    let rows = stmt.query_map(params![connection_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
    })?;
    
    let mut results = Vec::new();
    for row in rows {
        results.push(row?);
    }
    Ok(results)
}

pub fn find_duplicate_pinned_message(connection_id: i64, event_name: &str, payload: &str) -> Result<Option<i64>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id FROM pinned_messages WHERE connection_id = ?1 AND event_name = ?2 AND payload = ?3 LIMIT 1"
    )?;
    
    let mut rows = stmt.query(params![connection_id, event_name, payload])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

// App state operations
pub fn set_app_state(key: &str, value: &str) -> Result<()> {
    let conn = get_connection()?;
    conn.execute(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES (?1, ?2)",
        params![key, value],
    )?;
    Ok(())
}

pub fn get_app_state(key: &str) -> Result<Option<String>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare("SELECT value FROM app_state WHERE key = ?1")?;
    let mut rows = stmt.query(params![key])?;
    
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}
