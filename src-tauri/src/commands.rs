use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default)]
pub struct AppSettings {
    pub appearance: String,
    #[serde(default = "default_light_theme")]
    pub light_theme: String,
    #[serde(default = "default_dark_theme")]
    pub dark_theme: String,
    pub zoom_level: f64,
    pub editor_font_size: f64,
    pub view_mode: String,
}

fn default_light_theme() -> String {
    "github-light".into()
}

fn default_dark_theme() -> String {
    "github-dark".into()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            appearance: "system".into(),
            light_theme: default_light_theme(),
            dark_theme: default_dark_theme(),
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

#[cfg(test)]
mod tests {
    use super::AppSettings;

    #[test]
    fn old_settings_json_receives_theme_defaults() {
        let json = r#"{
            "appearance": "dark",
            "zoom_level": 1.25,
            "editor_font_size": 16.0,
            "view_mode": "split"
        }"#;

        let settings: AppSettings = serde_json::from_str(json).unwrap();

        assert_eq!(settings.appearance, "dark");
        assert_eq!(settings.light_theme, "github-light");
        assert_eq!(settings.dark_theme, "github-dark");
        assert_eq!(settings.zoom_level, 1.25);
        assert_eq!(settings.editor_font_size, 16.0);
        assert_eq!(settings.view_mode, "split");
    }

    #[test]
    fn appearance_only_settings_remain_compatible() {
        let settings: AppSettings =
            serde_json::from_str(r#"{"appearance":"light"}"#).unwrap();

        assert_eq!(settings.appearance, "light");
        assert_eq!(settings.light_theme, "github-light");
        assert_eq!(settings.dark_theme, "github-dark");
        assert_eq!(settings.zoom_level, 1.0);
        assert_eq!(settings.editor_font_size, 14.0);
        assert_eq!(settings.view_mode, "view");
    }

    #[test]
    fn new_settings_json_preserves_selected_palettes() {
        let json = r#"{
            "appearance": "system",
            "light_theme": "sepia",
            "dark_theme": "nord",
            "zoom_level": 0.9,
            "editor_font_size": 13.0,
            "view_mode": "edit"
        }"#;

        let settings: AppSettings = serde_json::from_str(json).unwrap();
        assert_eq!(settings.light_theme, "sepia");
        assert_eq!(settings.dark_theme, "nord");

        let round_trip = serde_json::to_string(&settings).unwrap();
        let decoded: AppSettings = serde_json::from_str(&round_trip).unwrap();
        assert_eq!(decoded, settings);
    }
}
