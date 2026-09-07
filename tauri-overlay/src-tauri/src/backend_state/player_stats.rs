use super::{BackendState, BackendStateOps};
use std::{
    collections::{BTreeMap, HashSet},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::shared_types::{OverlayPlayerStatsPayload, OverlayPlayerStatsRow};
use crate::{
    AppSettings, PathManagerOps, PlayerRowPayload, ReplayCacheDatabase, ReplayInfo,
    TauriOverlayOps, replay_analysis::ReplayAnalysis,
};

impl BackendStateOps {
    fn select_other_player_for_stats(
        replay: &ReplayInfo,
        main_names: &HashSet<String>,
        main_handles: &HashSet<String>,
    ) -> Option<(String, String)> {
        let p1 = replay.main().name.trim();
        let p2 = replay.ally().name.trim();

        if p1.is_empty() && p2.is_empty() {
            return None;
        }

        let p1_handle = replay.main().handle.clone();
        let p2_handle = replay.ally().handle.clone();

        let p1_is_main = ReplayAnalysis::is_main_player_identity(
            &replay.main().name,
            &replay.main().handle,
            main_names,
            main_handles,
        );
        let p2_is_main = ReplayAnalysis::is_main_player_identity(
            &replay.ally().name,
            &replay.ally().handle,
            main_names,
            main_handles,
        );

        match (p1_is_main, p2_is_main) {
            (true, false) => (!p2.is_empty()).then_some((p2_handle, p2.to_string())),
            (false, true) => (!p1.is_empty()).then_some((p1_handle, p1.to_string())),
            _ => {
                if !p2.is_empty() {
                    Some((p2_handle, p2.to_string()))
                } else if !p1.is_empty() {
                    Some((p1_handle, p1.to_string()))
                } else {
                    None
                }
            }
        }
    }
}

impl BackendStateOps {
    fn player_note_for_identity(
        settings: &AppSettings,
        player_handle: &str,
        player_name: &str,
    ) -> Option<String> {
        settings
            .player_note(player_handle)
            .or_else(|| settings.player_note(player_name))
    }

    fn overlay_stats_row_from_player_row(
        settings: &AppSettings,
        requested_player_handle: &str,
        requested_player_name: &str,
        row: PlayerRowPayload,
    ) -> (String, OverlayPlayerStatsRow) {
        let display_name = TauriOverlayOps::sanitize_replay_text(&row.player);
        let display_name = if display_name.trim().is_empty() {
            requested_player_name.to_string()
        } else {
            display_name
        };
        let note =
            Self::player_note_for_identity(settings, &row.handle, &display_name).or_else(|| {
                Self::player_note_for_identity(settings, requested_player_handle, &display_name)
            });

        (
            display_name,
            OverlayPlayerStatsRow::Stats {
                wins: BackendStateOps::as_u32(row.wins),
                losses: BackendStateOps::as_u32(row.losses),
                apm: BackendStateOps::as_u32(row.apm.round() as u64),
                commander: TauriOverlayOps::sanitize_replay_text(&row.commander),
                frequency: row.frequency,
                kills: row.kills,
                last_seen_relative: BackendStateOps::relative_last_seen_text(row.last_seen),
                last_seen_seconds: (row.last_seen > 0).then(|| {
                    SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs()
                        .saturating_sub(row.last_seen)
                }),
                note,
            },
        )
    }
}

impl BackendStateOps {
    fn relative_last_seen_text(last_seen: u64) -> String {
        if last_seen == 0 {
            return String::new();
        }

        let now = match SystemTime::now().duration_since(UNIX_EPOCH) {
            Ok(delta) => delta.as_secs(),
            Err(_) => return String::new(),
        };
        let mut delta = now.saturating_sub(last_seen);

        let years = delta / 31_557_600;
        delta %= 31_557_600;
        let days = delta / 86_400;
        delta %= 86_400;
        let hours = delta / 3_600;
        delta %= 3_600;
        let minutes = delta / 60;

        let mut parts = Vec::<String>::new();
        if years > 0 {
            parts.push(format!("{years} years"));
        }
        if days > 0 {
            parts.push(format!("{days} days"));
        }
        if hours > 0 {
            parts.push(format!("{hours} hours"));
        }
        if minutes > 0 || parts.is_empty() {
            parts.push(format!("{minutes} minutes"));
        }
        format!("{} ago", parts.join(" "))
    }
}

impl BackendState {
    pub(super) fn clear_main_identity_cache(&self) {
        if let Ok(mut cache) = self.discovered_main_names.lock() {
            cache.clear();
        }
        if let Ok(mut cache) = self.discovered_main_handles.lock() {
            cache.clear();
        }
    }

    pub fn configured_main_names(&self) -> HashSet<String> {
        let settings = self.read_settings_memory();
        let account_root = settings.account_folder().trim().to_string();

        if !account_root.is_empty()
            && let Ok(cache) = self.discovered_main_names.lock()
            && let Some(cached) = cache.get(&account_root)
        {
            return cached.clone();
        }

        let names = settings.configured_main_names();

        if !account_root.is_empty()
            && let Ok(mut cache) = self.discovered_main_names.lock()
        {
            cache.insert(account_root, names.clone());
        }

        names
    }

    pub fn configured_main_handles(&self) -> HashSet<String> {
        let settings = self.read_settings_memory();
        let account_root = settings.account_folder().trim().to_string();

        if !account_root.is_empty()
            && let Ok(cache) = self.discovered_main_handles.lock()
            && let Some(cached) = cache.get(&account_root)
        {
            return cached.clone();
        }

        let handles = settings.configured_main_handles();

        if !account_root.is_empty()
            && let Ok(mut cache) = self.discovered_main_handles.lock()
        {
            cache.insert(account_root, handles.clone());
        }

        handles
    }

    pub fn overlay_player_stats_payload(&self) -> OverlayPlayerStatsPayload {
        let selected_file = self.get_current_replay_file();
        let selected = self.cached_replay_by_file_or_latest(selected_file.as_deref());

        let Some(selected) = selected else {
            return OverlayPlayerStatsPayload::default();
        };

        let main_names = self.configured_main_names();
        let main_handles = self.configured_main_handles();
        let player_stats_target =
            BackendStateOps::select_other_player_for_stats(&selected, &main_names, &main_handles)
                .or_else(|| {
                    let ally = selected.ally().name.trim();
                    if !ally.is_empty() {
                        Some((selected.ally().handle.clone(), ally.to_string()))
                    } else {
                        None
                    }
                })
                .or_else(|| {
                    let main = selected.main().name.trim();
                    if !main.is_empty() {
                        Some((selected.main().handle.clone(), main.to_string()))
                    } else {
                        None
                    }
                });

        let Some((player_handle, player_name)) = player_stats_target else {
            return OverlayPlayerStatsPayload::default();
        };

        self.overlay_player_stats_payload_for_player(&player_handle, &player_name)
    }

    pub fn overlay_player_stats_payload_for_player(
        &self,
        player_handle: &str,
        player_name: &str,
    ) -> OverlayPlayerStatsPayload {
        let settings = self.read_settings_memory();

        let input_name = TauriOverlayOps::sanitize_replay_text(player_name);
        let fallback_name = if input_name.trim().is_empty() {
            "Unknown".to_string()
        } else {
            input_name.trim().to_string()
        };

        let mut data = BTreeMap::new();

        let database_row =
            ReplayCacheDatabase::open_for_cache_path(&PathManagerOps::get_cache_path())
                .and_then(|database| {
                    database.load_overlay_player_stats_row(player_handle, &fallback_name)
                })
                .map_err(|error| {
                    crate::sco_warn!(
                        "[SCO/player-stats] failed to load player row from cache: {error}"
                    );
                    error
                })
                .ok()
                .flatten();
        if let Some(row) = database_row {
            let (display_name, value) = BackendStateOps::overlay_stats_row_from_player_row(
                &settings,
                player_handle,
                &fallback_name,
                row,
            );
            data.insert(display_name, value);
            return OverlayPlayerStatsPayload { data };
        }

        let note =
            BackendStateOps::player_note_for_identity(&settings, player_handle, &fallback_name);
        let (display_name, value) = (fallback_name, OverlayPlayerStatsRow::NoGames { note });

        data.insert(display_name, value);

        OverlayPlayerStatsPayload { data }
    }

    pub fn build_launch_main_identity(&self) -> (HashSet<String>, HashSet<String>) {
        let mut main_names = self.configured_main_names();
        let mut main_handles = self.configured_main_handles();

        if let Ok(stats) = self.stats.lock() {
            for name in stats.main_players() {
                let normalized = ReplayAnalysis::normalized_player_key(name);
                if !normalized.is_empty() {
                    main_names.insert(normalized);
                }
            }
        }

        let selected = self.get_current_replay_file();
        let seed = self.cached_replay_by_file_or_latest(selected.as_deref());
        if let Some(seed) = seed {
            let normalized_name = ReplayAnalysis::normalized_player_key(&seed.main().name);
            if !normalized_name.is_empty() {
                main_names.insert(normalized_name);
            }
            let normalized_handle = ReplayAnalysis::normalized_handle_key(&seed.main().handle);
            if !normalized_handle.is_empty() {
                main_handles.insert(normalized_handle);
            }
        }

        (main_names, main_handles)
    }

    pub fn stats_have_player_rows(&self) -> bool {
        ReplayCacheDatabase::open_for_cache_path(&PathManagerOps::get_cache_path())
            .and_then(|database| database.has_player_info_rows())
            .map_err(|error| {
                crate::sco_warn!("[SCO/player-stats] failed to check cached player rows: {error}");
                error
            })
            .unwrap_or(false)
    }
}
