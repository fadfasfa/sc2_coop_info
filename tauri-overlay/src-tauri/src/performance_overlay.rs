use std::thread;
use std::time::Duration;

use serde::Serialize;
use sysinfo::{Networks, ProcessesToUpdate, System};
use tauri::{Emitter, Manager, Runtime, Wry};

use crate::{AppSettings, BackendState, shared_types::PerformanceVisibilityPayload};

pub const PERFORMANCE_VISIBILITY_EVENT: &str = "sco://performance-visibility";

const DEFAULT_WINDOW_WIDTH: u32 = 780;
const MIN_WINDOW_WIDTH: u32 = 760;
const MIN_WINDOW_HEIGHT: u32 = 860;

#[derive(Serialize)]
struct CpuUsageRow {
    label: String,
    value: String,
    level: &'static str,
}

#[derive(Serialize)]
struct PerformancePayload {
    language: &'static str,
    #[serde(rename = "processTitle")]
    process_title: String,
    #[serde(rename = "sc2Ram")]
    sc2_ram: String,
    #[serde(rename = "sc2Read")]
    sc2_read: String,
    #[serde(rename = "sc2ReadTotal")]
    sc2_read_total: String,
    #[serde(rename = "sc2Write")]
    sc2_write: String,
    #[serde(rename = "sc2WriteTotal")]
    sc2_write_total: String,
    #[serde(rename = "sc2Cpu")]
    sc2_cpu: String,
    #[serde(rename = "sc2CpuLevel")]
    sc2_cpu_level: &'static str,
    #[serde(rename = "systemRam")]
    system_ram: String,
    #[serde(rename = "systemRamLevel")]
    system_ram_level: &'static str,
    #[serde(rename = "systemDown")]
    system_down: String,
    #[serde(rename = "systemDownTotal")]
    system_down_total: String,
    #[serde(rename = "systemUp")]
    system_up: String,
    #[serde(rename = "systemUpTotal")]
    system_up_total: String,
    #[serde(rename = "cpuTotal")]
    cpu_total: String,
    #[serde(rename = "cpuTotalLevel")]
    cpu_total_level: &'static str,
    #[serde(rename = "cpuCores")]
    cpu_cores: Vec<CpuUsageRow>,
}

#[derive(Clone, Copy)]
pub struct PerformanceGeometry {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

pub struct PerformanceOverlayOps;

impl PerformanceOverlayOps {
    fn required_window_height() -> u32 {
        let cpu_count = std::thread::available_parallelism()
            .map(|value| u32::try_from(value.get()).unwrap_or(16))
            .unwrap_or(16);
        let dynamic_height = 430u32.saturating_add(cpu_count.saturating_mul(28));
        dynamic_height.max(MIN_WINDOW_HEIGHT)
    }
}

impl PerformanceGeometry {
    pub fn new(x: i32, y: i32, width: u32, height: u32) -> Self {
        Self {
            x,
            y,
            width,
            height,
        }
    }

    pub fn normalized(mut self) -> Self {
        self.width = self.width.max(MIN_WINDOW_WIDTH);
        self.height = self
            .height
            .max(PerformanceOverlayOps::required_window_height());
        self
    }

    pub fn x(&self) -> i32 {
        self.x
    }

    pub fn y(&self) -> i32 {
        self.y
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }
}

impl PerformanceOverlayOps {
    fn default_geometry(
        window: &tauri::WebviewWindow<Wry>,
        settings: &AppSettings,
    ) -> Result<PerformanceGeometry, String> {
        let selected = crate::monitor_settings::MonitorSettingsOps::selected_monitor_for_window(
            window,
            settings.monitor(),
        )?;

        let width = DEFAULT_WINDOW_WIDTH.min(selected.width().max(MIN_WINDOW_WIDTH));
        let height = PerformanceOverlayOps::required_window_height()
            .min(selected.height().max(MIN_WINDOW_HEIGHT));
        let x = selected.position_x()
            + i32::try_from(selected.width().saturating_sub(width)).unwrap_or(0)
            - 24;
        let y = selected.position_y() + 180;

        Ok(PerformanceGeometry::new(x, y, width, height).normalized())
    }
}

impl PerformanceOverlayOps {
    fn current_geometry(window: &tauri::WebviewWindow<Wry>) -> Option<PerformanceGeometry> {
        let position = window.outer_position().ok()?;
        let size = window.outer_size().ok()?;
        Some(PerformanceGeometry::new(
            position.x,
            position.y,
            size.width,
            size.height,
        ))
    }
}

impl PerformanceOverlayOps {
    fn apply_geometry(
        window: &tauri::WebviewWindow<Wry>,
        geometry: PerformanceGeometry,
    ) -> Result<(), String> {
        let geometry = geometry.normalized();
        window
            .set_size(tauri::PhysicalSize {
                width: geometry.width(),
                height: geometry.height(),
            })
            .map_err(|error| format!("Failed to set performance overlay size: {error}"))?;
        window
            .set_position(tauri::PhysicalPosition {
                x: geometry.x(),
                y: geometry.y(),
            })
            .map_err(|error| format!("Failed to set performance overlay position: {error}"))?;
        Ok(())
    }
}

impl PerformanceOverlayOps {
    fn level_from_percent(percent: f32) -> &'static str {
        if percent >= 85.0 {
            "high"
        } else if percent <= 15.0 {
            "low"
        } else {
            "normal"
        }
    }
}

impl PerformanceOverlayOps {
    fn format_bytes(bytes: u64) -> String {
        let bytes_f = bytes as f64;
        if bytes_f < 0.3 * 1024.0 * 1024.0 {
            format!("{:.1} kB", bytes_f / 1024.0)
        } else if bytes_f < 0.7 * 1024.0 * 1024.0 * 1024.0 {
            format!("{:.1} MB", bytes_f / 1024.0 / 1024.0)
        } else {
            format!("{:.1} GB", bytes_f / 1024.0 / 1024.0 / 1024.0)
        }
    }
}

impl PerformanceOverlayOps {
    fn default_payload(system: &System, networks: &Networks) -> PerformancePayload {
        let used_memory = system.used_memory() as f64 / 1024.0 / 1024.0 / 1024.0;
        let total_memory = system.total_memory() as f64 / 1024.0 / 1024.0 / 1024.0;
        let system_ram_percent = if system.total_memory() == 0 {
            0.0
        } else {
            (system.used_memory() as f32 / system.total_memory() as f32) * 100.0
        };
        let down_total = networks
            .values()
            .map(|network| network.total_received())
            .sum::<u64>();
        let up_total = networks
            .values()
            .map(|network| network.total_transmitted())
            .sum::<u64>();
        let down_speed = networks
            .values()
            .map(|network| network.received())
            .sum::<u64>();
        let up_speed = networks
            .values()
            .map(|network| network.transmitted())
            .sum::<u64>();
        let cpu_cores = system
            .cpus()
            .iter()
            .enumerate()
            .map(|(idx, cpu)| CpuUsageRow {
                label: format!("CPU{idx}"),
                value: format!("{:.1}%", cpu.cpu_usage()),
                level: PerformanceOverlayOps::level_from_percent(cpu.cpu_usage()),
            })
            .collect::<Vec<CpuUsageRow>>();
        let global_cpu = system.global_cpu_usage();

        PerformancePayload {
            language: "en",
            process_title: "StarCraft II".to_string(),
            sc2_ram: "-".to_string(),
            sc2_read: "-".to_string(),
            sc2_read_total: "-".to_string(),
            sc2_write: "-".to_string(),
            sc2_write_total: "-".to_string(),
            sc2_cpu: "-".to_string(),
            sc2_cpu_level: "normal",
            system_ram: format!("{used_memory:.1}/{total_memory:.1} GB"),
            system_ram_level: PerformanceOverlayOps::level_from_percent(system_ram_percent),
            system_down: format!("{}/s", PerformanceOverlayOps::format_bytes(down_speed)),
            system_down_total: PerformanceOverlayOps::format_bytes(down_total),
            system_up: format!("{}/s", PerformanceOverlayOps::format_bytes(up_speed)),
            system_up_total: PerformanceOverlayOps::format_bytes(up_total),
            cpu_total: format!("{global_cpu:.1}%"),
            cpu_total_level: PerformanceOverlayOps::level_from_percent(global_cpu),
            cpu_cores,
        }
    }
}

impl PerformanceOverlayOps {
    fn build_payload(
        system: &System,
        networks: &Networks,
        settings: &AppSettings,
    ) -> PerformancePayload {
        let mut payload = PerformanceOverlayOps::default_payload(system, networks);
        payload.language = settings.overlay_language();
        let process_names = settings.performance_process_names();
        let process = system.processes().values().find(|candidate| {
            let process_name = candidate.name().to_string_lossy();
            process_names
                .iter()
                .any(|value| process_name.as_ref() == value.as_str())
        });

        let Some(process) = process else {
            return payload;
        };

        let process_name = process.name().to_string_lossy().into_owned();
        let disk_usage = process.disk_usage();
        let process_cpu = process.cpu_usage();
        let process_memory_mb = process.memory() as f64 / 1024.0 / 1024.0;
        let process_memory_percent = if system.total_memory() == 0 {
            0.0
        } else {
            (process.memory() as f32 / system.total_memory() as f32) * 100.0
        };

        payload.process_title = if process_name.contains("SC2") {
            "StarCraft II".to_string()
        } else {
            process_name
        };
        payload.sc2_ram = format!("{process_memory_percent:.0}% | {process_memory_mb:.0} MB");
        payload.sc2_read = format!(
            "{}/s",
            PerformanceOverlayOps::format_bytes(disk_usage.read_bytes)
        );
        payload.sc2_read_total = PerformanceOverlayOps::format_bytes(disk_usage.total_read_bytes);
        payload.sc2_write = format!(
            "{}/s",
            PerformanceOverlayOps::format_bytes(disk_usage.written_bytes)
        );
        payload.sc2_write_total =
            PerformanceOverlayOps::format_bytes(disk_usage.total_written_bytes);
        payload.sc2_cpu = format!("{process_cpu:.1}%");
        payload.sc2_cpu_level = PerformanceOverlayOps::level_from_percent(process_cpu);
        payload
    }
}

impl PerformanceOverlayOps {
    pub fn emit_performance_script<R: Runtime>(app: &tauri::AppHandle<R>, script: &str) {
        if let Some(window) = app.get_webview_window("performance") {
            let _ = window.eval(script);
        }
    }
}

impl PerformanceOverlayOps {
    pub fn apply_saved_geometry(window: &tauri::WebviewWindow<Wry>) -> Result<(), String> {
        let settings = window.state::<BackendState>().read_settings_memory();
        let geometry = settings
            .saved_performance_geometry()
            .map(Ok)
            .unwrap_or_else(|| PerformanceOverlayOps::default_geometry(window, &settings))?;
        PerformanceOverlayOps::apply_geometry(window, geometry)
    }
}

impl PerformanceOverlayOps {
    pub fn persist_geometry(window: &tauri::WebviewWindow<Wry>) {
        let state = window.state::<BackendState>();
        let Some(geometry) = PerformanceOverlayOps::current_geometry(window) else {
            return;
        };
        let geometry = geometry.normalized();
        let width = i32::try_from(geometry.width()).unwrap_or(i32::MAX);
        let height = i32::try_from(geometry.height()).unwrap_or(i32::MAX);
        let value = [geometry.x(), geometry.y(), width, height];
        if let Err(error) = state.persist_serialized_setting_value("performance_geometry", &value) {
            crate::sco_warn!("[SCO/performance] Failed to save geometry: {error}");
        }
    }
}

impl PerformanceOverlayOps {
    pub fn start_drag(app: &tauri::AppHandle<Wry>) -> Result<(), String> {
        let Some(window) = app.get_webview_window("performance") else {
            return Err("Performance window not available".to_string());
        };
        window
            .start_dragging()
            .map_err(|error| format!("Failed to start dragging performance overlay: {error}"))
    }
}

impl PerformanceOverlayOps {
    pub fn show_window<R: Runtime>(app: &tauri::AppHandle<R>) {
        if let Some(window) = app.get_webview_window("performance") {
            let _ = window.show();
            let _ = window.set_ignore_cursor_events(true);
            let _ = window.set_focusable(false);
        }
    }
}

impl PerformanceOverlayOps {
    pub fn hide_window<R: Runtime>(app: &tauri::AppHandle<R>) {
        app.state::<BackendState>().set_performance_edit_mode(false);
        if let Some(window) = app.get_webview_window("performance") {
            let _ = window
                .eval("window.setPerformanceEditMode && window.setPerformanceEditMode(false);");
            let _ = window.set_ignore_cursor_events(true);
            let _ = window.set_focusable(false);
            let _ = window.hide();
        }
    }
}

impl PerformanceOverlayOps {
    pub fn set_edit_mode<R: Runtime>(app: &tauri::AppHandle<R>, enabled: bool) {
        app.state::<BackendState>()
            .set_performance_edit_mode(enabled);

        let performance_visible = app
            .state::<BackendState>()
            .read_settings_memory()
            .performance_show_enabled();
        if let Some(window) = app.get_webview_window("performance") {
            if enabled {
                let _ = window.show();
                let _ = window.set_ignore_cursor_events(false);
                let _ = window.set_focusable(true);
                let _ = window.set_focus();
            } else {
                let _ = window.set_ignore_cursor_events(true);
                let _ = window.set_focusable(false);
                if !performance_visible {
                    let _ = window.hide();
                }
            }
        }

        let script = format!(
            "window.setPerformanceEditMode && window.setPerformanceEditMode({});",
            if enabled { "true" } else { "false" }
        );
        PerformanceOverlayOps::emit_performance_script(app, &script);
    }
}

impl PerformanceOverlayOps {
    pub fn toggle_edit_mode<R: Runtime>(app: &tauri::AppHandle<R>) -> bool {
        let next = !app.state::<BackendState>().performance_edit_mode();
        PerformanceOverlayOps::set_edit_mode(app, next);
        next
    }
}

impl PerformanceOverlayOps {
    pub fn set_visibility<R: Runtime>(
        app: &tauri::AppHandle<R>,
        visible: bool,
        persist_setting: bool,
    ) -> Result<(), String> {
        let state = app.state::<BackendState>();
        if persist_setting {
            state.persist_serialized_setting_value("performance_show", &visible)?;
        }

        if visible {
            PerformanceOverlayOps::show_window(app);
        } else {
            PerformanceOverlayOps::hide_window(app);
        }
        PerformanceOverlayOps::emit_visibility_event(app, visible);
        Ok(())
    }
}

impl PerformanceOverlayOps {
    fn emit_visibility_event<R: Runtime>(app: &tauri::AppHandle<R>, visible: bool) {
        let payload = PerformanceVisibilityPayload { visible };
        let _ = app.emit(PERFORMANCE_VISIBILITY_EVENT, payload.clone());
        if let Some(config_window) = app.get_webview_window("config") {
            let _ = config_window.emit(PERFORMANCE_VISIBILITY_EVENT, payload);
            let visible_script = if visible { "true" } else { "false" };
            let _ = config_window.eval(format!(
            "window.__scoSetPerformanceVisibility && window.__scoSetPerformanceVisibility({visible_script});"
        ));
        }
    }
}

impl PerformanceOverlayOps {
    pub fn apply_settings(app: &tauri::AppHandle<Wry>) {
        let settings = app.state::<BackendState>().read_settings_memory();
        if let Some(window) = app.get_webview_window("performance")
            && let Err(error) = PerformanceOverlayOps::apply_saved_geometry(&window)
        {
            crate::sco_warn!("[SCO/performance] Failed to apply geometry: {error}");
        }

        if settings.performance_show_enabled() {
            PerformanceOverlayOps::show_window(app);
        } else {
            PerformanceOverlayOps::hide_window(app);
        }
    }
}

impl PerformanceOverlayOps {
    pub fn spawn_monitor(app: tauri::AppHandle<Wry>) {
        thread::spawn(move || {
            let mut system = System::new_all();
            let mut networks = Networks::new_with_refreshed_list();

            loop {
                system.refresh_cpu_all();
                system.refresh_memory();
                let _ = system.refresh_processes(ProcessesToUpdate::All, true);
                networks.refresh(true);

                let settings = app.state::<BackendState>().read_settings_memory();
                let should_emit = settings.performance_show_enabled()
                    || app.state::<BackendState>().performance_edit_mode();
                if should_emit {
                    let payload =
                        PerformanceOverlayOps::build_payload(&system, &networks, &settings);
                    let encoded =
                        serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string());
                    PerformanceOverlayOps::emit_performance_script(
                        &app,
                        &format!(
                            "window.updatePerformanceStats && window.updatePerformanceStats({encoded});"
                        ),
                    );
                }

                thread::sleep(Duration::from_secs(1));
            }
        });
    }
}
