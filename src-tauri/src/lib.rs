mod commands;
mod menu;

use std::path::PathBuf;
use tauri::Manager;

pub fn run() {
    let startup_file = std::env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .and_then(|path| path.canonicalize().ok())
        .map(|path| path.to_string_lossy().into_owned());

    tauri::Builder::default()
        .manage(commands::PendingStartupFile::new(startup_file))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::write_file,
            commands::resolve_base_url,
            commands::take_startup_file,
            commands::sibling_markdown_file,
            commands::get_settings,
            commands::save_settings,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let menu = menu::build_menu(&handle)?;

            // Set menu on the main window
            if let Some(window) = app.get_webview_window("main") {
                window.set_menu(menu)?;
            }

            menu::setup_menu_events(&handle);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
