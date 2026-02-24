mod commands;
mod menu;

use tauri::{Emitter, Manager};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::write_file,
            commands::resolve_base_url,
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

            // Check for file argument (open with / file association)
            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 {
                let file_path = &args[1];
                if std::path::Path::new(file_path).exists() {
                    let handle_clone = handle.clone();
                    let file_path = file_path.clone();
                    // Emit after a short delay to ensure frontend is ready
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        let _ = handle_clone.emit("open-file", file_path);
                    });
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
