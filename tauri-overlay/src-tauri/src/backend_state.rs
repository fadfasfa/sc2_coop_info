mod analysis_tasks;
mod player_stats;
mod replays;

use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use s2coop_analyzer::detailed_replay_analysis::{
    GenerateCacheStopController, ReplayAnalysisResources,
};
use s2coop_analyzer::dictionary_data::Sc2DictionaryData;
use serde::Serialize;
use serde_json::Value;

use crate::replay_scan_progress::ReplayScanProgress;
use crate::replay_state::ReplayState;
use crate::services::replay_watcher::ReplayWatcherMessage;
use crate::{
    AppSettings, FirstWinBonusAcquiredTime, Sc2GameState, Sc2GameStateTracker,
    Sc2GameStateTransition, StatsState,
    monitor_settings::MonitorDescriptor,
    overlay_info::{ResolvedHotkeyBinding, RuntimeFlags},
};

#[derive(Default)]
enum CachedLoad<T> {
    #[default]
    Uninitialized,
    Loaded(Arc<T>),
    Failed(String),
}

struct BackendStateOps;

impl BackendStateOps {
    fn load_cached_state<T, F>(slot: &Mutex<CachedLoad<T>>, loader: F) -> Result<Arc<T>, String>
    where
        F: FnOnce() -> Result<Arc<T>, String>,
    {
        let mut slot = slot.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        match &*slot {
            CachedLoad::Loaded(value) => Ok(value.clone()),
            CachedLoad::Failed(error) => Err(error.clone()),
            CachedLoad::Uninitialized => {
                let loaded = loader();
                match loaded {
                    Ok(value) => {
                        *slot = CachedLoad::Loaded(value.clone());
                        Ok(value)
                    }
                    Err(error) => {
                        *slot = CachedLoad::Failed(error.clone());
                        Err(error)
                    }
                }
            }
        }
    }
}

pub struct BackendState {
    stats: Arc<Mutex<StatsState>>,
    stats_current_replay_files: Arc<Mutex<HashSet<String>>>,
    overlay_replay_data_active: AtomicBool,
    sc2_overlay_keep_visible_until_millis: AtomicU64,
    latest_sc2_monitor: Arc<Mutex<Option<MonitorDescriptor>>>,
    first_win_bonus_timer_visible: AtomicBool,
    first_win_bonus_timer_hide_after_millis: AtomicU64,
    latest_replay_file_modified_time_seconds: AtomicU64,
    session_victories: AtomicU64,
    session_defeats: AtomicU64,
    active_settings: Arc<Mutex<AppSettings>>,
    detailed_cache_persist_lock: Arc<Mutex<()>>,
    discovered_main_names: Arc<Mutex<HashMap<String, HashSet<String>>>>,
    discovered_main_handles: Arc<Mutex<HashMap<String, HashSet<String>>>>,
    replay_scan_in_flight: Arc<AtomicBool>,
    players_scan_in_flight: Arc<AtomicBool>,
    app_exit_in_progress: Arc<AtomicBool>,
    replay_scan_progress: Arc<ReplayScanProgress>,
    delayed_player_stats_popup_generation: Arc<AtomicU64>,
    hotkey_action_inflight: Arc<AtomicBool>,
    active_hotkey_reassign_path: Arc<Mutex<Option<String>>>,
    active_hotkey_reassign_binding: Arc<Mutex<Option<ResolvedHotkeyBinding>>>,
    detailed_analysis_stop_controller: Arc<Mutex<Option<Arc<GenerateCacheStopController>>>>,
    performance_edit_mode: Arc<AtomicBool>,
    file_logging_enabled: Arc<AtomicBool>,
    replay_watcher_sender: Arc<Mutex<Option<mpsc::Sender<ReplayWatcherMessage>>>>,
    replay_state: Arc<Mutex<ReplayState>>,
    sc2_game_state: Arc<Mutex<Sc2GameStateTracker>>,
    analyzer_data_dir: PathBuf,
    dictionary_data: Arc<Mutex<CachedLoad<Sc2DictionaryData>>>,
    replay_analysis_resources: Arc<Mutex<CachedLoad<ReplayAnalysisResources>>>,
}

impl BackendStateOps {
    fn as_u32(value: u64) -> u32 {
        u32::try_from(value).unwrap_or(u32::MAX)
    }

    fn system_time_millis() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| u64::try_from(duration.as_millis()).unwrap_or(u64::MAX))
            .unwrap_or(0)
    }
}

impl Default for BackendState {
    fn default() -> Self {
        Self::new()
    }
}

impl BackendState {
    pub fn new() -> Self {
        Self::new_with_settings(AppSettings::default())
    }

    pub fn new_with_settings(settings: AppSettings) -> Self {
        let file_logging_enabled = settings.enable_logging();
        Self {
            stats: Arc::new(Mutex::new(StatsState::from_settings(&settings))),
            stats_current_replay_files: Arc::new(Mutex::new(HashSet::new())),
            overlay_replay_data_active: AtomicBool::new(false),
            sc2_overlay_keep_visible_until_millis: AtomicU64::new(0),
            latest_sc2_monitor: Arc::new(Mutex::new(None)),
            first_win_bonus_timer_visible: AtomicBool::new(false),
            first_win_bonus_timer_hide_after_millis: AtomicU64::new(0),
            latest_replay_file_modified_time_seconds: AtomicU64::new(0),
            session_victories: AtomicU64::new(0),
            session_defeats: AtomicU64::new(0),
            active_settings: Arc::new(Mutex::new(settings)),
            detailed_cache_persist_lock: Arc::new(Mutex::new(())),
            discovered_main_names: Arc::new(Mutex::new(HashMap::new())),
            discovered_main_handles: Arc::new(Mutex::new(HashMap::new())),
            replay_scan_in_flight: Arc::new(AtomicBool::new(false)),
            players_scan_in_flight: Arc::new(AtomicBool::new(false)),
            app_exit_in_progress: Arc::new(AtomicBool::new(false)),
            replay_scan_progress: Arc::new(ReplayScanProgress::default()),
            delayed_player_stats_popup_generation: Arc::new(AtomicU64::new(0)),
            hotkey_action_inflight: Arc::new(AtomicBool::new(false)),
            active_hotkey_reassign_path: Arc::new(Mutex::new(None)),
            active_hotkey_reassign_binding: Arc::new(Mutex::new(None)),
            detailed_analysis_stop_controller: Arc::new(Mutex::new(None)),
            performance_edit_mode: Arc::new(AtomicBool::new(false)),
            file_logging_enabled: Arc::new(AtomicBool::new(file_logging_enabled)),
            replay_watcher_sender: Arc::new(Mutex::new(None)),
            replay_state: Arc::new(Mutex::new(ReplayState::new())),
            sc2_game_state: Arc::new(Mutex::new(Sc2GameStateTracker::new(Instant::now()))),
            analyzer_data_dir: crate::path_manager::PathManagerOps::get_json_data_dir(),
            dictionary_data: Arc::new(Mutex::new(CachedLoad::Uninitialized)),
            replay_analysis_resources: Arc::new(Mutex::new(CachedLoad::Uninitialized)),
        }
    }

    pub fn analyzer_data_dir(&self) -> PathBuf {
        self.analyzer_data_dir.clone()
    }

    pub fn stats_handle(&self) -> Arc<Mutex<StatsState>> {
        self.stats.clone()
    }

    pub fn stats_current_replay_files_handle(&self) -> Arc<Mutex<HashSet<String>>> {
        self.stats_current_replay_files.clone()
    }

    pub fn overlay_replay_data_active(&self) -> bool {
        self.overlay_replay_data_active.load(Ordering::Acquire)
    }

    pub fn set_overlay_replay_data_active(&self, active: bool) {
        self.overlay_replay_data_active
            .store(active, Ordering::Release);
    }

    pub fn latest_sc2_monitor(&self) -> Option<MonitorDescriptor> {
        self.latest_sc2_monitor
            .lock()
            .ok()
            .and_then(|monitor| monitor.clone())
    }

    pub fn set_latest_sc2_monitor(&self, monitor: MonitorDescriptor) {
        if let Ok(mut latest) = self.latest_sc2_monitor.lock() {
            *latest = Some(monitor);
        }
    }

    pub fn enter_player_stats_overlay_mode(&self) {
        self.set_overlay_replay_data_active(false);
    }

    pub fn keep_sc2_overlay_visible_for(&self, duration: Duration) {
        let duration_millis = u64::try_from(duration.as_millis()).unwrap_or(u64::MAX);
        let deadline = BackendStateOps::system_time_millis().saturating_add(duration_millis);
        self.sc2_overlay_keep_visible_until_millis
            .store(deadline, Ordering::Release);
    }

    pub fn sc2_overlay_keep_visible_active(&self) -> bool {
        let current_deadline = self
            .sc2_overlay_keep_visible_until_millis
            .load(Ordering::Acquire);
        current_deadline != 0 && BackendStateOps::system_time_millis() < current_deadline
    }

    pub fn clear_sc2_overlay_keep_visible(&self) {
        self.sc2_overlay_keep_visible_until_millis
            .store(0, Ordering::Release);
    }

    pub fn first_win_bonus_timer_visible(&self) -> bool {
        self.first_win_bonus_timer_visible.load(Ordering::Acquire)
    }

    pub fn set_first_win_bonus_timer_visible(&self, visible: bool) {
        self.first_win_bonus_timer_visible
            .store(visible, Ordering::Release);
    }

    pub fn start_first_win_bonus_timer_hide_delay_if_needed(&self, duration: Duration) {
        let current_deadline = self
            .first_win_bonus_timer_hide_after_millis
            .load(Ordering::Acquire);
        if current_deadline != 0 {
            return;
        }

        let duration_millis = u64::try_from(duration.as_millis()).unwrap_or(u64::MAX);
        let deadline = BackendStateOps::system_time_millis().saturating_add(duration_millis);
        let _ = self
            .first_win_bonus_timer_hide_after_millis
            .compare_exchange(0, deadline, Ordering::AcqRel, Ordering::Acquire);
    }

    pub fn first_win_bonus_timer_hide_delay_elapsed(&self) -> bool {
        let current_deadline = self
            .first_win_bonus_timer_hide_after_millis
            .load(Ordering::Acquire);
        current_deadline != 0 && BackendStateOps::system_time_millis() >= current_deadline
    }

    pub fn clear_first_win_bonus_timer_hide_delay(&self) {
        self.first_win_bonus_timer_hide_after_millis
            .store(0, Ordering::Release);
    }

    pub fn update_latest_replay_file_modified_time_seconds(
        &self,
        replay_file_modified_time_seconds: u64,
    ) {
        if replay_file_modified_time_seconds == 0 {
            return;
        }

        self.latest_replay_file_modified_time_seconds
            .fetch_max(replay_file_modified_time_seconds, Ordering::AcqRel);
    }

    pub fn update_latest_replay_file_modified_time(
        &self,
        replay_file: &Path,
    ) -> Result<Option<u64>, String> {
        let acquired_time = FirstWinBonusAcquiredTime::from_replay_file_modified_time(replay_file)?;
        if let Some(acquired_time) = acquired_time {
            let seconds = acquired_time.replay_file_modified_time_seconds();
            self.update_latest_replay_file_modified_time_seconds(seconds);
            Ok(Some(seconds))
        } else {
            Ok(None)
        }
    }

    pub fn latest_observed_replay_file_modified_time_seconds(&self) -> Option<u64> {
        match self
            .latest_replay_file_modified_time_seconds
            .load(Ordering::Acquire)
        {
            0 => None,
            seconds => Some(seconds),
        }
    }

    pub fn latest_replay_file_modified_time_seconds(&self) -> Option<u64> {
        self.latest_observed_replay_file_modified_time_seconds()
    }

    pub fn sc2_game_state(&self) -> Sc2GameState {
        self.sc2_game_state
            .lock()
            .map(|tracker| tracker.state())
            .unwrap_or(Sc2GameState::Lobby)
    }

    pub fn sc2_game_state_should_poll_live_game(&self) -> bool {
        self.sc2_game_state
            .lock()
            .map(|tracker| tracker.should_poll_live_game())
            .unwrap_or(true)
    }

    pub fn transition_sc2_game_state(
        &self,
        next_state: Sc2GameState,
        now: Instant,
    ) -> Option<Sc2GameStateTransition> {
        self.sc2_game_state
            .lock()
            .ok()
            .and_then(|mut tracker| tracker.transition_to(next_state, now))
    }

    pub fn advance_sc2_game_state_timers(
        &self,
        now: Instant,
        game_starting_duration: Duration,
        game_ended_duration: Duration,
    ) -> Option<Sc2GameStateTransition> {
        self.sc2_game_state.lock().ok().and_then(|mut tracker| {
            tracker.advance_timed_transitions(now, game_starting_duration, game_ended_duration)
        })
    }

    pub fn clear_stats_current_replay_files(&self) {
        if let Ok(mut current_replay_files) = self.stats_current_replay_files.lock() {
            current_replay_files.clear();
        }
    }

    pub fn dictionary_data(&self) -> Result<Arc<Sc2DictionaryData>, String> {
        BackendStateOps::load_cached_state(&self.dictionary_data, || {
            Sc2DictionaryData::load(Some(self.analyzer_data_dir()))
                .map(Arc::new)
                .map_err(|error| format!("Failed to load dictionary data: {error}"))
        })
    }

    pub fn replay_analysis_resources(&self) -> Result<Arc<ReplayAnalysisResources>, String> {
        BackendStateOps::load_cached_state(&self.replay_analysis_resources, || {
            let dictionary_data = self.dictionary_data()?;
            ReplayAnalysisResources::from_dictionary_data(dictionary_data)
                .map(Arc::new)
                .map_err(|error| format!("Failed to build replay analysis resources: {error}"))
        })
    }

    pub fn warm_dictionary_data(&self) {
        let _ = self.dictionary_data();
    }

    pub fn warm_replay_analysis_resources(&self) {
        let _ = self.replay_analysis_resources();
    }

    pub fn read_settings_memory(&self) -> AppSettings {
        self.active_settings
            .lock()
            .map(|settings| settings.clone())
            .unwrap_or_else(|_| AppSettings::from_saved_file())
    }

    pub fn runtime_flags(&self) -> RuntimeFlags {
        self.read_settings_memory().runtime_flags()
    }

    pub fn set_replay_watcher_sender(&self, sender: Option<mpsc::Sender<ReplayWatcherMessage>>) {
        if let Ok(mut cached_sender) = self.replay_watcher_sender.lock() {
            *cached_sender = sender;
        }
    }

    pub fn request_replay_watcher_root_refresh(&self) {
        let sender = self
            .replay_watcher_sender
            .lock()
            .ok()
            .and_then(|cached_sender| cached_sender.clone());
        if let Some(sender) = sender
            && sender.send(ReplayWatcherMessage::RefreshRoot).is_err()
        {
            crate::sco_warn!("[SCO/watch] failed to request replay watcher root refresh");
        }
    }

    pub fn append_log_line_if_enabled(&self, message: &str) {
        if !self.file_logging_enabled() {
            return;
        }

        if let Err(error) = crate::logging::LoggingOps::append_line(message) {
            eprintln!("[SCO/log] {error}");
        }
    }

    pub fn log_request(&self, method: &str, path: &str, body: &Option<Value>) {
        let serialized_body = body.as_ref().map(|payload| {
            serde_json::to_string(payload).unwrap_or_else(|_| "<invalid-json>".into())
        });
        if let Some(serialized_body) = serialized_body {
            crate::sco_debug!(
                "[SCO/request] method={} path={} body={}",
                method,
                path,
                serialized_body
            );
        } else {
            crate::sco_debug!("[SCO/request] method={} path={}", method, path);
        }
    }

    pub fn replace_active_settings(&self, value: &AppSettings) -> AppSettings {
        let sanitized = AppSettings::merge_settings_with_defaults(value.to_value());

        if let Ok(mut cached_settings) = self.active_settings.lock() {
            *cached_settings = sanitized.clone();
        }

        self.file_logging_enabled
            .store(sanitized.enable_logging(), Ordering::Release);
        self.clear_main_identity_cache();
        sanitized
    }

    pub fn write_settings_file(&self, value: &AppSettings) -> Result<AppSettings, String> {
        let sanitized = value.write_saved_settings_file()?;

        self.replace_active_settings(&sanitized);
        Ok(sanitized)
    }

    pub fn persist_single_setting_value(&self, key: &str, value: Value) -> Result<(), String> {
        let previous_settings = AppSettings::from_saved_file();
        let mut saved_map = match previous_settings.to_value() {
            Value::Object(map) => map,
            _ => serde_json::Map::new(),
        };
        saved_map.insert(key.to_string(), value.clone());

        let saved_settings = AppSettings::merge_settings_with_defaults(Value::Object(saved_map));
        saved_settings.write_saved_settings_file()?;

        let current_settings = self.read_settings_memory();
        let mut active_map = match current_settings.to_value() {
            Value::Object(map) => map,
            _ => serde_json::Map::new(),
        };
        active_map.insert(key.to_string(), value);

        let active_settings = AppSettings::merge_settings_with_defaults(Value::Object(active_map));
        self.replace_active_settings(&active_settings);
        Ok(())
    }

    pub fn persist_serialized_setting_value<T: Serialize>(
        &self,
        key: &str,
        value: &T,
    ) -> Result<(), String> {
        let json_value = serde_json::to_value(value)
            .map_err(|error| format!("Failed to serialize setting: {error}"))?;
        self.persist_single_setting_value(key, json_value)
    }

    pub fn persist_bool_setting(&self, key: &str, value: bool) -> Result<(), String> {
        self.persist_single_setting_value(key, Value::Bool(value))
    }

    pub fn detailed_cache_persist_lock(&self) -> Arc<Mutex<()>> {
        self.detailed_cache_persist_lock.clone()
    }

    pub fn replay_scan_progress(&self) -> Arc<ReplayScanProgress> {
        self.replay_scan_progress.clone()
    }

    pub fn replay_scan_in_flight(&self) -> Arc<AtomicBool> {
        self.replay_scan_in_flight.clone()
    }

    pub fn file_logging_enabled(&self) -> bool {
        self.file_logging_enabled.load(Ordering::Acquire)
    }

    pub fn resolved_overlay_hotkey_bindings(&self) -> Vec<ResolvedHotkeyBinding> {
        self.read_settings_memory()
            .resolved_overlay_hotkey_bindings()
    }

    pub fn performance_edit_mode(&self) -> bool {
        self.performance_edit_mode.load(Ordering::Acquire)
    }

    pub fn set_performance_edit_mode(&self, enabled: bool) {
        self.performance_edit_mode.store(enabled, Ordering::Release);
    }

    pub fn try_begin_exit(&self) -> bool {
        self.app_exit_in_progress
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
            .is_ok()
    }

    pub fn exit_in_progress(&self) -> bool {
        self.app_exit_in_progress.load(Ordering::Acquire)
    }

    pub fn delayed_player_stats_popup_generation(&self) -> u64 {
        self.delayed_player_stats_popup_generation
            .load(Ordering::Acquire)
    }

    pub fn invalidate_delayed_player_stats_popup_generation(&self) -> u64 {
        self.delayed_player_stats_popup_generation
            .fetch_add(1, Ordering::AcqRel)
            .saturating_add(1)
    }

    pub fn try_begin_hotkey_action(&self) -> bool {
        self.hotkey_action_inflight
            .compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
            .is_ok()
    }

    pub fn finish_hotkey_action(&self) {
        self.hotkey_action_inflight.store(false, Ordering::Release);
    }

    pub fn active_hotkey_reassign_path(&self) -> Option<String> {
        self.active_hotkey_reassign_path
            .lock()
            .ok()
            .and_then(|path| path.clone())
    }

    pub fn set_active_hotkey_reassign_path(&self, path: Option<String>) {
        if let Ok(mut current) = self.active_hotkey_reassign_path.lock() {
            *current = path;
        }
    }

    pub fn active_hotkey_reassign_binding(&self) -> Option<ResolvedHotkeyBinding> {
        self.active_hotkey_reassign_binding
            .lock()
            .ok()
            .and_then(|binding| binding.clone())
    }

    pub fn set_active_hotkey_reassign_binding(&self, binding: Option<ResolvedHotkeyBinding>) {
        if let Ok(mut current) = self.active_hotkey_reassign_binding.lock() {
            *current = binding;
        }
    }
}
