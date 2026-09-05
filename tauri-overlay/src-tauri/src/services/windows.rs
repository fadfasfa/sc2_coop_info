use tauri::{Manager, Wry};

use crate::{BackendState, TauriOverlayOps, overlay_info, performance_overlay};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WindowCloseAction {
    AllowClose,
    HidePerformance,
    HideWindow,
    ExitApp,
}

impl TauriOverlayOps {
    pub fn localized_window_title<'a>(
        label: &str,
        language: &str,
        default_title: &'a str,
    ) -> &'a str {
        match (language, label) {
            ("zh-CN", "config") => "SC2 合作信息设置",
            ("zh-CN", "overlay") => "SC2 录像悬浮窗",
            ("zh-CN", "sc2-overlay") => "SC2 玩家悬浮窗",
            ("zh-CN", "performance") => "SC2 性能窗口",
            // Keep the configured English/Korean titles and unknown windows unchanged.
            _ => default_title,
        }
    }

    pub fn refresh_window_titles(app: &tauri::AppHandle<Wry>) {
        let language = app
            .state::<BackendState>()
            .read_settings_memory()
            .overlay_language();
        for configured_window in &app.config().app.windows {
            if let Some(window) = app.get_webview_window(&configured_window.label) {
                let title = TauriOverlayOps::localized_window_title(
                    &configured_window.label,
                    language,
                    &configured_window.title,
                );
                if let Err(error) = window.set_title(title) {
                    crate::sco_warn!("Failed to update window title language: {error}");
                }
            }
        }
    }

    pub fn window_close_action(
        label: &str,
        minimize_to_tray: bool,
        exit_in_progress: bool,
    ) -> WindowCloseAction {
        if exit_in_progress {
            return WindowCloseAction::AllowClose;
        }

        if label == overlay_info::PERFORMANCE_WINDOW_LABEL {
            WindowCloseAction::HidePerformance
        } else if label == overlay_info::OVERLAY_WINDOW_LABEL
            || label == overlay_info::SC2_OVERLAY_WINDOW_LABEL
            || minimize_to_tray
        {
            WindowCloseAction::HideWindow
        } else {
            WindowCloseAction::ExitApp
        }
    }

    pub fn setup_startup_windows(app: &tauri::App<Wry>) {
        let state = app.state::<BackendState>();
        let flags = state.runtime_flags();
        TauriOverlayOps::refresh_window_titles(app.app_handle());

        // Always start with overlay hidden; user can show it via hotkey/tray/actions.
        overlay_info::OverlayInfoOps::hide_overlay_window(app.app_handle());
        overlay_info::OverlayInfoOps::hide_sc2_overlay_window(app.app_handle());

        if flags.start_minimized() {
            if let Some(config_window) = app.get_webview_window("config") {
                let _ = config_window.hide();
            }
        } else {
            overlay_info::OverlayInfoOps::show_config_window(app.app_handle());
        }

        let _ = app
            .get_webview_window(overlay_info::OVERLAY_WINDOW_LABEL)
            .and_then(|window| window.set_always_on_top(true).ok());
        let _ = app
            .get_webview_window(overlay_info::OVERLAY_WINDOW_LABEL)
            .and_then(|window| window.set_skip_taskbar(true).ok());
        let _ = app
            .get_webview_window(overlay_info::OVERLAY_WINDOW_LABEL)
            .and_then(|window| window.set_focusable(false).ok());
        let _ = app
            .get_webview_window(overlay_info::OVERLAY_WINDOW_LABEL)
            .and_then(|window| window.set_ignore_cursor_events(true).ok());
        if let Some(window) = app.get_webview_window(overlay_info::OVERLAY_WINDOW_LABEL)
            && let Err(error) = overlay_info::OverlayInfoOps::apply_overlay_placement(&window)
        {
            crate::sco_warn!("Could not apply saved overlay placement: {error}");
        }
        let _ = app
            .get_webview_window(overlay_info::SC2_OVERLAY_WINDOW_LABEL)
            .and_then(|window| window.set_always_on_top(true).ok());
        let _ = app
            .get_webview_window(overlay_info::SC2_OVERLAY_WINDOW_LABEL)
            .and_then(|window| window.set_skip_taskbar(true).ok());
        let _ = app
            .get_webview_window(overlay_info::SC2_OVERLAY_WINDOW_LABEL)
            .and_then(|window| window.set_focusable(false).ok());
        let _ = app
            .get_webview_window(overlay_info::SC2_OVERLAY_WINDOW_LABEL)
            .and_then(|window| window.set_ignore_cursor_events(true).ok());
        let _ = app
            .get_webview_window(overlay_info::PERFORMANCE_WINDOW_LABEL)
            .and_then(|window| window.set_always_on_top(true).ok());
        let _ = app
            .get_webview_window(overlay_info::PERFORMANCE_WINDOW_LABEL)
            .and_then(|window| window.set_skip_taskbar(true).ok());
        let _ = app
            .get_webview_window(overlay_info::PERFORMANCE_WINDOW_LABEL)
            .and_then(|window| window.set_focusable(false).ok());
        let _ = app
            .get_webview_window(overlay_info::PERFORMANCE_WINDOW_LABEL)
            .and_then(|window| window.set_ignore_cursor_events(true).ok());
        if let Some(window) = app.get_webview_window(overlay_info::PERFORMANCE_WINDOW_LABEL)
            && let Err(error) =
                performance_overlay::PerformanceOverlayOps::apply_saved_geometry(&window)
        {
            crate::sco_warn!("Could not apply saved performance placement: {error}");
        }
    }
}
