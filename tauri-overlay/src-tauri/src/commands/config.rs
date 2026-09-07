use serde::Deserialize;
use serde_json::Value;
use tauri::{Emitter, Manager, State, Wry};

use crate::{
    AppSettings, BackendState, ConfigPayload, ConfigPlayersPayload, ConfigWeekliesPayload,
    OverlayActionResponse, PathManagerOps, ReplayAnalysis, ReplayCacheDatabase, ReplayCachePage,
    ReplayCachePageResult, ReplayCachePlayerNote, ReplayCachePlayerSortKey,
    ReplayCachePlayersPageQuery, ReplayCacheSortDirection, Sc2Server, TauriOverlayOps,
    monitor_settings, overlay_info, randomizer,
};

use super::DEFAULT_CONFIG_ROWS_PER_PAGE;

const PERFORMANCE_RUNTIME_SETTING_KEYS: [&str; 4] = [
    "performance_show",
    "performance_geometry",
    "performance_processes",
    "monitor",
];

pub struct ConfigCommands;

impl TauriOverlayOps {
    fn apply_runtime_settings(
        app: &tauri::AppHandle<Wry>,
        previous_settings: &AppSettings,
        next_settings: &AppSettings,
    ) {
        let state = app.state::<BackendState>();
        let next_settings = state.replace_active_settings(next_settings);
        let overlay_runtime_changed = AppSettings::any_setting_changed(
            previous_settings,
            &next_settings,
            &crate::OVERLAY_RUNTIME_SETTING_KEYS,
        );
        let overlay_hotkeys_changed = AppSettings::any_setting_changed(
            previous_settings,
            &next_settings,
            &crate::OVERLAY_HOTKEY_SETTING_KEYS,
        );
        let overlay_placement_changed = AppSettings::any_setting_changed(
            previous_settings,
            &next_settings,
            &crate::OVERLAY_PLACEMENT_SETTING_KEYS,
        );
        let replay_watch_root_changed =
            AppSettings::setting_value_changed(previous_settings, &next_settings, "account_folder");
        let performance_runtime_changed = AppSettings::any_setting_changed(
            previous_settings,
            &next_settings,
            &PERFORMANCE_RUNTIME_SETTING_KEYS,
        );

        if overlay_runtime_changed {
            overlay_info::OverlayInfoOps::sync_overlay_runtime_settings(app);
        }
        if previous_settings.overlay_language() != next_settings.overlay_language() {
            TauriOverlayOps::refresh_tray_language(app);
            TauriOverlayOps::refresh_window_titles(app);
        }

        let previous_show_charts = previous_settings.show_charts();
        let show_charts = next_settings.show_charts();
        if show_charts != previous_show_charts {
            let _ = app.emit(
                overlay_info::OVERLAY_SET_SHOW_CHARTS_FROM_CONFIG_EVENT,
                show_charts,
            );
        }
        if overlay_hotkeys_changed
            && let Err(error) = overlay_info::OverlayInfoOps::register_overlay_hotkeys(app)
        {
            crate::sco_warn!("[SCO/hotkey] Failed to reload hotkeys: {error}");
        }
        if overlay_placement_changed
            && let Some(window) = app.get_webview_window(overlay_info::OVERLAY_WINDOW_LABEL)
            && let Err(error) = overlay_info::OverlayInfoOps::apply_overlay_placement_from_settings(
                &window,
                &next_settings,
            )
        {
            crate::sco_warn!("[SCO/overlay] Failed to apply overlay placement: {error}");
        }
        if performance_runtime_changed {
            crate::performance_overlay::PerformanceOverlayOps::apply_settings(app);
        }
        if replay_watch_root_changed {
            state.request_replay_watcher_root_refresh();
        }

        if let Ok(mut stats) = app.state::<BackendState>().stats_handle().lock() {
            stats.set_detailed_analysis_atstart(next_settings.detailed_analysis_atstart());
        };
    }
}

impl ConfigCommands {
    pub async fn config_get(
        app: tauri::AppHandle<Wry>,
        state: State<'_, BackendState>,
    ) -> Result<ConfigPayload, String> {
        state.log_request("get", "/config", &None);
        Ok(ConfigPayload {
            status: "ok",
            settings: AppSettings::from_saved_file(),
            active_settings: state.read_settings_memory(),
            randomizer_catalog: state
                .dictionary_data()
                .map(|dictionary| {
                    randomizer::RandomizerOps::catalog_payload_with_dictionary(&dictionary)
                })
                .unwrap_or_default(),
            monitor_catalog: monitor_settings::MonitorSettingsOps::available_monitor_catalog(&app),
        })
    }

    pub async fn config_update(
        app: tauri::AppHandle<Wry>,
        settings: Value,
        persist: Option<bool>,
        state: State<'_, BackendState>,
    ) -> Result<ConfigPayload, String> {
        let body = Some(TauriOverlayOps::to_json_value(serde_json::json!({
            "settings": settings,
            "persist": persist.unwrap_or(true),
        })));
        state.log_request("post", "/config", &body);

        let settings_value = body
            .as_ref()
            .and_then(|payload| payload.get("settings"))
            .cloned()
            .ok_or_else(|| "Missing payload".to_string())?;

        let mut next_settings = AppSettings::merge_settings_with_defaults(settings_value);
        let previous_settings = state.read_settings_memory();
        let persist = body
            .as_ref()
            .and_then(|payload| payload.get("persist"))
            .and_then(Value::as_bool)
            .unwrap_or(true);

        next_settings.set_performance_geometry(previous_settings.performance_geometry());

        let persisted_settings = if persist {
            let persisted_settings = state.write_settings_file(&next_settings)?;
            if let Err(error) =
                TauriOverlayOps::sync_start_with_windows_registration(&app, &persisted_settings)
            {
                crate::sco_warn!("[SCO/settings] Failed to sync start_with_windows: {error}");
            }
            Some(persisted_settings)
        } else {
            None
        };
        let runtime_settings = persisted_settings.as_ref().unwrap_or(&next_settings);
        TauriOverlayOps::apply_runtime_settings(&app, &previous_settings, runtime_settings);

        Ok(ConfigPayload {
            status: "ok",
            settings: AppSettings::from_saved_file(),
            active_settings: state.read_settings_memory(),
            randomizer_catalog: state
                .dictionary_data()
                .map(|dictionary| {
                    randomizer::RandomizerOps::catalog_payload_with_dictionary(&dictionary)
                })
                .unwrap_or_default(),
            monitor_catalog: monitor_settings::MonitorSettingsOps::available_monitor_catalog(&app),
        })
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigPlayersPageRequest {
    limit: Option<usize>,
    page: Option<usize>,
    rows_per_page: Option<usize>,
    search: Option<String>,
    sort_key: Option<String>,
    sort_direction: Option<String>,
}

#[tauri::command]
pub async fn config_get(
    app: tauri::AppHandle<Wry>,
    state: State<'_, BackendState>,
) -> Result<ConfigPayload, String> {
    ConfigCommands::config_get(app, state).await
}

#[tauri::command]
pub async fn config_update(
    app: tauri::AppHandle<Wry>,
    settings: Value,
    persist: Option<bool>,
    state: State<'_, BackendState>,
) -> Result<ConfigPayload, String> {
    ConfigCommands::config_update(app, settings, persist, state).await
}

#[tauri::command]
pub async fn config_players_get(
    app: tauri::AppHandle<Wry>,
    request: Option<ConfigPlayersPageRequest>,
    state: State<'_, BackendState>,
) -> Result<ConfigPlayersPayload, String> {
    ConfigCommands::config_players_get(app, request, state).await
}

#[tauri::command]
pub async fn config_weeklies_get(
    app: tauri::AppHandle<Wry>,
    state: State<'_, BackendState>,
) -> Result<ConfigWeekliesPayload, String> {
    ConfigCommands::config_weeklies_get(app, state).await
}

#[tauri::command]
pub async fn config_action(
    app: tauri::AppHandle<Wry>,
    action: String,
    payload: Option<Value>,
    state: State<'_, BackendState>,
) -> Result<OverlayActionResponse, String> {
    ConfigCommands::config_action(app, action, payload, state).await
}

impl ConfigCommands {
    pub async fn config_players_get(
        _app: tauri::AppHandle<Wry>,
        request: Option<ConfigPlayersPageRequest>,
        state: State<'_, BackendState>,
    ) -> Result<ConfigPlayersPayload, String> {
        let request = request.unwrap_or_default();
        let page = request.page.unwrap_or(1).max(1);
        let rows_per_page = request
            .rows_per_page
            .or(request.limit)
            .filter(|value| *value > 0)
            .unwrap_or(DEFAULT_CONFIG_ROWS_PER_PAGE)
            .max(1);
        let search = request.search.unwrap_or_default();
        let sort_key = ReplayCachePlayerSortKey::from_query_value(request.sort_key.as_deref());
        let sort_direction = ReplayCacheSortDirection::from_query_value(
            request.sort_direction.as_deref(),
            ReplayCacheSortDirection::Desc,
        );
        let path =
            format!("/config/players?page={page}&rows_per_page={rows_per_page}&search={search}");
        state.log_request("get", &path, &None);
        let settings = state.read_settings_memory();
        let player_notes = settings
            .player_notes()
            .iter()
            .map(|(handle, note)| ReplayCachePlayerNote::new(handle.clone(), note.clone()))
            .collect::<Vec<_>>();
        let query = ReplayCachePlayersPageQuery::new(
            ReplayCachePage::new(page, rows_per_page),
            search,
            sort_key,
            sort_direction,
            player_notes,
        );

        let (players, total_players) = tauri::async_runtime::spawn_blocking(move || {
            let cache_path = PathManagerOps::get_cache_path();
            ReplayCacheDatabase::open_for_cache_path(&cache_path)
                .and_then(|database| database.load_player_rows_page(&query))
                .map(ReplayCachePageResult::into_rows_and_total)
                .map_err(|error| error.to_string())
        })
        .await
        .map_err(|error| format!("Failed to load /config/players: {error}"))??;

        Ok(ConfigPlayersPayload {
            status: "ok",
            players,
            total_players,
            loading: false,
        })
    }

    pub async fn config_weeklies_get(
        _app: tauri::AppHandle<Wry>,
        state: State<'_, BackendState>,
    ) -> Result<ConfigWeekliesPayload, String> {
        state.log_request("get", "/config/weeklies", &None);
        let replays = tauri::async_runtime::spawn_blocking(move || {
            ReplayCacheDatabase::open_for_cache_path(&PathManagerOps::get_cache_path())
                .and_then(|database| database.load_weekly_replays())
                .map_err(|error| error.to_string())
        })
        .await
        .map_err(|error| format!("Failed to load /config/weeklies: {error}"))??;
        let dictionary = state.dictionary_data().ok();
        Ok(ConfigWeekliesPayload {
            status: "ok",
            weeklies: dictionary
                .as_deref()
                .map(|dictionary| {
                    ReplayAnalysis::rebuild_weeklies_rows_with_dictionary(
                        &replays,
                        chrono::Local::now().date_naive(),
                        dictionary,
                    )
                })
                .unwrap_or_default(),
        })
    }

    pub async fn config_action(
        app: tauri::AppHandle<Wry>,
        action: String,
        payload: Option<Value>,
        state: State<'_, BackendState>,
    ) -> Result<OverlayActionResponse, String> {
        let body = if let Some(Value::Object(mut object)) = payload {
            object.insert("action".to_string(), Value::String(action));
            Some(Value::Object(object))
        } else {
            Some(TauriOverlayOps::to_json_value(
                serde_json::json!({ "action": action }),
            ))
        };
        state.log_request("post", "/config/action", &body);
        let action = body
            .as_ref()
            .and_then(|payload| payload.get("action"))
            .and_then(Value::as_str)
            .unwrap_or("");

        match action {
            "create_desktop_shortcut" => {
                // Shell/COM and filesystem work must not occupy an async worker.
                // The entire operation stays on one blocking thread so that the
                // Windows mutex is acquired and released by the same thread.
                let result = tauri::async_runtime::spawn_blocking(
                    crate::desktop_shortcut::create_or_update,
                )
                .await
                .map_err(|error| format!("Desktop shortcut failed: worker failed: {error}"))?;
                Ok(match result {
                    Ok(update) => OverlayActionResponse::success_with_path(
                        update.message(),
                        update.path().display().to_string(),
                    ),
                    Err(error) if error == "Create desktop shortcut is not available in this build" => {
                        OverlayActionResponse::failure(error)
                    }
                    Err(error) => OverlayActionResponse::failure(format!(
                        "Desktop shortcut failed: {error}"
                    )),
                })
            }
            "set_player_note" => {
                let player_name = body
                    .as_ref()
                    .and_then(|payload| payload.get("player"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let note_value = body
                    .as_ref()
                    .and_then(|payload| payload.get("note"))
                    .and_then(Value::as_str)
                    .unwrap_or("");

                let mut saved_settings = AppSettings::from_saved_file();
                saved_settings.update_player_note(player_name, note_value)?;
                saved_settings.write_saved_settings_file()?;

                let mut active_settings = state.read_settings_memory();
                active_settings.update_player_note(player_name, note_value)?;
                state.replace_active_settings(&active_settings);

                Ok(OverlayActionResponse::success(
                    if note_value.trim().is_empty() {
                        "Player note cleared."
                    } else {
                        "Player note saved."
                    },
                ))
            }
            "set_first_win_bonus_time" => {
                let server = body
                    .as_ref()
                    .and_then(|payload| payload.get("server"))
                    .cloned()
                    .ok_or_else(|| "First win bonus server is required".to_string())?;
                let server = serde_json::from_value::<Sc2Server>(server)
                    .map_err(|_| "Invalid first win bonus server".to_string())?;
                let latest_time = body
                    .as_ref()
                    .and_then(|payload| payload.get("time"))
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim();

                let latest_time = chrono::DateTime::parse_from_rfc3339(latest_time)
                    .map_err(|_| "Invalid latest first win bonus time".to_string())?
                    .with_timezone(&chrono::Utc)
                    .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

                TauriOverlayOps::persist_first_win_bonus_time(&state, server, &latest_time)?;

                Ok(OverlayActionResponse::success(
                    "First win bonus time saved.",
                ))
            }
            _ => {
                if let Some(response) = overlay_info::OverlayInfoOps::perform_overlay_action(
                    &app,
                    &state,
                    action,
                    body.as_ref(),
                ) {
                    Ok(response)
                } else {
                    Ok(OverlayActionResponse::failure(format!(
                        "Unsupported action: {action}"
                    )))
                }
            }
        }
    }
}
