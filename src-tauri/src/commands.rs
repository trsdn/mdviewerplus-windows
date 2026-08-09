use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use percent_encoding::percent_decode_str;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::{mpsc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};
use url::Url;

const MAX_DOCUMENT_BYTES: u64 = 16 * 1024 * 1024;
const MAX_IMAGE_BYTES: u64 = 24 * 1024 * 1024;
const WATCH_DEBOUNCE: Duration = Duration::from_millis(180);

pub struct PendingStartupFile(Mutex<Option<String>>);

impl PendingStartupFile {
    pub fn new(path: Option<String>) -> Self {
        Self(Mutex::new(path))
    }

    fn take(&self) -> Result<Option<String>, ResourceError> {
        self.0
            .lock()
            .map_err(|_| ResourceError::State("Could not access the pending startup file.".into()))
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

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "code", content = "message", rename_all = "snake_case")]
pub enum ResourceError {
    InvalidPath(String),
    UnsupportedType(String),
    OutsideFolder(String),
    TooLarge(String),
    CannotRead(String),
    CannotWrite(String),
    CannotWatch(String),
    InvalidUrl(String),
    State(String),
}

impl std::fmt::Display for ResourceError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let message = match self {
            Self::InvalidPath(message)
            | Self::UnsupportedType(message)
            | Self::OutsideFolder(message)
            | Self::TooLarge(message)
            | Self::CannotRead(message)
            | Self::CannotWrite(message)
            | Self::CannotWatch(message)
            | Self::InvalidUrl(message)
            | Self::State(message) => message,
        };
        formatter.write_str(message)
    }
}

#[derive(Deserialize, Clone, Copy, Debug)]
#[serde(rename_all = "lowercase")]
pub enum NavigationDirection {
    Previous,
    Next,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct MarkdownFile {
    pub name: String,
    pub path: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct ImagePayload {
    pub base64: String,
    pub mime: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct FolderChanged {
    generation: u64,
}

enum WatcherMessage {
    Event(Event),
    Stop,
}

struct ActiveWatcher {
    directory: PathBuf,
    watcher: RecommendedWatcher,
    sender: mpsc::Sender<WatcherMessage>,
    worker: Option<thread::JoinHandle<()>>,
}

impl ActiveWatcher {
    fn stop(mut self) {
        let _ = self.watcher.unwatch(&self.directory);
        let _ = self.sender.send(WatcherMessage::Stop);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

struct WatcherInner {
    next_generation: u64,
    active: Option<ActiveWatcher>,
}

pub struct FolderWatcherState(Mutex<WatcherInner>);

impl FolderWatcherState {
    pub fn new() -> Self {
        Self(Mutex::new(WatcherInner {
            next_generation: 0,
            active: None,
        }))
    }

    fn stop(&self) -> Result<(), ResourceError> {
        let active = self
            .0
            .lock()
            .map_err(|_| ResourceError::State("Could not access the folder watcher.".into()))?
            .active
            .take();
        if let Some(active) = active {
            active.stop();
        }
        Ok(())
    }
}

impl Drop for FolderWatcherState {
    fn drop(&mut self) {
        if let Ok(inner) = self.0.get_mut() {
            if let Some(active) = inner.active.take() {
                active.stop();
            }
        }
    }
}

fn settings_path(app: &tauri::AppHandle) -> PathBuf {
    let directory = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    directory.join("settings.json")
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

fn image_mime(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("png") => Some("image/png"),
        Some("jpg" | "jpeg") => Some("image/jpeg"),
        Some("gif") => Some("image/gif"),
        Some("webp") => Some("image/webp"),
        Some("bmp") => Some("image/bmp"),
        Some("ico") => Some("image/x-icon"),
        Some("avif") => Some("image/avif"),
        _ => None,
    }
}

fn canonical_regular_file(path: &Path) -> Result<PathBuf, ResourceError> {
    let canonical = path.canonicalize().map_err(|error| {
        ResourceError::InvalidPath(format!("Could not resolve '{}': {error}", path.display()))
    })?;
    let metadata = fs::metadata(&canonical).map_err(|error| {
        ResourceError::CannotRead(format!(
            "Could not inspect '{}': {error}",
            canonical.display()
        ))
    })?;
    if !metadata.is_file() {
        return Err(ResourceError::InvalidPath(format!(
            "'{}' is not a regular file.",
            canonical.display()
        )));
    }
    Ok(canonical)
}

fn canonical_markdown_file(path: &Path) -> Result<PathBuf, ResourceError> {
    let canonical = canonical_regular_file(path)?;
    if !is_markdown_file_name(&canonical) {
        return Err(ResourceError::UnsupportedType(
            "Only Markdown documents can be opened.".into(),
        ));
    }
    Ok(canonical)
}

fn ensure_bounded_file(path: &Path, maximum: u64) -> Result<(), ResourceError> {
    let size = fs::metadata(path)
        .map_err(|error| {
            ResourceError::CannotRead(format!("Could not inspect '{}': {error}", path.display()))
        })?
        .len();
    if size > maximum {
        return Err(ResourceError::TooLarge(format!(
            "'{}' exceeds the supported size limit.",
            path.display()
        )));
    }
    Ok(())
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

fn is_hidden_entry(entry: &fs::DirEntry) -> Result<bool, ResourceError> {
    if entry.file_name().to_string_lossy().starts_with('.') {
        return Ok(true);
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
        let metadata = entry.metadata().map_err(|error| {
            ResourceError::CannotRead(format!(
                "Could not inspect hidden attributes for '{}': {error}",
                entry.path().display()
            ))
        })?;
        Ok(metadata.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0)
    }

    #[cfg(not(windows))]
    Ok(false)
}

fn markdown_files_in_directory(directory: &Path) -> Result<Vec<PathBuf>, ResourceError> {
    let entries = fs::read_dir(directory).map_err(|error| {
        ResourceError::CannotRead(format!("Could not read '{}': {error}", directory.display()))
    })?;
    let mut files = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|error| {
            ResourceError::CannotRead(format!(
                "Could not read an entry in '{}': {error}",
                directory.display()
            ))
        })?;
        if is_hidden_entry(&entry)? {
            continue;
        }
        let file_type = entry.file_type().map_err(|error| {
            ResourceError::CannotRead(format!(
                "Could not inspect '{}': {error}",
                entry.path().display()
            ))
        })?;
        if file_type.is_file() && is_markdown_file_name(&entry.path()) {
            files.push(entry.path().canonicalize().map_err(|error| {
                ResourceError::CannotRead(format!(
                    "Could not resolve '{}': {error}",
                    entry.path().display()
                ))
            })?);
        }
    }

    files.sort_by(|left, right| compare_file_names(left, right));
    Ok(files)
}

fn sibling_markdown_path(
    current_path: &Path,
    direction: NavigationDirection,
) -> Result<Option<PathBuf>, ResourceError> {
    let current_path = canonical_markdown_file(current_path)?;
    let directory = current_path.parent().ok_or_else(|| {
        ResourceError::InvalidPath(format!(
            "'{}' has no parent directory.",
            current_path.display()
        ))
    })?;
    let files = markdown_files_in_directory(directory)?;
    let current_index = files
        .iter()
        .position(|path| path == &current_path)
        .ok_or_else(|| {
            ResourceError::InvalidPath(format!(
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

fn has_valid_percent_encoding(value: &str) -> bool {
    let bytes = value.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len()
                || !bytes[index + 1].is_ascii_hexdigit()
                || !bytes[index + 2].is_ascii_hexdigit()
            {
                return false;
            }
            index += 3;
        } else {
            index += 1;
        }
    }
    true
}

fn decode_confined_relative_path(value: &str) -> Result<PathBuf, ResourceError> {
    if value.is_empty()
        || value.len() > 1024
        || value.contains('\\')
        || value.contains('?')
        || value.contains('#')
        || value.chars().any(char::is_control)
        || value.to_ascii_lowercase().contains("%2f")
        || value.to_ascii_lowercase().contains("%5c")
        || !has_valid_percent_encoding(value)
    {
        return Err(ResourceError::InvalidPath(
            "The relative path is not valid.".into(),
        ));
    }

    let decoded = percent_decode_str(value)
        .decode_utf8()
        .map_err(|_| ResourceError::InvalidPath("The relative path is not valid UTF-8.".into()))?;
    let relative = Path::new(decoded.as_ref());
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(ResourceError::OutsideFolder(
            "The relative path leaves the current document folder.".into(),
        ));
    }
    Ok(relative.to_path_buf())
}

fn resolve_confined_resource(
    current_path: &Path,
    relative_path: &str,
) -> Result<PathBuf, ResourceError> {
    let current = canonical_markdown_file(current_path)?;
    let folder = current.parent().ok_or_else(|| {
        ResourceError::InvalidPath("The current document has no parent folder.".into())
    })?;
    let relative = decode_confined_relative_path(relative_path)?;
    let target = canonical_regular_file(&folder.join(relative))?;
    if !target.starts_with(folder) {
        return Err(ResourceError::OutsideFolder(
            "The requested resource leaves the current document folder.".into(),
        ));
    }
    Ok(target)
}

fn validate_write_path(path: &Path) -> Result<PathBuf, ResourceError> {
    if !is_markdown_file_name(path) {
        return Err(ResourceError::UnsupportedType(
            "Only Markdown documents can be saved.".into(),
        ));
    }
    let file_name = path
        .file_name()
        .ok_or_else(|| ResourceError::InvalidPath("The save path has no file name.".into()))?;
    let parent = path
        .parent()
        .ok_or_else(|| ResourceError::InvalidPath("The save path has no parent folder.".into()))?
        .canonicalize()
        .map_err(|error| {
            ResourceError::InvalidPath(format!(
                "Could not resolve the save folder '{}': {error}",
                path.display()
            ))
        })?;
    let target = parent.join(file_name);
    if let Ok(metadata) = fs::symlink_metadata(&target) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(ResourceError::InvalidPath(
                "The selected save target is not a regular file.".into(),
            ));
        }
    }
    Ok(target)
}

fn watcher_event_is_relevant(event: &Event, directory: &Path) -> bool {
    if matches!(event.kind, EventKind::Access(_)) {
        return false;
    }
    event.paths.iter().any(|path| {
        path.parent().is_some_and(|parent| parent == directory) && is_markdown_file_name(path)
    })
}

fn watcher_worker(
    app: tauri::AppHandle,
    directory: PathBuf,
    generation: u64,
    receiver: mpsc::Receiver<WatcherMessage>,
) {
    while let Ok(message) = receiver.recv() {
        match message {
            WatcherMessage::Stop => return,
            WatcherMessage::Event(event) if watcher_event_is_relevant(&event, &directory) => {
                let deadline = Instant::now() + WATCH_DEBOUNCE;
                loop {
                    let remaining = deadline.saturating_duration_since(Instant::now());
                    match receiver.recv_timeout(remaining) {
                        Ok(WatcherMessage::Stop) => return,
                        Ok(WatcherMessage::Event(_)) => continue,
                        Err(mpsc::RecvTimeoutError::Timeout) => break,
                        Err(mpsc::RecvTimeoutError::Disconnected) => return,
                    }
                }
                let _ = app.emit("folder-changed", FolderChanged { generation });
            }
            WatcherMessage::Event(_) => {}
        }
    }
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, ResourceError> {
    let path = canonical_markdown_file(Path::new(&path))?;
    ensure_bounded_file(&path, MAX_DOCUMENT_BYTES)?;
    fs::read_to_string(&path)
        .map_err(|error| ResourceError::CannotRead(format!("Failed to read the file: {error}")))
}

#[tauri::command]
pub fn write_file(path: String, contents: String) -> Result<(), ResourceError> {
    if contents.len() as u64 > MAX_DOCUMENT_BYTES {
        return Err(ResourceError::TooLarge(
            "The document is too large to save safely.".into(),
        ));
    }
    let path = validate_write_path(Path::new(&path))?;
    fs::write(&path, contents)
        .map_err(|error| ResourceError::CannotWrite(format!("Failed to write the file: {error}")))
}

#[tauri::command]
pub fn take_startup_file(
    pending_file: tauri::State<'_, PendingStartupFile>,
) -> Result<Option<String>, ResourceError> {
    pending_file.take()
}

#[tauri::command]
pub fn sibling_markdown_file(
    current_path: String,
    direction: NavigationDirection,
) -> Result<Option<String>, ResourceError> {
    sibling_markdown_path(Path::new(&current_path), direction)
        .map(|path| path.map(|path| path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn list_markdown_files(current_path: String) -> Result<Vec<MarkdownFile>, ResourceError> {
    let current = canonical_markdown_file(Path::new(&current_path))?;
    let directory = current.parent().ok_or_else(|| {
        ResourceError::InvalidPath("The current document has no parent folder.".into())
    })?;
    markdown_files_in_directory(directory).map(|files| {
        files
            .into_iter()
            .map(|path| MarkdownFile {
                name: path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned(),
                path: path.to_string_lossy().into_owned(),
            })
            .collect()
    })
}

#[tauri::command]
pub fn resolve_internal_markdown(
    current_path: String,
    relative_path: String,
) -> Result<String, ResourceError> {
    let target = resolve_confined_resource(Path::new(&current_path), &relative_path)?;
    if !is_markdown_file_name(&target) {
        return Err(ResourceError::UnsupportedType(
            "Internal links may only open Markdown documents.".into(),
        ));
    }
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn read_local_image(
    current_path: String,
    relative_path: String,
) -> Result<ImagePayload, ResourceError> {
    let target = resolve_confined_resource(Path::new(&current_path), &relative_path)?;
    let mime = image_mime(&target).ok_or_else(|| {
        ResourceError::UnsupportedType("The referenced image type is not supported.".into())
    })?;
    ensure_bounded_file(&target, MAX_IMAGE_BYTES)?;
    let bytes = fs::read(&target).map_err(|error| {
        ResourceError::CannotRead(format!("Could not read '{}': {error}", target.display()))
    })?;
    Ok(ImagePayload {
        base64: BASE64.encode(bytes),
        mime: mime.into(),
    })
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), ResourceError> {
    if url.len() > 4096 || url.chars().any(char::is_control) {
        return Err(ResourceError::InvalidUrl(
            "The external URL is not valid.".into(),
        ));
    }
    let parsed = Url::parse(&url)
        .map_err(|_| ResourceError::InvalidUrl("The external URL is not valid.".into()))?;
    match parsed.scheme() {
        "http" | "https" if parsed.host_str().is_some() => {}
        "mailto" if !parsed.path().is_empty() => {}
        _ => {
            return Err(ResourceError::InvalidUrl(
                "Only HTTP, HTTPS, and mailto links are allowed.".into(),
            ))
        }
    }
    open::that_detached(url)
        .map_err(|error| ResourceError::InvalidUrl(format!("Could not open the URL: {error}")))
}

#[tauri::command]
pub fn start_folder_watcher(
    app: tauri::AppHandle,
    state: tauri::State<'_, FolderWatcherState>,
    current_path: String,
) -> Result<u64, ResourceError> {
    state.stop()?;

    let current = canonical_markdown_file(Path::new(&current_path))?;
    let directory = current
        .parent()
        .ok_or_else(|| ResourceError::InvalidPath("The document has no parent folder.".into()))?
        .to_path_buf();

    let generation = {
        let mut inner = state
            .0
            .lock()
            .map_err(|_| ResourceError::State("Could not access the folder watcher.".into()))?;
        inner.next_generation = inner.next_generation.wrapping_add(1).max(1);
        inner.next_generation
    };

    let (sender, receiver) = mpsc::channel();
    let callback_sender = sender.clone();
    let mut watcher = notify::recommended_watcher(move |result| {
        if let Ok(event) = result {
            let _ = callback_sender.send(WatcherMessage::Event(event));
        }
    })
    .map_err(|error| {
        ResourceError::CannotWatch(format!("Could not create the watcher: {error}"))
    })?;
    watcher
        .watch(&directory, RecursiveMode::NonRecursive)
        .map_err(|error| {
            ResourceError::CannotWatch(format!(
                "Could not watch '{}': {error}",
                directory.display()
            ))
        })?;

    let worker_app = app.clone();
    let worker_directory = directory.clone();
    let worker = thread::Builder::new()
        .name("mdviewer-folder-watcher".into())
        .spawn(move || watcher_worker(worker_app, worker_directory, generation, receiver))
        .map_err(|error| {
            ResourceError::CannotWatch(format!("Could not start the watcher: {error}"))
        })?;

    let mut inner = state
        .0
        .lock()
        .map_err(|_| ResourceError::State("Could not access the folder watcher.".into()))?;
    inner.active = Some(ActiveWatcher {
        directory,
        watcher,
        sender,
        worker: Some(worker),
    });
    Ok(generation)
}

#[tauri::command]
pub fn stop_folder_watcher(
    state: tauri::State<'_, FolderWatcherState>,
) -> Result<(), ResourceError> {
    state.stop()
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
pub fn save_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), ResourceError> {
    let path = settings_path(&app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            ResourceError::CannotWrite(format!("Failed to create the config folder: {error}"))
        })?;
    }
    let json = serde_json::to_string_pretty(&settings)
        .map_err(|error| ResourceError::CannotWrite(format!("Serialize error: {error}")))?;
    fs::write(&path, json)
        .map_err(|error| ResourceError::CannotWrite(format!("Failed to save settings: {error}")))
}

#[cfg(test)]
mod tests {
    use super::{
        compare_file_names, decode_confined_relative_path, image_mime, markdown_files_in_directory,
        resolve_confined_resource, sibling_markdown_path, AppSettings, NavigationDirection,
        PendingStartupFile, ResourceError,
    };
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static NEXT_TEST_DIRECTORY: AtomicU64 = AtomicU64::new(1);

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::current_dir()
                .unwrap()
                .join("target")
                .join("test-work")
                .join(format!(
                    "mdviewerplus-{}-{unique}-{}",
                    std::process::id(),
                    NEXT_TEST_DIRECTORY.fetch_add(1, Ordering::Relaxed)
                ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }

        fn file(&self, name: &str) -> PathBuf {
            let path = self.0.join(name);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).unwrap();
            }
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
        assert_eq!(settings.light_theme, "github-light");
        assert_eq!(settings.dark_theme, "github-dark");
        assert_eq!(settings.view_mode, "split");
    }

    #[test]
    fn appearance_only_settings_remain_compatible() {
        let settings: AppSettings = serde_json::from_str(r#"{"appearance":"light"}"#).unwrap();
        assert_eq!(settings.zoom_level, 1.0);
        assert_eq!(settings.editor_font_size, 14.0);
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
    fn case_insensitive_order_has_a_stable_tie_break() {
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
            sibling_markdown_path(&last, NavigationDirection::Next).unwrap(),
            None
        );
    }

    #[test]
    fn relative_paths_reject_traversal_absolute_queries_and_encoded_separators() {
        for value in [
            "../secret.md",
            "folder/../secret.md",
            "/absolute.md",
            r"C:\secret.md",
            "notes.md?raw=1",
            "%2e%2e/secret.md",
            "folder%2fsecret.md",
            "bad%2.md",
        ] {
            assert!(decode_confined_relative_path(value).is_err(), "{value}");
        }
        assert_eq!(
            decode_confined_relative_path("folder/My%20Note.md").unwrap(),
            PathBuf::from("folder/My Note.md")
        );
    }

    #[test]
    fn confined_resources_cannot_leave_the_current_folder() {
        let directory = TestDirectory::new();
        let current = directory.file("current.md");
        directory.file("child.md");
        let outside = directory
            .path()
            .parent()
            .unwrap()
            .join(format!("outside-{}.md", std::process::id()));
        fs::write(&outside, "outside").unwrap();

        assert_eq!(
            resolve_confined_resource(&current, "child.md")
                .unwrap()
                .file_name()
                .unwrap(),
            "child.md"
        );
        assert!(matches!(
            resolve_confined_resource(&current, "../outside.md"),
            Err(ResourceError::OutsideFolder(_))
        ));
        let _ = fs::remove_file(outside);
    }

    #[cfg(unix)]
    #[test]
    fn confined_resources_reject_symlink_escapes() {
        use std::os::unix::fs::symlink;
        let directory = TestDirectory::new();
        let current = directory.file("current.md");
        let outside = directory
            .path()
            .parent()
            .unwrap()
            .join(format!("outside-image-{}.png", std::process::id()));
        fs::write(&outside, b"png").unwrap();
        symlink(&outside, directory.path().join("escape.png")).unwrap();
        assert!(matches!(
            resolve_confined_resource(&current, "escape.png"),
            Err(ResourceError::OutsideFolder(_))
        ));
        let _ = fs::remove_file(outside);
    }

    // This app ships only for Windows and its release CI runs exclusively on
    // `windows-latest`, so the confinement check also needs first-class
    // coverage against a real Windows filesystem symlink rather than relying
    // solely on the Unix variant above, which never executes on that runner.
    #[cfg(windows)]
    #[test]
    fn confined_resources_reject_symlink_escapes() {
        use std::os::windows::fs::symlink_file;
        let directory = TestDirectory::new();
        let current = directory.file("current.md");
        let outside = directory
            .path()
            .parent()
            .unwrap()
            .join(format!("outside-image-{}.png", std::process::id()));
        fs::write(&outside, b"png").unwrap();
        let link = directory.path().join("escape.png");
        match symlink_file(&outside, &link) {
            Ok(()) => {
                assert!(matches!(
                    resolve_confined_resource(&current, "escape.png"),
                    Err(ResourceError::OutsideFolder(_))
                ));
            }
            Err(error) => {
                // Creating a filesystem symlink requires Developer Mode or an
                // elevated account on some Windows hosts. windows-latest
                // GitHub Actions runners grant this; only skip when the host
                // truly cannot create one so the suite does not flake in a
                // restricted sandbox.
                eprintln!(
                    "skipping symlink escape test: could not create a test symlink ({error})"
                );
            }
        }
        let _ = fs::remove_file(outside);
    }

    #[test]
    fn local_image_types_exclude_svg() {
        assert_eq!(image_mime(Path::new("image.png")), Some("image/png"));
        assert_eq!(image_mime(Path::new("image.SVG")), None);
    }
}
