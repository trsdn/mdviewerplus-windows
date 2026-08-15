mod commands;
mod folder_tree;
mod menu;

#[cfg(all(feature = "lite", feature = "full"))]
compile_error!("The Lite and Full Cargo features are mutually exclusive.");
#[cfg(not(any(feature = "lite", feature = "full")))]
compile_error!("Build with exactly one of the Lite or Full Cargo features.");

use std::path::PathBuf;
use tauri::Manager;

pub fn run() {
    let startup_file = std::env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .filter(|path| {
            path.is_file()
                && path
                    .extension()
                    .and_then(|extension| extension.to_str())
                    .is_some_and(|extension| {
                        matches!(
                            extension.to_ascii_lowercase().as_str(),
                            "md" | "markdown" | "mdown" | "mkd"
                        )
                    })
        })
        .and_then(|path| path.canonicalize().ok())
        .map(|path| path.to_string_lossy().into_owned());

    tauri::Builder::default()
        .manage(commands::PendingStartupFile::new(startup_file))
        .manage(commands::FolderWatcherState::new())
        .manage(commands::FolderTreeWatcherState::new())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::read_file,
            commands::write_file,
            commands::classify_dropped_paths,
            commands::take_startup_file,
            commands::sibling_markdown_file,
            commands::list_markdown_files,
            commands::resolve_internal_markdown,
            commands::read_local_image,
            commands::open_external_url,
            commands::start_folder_watcher,
            commands::stop_folder_watcher,
            folder_tree::list_folder_children,
            folder_tree::resolve_folder_markdown,
            commands::start_folder_tree_watcher,
            commands::stop_folder_tree_watcher,
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
