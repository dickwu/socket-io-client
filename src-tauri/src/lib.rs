use std::path::PathBuf;
use tauri::{
    Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

mod connection;
mod db;
mod emit_log;
mod mcp_server;
mod pinned;
mod socket_client;

const APP_NAME: &str = "Socket.IO Client";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const APP_DESCRIPTION: &str = "A desktop application for testing Socket.IO connections.";
const APP_LICENSE: &str = "MIT";
const APP_COPYRIGHT: &str = "© 2025";

fn show_about_dialog<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let about_message = format!(
        "{}\n\nVersion: {}\nLicense: {}\n{}",
        APP_DESCRIPTION, APP_VERSION, APP_LICENSE, APP_COPYRIGHT
    );

    app.dialog()
        .message(&about_message)
        .title(APP_NAME)
        .buttons(MessageDialogButtons::Ok)
        .show(|_| {});
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Initialize database in app data directory
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;
            std::fs::create_dir_all(&app_data_dir)
                .map_err(|e| format!("Failed to create app data dir: {}", e))?;

            let db_path: PathBuf = app_data_dir.join("socket-io-client.db");
            db::init_db(&db_path).map_err(|e| format!("Failed to initialize database: {}", e))?;

            app.manage(socket_client::SocketManager::new(app.handle().clone()));
            app.manage(mcp_server::McpServerState::new());

            // Setup custom application menu (macOS menu bar)
            #[cfg(target_os = "macos")]
            {
                let app_menu_about = MenuItem::with_id(
                    app,
                    "app_about",
                    "About Socket.IO Client",
                    true,
                    None::<&str>,
                )?;
                let separator = PredefinedMenuItem::separator(app)?;
                let hide = PredefinedMenuItem::hide(app, Some("Hide"))?;
                let hide_others = PredefinedMenuItem::hide_others(app, Some("Hide Others"))?;
                let show_all = PredefinedMenuItem::show_all(app, Some("Show All"))?;
                let separator2 = PredefinedMenuItem::separator(app)?;
                let quit = PredefinedMenuItem::quit(app, Some("Quit"))?;

                let app_submenu = Submenu::with_items(
                    app,
                    "Socket.IO Client",
                    true,
                    &[
                        &app_menu_about,
                        &separator,
                        &hide,
                        &hide_others,
                        &show_all,
                        &separator2,
                        &quit,
                    ],
                )?;

                let edit_menu = Submenu::with_items(
                    app,
                    "Edit",
                    true,
                    &[
                        &PredefinedMenuItem::undo(app, Some("Undo"))?,
                        &PredefinedMenuItem::redo(app, Some("Redo"))?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::cut(app, Some("Cut"))?,
                        &PredefinedMenuItem::copy(app, Some("Copy"))?,
                        &PredefinedMenuItem::paste(app, Some("Paste"))?,
                        &PredefinedMenuItem::select_all(app, Some("Select All"))?,
                    ],
                )?;

                let window_menu = Submenu::with_items(
                    app,
                    "Window",
                    true,
                    &[
                        &PredefinedMenuItem::minimize(app, Some("Minimize"))?,
                        &PredefinedMenuItem::maximize(app, Some("Zoom"))?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::close_window(app, Some("Close"))?,
                    ],
                )?;

                let app_menu = Menu::with_items(app, &[&app_submenu, &edit_menu, &window_menu])?;
                app.set_menu(app_menu)?;

                app.on_menu_event(|app, event| {
                    if event.id.as_ref() == "app_about" {
                        show_about_dialog(app);
                    }
                });
            }

            // Setup system tray
            let about_item = MenuItem::with_id(app, "about", "About", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&about_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "about" => {
                        show_about_dialog(app);
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Connection commands
            connection::create_connection,
            connection::update_connection,
            connection::delete_connection,
            connection::list_connections,
            connection::get_connection,
            connection::add_connection_event,
            connection::remove_connection_event,
            connection::toggle_connection_event,
            connection::list_connection_events,
            connection::set_current_connection,
            connection::get_current_connection,
            connection::set_connection_auto_send,
            // Emit log commands
            emit_log::add_emit_log,
            emit_log::list_emit_logs,
            emit_log::clear_emit_logs,
            // Event history commands
            emit_log::list_event_history,
            emit_log::clear_event_history,
            // Pinned message commands
            pinned::add_pinned_message,
            pinned::update_pinned_message,
            pinned::delete_pinned_message,
            pinned::reorder_pinned_messages,
            pinned::list_pinned_messages,
            pinned::toggle_pinned_auto_send,
            pinned::list_auto_send_messages,
            pinned::find_duplicate_pinned_message,
            // Socket commands
            socket_client::socket_connect,
            socket_client::socket_set_active,
            socket_client::socket_clear_active,
            socket_client::socket_get_all_statuses,
            socket_client::socket_disconnect,
            socket_client::socket_emit,
            socket_client::socket_add_listener,
            socket_client::socket_remove_listener,
            // MCP server commands
            mcp_server::start_mcp_server,
            mcp_server::stop_mcp_server,
            mcp_server::get_mcp_status,
            mcp_server::check_claude_cli,
            mcp_server::run_claude_mcp_add,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
