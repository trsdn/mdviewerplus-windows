use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;

pub struct PendingStartupFile(Mutex<Option<String>>);

impl PendingStartupFile {
    pub fn new(path: Option<String>) -> Self {
        Self(Mutex::new(path))
    }

    fn take(&self) -> Result<Option<String>, String> {
        self.0
            .lock()
            .map_err(|_| "Could not access the pending startup file.".to_string())
            .map(|mut path| path.take())
    }
}

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
pub fn take_startup_file(
    pending_file: tauri::State<'_, PendingStartupFile>,
) -> Result<Option<String>, String> {
    pending_file.take()
}

#[derive(Deserialize, Clone, Copy, Debug)]
#[serde(rename_all = "lowercase")]
pub enum NavigationDirection {
    Previous,
    Next,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "code", content = "message", rename_all = "snake_case")]
pub enum NavigationError {
    InvalidCurrentFile(String),
    CannotReadDirectory(String),
    CannotReadEntry(String),
    CurrentFileNotFound(String),
}

fn is_markdown_file_name(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "mdown" | "mkd"
            )
        })
}

fn compare_file_names(left: &Path, right: &Path) -> Ordering {
    let left_name = left.file_name().unwrap_or_default().to_string_lossy();
    let right_name = right.file_name().unwrap_or_default().to_string_lossy();

    left_name
        .to_lowercase()
        .cmp(&right_name.to_lowercase())
        .then_with(|| left_name.cmp(&right_name))
        .then_with(|| left.cmp(right))
}

fn is_hidden_entry(entry: &fs::DirEntry) -> Result<bool, NavigationError> {
    if entry.file_name().to_string_lossy().starts_with('.') {
        return Ok(true);
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
        let metadata = entry.metadata().map_err(|error| {
            NavigationError::CannotReadEntry(format!(
                "Could not inspect hidden attributes for '{}': {error}",
                entry.path().display()
            ))
        })?;
        return Ok(metadata.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0);
    }

    #[cfg(not(windows))]
    Ok(false)
}

fn markdown_files_in_directory(directory: &Path) -> Result<Vec<PathBuf>, NavigationError> {
    let entries = fs::read_dir(directory).map_err(|error| {
        NavigationError::CannotReadDirectory(format!(
            "Could not read '{}': {error}",
            directory.display()
        ))
    })?;
    let mut files = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|error| {
            NavigationError::CannotReadEntry(format!(
                "Could not read an entry in '{}': {error}",
                directory.display()
            ))
        })?;
        if is_hidden_entry(&entry)? {
            continue;
        }
        let file_type = entry.file_type().map_err(|error| {
            NavigationError::CannotReadEntry(format!(
                "Could not inspect '{}': {error}",
                entry.path().display()
            ))
        })?;
        if file_type.is_file() && is_markdown_file_name(&entry.path()) {
            files.push(entry.path());
        }
    }

    files.sort_by(|left, right| compare_file_names(left, right));
    Ok(files)
}

fn sibling_markdown_path(
    current_path: &Path,
    direction: NavigationDirection,
) -> Result<Option<PathBuf>, NavigationError> {
    let current_path = current_path.canonicalize().map_err(|error| {
        NavigationError::InvalidCurrentFile(format!(
            "Could not resolve current file '{}': {error}",
            current_path.display()
        ))
    })?;
    if !current_path.is_file() {
        return Err(NavigationError::InvalidCurrentFile(format!(
            "'{}' is not a regular file.",
            current_path.display()
        )));
    }
    let directory = current_path.parent().ok_or_else(|| {
        NavigationError::InvalidCurrentFile(format!(
            "'{}' has no parent directory.",
            current_path.display()
        ))
    })?;
    let files = markdown_files_in_directory(directory)?;
    let current_index = files
        .iter()
        .position(|path| path == &current_path)
        .ok_or_else(|| {
            NavigationError::CurrentFileNotFound(format!(
                "'{}' is not a visible Markdown file in its directory.",
                current_path.display()
            ))
        })?;

    let sibling_index = match direction {
        NavigationDirection::Previous => current_index.checked_sub(1),
        NavigationDirection::Next if current_index + 1 < files.len() => Some(current_index + 1),
        NavigationDirection::Next => None,
    };
    Ok(sibling_index.map(|index| files[index].clone()))
}

#[tauri::command]
pub fn sibling_markdown_file(
    current_path: String,
    direction: NavigationDirection,
) -> Result<Option<String>, NavigationError> {
    sibling_markdown_path(Path::new(&current_path), direction)
        .map(|path| path.map(|path| path.to_string_lossy().into_owned()))
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
    use super::{
        compare_file_names, markdown_files_in_directory, sibling_markdown_path, AppSettings,
        NavigationDirection, NavigationError, PendingStartupFile,
    };
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "mdviewerplus-navigation-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }

        fn file(&self, name: &str) -> PathBuf {
            let path = self.0.join(name);
            fs::write(&path, name).unwrap();
            path
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

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
        let settings: AppSettings = serde_json::from_str(r#"{"appearance":"light"}"#).unwrap();

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

    #[test]
    fn pending_startup_file_is_delivered_exactly_once() {
        let pending = PendingStartupFile::new(Some("/notes/startup.md".into()));

        assert_eq!(pending.take().unwrap(), Some("/notes/startup.md".into()));
        assert_eq!(pending.take().unwrap(), None);
    }

    #[test]
    fn markdown_enumeration_filters_and_orders_deterministically() {
        let directory = TestDirectory::new();
        for name in ["b.markdown", "a.md", "c.mdown", "d.MkD"] {
            directory.file(name);
        }
        directory.file(".hidden.md");
        directory.file("notes.txt");
        fs::create_dir(directory.path().join("folder.md")).unwrap();

        let names: Vec<String> = markdown_files_in_directory(directory.path())
            .unwrap()
            .into_iter()
            .map(|path| path.file_name().unwrap().to_string_lossy().into_owned())
            .collect();

        assert_eq!(names, ["a.md", "b.markdown", "c.mdown", "d.MkD"]);
    }

    #[test]
    fn case_insensitive_order_has_a_stable_case_sensitive_tie_break() {
        let mut paths = [
            PathBuf::from("a.md"),
            PathBuf::from("B.md"),
            PathBuf::from("A.MD"),
            PathBuf::from("b.MD"),
        ];
        paths.sort_by(|left, right| compare_file_names(left, right));

        assert_eq!(
            paths,
            [
                PathBuf::from("A.MD"),
                PathBuf::from("a.md"),
                PathBuf::from("B.md"),
                PathBuf::from("b.MD"),
            ]
        );
    }

    #[test]
    fn sibling_navigation_obeys_boundaries_without_wrapping() {
        let directory = TestDirectory::new();
        let first = directory.file("a.md").canonicalize().unwrap();
        let middle = directory.file("b.markdown").canonicalize().unwrap();
        let last = directory.file("c.MKD").canonicalize().unwrap();

        assert_eq!(
            sibling_markdown_path(&first, NavigationDirection::Previous).unwrap(),
            None
        );
        assert_eq!(
            sibling_markdown_path(&first, NavigationDirection::Next).unwrap(),
            Some(middle.clone())
        );
        assert_eq!(
            sibling_markdown_path(&middle, NavigationDirection::Previous).unwrap(),
            Some(first)
        );
        assert_eq!(
            sibling_markdown_path(&middle, NavigationDirection::Next).unwrap(),
            Some(last.clone())
        );
        assert_eq!(
            sibling_markdown_path(&last, NavigationDirection::Next).unwrap(),
            None
        );
    }

    #[test]
    fn sibling_navigation_rejects_non_markdown_and_missing_current_files() {
        let directory = TestDirectory::new();
        let text_file = directory.file("notes.txt");
        let missing = directory.path().join("missing.md");

        assert!(matches!(
            sibling_markdown_path(&text_file, NavigationDirection::Next),
            Err(NavigationError::CurrentFileNotFound(_))
        ));
        assert!(matches!(
            sibling_markdown_path(&missing, NavigationDirection::Next),
            Err(NavigationError::InvalidCurrentFile(_))
        ));
    }
}
