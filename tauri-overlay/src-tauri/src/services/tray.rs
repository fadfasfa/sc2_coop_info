use std::sync::Mutex;
use tauri::{AppHandle, Manager, Wry, tray::TrayIconBuilder};

use crate::{BackendState, TauriOverlayOps, overlay_info};

#[derive(Default)]
pub struct TrayState {
    tray_icon: Mutex<Option<tauri::tray::TrayIcon<Wry>>>,
}

impl TauriOverlayOps {
    pub fn refresh_tray_language(app: &AppHandle<Wry>) {
        if let Some(menu) = overlay_info::OverlayInfoOps::build_tray_menu(app)
            && let Ok(tray_slot) = app.state::<TrayState>().tray_icon.lock()
            && let Some(tray) = tray_slot.as_ref()
            && let Err(error) = tray.set_menu(Some(menu))
        {
            crate::sco_warn!("Failed to update tray menu language: {error}");
        }
    }

    pub fn setup_tray_icon(app: &tauri::App<Wry>) {
        if let Some(tray_menu) = overlay_info::OverlayInfoOps::build_tray_menu(app.app_handle()) {
            let mut tray_builder = TrayIconBuilder::new()
                .menu(&tray_menu)
                .show_menu_on_left_click(true)
                .tooltip("SCO Overlay");

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            match tray_builder.build(app) {
                Ok(tray) => {
                    if let Ok(mut tray_slot) = app.state::<TrayState>().tray_icon.lock() {
                        *tray_slot = Some(tray);
                    };
                }
                Err(_) => {
                    crate::sco_error!("Failed to build system tray icon");
                }
            }
        }
    }

    pub fn request_clean_exit(app: &AppHandle<Wry>, exit_code: i32) {
        let state = app.state::<BackendState>();
        if !state.try_begin_exit() {
            return;
        }

        if let Ok(mut tray_icon) = app.state::<TrayState>().tray_icon.lock() {
            tray_icon.take();
        }

        for label in [
            overlay_info::PERFORMANCE_WINDOW_LABEL,
            overlay_info::OVERLAY_WINDOW_LABEL,
            overlay_info::SC2_OVERLAY_WINDOW_LABEL,
            "config",
        ] {
            if let Some(window) = app.get_webview_window(label) {
                let _ = window.hide();
                let _ = window.destroy();
            };
        }

        app.exit(exit_code);
    }
}
