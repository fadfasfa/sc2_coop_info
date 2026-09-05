use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::str::FromStr;
use std::thread;
use std::time::{Duration, SystemTime};

use s2coop_analyzer::dictionary_data::Sc2DictionaryData;
use serde_json::Value;
use tauri::{
    Emitter, Manager, Runtime, Wry,
    menu::{MenuBuilder, MenuItem},
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::app_settings::AppSettings;
use crate::monitor_settings;
use crate::randomizer;
use crate::shared_types::{
    EmptyPayload, FirstWinBonusTimerPayload, LocalizedLabels, OverlayReplayPayload,
    OverlayScreenshotRequestPayload, ReplayDataRecord, ReplayPlayerSeries, SharedTypesOps,
};
use crate::{BackendState, PathManagerOps, ReplayCacheDatabase, ReplayInfo, TauriOverlayOps};

mod hotkeys;
mod overlay_actions;
mod overlay_payload;
mod replay_display;
mod window_placement;

pub use window_placement::{
    OverlayMonitorGeometry, OverlayWindowBoundsInput, OverlayWindowOffsets, OverlayWindowScale,
};

pub const MENU_ITEM_SHOW_CONFIG: &str = "show_config";
pub const MENU_ITEM_SHOW_OVERLAY: &str = "show_overlay";
pub const MENU_ITEM_QUIT: &str = "quit";
pub const OVERLAY_WINDOW_LABEL: &str = "overlay";
pub const SC2_OVERLAY_WINDOW_LABEL: &str = "sc2-overlay";
pub const PERFORMANCE_WINDOW_LABEL: &str = "performance";

pub const OVERLAY_REPLAY_PAYLOAD_EVENT: &str = "sco://overlay-replay-payload";
pub const OVERLAY_SHOW_HIDE_PLAYER_STATS_EVENT: &str = "sco://overlay-show-hide-player-stats";
pub const OVERLAY_PLAYER_STATS_EVENT: &str = "sco://overlay-player-stats";
pub const OVERLAY_INIT_COLORS_DURATION_EVENT: &str = "sco://overlay-init-colors-duration";
pub const OVERLAY_SHOWSTATS_EVENT: &str = "sco://overlay-showstats";
pub const OVERLAY_HIDESTATS_EVENT: &str = "sco://overlay-hidestats";
pub const OVERLAY_SHOWHIDE_EVENT: &str = "sco://overlay-showhide";
pub const OVERLAY_SET_SHOW_CHARTS_FROM_CONFIG_EVENT: &str =
    "sco://overlay-set-show-charts-from-config";
pub const OVERLAY_SCREENSHOT_REQUEST_EVENT: &str = "sco://overlay-screenshot-request";
pub const OVERLAY_FIRST_WIN_BONUS_TIMER_EVENT: &str = "sco://overlay-first-win-bonus-timer";
const FIRST_WIN_BONUS_TIMER_HIDE_TRANSITION: Duration = Duration::from_secs(1);

pub const OVERLAY_HOTKEY_DEFAULTS: [(&str, &str); 6] = [
    ("hotkey_show/hide", "Ctrl+Shift+*"),
    ("hotkey_show", ""),
    ("hotkey_hide", ""),
    ("hotkey_newer", "Ctrl+Alt+/"),
    ("hotkey_older", "Ctrl+Alt+*"),
    ("hotkey_winrates", "Ctrl+Alt+-"),
];

pub const OVERLAY_HOTKEY_BINDINGS: [(&str, &str); 7] = [
    ("hotkey_show/hide", "overlay_show_hide"),
    ("hotkey_show", "overlay_show"),
    ("hotkey_hide", "overlay_hide"),
    ("hotkey_newer", "overlay_newer"),
    ("hotkey_older", "overlay_older"),
    ("hotkey_winrates", "overlay_player_stats"),
    ("performance_hotkey", "performance_show_hide"),
];

pub struct OverlayInfoOps;

impl OverlayInfoOps {
    fn as_u32(value: u64) -> u32 {
        u32::try_from(value).unwrap_or(u32::MAX)
    }
}

impl OverlayInfoOps {
    fn as_u32_vec(values: &[u64]) -> Vec<u32> {
        values.iter().copied().map(OverlayInfoOps::as_u32).collect()
    }
}

impl OverlayInfoOps {
    fn overlay_mutator_name_with_dictionary(
        mutator_id: &str,
        dictionary: &Sc2DictionaryData,
    ) -> String {
        let canonical = if dictionary.mutator_data(mutator_id).is_some() {
            mutator_id.to_string()
        } else if let Some(mapped) = dictionary.mutator_id_from_name(mutator_id) {
            mapped.to_string()
        } else {
            mutator_id.to_string()
        };

        dictionary
            .mutator_data(&canonical)
            .map(|value| value.name.en.trim())
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
            .or_else(|| {
                dictionary
                    .mutator_ids
                    .get(&canonical)
                    .map(|value| value.to_string())
            })
            .unwrap_or_default()
    }
}

pub struct OverlayPlacement {
    monitor: usize,
    width: f64,
    height: f64,
    top_offset: i32,
    right_offset: i32,
    subtract_height: i32,
}

#[derive(Clone, Copy)]
pub struct RuntimeFlags {
    start_minimized: bool,
    minimize_to_tray: bool,
    auto_update: bool,
}

#[derive(Clone)]
pub struct ResolvedHotkeyBinding {
    path: &'static str,
    action: &'static str,
    shortcut: String,
    canonical: String,
}

impl OverlayPlacement {
    pub fn new(
        monitor: usize,
        width: f64,
        height: f64,
        top_offset: i32,
        right_offset: i32,
        subtract_height: i32,
    ) -> Self {
        Self {
            monitor,
            width,
            height,
            top_offset,
            right_offset,
            subtract_height,
        }
    }

    pub fn monitor(&self) -> usize {
        self.monitor
    }

    pub fn width(&self) -> f64 {
        self.width
    }

    pub fn height(&self) -> f64 {
        self.height
    }

    pub fn top_offset(&self) -> i32 {
        self.top_offset
    }

    pub fn right_offset(&self) -> i32 {
        self.right_offset
    }

    pub fn subtract_height(&self) -> i32 {
        self.subtract_height
    }
}

impl RuntimeFlags {
    pub fn new(start_minimized: bool, minimize_to_tray: bool, auto_update: bool) -> Self {
        Self {
            start_minimized,
            minimize_to_tray,
            auto_update,
        }
    }

    pub fn start_minimized(&self) -> bool {
        self.start_minimized
    }

    pub fn minimize_to_tray(&self) -> bool {
        self.minimize_to_tray
    }

    pub fn auto_update(&self) -> bool {
        self.auto_update
    }
}

impl ResolvedHotkeyBinding {
    pub fn new(
        path: &'static str,
        action: &'static str,
        shortcut: impl Into<String>,
        canonical: impl Into<String>,
    ) -> Self {
        Self {
            path,
            action,
            shortcut: shortcut.into(),
            canonical: canonical.into(),
        }
    }

    pub fn path(&self) -> &'static str {
        self.path
    }

    pub fn action(&self) -> &'static str {
        self.action
    }

    pub fn shortcut(&self) -> &str {
        &self.shortcut
    }

    pub fn canonical(&self) -> &str {
        &self.canonical
    }
}

impl OverlayInfoOps {
    fn request_overlay_screenshot(app: &tauri::AppHandle<Wry>) -> Result<String, String> {
        if app.get_webview_window(OVERLAY_WINDOW_LABEL).is_none() {
            return Err("Overlay window is not available".to_string());
        }

        let settings = app.state::<BackendState>().read_settings_memory();
        let path = settings.overlay_screenshot_output_path(SystemTime::now())?;
        let parent = path
            .parent()
            .ok_or_else(|| "Screenshot folder path is invalid".to_string())?;
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create screenshot folder: {error}"))?;
        app.emit(
            OVERLAY_SCREENSHOT_REQUEST_EVENT,
            OverlayScreenshotRequestPayload {
                path: path.display().to_string(),
            },
        )
        .map_err(|error| format!("Failed to request overlay screenshot: {error}"))?;
        Ok(path.display().to_string())
    }
}

impl OverlayInfoOps {
    fn is_png_signature(bytes: &[u8]) -> bool {
        const PNG_SIGNATURE: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];
        bytes.starts_with(&PNG_SIGNATURE)
    }
}

impl OverlayInfoOps {
    pub fn save_overlay_screenshot(path: &Path, png_bytes: &[u8]) -> Result<(), String> {
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case("png"))
            .unwrap_or(false);
        if !extension {
            return Err("Overlay screenshot path must end with .png".to_string());
        }
        if !OverlayInfoOps::is_png_signature(png_bytes) {
            return Err("Overlay screenshot data is not a PNG image".to_string());
        }

        let parent = path
            .parent()
            .ok_or_else(|| "Screenshot folder path is invalid".to_string())?;
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create screenshot folder: {error}"))?;
        std::fs::write(path, png_bytes)
            .map_err(|error| format!("Failed to write screenshot file: {error}"))
    }
}

impl OverlayInfoOps {
    pub fn reveal_file_in_explorer(file: &str) -> Result<(), String> {
        let original_path = Path::new(file);
        if !original_path.exists() {
            return Err("Replay file does not exist".to_string());
        }

        if cfg!(target_os = "windows") {
            let mut windows_path = original_path.to_string_lossy().replace('/', "\\");
            if let Some(stripped) = windows_path.strip_prefix(r"\\?\") {
                windows_path = stripped.to_string();
            }

            Command::new("explorer")
                .arg("/select,")
                .arg(&windows_path)
                .spawn()
                .map_err(|error| format!("failed to launch explorer: {error}"))?;
            return Ok(());
        }

        let path = original_path
            .canonicalize()
            .unwrap_or_else(|_| original_path.to_path_buf());

        if cfg!(target_os = "macos") {
            Command::new("open")
                .arg("-R")
                .arg(&path)
                .spawn()
                .map_err(|error| format!("failed to launch finder: {error}"))?;
            return Ok(());
        }

        if cfg!(target_family = "unix") {
            let uri_path = path.to_string_lossy().replace(' ', "%20");
            let file_uri = format!("file://{uri_path}");

            let dbus_status = Command::new("dbus-send")
                .args([
                    "--session",
                    "--dest=org.freedesktop.FileManager1",
                    "--type=method_call",
                    "/org/freedesktop/FileManager1",
                    "org.freedesktop.FileManager1.ShowItems",
                ])
                .arg(format!("array:string:\"{file_uri}\""))
                .arg("string:\"\"")
                .status();
            if dbus_status.map(|status| status.success()).unwrap_or(false) {
                return Ok(());
            }

            if let Some(parent) = path.parent() {
                Command::new("xdg-open")
                    .arg(parent)
                    .spawn()
                    .map_err(|error| format!("failed to launch file browser: {error}"))?;
                return Ok(());
            }

            Command::new("xdg-open")
                .arg(&path)
                .spawn()
                .map_err(|error| format!("failed to launch file browser: {error}"))?;
            return Ok(());
        }

        Err("File reveal is not supported on this platform".to_string())
    }
}

impl OverlayInfoOps {
    fn existing_folder_path(folder: &str) -> Result<PathBuf, String> {
        let trimmed = folder.trim();
        if trimmed.is_empty() {
            return Err("Folder path is empty".to_string());
        }

        let path = PathBuf::from(trimmed);
        if !path.exists() {
            return Err("Folder does not exist".to_string());
        }
        if !path.is_dir() {
            return Err("Path is not a folder".to_string());
        }

        Ok(path)
    }
}

impl OverlayInfoOps {
    pub fn open_folder_in_explorer(folder: &str) -> Result<(), String> {
        let path = OverlayInfoOps::existing_folder_path(folder)?;

        if cfg!(target_os = "windows") {
            Command::new("explorer")
                .arg(&path)
                .spawn()
                .map_err(|error| format!("failed to launch explorer: {error}"))?;
            return Ok(());
        }

        if cfg!(target_os = "macos") {
            Command::new("open")
                .arg(&path)
                .spawn()
                .map_err(|error| format!("failed to launch finder: {error}"))?;
            return Ok(());
        }

        if cfg!(target_family = "unix") {
            Command::new("xdg-open")
                .arg(&path)
                .spawn()
                .map_err(|error| format!("failed to launch file browser: {error}"))?;
            return Ok(());
        }

        Err("Folder opening is not supported on this platform".to_string())
    }
}

impl OverlayInfoOps {
    pub fn sync_overlay_runtime_settings<R: Runtime>(app: &tauri::AppHandle<R>) {
        let state = app.state::<crate::BackendState>();
        let settings = state.read_settings_memory();
        let (session_victories, session_defeats) = state.session_counts();
        let prestige_names = state
            .dictionary_data()
            .map(|dictionary| {
                dictionary
                    .prestige_names_json
                    .iter()
                    .map(|(key, value)| {
                        (
                            key.clone(),
                            LocalizedLabels {
                                en: value.en.clone(),
                                ko: value.ko.clone(),
                                zh_cn: Some(value.zh_cn.clone()),
                            },
                        )
                    })
                    .collect::<BTreeMap<_, _>>()
            })
            .unwrap_or_default();
        let payload = settings.overlay_runtime_settings_payload(
            session_victories,
            session_defeats,
            prestige_names,
        );
        let _ = app.emit(OVERLAY_INIT_COLORS_DURATION_EVENT, payload);
    }
}

impl OverlayInfoOps {
    pub fn sc2_overlay_should_sync(replay_overlay_active: bool) -> bool {
        !replay_overlay_active
    }

    fn first_win_bonus_timer_hide_delay_elapsed(state: &BackendState) -> bool {
        state.start_first_win_bonus_timer_hide_delay_if_needed(
            crate::today_win_bonus::FIRST_WIN_BONUS_TIMER_POLL_INTERVAL,
        );
        state.first_win_bonus_timer_hide_delay_elapsed()
    }
}

impl OverlayInfoOps {
    pub fn apply_sc2_overlay_window_bounds<R: Runtime>(
        window: &tauri::WebviewWindow<R>,
        rect: crate::ScreenRect,
    ) -> Result<(), String> {
        let (target_size, target_position) =
            OverlayInfoOps::sc2_overlay_window_bounds_for_rect(rect);
        let current_size = window
            .outer_size()
            .map_err(|error| format!("Failed to read SC2 overlay size: {error}"))?;
        let current_position = window
            .outer_position()
            .map_err(|error| format!("Failed to read SC2 overlay position: {error}"))?;

        if !OverlayInfoOps::overlay_window_size_matches_target(current_size, target_size) {
            window
                .set_size(target_size)
                .map_err(|error| format!("Failed to resize SC2 overlay: {error}"))?;
        }
        if current_position != target_position {
            window
                .set_position(target_position)
                .map_err(|error| format!("Failed to move SC2 overlay: {error}"))?;
        }

        Ok(())
    }

    pub fn sync_sc2_overlay_window_to_sc2<R: Runtime>(
        app: &tauri::AppHandle<R>,
    ) -> Result<bool, String> {
        let Some(window) = app.get_webview_window(SC2_OVERLAY_WINDOW_LABEL) else {
            return Ok(false);
        };
        let state = app.state::<BackendState>();
        if !OverlayInfoOps::sc2_overlay_should_sync(state.overlay_replay_data_active()) {
            let _ = window.hide();
            return Ok(false);
        }
        let Some(rect) = crate::today_win_bonus::TodayWinBonusDetector::sc2_window_rect()? else {
            if window.is_visible().unwrap_or(false) && state.sc2_overlay_keep_visible_active() {
                return Ok(false);
            }
            if window.is_visible().unwrap_or(false) && state.first_win_bonus_timer_visible() {
                if !OverlayInfoOps::first_win_bonus_timer_hide_delay_elapsed(&state) {
                    return Ok(false);
                }
                let payload = OverlayInfoOps::first_win_bonus_timer_hide_payload(&state);
                OverlayInfoOps::emit_first_win_bonus_timer(app, payload);
                return Ok(false);
            }
            state.clear_sc2_overlay_keep_visible();
            let _ = window.hide();
            return Ok(false);
        };

        state.clear_sc2_overlay_keep_visible();
        OverlayInfoOps::apply_sc2_overlay_window_bounds(&window, rect)?;
        let _ = window.set_always_on_top(true);
        let _ = window.set_skip_taskbar(true);
        let _ = window.set_focusable(false);
        let _ = window.set_ignore_cursor_events(true);
        if !window.is_visible().unwrap_or(false) {
            window
                .show()
                .map_err(|error| format!("Failed to show SC2 overlay: {error}"))?;
        }

        Ok(true)
    }

    fn first_win_bonus_timer_hide_payload(state: &BackendState) -> FirstWinBonusTimerPayload {
        let settings = state.read_settings_memory();
        crate::today_win_bonus::FirstWinBonusTimerStatus::payload_for_settings(
            &settings,
            chrono::Utc::now(),
            false,
        )
    }

    pub fn emit_first_win_bonus_timer<R: Runtime>(
        app: &tauri::AppHandle<R>,
        payload: FirstWinBonusTimerPayload,
    ) {
        let state = app.state::<BackendState>();
        state.set_first_win_bonus_timer_visible(payload.visible);
        state.clear_first_win_bonus_timer_hide_delay();
        if payload.visible {
            state.clear_sc2_overlay_keep_visible();
            OverlayInfoOps::show_sc2_overlay_window(app);
        } else {
            state.keep_sc2_overlay_visible_for(FIRST_WIN_BONUS_TIMER_HIDE_TRANSITION);
        }
        let _ = app.emit(OVERLAY_FIRST_WIN_BONUS_TIMER_EVENT, payload);
    }
}

impl OverlayInfoOps {
    pub fn show_sc2_overlay_window<R: Runtime>(app: &tauri::AppHandle<R>) {
        OverlayInfoOps::sync_overlay_runtime_settings(app);
        if let Err(error) = OverlayInfoOps::sync_sc2_overlay_window_to_sc2(app) {
            crate::sco_warn!("[SCO/sc2-overlay] Failed to show SC2 overlay: {error}");
        }
    }
}

impl OverlayInfoOps {
    pub fn hide_sc2_overlay_window<R: Runtime>(app: &tauri::AppHandle<R>) {
        if let Some(window) = app.get_webview_window(SC2_OVERLAY_WINDOW_LABEL) {
            let _ = window.hide();
        }
    }
}

impl OverlayInfoOps {
    pub fn spawn_sc2_overlay_window_tracker(app: tauri::AppHandle<Wry>) {
        thread::spawn(move || {
            let mut last_error: Option<String> = None;
            loop {
                thread::sleep(Duration::from_millis(500));
                match OverlayInfoOps::sync_sc2_overlay_window_to_sc2(&app) {
                    Ok(_) => {
                        last_error = None;
                    }
                    Err(error) => {
                        if last_error.as_deref() != Some(error.as_str()) {
                            crate::sco_warn!(
                                "[SCO/sc2-overlay] Failed to sync SC2 overlay bounds: {error}"
                            );
                        }
                        last_error = Some(error);
                    }
                }
            }
        });
    }
}

impl OverlayInfoOps {
    pub fn show_overlay_window<R: Runtime>(app: &tauri::AppHandle<R>) {
        OverlayInfoOps::sync_overlay_runtime_settings(app);
        OverlayInfoOps::hide_sc2_overlay_window(app);
        if let Some(overlay_window) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
            let _ = overlay_window.set_focusable(false);
            let _ = overlay_window.show();
        }
    }
}

impl OverlayInfoOps {
    pub fn hide_overlay_window<R: Runtime>(app: &tauri::AppHandle<R>) {
        if let Some(overlay_window) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
            let _ = overlay_window.hide();
        }
    }
}

impl OverlayInfoOps {
    pub fn show_config_window<R: Runtime>(app: &tauri::AppHandle<R>) {
        if let Some(config_window) = app.get_webview_window("config") {
            let _ = config_window.show();
            let _ = config_window.set_focus();
        }
    }
}

impl OverlayInfoOps {
    pub fn build_tray_menu<R: Runtime>(app: &tauri::AppHandle<R>) -> Option<tauri::menu::Menu<R>> {
        let language = app.state::<BackendState>().read_settings_memory().overlay_language();
        let (show_config, show_overlay, quit) = match language {
            "zh-CN" => ("显示设置", "显示悬浮窗", "退出"),
            "ko" => ("설정 표시", "오버레이 표시", "종료"),
            _ => ("Show Config", "Show Overlay", "Quit"),
        };
        let show_item = MenuItem::with_id(
            app,
            MENU_ITEM_SHOW_CONFIG,
            show_config,
            true,
            None::<&str>,
        )
        .inspect_err(|error| {
            crate::sco_error!("Failed to create tray menu item '{MENU_ITEM_SHOW_CONFIG}': {error}");
        })
        .ok()?;

        let show_overlay_item = MenuItem::with_id(
            app,
            MENU_ITEM_SHOW_OVERLAY,
            show_overlay,
            true,
            None::<&str>,
        )
        .inspect_err(|error| {
            crate::sco_error!(
                "Failed to create tray menu item '{MENU_ITEM_SHOW_OVERLAY}': {error}"
            );
        })
        .ok()?;

        let quit_item = MenuItem::with_id(app, MENU_ITEM_QUIT, quit, true, None::<&str>)
            .inspect_err(|error| {
                crate::sco_error!("Failed to create tray menu item '{MENU_ITEM_QUIT}': {error}");
            })
            .ok()?;

        MenuBuilder::new(app)
            .items(&[&show_item, &show_overlay_item, &quit_item])
            .build()
            .ok()
    }
}
