use std::time::Duration;

use crate::commands::{config, replays, stats, system};
use crate::services::{app_lifecycle::AppLifecycleService, tray::TrayState};

mod active_window;
mod app_settings;
mod autostart;
mod backend_state;
#[cfg(any(windows, test))]
mod bounded_process;
mod command_payloads;
mod commands;
mod db;
mod game_launch_detector;
mod live_game;
mod logging;
mod monitor_settings;
mod overlay_info;
mod path_manager;
mod payload_ops;
mod performance_overlay;
mod randomizer;
mod replay_analysis;
mod replay_info;
mod replay_ops;
mod replay_scan_progress;
mod replay_state;
mod replay_visual;
mod sc2_game_state;
mod services;
mod shared_types;
mod stats_aggregation;
mod stats_ops;
mod stats_query;
mod stats_state;
mod stats_units;
mod system_ops;
mod test_helper;
mod today_win_bonus;

pub use active_window::{
    ActiveWindowDetector, ActiveWindowInfo, ActiveWindowListener, ActiveWindowRect,
};
pub use app_settings::{AppSettings, PlayerNotes, RandomizerChoices};
pub use backend_state::BackendState;
pub use command_payloads::{
    AnalysisCompletedPayload, AnalysisStatusPayload, ConfigChatPayload, ConfigPayload,
    ConfigPlayersPayload, ConfigReplayVisualPayload, ConfigReplaysPayload, ConfigWeekliesPayload,
    OverlayActionResponse, OverlayActionResult, StatsActionPayload, StatsAnalysisPayload,
    StatsStatePayload,
};
pub use db::{
    QueuedReplayCacheEntrySink, ReplayCacheDatabase, ReplayCacheDbError,
    ReplayCacheDifficultyFilter, ReplayCacheEntryQuery, ReplayCacheGameSortKey,
    ReplayCacheGamesPageQuery, ReplayCachePage, ReplayCachePageResult, ReplayCachePlayerNote,
    ReplayCachePlayerSortKey, ReplayCachePlayersPageQuery, ReplayCacheReadScope,
    ReplayCacheSortDirection, ReplayCacheStatisticsPayload, ReplayCacheStatsDifficultyExclusion,
    ReplayCacheStatsQuery, ReplayCacheWriteQueue, ReplayCacheWriteResult,
    ReplayCacheWriteSendError, ReplayCacheWriteSender, SqliteReplayCacheEntrySink,
};
pub use game_launch_detector::{GameLaunchDetector, GameLaunchStatus};
#[doc(hidden)]
pub use log as __log;
pub use logging::LoggingOps;
pub use monitor_settings::{MonitorDescriptor, MonitorSettingsOps};
pub use overlay_info::{
    OverlayInfoOps, OverlayMonitorGeometry, OverlayWindowBoundsInput, OverlayWindowOffsets,
    OverlayWindowScale, ResolvedHotkeyBinding,
};
pub use path_manager::PathManagerOps;
pub use randomizer::{RandomizerMutatorResult, RandomizerOps, RandomizerRequest, RandomizerResult};
pub use replay_analysis::{
    PlayerRowPayload, ReplayAnalysis, ReplayAnalysisOps, StatsResponseBuildInput, WeeklyRowPayload,
};
pub use replay_info::{
    CommanderUnitRollup, GamesRowPayload, ReplayChatMessage, ReplayChatPayload, ReplayInfo,
    ReplayPlayerInfo, UnitStatsRollup,
};
pub use replay_visual::{
    ReplayVisualAssault, ReplayVisualBuildInput, ReplayVisualContext, ReplayVisualDictionaries,
    ReplayVisualFrame, ReplayVisualMapSize, ReplayVisualOps, ReplayVisualOwnerKind,
    ReplayVisualPayload, ReplayVisualPlayer, ReplayVisualReplayInfo, ReplayVisualUnit,
    ReplayVisualUnitCount, ReplayVisualUnitGroup,
};
pub use sc2_game_state::{Sc2GameState, Sc2GameStateTracker, Sc2GameStateTransition};
pub use services::windows::WindowCloseAction;
pub use shared_types::*;
pub use stats_state::{
    AnalysisMode, StartupAnalysisRequestOutcome, StartupAnalysisTrigger, StatsSnapshot, StatsState,
};
pub use test_helper::TestHelperOps;
pub use today_win_bonus::{
    FirstWinBonusAcquiredTime, FirstWinBonusTimerStatus, ImageprocTodayWinBonusDigitReader,
    MonitorCaptureRegion, ScreenRect, TODAY_WIN_BONUS_SETTINGS_KEY,
    TodayWinBonusCaptureFallbackState, TodayWinBonusDetection, TodayWinBonusDetector,
    TodayWinBonusDigitReader, TodayWinBonusWindowCapture,
    WINDOW_CAPTURE_FAILURES_BEFORE_REGION_FALLBACK,
};

#[macro_export]
macro_rules! sco_error {
    ($($arg:tt)*) => {{
        $crate::__log::error!($($arg)*);
    }};
}

#[macro_export]
macro_rules! sco_warn {
    ($($arg:tt)*) => {{
        $crate::__log::warn!($($arg)*);
    }};
}

#[macro_export]
macro_rules! sco_info {
    ($($arg:tt)*) => {{
        $crate::__log::info!($($arg)*);
    }};
}

#[macro_export]
macro_rules! sco_debug {
    ($($arg:tt)*) => {{
        $crate::__log::debug!($($arg)*);
    }};
}

#[macro_export]
macro_rules! sco_trace {
    ($($arg:tt)*) => {{
        $crate::__log::trace!($($arg)*);
    }};
}

pub const UNLIMITED_REPLAY_LIMIT: usize = 0;
pub const SC2_GAME_STARTING_DISPLAY_DURATION: Duration = Duration::from_secs(12);

pub struct TauriOverlayOps;

pub const OVERLAY_RUNTIME_SETTING_KEYS: [&str; 9] = [
    "color_player1",
    "color_player2",
    "color_amon",
    "color_mastery",
    "duration",
    "show_session",
    "show_charts",
    "hide_nicknames_in_overlay",
    "language",
];

pub const OVERLAY_HOTKEY_SETTING_KEYS: [&str; 7] = [
    "hotkey_show/hide",
    "hotkey_show",
    "hotkey_hide",
    "hotkey_newer",
    "hotkey_older",
    "hotkey_winrates",
    "performance_hotkey",
];

pub const OVERLAY_PLACEMENT_SETTING_KEYS: [&str; 1] = ["monitor"];

pub struct TauriOverlayApp;

impl TauriOverlayApp {
    #[cfg_attr(mobile, tauri::mobile_entry_point)]
    pub fn run() {
        LoggingOps::initialize_env_logger();

        let settings = AppSettings::from_saved_file();

        let state = BackendState::new_with_settings(settings.clone());

        tauri::Builder::default()
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(
                tauri_plugin_autostart::Builder::new()
                    .app_name(TauriOverlayOps::autostart_registration_name())
                    .build(),
            )
            .manage(state)
            .manage(TrayState::default())
            .plugin(tauri_plugin_opener::init())
            .plugin(tauri_plugin_global_shortcut::Builder::new().build())
            .on_menu_event(AppLifecycleService::handle_menu_event)
            .on_window_event(AppLifecycleService::handle_window_event)
            .setup(AppLifecycleService::setup_app)
            .invoke_handler(tauri::generate_handler![
                config::config_get,
                config::config_update,
                replays::config_replays_get,
                config::config_players_get,
                config::config_weeklies_get,
                stats::config_stats_get,
                stats::config_analysis_status_get,
                replays::config_replay_show,
                replays::config_replay_chat,
                replays::config_replay_visual,
                replays::config_replay_move,
                config::config_action,
                stats::config_stats_action,
                system::pick_folder,
                system::performance_start_drag,
                system::is_dev,
                system::save_overlay_screenshot,
                system::open_folder_path
            ])
            .run(tauri::generate_context!())
            .expect("error while running tauri");
    }
}
mod desktop_shortcut;
