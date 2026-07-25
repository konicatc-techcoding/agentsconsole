use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const FILE_NAME: &str = "console-layout.json";
const SCHEMA_VERSION: u8 = 1;
const SLOT_IDS: [&str; 4] = ["slot-1", "slot-2", "slot-3", "slot-4"];
const PROVIDER_IDS: [&str; 4] = ["hermes", "codex", "claude", "antigravity"];

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConsoleSlot {
    slot_id: String,
    provider_id: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ConsoleLayout {
    version: u8,
    slots: Vec<ConsoleSlot>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct LayoutError {
    pub(crate) code: String,
    pub(crate) message: String,
    pub(crate) status_code: u16,
}

impl LayoutError {
    pub(crate) fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            status_code: 500,
        }
    }
}

fn layout_path(directory: &Path) -> PathBuf {
    directory.join(FILE_NAME)
}

fn default_layout() -> ConsoleLayout {
    ConsoleLayout {
        version: SCHEMA_VERSION,
        slots: SLOT_IDS
            .iter()
            .zip(PROVIDER_IDS)
            .map(|(slot_id, provider_id)| ConsoleSlot {
                slot_id: (*slot_id).to_string(),
                provider_id: provider_id.to_string(),
            })
            .collect(),
    }
}

fn validate_layout(layout: &ConsoleLayout) -> bool {
    layout.version == SCHEMA_VERSION
        && layout.slots.len() == SLOT_IDS.len()
        && layout.slots.iter().enumerate().all(|(index, slot)| {
            slot.slot_id == SLOT_IDS[index] && PROVIDER_IDS.contains(&slot.provider_id.as_str())
        })
}

fn temporary_path(path: &Path) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    path.with_file_name(format!(
        ".{FILE_NAME}.{}-{unique}-pending",
        std::process::id()
    ))
}

fn write_temporary(path: &Path, contents: &[u8]) -> io::Result<()> {
    use std::io::Write;

    let mut file = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)?;
    file.write_all(contents)?;
    file.sync_all()
}

fn serialize_layout(layout: &ConsoleLayout, path: &Path) -> Result<Vec<u8>, LayoutError> {
    let mut contents = serde_json::to_vec_pretty(layout).map_err(|_| {
        LayoutError::new(
            "layout_write_failed",
            format!("Console layout could not be saved at {}", path.display()),
        )
    })?;
    contents.push(b'\n');
    Ok(contents)
}

fn write_layout_with<F>(
    directory: &Path,
    layout: &ConsoleLayout,
    mut replace: F,
) -> Result<(), LayoutError>
where
    F: FnMut(&Path, &Path) -> io::Result<()>,
{
    let path = layout_path(directory);
    fs::create_dir_all(directory).map_err(|_| {
        LayoutError::new(
            "layout_storage_unavailable",
            format!(
                "Console layout directory could not be created at {}",
                directory.display()
            ),
        )
    })?;
    let contents = serialize_layout(layout, &path)?;
    let temporary = temporary_path(&path);
    if write_temporary(&temporary, &contents).is_err() {
        let _ = fs::remove_file(&temporary);
        return Err(LayoutError::new(
            "layout_write_failed",
            format!("Console layout could not be saved at {}", path.display()),
        ));
    }
    replace(&temporary, &path).map_err(|_| {
        let _ = fs::remove_file(&temporary);
        LayoutError::new(
            "layout_write_failed",
            format!("Console layout could not be saved at {}", path.display()),
        )
    })
}

fn write_layout_file(directory: &Path, layout: &ConsoleLayout) -> Result<(), LayoutError> {
    write_layout_with(directory, layout, |from, to| fs::rename(from, to))
}

fn invalid_layout(path: &Path) -> LayoutError {
    LayoutError::new(
        "invalid_layout",
        format!(
            "Console layout at {} is invalid. Fix, rename, or delete the file and press Refresh.",
            path.display()
        ),
    )
}

fn read_existing(directory: &Path) -> Result<ConsoleLayout, LayoutError> {
    let path = layout_path(directory);
    let contents = fs::read_to_string(&path).map_err(|_| {
        LayoutError::new(
            "layout_read_failed",
            format!("Console layout could not be read at {}", path.display()),
        )
    })?;
    let layout: ConsoleLayout =
        serde_json::from_str(&contents).map_err(|_| invalid_layout(&path))?;
    if !validate_layout(&layout) {
        return Err(invalid_layout(&path));
    }
    Ok(layout)
}

pub fn read_or_initialize_layout(directory: &Path) -> Result<ConsoleLayout, LayoutError> {
    if layout_path(directory).exists() {
        return read_existing(directory);
    }

    let layout = default_layout();
    write_layout_file(directory, &layout)?;
    Ok(layout)
}

pub fn write_layout(directory: &Path, layout: ConsoleLayout) -> Result<ConsoleLayout, LayoutError> {
    if !validate_layout(&layout) {
        return Err(invalid_layout(&layout_path(directory)));
    }
    if !layout_path(directory).exists() {
        return Err(LayoutError::new(
            "layout_not_initialized",
            format!(
                "Console layout is not initialized at {}",
                layout_path(directory).display()
            ),
        ));
    }
    read_existing(directory)?;
    write_layout_file(directory, &layout)?;
    Ok(layout)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEMP_ID: AtomicU64 = AtomicU64::new(0);

    fn temp_directory() -> PathBuf {
        let sequence = NEXT_TEMP_ID.fetch_add(1, Ordering::Relaxed);
        let directory =
            std::env::temp_dir().join(format!("agentos-layout-{}-{sequence}", std::process::id()));
        fs::create_dir(&directory).unwrap();
        directory
    }

    #[test]
    fn missing_file_initializes_the_fixed_default_layout() {
        let directory = temp_directory();

        let layout = read_or_initialize_layout(&directory).unwrap();
        let contents = fs::read_to_string(layout_path(&directory)).unwrap();

        assert_eq!(layout, default_layout());
        assert!(contents.contains("\"version\": 1"));
        assert_eq!(layout.slots[0].provider_id, "hermes");
        assert_eq!(layout.slots[3].provider_id, "antigravity");
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn duplicate_provider_assignments_are_valid_and_persisted() {
        let directory = temp_directory();
        read_or_initialize_layout(&directory).unwrap();
        let mut layout = default_layout();
        layout.slots[0].provider_id = "codex".to_string();

        let saved = write_layout(&directory, layout.clone()).unwrap();
        let loaded = read_or_initialize_layout(&directory).unwrap();

        assert_eq!(saved, layout);
        assert_eq!(loaded.slots[0].provider_id, "codex");
        assert_eq!(loaded.slots[1].provider_id, "codex");
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn invalid_json_is_preserved_and_reports_its_full_path() {
        let directory = temp_directory();
        let path = layout_path(&directory);
        fs::write(&path, "{ invalid").unwrap();

        let error = read_or_initialize_layout(&directory).unwrap_err();

        assert_eq!(error.code, "invalid_layout");
        assert!(error.message.contains(&path.to_string_lossy().into_owned()));
        assert_eq!(fs::read_to_string(path).unwrap(), "{ invalid");
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn rejects_missing_reordered_or_unknown_slots_and_providers() {
        let mut missing = default_layout();
        missing.slots.pop();
        assert!(!validate_layout(&missing));

        let mut reordered = default_layout();
        reordered.slots.swap(0, 1);
        assert!(!validate_layout(&reordered));

        let mut unknown = default_layout();
        unknown.slots[0].provider_id = "unknown".to_string();
        assert!(!validate_layout(&unknown));
    }

    #[test]
    fn invalid_existing_file_cannot_be_overwritten() {
        let directory = temp_directory();
        let path = layout_path(&directory);
        fs::write(&path, "{ changed externally").unwrap();

        let error = write_layout(&directory, default_layout()).unwrap_err();

        assert_eq!(error.code, "invalid_layout");
        assert_eq!(fs::read_to_string(path).unwrap(), "{ changed externally");
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn failed_replacement_preserves_the_previous_valid_file() {
        let directory = temp_directory();
        read_or_initialize_layout(&directory).unwrap();
        let path = layout_path(&directory);
        let previous = fs::read(&path).unwrap();
        let mut layout = default_layout();
        layout.slots[0].provider_id = "codex".to_string();

        let error = write_layout_with(&directory, &layout, |_, _| {
            Err(io::Error::other("simulated replacement failure"))
        })
        .unwrap_err();

        assert_eq!(error.code, "layout_write_failed");
        assert_eq!(fs::read(path).unwrap(), previous);
        fs::remove_dir_all(directory).unwrap();
    }
}
