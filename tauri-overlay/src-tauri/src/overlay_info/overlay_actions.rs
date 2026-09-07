use super::*;

impl OverlayInfoOps {
    fn prepare_player_stats_overlay_display<R: Runtime>(
        app: &tauri::AppHandle<R>,
        state: &BackendState,
    ) {
        let _ = app.emit(OVERLAY_HIDESTATS_EVENT, EmptyPayload::default());
        state.enter_player_stats_overlay_mode();
        OverlayInfoOps::show_sc2_overlay_window(app);
    }
}

impl OverlayInfoOps {
    pub fn perform_overlay_action(
        app: &tauri::AppHandle<Wry>,
        state: &BackendState,
        action: &str,
        body: Option<&Value>,
    ) -> Option<crate::OverlayActionResponse> {
        match action {
            "overlay_show_hide" => {
                let overlay_visible = app
                    .get_webview_window(OVERLAY_WINDOW_LABEL)
                    .and_then(|window| window.is_visible().ok())
                    .unwrap_or(false);
                if overlay_visible {
                    state.set_overlay_replay_data_active(false);
                    let _ = app.emit(OVERLAY_SHOWHIDE_EVENT, EmptyPayload::default());
                } else {
                    OverlayInfoOps::show_overlay_window(app);
                    let _ = app.emit(OVERLAY_SHOWSTATS_EVENT, EmptyPayload::default());
                }
                Some(crate::OverlayActionResponse::success(
                    "Overlay visibility toggled",
                ))
            }
            "overlay_show" => {
                OverlayInfoOps::show_overlay_window(app);
                let _ = app.emit(OVERLAY_SHOWSTATS_EVENT, EmptyPayload::default());
                Some(crate::OverlayActionResponse::success("Overlay shown"))
            }
            "overlay_hide" => {
                state.set_overlay_replay_data_active(false);
                OverlayInfoOps::hide_overlay_window(app);
                let _ = app.emit(OVERLAY_HIDESTATS_EVENT, EmptyPayload::default());
                Some(crate::OverlayActionResponse::success("Overlay hidden"))
            }
            "overlay_replay_data_state" => {
                let active = body
                    .and_then(|payload| payload.get("active"))
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                state.set_overlay_replay_data_active(active);
                if !active {
                    state.set_current_replay_file(None);
                }
                Some(crate::OverlayActionResponse::success(if active {
                    "Overlay replay data marked active"
                } else {
                    "Overlay replay data cleared"
                }))
            }
            "overlay_newer" => Some(OverlayInfoOps::replay_move_window(app, state, 1)),
            "overlay_older" => Some(OverlayInfoOps::replay_move_window(app, state, -1)),
            "overlay_player_stats" => {
                let payload = state.overlay_player_stats_payload();
                OverlayInfoOps::prepare_player_stats_overlay_display(app, state);
                let _ = app.emit(OVERLAY_SHOW_HIDE_PLAYER_STATS_EVENT, payload);

                Some(crate::OverlayActionResponse::success(
                    "Overlay player stats toggled",
                ))
            }
            "performance_show_hide" => {
                let performance_visible = app
                    .get_webview_window(PERFORMANCE_WINDOW_LABEL)
                    .and_then(|window| window.is_visible().ok())
                    .unwrap_or(false);
                let next_visible = !performance_visible;
                match crate::performance_overlay::PerformanceOverlayOps::set_visibility(
                    app,
                    next_visible,
                    true,
                ) {
                    Ok(()) => Some(crate::OverlayActionResponse::success(if next_visible {
                        "Performance overlay shown"
                    } else {
                        "Performance overlay hidden"
                    })),
                    Err(error) => Some(crate::OverlayActionResponse::failure(error)),
                }
            }
            "performance_toggle_reposition" => {
                let enabled =
                    crate::performance_overlay::PerformanceOverlayOps::toggle_edit_mode(app);
                Some(crate::OverlayActionResponse::success(if enabled {
                    "Performance overlay reposition mode enabled"
                } else {
                    "Performance overlay reposition mode disabled"
                }))
            }
            "hotkey_reassign_begin" => {
                let path = body
                    .and_then(|payload| payload.get("path"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                match OverlayInfoOps::begin_hotkey_reassign(app, path) {
                    Ok(()) => Some(crate::OverlayActionResponse::success_with_path(
                        format!("Removed hotkey trigger for {path}"),
                        path.to_string(),
                    )),
                    Err(error) => Some(crate::OverlayActionResponse::failure_with_path(
                        error,
                        path.to_string(),
                    )),
                }
            }
            "hotkey_reassign_end" => {
                let path = body
                    .and_then(|payload| payload.get("path"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                match OverlayInfoOps::end_hotkey_reassign(app, path) {
                    Ok(()) => Some(crate::OverlayActionResponse::success_with_path(
                        format!("Recreated hotkey trigger for {path}"),
                        path.to_string(),
                    )),
                    Err(error) => Some(crate::OverlayActionResponse::failure_with_path(
                        error,
                        path.to_string(),
                    )),
                }
            }
            "parse_replay" => {
                let requested = body
                    .and_then(|payload| payload.get("file"))
                    .and_then(Value::as_str);
                Some(OverlayInfoOps::replay_show_for_window(
                    app, state, requested,
                ))
            }
            "overlay_screenshot" => Some(match OverlayInfoOps::request_overlay_screenshot(app) {
                Ok(path) => crate::OverlayActionResponse::success_with_path(
                    format!("Overlay screenshot requested for {path}"),
                    path,
                ),
                Err(error) => crate::OverlayActionResponse::failure(error),
            }),
            "create_desktop_shortcut" => Some(match crate::desktop_shortcut::create_or_update() {
                Ok(path) => crate::OverlayActionResponse::success_with_path(
                    format!("Desktop shortcut created: {}", path.display()), path.display().to_string()),
                Err(error) => crate::OverlayActionResponse::failure(error),
            }),
            "randomizer_generate" => Some(match state.dictionary_data() {
                Ok(dictionary) => {
                    match randomizer::RandomizerOps::generate_from_body_with_dictionary(
                        body,
                        &dictionary,
                    ) {
                        Ok(result) => crate::OverlayActionResponse {
                            status: "ok",
                            result: crate::OverlayActionResult {
                                ok: true,
                                path: None,
                            },
                            message: "Generated random commander".to_string(),
                            randomizer: Some(result),
                        },
                        Err(error) => crate::OverlayActionResponse {
                            status: "ok",
                            result: crate::OverlayActionResult {
                                ok: false,
                                path: None,
                            },
                            message: error,
                            randomizer: None,
                        },
                    }
                }
                Err(error) => crate::OverlayActionResponse::failure(error),
            }),
            _ => None,
        }
    }
}

impl OverlayInfoOps {
    pub fn show_player_stats_for_name(
        app: &tauri::AppHandle<Wry>,
        state: &BackendState,
        player_handle: &str,
        player_name: &str,
    ) -> bool {
        if player_name.trim().is_empty() {
            return false;
        }

        let payload = state.overlay_player_stats_payload_for_player(player_handle, player_name);
        OverlayInfoOps::prepare_player_stats_overlay_display(app, state);
        let _ = app.emit(OVERLAY_PLAYER_STATS_EVENT, payload);
        true
    }
}
