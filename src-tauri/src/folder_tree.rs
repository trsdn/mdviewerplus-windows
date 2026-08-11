use crate::commands::{is_markdown_file_name, ResourceError};
use serde::Serialize;
use std::cmp::Ordering;
use std::fs;
use std::path::{Component, Path, PathBuf};

pub(crate) const MAX_FOLDER_TREE_DEPTH: usize = 12;
pub(crate) const MAX_FOLDER_TREE_CHILDREN: usize = 500;
pub(crate) const MAX_FOLDER_TREE_NODES: usize = 5_000;
pub(crate) const MAX_FOLDER_TREE_PAYLOAD_BYTES: usize = 1024 * 1024;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FolderTreeNodeKind {
    Directory,
    File,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FolderTreeNode {
    pub id: String,
    pub name: String,
    pub relative_path: String,
    pub kind: FolderTreeNodeKind,
    pub depth: usize,
    pub is_expandable: bool,
    pub is_truncated: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FolderTreeChildren {
    pub relative_directory: String,
    pub depth: usize,
    pub children: Vec<FolderTreeNode>,
    pub is_truncated: bool,
}

fn invalid_path(message: impl Into<String>) -> ResourceError {
    ResourceError::InvalidPath(message.into())
}

fn outside_root() -> ResourceError {
    ResourceError::OutsideFolder("The requested path leaves the folder navigator root.".into())
}

fn metadata_without_symlink(path: &Path) -> Result<fs::Metadata, ResourceError> {
    let metadata = fs::symlink_metadata(path).map_err(|error| {
        invalid_path(format!("Could not inspect '{}': {error}", path.display()))
    })?;
    if metadata.file_type().is_symlink() {
        return Err(invalid_path(
            "Symbolic links are not available in the folder navigator.",
        ));
    }
    Ok(metadata)
}

pub(crate) fn canonical_folder_root(root_path: &Path) -> Result<PathBuf, ResourceError> {
    let metadata = metadata_without_symlink(root_path)?;
    if !metadata.is_dir() {
        return Err(invalid_path(
            "The folder navigator root is not a directory.",
        ));
    }
    root_path.canonicalize().map_err(|error| {
        invalid_path(format!(
            "Could not resolve folder navigator root '{}': {error}",
            root_path.display()
        ))
    })
}

fn relative_path(value: &str, allow_empty: bool) -> Result<PathBuf, ResourceError> {
    if (!allow_empty && value.is_empty())
        || value.len() > 1024
        || value.contains('\\')
        || value.contains('?')
        || value.contains('#')
        || value.chars().any(char::is_control)
    {
        return Err(invalid_path(
            "The folder navigator relative path is not valid.",
        ));
    }

    let lowercase = value.to_ascii_lowercase();
    if lowercase.contains("%2f")
        || lowercase.contains("%5c")
        || lowercase.contains("%2e")
        || value.as_bytes().windows(3).any(|bytes| {
            bytes[0] == b'%' && (!bytes[1].is_ascii_hexdigit() || !bytes[2].is_ascii_hexdigit())
        })
        || value.ends_with('%')
        || value.as_bytes().get(value.len().saturating_sub(2)) == Some(&b'%')
    {
        return Err(invalid_path("Encoded path components are not accepted."));
    }

    if value.is_empty() {
        return Ok(PathBuf::new());
    }
    let path = Path::new(value);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(outside_root());
    }
    Ok(path.to_path_buf())
}

fn path_depth(path: &Path) -> usize {
    path.components().count()
}

fn normalized_relative(path: &Path) -> Result<String, ResourceError> {
    let components: Result<Vec<_>, _> = path
        .components()
        .map(|component| match component {
            Component::Normal(value) => value
                .to_str()
                .map(str::to_owned)
                .ok_or_else(|| invalid_path("A folder entry name is not valid Unicode.")),
            _ => Err(outside_root()),
        })
        .collect();
    Ok(components?.join("/"))
}

fn reject_symlink_components(root: &Path, relative: &Path) -> Result<PathBuf, ResourceError> {
    let mut candidate = root.to_path_buf();
    for component in relative.components() {
        let Component::Normal(value) = component else {
            return Err(outside_root());
        };
        candidate.push(value);
        let metadata = metadata_without_symlink(&candidate)?;
        if is_hidden_metadata(&metadata) {
            return Err(invalid_path(
                "Hidden paths are not available in the folder navigator.",
            ));
        }
    }
    Ok(candidate)
}

fn canonical_confined_entry(
    root: &Path,
    relative: &Path,
) -> Result<(PathBuf, fs::Metadata), ResourceError> {
    let candidate = reject_symlink_components(root, relative)?;
    let canonical = candidate.canonicalize().map_err(|error| {
        invalid_path(format!(
            "Could not resolve '{}': {error}",
            candidate.display()
        ))
    })?;
    if !canonical.starts_with(root) {
        return Err(outside_root());
    }
    let metadata = metadata_without_symlink(&canonical)?;
    if is_hidden_metadata(&metadata) {
        return Err(invalid_path(
            "Hidden paths are not available in the folder navigator.",
        ));
    }
    Ok((canonical, metadata))
}

fn is_hidden_name(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with('.'))
}

fn is_hidden_metadata(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
        metadata.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0
    }
    #[cfg(not(windows))]
    {
        let _ = metadata;
        false
    }
}

fn is_package_directory(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "app" | "bundle" | "framework" | "pkg"
            )
        })
}

fn compare_nodes(left: &FolderTreeNode, right: &FolderTreeNode) -> Ordering {
    let left_rank = matches!(left.kind, FolderTreeNodeKind::File);
    let right_rank = matches!(right.kind, FolderTreeNodeKind::File);
    left_rank
        .cmp(&right_rank)
        .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
        .then_with(|| left.name.cmp(&right.name))
        .then_with(|| left.relative_path.cmp(&right.relative_path))
}

fn response_size(response: &FolderTreeChildren) -> Result<usize, ResourceError> {
    serde_json::to_vec(response)
        .map(|payload| payload.len())
        .map_err(|error| ResourceError::State(format!("Could not serialize folder tree: {error}")))
}

#[tauri::command]
pub fn list_folder_children(
    root_path: String,
    relative_directory: String,
    depth: usize,
) -> Result<FolderTreeChildren, ResourceError> {
    let root = canonical_folder_root(Path::new(&root_path))?;
    let relative = relative_path(&relative_directory, true)?;
    if path_depth(&relative) != depth {
        return Err(invalid_path(
            "The folder navigator depth does not match the relative directory.",
        ));
    }
    if depth >= MAX_FOLDER_TREE_DEPTH {
        return Err(invalid_path(
            "The folder navigator depth limit was reached.",
        ));
    }
    for component in relative.components() {
        if let Component::Normal(name) = component {
            let component_path = Path::new(name);
            if is_hidden_name(component_path) || is_package_directory(component_path) {
                return Err(invalid_path(
                    "Hidden and package directories are not available.",
                ));
            }
        }
    }

    let (directory, metadata) = if relative.as_os_str().is_empty() {
        (
            root.clone(),
            fs::symlink_metadata(&root).map_err(|error| {
                invalid_path(format!("Could not inspect '{}': {error}", root.display()))
            })?,
        )
    } else {
        canonical_confined_entry(&root, &relative)?
    };
    if !metadata.is_dir() || is_hidden_metadata(&metadata) {
        return Err(invalid_path(
            "The requested folder navigator path is not a visible directory.",
        ));
    }

    let entries = fs::read_dir(&directory).map_err(|error| {
        ResourceError::CannotRead(format!("Could not read '{}': {error}", directory.display()))
    })?;
    let mut children = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| {
            ResourceError::CannotRead(format!(
                "Could not read an entry in '{}': {error}",
                directory.display()
            ))
        })?;
        let entry_path = entry.path();
        if is_hidden_name(&entry_path) {
            continue;
        }
        let entry_metadata = match fs::symlink_metadata(&entry_path) {
            Ok(metadata) if !metadata.file_type().is_symlink() => metadata,
            Ok(_) => continue,
            Err(error) => {
                return Err(ResourceError::CannotRead(format!(
                    "Could not inspect '{}': {error}",
                    entry_path.display()
                )))
            }
        };
        if is_hidden_metadata(&entry_metadata) {
            continue;
        }

        let is_directory = entry_metadata.is_dir();
        if (is_directory && is_package_directory(&entry_path))
            || (!is_directory && (!entry_metadata.is_file() || !is_markdown_file_name(&entry_path)))
        {
            continue;
        }

        let entry_name = entry
            .file_name()
            .into_string()
            .map_err(|_| invalid_path("A folder entry name is not valid Unicode."))?;
        let child_relative_path = relative.join(&entry_name);
        let (canonical, canonical_metadata) =
            canonical_confined_entry(&root, &child_relative_path)?;
        if canonical_metadata.is_dir() != is_directory
            || (!is_directory && !canonical_metadata.is_file())
            || !canonical.starts_with(&root)
        {
            continue;
        }
        let normalized = normalized_relative(&child_relative_path)?;
        children.push(FolderTreeNode {
            id: normalized.clone(),
            name: entry_name,
            relative_path: normalized,
            kind: if is_directory {
                FolderTreeNodeKind::Directory
            } else {
                FolderTreeNodeKind::File
            },
            depth: depth + 1,
            is_expandable: is_directory && depth + 1 < MAX_FOLDER_TREE_DEPTH,
            is_truncated: false,
        });
    }

    children.sort_by(compare_nodes);
    let mut is_truncated = children.len() > MAX_FOLDER_TREE_CHILDREN;
    children.truncate(MAX_FOLDER_TREE_CHILDREN);
    let mut response = FolderTreeChildren {
        relative_directory: normalized_relative(&relative)?,
        depth,
        children,
        is_truncated,
    };
    while response_size(&response)? > MAX_FOLDER_TREE_PAYLOAD_BYTES {
        if response.children.pop().is_none() {
            return Err(ResourceError::TooLarge(
                "The folder tree response exceeds the supported size limit.".into(),
            ));
        }
        is_truncated = true;
        response.is_truncated = true;
    }
    debug_assert!(response.children.len() <= MAX_FOLDER_TREE_NODES);
    debug_assert_eq!(response.is_truncated, is_truncated);
    Ok(response)
}

#[tauri::command]
pub fn resolve_folder_markdown(
    root_path: String,
    relative_file: String,
) -> Result<String, ResourceError> {
    let root = canonical_folder_root(Path::new(&root_path))?;
    let relative = relative_path(&relative_file, false)?;
    if path_depth(&relative) > MAX_FOLDER_TREE_DEPTH {
        return Err(invalid_path(
            "The folder navigator depth limit was reached.",
        ));
    }
    for component in relative.components() {
        if let Component::Normal(name) = component {
            let component_path = Path::new(name);
            if is_hidden_name(component_path) || is_package_directory(component_path) {
                return Err(invalid_path("Hidden and package paths are not available."));
            }
        }
    }
    let (target, metadata) = canonical_confined_entry(&root, &relative)?;
    if !metadata.is_file() || !is_markdown_file_name(&target) {
        return Err(ResourceError::UnsupportedType(
            "Only visible Markdown documents can be opened.".into(),
        ));
    }
    Ok(target.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering as AtomicOrdering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static NEXT_DIRECTORY: AtomicU64 = AtomicU64::new(1);

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "mdviewer-folder-tree-{}-{unique}-{}",
                std::process::id(),
                NEXT_DIRECTORY.fetch_add(1, AtomicOrdering::Relaxed)
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn root(&self) -> String {
            self.0.to_string_lossy().into_owned()
        }

        fn file(&self, relative: &str) {
            let path = self.0.join(relative);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, relative).unwrap();
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn lists_only_direct_visible_supported_children_in_stable_order() {
        let directory = TestDirectory::new();
        fs::create_dir_all(directory.0.join("zebra")).unwrap();
        fs::create_dir_all(directory.0.join("Alpha")).unwrap();
        fs::create_dir_all(directory.0.join("Ignored.app")).unwrap();
        for name in [
            "b.markdown",
            "A.md",
            "c.MDOWN",
            "d.mKd",
            "notes.txt",
            ".hidden.md",
        ] {
            directory.file(name);
        }

        let result = list_folder_children(directory.root(), String::new(), 0).unwrap();
        let names: Vec<_> = result
            .children
            .iter()
            .map(|node| (node.name.as_str(), node.kind))
            .collect();
        assert_eq!(
            names,
            [
                ("Alpha", FolderTreeNodeKind::Directory),
                ("zebra", FolderTreeNodeKind::Directory),
                ("A.md", FolderTreeNodeKind::File),
                ("b.markdown", FolderTreeNodeKind::File),
                ("c.MDOWN", FolderTreeNodeKind::File),
                ("d.mKd", FolderTreeNodeKind::File),
            ]
        );
        assert!(result
            .children
            .iter()
            .all(|node| !Path::new(&node.relative_path).is_absolute()));
    }

    #[test]
    fn child_listing_is_lazy_and_depth_must_match() {
        let directory = TestDirectory::new();
        directory.file("parent/child/grandchild.md");
        let root = list_folder_children(directory.root(), String::new(), 0).unwrap();
        assert_eq!(root.children.len(), 1);
        assert_eq!(root.children[0].relative_path, "parent");
        assert!(list_folder_children(directory.root(), "parent".into(), 0).is_err());
        let child = list_folder_children(directory.root(), "parent".into(), 1).unwrap();
        assert_eq!(child.children[0].relative_path, "parent/child");
    }

    #[test]
    fn rejects_traversal_absolute_and_encoded_paths() {
        let directory = TestDirectory::new();
        directory.file("safe.md");
        for value in [
            "../safe.md",
            "/safe.md",
            r"C:\safe.md",
            "%2e%2e/safe.md",
            "folder%2fsafe.md",
            "folder%5csafe.md",
        ] {
            assert!(
                resolve_folder_markdown(directory.root(), value.into()).is_err(),
                "{value}"
            );
        }
    }

    #[test]
    fn resolves_only_visible_markdown_files_within_the_root() {
        let directory = TestDirectory::new();
        directory.file("notes/readme.md");
        directory.file("notes/readme.txt");
        directory.file(".private/secret.md");
        let resolved = resolve_folder_markdown(directory.root(), "notes/readme.md".into()).unwrap();
        assert!(Path::new(&resolved).is_absolute());
        assert!(resolve_folder_markdown(directory.root(), "notes/readme.txt".into()).is_err());
        assert!(resolve_folder_markdown(directory.root(), ".private/secret.md".into()).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn resolution_rejects_hidden_attributes_on_files_and_intermediate_directories() {
        use std::process::Command;

        fn mark_hidden(path: &Path) {
            let status = Command::new("attrib")
                .arg("+H")
                .arg(path)
                .status()
                .expect("Windows attrib should be available");
            assert!(status.success());
        }

        let directory = TestDirectory::new();
        directory.file("hidden.md");
        directory.file("hidden-directory/readme.md");
        mark_hidden(&directory.0.join("hidden.md"));
        mark_hidden(&directory.0.join("hidden-directory"));

        assert!(resolve_folder_markdown(directory.root(), "hidden.md".into()).is_err());
        assert!(
            resolve_folder_markdown(directory.root(), "hidden-directory/readme.md".into()).is_err()
        );

        let listed = list_folder_children(directory.root(), String::new(), 0).unwrap();
        assert!(listed.children.is_empty());
    }

    #[test]
    fn child_count_is_truncated_at_the_limit() {
        let directory = TestDirectory::new();
        for index in 0..=MAX_FOLDER_TREE_CHILDREN {
            directory.file(&format!("note-{index:04}.md"));
        }
        let result = list_folder_children(directory.root(), String::new(), 0).unwrap();
        assert_eq!(result.children.len(), MAX_FOLDER_TREE_CHILDREN);
        assert!(result.is_truncated);
        assert!(response_size(&result).unwrap() <= MAX_FOLDER_TREE_PAYLOAD_BYTES);
    }

    #[test]
    fn enforces_depth_limit() {
        let directory = TestDirectory::new();
        let relative = (0..MAX_FOLDER_TREE_DEPTH)
            .map(|index| format!("d{index}"))
            .collect::<Vec<_>>()
            .join("/");
        fs::create_dir_all(directory.0.join(&relative)).unwrap();
        assert!(list_folder_children(directory.root(), relative, MAX_FOLDER_TREE_DEPTH).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_roots_entries_and_escapes_before_canonicalization() {
        use std::os::unix::fs::symlink;

        let directory = TestDirectory::new();
        let outside = TestDirectory::new();
        outside.file("secret.md");
        symlink(&outside.0, directory.0.join("linked")).unwrap();

        let listed = list_folder_children(directory.root(), String::new(), 0).unwrap();
        assert!(listed.children.is_empty());
        assert!(resolve_folder_markdown(directory.root(), "linked/secret.md".into()).is_err());

        let root_link = directory.0.with_extension("link");
        symlink(&directory.0, &root_link).unwrap();
        assert!(
            list_folder_children(root_link.to_string_lossy().into_owned(), String::new(), 0)
                .is_err()
        );
        fs::remove_file(root_link).unwrap();
    }

    #[test]
    fn serialized_contract_is_camel_case_and_bounded() {
        let directory = TestDirectory::new();
        directory.file("readme.md");
        let result = list_folder_children(directory.root(), String::new(), 0).unwrap();
        let value = serde_json::to_value(&result).unwrap();
        assert!(value.get("relativeDirectory").is_some());
        assert!(value["children"][0].get("relativePath").is_some());
        assert!(value["children"][0].get("isExpandable").is_some());
        assert!(serde_json::to_vec(&result).unwrap().len() <= MAX_FOLDER_TREE_PAYLOAD_BYTES);
    }

    #[test]
    fn documented_limits_remain_fixed() {
        assert_eq!(MAX_FOLDER_TREE_DEPTH, 12);
        assert_eq!(MAX_FOLDER_TREE_CHILDREN, 500);
        assert_eq!(MAX_FOLDER_TREE_NODES, 5_000);
        assert_eq!(MAX_FOLDER_TREE_PAYLOAD_BYTES, 1024 * 1024);
    }
}
