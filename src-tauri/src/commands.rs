use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub appearance: String,
    pub zoom_level: f64,
    pub editor_font_size: f64,
    pub view_mode: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            appearance: "system".into(),
            zoom_level: 1.0,
            editor_font_size: 14.0,
            view_mode: "view".into(),
        }
    }
}

fn settings_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    dir.join("settings.json")
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn write_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, &contents).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
pub fn resolve_base_url(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    let parent = path
        .parent()
        .ok_or_else(|| "No parent directory".to_string())?;
    Ok(parent.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> AppSettings {
    let path = settings_path(&app);
    if path.exists() {
        if let Ok(data) = fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str(&data) {
                return settings;
            }
        }
    }
    AppSettings::default()
}

#[tauri::command]
pub fn save_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = settings_path(&app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {}", e))?;
    }
    let json =
        serde_json::to_string_pretty(&settings).map_err(|e| format!("Serialize error: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Failed to save settings: {}", e))
}
