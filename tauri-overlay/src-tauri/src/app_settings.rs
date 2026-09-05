use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    collections::{BTreeMap, BTreeSet, HashSet},
    path::{Path, PathBuf},
    str::FromStr,
};
use ts_rs::TS;

#[cfg(target_os = "windows")]
use winreg::RegKey;
#[cfg(target_os = "windows")]
use winreg::enums::HKEY_CURRENT_USER;

use crate::{
    TauriOverlayOps,
    overlay_info::{
        OVERLAY_HOTKEY_BINDINGS, OVERLAY_HOTKEY_DEFAULTS, OverlayInfoOps, OverlayPlacement,
        ResolvedHotkeyBinding, RuntimeFlags,
    },
    path_manager,
    performance_overlay::PerformanceGeometry,
    replay_analysis::ReplayAnalysis,
    shared_types::{
        FirstWinBonusDisplayMode, FirstWinBonusServerScope, LocalizedLabels,
        OverlayInitColorsDurationPayload, Sc2Server,
    },
};

pub type RandomizerChoices = BTreeMap<String, bool>;
pub type PlayerNotes = BTreeMap<String, String>;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize, TS)]
#[ts(export, export_to = "../src/bindings/overlay.ts")]
pub struct AppSettings {
    start_with_windows: bool,
    minimize_to_tray: bool,
    start_minimized: bool,
    auto_update: bool,
    duration: u32,
    show_player_winrates: bool,
    show_replay_info_after_game: bool,
    show_session: bool,
    show_charts: bool,
    hide_nicknames_in_overlay: bool,
    account_folder: String,
    screenshot_folder: String,
    color_player1: String,
    color_player2: String,
    color_amon: String,
    color_mastery: String,
    #[serde(rename = "hotkey_show/hide")]
    hotkey_show_hide: Option<String>,
    hotkey_show: Option<String>,
    hotkey_hide: Option<String>,
    hotkey_newer: Option<String>,
    hotkey_older: Option<String>,
    hotkey_winrates: Option<String>,
    enable_logging: bool,
    dark_theme: bool,
    language: String,
    monitor: usize,
    performance_show: bool,
    performance_hotkey: Option<String>,
    performance_processes: Vec<String>,
    #[ts(optional)]
    performance_geometry: Option<[i32; 4]>,
    rng_choices: RandomizerChoices,
    player_notes: PlayerNotes,
    main_names: Vec<String>,
    detailed_analysis_atstart: bool,
    analysis_worker_threads: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(skip)]
    latest_today_win_bonus_time: Option<String>,
    first_win_bonus_times: BTreeMap<Sc2Server, String>,
    latest_first_win_bonus_server: Option<Sc2Server>,
    first_win_bonus_display_mode: FirstWinBonusDisplayMode,
    first_win_bonus_server_scope: FirstWinBonusServerScope,
    #[serde(skip)]
    #[ts(skip)]
    present_keys: BTreeSet<String>,
}

impl AppSettings {
    pub fn logical_core_count() -> usize {
        std::thread::available_parallelism()
            .map(std::num::NonZeroUsize::get)
            .unwrap_or(1)
    }

    pub fn default_analysis_worker_threads() -> usize {
        (Self::logical_core_count() / 2).max(1)
    }

    pub fn simple_analysis_worker_threads() -> usize {
        Self::default_analysis_worker_threads()
    }

    pub fn clamp_analysis_worker_threads(value: usize) -> usize {
        value.clamp(1, Self::logical_core_count())
    }

    pub fn from_value(value: Value) -> Result<Self, String> {
        serde_json::from_value(value).map_err(|error| format!("Invalid settings payload: {error}"))
    }

    pub fn to_value(&self) -> Value {
        serde_json::to_value(self).unwrap_or_else(|_| Value::Object(Default::default()))
    }

    pub fn from_saved_file() -> Self {
        let path = path_manager::PathManagerOps::get_settings_path();

        Self::read_saved_settings_file_from_path(&path, !cfg!(test))
    }

    pub fn setting_value_changed(prev: &AppSettings, next: &AppSettings, key: &str) -> bool {
        prev.settings_field_value(key) != next.settings_field_value(key)
    }

    pub fn any_setting_changed(prev: &AppSettings, next: &AppSettings, keys: &[&str]) -> bool {
        keys.iter()
            .any(|key| Self::setting_value_changed(prev, next, key))
    }

    pub fn merge_settings_with_defaults(value: Value) -> Self {
        let sanitized = Self::sanitize_settings_value(value);
        let present_keys = match &sanitized {
            Value::Object(settings) => settings.keys().cloned().collect(),
            _ => Default::default(),
        };

        let settings = AppSettings::default();

        let mut merged = match settings.to_value() {
            Value::Object(defaults) => defaults,
            _ => Map::new(),
        };

        if let Value::Object(settings) = sanitized {
            merged.extend(settings);
        }

        let mut settings = Self::from_value(Value::Object(merged)).unwrap_or(settings);
        settings.initialize_unset_hotkeys();
        settings.analysis_worker_threads =
            Self::clamp_analysis_worker_threads(settings.analysis_worker_threads);
        settings.present_keys = present_keys;

        settings
    }

    pub fn read_saved_settings_file_from_path(path: &Path, create_if_missing: bool) -> Self {
        let defaults = AppSettings::default();

        if !path.exists() {
            if create_if_missing {
                let _ = defaults.write_saved_settings_file_to_path(path);
            }

            return defaults;
        }

        let text = std::fs::read_to_string(path).unwrap_or_else(|_| "{}".to_string());
        let parsed = serde_json::from_str(&text).unwrap_or(Value::Object(Default::default()));
        Self::merge_settings_with_defaults(parsed)
    }

    pub fn write_saved_settings_file(&self) -> Result<Self, String> {
        let path = path_manager::PathManagerOps::get_settings_path();

        self.write_saved_settings_file_to_path(&path)
    }

    fn write_saved_settings_file_to_path(&self, path: &Path) -> Result<Self, String> {
        let sanitized = Self::merge_settings_with_defaults(self.to_value());
        let text = serde_json::to_string_pretty(&sanitized)
            .map_err(|error| format!("Failed to serialize settings: {error}"))?;
        if let Some(parent) = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
        {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("Failed to create settings directory: {error}"))?;
        }
        std::fs::write(path, text).map_err(|error| format!("Failed to write settings: {error}"))?;
        Ok(sanitized)
    }

    pub fn sanitize_settings_value(value: Value) -> Value {
        match value {
            Value::Object(mut map) => {
                map.remove("fast_expand");
                map.remove("force_hide_overlay");
                Value::Object(map)
            }
            other => other,
        }
    }

    pub fn initialize_unset_hotkeys(&mut self) {
        if self.hotkey_show_hide.is_none() {
            self.hotkey_show_hide = Some("Ctrl+Shift+8".to_string());
        }
        if self.hotkey_newer.is_none() {
            self.hotkey_newer = Some("Ctrl+Alt+/".to_string());
        }
        if self.hotkey_older.is_none() {
            self.hotkey_older = Some("Ctrl+Alt+8".to_string());
        }
        if self.hotkey_winrates.is_none() {
            self.hotkey_winrates = Some("Ctrl+Alt+-".to_string());
        }
    }

    pub fn settings_field_value(&self, key: &str) -> Option<Value> {
        self.to_value().get(key).cloned()
    }

    pub fn has(&self, key: &str) -> bool {
        self.present_keys.contains(key)
    }

    pub fn normalized_analysis_worker_threads(&self) -> usize {
        Self::clamp_analysis_worker_threads(self.analysis_worker_threads)
    }

    pub fn start_with_windows(&self) -> bool {
        self.start_with_windows
    }

    pub fn minimize_to_tray(&self) -> bool {
        self.minimize_to_tray
    }

    pub fn start_minimized(&self) -> bool {
        self.start_minimized
    }

    pub fn auto_update(&self) -> bool {
        self.auto_update
    }

    pub fn duration(&self) -> u32 {
        self.duration
    }

    pub fn show_player_winrates(&self) -> bool {
        self.show_player_winrates
    }

    pub fn show_replay_info_after_game(&self) -> bool {
        self.show_replay_info_after_game
    }

    pub fn show_session(&self) -> bool {
        self.show_session
    }

    pub fn show_charts(&self) -> bool {
        self.show_charts
    }

    pub fn hide_nicknames_in_overlay(&self) -> bool {
        self.hide_nicknames_in_overlay
    }

    pub fn account_folder(&self) -> &str {
        &self.account_folder
    }

    pub fn screenshot_folder(&self) -> &str {
        &self.screenshot_folder
    }

    pub fn color_player1(&self) -> &str {
        &self.color_player1
    }

    pub fn color_player2(&self) -> &str {
        &self.color_player2
    }

    pub fn color_amon(&self) -> &str {
        &self.color_amon
    }

    pub fn color_mastery(&self) -> &str {
        &self.color_mastery
    }

    pub fn hotkey_show_hide(&self) -> Option<&str> {
        self.hotkey_show_hide.as_deref()
    }

    pub fn hotkey_show(&self) -> Option<&str> {
        self.hotkey_show.as_deref()
    }

    pub fn hotkey_hide(&self) -> Option<&str> {
        self.hotkey_hide.as_deref()
    }

    pub fn hotkey_newer(&self) -> Option<&str> {
        self.hotkey_newer.as_deref()
    }

    pub fn hotkey_older(&self) -> Option<&str> {
        self.hotkey_older.as_deref()
    }

    pub fn hotkey_winrates(&self) -> Option<&str> {
        self.hotkey_winrates.as_deref()
    }

    pub fn enable_logging(&self) -> bool {
        self.enable_logging
    }

    pub fn dark_theme(&self) -> bool {
        self.dark_theme
    }

    pub fn language(&self) -> &str {
        &self.language
    }

    pub fn monitor(&self) -> usize {
        self.monitor
    }

    pub fn performance_show(&self) -> bool {
        self.performance_show
    }

    pub fn performance_hotkey(&self) -> Option<&str> {
        self.performance_hotkey.as_deref()
    }

    pub fn performance_processes(&self) -> &[String] {
        &self.performance_processes
    }

    pub fn performance_geometry(&self) -> Option<[i32; 4]> {
        self.performance_geometry
    }

    pub fn rng_choices(&self) -> &RandomizerChoices {
        &self.rng_choices
    }

    pub fn player_notes(&self) -> &PlayerNotes {
        &self.player_notes
    }

    pub fn main_names_raw(&self) -> &[String] {
        &self.main_names
    }

    pub fn detailed_analysis_atstart(&self) -> bool {
        self.detailed_analysis_atstart
    }

    pub fn analysis_worker_threads(&self) -> usize {
        self.analysis_worker_threads
    }

    pub fn latest_today_win_bonus_time(&self) -> Option<&str> {
        self.latest_today_win_bonus_time.as_deref()
    }

    pub fn first_win_bonus_times(&self) -> &BTreeMap<Sc2Server, String> {
        &self.first_win_bonus_times
    }

    pub fn first_win_bonus_time(&self, server: Sc2Server) -> Option<&str> {
        self.first_win_bonus_times.get(&server).map(String::as_str)
    }

    pub fn latest_first_win_bonus_server(&self) -> Option<Sc2Server> {
        self.latest_first_win_bonus_server
    }

    pub fn first_win_bonus_display_mode(&self) -> FirstWinBonusDisplayMode {
        self.first_win_bonus_display_mode
    }

    pub fn first_win_bonus_server_scope(&self) -> FirstWinBonusServerScope {
        self.first_win_bonus_server_scope
    }

    pub fn present_keys(&self) -> &BTreeSet<String> {
        &self.present_keys
    }

    pub fn clear_present_keys(&mut self) {
        self.present_keys.clear();
    }

    pub fn set_enable_logging(&mut self, value: bool) {
        self.enable_logging = value;
    }

    pub fn with_enable_logging(mut self, value: bool) -> Self {
        self.set_enable_logging(value);
        self
    }

    pub fn set_detailed_analysis_atstart(&mut self, value: bool) {
        self.detailed_analysis_atstart = value;
    }

    pub fn with_detailed_analysis_atstart(mut self, value: bool) -> Self {
        self.set_detailed_analysis_atstart(value);
        self
    }

    pub fn set_performance_geometry(&mut self, value: Option<[i32; 4]>) {
        self.performance_geometry = value;
    }

    pub fn set_latest_today_win_bonus_time(&mut self, value: Option<String>) {
        self.latest_today_win_bonus_time = value;
    }

    pub fn set_first_win_bonus_time(&mut self, server: Sc2Server, value: String) {
        self.first_win_bonus_times.insert(server, value);
        self.latest_first_win_bonus_server = Some(server);
        self.latest_today_win_bonus_time = None;
    }

    pub fn migrate_legacy_first_win_bonus_time(&mut self, server: Sc2Server) -> bool {
        let Some(value) = self.latest_today_win_bonus_time.take() else {
            return false;
        };
        self.set_first_win_bonus_time(server, value);
        true
    }

    pub fn set_first_win_bonus_display_mode(&mut self, value: FirstWinBonusDisplayMode) {
        self.first_win_bonus_display_mode = value;
    }

    pub fn set_first_win_bonus_server_scope(&mut self, value: FirstWinBonusServerScope) {
        self.first_win_bonus_server_scope = value;
    }
}

struct AppSettingsOps;

impl AppSettingsOps {
    fn get_system_language() -> String {
        let default = "en";
        let locale = sys_locale::get_locale();

        let language = if let Some(locale) = locale.as_ref() {
            locale
                .split("-")
                .next()
                .filter(|language| !language.is_empty())
                .unwrap_or(default)
        } else {
            "en"
        };

        language.to_string()
    }
}

impl AppSettingsOps {
    #[cfg(target_os = "windows")]
    fn get_default_accounts_folder() -> String {
        if let Ok(sc2_key) = RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(r"Software\Blizzard Entertainment\StarCraft II")
            && let Ok(path) = sc2_key.get_value::<String, &str>("InstallPath")
        {
            let accounts_folder = Path::new(&path).join("Accounts");
            if let Some(accounts_str) = accounts_folder.to_str() {
                return accounts_str.to_string();
            }
        }

        if let Ok(shell_folders) = RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders")
            && let Ok(documents) = shell_folders.get_value::<String, &str>("Personal")
        {
            let accounts_folder = Path::new(&documents).join("StarCraft II").join("Accounts");
            if let Some(accounts_str) = accounts_folder.to_str() {
                return accounts_str.to_string();
            }
        }

        String::new()
    }
}

impl AppSettingsOps {
    #[cfg(not(target_os = "windows"))]
    fn get_default_accounts_folder() -> String {
        String::new()
    }
}

impl AppSettingsOps {
    fn extract_account_handles_from_folder(account_root: &str) -> HashSet<String> {
        let mut handles = HashSet::new();
        let root = PathBuf::from(account_root);
        if !root.exists() || !root.is_dir() {
            return handles;
        }

        let mut stack = vec![root];
        while let Some(current) = stack.pop() {
            let Ok(entries) = std::fs::read_dir(&current) else {
                continue;
            };
            for entry in entries.filter_map(Result::ok) {
                let path = entry.path();
                let Ok(meta) = entry.metadata() else {
                    continue;
                };
                if meta.is_dir() {
                    if let Some(name) = path.file_name().and_then(|name| name.to_str()) {
                        let normalized = ReplayAnalysis::normalized_handle_key(name);
                        if !normalized.is_empty() {
                            handles.insert(normalized);
                        }
                    }
                    stack.push(path);
                }
            }
        }
        handles
    }
}

impl AppSettingsOps {
    fn build_replay_root_candidates(raw: &str) -> Vec<PathBuf> {
        let trimmed = raw.trim().trim_matches(&['"', '\''][..]).to_string();
        if trimmed.is_empty() {
            return Vec::new();
        }

        let mut candidates = Vec::with_capacity(3);
        let primary = PathBuf::from(&trimmed);
        candidates.push(primary.clone());

        let swapped = if trimmed.contains('\\') {
            trimmed.replace('\\', "/")
        } else {
            trimmed.replace('/', "\\")
        };
        if !swapped.is_empty() {
            let swapped_path = PathBuf::from(&swapped);
            if swapped_path != primary {
                candidates.push(swapped_path);
            }
        }

        let drive_prefix = trimmed.chars().nth(1) == Some(':');
        if drive_prefix {
            let windows_drive = trimmed
                .chars()
                .next()
                .unwrap_or('C')
                .to_ascii_lowercase()
                .to_string();
            let rest = trimmed[2..].trim_start_matches(['\\', '/'].as_ref());
            let wsl = format!(
                "/mnt/{}/{}",
                windows_drive,
                rest.replace('\\', "/").trim_start_matches('/')
            );
            let wsl_path = PathBuf::from(&wsl);
            if wsl_path != primary {
                candidates.push(wsl_path);
            }
        }
        candidates
    }
}

impl AppSettingsOps {
    fn as_u32(value: u64) -> u32 {
        u32::try_from(value).unwrap_or(u32::MAX)
    }
}

impl AppSettings {
    pub fn update_player_note(&mut self, handle: &str, note_value: &str) -> Result<(), String> {
        let normalized_handle = ReplayAnalysis::normalized_handle_key(handle);
        if normalized_handle.is_empty() {
            return Err("Handle is empty".to_string());
        }

        let existing_key = self
            .player_notes
            .keys()
            .find(|key| ReplayAnalysis::normalized_handle_key(key) == normalized_handle)
            .cloned()
            .unwrap_or_else(|| {
                TauriOverlayOps::sanitize_replay_text(handle)
                    .trim()
                    .to_string()
            });

        let trimmed_note = note_value.trim();
        if trimmed_note.is_empty() {
            self.player_notes.remove(&existing_key);
        } else {
            self.player_notes
                .insert(existing_key, note_value.to_string());
        }

        Ok(())
    }

    pub fn configured_main_names(&self) -> HashSet<String> {
        let mut names = self
            .main_names
            .iter()
            .map(|name| ReplayAnalysis::normalized_player_key(name))
            .filter(|name| !name.is_empty())
            .collect::<HashSet<_>>();

        if !names.is_empty() {
            return names;
        }

        let account_root = self.account_folder.trim();
        if account_root.is_empty() {
            return names;
        }

        let root = PathBuf::from(account_root);
        if !root.exists() || !root.is_dir() {
            return names;
        }

        let mut stack = vec![root];
        while let Some(current) = stack.pop() {
            let Ok(entries) = std::fs::read_dir(&current) else {
                continue;
            };
            for entry in entries.filter_map(Result::ok) {
                let path = entry.path();
                let Ok(meta) = entry.metadata() else {
                    continue;
                };
                if meta.is_dir() {
                    stack.push(path);
                    continue;
                }
                if !meta.is_file() {
                    continue;
                }
                let is_link = path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("lnk"));
                if !is_link {
                    continue;
                }
                let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
                    continue;
                };
                if !stem.contains('_') || !stem.contains('@') {
                    continue;
                }
                let name = stem.split('_').next().unwrap_or_default();
                let normalized = ReplayAnalysis::normalized_player_key(name);
                if !normalized.is_empty() {
                    names.insert(normalized);
                }
            }
        }

        names
    }

    pub fn configured_main_handles(&self) -> HashSet<String> {
        let account_root = self.account_folder.trim();
        if account_root.is_empty() {
            return HashSet::new();
        }
        AppSettingsOps::extract_account_handles_from_folder(account_root)
    }

    pub fn resolve_replay_root(&self) -> Option<PathBuf> {
        let account_folder = self.account_folder.trim();
        if !account_folder.is_empty() {
            let candidates = AppSettingsOps::build_replay_root_candidates(account_folder);
            if let Some(path) = candidates.iter().find(|path| path.is_dir()) {
                return Some(path.clone());
            }
        }

        None
    }

    pub fn replay_watch_root(&self) -> Option<PathBuf> {
        let account_folder = self.account_folder.trim();
        if account_folder.is_empty() {
            return None;
        }

        AppSettingsOps::build_replay_root_candidates(account_folder)
            .into_iter()
            .find(|candidate| candidate.is_dir())
    }

    pub fn current_replay_files_snapshot(&self, limit: usize) -> HashSet<String> {
        let Some(root) = self.resolve_replay_root() else {
            return HashSet::new();
        };

        ReplayAnalysis::collect_replay_paths(&root, limit)
            .into_iter()
            .map(|path| path.to_string_lossy().to_string())
            .collect()
    }

    pub fn overlay_placement(&self) -> OverlayPlacement {
        OverlayPlacement::new(self.monitor.max(1), 0.7, 1.0, 0, 0, 1)
    }

    pub fn runtime_flags(&self) -> RuntimeFlags {
        let minimize_to_tray = self.minimize_to_tray;
        let start_minimized = if minimize_to_tray {
            self.start_minimized
        } else {
            false
        };

        RuntimeFlags::new(start_minimized, minimize_to_tray, self.auto_update)
    }

    pub fn resolved_overlay_hotkey_bindings(&self) -> Vec<ResolvedHotkeyBinding> {
        let mut bindings = Vec::new();

        for (path, action) in OVERLAY_HOTKEY_BINDINGS {
            let configured = self.settings_field_value(path);
            let using_default =
                configured.is_none() || matches!(configured.as_ref(), Some(Value::Null));
            let shortcut = match configured.as_ref() {
                None => OVERLAY_HOTKEY_DEFAULTS
                    .iter()
                    .find(|(default_path, _)| *default_path == path)
                    .and_then(|(_, default_value)| OverlayInfoOps::normalize_hotkey(default_value)),
                Some(Value::Null) => OVERLAY_HOTKEY_DEFAULTS
                    .iter()
                    .find(|(default_path, _)| *default_path == path)
                    .and_then(|(_, default_value)| OverlayInfoOps::normalize_hotkey(default_value)),
                Some(Value::Bool(false)) => {
                    crate::sco_debug!("[SCO/hotkey] '{path}' disabled by settings.");
                    None
                }
                Some(Value::Bool(true)) => {
                    crate::sco_warn!(
                        "[SCO/hotkey] '{path}' has invalid non-string binding, skipping."
                    );
                    None
                }
                Some(Value::String(raw)) => {
                    let raw = raw.trim();
                    if raw.is_empty() {
                        crate::sco_warn!("[SCO/hotkey] '{path}' is empty, disabled by settings.");
                        None
                    } else {
                        OverlayInfoOps::normalize_hotkey(raw)
                    }
                }
                Some(_) => {
                    crate::sco_warn!("[SCO/hotkey] '{path}' has invalid binding type, skipping.");
                    None
                }
            };

            let Some(shortcut) = shortcut else {
                if using_default {
                    crate::sco_warn!("[SCO/hotkey] Missing binding for '{path}', skipping.");
                }
                continue;
            };

            let parsed = match tauri_plugin_global_shortcut::Shortcut::from_str(&shortcut) {
                Ok(parsed) => parsed,
                Err(error) => {
                    crate::sco_warn!(
                        "[SCO/hotkey] Failed to parse hotkey '{shortcut}' for '{path}': {error}"
                    );
                    continue;
                }
            };

            if using_default {
                crate::sco_debug!("[SCO/hotkey] Falling back to default for '{path}'.");
            }

            bindings.push(ResolvedHotkeyBinding::new(
                path,
                action,
                shortcut,
                parsed.to_string().to_ascii_lowercase(),
            ));
        }

        bindings
    }

    pub fn hotkey_binding_for_reassign_end(
        &self,
        path: &str,
        fallback_binding: Option<&ResolvedHotkeyBinding>,
    ) -> Option<ResolvedHotkeyBinding> {
        let bindings = self.resolved_overlay_hotkey_bindings();
        if let Some(binding) = bindings.into_iter().find(|binding| binding.path() == path) {
            return Some(binding);
        }

        let configured_value = self.settings_field_value(path);
        let explicitly_disabled = if !self.has(path) {
            false
        } else {
            match configured_value.as_ref() {
                Some(Value::Null) => false,
                Some(Value::Bool(false)) => true,
                Some(Value::String(raw)) => raw.trim().is_empty(),
                _ => false,
            }
        };
        if explicitly_disabled {
            return None;
        }

        fallback_binding
            .filter(|binding| binding.path() == path)
            .cloned()
    }

    pub fn player_note(&self, player_handle: &str) -> Option<String> {
        self.player_notes
            .get(player_handle)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    }

    fn overlay_screenshot_directory(&self) -> Result<PathBuf, String> {
        let folder = self.screenshot_folder.trim();
        if folder.is_empty() {
            return Err("Screenshot folder is not configured".to_string());
        }
        Ok(PathBuf::from(folder))
    }

    pub fn overlay_screenshot_output_path(
        &self,
        captured_at: std::time::SystemTime,
    ) -> Result<PathBuf, String> {
        let directory = self.overlay_screenshot_directory()?;
        let timestamp = captured_at
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| format!("Failed to build screenshot timestamp: {error}"))?
            .as_secs();
        Ok(directory.join(format!("overlay-{timestamp}.png")))
    }

    fn overlay_setting_string(&self, key: &str) -> Option<String> {
        self.settings_field_value(key)
            .and_then(|value| value.as_str().map(ToString::to_string))
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    }

    fn overlay_duration(&self) -> u32 {
        self.duration.max(1)
    }

    fn overlay_show_charts(&self) -> bool {
        self.show_charts
    }

    fn overlay_show_session(&self) -> bool {
        self.show_session
    }

    fn overlay_hide_nicknames(&self) -> bool {
        self.hide_nicknames_in_overlay
    }

    pub fn overlay_language(&self) -> &'static str {
        match self.language.as_str() {
            "ko" => "ko",
            "zh-CN" => "zh-CN",
            _ => "en",
        }
    }

    pub fn overlay_runtime_settings_payload(
        &self,
        session_victories: u64,
        session_defeats: u64,
        prestige_names: BTreeMap<String, LocalizedLabels>,
    ) -> Value {
        serde_json::to_value(OverlayInitColorsDurationPayload {
            colors: [
                self.overlay_setting_string("color_player1"),
                self.overlay_setting_string("color_player2"),
                self.overlay_setting_string("color_amon"),
                self.overlay_setting_string("color_mastery"),
            ],
            duration: self.overlay_duration(),
            show_charts: self.overlay_show_charts(),
            show_session: self.overlay_show_session(),
            hide_nicknames_in_overlay: self.overlay_hide_nicknames(),
            session_victory: AppSettingsOps::as_u32(session_victories),
            session_defeat: AppSettingsOps::as_u32(session_defeats),
            language: self.overlay_language().to_string(),
            prestige_names,
        })
        .unwrap_or_else(|_| Value::Object(Default::default()))
    }

    pub fn performance_show_enabled(&self) -> bool {
        self.performance_show
    }

    pub fn performance_process_names(&self) -> Vec<String> {
        let names = self
            .performance_processes
            .iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .collect::<Vec<String>>();
        if names.is_empty() {
            vec!["SC2_x64.exe".to_string(), "SC2.exe".to_string()]
        } else {
            names
        }
    }

    pub fn saved_performance_geometry(&self) -> Option<PerformanceGeometry> {
        let geometry = self.performance_geometry?;
        let x = geometry[0];
        let y = geometry[1];
        let width = u32::try_from(geometry[2]).ok()?;
        let height = u32::try_from(geometry[3]).ok()?;

        Some(PerformanceGeometry::new(x, y, width, height).normalized())
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        let mut settings = AppSettings {
            start_with_windows: false,
            minimize_to_tray: true,
            start_minimized: false,
            auto_update: true,
            duration: 30,
            show_player_winrates: true,
            show_replay_info_after_game: true,
            show_session: true,
            show_charts: true,
            hide_nicknames_in_overlay: false,
            account_folder: AppSettingsOps::get_default_accounts_folder(),
            screenshot_folder: String::new(),
            color_player1: "#0080F8".to_string(),
            color_player2: "#00D532".to_string(),
            color_amon: "#FF0000".to_string(),
            color_mastery: "#FFDC87".to_string(),
            hotkey_show_hide: None,
            hotkey_show: None,
            hotkey_hide: None,
            hotkey_newer: None,
            hotkey_older: None,
            hotkey_winrates: None,
            enable_logging: true,
            dark_theme: true,
            language: AppSettingsOps::get_system_language(),
            monitor: 1,
            performance_show: false,
            performance_hotkey: None,
            performance_processes: Vec::new(),
            performance_geometry: None,
            rng_choices: Default::default(),
            player_notes: Default::default(),
            main_names: Vec::new(),
            detailed_analysis_atstart: false,
            analysis_worker_threads: Self::default_analysis_worker_threads(),
            latest_today_win_bonus_time: None,
            first_win_bonus_times: BTreeMap::new(),
            latest_first_win_bonus_server: None,
            first_win_bonus_display_mode: FirstWinBonusDisplayMode::AvailableOnly,
            first_win_bonus_server_scope: FirstWinBonusServerScope::Latest,
            present_keys: Default::default(),
        };

        settings.initialize_unset_hotkeys();

        settings
    }
}
