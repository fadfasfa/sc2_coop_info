//! Personal portable safety layer; intentionally absent from the upstream PR.
use std::{fs, path::{Path, PathBuf}, sync::OnceLock};

static PROFILE: OnceLock<Result<PathBuf, String>> = OnceLock::new();

fn checked_directory(path: &Path) -> Result<(), String> {
    if path.exists() {
        let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err(format!("Portable directory must not be a link: {}", path.display()));
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                return Err(format!("Portable directory must not be a reparse point: {}", path.display()));
            }
        }
    } else {
        fs::create_dir(path).map_err(|e| format!("Cannot create {}: {e}", path.display()))?;
    }
    Ok(())
}

fn prepare() -> Result<PathBuf, String> {
    use std::io::Write;
    if std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_some() {
        return Err("WEBVIEW2_USER_DATA_FOLDER override is set; refusing a non-portable WebView profile".into());
    }
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    let root = executable.parent().ok_or("Executable has no parent")?;
    // Do not follow directory junctions or symlinks into another installation.
    for ancestor in root.ancestors() {
        checked_directory(ancestor)?;
    }
    let profile = root.join("profile");
    checked_directory(&profile)?;
    for name in ["Accounts", "screenshots", "generated", "webview"] {
        checked_directory(&profile.join(name))?;
    }
    let probe = profile.join(format!(".write-check-{}-{}", std::process::id(),
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos()));
    let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&probe)
        .map_err(|e| format!("Portable profile is not writable: {e}"))?;
    file.write_all(b"portable-write-check").map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);
    fs::remove_file(&probe).map_err(|e| e.to_string())?;
    Ok(profile)
}

pub fn initialize() -> Result<PathBuf, String> {
    PROFILE.get_or_init(prepare).clone()
}

pub fn profile_dir() -> PathBuf {
    initialize().expect("Portable profile initialization failed; refusing to use any fallback directory")
}

#[cfg(test)]
mod tests {
    #[test]
    fn portable_profile_never_uses_current_directory_or_official_appdata() {
        let executable = std::env::current_exe().unwrap();
        assert_eq!(super::profile_dir(), executable.parent().unwrap().join("profile"));
    }

    #[test]
    fn portable_flags_cannot_enable_external_updates_or_autostart() {
        let settings = crate::AppSettings::merge_settings_with_defaults(serde_json::json!({
            "auto_update": true, "start_with_windows": true
        }));
        assert!(!settings.auto_update());
        assert!(!settings.start_with_windows());
        assert!(!settings.runtime_flags().auto_update());
        assert!(!crate::TauriOverlayOps::should_remove_legacy_windows_startup_registration());
    }

    #[test]
    fn portable_defaults_only_select_empty_local_accounts() {
        let settings = crate::AppSettings::default();
        assert_eq!(std::path::Path::new(settings.account_folder()), super::profile_dir().join("Accounts"));
        assert_eq!(std::path::Path::new(settings.screenshot_folder()), super::profile_dir().join("screenshots"));
    }
}
