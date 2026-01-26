use std::net::SocketAddr;
use std::sync::Mutex;

use axum::{
    Json, Router,
    extract::State,
    http::{Method, StatusCode, header},
    response::{
        IntoResponse,
        sse::{Event, KeepAlive, Sse},
    },
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::sync::{broadcast, watch};
use tokio::task::JoinHandle;
use tokio_stream::StreamExt;
use tokio_stream::wrappers::BroadcastStream;
use tower_http::cors::{Any, CorsLayer};

use crate::db;
use crate::socket_client::SocketManager;

// MCP Protocol Version
const PROTOCOL_VERSION: &str = "2024-11-05";

// ============================================================================
// JSON-RPC Types
// ============================================================================

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Debug, Serialize)]
struct JsonRpcError {
    code: i32,
    message: String,
}

impl JsonRpcResponse {
    fn success(id: Value, result: Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(result),
            error: None,
        }
    }

    fn error(id: Value, code: i32, message: &str) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: None,
            error: Some(JsonRpcError {
                code,
                message: message.to_string(),
            }),
        }
    }
}

// ============================================================================
// MCP Types
// ============================================================================

#[derive(Debug, Serialize)]
struct ToolInfo {
    name: String,
    description: String,
    #[serde(rename = "inputSchema")]
    input_schema: Value,
}

// ============================================================================
// App State
// ============================================================================

#[derive(Clone)]
struct McpAppState {
    socket: SocketManager,
    sse_tx: broadcast::Sender<String>,
}

// ============================================================================
// Tool Definitions
// ============================================================================

fn get_tools() -> Vec<ToolInfo> {
    vec![
        ToolInfo {
            name: "list_connections".to_string(),
            description: "List saved Socket.IO connections".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
        ToolInfo {
            name: "get_connection_status".to_string(),
            description: "Get current Socket.IO connection status".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
        ToolInfo {
            name: "connect".to_string(),
            description: "Connect to a Socket.IO server by connection ID".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "connection_id": {
                        "type": "integer",
                        "description": "The connection ID to connect to"
                    }
                },
                "required": ["connection_id"]
            }),
        },
        ToolInfo {
            name: "disconnect".to_string(),
            description: "Disconnect from the current Socket.IO server".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
        ToolInfo {
            name: "send_message".to_string(),
            description: "Send an event with payload to the Socket.IO server".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "event_name": {
                        "type": "string",
                        "description": "The event name to send"
                    },
                    "payload": {
                        "type": "string",
                        "description": "The JSON payload to send"
                    }
                },
                "required": ["event_name", "payload"]
            }),
        },
        ToolInfo {
            name: "get_recent_events".to_string(),
            description: "Get recent Socket.IO events received by the client".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of events to return (default: 50)"
                    }
                },
                "required": []
            }),
        },
        ToolInfo {
            name: "list_event_listeners".to_string(),
            description: "List all current event listeners".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
        ToolInfo {
            name: "add_event_listener".to_string(),
            description: "Add an event listener for incoming Socket.IO events".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "event_name": {
                        "type": "string",
                        "description": "The event name to listen for"
                    }
                },
                "required": ["event_name"]
            }),
        },
        ToolInfo {
            name: "remove_event_listener".to_string(),
            description: "Remove an event listener".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "event_name": {
                        "type": "string",
                        "description": "The event name to stop listening for"
                    }
                },
                "required": ["event_name"]
            }),
        },
    ]
}

// ============================================================================
// Tool Execution
// ============================================================================

async fn execute_tool(socket: &SocketManager, name: &str, args: &Value) -> Result<Value, String> {
    match name {
        "list_connections" => {
            let rows = db::list_connections().map_err(|e| e.to_string())?;
            let connections: Vec<Value> = rows
                .into_iter()
                .map(|(id, name, url, namespace, _, _, _, _, _, _)| {
                    json!({
                        "id": id,
                        "name": name,
                        "url": url,
                        "namespace": namespace
                    })
                })
                .collect();
            Ok(json!({ "connections": connections }))
        }

        "get_connection_status" => Ok(json!({
            "status": socket.get_status(),
            "current_connection_id": socket.get_current_connection_id()
        })),

        "connect" => {
            let connection_id = args
                .get("connection_id")
                .and_then(|v| v.as_i64())
                .ok_or("connection_id is required")?;

            socket.reset_connecting_flag();
            let socket_clone = socket.clone();

            let result = tokio::time::timeout(
                std::time::Duration::from_secs(10),
                tokio::task::spawn_blocking(move || socket_clone.connect(connection_id)),
            )
            .await
            .map_err(|_| "Connection timeout".to_string())?
            .map_err(|e| format!("Task error: {}", e))?;

            match result {
                Ok(()) => Ok(json!({ "ok": true, "message": "Connection initiated" })),
                Err(e) => {
                    socket.reset_connecting_flag();
                    Err(e)
                }
            }
        }

        "disconnect" => {
            socket.disconnect("mcp")?;
            Ok(json!({ "ok": true, "message": "Disconnected" }))
        }

        "send_message" => {
            let event_name = args
                .get("event_name")
                .and_then(|v| v.as_str())
                .ok_or("event_name is required")?;
            let payload = args
                .get("payload")
                .and_then(|v| v.as_str())
                .ok_or("payload is required")?;

            socket
                .emit_message_async(event_name.to_string(), payload.to_string())
                .await?;

            if let Some(connection_id) = socket.get_current_connection_id()
                && let Err(e) = db::add_emit_log(connection_id, event_name, payload)
            {
                log::warn!("Failed to save emit log: {}", e);
            }

            Ok(json!({ "ok": true, "message": "Message sent" }))
        }

        "get_recent_events" => {
            let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(50) as usize;
            let events: Vec<Value> = socket
                .list_buffered_events(limit)
                .into_iter()
                .map(|e| {
                    json!({
                        "event_name": e.event_name,
                        "payload": e.payload,
                        "timestamp": e.timestamp,
                        "direction": e.direction
                    })
                })
                .collect();
            Ok(json!({ "events": events }))
        }

        "list_event_listeners" => {
            let connection_id = socket.get_current_connection_id();
            let in_memory = socket.list_listeners();

            let persisted: std::collections::HashSet<String> = if let Some(conn_id) = connection_id
            {
                db::list_connection_events(conn_id)
                    .map_err(|e| e.to_string())?
                    .into_iter()
                    .filter(|(_, _, is_listening)| *is_listening)
                    .map(|(_, name, _)| name)
                    .collect()
            } else {
                std::collections::HashSet::new()
            };

            let listeners: Vec<Value> = in_memory
                .into_iter()
                .map(|name| {
                    json!({
                        "event_name": name.clone(),
                        "persisted": persisted.contains(&name)
                    })
                })
                .collect();

            Ok(json!({ "listeners": listeners, "connection_id": connection_id }))
        }

        "add_event_listener" => {
            let event_name = args
                .get("event_name")
                .and_then(|v| v.as_str())
                .ok_or("event_name is required")?
                .trim();

            if event_name.is_empty() {
                return Err("Event name cannot be empty".to_string());
            }

            socket.add_listener(event_name)?;

            let mut persisted = false;
            if let Some(connection_id) = socket.get_current_connection_id() {
                let existing =
                    db::list_connection_events(connection_id).map_err(|e| e.to_string())?;
                let already_exists = existing.iter().any(|(_, name, _)| name == event_name);

                if !already_exists {
                    db::add_connection_event(connection_id, event_name)
                        .map_err(|e| e.to_string())?;
                    persisted = true;
                } else if let Some((id, _, is_listening)) =
                    existing.iter().find(|(_, name, _)| name == event_name)
                {
                    if !is_listening {
                        db::toggle_connection_event(*id, true).map_err(|e| e.to_string())?;
                    }
                    persisted = true;
                }
            }

            let message = if persisted {
                "Listener added and persisted"
            } else {
                "Listener added (not persisted)"
            };
            Ok(json!({ "ok": true, "message": message }))
        }

        "remove_event_listener" => {
            let event_name = args
                .get("event_name")
                .and_then(|v| v.as_str())
                .ok_or("event_name is required")?
                .trim();

            socket.remove_listener(event_name);

            if let Some(connection_id) = socket.get_current_connection_id() {
                let existing =
                    db::list_connection_events(connection_id).map_err(|e| e.to_string())?;
                if let Some((id, _, is_listening)) =
                    existing.iter().find(|(_, name, _)| name == event_name)
                    && *is_listening
                {
                    db::toggle_connection_event(*id, false).map_err(|e| e.to_string())?;
                }
            }

            Ok(json!({ "ok": true, "message": "Listener removed" }))
        }

        _ => Err(format!("Unknown tool: {}", name)),
    }
}

// ============================================================================
// HTTP Handlers
// ============================================================================

async fn handle_sse(
    State(state): State<McpAppState>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, std::convert::Infallible>>> {
    let rx = state.sse_tx.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|result| match result {
        Ok(data) => Some(Ok(Event::default().data(data))),
        Err(_) => None,
    });

    Sse::new(stream).keep_alive(KeepAlive::default())
}

async fn handle_message(
    State(state): State<McpAppState>,
    Json(request): Json<JsonRpcRequest>,
) -> impl IntoResponse {
    let response = process_request(&state, request).await;
    let response_json = serde_json::to_string(&response).unwrap_or_default();

    // Send response through SSE channel for SSE clients
    let _ = state.sse_tx.send(response_json);

    // Also return response directly in HTTP body for simple clients
    (StatusCode::OK, Json(response))
}

async fn process_request(state: &McpAppState, request: JsonRpcRequest) -> JsonRpcResponse {
    let id = request.id.clone().unwrap_or(Value::Null);

    match request.method.as_str() {
        "initialize" => JsonRpcResponse::success(
            id,
            json!({
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {
                    "tools": { "listChanged": false }
                },
                "serverInfo": {
                    "name": "socket-io-client-mcp",
                    "version": "0.1.0"
                }
            }),
        ),

        "notifications/initialized" => {
            // Just acknowledge, no response needed for notifications
            JsonRpcResponse::success(id, json!({}))
        }

        "tools/list" => {
            let tools = get_tools();
            JsonRpcResponse::success(id, json!({ "tools": tools }))
        }

        "tools/call" => {
            let tool_name = request.params.get("name").and_then(|v| v.as_str());
            let arguments = request
                .params
                .get("arguments")
                .cloned()
                .unwrap_or(json!({}));

            match tool_name {
                Some(name) => match execute_tool(&state.socket, name, &arguments).await {
                    Ok(result) => {
                        let result_text = serde_json::to_string_pretty(&result).unwrap_or_default();
                        JsonRpcResponse::success(
                            id,
                            json!({
                                "content": [{
                                    "type": "text",
                                    "text": result_text
                                }]
                            }),
                        )
                    }
                    Err(e) => JsonRpcResponse::success(
                        id,
                        json!({
                            "content": [{
                                "type": "text",
                                "text": e
                            }],
                            "isError": true
                        }),
                    ),
                },
                None => JsonRpcResponse::error(id, -32602, "Missing tool name"),
            }
        }

        "ping" => JsonRpcResponse::success(id, json!({})),

        _ => {
            // For notifications (no id), just ignore
            if request.id.is_none() {
                JsonRpcResponse::success(Value::Null, json!({}))
            } else {
                JsonRpcResponse::error(id, -32601, &format!("Method not found: {}", request.method))
            }
        }
    }
}

// ============================================================================
// Tauri State & Commands
// ============================================================================

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub status: String,
    pub port: Option<u16>,
    pub message: Option<String>,
}

pub struct McpServerState {
    status: Mutex<McpStatus>,
    handle: Mutex<Option<JoinHandle<()>>>,
    shutdown_tx: Mutex<Option<watch::Sender<bool>>>,
}

impl McpServerState {
    pub fn new() -> Self {
        Self {
            status: Mutex::new(McpStatus {
                status: "stopped".to_string(),
                port: None,
                message: None,
            }),
            handle: Mutex::new(None),
            shutdown_tx: Mutex::new(None),
        }
    }

    fn update_status(&self, status: &str, port: Option<u16>, message: Option<String>) {
        if let Ok(mut guard) = self.status.lock() {
            guard.status = status.to_string();
            guard.port = port;
            guard.message = message;
        }
    }

    fn get_status(&self) -> McpStatus {
        self.status
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or(McpStatus {
                status: "unknown".to_string(),
                port: None,
                message: None,
            })
    }

    fn is_running(&self) -> bool {
        self.status
            .lock()
            .map(|guard| guard.status == "running")
            .unwrap_or(false)
    }
}

#[tauri::command]
pub async fn start_mcp_server(
    port: u16,
    mcp_state: tauri::State<'_, McpServerState>,
    socket_state: tauri::State<'_, SocketManager>,
) -> Result<McpStatus, String> {
    if mcp_state.is_running() {
        return Err("MCP server already running".to_string());
    }

    let (sse_tx, _) = broadcast::channel::<String>(100);
    let (shutdown_tx, mut shutdown_rx) = watch::channel(false);

    let app_state = McpAppState {
        socket: socket_state.inner().clone(),
        sse_tx,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE, header::ACCEPT]);

    let app = Router::new()
        .route("/sse", get(handle_sse))
        .route("/sse", post(handle_message))
        .route("/message", post(handle_message))
        .layer(cors)
        .with_state(app_state);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| e.to_string())?;

    let server_handle = tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.changed().await;
            })
            .await
            .ok();
    });

    if let Ok(mut guard) = mcp_state.shutdown_tx.lock() {
        *guard = Some(shutdown_tx);
    }
    if let Ok(mut guard) = mcp_state.handle.lock() {
        *guard = Some(server_handle);
    }

    mcp_state.update_status("running", Some(port), None);
    log::info!("MCP HTTP server started on port {}", port);

    Ok(mcp_state.get_status())
}

#[tauri::command]
pub async fn stop_mcp_server(
    mcp_state: tauri::State<'_, McpServerState>,
) -> Result<McpStatus, String> {
    if let Ok(mut guard) = mcp_state.shutdown_tx.lock()
        && let Some(tx) = guard.take()
    {
        let _ = tx.send(true);
    }

    if let Ok(mut guard) = mcp_state.handle.lock()
        && let Some(handle) = guard.take()
    {
        handle.abort();
    }

    mcp_state.update_status("stopped", None, None);
    log::info!("MCP HTTP server stopped");

    Ok(mcp_state.get_status())
}

#[tauri::command]
pub fn get_mcp_status(mcp_state: tauri::State<'_, McpServerState>) -> Result<McpStatus, String> {
    Ok(mcp_state.get_status())
}

// ============================================================================
// Shell Command Execution
// ============================================================================

#[derive(Debug, Serialize)]
pub struct ShellOutput {
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Serialize)]
pub struct ClaudeCheckResult {
    pub installed: bool,
    pub version: Option<String>,
    pub path: Option<String>,
}

/// Check if Claude CLI is installed and get its version
#[tauri::command]
pub async fn check_claude_cli() -> Result<ClaudeCheckResult, String> {
    // First check if claude exists using 'which' (macOS/Linux) or 'where' (Windows)
    #[cfg(target_os = "windows")]
    let which_cmd = "where";
    #[cfg(not(target_os = "windows"))]
    let which_cmd = "which";

    let path_output = tokio::process::Command::new(which_cmd)
        .arg("claude")
        .output()
        .await;

    let path = match path_output {
        Ok(output) if output.status.success() => {
            Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
        }
        _ => None,
    };

    if path.is_none() {
        return Ok(ClaudeCheckResult {
            installed: false,
            version: None,
            path: None,
        });
    }

    // Get version
    let version_output = tokio::process::Command::new("claude")
        .arg("--version")
        .output()
        .await;

    let version = match version_output {
        Ok(output) if output.status.success() => {
            Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
        }
        _ => None,
    };

    Ok(ClaudeCheckResult {
        installed: true,
        version,
        path,
    })
}

/// Run the Claude MCP add command to register socket-io-client as an MCP server
#[tauri::command]
pub async fn run_claude_mcp_add(port: u16) -> Result<ShellOutput, String> {
    let url = format!("http://localhost:{}/sse", port);

    // Get home directory
    let home_dir = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Failed to get home directory")?;

    let output = tokio::process::Command::new("claude")
        .args([
            "mcp",
            "add",
            "--transport",
            "http",
            "socket-io-client",
            &url,
        ])
        .current_dir(&home_dir)
        .output()
        .await
        .map_err(|e| format!("Failed to execute claude command: {}", e))?;

    Ok(ShellOutput {
        code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}
